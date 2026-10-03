#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 Dify YAML 工作流从远程 Provider 转换为本地 Ollama Provider

用法: python convert_to_ollama.py
输出: 心理助手_ollama版.yml
"""

import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_YAML = os.path.join(BASE_DIR, "心理助手_集成版_V3_fixed.yml")
OUTPUT_YAML = os.path.join(BASE_DIR, "心理助手_ollama版.yml")
NEW_MODEL = "qwen2.5:7b"
NEW_PROVIDER = "ollama/ollama"  # Dify 中 Ollama provider 的标识符


def convert():
    with open(INPUT_YAML, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. 替换模型名: Qwen3.5-35B-A3B → qwen2.5:7b
    content = content.replace("Qwen3.5-35B-A3B", NEW_MODEL)
    content = content.replace("qwen3.5-35b-a3b", "qwen2.5-7b")

    # 2. 替换 provider: langgenius/openai_api_compatible/openai_api_compatible → ollama/ollama
    content = content.replace(
        "langgenius/openai_api_compatible/openai_api_compatible",
        NEW_PROVIDER,
    )

    # 3. 更新描述
    content = content.replace(
        "华农校园心理健康智能陪伴AI助手（集成版V3）",
        "华农校园心理健康智能陪伴AI助手（Ollama本地版）",
    )

    # 4. dataset_ids 保留原样 —— Dify 导入时 dataset_id 不存在会自动返回空
    #    校园服务分支的 llm_kb 节点有内置知识兜底，知识库不可用也能正常回答
    #    如需真正绑定: 在 Dify 编辑器里点 knowledge_retrieval_01 重新选择知识库

    with open(OUTPUT_YAML, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"✓ 已生成 Ollama 版 YAML: {OUTPUT_YAML}")
    print(f"  - 模型: {NEW_MODEL}")
    print(f"  - Provider: {NEW_PROVIDER}")
    print()
    print("⚠️  导入 Dify 后还需手动:")
    print("  1. 在 Dify 设置 → 模型提供者中先添加 Ollama (http://localhost:11434)")
    print("  2. 确认所有 LLM 节点的 provider 指向刚添加的 Ollama")
    print("  3. 重新绑定 knowledge_retrieval_01 到你的知识库")


if __name__ == "__main__":
    convert()
