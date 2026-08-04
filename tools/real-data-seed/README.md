# real-data-seed — nạp đơn hàng + review THẬT (Olist Brazilian E-Commerce)

Bổ sung cho `tools/data-seed` (dữ liệu tổng hợp): tool này nạp **đơn hàng và review THẬT** từ
dataset công khai [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
(Kaggle) vào cùng schema đang dùng (`ecommerce_user_db`/`ecommerce_product_db`/`ecommerce_order_db`),
để có test/đo lường trên dữ liệu con người thật thay vì hoàn toàn tổng hợp.

## Giấy phép — đọc trước khi dùng

Dataset dùng giấy phép **CC BY-NC-SA 4.0** — **chỉ phi thương mại**, phải ghi công nguồn, chia sẻ
lại theo cùng giấy phép. Phù hợp cho đồ án tốt nghiệp/nghiên cứu, **không được dùng cho sản phẩm
thương mại thật**. Không commit file dữ liệu gốc lên GitHub (xem mục "Vì sao không commit data").

## Vì sao KHÔNG dùng được 100% dữ liệu thật cho toàn bộ tính năng

Không có dataset công khai nào có đủ CẢ đơn hàng/review thật LẪN hành vi xem/bỏ giỏ hàng thật của
CÙNG một nhóm user — Olist là dữ liệu bán hàng thực tế của 1 sàn TMĐT Brazil (2016-2018) nhưng
**không ghi lại hành vi duyệt web** (không có clickstream). Vì vậy:

| Dữ liệu | Nguồn |
|---|---|
| Đơn hàng (orders, order_items) | **THẬT** — từ Olist |
| Review (rating + comment) | **THẬT** — từ Olist |
| Sản phẩm (products, categories) | **THẬT** (nhưng Olist không có TÊN sản phẩm, chỉ có category + kích thước vật lý — tên hiển thị tổng hợp từ category, xem bên dưới) |
| Xem sản phẩm / bỏ giỏ hàng (`user_events`) | **TỔNG HỢP**, nhưng **neo vào mốc thời gian đơn hàng THẬT** (`order_purchase_timestamp`) — nhịp giờ/ngày thật của Olist tự lan truyền vào, khác `tools/data-seed` (mọi mốc đều tổng hợp) |
| Voucher (`issued_vouchers`) | Không import — Olist không có khái niệm voucher. Dùng `tools/data-seed` nếu cần dữ liệu voucher |

## Các quyết định ánh xạ quan trọng (đọc để không hiểu nhầm số liệu)

- **Trạng thái đơn hàng**: Olist có 8 trạng thái (`created/approved/processing/invoiced/shipped/
  delivered/unavailable/canceled`), project chỉ có `DELIVERED`/`CANCELLED`. **Chỉ giữ 2 trạng thái
  map thẳng được** (`delivered`→`DELIVERED`, `canceled`→`CANCELLED`), **bỏ 6 trạng thái còn lại** —
  gán bừa "processing" thành DELIVERED hay CANCELLED đều là bịa dữ liệu, thà mất bớt đơn còn hơn.
  Hệ quả: tổng số đơn import ít hơn tổng số dòng trong `olist_orders_dataset.csv`.
- **Tên sản phẩm là TỔNG HỢP**: `olist_products_dataset.csv` không có trường tên/mô tả text, chỉ
  có `product_category_name` + kích thước vật lý. Tên hiển thị = `"<category tiếng Anh> (Olist
  #<8 ký tự đầu product_id>)"` — không bịa tên sản phẩm cụ thể nào.
  - **Giá sản phẩm** = trung bình giá đã bán THẬT của đúng `product_id` đó trong Olist (không bịa).
- **Không có discount/voucher cấp đơn hàng** trong Olist → `discount_amount = 0`, `coupon_code =
  NULL`. Không suy diễn thêm.
- **Quy đổi BRL → VND**: giá gốc Olist tính bằng Real Brazil, nhân với `BRL_TO_VND_RATE` (mặc định
  6000, đổi được trong `.env`) **chỉ để hiển thị hợp lý** dưới cột tiền tệ VND của DB — **không ảnh
  hưởng phân bố tương đối** (recency/frequency/monetary skew) mà model dùng để học, vì mọi feature
  đều qua `MinMaxScaler` trước khi vào model. Đặt `BRL_TO_VND_RATE=1` nếu muốn giữ nguyên số BRL gốc.
- **User không đăng nhập được**: mỗi `customer_unique_id` (định danh khách hàng THẬT lặp lại giữa
  các đơn của Olist — khác `customer_id` là định danh theo TỪNG đơn) được gán 1 UUID tổng hợp làm
  `keycloak_user_id`, nhưng **không có tài khoản Keycloak thật** — giống nhóm "chỉ để train" của
  `tools/data-seed`, không phải nhóm demo đăng nhập được.

## Cài đặt

```bash
cd tools/real-data-seed
npm install
cp .env.example .env   # điền KAGGLE_USERNAME/KAGGLE_KEY + thông tin DB
```

**Lấy `KAGGLE_USERNAME`/`KAGGLE_KEY`**: đăng nhập kaggle.com → Settings → API → "Create New Token"
→ tải về `kaggle.json` → copy 2 giá trị `username`/`key` trong đó vào `.env`. **Lần đầu** cũng cần
vào thẳng trang dataset (https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) và bấm chấp
nhận điều khoản — Kaggle yêu cầu xác nhận qua UI trước khi API cho tải, không thể bỏ qua bước này.

## Chạy

```bash
node download.mjs                  # tải + giải nén dataset vào ./data/ (không commit, .gitignore)
node import.mjs --dry-run          # xem thống kê trước, không ghi DB
node import.mjs --customers 500    # import mẫu 500 khách hàng thật (mặc định: toàn bộ ~96k)
node import.mjs --force            # xoá dữ liệu Olist cũ (nếu có) rồi nạp lại — idempotent
node cleanup.mjs                   # chỉ xoá, không nạp lại
```

Toàn bộ dữ liệu import được đánh dấu qua email `@olist.import` (users) và slug `olist-*`
(products/categories) — **không đụng** dữ liệu tổng hợp của `tools/data-seed` (domain
`seed.internal`/`demo.local`) hay dữ liệu thật khác của hệ thống.

## Vì sao không commit data (chỉ commit script)

1. **Giấy phép**: CC BY-NC-SA yêu cầu ghi công + không thương mại — an toàn nhất là mỗi người tự
   tải bằng tài khoản Kaggle của mình, không phát tán lại file gốc qua Git.
2. **Dung lượng**: dataset đầy đủ (9 file CSV) nặng vài trăm MB, vượt xa mức hợp lý cho 1 repo Git
   thường (không dùng Git LFS ở đây).
3. Script `download.mjs` tự tải lại được bất cứ lúc nào — không mất gì khi không commit data.

## ⚠️ KHÔNG train model khi trộn tool này với `tools/data-seed`

2 tool ghi dữ liệu **không đè nhau** (khác domain email, khác slug) — nhưng **TRỘN CẢ HAI TRONG DB
RỒI TRAIN LÀ SAI**, và sai một cách nguy hiểm vì kết quả nhìn rất đẹp.

**Đã xảy ra thật (2026-08-04)**, số đo cụ thể:

| | Chỉ dữ liệu synthetic | Trộn synthetic + Olist |
|---|---|---|
| AUC | 0,8415 | **0,9908** |
| Precision | 0,555 | **1,0** |
| Churn rate | 0,2633 | 0,9285 |

AUC 0,9908 đó **hoàn toàn vô nghĩa**: đơn hàng Olist nằm ở 2016-2018 còn `tools/data-seed` sinh
quanh ngày hiện tại, nên mọi user Olist có `recency`/`days_since_last_activity` lớn bất thường và
luôn bị dán nhãn churn=1. Model chỉ cần học **"user này thuộc nguồn dữ liệu nào"** là phân loại gần
như hoàn hảo — không học gì về hành vi rời bỏ. Tệ hơn: `_retrain_gate()` (chỉ chặn khi metric TỤT)
đã cho model rác này qua và **thay luôn model production**.

**Nay đã có guard chặn cứng** (`train.py::_assert_panel_not_contaminated`): train sẽ **bị từ chối**
kèm chẩn đoán rõ khi phát hiện panel có tỉ lệ churn cực đoan + phần lớn user có đơn cuối cùng cũ hơn
cả mốc cắt sớm nhất. Nhưng vẫn nên chủ động **chỉ giữ 1 nguồn trong DB khi train**:

```bash
# Train trên dữ liệu THẬT (Olist):
cd tools/data-seed && node cleanup.mjs          # dọn synthetic
cd ../real-data-seed && node import.mjs --force

# Train trên dữ liệu tổng hợp:
cd tools/real-data-seed && node cleanup.mjs     # dọn Olist
cd ../data-seed && node seed.mjs --force
```

**Lưu ý thêm khi train trên dữ liệu Olist thật:** mốc cắt nhãn churn mặc định tính lùi từ **đồng hồ
hệ thống**, nên với dữ liệu lịch sử đã đóng băng (2016-2018) sẽ ra 100% churn=1 → không train được.
Phải truyền `reference_now` khớp mốc cuối của dữ liệu (vd `pd.Timestamp("2018-10-20")`) — hiện chỉ
gọi được từ code (`_build_training_panel`), `POST /models/train` chưa nhận tham số này.
