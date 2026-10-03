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
