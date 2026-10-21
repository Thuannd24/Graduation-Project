# Rà soát nguồn dữ liệu thật cho churn AI (2026-10-08)

> Câu hỏi của chủ đồ án: REES46 có vẻ "nghèo" (đa số chỉ xem, ít khách mua ≥ 2 đơn) — có nguồn nào tốt hơn
> (Kaggle hoặc bên khác), chấp nhận phải qua tool/service chuyển đổi, hoặc trộn nhiều nguồn, miễn là
> **người dùng thật + khớp hệ thống**, mục tiêu điểm đồ án cao nhất?
>
> Phương pháp: 3 lượt tra cứu web song song (REES46/Open CDP; Alibaba/Tianchi/JD/Diginetica/RetailRocket;
> bán lẻ giao dịch H&M/Instacart/dunnhumby/X5/…) + 1 phép đo cục bộ trên dữ liệu REES46 có sẵn trong máy.
> Ký hiệu: ✅ đã xác minh (nguồn gốc hoặc tự đo) · ⚠️ chỉ có nguồn thứ cấp · ❓ chưa xác minh.

## 0. Kết luận

1. **Nguồn chính vẫn là REES46 đa ngành, nhưng mở rộng 5 → 7 tháng (10/2019–4/2020).** Không ứng viên nào
   khác đạt đủ 6 tiêu chí bắt buộc (mục 1). Thêm 2 tháng 10–11/2019 (đã có sẵn trong máy) làm số khách
   ≥ 2 đơn tăng **+32,4%** trên cùng mẫu người dùng (mục 2) — "nghèo" một phần do cửa sổ bị cắt, không chỉ do
   hành vi khách.
2. **Kiểm chứng ngoài trên một nguồn độc lập (không nạp DB): H&M** — 2 năm, 1,37 triệu khách, giao dịch có
   ngày tuyệt đối + giá, luật cuộc thi cho phép "academic research and education", và benchmark RelBench đã có
   sẵn tác vụ `user-churn` trên chính bộ này. Phương án dự phòng có hành vi duyệt: Tmall IJCAI-15.
3. **Trộn nguồn**: trộn **theo lớp** (catalog Tiki + hành vi REES46) và trộn **theo thí nghiệm** (cùng pipeline
   chạy trên nhiều bộ) là hợp lệ; trộn **người dùng** của nhiều bộ vào một DB thì không (mục 5).

## 1. Tiêu chí (suy ra từ hệ thống, không đặt tuỳ ý)

| # | Tiêu chí | Vì sao bắt buộc |
|---|---|---|
| T1 | `user_id` bền qua thời gian | nhãn churn = (user, cutoff) — không có user bền thì không có churn |
| T2 | thời điểm tuyệt đối, chi tiết ≥ ngày | nhãn 60 ngày sau cutoff, 5 cutoff lùi 61–137 ngày |
| T3 | độ dài ≥ ~6 tháng | lịch sử trước cutoff + 60 ngày đích + nhiều cutoff |
| T4 | đơn hàng có giá + danh mục | feature monetary, xếp hạng P × monetary, ánh xạ sang catalog Tiki |
| T5 | sự kiện duyệt (view/cart) gắn user | tracker của hệ thống ghi hành vi; feature quan trọng nhất `days_since_last_activity` (permutation 0,1441) đến từ đây |
| T6 | dữ liệu thật, tải được hôm nay, giấy phép cho phép dùng học thuật | bảo vệ đồ án |
| + | thương mại điện tử online đa ngành | khớp catalog Tiki đa ngành của hệ thống |

## 2. Phép đo mới: thêm mua hàng 10–11/2019 vào REES46 ✅

Script chỉ đọc `scratchpad/octnov_repeat.py` (181 giây). Dùng **đúng** hàm lấy mẫu của transform
(`(user_id × 2654435761) mod 2³² < frac·2³²`, frac 0,025 — `rees46_transform.py:176`, nhánh
`feat/multi-category-catalog`) nên là **cùng 2,5% người dùng**; đơn = (user, `user_session`) có `purchase`,
đúng định nghĩa của transform. File: `2019-Oct.csv`, `2019-Nov.csv` trong `data/kaggle-cache/...`.

