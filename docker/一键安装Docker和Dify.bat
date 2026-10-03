@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM ============================================================
REM  华农心晴导航 - 一键安装 Docker Desktop + Dify
REM  用法: 双击本文件，在 UAC 弹窗中点「是」
REM ============================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   正在申请管理员权限，请在弹出的 UAC 窗口点「是」...
    echo   （如果没弹出，请看同目录 install-log.txt 或改用管理员终端手动执行）
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath \"%~f0\" -Verb RunAs"
    exit /b
)

echo   已获得管理员权限，开始安装...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-docker.ps1"

echo.
echo   ------------------------------------------------------------
echo   安装窗口即将结束，完整日志见: %~dp0install-log.txt
echo   ------------------------------------------------------------
pause
