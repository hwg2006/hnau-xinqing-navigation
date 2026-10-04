// ============================================================
// 华农心晴导航 - Electron 主进程（组装层）
// 职责：仅把各功能模块组装起来 —— 配置存储 / 内嵌代理 / 主窗口 /
//       系统托盘 / 设置窗口 / 全局快捷键。
// 说明：具体实现见 src/ 各模块；本文件不含业务细节，便于阅读与替换。
// 安全：contextIsolation + preload 桥接，渲染层不持有 API Key。
// ============================================================

const { app, ipcMain, globalShortcut, dialog, BrowserWindow } = require('electron');

const { loadConfig, saveConfig } = require('./src/config-store');
const { createProxyServer } = require('./src/proxy-server');
const { createWindowManager } = require('./src/window-manager');
const { createTray } = require('./src/tray');
const { openSettingsWindow } = require('./src/settings-window');

// ---------- 组装各模块 ----------
const proxy = createProxyServer({ loadConfig });
const windowManager = createWindowManager({ getProxyPort: () => proxy.getPort() });

let tray = null;

// 关窗到重建窗口的间隔（毫秒），留出旧窗口释放时间
const RESTART_DELAY_MS = 300;

// 打开设置窗口（父窗口取当前任一主窗口）
function openSettings() {
  const parent = windowManager.getWindows().values().next().value || null;
  openSettingsWindow({ parent });
}

// 重启：关闭全部窗口后重建
function restartApp() {
  windowManager.closeAll();
  setTimeout(() => windowManager.createWindow(), RESTART_DELAY_MS);
}

// ---------- IPC：设置窗口读写配置 ----------
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (_evt, newCfg) => {
  const merged = { ...loadConfig(), ...newCfg };
  saveConfig(merged);
  return merged;
});

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  // 先启动内嵌代理，拿到端口后再建窗口（端口要传给 preload）
  try {
    const port = await proxy.start();
    console.log(`[desktop] 内嵌代理已启动: http://127.0.0.1:${port}`);
  } catch (e) {
    // 代理起不来则页面无法访问后端，明确报错并退出，避免"看似启动成功"的假象
    dialog.showErrorBox('启动失败', `内嵌代理启动失败，应用无法连接后端服务。\n\n${e.message}`);
    app.quit();
    return;
  }

  windowManager.createWindow();
  tray = createTray({
    actions: {
      openMain: () => windowManager.focusOrCreate(),
      newWindow: () => windowManager.createWindow(),
      openSettings,
      restart: restartApp,
    },
  });

  // Ctrl+N 新窗口（Windows/Linux；mac 走系统菜单）
  if (process.platform !== 'darwin') {
    globalShortcut.register('CommandOrControl+N', () => windowManager.createWindow());
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowManager.createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  proxy.stop();
});