| Cùng mẫu 2,5% user | 12/2019–4/2020 (hiện tại) | 10/2019–4/2020 | Thay đổi |
|---|---:|---:|---:|
| User trong mẫu | 332.347 | 391.303 | +58.956 user chỉ xuất hiện ở 10–11 |
| Khách có mua | 41.258 | 51.969 | +26,0% |
| **Khách ≥ 2 đơn** | **17.737** | **23.478** | **+32,4%** |
| Khách ≥ 3 đơn | 9.782 | 13.374 | +36,7% |
| Khách ≥ 5 đơn | 4.267 | 6.029 | +41,3% |
| Tỉ lệ mua lại trong người mua | 43,0% | 45,2% | |
| Khách ≥ 2 đơn / tổng user | 5,34% | 6,00% | |

- **Đối chiếu chéo**: 391.303 / 0,025 ≈ 15,65 triệu user, khớp số 15.639.803 user 7 tháng của một nguồn
  thứ ba (GitHub `nikchey29/rees46-v2`) — lệch < 0,1% → mẫu hash đại diện đúng.
- **Ngoại suy (chưa đo)**: toàn nguồn 7 tháng ≈ 23.478 / 0,025 ≈ 939 nghìn khách ≥ 2 đơn.
- **Chất lượng log mua 10–11**: 1/61 ngày hỏng — 15/11/2019 có 5.737.111 view, 483.305 cart nhưng **0 purchase**;
  trung vị 24.305 purchase/ngày. Lỗi log giỏ 10–11 đã biết (`rees46-transform-mapping.md` §6.1: 61,5% phiên mua
  không có giỏ) thấy lại ở đây: ngày 1/10 có 16.658 cart < 19.307 purchase.
- **Chưa đo**: panel churn (hiện 31.458 dòng / 10.501 user) sẽ tăng bao nhiêu với 7 tháng.

## 3. Sàng lọc ứng viên

