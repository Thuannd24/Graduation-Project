#requires -Version 5.1
<#
.SYNOPSIS
  PreToolUse hook cho Claude Code: chặn cứng các lệnh phá hủy (always_block của policy.yml).
.DESCRIPTION
  Claude Code gọi hook này trước mỗi Bash tool call, truyền JSON qua stdin:
    { "tool_name": "Bash", "tool_input": { "command": "..." } }
  Nếu lệnh khớp pattern nguy hiểm -> exit 2 (Claude Code sẽ CHẶN tool call và đưa
  lý do ở stderr cho model). Ngược lại exit 0 (cho phép).
.NOTES
  Đây là lớp enforcement THẬT, khác với policy.yml (chỉ là guidance).
#>
$ErrorActionPreference = "Stop"

# Đọc toàn bộ stdin
$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) { exit 0 }

try {
  $payload = $raw | ConvertFrom-Json
} catch {
  # Không parse được -> không chặn (fail-open để tránh kẹt workflow), nhưng báo.
  [Console]::Error.WriteLine("guard-bash: cannot parse hook input; allowing.")
  exit 0
}

$cmd = ""
if ($payload.tool_input -and $payload.tool_input.command) {
  $cmd = [string]$payload.tool_input.command
}
if ([string]::IsNullOrWhiteSpace($cmd)) { exit 0 }

$lc = $cmd.ToLower()

$blocked = @(
  @{ pattern = 'git\s+reset\s+(--hard|.*\s--hard)';      msg = 'git reset --hard' },
  @{ pattern = 'git\s+clean\s+-[a-z]*f';                  msg = 'git clean -f' },
  @{ pattern = 'git\s+push\s+.*(--force\b|-f\b|--force-with-lease)'; msg = 'git push --force' },
  @{ pattern = 'rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r'; msg = 'rm -rf' },
  @{ pattern = 'remove-item\s+.*-recurse.*-force|remove-item\s+.*-force.*-recurse'; msg = 'Remove-Item -Recurse -Force' }
)

foreach ($b in $blocked) {
  if ($lc -match $b.pattern) {
    [Console]::Error.WriteLine("BLOCKED by agent-toolbox: '$($b.msg)' is in always_block (.agent/policy.yml).")
    [Console]::Error.WriteLine("This destructive command is not allowed via the agent. The user must run it manually if truly needed.")
    exit 2
  }
}

exit 0
