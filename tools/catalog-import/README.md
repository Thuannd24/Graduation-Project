# Catalog Import Tool

Pipeline import dữ liệu lớn vào **product-service** với validate quan hệ đầy đủ (category → brand → product → variant).

> **Mặc định DRY-RUN** — chỉ kiểm tra, **không ghi DB** cho đến khi bạn chạy `--apply`.

## Cấu trúc

```
tools/catalog-import/
├── import.mjs                 # CLI chính (validate / import)
├── generate-manifest.mjs      # Sinh manifest lớn (200, 500, 1000 SP...)
├── csv-to-manifest.mjs        # CSV → JSON manifest
├── data/
│   └── sample-manifest.json   # Mẫu nhỏ (3 SP + đủ quan hệ)
├── templates/csv/             # Template CSV cho Excel
└── reports/                   # Báo cáo sau mỗi lần chạy
```

## Thứ tự import (tự động)

1. Attributes (`code`)
2. Categories (`slug`, `parentSlug`)
3. Category ↔ Attribute links
4. Brands (`slug`, `categorySlugs`)
5. Products (`slug`, `categorySlug`, `brandSlug`, `specs`, `variants`, `tags`, `images`)

Upsert theo **slug / code / sku** — chạy lại không duplicate.

## Cách dùng

### Bước 1 — Chuẩn bị BE

Rebuild `product-service` + `api-gateway` (endpoint mới):

```
POST /api/v1/admin/import/catalog?dryRun=true   ← mặc định
POST /api/v1/admin/import/catalog?dryRun=false  ← ghi DB
```

Yêu cầu role **ROLE_ADMIN**.

### Dữ liệu mẫu 100 sản phẩm (realistic demo)

File sẵn: **`data/catalog-100.json`**

| Thành phần | Số lượng |
|------------|----------|
| Sản phẩm | 100 |
| Danh mục | 18 (cây category kiểu ecommerce VN) |
| Thương hiệu | 20 (kèm logo Clearbit) |
| Biến thể (SKU) | ~389 |
| Thuộc tính | 12 (RAM, màu, CPU, pin...) |

Mỗi sản phẩm gồm: tên, mô tả, giá/giá sale, specs, tags, bảo hành, ảnh chính + gallery 3 ảnh, variants (màu/dung lượng).

```powershell
# Tạo lại file 100 SP
npm run generate:100

# Validate (dry-run, không ghi DB)
npm run validate:100

# Import thật (khi sẵn sàng + có ADMIN_TOKEN)
npm run import:100
```

### Bước 2 — Validate (không ghi DB)

```powershell
cd tools/catalog-import
copy .env.example .env
node import.mjs --file data/sample-manifest.json
```

### Bước 3 — Sinh dữ liệu lớn (synthetic)

```powershell
node generate-manifest.mjs --count 500 --out data/generated-manifest.json
node import.mjs --file data/generated-manifest.json
```

### Bước 4 — Import thật (khi sẵn sàng)

1. Đăng nhập admin Keycloak, lấy JWT
2. Điền `ADMIN_TOKEN` vào `.env`
3. Chạy:

```powershell
node import.mjs --file data/generated-manifest.json --apply
```

### Import từ CSV (Excel)

1. Điền file trong `templates/csv/`
2. Convert:

```powershell
node csv-to-manifest.mjs --dir templates/csv --out data/from-csv-manifest.json
node import.mjs --file data/from-csv-manifest.json
```

## Format manifest JSON

```json
{
  "attributes": [{ "code": "ram", "name": "RAM", "valueType": "select" }],
  "categories": [{ "slug": "laptop", "name": "Laptop", "parentSlug": null }],
  "categoryAttributes": [{ "categorySlug": "laptop", "attributeCode": "ram", "isVariant": false }],
  "brands": [{ "slug": "apple", "name": "Apple", "categorySlugs": ["dien-thoai"] }],
  "products": [{
    "slug": "iphone-demo",
    "name": "iPhone Demo",
    "categorySlug": "iphone",
    "brandSlug": "apple",
    "price": 24990000,
    "salePrice": 23990000,
    "specs": { "battery": "4000mAh" },
    "variants": [{ "sku": "IP-DEN-128", "options": { "color": "Đen", "storage": "128GB" } }],
    "images": ["https://..."],
    "tags": ["hot"]
  }]
}
```

## Quy tắc tránh dữ liệu rời rạc

| Quy tắc | Giải thích |
|---------|------------|
| Dùng `slug` / `code` / `sku` | Không hardcode ID số |
| Import category cha trước con | `parentSlug` phải tồn tại |
| Brand liên kết category | `categorySlugs` phải hợp lệ |
| Spec tĩnh → `specs` | CPU, pin, màn hình |
| Biến thể → `variants[].options` | Màu, dung lượng |
| `sku` unique toàn hệ | Không trùng giữa sản phẩm |
| `salePrice < price` | Validate trước khi ghi |

## Ảnh sản phẩm

- Manifest dùng **URL sẵn có** (`imageUrl`, `images[]`, `variants[].imageUrl`)
- Hoặc upload trước qua Admin: `POST /api/v1/admin/products/images/upload` → MinIO
- Manifest mẫu dùng `picsum.photos` placeholder

## Sau import

- Elasticsearch tự index khi create/update product
- Import **inventory** riêng qua `inventory-service` nếu cần tồn kho

## NPM scripts

```powershell
npm run validate    # dry-run sample-manifest
npm run generate    # sinh 200 SP → data/generated-manifest.json
npm run csv         # CSV → manifest
npm run import      # import thật sample (cần ADMIN_TOKEN)
```
