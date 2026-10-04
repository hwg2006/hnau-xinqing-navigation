# ============================================================
# 拉取 Dify 自部署所需镜像（第二轮：每镜像最多重试 60 次，适合弱网长跑）
# 用途：第一轮仍有失败镜像时兜底重试，失败不中断其余镜像
# 用法：powershell -ExecutionPolicy Bypass -File docker\pull-images2.ps1
# ============================================================
$ErrorActionPreference = 'Continue'
$imgs = @(
  'pgvector/pgvector:pg16',
  'langgenius/dify-web:1.17.1',
  'langgenius/dify-api:1.17.1',
  'langgenius/dify-agent-backend:1.17.1',
  'langgenius/dify-agent-local-sandbox:1.17.1'
)
foreach ($i in $imgs) {
  $ok = $false
  for ($n = 1; $n -le 60 -and -not $ok; $n++) {
    Write-Host ("=== PULL {0} #{1} ===" -f $i, $n)
    docker pull $i
    if ($LASTEXITCODE -eq 0) {
      $ok = $true
      Write-Host ("=== OK {0} (attempt {1}) ===" -f $i, $n)
    } else {
      Start-Sleep -Seconds 3
    }
  }
  if (-not $ok) { Write-Host ("=== STILL_FAILED {0} ===" -f $i) }
}
Write-Host "ROUND2_DONE"
