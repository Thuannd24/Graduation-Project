<#
.SYNOPSIS
    Reset database catalog and inventory to baseline main state.

.DESCRIPTION
    1. Truncates all product & catalog tables in MariaDB (ecommerce_product_db).
    2. Truncates all inventory tables in MariaDB (ecommerce_inventory_db).
    3. Flushes MongoDB database (ecommerce_product_nosql).
    4. Flushes Redis cache (infra-redis).
    5. Optionally runs 'node setup.mjs' and 'node seed-inventory.mjs' using baseline manifests/.

.PARAMETER TruncateOnly
    Skip running setup.mjs and seed-inventory.mjs after truncate.

.PARAMETER Qty
    Initial inventory quantity for each product variant (default: 10).

.PARAMETER MariaDBContainer
    MariaDB container name (default: infra-mariadb).

.PARAMETER MongoContainer
    MongoDB container name (default: infra-mongodb).

.PARAMETER RedisContainer
    Redis container name (default: infra-redis).

.EXAMPLE
    .\reset-to-main-db.ps1
    .\reset-to-main-db.ps1 -TruncateOnly
    .\reset-to-main-db.ps1 -Qty 20
#>

[CmdletBinding()]
param(
    [switch]$TruncateOnly,
    [int]$Qty = 10,
    [string]$MariaDBContainer = "infra-mariadb",
    [string]$MongoContainer = "infra-mongodb",
    [string]$RedisContainer = "infra-redis"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  AuraTech - Catalog & Inventory Database Reset to Baseline" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Truncate MariaDB ecommerce_product_db
Write-Host "`n[1/4] Truncating MariaDB tables in 'ecommerce_product_db'..." -ForegroundColor Yellow
$productSql = @"
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE variant_option_values;
TRUNCATE TABLE product_variants;
TRUNCATE TABLE product_images;
TRUNCATE TABLE product_tags;
TRUNCATE TABLE product_attribute_values;
TRUNCATE TABLE products;
TRUNCATE TABLE brand_categories;
TRUNCATE TABLE brands;
TRUNCATE TABLE category_attributes;
TRUNCATE TABLE categories;
TRUNCATE TABLE attributes;
SET FOREIGN_KEY_CHECKS=1;
"@

try {
    $productSql | docker exec -i $MariaDBContainer mariadb -u root -proot ecommerce_product_db
    Write-Host "  -> Product catalog tables truncated successfully." -ForegroundColor Green
} catch {
    Write-Host "  [!] Error truncating product catalog tables: $_" -ForegroundColor Red
    Write-Host "      Make sure container '$MariaDBContainer' is running." -ForegroundColor Red
    exit 1
}

# 2. Truncate MariaDB ecommerce_inventory_db
Write-Host "`n[2/4] Truncating MariaDB tables in 'ecommerce_inventory_db'..." -ForegroundColor Yellow
$inventorySql = @"
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE inventories;
TRUNCATE TABLE inventory_transactions;
SET FOREIGN_KEY_CHECKS=1;
"@

try {
    $inventorySql | docker exec -i $MariaDBContainer mariadb -u root -proot ecommerce_inventory_db
    Write-Host "  -> Inventory tables truncated successfully." -ForegroundColor Green
} catch {
    Write-Host "  [!] Error truncating inventory tables: $_" -ForegroundColor Red
    exit 1
}

# 3. Flush MongoDB ecommerce_product_nosql
Write-Host "`n[3/4] Dropping/flushing MongoDB database 'ecommerce_product_nosql'..." -ForegroundColor Yellow
try {
    docker exec -i $MongoContainer mongosh ecommerce_product_nosql --eval "db.dropDatabase()" 2>$null
    if ($LASTEXITCODE -ne 0) {
        docker exec -i $MongoContainer mongo ecommerce_product_nosql --eval "db.dropDatabase()" 2>$null
    }
    Write-Host "  -> MongoDB 'ecommerce_product_nosql' flushed successfully." -ForegroundColor Green
} catch {
    Write-Host "  [!] Warning: Could not flush MongoDB (container '$MongoContainer' might not be running)." -ForegroundColor DarkYellow
}

# 4. Flush Redis Cache
Write-Host "`n[4/4] Flushing Redis cache..." -ForegroundColor Yellow
try {
    docker exec -i $RedisContainer redis-cli FLUSHALL
    Write-Host "  -> Redis cache flushed successfully." -ForegroundColor Green
} catch {
    Write-Host "  [!] Warning: Could not flush Redis (container '$RedisContainer' might not be running)." -ForegroundColor DarkYellow
}

Write-Host "`nDatabase truncation and cache flush completed!" -ForegroundColor Green

if ($TruncateOnly) {
    Write-Host "`n[-TruncateOnly] specified. Skipping data import and inventory seeding." -ForegroundColor Cyan
    exit 0
}

# 5. Check .env and ADMIN_TOKEN for seeding
Write-Host "`n----------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Seeding Baseline Catalog (manifests/*.json)" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor Cyan

$envFile = Join-Path $ScriptDir ".env"
$adminToken = $null

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line -split "=", 2
            if ($parts[0].Trim() -eq "ADMIN_TOKEN") {
                $adminToken = $parts[1].Trim()
            }
        }
    }
}

if (-not $adminToken -and $env:ADMIN_TOKEN) {
    $adminToken = $env:ADMIN_TOKEN
}

if (-not $adminToken) {
    Write-Host "`n[!] CHƯA CÓ ADMIN_TOKEN trong .env hoặc biến môi trường!" -ForegroundColor Yellow
    Write-Host "    Các bước tiếp theo để hoàn tất phục hồi dữ liệu:" -ForegroundColor Yellow
    Write-Host "    1. Khởi động hệ thống (nếu chưa chạy):"
    Write-Host "       BE: docker-compose -f docker-compose-infra.yml up -d"
    Write-Host "       FE: npm run dev (truy cập http://localhost:3000 hoặc http://localhost:5173)"
    Write-Host "    2. Đăng nhập Admin -> F12 -> Application -> Local Storage -> copy 'access_token'"
    Write-Host "    3. Dán vào tools/catalog-import/.env:"
    Write-Host "       ADMIN_TOKEN=<access_token>"
    Write-Host "    4. Chạy lệnh import và seed tồn kho:"
    Write-Host "       node setup.mjs"
    Write-Host "       node seed-inventory.mjs --qty $Qty"
    Write-Host "`nHoặc chạy lại script này sau khi đã điền .env: .\reset-to-main-db.ps1" -ForegroundColor Cyan
    exit 0
}

Write-Host "ADMIN_TOKEN found. Executing catalog setup and inventory seeding..." -ForegroundColor Green

# Run setup.mjs
Write-Host "`n>> Running: node setup.mjs" -ForegroundColor Yellow
node setup.mjs

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[!] Setup failed. Check ADMIN_TOKEN expiration or service logs." -ForegroundColor Red
    exit $LASTEXITCODE
}

# Run seed-inventory.mjs
Write-Host "`n>> Running: node seed-inventory.mjs --qty $Qty" -ForegroundColor Yellow
node seed-inventory.mjs --qty $Qty

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[!] Inventory seeding failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  Database reset & baseline data seeding COMPLETE!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
