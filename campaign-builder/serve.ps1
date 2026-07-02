# Chạy campaign-builder qua HTTP (tránh lỗi CORS origin null khi mở file://)
# Usage: .\serve.ps1
$port = 5500
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Campaign Builder: http://localhost:$port" -ForegroundColor Green
Set-Location $root
python -m http.server $port
