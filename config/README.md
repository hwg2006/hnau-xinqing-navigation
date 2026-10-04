# config —— 集中配置

全项目（CLI / Web 代理 / 桌面端）共用同一份配置，避免多处维护。**真实密钥只存在这里，且已被 `.gitignore` 排除。**

## 使用

```powershell
Copy-Item config\.env.example config\.env   # 然后填入自己的值
```

## 配置项

| 键 | 说明 |
|----|------|
| `DIFY_BASE_URL` | Dify 服务地址（默认 `http://localhost`） |
| `DIFY_API_KEY` | Dify 应用 API Key（**切勿提交到仓库**） |
| `OLLAMA_BASE_URL` | Ollama 服务地址（默认 `http://localhost:11434`） |
| `OLLAMA_MODEL` | 本地模型名（默认 `qwen2.5:7b`） |
| `DIFY_PROXY_PORT` | 后端代理端口（默认 `8001`） |

| 文件 | 说明 |
|------|------|
| `.env.example` | 配置模板（入库） |
| `.env` | 真实配置（**不入库**） |
