# ============================================================
# 华农心晴导航 - 一键环境安装脚本
# ============================================================
# 在你自己的 PowerShell (非沙盒) 里运行:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# 或直接右键用 PowerShell 运行
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

function Ask($msg) {
    $r = Read-Host "$msg (Y/n)"
    return ($r -ne "n" -and $r -ne "N")
}

function Step($num, $title) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  步骤 $num: $title" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║     华农心晴导航 - 一键环境安装                            ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "需要安装 (按顺序): Ollama → 模型 → Docker → Dify → Electron"
Write-Host "预计耗时: 30-60 分钟 (取决于网速)"
Write-Host ""

# ============================================================
Step 1 "安装 Ollama 本地大模型运行时"
# ============================================================
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCmd) {
    Write-Host "✓ Ollama 已安装: $($ollamaCmd.Source)" -ForegroundColor Green
    & ollama --version
} else {
    Write-Host "正在从 ollama.com 安装..." -ForegroundColor Yellow
    if (Ask "安装 Ollama") {
        irm https://ollama.com/install.ps1 | iex
        Write-Host "✓ Ollama 安装脚本执行完毕" -ForegroundColor Green
    }
}

# ============================================================
Step 2 "下载中文模型 qwen2.5:7b (~4.7GB)"
# ============================================================
$hasModel = (ollama list 2>$null | Select-String "qwen2.5:7b" -Quiet) -eq $true
if ($hasModel) {
    Write-Host "✓ qwen2.5:7b 已下载" -ForegroundColor Green
} else {
    if (Ask "拉取 qwen2.5:7b 模型") {
        Write-Host "下载中... 约 4.7GB，请耐心等待" -ForegroundColor Yellow
        ollama pull qwen2.5:7b
        Write-Host "✓ 模型下载完成" -ForegroundColor Green
    }
}

# 启动 Ollama 服务
if (Get-Process -Name "ollama" -ErrorAction SilentlyContinue) {
    Write-Host "✓ Ollama 服务已在运行" -ForegroundColor Green
} else {
    Write-Host "启动 Ollama 服务..." -ForegroundColor Yellow
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 验证
Write-Host ""
Write-Host "测试 Ollama 连通性..." -ForegroundColor Yellow
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
    if ($resp.StatusCode -eq 200) {
        Write-Host "✓ Ollama API 正常 (http://localhost:11434)" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Ollama API 未响应，请手动执行: ollama serve" -ForegroundColor Red
}

# ============================================================
Step 3 "验证 Python 依赖"
# ============================================================
try {
    python -c "import requests, dotenv, rich, fastapi, uvicorn, pydantic; print('  ✓ 所有 Python 依赖已就绪')"
} catch {
    Write-Host "安装 Python 依赖..." -ForegroundColor Yellow
    pip install --user requests python-dotenv rich prompt-toolkit fastapi 'uvicorn[standard]' pydantic
}

# 测试 Ollama 模型
if (Ask "测试 Ollama 模型对话?") {
    Write-Host ""
    python "$ProjectDir\cli\test_ollama.py" --test
}

# ============================================================
Step 4 "安装 Docker Desktop"
# ============================================================
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
    Write-Host "✓ Docker 已安装" -ForegroundColor Green
    docker version --format "  {{.Server.Version}}" 2>$null
    if (-not $?) {
        Write-Host "⚠ Docker 守护进程未启动，请打开 Docker Desktop" -ForegroundColor Yellow
    }
} else {
    Write-Host "Docker 未安装。" -ForegroundColor Yellow
    Write-Host "  下载地址: https://www.docker.com/products/docker-desktop/" -ForegroundColor White
    Write-Host "  安装后重启电脑，再运行此脚本" -ForegroundColor White
    if (Ask "现在跳过 Docker? (之后可以用 Ollama 直连方案代替)") {
        Write-Host "跳过 Docker，继续" -ForegroundColor Yellow
    } else {
        Write-Host "请安装 Docker Desktop 后重新运行此脚本" -ForegroundColor Red
        pause
        exit 1
    }
}

# ============================================================
Step 5 "部署 Dify (可选，需要 Docker)"
# ============================================================
$difyDir = "$env:USERPROFILE\dify"
if (Test-Path "$difyDir\docker\docker-compose.yaml") {
    Write-Host "✓ Dify 源码已存在: $difyDir" -ForegroundColor Green
} elseif ($dockerCmd -and (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
    if (Ask "克隆 Dify 源码并启动? (跳过则用 Ollama 直连方案)") {
        Write-Host "克隆 Dify..." -ForegroundColor Yellow
        git clone https://github.com/langgenius/dify.git $difyDir 2>&1 | Select-Object -Last 3
        Write-Host "启动 Dify..." -ForegroundColor Yellow
        Set-Location "$difyDir\docker"
        docker compose up -d 2>&1 | Select-Object -Last 5
        Write-Host ""
        Write-Host "✓ Dify 启动中 (首次拉镜像可能需要几分钟)" -ForegroundColor Green
        Write-Host "  浏览器访问 http://localhost 创建管理员账号" -ForegroundColor White
    }
} else {
    Write-Host "⚠ Docker 未就绪，跳过 Dify 部署" -ForegroundColor Yellow
    Write-Host "  可用 Ollama 直连后端作为替代: cd cli && uvicorn ollama_backend:app --port 8000" -ForegroundColor White
}

# ============================================================
Step 6 "安装 Electron 桌面依赖"
# ============================================================
Set-Location "$ProjectDir\desktop"
if (-not (Test-Path "node_modules")) {
    Write-Host "首次安装 Electron 依赖 (需要几分钟，Electron 包较大)..." -ForegroundColor Yellow
    npm.cmd install
}

$electronExe = "node_modules\electron\dist\electron.exe"
if (Test-Path $electronExe) {
    Write-Host "✓ Electron 已就绪" -ForegroundColor Green
} else {
    Write-Host "下载 Electron 二进制..." -ForegroundColor Yellow
    node node_modules/electron/install.js 2>&1 | Select-Object -Last 5
    if (Test-Path $electronExe) {
        Write-Host "✓ Electron 下载完成" -ForegroundColor Green
    } else {
        Write-Host "⚠ Electron 二进制下载失败" -ForegroundColor Red
        Write-Host "  手动: cd desktop && npm.cmd install && node node_modules/electron/install.js" -ForegroundColor White
    }
}
Set-Location $ProjectDir

# ============================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  ✓ 环境安装完成！" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "启动方式:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  CLI 对话:       cd cli && python cli.py" -ForegroundColor White
Write-Host "  Web 前端:       cd web && python -m http.server 8080" -ForegroundColor White
Write-Host "  Electron 桌面:  cd desktop && npm.cmd start" -ForegroundColor White
Write-Host "  Ollama 直连:    cd cli && uvicorn ollama_backend:app --port 8000 --reload" -ForegroundColor White
Write-Host "  一键面板:       双击 start.bat" -ForegroundColor White
Write-Host ""
Write-Host "首次使用注意:" -ForegroundColor Yellow
Write-Host "  1. 编辑 web\config.js 填入 Dify API Key" -ForegroundColor White
Write-Host "  2. 编辑 config\.env (从 .env.example 复制) 填入 Dify API Key" -ForegroundColor White
Write-Host "  3. Electron 桌面内: 系统托盘 → 设置 API 配置" -ForegroundColor White
Write-Host ""
pause
