# server —— 后端服务

只负责**计算与服务的推送**：向上游 Dify / Ollama 请求，向下游（Web/桌面）推送 SSE 流。不含任何页面逻辑。

## 两条路线

| 文件 | 端口 | 说明 |
|------|------|------|
| `dify_proxy.py` | 8001 | **主路线**：代理 Dify，转发时注入 `Authorization`，Key 只存服务端；透传 SSE |
| `ollama_backend.py` | 8000 | **备用后端**：绕过 Dify 直连 Ollama，无需 Docker 时使用 |

## 启动

```powershell
cd server
pip install -r requirements.txt

# 主路线（推荐）
python -m uvicorn dify_proxy:app --host 127.0.0.1 --port 8001

# 备用后端（直连 Ollama，需本机已运行 ollama serve）
python -m uvicorn ollama_backend:app --host 127.0.0.1 --port 8000
```

> 依赖 `config/.env`（`DIFY_BASE_URL` / `DIFY_API_KEY` / `OLLAMA_BASE_URL`）。
> 两条路线对前端暴露同一套 `/v1/chat-messages` 协议，可互换。
