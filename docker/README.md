# docker —— Docker Desktop + Dify 自部署辅助

本目录是**环境安装辅助脚本**，不包含 Dify 源码（`docker/dify/` 为第三方官方源码，体积大，已在 `.gitignore` 排除，需自行 clone）。

## 一键安装

1. 双击 `一键安装Docker和Dify.bat`，在 UAC 弹窗点「是」；
2. 脚本会（幂等，可重复运行）：启用 WSL2 → 安装 Docker Desktop → 拉取 Dify 源码 → 拉起容器；
3. Windows 11 家庭版无 Hyper-V，只能走 WSL2 后端；若启用了 WSL2 组件需重启一次，重启后再跑一遍即可。

安装日志见 `install-log.txt`。

## 文件

| 文件 | 说明 |
|------|------|
| `一键安装Docker和Dify.bat` | 入口：申请管理员权限后调用安装脚本 |
| `install-docker.ps1` | 安装主体：WSL2 + Docker Desktop + Dify，幂等 |
| `pull-images.ps1` | 第一轮拉镜像：8 个镜像 × 最多 8 次重试（网络差时先跑） |
| `pull-images2.ps1` | 第二轮补拉：5 个核心镜像 × 最多 60 次重试，专治网络抖动 |
| `install-log.txt` | 最近一次安装日志（输出产物） |

> 手动补拉镜像可任选其一执行：
> `powershell -NoProfile -ExecutionPolicy Bypass -File pull-images.ps1`
