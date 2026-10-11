# Đối chiếu schema: DB hệ thống ↔ REES46 đa ngành (trước khi transform)

> Ngày 2026-10-02. Chủ dự án chốt: chuyển từ **mô phỏng tham số** sang **transform** (dùng chính user + chuỗi sự kiện
> thật, chỉ ánh xạ sang schema/catalog hệ thống), nguồn **REES46 đa ngành** (Kaggle `mkechinov`, 10–11/2019).
> Tài liệu này đối chiếu TỪNG cột để phân loại: khớp / chỉ khác tên-định dạng / ánh xạ có giả định / thiếu thật.

Nguồn số liệu:
- Schema DB: `information_schema` thật (MariaDB 10.11, `time_zone = UTC`).
- Cách hệ thống ghi khi chạy thật: `AI/forecast-service/app/kafka/behavior_consumer.py` (`_parse_message`), entity Java.
- Hồ sơ REES46: `tools/data-seed/transform/profile_rees46.py` trên 10 triệu dòng (5 triệu đầu mỗi tháng) →
  `data/experiment-results/rees46_profile.json`.

## 1. Hồ sơ REES46 (cột gốc)

| Cột | Kiểu | Rỗng | Ghi chú đo được |
|---|---|---:|---|
| `event_time` | chuỗi `YYYY-MM-DD HH:MM:SS UTC` | 0% | 100% hậu tố UTC, độ phân giải giây |
| `event_type` | `view` / `cart` / `purchase` | 0% | 96,8% / 1,6% / 1,6%. **Không có** `remove_from_cart` |
| `product_id` | int64 | 0% | 140K SP / 10 triệu dòng; 99,994% SP chỉ thuộc 1 `category_id` |
| `category_id` | int64 (~2e18) | 0% | 630 giá trị; mỗi `category_id` có đúng 1 `category_code` hoặc luôn trống |
| `category_code` | chuỗi `a.b.c` | **31,5%** | 126 mã, 13 nhánh gốc |
| `brand` | chuỗi | 14,2% | 1 SP ↔ 1 brand (99,98%) |
| `price` | float, **USD** | 0% | trung vị 167,8; p99 1.737; 0,1% bằng 0; **23% SP đổi giá** trong kỳ |
| `user_id` | int64 | 0% | không có thông tin cá nhân |
| `user_session` | UUID 36 ký tự | 0% | 99,997% phiên thuộc đúng 1 user |
| (trùng lặp) | | | 0,05% dòng trùng hoàn toàn → cần khử |

## 2. Đối chiếu từng cột

Ký hiệu: ✅ khớp · 🔁 chỉ khác tên/định dạng · 🧩 ánh xạ có giả định · ❌ thiếu thật trong nguồn · ➖ hệ thống không cần cho AI.

### `ecommerce_order_db.user_events`
| Cột DB (kiểu) | Nguồn REES46 | Loại | Ghi chú |
|---|---|---|---|
| `user_id` varchar(100) | `user_id` int64 | 🔁 | uuid5 tất định |
| `session_id` varchar(100) | `user_session` UUID | ✅ | 36 ký tự, 1 phiên ↔ 1 user |
| `item_id` bigint | `product_id` | 🧩 | phải trỏ `products.id` có thật → ánh xạ sang SP Tiki (theo danh mục + hạng giá) |
| `category_id` bigint | `category_id` | 🧩 | ánh xạ sang danh mục lá Tiki. **Lệch ngữ nghĩa:** hệ thống thật ghi `NULL` cho sự kiện giỏ (`CartUpdatedEvent` không mang danh mục) |
| `action_type` varchar(30) | `event_type` | 🔁 | `view`→`VIEW_PRODUCT`, `cart`→`ADD_TO_CART` |
| (`REMOVE_FROM_CART`, `UPDATE_CART_QTY`, `CLEAR_CART`) | — | ❌ | nguồn không ghi |
| (14 vi hành vi FE) | — | ❌ | nguồn không ghi |
| `created_at` datetime(6) | `event_time` UTC | 🔁 | DB cũng UTC → khớp; dịch nguyên tuần về hiện tại |
| `weight` double | — | ✅ | hệ thống cũng ghi `NULL` cho xem/giỏ |

