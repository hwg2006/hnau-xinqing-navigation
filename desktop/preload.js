// ============================================================
// 华农心晴导航 - Preload 安全桥接
// 只暴露白名单 API 给渲染层 (contextIsolation: true)
// 同步读取配置文件 → 在 Vue setup 之前注入 window.APP_CONFIG
// ============================================================

const { contextBridge, ipcRenderer, app } = require('electron');
const fs = require('fs');
const path = require('path');

// ---------- 同步读取配置 (在渲染层启动前) ----------
// preload 在 sandbox:false 下可以直接用 app.getPath，比解析 process.argv 更可靠
let config = { difyBaseUrl: 'http://localhost', difyApiKey: '' };
try {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) { /* 忽略 */ }

// 同步注入 window.APP_CONFIG —— 比 config.js / Vue setup 更早执行
window.APP_CONFIG = config;

// ---------- IPC API 桥接 ----------
contextBridge.exposeInMainWorld('hnauAPI', {
  // 配置读写 (异步, 用于设置窗口)
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),

  // 平台信息 (用于 UI 适配)
  platform: process.platform,

  // 版本信息
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
