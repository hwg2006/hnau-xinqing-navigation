// ============================================================
// 华农心晴导航 - Electron 主进程
// 负责: 窗口管理、系统托盘、快捷键、配置持久化
// 安全: contextIsolation + preload + 不暴露 node 给渲染层
// ============================================================

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

// ---------- 配置持久化 ----------
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
// 项目内共享的密钥文件（与 Web/CLI 同一份，已被 .gitignore 排除）
const ENV_PATH = path.join(__dirname, '..', 'config', '.env');

function parseEnvFile(file) {
  const out = {};
  try {
    const text = fs.readFileSync(file, 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch (e) { /* 忽略 */ }
  return out;
}

function loadConfig() {
  // 1) 设置窗口写入的用户配置优先
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) { /* 忽略 */ }
  // 2) 回退到项目 config/.env，免去在桌面端重复录入 Key
  const env = parseEnvFile(ENV_PATH);
  return {
    difyBaseUrl: env.DIFY_BASE_URL || 'http://localhost',
    difyApiKey: env.DIFY_API_KEY || '',
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存配置失败:', e);
  }
}

// ---------- 内嵌本地代理 ----------
// 渲染层不持有 API Key：页面所有请求先打到本代理，由主进程注入
// Authorization 后再转发给 Dify。与 server/dify_proxy.py 思路一致，
// 只是跑在 Electron 主进程内，桌面端无需额外启动 Python 服务。
let proxyServer = null;
let proxyPort = 0;

function startProxy() {
  return new Promise((resolve, reject) => {
    proxyServer = http.createServer((req, res) => {
      // 渲染层从 file:// 加载，Origin 为 null，需放开 CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      if (!req.url.startsWith('/v1/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }

      // 每次请求都重新读配置，设置窗口更改后可即时生效
      const cfg = loadConfig();
      let target;
      try {
        target = new URL(req.url, cfg.difyBaseUrl || 'http://localhost');
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid difyBaseUrl' }));
        return;
      }

      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (k === 'host' || k === 'content-length' || k === 'connection') continue;
          headers[k] = v;
        }
        if (cfg.difyApiKey) headers['authorization'] = `Bearer ${cfg.difyApiKey}`;
        headers['content-length'] = Buffer.byteLength(body);

        const mod = target.protocol === 'https:' ? https : http;
        const upstream = mod.request(target, { method: req.method, headers }, (up) => {
          res.writeHead(up.statusCode || 502, up.headers);
          up.pipe(res); // SSE 流式透传
        });
        upstream.on('error', (e) => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'upstream error: ' + e.message }));
        });
        upstream.end(body);
      });
      req.on('error', () => {
        try { res.writeHead(400); res.end(); } catch (_) { /* 忽略 */ }
      });
    });

    proxyServer.on('error', reject);
    // 仅监听本机回环地址、随机端口，避免端口占用冲突
    proxyServer.listen(0, '127.0.0.1', () => {
      proxyPort = proxyServer.address().port;
      resolve(proxyPort);
    });
  });
}

// ---------- 窗口管理 ----------
let tray = null;
const windows = new Set();

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 420,
    minHeight: 600,
    title: '华农心晴导航',
    backgroundColor: '#f0fdf4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,       // 安全: 隔离 node 环境
      nodeIntegration: false,        // 安全: 渲染层不允许 require
      sandbox: false,                // preload 需要 require fs/path
      webviewTag: false,             // 安全: 禁用 webview
      // 把 userData 路径与内嵌代理地址传给 preload，
      // preload 再通过 contextBridge 暴露给页面主世界
      additionalArguments: [
        `--user-data=${app.getPath('userData')}`,
        `--proxy-url=http://127.0.0.1:${proxyPort}`,
      ],
    },
    // 自定义标题栏 - 用 CSS 实现更现代的外观
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // 加载已有的 web 前端 (用 file:// 协议)
  const htmlPath = path.join(__dirname, '..', 'web', 'index.html');
  win.loadFile(htmlPath);

  // 注意: 配置由 preload.js 通过 contextBridge 暴露为 window.HN_DESKTOP.config，
  // 页面侧 config.js 会优先读取它（contextIsolation 下必须走 contextBridge）
  // 无需再用 did-finish-load 注入，避免竞态条件

  // 打开外链时用系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // F12 开发者工具
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  win.on('closed', () => {
    windows.delete(win);
    if (windows.size === 0 && process.platform !== 'darwin') {
      tray && tray.destroy();
      tray = null;
    }
  });

  windows.add(win);
  return win;
}

