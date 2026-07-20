# Catalog Import Tool

Công cụ scrape sản phẩm từ **cellphones.com.vn**, mirror ảnh lên Cloudflare R2, và import vào DB (attributes, categories, brands, products, variants, tồn kho).

---

## Cấu trúc file

```
catalog-import/
├── setup.mjs                  # ⭐ LỆNH CHÍNH — import toàn bộ manifests/*.json + flush cache
├── seed-inventory.mjs         # Set tồn kho mặc định cho mọi variant (chạy sau setup.mjs)
├── clean-broken-products.mjs  # Dọn sản phẩm không có ảnh thật khỏi manifests/ (chạy sau khi scrape/mirror)
├── scrape-cellphones.mjs      # Scraper (crawl sản phẩm từ cellphones.com.vn) — chỉ cần khi lấy dữ liệu mới
├── mirror-images.mjs          # Mirror ảnh sản phẩm từ site nguồn → Cloudflare R2 — chỉ cần sau khi scrape mới
├── backup-manifests.mjs       # Backup toàn bộ manifests/*.json (dữ liệu text) lên R2
├── import.mjs                 # Import 1 file lẻ (setup.mjs gọi lại cái này cho từng file — dùng riêng khi debug)
├── .env                        # Cấu hình API_BASE_URL + ADMIN_TOKEN + R2 (không commit)
├── .env.example                # Mẫu cấu hình
└── manifests/                  # 19 file JSON đã scrape sẵn (~1100 sản phẩm) — dùng để import ngay
```

> Mỗi file JSON chứa đầy đủ: **attributes, categories, categoryAttributes, brands, products, variants** — import 1 file là đủ cho cả danh mục đó (nhưng nên import cả 19 file, vì 1 brand/category có thể xuất hiện ở nhiều file — `setup.mjs` tự làm việc này).

---

## 🆘 Build/khôi phục toàn bộ dữ liệu — chỉ vài lệnh

Dùng khi: dự án mới build lần đầu, DB bị trắng, hoặc muốn reset lại catalog demo.

```bash
cd tools/catalog-import
cp .env.example .env           # rồi điền ADMIN_TOKEN (xem cách lấy ở dưới)

npm run setup                  # import categories + brands + products + variants + ảnh (đã có URL R2 sẵn)
npm run seed-inventory         # set tồn kho mặc định = 10 cho mọi variant
```

> **Không cần `npm install`** cho 2 lệnh trên — `setup.mjs`/`seed-inventory.mjs` chỉ dùng module có sẵn của Node (`fs`, `path`, `child_process`), không import `cheerio`/`@aws-sdk/client-s3`. `npm install` chỉ cần khi chạy `scrape`/`mirror`/`backup`/`clean-broken-products` (xem mục dưới).

Xong — có đủ category, attribute, brand, product, variant, ảnh (trỏ R2, không phụ thuộc cellphones.com.vn), tồn kho. Elasticsearch tự re-index qua bước import (BE tự gọi `indexProduct` mỗi lần tạo/update product).

**Lấy ADMIN_TOKEN:** đăng nhập admin tại Trang Dashboard  → F12 → Application → Local Storage → copy `access_token`.
> Token hết hạn sau **15 phút**. Nếu `npm run setup` báo lỗi 401 giữa đường — lấy token mới, dán lại vào `.env`, chạy `npm run setup` lần nữa. An toàn chạy lại nhiều lần: file đã import trước đó chỉ bị **update**, không tạo trùng.

**Muốn set số lượng tồn kho khác 10:**
```bash
node seed-inventory.mjs --qty 20
```

**Nếu DB cũ còn tồn dữ liệu bẩn/lệch** (VD sau khi sửa `manifests/`, có sản phẩm cũ không còn trong file JSON nữa) — import không tự xóa được sản phẩm đã bị loại khỏi manifest, cần truncate trước khi `npm run setup`:
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
