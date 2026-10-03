#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
华农心晴导航 CLI - 通过 Dify API 与心理助手对话

使用方法:
    python cli.py              # 启动交互式对话
    python cli.py "你好"       # 单轮对话
    python cli.py --stream     # 流式输出（默认）
    python cli.py --no-stream  # 非流式等待完整回复
    python cli.py --new        # 开始新会话
"""

import os
import sys
import json
import argparse
import requests
from dotenv import load_dotenv
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from prompt_toolkit import PromptSession
from prompt_toolkit.history import InMemoryHistory

# ---------- 加载配置 ----------
CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
ENV_FILE = os.path.join(CONFIG_DIR, ".env")
EXAMPLE_ENV = os.path.join(CONFIG_DIR, ".env.example")

# 如果 .env 不存在，提示复制
if not os.path.exists(ENV_FILE):
    print(f"[!] 未找到配置文件: {ENV_FILE}")
    print(f"    请复制 {EXAMPLE_ENV} 为 .env 并填入你的 Dify API Key")
    print("    cp config/.env.example config/.env")
    sys.exit(1)

load_dotenv(ENV_FILE)

DIFY_BASE_URL = os.getenv("DIFY_BASE_URL", "http://localhost")
DIFY_API_KEY = os.getenv("DIFY_API_KEY", "")

if not DIFY_API_KEY or DIFY_API_KEY.startswith("app-xxxx"):
    print("[!] 请先在 config/.env 中配置有效的 DIFY_API_KEY")
    print("    获取方式: Dify 应用控制台 → 访问 API → 创建 API Key")
    sys.exit(1)

console = Console()


# ---------- Dify API 客户端 ----------
class DifyClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.conversation_id = None  # None 表示新会话

    def chat(self, query: str, stream: bool = True) -> dict:
        """发送消息，返回回复"""
        url = f"{self.base_url}/v1/chat-messages"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": {},
            "query": query,
            "response_mode": "streaming" if stream else "blocking",
            "conversation_id": self.conversation_id or "",
            "user": "cli_user_001",
        }

        if stream:
            return self._chat_stream(url, headers, payload)
        else:
            return self._chat_blocking(url, headers, payload)

    def _chat_stream(self, url, headers, payload):
        """流式请求，逐 token 输出"""
        try:
            resp = requests.post(url, headers=headers, json=payload, stream=True, timeout=120)
            resp.raise_for_status()
        except requests.RequestException as e:
            return {"error": f"请求失败: {e}"}

        full_text = []
        console.print("[cyan]助手:[/cyan] ", end="", style="bold")

        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            event = data.get("event")
            if event == "message":
                delta = data.get("answer", "")
                if delta:
                    console.print(delta, end="")
                    full_text.append(delta)
                # 更新会话 ID
                cid = data.get("conversation_id")
                if cid and not self.conversation_id:
                    self.conversation_id = cid
            elif event == "message_end":
                cid = data.get("conversation_id")
                if cid:
                    self.conversation_id = cid
            elif event == "error":
                console.print(f"\n[red]错误: {data.get('message', '未知')}[/red]")

        console.print()  # 换行
        return {"answer": "".join(full_text), "conversation_id": self.conversation_id}

    def _chat_blocking(self, url, headers, payload):
        """非流式，等待完整响应"""
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=120)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            return {"error": f"请求失败: {e}"}
        except json.JSONDecodeError:
            return {"error": "响应解析失败"}

        self.conversation_id = data.get("conversation_id", self.conversation_id)
        return {
            "answer": data.get("answer", ""),
            "conversation_id": self.conversation_id,
        }

    def new_conversation(self):
        """重置会话"""
        self.conversation_id = None


# ---------- 主交互循环 ----------
def interactive_mode(client: DifyClient, use_stream: bool):
    console.print(Panel.fit(
        "[bold green]华农心晴导航 CLI[/bold green]\n"
        "[dim]输入消息开始对话，输入[/dim] [bold]/quit[/bold] [dim]退出，[/dim]"
        "[bold]/new[/bold] [dim]新会话，[/dim][bold]/status[/bold] [dim]查看状态[/dim]",
        border_style="green"
    ))

    history = InMemoryHistory()
    session = PromptSession(history=history)

    while True:
        try:
            user_input = session.prompt("\n[bold]你:[/bold] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]再见~[/dim]")
            break

        if not user_input:
            continue

        # 命令处理
        if user_input.startswith("/"):
            cmd = user_input.lower()
            if cmd in ("/quit", "/exit", "/q"):
                console.print("[dim]再见~[/dim]")
                break
            elif cmd in ("/new", "/reset"):
                client.new_conversation()
                console.print("[green]✓ 已开始新会话[/green]")
                continue
            elif cmd in ("/status", "/info"):
                console.print(f"  Dify: {DIFY_BASE_URL}")
                console.print(f"  会话 ID: {client.conversation_id or '(新会话)'}")
                console.print(f"  模式: {'流式' if use_stream else '非流式'}")
                continue
            elif cmd in ("/help", "/?"):
                console.print("[dim]命令:[/dim] /quit /new /status /help")
                continue
            else:
                console.print(f"[red]未知命令: {user_input}[/red]")
                continue

        # 发送请求
        result = client.chat(user_input, stream=use_stream)
        if "error" in result:
            console.print(f"[red]{result['error']}[/red]")


def single_turn(client: DifyClient, query: str, use_stream: bool):
    """单轮对话模式"""
    console.print(f"[bold green]你:[/bold green] {query}\n")
    result = client.chat(query, stream=use_stream)
    if not use_stream and "answer" in result:
        console.print("\n[bold cyan]助手:[/bold cyan]")
        console.print(Markdown(result["answer"]))


def main():
    parser = argparse.ArgumentParser(description="华农心晴导航 CLI")
    parser.add_argument("query", nargs="?", help="单轮对话的问题（可选）")
    parser.add_argument("--no-stream", action="store_true", help="关闭流式输出")
    parser.add_argument("--new", action="store_true", help="强制新会话")
    args = parser.parse_args()

    client = DifyClient(DIFY_BASE_URL, DIFY_API_KEY)
    if args.new:
        client.new_conversation()

    use_stream = not args.no_stream

    if args.query:
        single_turn(client, args.query, use_stream)
    else:
        interactive_mode(client, use_stream)


if __name__ == "__main__":
    main()
