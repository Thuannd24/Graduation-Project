# Catalog Import Tool

Công cụ scrape sản phẩm từ **cellphones.com.vn**, mirror ảnh lên Cloudflare R2, và import vào DB (attributes, categories, brands, products, variants, tồn kho).

---

## Cấu trúc file

```
catalog-import/
├── reset-to-main-db.ps1       # ⭐ Script reset DB toàn diện (truncate + flush + setup + seed) trên Windows
├── reset-to-main-db.sh        # ⭐ Script reset DB toàn diện trên Linux / macOS / Bash
├── setup.mjs                  # Lệnh import toàn bộ manifests/*.json + flush Redis
├── seed-inventory.mjs         # Set tồn kho mặc định cho mọi variant (chạy sau setup.mjs)
├── clean-broken-products.mjs  # Dọn sản phẩm không có ảnh thật khỏi manifests/ (chạy sau khi scrape/mirror)
├── scrape-cellphones.mjs      # Scraper (crawl sản phẩm từ cellphones.com.vn) — chỉ cần khi lấy dữ liệu mới
├── mirror-images.mjs          # Mirror ảnh sản phẩm từ site nguồn → Cloudflare R2 — chỉ cần sau khi scrape mới
├── backup-manifests.mjs       # Backup toàn bộ manifests/*.json (dữ liệu text) lên R2
├── import.mjs                 # Import 1 file lẻ (setup.mjs gọi lại cái này cho từng file — dùng riêng khi debug)
├── .env                        # Cấu hình API_BASE_URL + ADMIN_TOKEN + R2 (không commit)
├── .env.example                # Mẫu cấu hình
└── manifests/                  # 19 file JSON chuẩn CellphoneS (~1100 sản phẩm) — catalog gốc của main
```

> Mỗi file JSON chứa đầy đủ: **attributes, categories, categoryAttributes, brands, products, variants** — import 1 file là đủ cho cả danh mục đó (nhưng nên import cả 19 file, vì 1 brand/category có thể xuất hiện ở nhiều file — `setup.mjs` tự làm việc này).

---

## 🆘 Khôi phục / Reset toàn bộ dữ liệu về baseline `main`

Dùng khi: dự án mới build lần đầu, DB bị lệch/bẩn sau các thử nghiệm, hoặc muốn reset catalog demo về trạng thái chuẩn.

### Cách 1: Chạy Script Tự Động Reset (Khuyên Dùng)

Khi Docker infra đang chạy (`infra-mariadb`, `infra-mongodb`, `infra-redis`, cùng backend microservices):

1. **Chuẩn bị cấu hình:**
   ```bash
   cd tools/catalog-import
   cp .env.example .env
   ```
2. **Lấy `ADMIN_TOKEN`:**
   - Đăng nhập admin tại giao diện FE (`http://localhost:3000` hoặc `http://localhost:5173`).
   - Mở Developer Tools (`F12`) → thẻ **Application** → **Local Storage** → copy giá trị `access_token`.
   - Dán vào file `.env`: `ADMIN_TOKEN=<access_token>`.

3. **Chạy script reset:**
   - Trên **Windows (PowerShell)**:
     ```powershell
     .\reset-to-main-db.ps1
     ```
   - Trên **Linux / macOS / Git Bash**:
     ```bash
     chmod +x reset-to-main-db.sh
     ./reset-to-main-db.sh
     ```

Script sẽ tự động:
1. **TRUNCATE** toàn bộ các bảng trong `ecommerce_product_db` (MariaDB):
   `variant_option_values`, `product_variants`, `product_images`, `product_tags`, `product_attribute_values`, `products`, `brand_categories`, `brands`, `category_attributes`, `categories`, `attributes`.
2. **TRUNCATE** các bảng tồn kho trong `ecommerce_inventory_db` (MariaDB):
   `inventories`, `inventory_transactions`.
3. **Drop / Flush** MongoDB database `ecommerce_product_nosql`.
4. **FLUSHALL** Redis cache (`infra-redis`).
5. **Import & Seed:** Chạy `node setup.mjs` (nạp 19 file JSON từ `manifests/`) và `node seed-inventory.mjs --qty 10`.

> **Chỉ muốn truncate sạch DB & flush cache (không chạy import/seed ngay):**
> ```powershell
> .\reset-to-main-db.ps1 -TruncateOnly
> # hoặc trên bash:
> ./reset-to-main-db.sh --truncate-only
> ```

---

### Cách 2: Chạy Thủ Công Từng Bước

1. Truncate các bảng MariaDB:
```bash
docker exec -i infra-mariadb mariadb -u root -proot ecommerce_product_db -e "
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
"
docker exec -i infra-mariadb mariadb -u root -proot ecommerce_inventory_db -e "
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE inventories;
TRUNCATE TABLE inventory_transactions;
SET FOREIGN_KEY_CHECKS=1;
"
```

2. Flush MongoDB và Redis:
```bash
docker exec -i infra-mongodb mongosh ecommerce_product_nosql --eval "db.dropDatabase()"
docker exec -i infra-redis redis-cli FLUSHALL
```