| Nguồn | T1 | T2 | T3 | T4 | T5 | T6 | Ghi chú chính |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| **REES46 đa ngành 10/2019–4/2020** | ✅ | ✅ giây | ✅ 7 th | ✅ giá USD, category, brand | ✅ view/cart (giỏ lỗi 10–11) | ✅ "free, mention the source" | 411,7 triệu sự kiện ⚠️, 15,6 triệu user ⚠️; đã có tool transform; **đã được dùng cho churn trong luận án TS** (M. Fridrich, VUT Brno, bảo vệ 3/11/2023) và bài MNeuralTab 2025 |
| **H&M Fashion Recs** | ✅ | ✅ ngày | ✅ 2 năm | ✅ giá, product_type… | ❌ | ✅ học thuật; cấm phân phối lại | 31.788.324 giao dịch, 1.371.980 khách; 67,1% khách mua ≥ 2 ngày khác nhau ⚠️; RelBench có tác vụ `user-churn` ⚠️ |
| **Tmall IJCAI-15** | ✅ | ⚠️ `mmdd`, không năm/giờ | ✅ 6 th | ⚠️ category/brand, **không giá** | ✅ click/cart/buy/fav | ⚠️ CC BY-NC 4.0; Tianchi cần đăng nhập, mirror Kaggle license Unknown | 54.925.330 dòng, 424.170 user; cart chỉ 76.750 dòng; mẫu "biased"; có tuổi/giới tính |
| Complete Journey 2.0 (84.51°) | ✅ | ✅ | ✅ 1 năm | ✅ | ❌ | ✅ CC0 | 2.469 hộ, siêu thị offline; **có 27 campaign, coupon, redemption_date** |
| X5 RetailHero | ✅ | ✅ | ❓ | ✅ | ❌ | ❓ | 400.162 khách, 45,8 triệu dòng mua; **có `treatment_flg` (SMS) → uplift**; offline; ngẫu nhiên hoá ❓ |
| REES46 Direct Messaging 2021–2023 | ❓ | ✅ | ✅ 2 năm | ❓ | ❌ | ✅ CDLA-Permissive-1.0 | email/push/SMS campaign; 721 triệu message; có/không kết quả mua theo message ❓ |
| Online Retail II | ✅ | ✅ | ✅ 2 năm | ✅ | ❌ | ✅ CC BY 4.0 | khoảng 5,9 nghìn khách ⚠️, nhiều khách sỉ; đã dùng cho thí nghiệm huỷ đơn |
| JData 2018 (JD) | ✅ | ✅ ngày | ✅ 12 th | ⚠️ giá đã ẩn danh | ⚠️ chỉ view/follow | ❌ chỉ link Baidu Pan | trang gốc không truy cập được |
| Acquire Valued Shoppers | ✅ | ❓ | ✅ 1 năm | ❓ | ❌ | ❓ | ~350 triệu dòng, ~300k khách, có offer; siêu thị |
| Diginetica | ⚠️ 232.817 user thật / 333.097 ẩn danh | ⚠️ ngày | ✅ 5 th | ✅ | ✅ | ❓ | **chỉ 18.025 lượt mua** |
| RetailRocket | ⚠️ visitorid | ✅ | ⚠️ 4,5 th | ⚠️ thuộc tính bị băm | ✅ | ✅ CC BY-NC-SA | 22.457 giao dịch |
| JD MSOM 2020 | ✅ | ✅ | ❌ 1 tháng | ✅ | ✅ | ❌ chỉ hội viên MSOM | |
| JData 2019 | ✅ | ✅ giây | ❌ 2,5 th | ✅ | ✅ (cart chỉ 4/8–4/15) | ⚠️ | |
| Taobao UserBehavior | ✅ | ✅ | ❌ **9 ngày** (25/11–3/12/2017) | ⚠️ chỉ category | ✅ | ⚠️ | có sẵn trong máy, không dựng được nhãn 60 ngày |
| Olist | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | chỉ 3,12% khách mua lại ⚠️ |
| Instacart | ✅ | ❌ chỉ số ngày tương đối, chặn ở 30 | — | ⚠️ không giá | ❌ | ❌ trang gốc 404/403 | |
| OTTO / Coveo | ❌ chỉ session | ✅ | ❌ ~6 tuần | — | ✅ | ✅ | |
| dunnhumby Let's Get Sort-of-Real | — | — | — | — | — | ❌ **"dummy data"** | không phải dữ liệu thật |
| REES46 Cosmetics / Electronics / Jewelry | ✅ / ⚠️ 21,4% dòng có user / ⚠️ | | 5 th / ~8 th / 2–3 năm (mâu thuẫn) | | ✅ / ❌ / ❌ | | đơn ngành |

## 4. Đề xuất (chủ đồ án hỏi thẳng)

**Vai trò 1 — dữ liệu trong DB + demo + model production: REES46 đa ngành 7 tháng.**
- Lý do: đạt cả 6 tiêu chí; tool transform đã có; tăng 32% khách mua lặp mà không đổi nguồn; có tiền lệ học thuật
  dùng đúng bộ này cho churn (trả lời câu phản biện "dữ liệu có phù hợp bài toán churn không").
- Việc cần làm: transform nhận thêm 10–11/2019 (nguồn tham chiếu ngành đã dùng 10–11 nên mã ngành 10–11 đúng); xử lý
  ngày 15/11/2019 như `BROKEN_PURCHASE_DAYS`; quyết định cho log giỏ 10–11 (bỏ sự kiện cart 10–11, hoặc giữ và chỉ
  tính feature giỏ từ 12/2019).
- Rủi ro: feature giỏ nếu cửa sổ nhìn lùi chạm 10–11 sẽ lệch vì log giỏ lỗi; RAM/DB khi tăng frac (2,5% được chọn
  để vừa RAM — chưa đo mức tối đa).