// ---------- 系统托盘 ----------
function createTray() {
  // 用一个 1x1 透明 PNG 作为临时图标（真正发布时替换 assets/icon.png）
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // 兜底: 16x16 绿色圆点 base64
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAklEQVR42mP8/5+hHgAHggJ/PchI7wAAGmkB1rN6W0AAAAASUVORK5CYII='
    );
  }

  tray = new Tray(icon);
  tray.setToolTip('华农心晴导航');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主窗口', click: () => { if (windows.size === 0) createWindow(); else windows.forEach(w => w.show()); } },
    { label: '新会话 (Ctrl+N)', accelerator: 'CommandOrControl+N', click: () => createWindow() },
    { type: 'separator' },
    { label: '设置 API 配置', click: () => openSettings() },
    { label: '重启', click: () => { windows.forEach(w => w.close()); setTimeout(() => createWindow(), 300); } },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ]));
  tray.on('click', () => { if (windows.size === 0) createWindow(); else windows.forEach(w => w.focus()); });
}

function openSettings() {
  // 创建一个简易设置窗口
  const settingsWin = new BrowserWindow({
    width: 500, height: 400,
    parent: windows[Symbol.iterator]().next().value || null,
    title: '华农心晴导航 - 设置',
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const cfg = loadConfig();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>设置</title>
  <style>
    body { font-family: -apple-system, 'Microsoft YaHei', sans-serif; padding: 24px; background: #f0fdf4; }
    h2 { color: #166534; margin-top: 0; }
    label { display: block; margin: 16px 0 6px; font-weight: 600; color: #374151; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
    input:focus { border-color: #22c55e; outline: none; box-shadow: 0 0 0 3px rgba(34,197,94,0.15); }
    .hint { font-size: 12px; color: #6b7280; margin-top: 4px; }
    button { margin-top: 24px; padding: 10px 24px; background: linear-gradient(135deg, #22c55e, #10b981); color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%; }
    button:hover { opacity: 0.9; }
    .save-hint { color: #22c55e; font-size: 13px; margin-top: 12px; display: none; }
  </style></head><body>
    <h2>⚙️ 华农心晴导航 - API 配置</h2>
    <label>Dify 服务地址</label>
    <input id="url" value="${cfg.difyBaseUrl}" placeholder="http://localhost">
    <div class="hint">本地 Dify Docker 部署默认为 http://localhost</div>
    <label>Dify App API Key</label>
    <input id="key" value="${cfg.difyApiKey}" placeholder="app-xxxxxxxxxxxx">
    <div class="hint">Dify 控制台 → 应用 → API 访问 → 创建 API Key</div>
    <button onclick="save()">保存并应用</button>
    <div id="hint" class="save-hint">✓ 保存成功！刷新窗口即可生效</div>
    <script>
      function save() {
        const url = document.getElementById('url').value.trim();
        const key = document.getElementById('key').value.trim();
        window.hnauAPI.saveConfig({ difyBaseUrl: url, difyApiKey: key }).then(() => {
          const h = document.getElementById('hint');
          h.style.display = 'block';
          setTimeout(() => window.close(), 1200);
        });
      }
    </script>
  </body></html>`;
  settingsWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

// ---------- IPC (preload 暴露的 API) ----------
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (_evt, newCfg) => {
  const current = loadConfig();
  const merged = { ...current, ...newCfg };
  saveConfig(merged);
  return merged;
});

// ---------- 全局快捷键 ----------
app.whenReady().then(async () => {
  // 先启动内嵌代理，拿到端口后再建窗口（端口要传给 preload）
  try {
    await startProxy();
    console.log(`[desktop] 内嵌代理已启动: http://127.0.0.1:${proxyPort}`);
  } catch (e) {
    console.error('启动内嵌代理失败:', e);
  }

  createWindow();
  createTray();

  // Ctrl+N 新窗口 (只在 Windows/Linux 下注册, mac 上用菜单)
  if (process.platform !== 'darwin') {
    globalShortcut.register('CommandOrControl+N', () => createWindow());
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (proxyServer) {
    try { proxyServer.close(); } catch (e) { /* 忽略 */ }
    proxyServer = null;
  }
});