### `ecommerce_order_db.orders`
| Cột DB | Nguồn | Loại | Ghi chú |
|---|---|---|---|
| `user_id` | `user_id` | 🔁 | |
| `created_at` / `updated_at` | `event_time` của `purchase` | 🔁 | |
| `status` | — | 🧩 | `purchase` = đã mua → `DELIVERED`. Không có huỷ/hoàn → **`cancel_rate` luôn 0** |
| `total_amount` / `final_amount` decimal(15,2) VND | `price` USD | 🧩 | **cần quyết định**: giá thật × tỉ giá (giữ chi tiêu thật) hay giá SP Tiki đã ánh xạ (khớp catalog) |
| `discount_amount`, `coupon_code` | — | ❌ | **`discount_dependency` luôn 0** |
| `shipping_fee`, `vat_amount`, điểm… (NOT NULL) | — | ➖ | điền 0 |
| `shipping_address`, `phone_number` (NOT NULL) | — | ➖ | placeholder (schema bắt buộc) |
| `email`, `note`, `tracking_code`, `total_weight`, `applied_campaign_id` | — | ➖ | NULL |
| Gộp đơn | `user_session` | 🧩 | gộp mọi `purchase` cùng phiên thành 1 đơn (92% phiên mua chỉ 1 SP) |

### `ecommerce_order_db.order_items`
| Cột DB | Nguồn | Loại | Ghi chú |
|---|---|---|---|
| `product_id` | `product_id` | 🧩 | như `item_id` |
| `variant_id`, `variant_attr` | — | ❌→🧩 | **3.521/6.526 SP có biến thể**; hệ thống thật luôn ghi biến thể khi đặt → nên chọn 1 biến thể tất định thay vì để NULL |
| `product_name` varchar(200), `product_image` | catalog Tiki | 🔁 | lấy từ SP đã ánh xạ |
| `quantity` | số dòng `purchase` cùng SP trong phiên | 🧩 | 94% = 1 |
| `unit_price`, `subtotal` | `price` | 🧩 | cùng quyết định với `total_amount` |

### `ecommerce_user_db.users`
| Cột DB | Nguồn | Loại | Ghi chú |
|---|---|---|---|
| `keycloak_user_id` (UNIQUE) | `user_id` | 🔁 | uuid5 |
| `username`, `email` (UNIQUE, NOT NULL) | — | ➖ | tổng hợp `rees_<id>@rees46.internal` (để dọn được) |
| `created_at` | — | 🧩 | nên = thời điểm sự kiện đầu tiên (hiện đang = lúc nạp) |
| còn lại | — | ➖ | mặc định |

Không động vào `products`/`categories` (catalog Tiki giữ nguyên). Lưu ý: nạp vào DB **không** đổ lịch sử vào Redis (recs-service đọc Redis qua Kafka) — không ảnh hưởng churn.

## 3. Hai vấn đề NGHIÊM TRỌNG phát hiện khi lập hồ sơ

### 3.1. Giả định cho sự kiện không có mã ngành là SAI
Bản đầu rải 31,5% sự kiện trống mã vào Làm đẹp / Bách hoá / Nhà sách. Brand thực tế trong nhóm trống mã (top 15):
lucente (đèn), **cordiant, triangle, nokian, yokohama** (lốp xe), **xiaomi, sony, samsung** (điện tử), bosch, redmond,
artel (gia dụng), stels (xe đạp), sokolov (trang sức)… → **không phải** mỹ phẩm/thực phẩm/sách.
Sửa: suy ngành từ `brand` (bảng brand → ngành lấy từ chính các dòng CÓ mã); brand không suy được → giữ nhóm "khác",
không rải bừa. Hệ quả trung thực: nguồn này gần như **không có** Làm đẹp / Bách hoá / Nhà sách.

### 3.2. Sự kiện thêm giỏ bị ghi THIẾU trong REES46 đa ngành
- Chỉ **36,7%** lần mua có sự kiện thêm giỏ cùng SP trong cùng phiên (99,8% có lượt xem). Trong hệ thống thật, mua bắt buộc qua giỏ.
- Bản transform đủ 2 tháng (3% user): **2,87** lượt thêm giỏ / đơn. REES46 Cosmetics: 5,77 triệu lượt thêm giỏ,
  3,98 triệu lượt xoá khỏi giỏ cho ~154K ngày mua → giỏ hàng được ghi đầy đủ.
- Hệ quả: tín hiệu "bỏ giỏ" từ nguồn đa ngành **không đáng tin**. Đây đúng là tín hiệu trung tâm của giả thuyết cảnh báo sớm.
  Nạp như hiện tại thì mọi feature giỏ (`cart_abandon_count`, `view_to_cart_conversion_rate`) và đơn hàng không qua giỏ
  sẽ lệch so với cách hệ thống thật vận hành.

