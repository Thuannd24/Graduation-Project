#requires -Version 5.1
<#
.SYNOPSIS
  Chạy check sau khi sửa code.
.PARAMETER Fast
  Chỉ chạy compile/lint nhanh (vòng lặp sửa code). Bỏ qua => chạy full test.
.NOTES
  Detect theo file đặc trưng cho đơn giản (không parse YAML). Preset java-spring/node
  có thể ghi đè bằng cách sửa trực tiếp file này trong project nếu cần.
#>
param(
  [switch]$Fast
)
$ErrorActionPreference = "Continue"

function Invoke-Step {
  param([string]$Label, [scriptblock]$Block)
  Write-Host ">> $Label" -ForegroundColor Cyan
  & $Block
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Check FAILED at: $Label (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Write-Host "Running agent checks (Fast=$Fast)..." -ForegroundColor Cyan

if (Test-Path "pom.xml") {
  if ($Fast) { Invoke-Step "mvn compile"      { mvn -q -DskipTests compile } }
  else       { Invoke-Step "mvn test"          { mvn test } }
}
elseif ((Test-Path "build.gradle") -or (Test-Path "build.gradle.kts")) {
  if ($Fast) { Invoke-Step "gradle compileJava" { .\gradlew compileJava } }
  else       { Invoke-Step "gradle test"         { .\gradlew test } }
}
elseif (Test-Path "package.json") {
  if ($Fast) { Invoke-Step "npm lint" { npm run lint --if-present } }
  else       { Invoke-Step "npm test" { npm test } }
}
else {
  Write-Host "No known build/test command detected." -ForegroundColor Yellow
  Write-Host "Configure .agent/scripts/agent-check.ps1 for this project." -ForegroundColor Yellow
  exit 0
}

Write-Host "Agent check completed." -ForegroundColor Green
