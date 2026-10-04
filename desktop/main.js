// ============================================================
// 华农心晴导航 - Electron 主进程（组装层）
// 职责：仅把各功能模块组装起来 —— 配置存储 / 内嵌代理 / 主窗口 /
//       系统托盘 / 设置窗口 / 全局快捷键。
// 说明：具体实现见 src/ 各模块；本文件不含业务细节，便于阅读与替换。
// 安全：contextIsolation + preload 桥接，渲染层不持有 API Key。
// ============================================================

const { app, ipcMain, globalShortcut, BrowserWindow } = require('electron');

const { loadConfig, saveConfig } = require('./src/config-store');
const { createProxyServer } = require('./src/proxy-server');
const { createWindowManager } = require('./src/window-manager');
const { createTray } = require('./src/tray');
const { openSettingsWindow } = require('./src/settings-window');

// ---------- 组装各模块 ----------
const proxy = createProxyServer({ loadConfig });
const windowManager = createWindowManager({ getProxyPort: () => proxy.getPort() });

let tray = null;

// 打开设置窗口（父窗口取当前任一主窗口）
function openSettings() {
  const parent = windowManager.getWindows().values().next().value || null;
  openSettingsWindow({ parent });
}

// 重启：关闭全部窗口后重建
function restartApp() {
  windowManager.closeAll();
  setTimeout(() => windowManager.createWindow(), 300);
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
    console.error('启动内嵌代理失败:', e);
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
