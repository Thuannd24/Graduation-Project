#requires -Version 5.1
<#
.SYNOPSIS
  Sinh context nén bằng repomix để phân tích cấp module.
.NOTES
  Version repomix được PIN để hành vi ổn định. Đổi $RepomixVersion khi muốn nâng.
  Output directory luôn bị loại khỏi scan (qua -i, forward-slash) để tránh bug tự nhúng
  lại output của lần chạy trước khi rerun (repomix 0.2.43 tự loại output file nhưng dùng
  path có backslash trên Windows nên không khớp glob -> tự phình to dần qua mỗi lần chạy).
  .repomixignore không phải lúc nào cũng được áp dụng khi scan cả repo (chỉ chắc chắn hoạt
  động khi có --include scoped); dùng -Ignore để truyền pattern loại trừ chắc chắn có hiệu lực.
#>
param(
  [string]$Path = ".",
  [string]$Output = ".agent/context/context.xml",
  [switch]$Compress = $true,
  [string]$Ignore = ""
)
$ErrorActionPreference = "Stop"

# Pin version thay vì @latest để tránh đổi behavior bất ngờ.
# 0.2.43 là bản 0.2.x mới nhất còn tồn tại trên npm registry.
$RepomixVersion = "0.2.43"

$NpxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
if ($NpxCommand -eq $null) {
  $NpxCommand = Get-Command npx -ErrorAction SilentlyContinue
}

if ($NpxCommand -eq $null) {
  Write-Error "npx not found. Cài Node.js trước hoặc dùng tool pack khác."
  exit 1
}

New-Item -ItemType Directory -Force (Split-Path $Output -Parent) | Out-Null

# Luôn tự loại thư mục chứa output (forward-slash) để không tự nhúng lại output cũ khi rerun.
$OutputDir = (Split-Path $Output -Parent) -replace '\\', '/'
$ignorePatterns = @("$OutputDir/**")
if ($Ignore) { $ignorePatterns += ($Ignore -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

$args = @("--yes", "repomix@$RepomixVersion", $Path, "--output", $Output, "--ignore", ($ignorePatterns -join ","))
if ($Compress) { $args += "--compress" }

Write-Host "Packing context (repomix@$RepomixVersion) from '$Path' ..." -ForegroundColor Cyan
& $NpxCommand.Source @args

if ($LASTEXITCODE -eq 0) {
  if (-not (Test-Path -LiteralPath $Output)) {
    Write-Error "repomix reported success but did not create output file: $Output"
    exit 1
  }
  if ((Get-Item -LiteralPath $Output).Length -eq 0) {
    Write-Error "repomix created an empty output file: $Output"
    exit 1
  }
  Write-Host "Context packed to $Output" -ForegroundColor Green
} else {
  Write-Error "repomix failed (exit $LASTEXITCODE)."
  exit $LASTEXITCODE
}
