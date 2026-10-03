#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ollama 直接模式后端（不依赖 Dify）
适合不想装 Docker/Dify 的用户，直接用本地模型 + FastAPI

启动: uvicorn ollama_backend:app --host 0.0.0.0 --port 8000 --reload
然后把 web/config.js 的 difyBaseUrl 改成 http://localhost:8000
"""

import os
import json
import requests
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="华农心晴导航 API (Ollama 直连)")

# CORS - 允许 Web 前端跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

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
_SESSIONS = {}


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
    """SSE 流式输出，兼容 Dify 的 streaming 协议"""
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
    _SESSIONS.setdefault(conv_id, []).extend([
        {"role": "user", "content": query},
        {"role": "assistant", "content": answer},
    ])
    yield "data: " + json.dumps(
        {"event": "message_end", "conversation_id": conv_id}, ensure_ascii=False
    ) + "\n\n"
    yield "data: [DONE]\n\n"


@app.get("/")
def root():
    return {
        "service": "华农心晴导航 API",
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
    history = _SESSIONS.setdefault(conv_id, [])
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
    except Exception as e:
        return {"ollama_connected": False, "error": str(e)}
