// ============================================================
// 华农心晴导航 - Electron 主进程
// 负责: 窗口管理、系统托盘、快捷键、配置持久化
// 安全: contextIsolation + preload + 不暴露 node 给渲染层
// ============================================================

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------- 配置持久化 ----------
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) { /* 忽略 */ }
  return { difyBaseUrl: 'http://localhost', difyApiKey: '' };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存配置失败:', e);
  }
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
      // 把 userData 路径传给 preload，让它同步读取 config.json
      additionalArguments: [`--user-data=${app.getPath('userData')}`],
    },
    // 自定义标题栏 - 用 CSS 实现更现代的外观
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // 加载已有的 web 前端 (用 file:// 协议)
  const htmlPath = path.join(__dirname, '..', 'web', 'index.html');
  win.loadFile(htmlPath);

  // 注意: 配置已经在 preload.js 里同步注入 window.APP_CONFIG 了
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
app.whenReady().then(() => {
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
});
