﻿<#
  华农心晴导航 —— Docker Desktop + Dify 一键安装脚本（需要管理员权限）

  用法：
    1) 右键「一键安装Docker和Dify.bat」→「以管理员身份运行」
    2) 或在【管理员 PowerShell】中执行：
       powershell -NoProfile -ExecutionPolicy Bypass -File install-docker.ps1

  说明：
    - 幂等，可重复运行；已完成的步骤自动跳过。
    - Windows 11 家庭版不支持 Hyper-V，只能使用 WSL2 后端。
    - 若启用了 WSL2 组件，需要重启一次；重启后再次运行本脚本即可继续。
#>

$ErrorActionPreference = 'Continue'
$root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$installer = Join-Path $root 'DockerDesktopInstaller.exe'
$difyZip   = Join-Path $root 'dify-src.zip'
$wslMsix   = Join-Path $root 'wsl-msixbundle.msixbundle'
$env:WSL_UTF8 = '1'   # 让 wsl.exe 以 UTF-8 输出，避免乱码

function Step($m) { Write-Host "`n===== $m =====" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Info($m) { Write-Host "  [*]  $m" }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }

# 静默执行原生命令，只取退出码（避免 stderr 干扰）
function Test-WslReady {
    $null = cmd /c "wsl --status 2>nul"
    return ($LASTEXITCODE -eq 0)
}

# ---------- 0. 管理员检查（非管理员则自动提权） ----------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Warn '当前不是管理员，正在请求提权（会弹出 UAC 窗口，请点「是」）...'
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
        '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`""
    )
    exit
}

# 全程写入日志，便于排查
$logFile = Join-Path $root 'install-log.txt'
try { Start-Transcript -Path $logFile -Force | Out-Null } catch { }

Step '0/6 环境检查'
Ok "当前用户: $env:USERNAME（管理员）"
$os = (Get-CimInstance Win32_OperatingSystem).Caption
Info "系统: $os"

$dockerExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
$dockerBin = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'
$dockerCli = Join-Path $dockerBin 'docker.exe'
$needReboot = $false

# ---------- 1. 启用 / 安装 WSL2 ----------
Step '1/6 启用并安装 WSL2（家庭版唯一可行的容器后端）'
foreach ($f in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')) {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $f).State
    if ($state -ne 'Enabled') {
        Info "正在启用 Windows 功能: $f ..."
        $null = cmd /c "dism.exe /online /enable-feature /featurename:$f /all /norestart"
        $needReboot = $true
    } else {
        Ok "$f 已启用"
    }
}

if (Test-WslReady) {
    Ok 'WSL 已就绪'
} else {
    # 优先使用本地离线安装包（国内网络下 wsl --install 常卡住，离线更可靠）
    if (Test-Path $wslMsix) {
        Info '检测到本地离线 WSL 安装包，优先离线安装 ...'
        Info '  （约 680MB，安装过程无输出属正常，请耐心等 1-3 分钟）'
        try {
            Add-AppxPackage -Path $wslMsix -ErrorAction Stop
            Ok 'WSL 离线包安装完成'
        } catch {
            Warn "WSL 离线包安装失败: $($_.Exception.Message)"
        }
    }
    # 离线包不存在或失败时，回退到官方在线安装
    if (-not (Test-WslReady)) {
        Info '正在通过 wsl --install 在线安装 WSL 组件 ...'
        wsl --install --no-distribution
        if ($LASTEXITCODE -ne 0) {
            Warn "wsl --install 退出码 = $LASTEXITCODE，尝试改用 GitHub 下载源 ..."
            wsl --update --web-download
        }
    }
    if (Test-WslReady) {
        Ok 'WSL 已就绪'
    } else {
        Warn 'WSL 仍未就绪 —— 通常需要重启一次才能生效'
        $needReboot = $true
    }
}

# ---------- 2. 安装 Docker Desktop ----------
Step '2/6 安装 Docker Desktop'
if (Test-Path $dockerExe) {
    Ok 'Docker Desktop 已安装，跳过'
} else {
    if (-not (Test-Path $installer)) { throw "找不到安装包: $installer" }
    Info '正在静默安装，约需 3-8 分钟，请勿关闭窗口 ...'
    $p = Start-Process -FilePath $installer `
         -ArgumentList @('install', '--quiet', '--accept-license', '--backend=wsl-2') `
         -Wait -PassThru
    if ($p.ExitCode -eq 0) { Ok 'Docker Desktop 安装完成' }
    else { Warn "安装器退出码 = $($p.ExitCode)（若 Docker 仍能启动可忽略）" }
}

