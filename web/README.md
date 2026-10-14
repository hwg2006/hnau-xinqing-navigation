# web —— Web 前端（Vue3 + PWA）

只负责 **UI 组织与订阅**：页面不持有任何 API Key，也不做业务计算。所有对话请求都发往本机后端代理 `server/dify_proxy.py`。

## 分层

```
index.html   仅 UI 骨架（无内联脚本）
app.js       Vue 组件逻辑：状态 + 事件（订阅 api.js）
api.js       通信层：封装 /v1/chat-messages 的 SSE 订阅
config.js    仅配置后端地址（默认 ""，即与页面同源），不含密钥
sw.js        Service Worker，PWA 离线缓存
manifest.json PWA 应用清单
```

## 启动

前端页面由后端代理**同源托管**；前端与 `/v1` 接口同源，可避免跨端口流式请求被浏览器重置。

```powershell
# 启动后端代理（同时托管本目录前端，端口 8001）
cd server ; python -m uvicorn dify_proxy:app --host 127.0.0.1 --port 8001
# 浏览器访问 http://127.0.0.1:8001
```

> 备用后端（`server/ollama_backend.py`，端口 8000）不托管前端：需另起静态服务
> （`cd web ; python -m http.server 8080`），并把 `config.js` 的 `apiBaseUrl` 改为该后端地址。

> 修改前端文件后请同步升 `sw.js` 的 `CACHE_NAME`，否则会读到旧缓存。
