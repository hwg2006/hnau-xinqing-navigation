// ============================================================
// 华农心晴导航 - Preload 安全桥接
// contextIsolation: true 时，preload 与页面处于两个隔离世界，
// 直接赋值 window.APP_CONFIG 页面看不到，必须通过 contextBridge 暴露。
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

// ---------- 解析主进程通过 additionalArguments 传入的参数 ----------
// 注意: preload 运行在渲染进程，拿不到主进程的 app 模块，
// 因此 userData 路径 / 代理地址都必须由主进程显式传入。
function readArg(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

// 内嵌代理地址由主进程启动后传入；页面只拿到这个地址，不持有 API Key
const proxyUrl = readArg('--proxy-url=');

// ---------- 暴露给页面主世界的配置 ----------
contextBridge.exposeInMainWorld('HN_DESKTOP', {
  config: proxyUrl ? { apiBaseUrl: proxyUrl } : {},
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});

// ---------- IPC API 桥接（设置窗口读写配置用） ----------
contextBridge.exposeInMainWorld('hnauAPI', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