**Vai trò 2 — kiểm chứng ngoài (chương "tính tổng quát"), không nạp DB: H&M.**
- Lý do: thật, lớn, 2 năm, nhãn churn dựng được cùng định nghĩa (không mua trong 60 ngày sau cutoff, ≥ 2 đơn trước
  cutoff); có benchmark công khai (RelBench `user-churn`) để đặt kết quả cạnh tham chiếu ngoài.
- Giới hạn: không có hành vi duyệt → chỉ chạy được nhóm feature giao dịch (RFM, nhịp mua, monetary); đây đúng là phép
  thử "phần feature giao dịch có tổng quát sang ngành khác không".
- Dự phòng nếu cần feature hành vi: Tmall IJCAI-15 (có click/cart/fav/buy + tuổi/giới tính), chấp nhận mất năm/giờ và
  thiếu giá.

**Vai trò 3 (tuỳ chọn) — câu hỏi về campaign/voucher: X5 RetailHero hoặc Complete Journey 2.0.**
- Chỉ cần nếu muốn có số đo "gửi campaign có làm khách quay lại không" cho phần Camunda campaign; X5 có nhóm
  treatment/không treatment, Complete Journey có coupon + ngày đổi. Cả hai offline siêu thị → thí nghiệm riêng.

## 5. Về "trộn nhiều nguồn"

| Kiểu trộn | Hợp lệ? | Lý do |
|---|---|---|
| Theo **lớp**: catalog Tiki + hành vi/giao dịch REES46 + tính năng phát sinh thật từ hệ thống | ✅ (đang làm) | mỗi lớp một nguồn thật; người dùng vẫn nguyên vẹn |
| Theo **thí nghiệm**: cùng pipeline chạy trên REES46 (DB) và H&M/Tmall (offline) | ✅ | tăng độ tin cậy kết luận, không tạo người dùng giả |
| Nhiều bộ là **nhóm khách khác nhau** trong cùng DB (vd khách REES46 + khách H&M) | ❌ | khác thời kỳ, ngành, và H&M không có sự kiện duyệt → model học "khách đến từ nguồn nào" thay vì churn |
| **Ghép danh tính** (lịch sử của 2 người ở 2 bộ thành 1 user) | ❌ | tạo người dùng không tồn tại; trái quyết định 2026-10-02 "mỗi lớp một nguồn thật, không nối người dùng khác nhau" |

## 6. Chưa xác minh / bất thường

- Tổng sự kiện REES46 7 tháng có 3 con số: subtitle Kaggle "285 million", arXiv 2505.19643 "≈380M", đếm theo tháng
  411.709.736 (bên thứ ba).
- Mô tả Kaggle của REES46 tự mâu thuẫn về `event_type`; thực tế đa ngành không có `remove_from_cart`.
- Fridrich lọc user ≥ 20 phiên (theo code) và nhãn = không mua trong 4 tuần — khác định nghĩa của đồ án (≥ 2 đơn,
  60 ngày) → AUC hai bên không so trực tiếp được. AUC trong luận án TS: ❓ (toàn văn trả 403).
