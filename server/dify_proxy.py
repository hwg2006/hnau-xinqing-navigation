#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
华农心晴导航 - Web 后端代理（FastAPI）

作用：浏览器只调用本代理，代理在服务端注入 Authorization 后转发给本地 Dify。
      Dify API Key 只存在于服务端 config/.env，不会下发到前端。

启动（在 server/ 目录下）:
    uvicorn dify_proxy:app --host 127.0.0.1 --port 8001

依赖: 见 server/requirements.txt
"""

import os
import sys
import json
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

# ---------- 加载 config/.env ----------
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "config" / ".env"
if not ENV_FILE.exists():
    print(f"[!] 未找到配置文件: {ENV_FILE}")
    sys.exit(1)
load_dotenv(ENV_FILE)

DIFY_BASE_URL = os.getenv("DIFY_BASE_URL", "http://localhost").rstrip("/")
DIFY_API_KEY = os.getenv("DIFY_API_KEY", "")
PROXY_PORT = int(os.getenv("DIFY_PROXY_PORT", "8001"))

if not DIFY_API_KEY or DIFY_API_KEY.startswith("app-xxxx"):
    print("[!] 请在 config/.env 中配置有效的 DIFY_API_KEY")
    sys.exit(1)

TARGET = f"{DIFY_BASE_URL}/v1/chat-messages"
UPSTREAM_HEADERS = {
    "Authorization": f"Bearer {DIFY_API_KEY}",
    "Content-Type": "application/json",
}

app = FastAPI(title="华农心晴导航 Web 代理")

# 只允许本机前端跨域（localhost / 127.0.0.1 任意端口）
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


@app.get("/")
def root():
    """健康检查。注意：绝不返回任何 Key 信息。"""
    return {"service": "华农心晴导航 Web 代理", "upstream": DIFY_BASE_URL, "status": "ok"}


def _sse_error(message: str) -> str:
    return "data: " + json.dumps({"event": "error", "message": message}, ensure_ascii=False) + "\n\n"


@app.post("/v1/chat-messages")
async def chat_messages(request: Request):
    body = await request.json()
    mode = body.get("response_mode", "streaming")

    if mode == "streaming":
        def stream():
            try:
                with requests.post(TARGET, json=body, headers=UPSTREAM_HEADERS,
                                   stream=True, timeout=300) as r:
                    if r.status_code != 200:
                        yield _sse_error(f"上游 {r.status_code}: {r.text[:200]}")
                        return
                    # Dify 已是 SSE，逐行透传（补回被 iter_lines 去掉的换行）
                    for line in r.iter_lines(decode_unicode=True):
                        if line:
                            yield line + "\n\n"
            except requests.RequestException as e:
                yield _sse_error(str(e))

        return StreamingResponse(stream(), media_type="text/event-stream")

    try:
        r = requests.post(TARGET, json=body, headers=UPSTREAM_HEADERS, timeout=300)
    except requests.RequestException as e:
        return JSONResponse({"error": str(e)}, status_code=502)
    return JSONResponse(r.json(), status_code=r.status_code)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PROXY_PORT)
