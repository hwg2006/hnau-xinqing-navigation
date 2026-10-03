// ============================================================
// 华农心晴导航 Web 版 - 配置文件
// ============================================================
// 浏览器只调用本地代理（server/dify_proxy.py），由代理在服务端注入
// Authorization 后转发给 Dify，因此前端不持有任何 API Key。
//
// 启动代理: 在 server/ 目录运行  uvicorn dify_proxy:app --port 8001
// 启动 Web : 在 web/ 目录运行  python -m http.server 8080

window.APP_CONFIG = {
  // 后端代理地址（实际调用 {apiBaseUrl}/v1/chat-messages）
  apiBaseUrl: "http://localhost:8001",
};
