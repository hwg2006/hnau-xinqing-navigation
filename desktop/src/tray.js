// ============================================================
// 系统托盘模块
// 职责：创建托盘图标与右键菜单，具体动作由调用方（main.js）注入，
//       模块本身不关心窗口/配置等实现细节。
// ============================================================

const path = require('path');
const fs = require('fs');
const { Tray, Menu, nativeImage } = require('electron');

// 工厂函数：actions = { openMain, newWindow, openSettings, restart }
function createTray({ actions }) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // 兜底: 16x16 绿色圆点 base64
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAklEQVR42mP8/5+hHgAHggJ/PchI7wAAGmkB1rN6W0AAAAASUVORK5CYII='
    );
  }

  const tray = new Tray(icon);
  tray.setToolTip('华农心晴导航');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主窗口', click: () => actions.openMain() },
    { label: '新会话 (Ctrl+N)', accelerator: 'CommandOrControl+N', click: () => actions.newWindow() },
    { type: 'separator' },
    { label: '设置 API 配置', click: () => actions.openSettings() },
    { label: '重启', click: () => actions.restart() },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ]));
  tray.on('click', () => actions.openMain());

  return tray;
}

module.exports = { createTray };
