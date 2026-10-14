// ============================================================
// 华农心晴导航 Web 版 - 配置文件
// ============================================================
// 浏览器只调用本地代理（server/dify_proxy.py），由代理在服务端注入
// Authorization 后转发给 Dify，因此前端不持有任何 API Key。
//
// 启动代理: 在 server/ 目录运行  python -m uvicorn dify_proxy:app --host 127.0.0.1 --port 8001
// 然后浏览器访问    http://127.0.0.1:8001
// （前端与 /v1 接口同源，由代理一并托管；无需再单独起 8080 静态服务）
//
// 桌面端(Electron) 由 preload 注入 window.HN_DESKTOP.config，
// 指向主进程内嵌的本地代理，此处优先采用。

window.APP_CONFIG =
  (window.HN_DESKTOP && window.HN_DESKTOP.config) || {
    // 后端代理地址；空字符串表示"与页面同源"（即当前访问的 host:port）
    apiBaseUrl: "",
  };
