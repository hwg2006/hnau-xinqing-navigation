# cli —— 命令行对话客户端

通过 Dify API 与「华农心晴导航」心理助手对话。属于**本地可信客户端**，自己持有 API Key，直连 Dify。

## 启动

```powershell
cd cli
pip install -r requirements.txt
python cli.py            # 交互式对话
python cli.py "你好"      # 单轮对话
python cli.py --no-stream # 关闭流式
python cli.py --new       # 新会话
```

> 依赖 `config/.env` 中的 `DIFY_BASE_URL` / `DIFY_API_KEY`，请先复制 `config/.env.example`。

## 文件

| 文件 | 说明 |
|------|------|
| `cli.py` | 主程序：交互式 / 单轮对话，SSE 流式输出 |
| `convert_to_ollama.py` | 把 Dify 工作流 YAML 的远程 Provider 转成本地 Ollama Provider |
| `download_ollama.py` | Ollama 便携版下载器（分块 + 断点续传 + 进度条） |
| `test_ollama.py` | Ollama 服务连通性与模型自检 |
| `requirements.txt` | CLI 依赖（后端依赖见 `../server/requirements.txt`） |
