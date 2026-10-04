// ============================================================
// 主窗口管理模块
// 职责：创建 / 聚焦主窗口，注册 F12 开发者工具与外链跳转策略。
// 安全：contextIsolation=true + preload 桥接，不向渲染层暴露 Node。
// ============================================================

const path = require('path');
const { BrowserWindow, shell } = require('electron');

// 工厂函数：注入代理地址获取器，管理所有主窗口
function createWindowManager({ getProxyPort }) {
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
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,   // 安全: 隔离 node 环境
        nodeIntegration: false,    // 安全: 渲染层不允许 require
        sandbox: true,             // 安全: 沙箱内 preload 仅用 electron 桥接，无需 Node 能力
        webviewTag: false,         // 安全: 禁用 webview
        // 把代理地址传给 preload，preload 再经 contextBridge 暴露给页面
        additionalArguments: [
          `--proxy-url=http://127.0.0.1:${getProxyPort()}`,
        ],
      },
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    });

    // 加载已构建的 Web 前端（file:// 协议）
    win.loadFile(path.join(__dirname, '..', '..', 'web', 'index.html'));

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

    win.on('closed', () => windows.delete(win));

    windows.add(win);
    return win;
  }

  // 有窗口则聚焦，无窗口则新建
  function focusOrCreate() {
    if (windows.size === 0) return createWindow();
    windows.forEach((w) => w.show());
    return null;
  }

  function closeAll() {
    windows.forEach((w) => w.close());
  }

  function getWindows() { return windows; }

  return { createWindow, focusOrCreate, closeAll, getWindows };
}

module.exports = { createWindowManager };
