#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ollama 便携版下载器 - 支持分块 + 断点续传 + 进度条"""
import os, sys, time, zipfile, io
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, "ollama-local")
ZIP_PATH = os.path.join(OUT_DIR, "ollama.zip")
EXTRACT_DIR = os.path.join(OUT_DIR, "ollama")

# 尝试多个版本，选最新可用的
VERSIONS = ["v0.6.5", "v0.6.4", "v0.6.3", "v0.6.2"]

def get_url(ver):
    return f"https://github.com/ollama/ollama/releases/download/{ver}/ollama-windows-amd64.zip"

def download():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    # 找一个可用的版本
    url = None
    for v in VERSIONS:
        u = get_url(v)
        try:
            head = requests.head(u, timeout=10, allow_redirects=True)
            if head.status_code == 200:
                url = u
                print(f"✓ 找到可用版本 {v}")
                break
        except:
            continue
    
    if not url:
        # 试试 Ollama 官方下载
        url = "https://ollama.com/download/OllamaSetup.exe"
        print(f"使用官方安装包作为备选")
    
    print(f"下载地址: {url}")
    
    # 断点续传
    headers = {}
    if os.path.exists(ZIP_PATH):
        size = os.path.getsize(ZIP_PATH)
        headers["Range"] = f"bytes={size}-"
        print(f"从 {size} 字节继续下载...")
    
    try:
        resp = requests.get(url, headers=headers, stream=True, timeout=60)
    except Exception as e:
        print(f"下载失败: {e}")
        print("请手动下载 Ollama: https://ollama.com/download/windows")
        print(f"解压到: {EXTRACT_DIR}")
        return False
    
    if resp.status_code == 416:  # Range 不可满足 = 下载完了
        print("文件已下载完毕")
    elif resp.status_code in (200, 206):
        total = int(resp.headers.get("content-length", 0))
        if resp.status_code == 206:
            total += os.path.getsize(ZIP_PATH)
        
        mode = "ab" if resp.status_code == 206 else "wb"
        downloaded = os.path.getsize(ZIP_PATH) if mode == "ab" else 0
        
        with open(ZIP_PATH, mode) as f:
            for chunk in resp.iter_content(chunk_size=8192*16):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = downloaded * 100 // total
                        bar = "█" * (pct // 2) + "░" * (50 - pct // 2)
                        print(f"\r  [{bar}] {pct}% ({downloaded//1024//1024}/{total//1024//1024}MB)", end="", flush=True)
        
        print()
    
    # 解压
    print(f"解压到 {EXTRACT_DIR} ...")
    os.makedirs(EXTRACT_DIR, exist_ok=True)
    
    if ZIP_PATH.endswith(".exe"):
        print("检测到是安装包 (.exe)，请手动双击安装")
        print(f"位置: {ZIP_PATH}")
        return True
    
    try:
        with zipfile.ZipFile(ZIP_PATH) as zf:
            zf.extractall(EXTRACT_DIR)
        
        ollama_exe = None
        for root, dirs, files in os.walk(EXTRACT_DIR):
            for fn in files:
                if fn == "ollama.exe":
                    ollama_exe = os.path.join(root, fn)
                    break
        
        if ollama_exe:
            print(f"✓ Ollama 解压成功: {ollama_exe}")
            print(f"  启动服务: & '{ollama_exe}' serve")
            print(f"  下载模型: & '{ollama_exe}' pull qwen2.5:7b")
        else:
            print(f"解压完成，但没找到 ollama.exe")
            print(f"请检查 {EXTRACT_DIR} 目录结构")
        
        return True
    except Exception as e:
        print(f"解压失败: {e}")
        return False

if __name__ == "__main__":
    success = download()
    sys.exit(0 if success else 1)
