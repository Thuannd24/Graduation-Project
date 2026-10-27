#!/usr/bin/env bash
# Reset database catalog and inventory to baseline main state.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TRUNCATE_ONLY=0
QTY=10
MARIADB_CONTAINER="${MARIADB_CONTAINER:-infra-mariadb}"
MONGO_CONTAINER="${MONGO_CONTAINER:-infra-mongodb}"
REDIS_CONTAINER="${REDIS_CONTAINER:-infra-redis}"

for arg in "$@"; do
  case $arg in
    --truncate-only|-t)
      TRUNCATE_ONLY=1
      shift
      ;;
    --qty=*)
      QTY="${arg#*=}"
      shift
      ;;
    --qty)
      QTY="$2"
      shift 2
      ;;
  esac
done

echo "=========================================================="
echo "  AuraTech - Catalog & Inventory Database Reset to Baseline"
echo "=========================================================="

# 1. Truncate MariaDB ecommerce_product_db
echo -e "\n[1/4] Truncating MariaDB tables in 'ecommerce_product_db'..."
docker exec -i "$MARIADB_CONTAINER" mariadb -u root -proot ecommerce_product_db << 'EOF'
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
EOF
echo "  -> Product catalog tables truncated successfully."

# 2. Truncate MariaDB ecommerce_inventory_db
echo -e "\n[2/4] Truncating MariaDB tables in 'ecommerce_inventory_db'..."
docker exec -i "$MARIADB_CONTAINER" mariadb -u root -proot ecommerce_inventory_db << 'EOF'
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE inventories;
TRUNCATE TABLE inventory_transactions;
SET FOREIGN_KEY_CHECKS=1;
EOF
echo "  -> Inventory tables truncated successfully."

# 3. Flush MongoDB ecommerce_product_nosql
echo -e "\n[3/4] Dropping/flushing MongoDB database 'ecommerce_product_nosql'..."
if docker exec -i "$MONGO_CONTAINER" mongosh ecommerce_product_nosql --eval "db.dropDatabase()" 2>/dev/null; then
  echo "  -> MongoDB 'ecommerce_product_nosql' flushed successfully (mongosh)."
elif docker exec -i "$MONGO_CONTAINER" mongo ecommerce_product_nosql --eval "db.dropDatabase()" 2>/dev/null; then
  echo "  -> MongoDB 'ecommerce_product_nosql' flushed successfully (mongo)."
else
  echo "  [!] Warning: Could not flush MongoDB (container '$MONGO_CONTAINER' might not be running)."
fi

# 4. Flush Redis Cache
echo -e "\n[4/4] Flushing Redis cache..."
if docker exec -i "$REDIS_CONTAINER" redis-cli FLUSHALL; then
  echo "  -> Redis cache flushed successfully."
else
  echo "  [!] Warning: Could not flush Redis (container '$REDIS_CONTAINER' might not be running)."
fi

echo -e "\nDatabase truncation and cache flush completed!"

if [ "$TRUNCATE_ONLY" -eq 1 ]; then
  echo -e "\n[--truncate-only] specified. Skipping data import and inventory seeding."
  exit 0
fi

# 5. Check .env and ADMIN_TOKEN for seeding
echo -e "\n----------------------------------------------------------"
echo "  Seeding Baseline Catalog (manifests/*.json)"
echo "----------------------------------------------------------"

ADMIN_TOKEN=""
if [ -f ".env" ]; then
  ADMIN_TOKEN=$(grep -E '^ADMIN_TOKEN=' .env | cut -d '=' -f2- | tr -d '\r\n')
fi
if [ -z "$ADMIN_TOKEN" ]; then
  ADMIN_TOKEN="${ADMIN_TOKEN:-$ENV_ADMIN_TOKEN}"
fi

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "\n[!] CHƯA CÓ ADMIN_TOKEN trong .env hoặc biến môi trường!"
  echo "    Các bước tiếp theo để hoàn tất phục hồi dữ liệu:"
  echo "    1. Khởi động hệ thống (nếu chưa chạy):"
  echo "       BE: docker-compose -f docker-compose-infra.yml up -d"
  echo "       FE: npm run dev (truy cập http://localhost:3000 hoặc http://localhost:5173)"
  echo "    2. Đăng nhập Admin -> F12 -> Application -> Local Storage -> copy 'access_token'"
  echo "    3. Dán vào tools/catalog-import/.env:"
  echo "       ADMIN_TOKEN=<access_token>"
  echo "    4. Chạy lệnh import và seed tồn kho:"
  echo "       node setup.mjs"
  echo "       node seed-inventory.mjs --qty $QTY"
  echo -e "\nHoặc chạy lại script này sau khi đã điền .env: ./reset-to-main-db.sh"
  exit 0
fi

echo "ADMIN_TOKEN found. Executing catalog setup and inventory seeding..."

# Run setup.mjs
echo -e "\n>> Running: node setup.mjs"
node setup.mjs

# Run seed-inventory.mjs
echo -e "\n>> Running: node seed-inventory.mjs --qty $QTY"
node seed-inventory.mjs --qty "$QTY"

echo "=========================================================="
echo "  Database reset & baseline data seeding COMPLETE!"
echo "=========================================================="
