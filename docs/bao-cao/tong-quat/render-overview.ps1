# Preserve the public renderer entrypoint; the original VPP/XML is the layout source.
param([string]$Folder=$PSScriptRoot)
$ErrorActionPreference='Stop'
$renderer=Join-Path $PSScriptRoot 'render-original-overview.ps1'
$code=Get-Content -LiteralPath $renderer -Raw -Encoding utf8
& ([scriptblock]::Create($code)) -Folder $Folder