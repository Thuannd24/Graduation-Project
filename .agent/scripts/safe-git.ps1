#requires -Version 5.1
<#
.SYNOPSIS
  Wrapper git chặn các lệnh phá hủy (always_block trong policy.yml).
  Dùng: .\safe-git.ps1 status   |   .\safe-git.ps1 diff
.NOTES
  Đây chỉ là lớp tiện ích. Cưỡng chế thật sự nên đặt ở PreToolUse hook của Claude Code
  (xem docs/safety-rules.md) vì agent có thể gọi git trực tiếp, không qua wrapper này.
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$GitArgs
)
$ErrorActionPreference = "Stop"

$joined = ($GitArgs -join " ").ToLower()

$blocked = @(
  @{ pattern = "reset\s+.*--hard"; msg = "git reset --hard bị chặn." },
  @{ pattern = "clean\s+.*-[a-z]*f";  msg = "git clean -f bị chặn." },
  @{ pattern = "push\s+.*(--force|-f)\b"; msg = "git push --force bị chặn." }
)

foreach ($b in $blocked) {
  if ($joined -match $b.pattern) {
    Write-Host "BLOCKED: $($b.msg)" -ForegroundColor Red
    Write-Host "Nếu thực sự cần, chạy git trực tiếp và tự chịu trách nhiệm." -ForegroundColor Yellow
    exit 1
  }
}

git @GitArgs
exit $LASTEXITCODE
