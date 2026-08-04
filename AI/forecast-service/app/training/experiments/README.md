# experiments/ — thí nghiệm đo lường, KHÔNG phải code production

Script ở đây **không được service nào import**, không lưu model, không đổi hành vi production. Chúng
là các phép đo một lần dùng để **quyết định có nên đầu tư vào một hướng ML hay không** — chạy tay,
đọc số, rồi ghi kết luận vào `docs/canvas/churn-risk-log.md`.

Lý do tách riêng: mọi thứ trong `app/training/` còn lại đều nằm trên đường đi của
`POST /api/v1/models/train` (production). Trộn code thí nghiệm vào đó sẽ khiến người sau không biết
cái nào đang thật sự chạy.

## `cart_abandon_build_dataset.py` + `cart_abandon_rule_vs_ml.py`

Trả lời câu hỏi: **bài toán bỏ giỏ hàng có thuộc lớp mà rule KHÔNG bắt kịp được không?**

Dữ liệu: [RetailRocket clickstream](https://www.kaggle.com/datasets/retailrocket/ecommerce-dataset)
— hành vi người thật, 2,76M event. Tải bằng `kagglehub.dataset_download("retailrocket/ecommerce-dataset")`
(không cần xác thực), rồi copy `events.csv` vào `/tmp/rr_events.csv` trong container.

```bash
docker exec ai-forecast-service python /tmp/build_seq_dataset.py   # dựng nhãn + feature
docker exec ai-forecast-service python /tmp/run_seq_experiment.py  # đo 4 mốc
```

**Thiết kế cốt lõi — chia feature theo *cái rule truy cập được*:**

| Nhóm | Nội dung | Ai dùng được |
|---|---|---|
| **A** (12) | Mọi vô hướng có thể đặt ngưỡng: đếm luỹ tiến, vị trí, khoảng thời gian, giờ/thứ | **Rule ✓** + ML ✓ |
| **B** (11) | Phụ thuộc THỨ TỰ: hành động liền trước, đếm bigram chuyển trạng thái | Rule ✗ — chỉ ML |

Sửa lỗi thiết kế của `rule_benchmark.py` (bản đó cho cả 2 bên **cùng** bộ feature nên bằng nhau là
hiển nhiên). Có **đối chứng âm**: xáo trộn nhóm B giữa các hàng — nếu kết quả không tụt thì phần hơn
của nhóm B là ảo.

**Kết quả đã đo (xem log để có bối cảnh đầy đủ):**
- Thứ tự (nhóm B) **không thêm gì**: ΔAUC −0,0009, trong sàn nhiễu. Vì RetailRocket chỉ có 3 loại
  event nên bigram trùng với số đếm. Giả thuyết ban đầu **sai**.
- Nhưng **kết hợp nhiều chiều thì hơn rule rõ rệt**: 1 feature tốt nhất 0,6592 · cây depth-2 (mức
  người viết tay) 0,6987 · **LightGBM 0,7447** ⇒ hơn **3,4-5,2× sàn nhiễu**.
- **F1 là metric bẫy** ở base rate 70%: "đoán tất cả bỏ giỏ" đã cho F1 0,8238 so với model 0,8440.
  Phải dùng metric xếp hạng (AUC), và **luôn so với baseline tầm thường trước**.

Chống rò rỉ: mọi feature dùng `cumsum` theo visitor rồi **trừ chính event hiện tại** ⇒ chỉ dùng dữ
liệu trước thời điểm thêm giỏ. Grouped CV theo visitor.

## `synthetic_sequence_dgp.py`

Trả lời câu hỏi tổng quát hơn: **khi nào rule thất bại về cấu trúc, khi nào rule là đủ?**

```bash
docker cp .../synthetic_sequence_dgp.py ai-forecast-service:/tmp/
docker exec ai-forecast-service python /tmp/synthetic_sequence_dgp.py
```

Sinh 20.000 phiên với bảng chữ cái 18 ký hiệu, rồi gán **2 nhãn khác nhau trên CÙNG các phiên đó**:

| DGP | Sự thật được thiết kế | Kỳ vọng |
|---|---|---|
| **A** | 1 ngưỡng trên 1 đại lượng đếm (`COUPON_FAILED >= 1`) | rule **đủ** |
| **B** | Tương tác 3 chiều **+ thứ tự liền kề**; nhóm đối chứng có cùng số đếm, chỉ khác thứ tự | rule **thất bại** |

**Vì sao phải có 2 DGP:** chỉ 1 DGP dạng-tương-tác rồi cho thấy ML thắng thì chỉ chứng minh "tự thiết
kế được dữ liệu đánh bại rule" — vô giá trị. Script tự kiểm tra `experiment_is_discriminating`: nếu
rule thắng cả 2 hoặc ML thắng cả 2 thì **harness sai, không được dùng kết quả**.

**Kết quả đã đo:** DGP-A model hơn rule **+0,0008** (rule đủ) · DGP-B model hơn rule **+0,0997 =
10× sàn nhiễu**, trong đó riêng phần **thứ tự** góp **+0,0440 = 4,3× sàn nhiễu**.

**Giới hạn:** DGP do người viết thiết kế ⇒ chứng minh *"NẾU hành vi thật có dạng này THÌ rule không
bắt được"*, **KHÔNG** chứng minh hành vi thật *có* dạng đó. Cần traffic thật từ tracker vi hành vi rồi
chạy lại `cart_abandon_rule_vs_ml.py` để biết.
