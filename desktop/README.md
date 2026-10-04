# desktop —— Electron 桌面端

内嵌 Web 前端并把 API Key 隔离在主进程：页面只拿到一个仅监听 `127.0.0.1` 的**内嵌代理地址**，Key 由主进程注入。桌面端无需额外启动 Python 服务。

## 结构（主进程只做组装）

```
main.js                 组装层：把下列模块拼装起来（无业务细节）
preload.js              安全桥：contextBridge 白名单暴露配置与 IPC
settings.html / .js     设置窗口页面（读写 Dify 地址与 Key）
src/
  ├── config-store.js   配置持久化（userData/config.json，回退 config/.env）
  ├── proxy-server.js   内嵌代理（注入 Authorization + SSE 透传）
  ├── window-manager.js 主窗口创建 / 聚焦
  ├── tray.js           系统托盘与菜单
  └── settings-window.js 设置窗口
assets/icon.png         应用图标
```

## 启动 / 打包

```powershell
cd desktop
npm install
npm start            # 开发运行
npm run build-win    # 打包 Windows 安装包（输出到 release/）
```

> 安全：`contextIsolation: true` + `nodeIntegration: false`，渲染层无 Node 权限、不持有 Key。