## 4. Quyết định cần chủ dự án chốt
1. Giá trong đơn: giá thật USD × tỉ giá (giữ `monetary` thật) hay giá SP Tiki đã ánh xạ.
2. Giỏ hàng ghi thiếu: (a) nạp nguyên trạng, ghi rõ giới hạn; (b) chèn 1 sự kiện `ADD_TO_CART` ngay trước mỗi lần mua
   không có giỏ (khớp luồng hệ thống, nhưng là sự kiện suy ra); (c) dùng REES46 Cosmetics cho bài toán cảnh báo sớm theo giỏ,
   đa ngành cho phần còn lại.

## 5. Trạng thái
- `data/transformed/rees46_multi_f0.03/`: 159.691 user, 3,24 triệu sự kiện, 41.690 đơn, 7.637 khách ≥ 2 đơn — **CHƯA nạp**
  (chờ sửa 3.1 + quyết định mục 4).
- DB đang chứa bộ thử `_test` (28K user REES46) → sẽ bị `--force` dọn khi nạp bản chính.

## 6. Cập nhật 2026-10-02 (chiều) — dùng bản ĐỦ 7 tháng, phát hiện thêm 2 lỗi của chính nguồn REES46

Chủ dự án chốt: (1) giá đơn = **giá thật USD × tỉ giá** (mặc định 25.000); (2) tìm nguồn tốt hơn thay vì vá. Đã tải bản đủ
10/2019–4/2020 từ `data.rees46.com/datasets/marketplace` (≈ 6,5 MB/s qua proxy; mỗi tháng 2,4–3 GB nén) vào
`data/external/rees46-multi-full/`.

### 6.1. Log GIỎ: lỗi ở 10–11/2019, ĐÚNG từ 12/2019 (`check_cart_logging.py`, 4 triệu dòng đầu + 4 triệu dòng giữa tháng)
| | 10/2019 | 12/2019 (đầu) | 12/2019 (giữa) | Mỹ phẩm |
|---|---:|---:|---:|---:|
| Phiên có mua không có lượt thêm giỏ nào | 61,5% | **1,0%** | **1,2%** | 17,4% |
| Lượt mua có thêm giỏ đúng SP trong phiên | 36,5% | **99,0%** | **98,8%** | 50,5% |
| Lượt thêm giỏ / lượt mua | 1,00 | 2,93 | 2,83 | 5,04 |
| Sự kiện trống mã ngành | 32% | 11,5% | 11,0% | — |
Vẫn KHÔNG có `remove_from_cart`. → Nguồn hành vi: **12/2019–4/2020 (5 tháng)**.

### 6.2. MÃ NGÀNH: đúng ở 10–11/2019, SAI từ 12/2019
Thành phần ngành tháng 12 khác hẳn tháng 10 (điện thoại 41% → gần 0; `construction.tools.light` 0% → 27%). So 75.892 SP
xuất hiện ở cả 10/2019 và 12/2019: chỉ **19,7% giữ `category_id`**, brand khớp **98,3%**. SP là `electronics.smartphone`
ở tháng 10 (iPhone $1.082, Samsung $901, Xiaomi $198…) mang `construction.tools.light` ở tháng 12. 213 danh mục giữ id
cũ thì mã khớp 100% → lỗi nằm ở các `category_id` MỚI.
Sửa: 10–11 làm **bảng tham chiếu ngành** (`build_product_ref.py`): SP đã có ở 10–11 → mã của 10–11; danh mục id cũ → tin
mã; SP mới hoàn toàn → suy từ brand (bảng brand → mã đếm ở 10–11). Không dùng mã của các `category_id` mới.

### 6.3. Sửa khác đã áp vào transform
- Suy ngành cho sự kiện trống mã từ brand (chạy thử tháng 12: 88,7% có mã · 11,1% suy từ brand · **0,24%** không suy được → hash).
- Biến thể: SP có biến thể → chọn 1 biến thể active theo hash (60% dòng đơn có biến thể); `order_items` ghi `variant_id`,
  `variant_attr`, `product_image` (sửa `lib/writeData.mjs`, seed tổng hợp để NULL như cũ).
- `ADD_TO_CART.category_id = NULL` (giống hệ thống thật). `users.created_at` = sự kiện đầu. Khử dòng trùng.
- **Còn lệch:** ánh xạ SP theo HẠNG giá + giá thật → tên/giá có thể không khớp (vd sản phẩm thật $82 ánh xạ vào "găng tay bếp"
  rẻ nhất danh mục, hiện giá 2,06 triệu). Hướng sửa: chọn SP Tiki có giá GẦN NHẤT với giá thật × tỉ giá trong danh mục lá.
- 3–4/2020 trùng COVID (Nga) → ghi trong manifest.

