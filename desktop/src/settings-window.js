// ============================================================
// 设置窗口模块
// 职责：打开"API 配置"窗口，页面为独立的 settings.html。
// 说明：采用 loadFile 加载静态页面 + 页面侧通过 IPC 读取配置，
//       避免把配置值拼接进 HTML 字符串（消除 DOM 注入面）。
// ============================================================

const path = require('path');
const { BrowserWindow } = require('electron');

function openSettingsWindow({ parent } = {}) {
  const win = new BrowserWindow({
    width: 500,
    height: 420,
    parent: parent || null,
    title: '华农心晴导航 - 设置',
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'settings.html'));
  return win;
}

module.exports = { openSettingsWindow };
