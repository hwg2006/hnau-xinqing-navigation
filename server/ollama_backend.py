#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
华农心晴导航 - 备用后端（直连 Ollama，不依赖 Dify）

定位：主路线是「Ollama → Dify → server/dify_proxy.py → 应用」。
      本文件是给「不想装 Docker / Dify」的同学的降级方案：把 Ollama
      包装成与 Dify 一致的 /v1/chat-messages 接口，前端代码无需改动。
      它不参与一键启动流程，需要时手动启用。

启动（在 server/ 目录下）:
    uvicorn ollama_backend:app --host 127.0.0.1 --port 8000

启用后需把 web/config.js 的 apiBaseUrl 改成 http://localhost:8000

依赖: 见 server/requirements.txt
环境变量（config/.env）:
    OLLAMA_BASE_URL   默认 http://localhost:11434
    OLLAMA_MODEL      默认 qwen2.5:7b
"""

import os
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ---------- 加载 config/.env（缺失也能跑，用默认值） ----------
ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "config" / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

# 键名以 config/.env.example 的 OLLAMA_BASE_URL 为准，OLLAMA_URL 仅作兼容回退
OLLAMA_URL = (
    os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_URL") or "http://localhost:11434"
).rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

app = FastAPI(title="华农心晴导航 API (Ollama 直连 · 备用)")

# 只允许本机前端跨域，与 server/dify_proxy.py 保持一致的安全姿势
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)

# 系统提示词 - 精简版
SYSTEM_PROMPT = """你是「华农心晴导航」心理健康智能陪伴助手，服务华南农业大学学生。
你不是医生或心理咨询师，不提供诊断、治疗或用药建议。

规则:
1. 共情优先：先承接情绪，再提供信息
2. 边界清晰：限定在陪伴/科普/引导/转介
3. 隐私提醒：提醒不要发送姓名、学号、身份证号等身份信息
4. 长度控制：单次回复 80-150 字
5. 危机缓冲：如检测到风险升级信号，立即引导拨打 12356 或 120
6. 时间感知：当前时间是 {time}

校园心理中心信息:
- 预约电话: 020-85280085
- 地址: 华山新学生活动中心三楼308
- 工作时间: 周一至周日 8:30-12:00、14:30-20:00

语气要温和、像朋友一样，不要太官方。"""


class ChatRequest(BaseModel):
    query: str = ""
    inputs: dict = {}
    response_mode: str = "blocking"
    conversation_id: Optional[str] = ""
    user: str = "default_user"


# 内存会话历史: conversation_id -> [{"role","content"}]
MAX_SESSIONS = 100  # 上限，防止长跑后内存无限增长（超出按先进先出淘汰）
_SESSIONS = {}


def _get_session(conv_id: str) -> list:
    """取会话历史；超上限时淘汰最早的一个会话。"""
    if conv_id not in _SESSIONS and len(_SESSIONS) >= MAX_SESSIONS:
        _SESSIONS.pop(next(iter(_SESSIONS)))
    return _SESSIONS.setdefault(conv_id, [])


def _ask_ollama(messages):
    """非流式一次性取回完整回复"""
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": OLLAMA_MODEL, "messages": messages, "stream": False},
            timeout=300,
        )
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")
    except requests.RequestException as e:
        return f"抱歉，我暂时遇到了问题，请稍后再试。(错误: {e})"


def _stream_ollama(conv_id, messages, query):
    """SSE 流式输出，协议兼容 Dify 的 streaming"""
    full = []
    try:
        with requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": OLLAMA_MODEL, "messages": messages, "stream": True},
            stream=True,
            timeout=300,
        ) as r:
            r.raise_for_status()
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                delta = obj.get("message", {}).get("content", "")
                if delta:
                    full.append(delta)
                    yield "data: " + json.dumps(
                        {"event": "message", "conversation_id": conv_id, "answer": delta},
                        ensure_ascii=False,
                    ) + "\n\n"
                if obj.get("done"):
                    break
    except requests.RequestException as e:
        yield "data: " + json.dumps(
            {"event": "error", "message": str(e)}, ensure_ascii=False
        ) + "\n\n"

    answer = "".join(full)
    _get_session(conv_id).extend([
        {"role": "user", "content": query},
        {"role": "assistant", "content": answer},
    ])
    yield "data: " + json.dumps(
        {"event": "message_end", "conversation_id": conv_id}, ensure_ascii=False
    ) + "\n\n"
    yield "data: [DONE]\n\n"


@app.get("/")
def root():
    """健康检查"""
    return {
        "service": "华农心晴导航 API (Ollama 直连 · 备用)",
        "model": OLLAMA_MODEL,
        "ollama": OLLAMA_URL,
        "status": "ok",
    }


@app.post("/v1/chat-messages")
async def chat(req: ChatRequest):
    """模拟 Dify /v1/chat-messages 接口，直接调 Ollama（支持 streaming / blocking）"""
    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    system = SYSTEM_PROMPT.format(time=now)

    conv_id = req.conversation_id or (
        "local_" + req.user + "_" + datetime.now().strftime("%H%M%S")
    )
    history = _get_session(conv_id)
    messages = (
        [{"role": "system", "content": system}]
        + history
        + [{"role": "user", "content": req.query}]
    )

    if req.response_mode == "streaming":
        return StreamingResponse(
            _stream_ollama(conv_id, messages, req.query),
            media_type="text/event-stream",
        )

    answer = _ask_ollama(messages)
    history.append({"role": "user", "content": req.query})
    history.append({"role": "assistant", "content": answer})
    return {
        "answer": answer,
        "conversation_id": conv_id,
        "message_id": "msg_" + datetime.now().strftime("%H%M%S"),
    }


@app.get("/health")
def health():
    """检查 Ollama 是否连通"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        return {"ollama_connected": resp.status_code == 200, "model": OLLAMA_MODEL}
    except requests.RequestException as e:
        return {"ollama_connected": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("OLLAMA_BACKEND_PORT", "8000")))