## 7. Trạng thái cuối ngày 2026-10-02 + việc làm tiếp (2026-10-03)

**Đã có trên đĩa** (`data/external/rees46-multi-full/`, gitignore): 2019-Dec, 2020-Jan, 2020-Feb, 2020-Mar (đã `gzip -t`), 2020-Apr
(đang ghép/kiểm tra lúc dừng — xem `data/experiment-results/download_feb_apr.log`; nếu báo HỎNG: chạy lại
`bash tools/data-seed/transform/download_rees46.sh 2020-Apr`, các `.part` còn giữ sẽ được tải tiếp). Bảng tham chiếu 10–11:
`data/transformed/_ref/`. Bộ tải: 8 kết nối song song + tự mở lại khi bị bóp tốc độ (1 kết nối có lúc chỉ ~90 KB/s).

**Kiểm tra log giỏ** (`check_cart_logging.py`, 3 triệu dòng đầu): 01/2020 — phiên mua không giỏ 0,9%, mua có giỏ đúng SP 98,9%;
02/2020 — 3,7% / 96,5%. **NGHI VẤN tháng 1:** lượt thêm giỏ / lượt mua = **34,0** (12/2019: 2,9; 02/2020: 5,0) → có thể bùng nổ
sự kiện giỏ lặp hoặc bot. Phép đo nguyên nhân bị ngắt khi phiên kết thúc — **làm đầu tiên ngày mai** (đếm lượt giỏ / cặp
(phiên, SP), khoảng cách giây giữa các lượt lặp, mức tập trung theo user) rồi quyết định khử trùng/loại bot trước khi transform.

**Đã chạy cuối ngày:** thí nghiệm huỷ đơn trên Online Retail II → không giúp (ΔAUC +0,001), đã ghi churn-risk-log.md.

**Thứ tự việc ngày mai:**
1. Điều tra bất thường giỏ tháng 1 (và kiểm tra tháng 3, 4 bằng `check_cart_logging.py`).
2. Chạy transform đủ 12/2019–4/2020 (`rees46_transform.py`, chọn `--frac` vừa RAM; theo dõi RAM) → kiểm tra toàn vẹn 7 mục.
3. Nạp DB: `DB_HOST=127.0.0.1 node load-transformed.mjs --dir <thư mục> --force` (dọn luôn bộ thử `_test` 28K user đang ở DB).
   Lưu ý: kết nối DB phải dùng `127.0.0.1` (`localhost` treo trên Docker Desktop).
4. Re-baseline churn trên dữ liệu thật (9 feature, bỏ `cancel_rate`/`discount_dependency`), chạy lại ablation (ưu tiên gap_dispersion).
5. Thí nghiệm cảnh báo sớm theo giỏ (neo vào sự kiện giỏ dở, đích 7 ngày, so đặc trưng đơn lẻ vs liên kết).
6. Commit các file mới (chưa commit): transform/, load-transformed.mjs, export-churn-panel.mjs, các script experiments churn_*,
   sửa writeData.mjs/simulate.mjs, docs.

## 8. Phát hiện phụ (2026-10-05): `product_variants.variant_attr` rỗng toàn bộ trong DB
Không phải lỗi transform — kiểm tra trực tiếp: cả 20.325 dòng `ecommerce_product_db.product_variants` đều có
`variant_attr = NULL` (100%), kể cả các SP không liên quan REES46. Lỗi nằm ở bước import catalog Tiki trước đó
(`tools/catalog-import`), ngoài phạm vi việc hôm nay — ghi nhận để xử lý riêng, không chặn việc nạp REES46.

## 9. Phát hiện thứ 3 của nguồn (2026-10-05): 4 ngày mất gần hết log mua hàng
Quét `daily_profile.py` toàn bộ 152 ngày (12/2019–4/2020): **01/01, 02/01, 20/04, 21/04/2020** có lượt mua
tụt còn 0–3.574 (bình thường ~29.000/ngày) trong khi lượt xem và thêm giỏ vẫn bình thường — không phải nghỉ lễ
thật (nghỉ lễ thì cả 3 loại cùng giảm), mà là lỗi ghi log phía nguồn. Chỉ 4/152 ngày (2,6%).
Biến động theo tuần còn lại (cart/purchase 1,77–4,21 lần) nằm trong dao động bình thường của 1 cửa hàng thật,
không phải vấn đề cần sửa.
**Xử lý:** loại 4 ngày này khỏi dữ liệu MUA HÀNG khi transform (`BROKEN_PURCHASE_DAYS` trong `rees46_transform.py`),
giữ nguyên view/cart các ngày đó. Không suy đoán số thay thế.
