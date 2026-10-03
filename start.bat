@echo off
REM ============================================================
REM 华农心晴导航 - 一键启动脚本（Windows）
REM ============================================================
REM 前提: 已安装 Ollama + 拉取了 qwen2.5:7b
REM 推荐顺序: [1] 启动 Ollama  ->  [4] 启动后端  ->  [3]/[5]/[6] 任选应用
REM 用法: 双击运行或在 PowerShell 执行 .\start.bat
REM ============================================================

echo ============================================================
echo   华农心晴导航 - 启动面板
echo ============================================================
echo.
echo [1] 启动 Ollama 服务 (ollama serve)  ^<- 必须先启动
echo [2] 启动 Dify (需先装 Docker，可选)
echo [3] 启动 CLI 对话
echo [4] 启动本地后端 (ollama_backend，必需)  ^<- 必须先启动
echo [5] 打开 Web 前端 (浏览器访问)
echo [6] 启动 Electron 桌面应用
echo [7] 一键全部启动 (Ollama + 本地后端)
echo [0] 退出
echo.

set /p choice=请选择 [0-7]:

if "%choice%"=="1" goto ollama
if "%choice%"=="2" goto dify
if "%choice%"=="3" goto cli
if "%choice%"=="4" goto backend
if "%choice%"=="5" goto web
if "%choice%"=="6" goto electron
if "%choice%"=="7" goto all
if "%choice%"=="0" goto end
goto end

:ollama
echo.
echo [*] 启动 Ollama 服务...
start "Ollama Serve" cmd /c "ollama serve"
echo [+] Ollama 已在新窗口启动 (http://localhost:11434)
goto end

:dify
echo.
echo [*] 启动 Dify (Docker)...
if not exist "%USERPROFILE%\dify\docker\docker-compose.yaml" (
    echo [!] 未找到 Dify，先执行:
    echo     git clone https://github.com/langgenius/dify.git %USERPROFILE%\dify
) else (
    cd /d "%USERPROFILE%\dify\docker"
    docker compose up -d
    echo [+] Dify 已启动，浏览器访问 http://localhost
)
goto end

:cli
echo.
echo [*] 启动 CLI 对话...
cd /d "%~dp0cli"
python cli.py
goto end

:backend
echo.
echo [*] 启动本地后端 (http://localhost:8000)...
cd /d "%~dp0cli"
echo [!] 需要先: pip install fastapi uvicorn pydantic requests python-dotenv
start "心晴导航后端" cmd /c "python -m uvicorn ollama_backend:app --host 0.0.0.0 --port 8000"
echo [+] 后端已在新窗口启动 (http://localhost:8000)
goto end

:web
echo.
echo [*] 启动 Web 前端...
cd /d "%~dp0web"
echo [!] 请确保已启动 [1] Ollama 和 [4] 本地后端
start "" http://localhost:8080
python -m http.server 8080
goto end

:electron
echo.
echo [*] 启动 Electron 桌面应用...
cd /d "%~dp0desktop"
if not exist "node_modules\electron" (
    echo [!] 首次运行，正在安装依赖 (需要几分钟)...
    call npm.cmd install
)
echo [!] 配置在系统托盘菜单→"设置 API 配置" 中填写
call npm.cmd start
goto end

:all
echo.
echo [*] 一键启动 Ollama + 本地后端...
start "Ollama Serve" cmd /c "ollama serve"
timeout /t 4 /nobreak >nul
cd /d "%~dp0cli"
start "心晴导航后端" cmd /c "python -m uvicorn ollama_backend:app --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul
echo.
echo [+] 全部服务启动完毕！
echo     - Ollama:     http://localhost:11434
echo     - 本地后端:    http://localhost:8000
echo     - CLI:        cd cli  ^&^&  python cli.py
echo     - Web:        cd web  ^&^&  python -m http.server 8080
echo     - 桌面应用:    cd desktop  ^&^&  npm.cmd start
goto end

:end
echo.
pause
