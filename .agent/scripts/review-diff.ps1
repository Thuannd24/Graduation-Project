#requires -Version 5.1
<#
.SYNOPSIS
  Hiển thị thay đổi hiện tại của working tree. Read-only.
#>
$ErrorActionPreference = "Continue"

$inside = (git rev-parse --is-inside-work-tree 2>$null)
if ($LASTEXITCODE -ne 0 -or $inside -ne "true") {
  Write-Host "Not inside a git work tree. Nothing to review." -ForegroundColor Yellow
  return
}

Write-Host "Git status:" -ForegroundColor Cyan
git status --short

Write-Host "`nDiff stat:" -ForegroundColor Cyan
git diff --stat

Write-Host "`nDiff:" -ForegroundColor Cyan
git diff