3. Import catalog và seed tồn kho:
```bash
npm run setup                  # import categories + brands + products + variants + ảnh từ manifests/
npm run seed-inventory         # set tồn kho mặc định = 10 cho mọi variant
```

**Nếu mất cả `manifests/`** (máy hỏng, chưa từng backup) — tải lại từ R2 (bucket đã backup ở mục "Backup dữ liệu" phía dưới, prefix `manifests-backup/`) bằng `rclone`/AWS CLI. Nếu chưa từng backup thật sự mất — phải crawl lại, xem mục **"Scrape lại dữ liệu"** phía dưới.

---

## Scrape lại dữ liệu mới từ cellphones.com.vn

Chỉ cần khi muốn lấy thêm sản phẩm mới / cập nhật giá — **không cần cho việc build/khôi phục thông thường** (đã có `manifests/` sẵn).

Các lệnh từ đây trở xuống (`scrape`/`mirror`/`backup`/`clean-broken-products`) mới thật sự cần `npm install` (dùng `cheerio`/`@aws-sdk/client-s3`):
```bash
npm install                    # 1 lần đầu, chỉ cần cho các lệnh dưới đây
```

```bash
npm run scrape                 # = node scrape-cellphones.mjs --per-category
```

Sau khi scrape, dọn sản phẩm không có ảnh thật (trang "sắp ra mắt"/hàng đã ngừng bán hay lẫn vào):
```bash
node clean-broken-products.mjs
```
> Chạy **sau khi mirror ảnh** (bước dưới) — script này kiểm tra `imageUrl` đã là URL R2 hay chưa, chưa mirror thì mọi sản phẩm sẽ bị coi là "chưa có ảnh thật" và bị xóa hết.

Ảnh sản phẩm mới scrape vẫn đang trỏ thẳng cellphones.com.vn — mirror lên R2 trước khi import:
```bash
npm run mirror                 # = node mirror-images.mjs --all
```
Script tải ảnh từ CDN nguồn, upload lên Cloudflare R2, rồi tự ghi đè URL ảnh trong `manifests/*.json` bằng URL R2 — sản phẩm không còn phụ thuộc site nguồn (site sập/đổi ảnh không ảnh hưởng).

Thứ tự đúng khi có data mới: `scrape` → `mirror` → `clean-broken-products` → `setup` → `seed-inventory`.

---

## Giá tham khảo cho sản phẩm "Liên hệ"

Khi trang nguồn không niêm yết giá (hàng cũ/đời cũ đã hết, ghi "Liên hệ"), `scrape-cellphones.mjs` gán tạm
`1.000.000đ`. 311 sản phẩm như vậy trong `manifests/` đã được thay bằng **giá tham khảo** (21/10/2026):
suy từ sản phẩm cùng dòng đang có giá thật (điều chỉnh theo dung lượng và tình trạng máy cũ), hoặc theo giá thị
trường Việt Nam khi catalog không có sản phẩm cùng dòng. Giá vốn = 76% giá bán, như phần còn lại của catalog.
Căn cứ từng sản phẩm nằm trong `price-estimates.csv`.

> Scrape lại dữ liệu mới sẽ gặp lại giá tạm 1.000.000đ cho các trang "Liên hệ" — cần ước giá lại hoặc ẩn các sản phẩm đó.

## Backup dữ liệu lên cloud (đề phòng mất máy)

`manifests/*.json` (giá, tên, thông số...) hiện chỉ tồn tại trên máy bạn — không có git. Backup lên R2 để có thêm 1 bản ngoài máy:

```bash
npm run backup                 # = node backup-manifests.mjs
```
Ghi đè bản backup cũ bằng dữ liệu `manifests/` hiện tại (luôn giữ bản mới nhất), lưu vào bucket R2 ở prefix `manifests-backup/`. Nên chạy lại sau mỗi lần scrape/sửa dữ liệu quan trọng.

---

## Validate trước khi import (không ghi DB)

```bash
node setup.mjs --dry-run       # validate cả 19 file
node import.mjs --file manifests/laptop.json   # validate 1 file lẻ (bỏ --apply)
```

---

## Cấu hình (.env)

```bash
cp .env.example .env
```

```env
API_BASE_URL=http://localhost:8080/api/v1
ADMIN_TOKEN=eyJ...                # Bắt buộc khi import/seed-inventory thật (--apply)

# Cloudflare R2 — chỉ cần khi chạy mirror-images.mjs / backup-manifests.mjs / clean-broken-products.mjs
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL_BASE=https://pub-xxxx.r2.dev
```

Lấy giá trị R2 tại **dash.cloudflare.com → R2 Object Storage**:
1. Tạo bucket → bật **Public Development URL** (Settings) → copy làm `R2_PUBLIC_URL_BASE`.
2. **Account Details → API Tokens → Manage → Create Account API token** (quyền Object Read & Write, giới hạn vào đúng bucket) → copy `Access Key ID` + `Secret Access Key`.
3. `R2_ACCOUNT_ID` lấy ở dòng "Account ID" hoặc trong URL "S3 API".
