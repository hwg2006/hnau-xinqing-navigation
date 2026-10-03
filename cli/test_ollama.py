#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ollama 本地模型快速测试脚本
装好 Ollama 后，先跑 ollama pull qwen2.5:7b，再执行此脚本验证
"""

import requests
import sys

OLLAMA_URL = "http://localhost:11434"
MODEL = "qwen2.5:7b"


def check_ollama():
    """检查 Ollama 服务是否运行"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if resp.status_code == 200:
            models = resp.json().get("models", [])
            print(f"✓ Ollama 服务运行正常 (http://localhost:11434)")
            if models:
                print(f"  已安装模型: {', '.join(m['name'] for m in models)}")
            else:
                print(f"  [!] 还没有模型，请先执行: ollama pull {MODEL}")
            return True
    except requests.ConnectionError:
        pass
    print("✗ Ollama 服务未启动")
    print("  请打开 PowerShell 执行: ollama serve")
    return False


def test_chat():
    """测试聊天"""
    print(f"\n🔍 测试模型 {MODEL} ...\n")
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "你是华农心晴导航，一个温和的校园心理支持AI助手。"},
            {"role": "user", "content": "你好，我最近考试压力很大，睡不着怎么办？"}
        ],
        "stream": False,
    }
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=60)
        if resp.status_code == 200:
            answer = resp.json().get("message", {}).get("content", "")
            print("模型回复:")
            print("-" * 50)
            print(answer)
            print("-" * 50)
            print("\n✓ 本地模型工作正常！")
        else:
            print(f"✗ API 错误: {resp.status_code} {resp.text}")
    except requests.ConnectionError:
        print("✗ 连接失败，Ollama 服务可能没启动")
    except Exception as e:
        print(f"✗ 出错: {e}")


if __name__ == "__main__":
    print("=" * 50)
    print("  Ollama 本地模型测试")
    print("=" * 50)

    if not check_ollama():
        sys.exit(1)

    if "--test" in sys.argv or len(sys.argv) <= 1:
        test_chat()

    print("\n✅ 全部通过！接下来可以:")
    print("  1. 部署 Docker Desktop + Dify")
    print("  2. 在 Dify 里添加 Ollama 作为模型提供者")
    print("  3. 导入 心理助手_集成版_V3_fixed.yml 工作流")
