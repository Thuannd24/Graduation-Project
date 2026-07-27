#requires -Version 5.1
<#
.SYNOPSIS
  Kiểm tra môi trường dev cơ bản. Không thay đổi gì.
#>
$ErrorActionPreference = "Continue"

function Test-Tool {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    Write-Host ("  [ok]   {0,-6} {1}" -f $Name, $cmd.Source)
  } else {
    Write-Host ("  [miss] {0,-6} not found in PATH" -f $Name)
  }
}

Write-Host "Checking environment..." -ForegroundColor Cyan

Test-Tool git
Test-Tool node
Test-Tool npm
Test-Tool java
Test-Tool mvn

Write-Host "Doctor check completed." -ForegroundColor Cyan
$global:LASTEXITCODE = 0
exit 0