- H&M: 67,1% mua ≥ 2 ngày là phân tích bên thứ ba, mẫu số chưa rõ; tải H&M phải chấp nhận luật cuộc thi trên Kaggle.
- Tmall IJCAI-15: năm 2014 (KDD'16) vs "2017" (luận văn EUR); mã giới tính lệch giữa các nguồn.
- Online Retail II: UCI ghi CC BY 4.0, OpenML ghi CC0.
- Ước lượng 939 nghìn khách ≥ 2 đơn toàn nguồn là ngoại suy từ mẫu 2,5%.

## 6b. Cách Fridrich (luận án TS, VUT Brno 2023) làm churn trên REES46 — đọc từ code + đo trên dataset công bố

Nguồn: repo `github.com/fridrichmrtn/churn-modeling` (đọc toàn bộ `.py`), dataset Kaggle
`fridrichmrtn/e-commerce-churn-dataset-rees46` v3 (tải về, tự đo), bài MNeuralTab 2025 (đọc toàn văn).
Toàn văn luận án: ❓ (kho VUT trả 403) → **không có số AUC của chính tác giả**.

| Bước | Fridrich | File:dòng |
|---|---|---|
| Dữ liệu | đọc mọi `*.csv.gz` của REES46 đa ngành; dataset công bố bắt đầu 2019-10-01 → dùng **10/2019–4/2020** (kể cả 10–11) ✅ | `load-transform/workhorse.py:23-30` |
| Dịch giờ | `event_time + 6 giờ` | `load-transform/workhorse.py:38` |
| Lọc user | chỉ giữ user có **≥ 20 phiên có mua** (đếm trên TOÀN BỘ 7 tháng, trước khi cắt snapshot) | `load-transform/workhorse.py:49-57` |
| Lợi nhuận | **mô phỏng**: biên lợi nhuận mỗi SP mỗi ngày = random walk quanh N(0,15; 0,05), seed 0 | `load-transform/workhorse.py:206-233,247` |
| Đơn vị dòng | (user, snapshot); 7 snapshot lùi mỗi 4 tuần; mốc cuối = Chủ nhật trước tuần cuối dữ liệu | `customer-model/workhorse.py:107-124` |
| Nhãn | `target_event = 1` nếu **không mua trong 4 tuần** sau split; user không có sự kiện nào sau split cũng = 1 | `customer-model/workhorse.py:40-58` |
| Feature | chỉ dùng sự kiện ≤ split: 186 thống kê phiên (31 biến × mean/sum/min/max/stddev/cv), 20 lag theo "tháng" 4 tuần (4 biến × lag0–3 + ma3), 3 tỉ lệ, **ALS latent factor** 41 (view) + 18 (purchase) ✅ | `base-model.py`, `preference-model.py` |
| Model | LR elastic-net, SVM tuyến tính, SVM RBF (Nystroem), cây, RF, LightGBM (MLP bị comment); tiền xử lý: MinMax → Robust/Quantile/Power → VarianceThreshold → chọn 5–50 feature (tương quan + phân cụm) → over/under/không lấy mẫu | `steps/step-spaces.py:32-244` |
| Tuning | hyperopt TPE 25 lượt, mục tiêu **F1** trên chia ngẫu nhiên 60/40 trong tập train; sau đó `CalibratedClassifierCV` | `hyperopt.py:17-21,43-92` |
| Đánh giá | test = snapshot t ∈ {0,1,2,3}; train = mọi snapshot **cũ hơn** t (cùng user có thể nằm ở cả train và test); ngưỡng 0,5; khoảng tin cậy t qua 4 lần, Wilcoxon giữa các model | `workhorse.py:41-57`, `evaluation.py:26-31,185-213`, `run-modeling.py:17` |
| Bài toán thứ 2 | hồi quy `target_actual_profit` = lợi nhuận chiến dịch giữ chân **mô phỏng**: γ~Beta(2,042; 202,116), ψ~Beta(6,12; 3,15), δ=20 (REES46), 1000 lần; xếp hạng khách theo lợi nhuận kỳ vọng (theo Neslin 2006, Tamaddoni 2015) | `campaign-simulation.py`, `evaluation.py:37-66`, notebook 03 |
| Giải thích | SHAP trên LightGBM: `session_recency_min` (≈ số ngày từ phiên gần nhất) lớn gấp ~4 lần feature thứ 2 (`purchase_number_mean`) — đọc từ hình | notebook 07 |

**Đo trên dataset công bố** ✅: 112.610 dòng × 276 cột, **21.605 user**, churn chung 32,08% (36.130 / 76.480).

| time_step (0 = mới nhất) | split | Dòng | Tỉ lệ churn |
|---|---|---:|---:|
| 0 | 2020-03-29 | 21.605 | **63,4%** |
| 1 | 2020-03-01 | 21.030 | 38,2% |
| 2 | 2020-02-02 | 19.690 | 29,2% |
| 3 | 2020-01-05 | 17.821 | 23,7% |
| 4 | 2019-12-08 | 14.975 | 15,4% |
| 5 | 2019-11-10 | 11.233 | 13,9% |
| 6 | 2019-10-13 | 6.256 | **9,1%** |

(Ngày split suy từ code + kiểm tra `start_yearday_max` của snapshot 4/5/6 = 341/313/285 → 7/12, 9/11, 12/10/2019, khớp.)

**Bất thường (chỉ ghi nhận)**:
- Tỉ lệ churn giảm đều từ 63,4% xuống 9,1% khi lùi về quá khứ. Bộ lọc "≥ 20 phiên có mua" được tính trên cả 7 tháng,
  tức là gồm cả giai đoạn SAU mỗi split — user ở snapshot cũ được chọn vì đã chắc chắn mua nhiều về sau. (Giải thích này
  suy từ code + bảng trên, chưa kiểm chứng bằng thí nghiệm.)
- Train (snapshot cũ, churn 9–38%) và test (snapshot mới, churn đến 63%) có phân phối nhãn rất khác nhau.
- Snapshot 6 chỉ có ~12 ngày lịch sử (1–12/10/2019).

**Bài MNeuralTab 2025 dùng lại dataset này** (Discover Applied Sciences 7:569, đọc toàn văn ✅):
- Chia **ngẫu nhiên 75/25 theo dòng** (§4) → cùng user (tối đa 7 dòng) nằm ở cả train và test; SMOTE; NCA còn 24 thành phần.
- Bảng 10: LR AUC 0,9286; LightGBM 0,9198; model đề xuất **AUC 0,9571, F1 82,49%**. Phần chữ §4.3.2 lại ghi AUC 0,9645,
  F1 96,72%, accuracy 98,43% — **mâu thuẫn với chính bảng 10** (88,63% accuracy).
- Bài viết "REES46 chưa từng được dùng cho churn" trong khi dataset chính là dataset churn của luận án Fridrich.
- Bài không nêu đã loại các cột `target_*` khác (`target_revenue`, `target_actual_profit`…) khỏi feature hay chưa.

## 7. Nguồn

- REES46: https://www.kaggle.com/datasets/mkechinov/ecommerce-behavior-data-from-multi-category-store ·
  https://data.rees46.com/datasets/marketplace/ · https://rees46.com/en/datasets · https://github.com/nikchey29/rees46-v2 ·
  https://arxiv.org/html/2505.19643
- Fridrich: https://www.kaggle.com/datasets/fridrichmrtn/e-commerce-churn-dataset-rees46 ·
  https://github.com/fridrichmrtn/churn-modeling · https://link.springer.com/article/10.1007/s42452-025-07157-0
- REES46 Direct Messaging: https://www.kaggle.com/datasets/mkechinov/direct-messaging
- H&M: https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/rules ·
  https://arxiv.org/html/2407.20060 (RelBench) · https://github.com/Luan-ghub/hm-customer-product-analytics
- Tmall IJCAI-15: https://tianchi.aliyun.com/dataset/42 · https://thesis.eur.nl/pub/72505/Thesis-Draft-Ver3.0.pdf ·
  https://www.kaggle.com/datasets/linxinkui/tianmao
- Taobao UserBehavior: https://tianchi.aliyun.com/dataset/649
- Complete Journey 2.0: https://cran.r-project.org/package=completejourney · dunnhumby: https://www.dunnhumby.com/source-files/
- X5: https://ods.ai/competitions/x5-retailhero-uplift-modeling/data · https://www.uplift-modeling.com/en/latest/api/datasets/fetch_x5.html
- Online Retail II: https://archive.ics.uci.edu/dataset/502/online+retail+ii
- Olist: https://github.com/tolamoye/Olist-E-commerce-Data-Analysis
- Instacart: https://tech.instacart.com/3-million-instacart-orders-open-sourced-d40d29ead6f2
- Diginetica: https://arxiv.org/pdf/1708.04479 · RetailRocket: https://www.kaggle.com/datasets/retailrocket/ecommerce-dataset
- JD: https://arxiv.org/pdf/2212.02255 · https://github.com/RHKeng/2018Jdata_RepurchaseDate · OTTO: https://github.com/otto-de/recsys-dataset
