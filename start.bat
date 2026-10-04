@echo off
REM ============================================================
REM 华农心晴导航 - 一键启动面板（Windows）
REM ============================================================
REM 主路线: Ollama -> Dify(Docker) -> server/dify_proxy.py(8001) -> 应用
REM 推荐顺序: [1] Ollama  ->  [2] Dify  ->  [4] 后端代理  ->  [3]/[5]/[6] 应用
REM 备用路线: 不想装 Docker 时用 [8]（Ollama 直连后端，端口 8000）
REM 用法: 双击运行，或在 PowerShell 执行 .\start.bat
REM ============================================================

echo ============================================================
echo   华农心晴导航 - 启动面板
echo ============================================================
echo.
echo [1] 启动 Ollama 服务 (ollama serve)                ^<- 主路线第 1 步
echo [2] 启动 Dify (Docker)                             ^<- 主路线第 2 步
echo [4] 启动后端代理 (dify_proxy, 端口 8001)           ^<- Web/桌面必需
echo [5] 打开 Web 前端 (浏览器访问 http://localhost:8080)
echo [6] 启动 Electron 桌面应用
echo [3] 启动 CLI 对话
echo [7] 一键启动主路线 (Ollama + Dify + 后端代理 8001)
echo [8] 启动备用后端 (ollama_backend, 端口 8000, 无需 Docker)
echo [0] 退出
echo.

set /p choice=请选择 [0-8]:

if "%choice%"=="1" goto ollama
if "%choice%"=="2" goto dify
if "%choice%"=="3" goto cli
if "%choice%"=="4" goto backend
if "%choice%"=="5" goto web
if "%choice%"=="6" goto electron
if "%choice%"=="7" goto all
if "%choice%"=="8" goto alt
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
set "DIFY_COMPOSE="
if exist "%USERPROFILE%\dify\docker\docker-compose.yaml" set "DIFY_COMPOSE=%USERPROFILE%\dify\docker"
if exist "%~dp0docker\dify\docker\docker-compose.yaml" set "DIFY_COMPOSE=%~dp0docker\dify\docker"
if "%DIFY_COMPOSE%"=="" (
    echo [!] 未找到 Dify 源码，请先执行 docker\一键安装Docker和Dify.bat
) else (
    cd /d "%DIFY_COMPOSE%"
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
echo [*] 启动后端代理 server/dify_proxy.py (http://127.0.0.1:8001)...
cd /d "%~dp0server"
echo [!] 需要先: pip install -r server\requirements.txt
start "心晴导航-后端代理" cmd /c "python -m uvicorn dify_proxy:app --host 127.0.0.1 --port 8001"
echo [+] 后端代理已在新窗口启动
goto end

:alt
echo.
echo [*] 启动备用后端 server/ollama_backend.py (http://127.0.0.1:8000)...
cd /d "%~dp0server"
echo [!] 需要先: pip install -r server\requirements.txt
start "心晴导航-备用后端" cmd /c "python -m uvicorn ollama_backend:app --host 127.0.0.1 --port 8000"
echo [+] 备用后端已在新窗口启动
echo [!] 还需把 web\config.js 的 apiBaseUrl 改为 http://localhost:8000
goto end

:web
echo.
echo [*] 启动 Web 前端...
cd /d "%~dp0web"
echo [!] 请确保已启动 [4] 后端代理 (端口 8001)
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
echo [!] 配置在系统托盘菜单 -> "设置 API 配置" 中填写
call npm.cmd start
goto end

:all
echo.
echo [*] 一键启动主路线...
echo     [1/3] Ollama...
start "Ollama Serve" cmd /c "ollama serve"
timeout /t 4 /nobreak >nul

echo     [2/3] Dify (Docker)...
set "DIFY_COMPOSE="
if exist "%USERPROFILE%\dify\docker\docker-compose.yaml" set "DIFY_COMPOSE=%USERPROFILE%\dify\docker"
if exist "%~dp0docker\dify\docker\docker-compose.yaml" set "DIFY_COMPOSE=%~dp0docker\dify\docker"
if "%DIFY_COMPOSE%"=="" (
    echo     [!] 未找到 Dify 源码，跳过（可稍后手动执行 docker\一键安装Docker和Dify.bat）
) else (
    pushd "%DIFY_COMPOSE%"
    docker compose up -d
    popd
)

echo     [3/3] 后端代理 (8001)...
cd /d "%~dp0server"
start "心晴导航-后端代理" cmd /c "python -m uvicorn dify_proxy:app --host 127.0.0.1 --port 8001"
timeout /t 3 /nobreak >nul
echo.
echo [+] 主路线已启动完毕！
echo     - Ollama:      http://localhost:11434
echo     - Dify:        http://localhost
echo     - 后端代理:     http://127.0.0.1:8001
echo     - Web 前端:    双击 start.bat 选 [5]  （或 cd web ^&^& python -m http.server 8080）
echo     - 桌面应用:    cd desktop ^&^& npm.cmd start
echo     - CLI:        cd cli ^&^& python cli.py
goto end

:end
echo.
pause
