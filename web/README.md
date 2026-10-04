# web —— Web 前端（Vue3 + PWA）

只负责 **UI 组织与订阅**：页面不持有任何 API Key，也不做业务计算。所有对话请求都发往本机后端代理 `server/dify_proxy.py`。

## 分层

```
index.html   仅 UI 骨架（无内联脚本）
app.js       Vue 组件逻辑：状态 + 事件（订阅 api.js）
api.js       通信层：封装 /v1/chat-messages 的 SSE 订阅
config.js    仅配置后端地址（默认 http://localhost:8001），不含密钥
sw.js        Service Worker，PWA 离线缓存
manifest.json PWA 应用清单
```

## 启动

```powershell
# 1) 先启动后端代理（端口 8001）
cd server ; python -m uvicorn dify_proxy:app --host 127.0.0.1 --port 8001

# 2) 再起静态服务
cd web ; python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

> 修改前端文件后请同步升 `sw.js` 的 `CACHE_NAME`，否则会读到旧缓存。