try {
    Add-LocalGroupMember -Group 'docker-users' -Member $env:USERNAME -ErrorAction SilentlyContinue
    Ok '已将当前用户加入 docker-users 组'
} catch { }

# 把 docker 命令加入当前会话 PATH
if (Test-Path $dockerCli) { $env:Path = "$dockerBin;$env:Path" }

# ---------- 3. 重启判断 ----------
if ($needReboot) {
    Step '3/6 需要重启系统'
    Warn 'WSL2 组件刚刚安装/启用，必须重启后 Docker 才能正常工作。'
    Warn '重启完成后，请【再次右键 → 以管理员身份运行】本脚本，会自动继续。'
    try { Stop-Transcript | Out-Null } catch { }
    Read-Host '按回车键立即重启（直接关闭窗口则稍后自行重启）'
    Restart-Computer -Force
    exit
}
Step '3/6 无需重启'

# ---------- 4. 启动 Docker 并等待引擎就绪 ----------
Step '4/6 启动 Docker Desktop'
if (Test-Path $dockerExe) { Start-Process $dockerExe }
Info '等待 Docker 引擎就绪（最多 5 分钟，期间无输出属正常）...'
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 5
    $null = cmd /c "`"$dockerCli`" info >nul 2>nul"
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    if ((($i + 1) % 6) -eq 0) { Info ("  仍在等待 Docker 引擎... 已 {0} 秒" -f (($i + 1) * 5)) }
}
if (-not $ok) {
    Warn 'Docker 引擎未能就绪。常见原因：'
    Warn '  1) WSL2 尚未生效 → 重启后重新运行本脚本'
    Warn '  2) 首次启动需要长时间初始化 → 手动打开 Docker Desktop 等它跑完再运行本脚本'
    try { Stop-Transcript | Out-Null } catch { }
    Read-Host '按回车键退出'
    exit 1
}
Ok 'Docker 引擎已就绪'

# ---------- 5. 准备 Dify 源码 ----------
Step '5/6 准备 Dify 源码'
$difyDir    = Join-Path $root 'dify'
$composeDir = Join-Path $difyDir 'docker'
$compose    = Join-Path $composeDir 'docker-compose.yaml'

if (-not (Test-Path $compose)) {
    if (-not (Test-Path $difyZip)) {
        Info '本地没有源码包，正在下载（约 5-30 MB）...'
        curl.exe -L -C - --retry 20 --retry-delay 5 --retry-all-errors -o $difyZip `
            "https://gh-proxy.com/https://github.com/langgenius/dify/archive/refs/heads/main.zip"
    }

    if (Test-Path $difyZip) {
        Info '正在解压 Dify 源码包 ...'
        $tmp = Join-Path $root '_dify_tmp'
        if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
        Expand-Archive -Path $difyZip -DestinationPath $tmp -Force
        $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
        if (Test-Path $difyDir) { Remove-Item $difyDir -Recurse -Force }
        Move-Item $inner.FullName $difyDir
        Remove-Item $tmp -Recurse -Force
    }
}

if (-not (Test-Path $compose)) {
    Warn 'Dify 源码准备失败，请检查网络后重试。'
    try { Stop-Transcript | Out-Null } catch { }
    Read-Host '按回车键退出'
    exit 1
}
Ok 'Dify 源码已就绪'

# ---------- 6. 部署 Dify ----------
Step '6/6 部署 Dify'
if (-not (Test-Path (Join-Path $composeDir '.env'))) {
    Copy-Item (Join-Path $composeDir '.env.example') (Join-Path $composeDir '.env')
    Ok '已从 .env.example 生成 .env'
}

Push-Location $composeDir
Info '正在拉取镜像并启动容器（首次约 10-20 分钟，取决于网速）...'
docker compose up -d
$code = $LASTEXITCODE
Pop-Location
if ($code -eq 0) { Ok 'Dify 容器已启动' } else { Warn "docker compose 退出码 = $code" }

Step '全部完成'
Ok 'Dify 已启动，浏览器访问: http://localhost'
Write-Host ''
Write-Host '  首次进入请设置管理员账号。' -ForegroundColor Green
Write-Host '  接入本地 Ollama 模型：' -ForegroundColor Green
Write-Host '    Dify 控制台 → 设置 → 模型供应商 → Ollama' -ForegroundColor Green
Write-Host '    Base URL 填: http://host.docker.internal:11434' -ForegroundColor Green
Write-Host '    Model name 填: qwen2.5:7b' -ForegroundColor Green
Write-Host ''
try { Stop-Transcript | Out-Null } catch { }
Info "完整日志: $logFile"
Read-Host '按回车键关闭'
