# ============================================================
# 拉取 Dify 自部署所需镜像（第一轮：每镜像最多重试 8 次）
# 用途：网络不稳时批量重试，失败不中断其余镜像
# 用法：powershell -ExecutionPolicy Bypass -File docker\pull-images.ps1
# ============================================================
$ErrorActionPreference = 'Continue'
$imgs = @(
  'pgvector/pgvector:pg16',
  'postgres:15-alpine',
  'busybox:latest',
  'nginx:latest',
  'langgenius/dify-web:1.17.1',
  'langgenius/dify-api:1.17.1',
  'langgenius/dify-agent-backend:1.17.1',
  'langgenius/dify-agent-local-sandbox:1.17.1'
)
foreach ($i in $imgs) {
  $ok = $false
  for ($n = 1; $n -le 8 -and -not $ok; $n++) {
    Write-Host ("==== PULL {0} attempt {1} ====" -f $i, $n)
    docker pull $i
    if ($LASTEXITCODE -eq 0) {
      $ok = $true
      Write-Host ("==== OK {0} ====" -f $i)
    } else {
      Write-Host ("---- retry {0} ----" -f $i)
      Start-Sleep -Seconds 5
    }
  }
  if (-not $ok) { Write-Host ("==== FAILED {0} ====" -f $i) }
}
Write-Host "ALL_PULL_DONE"
