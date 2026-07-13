# Catalog Import Tool

Công cụ scrape sản phẩm từ **cellphones.com.vn** và import vào DB (attributes, categories, brands, products, variants).

---

## Yêu cầu

| Thứ cần có | Import sản phẩm | Scrape lại dữ liệu mới |
|---|---|---|
| Node.js 18+ | ✅ bắt buộc | ✅ bắt buộc |
| `npm install` | ❌ không cần | ✅ cần (dùng `cheerio`) |
| Project đang chạy | ✅ bắt buộc | ❌ không cần |
| ADMIN_TOKEN | ✅ bắt buộc | ❌ không cần |

---

## Cấu trúc file

```
catalog-import/
├── scrape-cellphones.mjs       # Scraper (crawl sản phẩm từ cellphones.com.vn)
├── import.mjs                  # Importer (gửi JSON lên API → ghi DB)
├── update-cat-brand-icons.mjs  # Cập nhật icon danh mục + logo brand
├── .env                        # Cấu hình API_BASE_URL + ADMIN_TOKEN (không commit)
├── .env.example                # Mẫu cấu hình
└── manifests/                  # File JSON đã scrape sẵn — dùng để import ngay
    ├── iphone.json
    ├── samsung-phone.json
    ├── xiaomi-phone.json
    ├── oppo-phone.json
    ├── dien-thoai.json
    ├── laptop.json
    ├── tablet.json
    ├── tai-nghe.json
    ├── tai-nghe-bt.json
    ├── loa.json
    ├── dong-ho.json
    ├── may-anh.json
    ├── phu-kien.json
    ├── op-lung.json
    ├── sac-cap.json
    ├── pin-du-phong.json
    ├── man-hinh.json
    ├── may-tinh-de-ban.json
    └── tivi.json
```

> Mỗi file JSON chứa đầy đủ: **attributes, categoryAttributes, brands, products, variants** — import 1 file là đủ cho cả danh mục đó.

---

## Import sản phẩm vào DB (máy chưa cài gì)

Chỉ cần **Node.js 18+**, không cần `npm install`.

### Bước 1 — Lấy ADMIN_TOKEN

Đăng nhập admin tại `http://localhost:3000` → F12 → Application → Local Storage → lấy `access_token`.

Hoặc copy từ Keycloak admin console → Users → admin → Sessions.

### Bước 2 — Truncate DB (xóa dữ liệu cũ)

```bash
docker exec -i infra-mariadb mariadb -u root -proot ecommerce_product_db -e "
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE variant_option_values;
TRUNCATE TABLE product_variants;
TRUNCATE TABLE product_images;
TRUNCATE TABLE product_tags;
TRUNCATE TABLE products;
TRUNCATE TABLE brand_categories;
TRUNCATE TABLE brands;
TRUNCATE TABLE category_attributes;
TRUNCATE TABLE categories;
TRUNCATE TABLE attributes;
SET FOREIGN_KEY_CHECKS=1;
"
```

### Bước 3 — Import từng danh mục

> Token hết hạn sau **15 phút** — lấy token mới nếu bị lỗi 401.

```powershell
# Windows PowerShell — set token vào .env trước:
# API_BASE_URL=http://localhost:8080/api/v1
# ADMIN_TOKEN=eyJ...

node import.mjs --file manifests/iphone.json        --apply
node import.mjs --file manifests/samsung-phone.json --apply
node import.mjs --file manifests/xiaomi-phone.json  --apply
node import.mjs --file manifests/oppo-phone.json    --apply
node import.mjs --file manifests/dien-thoai.json    --apply
node import.mjs --file manifests/laptop.json        --apply
node import.mjs --file manifests/tablet.json        --apply
node import.mjs --file manifests/tai-nghe-bt.json   --apply
node import.mjs --file manifests/loa.json           --apply
node import.mjs --file manifests/tai-nghe.json      --apply
node import.mjs --file manifests/may-anh.json       --apply
node import.mjs --file manifests/dong-ho.json       --apply
node import.mjs --file manifests/op-lung.json       --apply
node import.mjs --file manifests/sac-cap.json       --apply
node import.mjs --file manifests/pin-du-phong.json  --apply
node import.mjs --file manifests/phu-kien.json      --apply
node import.mjs --file manifests/may-tinh-de-ban.json --apply
node import.mjs --file manifests/man-hinh.json      --apply
node import.mjs --file manifests/tivi.json          --apply
```

### Bước 4 — Cập nhật icon danh mục + logo brand

```powershell
node update-cat-brand-icons.mjs --token eyJ...
```

### Bước 5 — Flush Redis cache

```bash
docker exec -i infra-redis redis-cli FLUSHDB
```

---

## Scrape lại dữ liệu mới từ cellphones.com.vn

Cần chạy `npm install` trước (lần đầu):

```bash
npm install
```

### Scrape tất cả danh mục (mặc định → `manifests/`)

```bash
node scrape-cellphones.mjs --per-category
```

### Scrape 1 danh mục cụ thể

```bash
node scrape-cellphones.mjs --category laptop --limit 150 --out manifests/laptop.json
```

Sau khi scrape xong → thực hiện lại **Bước 2 → 5**.

---

## Validate trước khi import (không ghi DB)

```bash
node import.mjs --file manifests/laptop.json
```

---

## Cấu hình (.env)

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
# Sửa ADMIN_TOKEN
```

```env
API_BASE_URL=http://localhost:8080/api/v1
ADMIN_TOKEN=eyJ...
```
