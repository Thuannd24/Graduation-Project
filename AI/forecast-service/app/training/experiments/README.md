# experiments/ — thí nghiệm đo lường, KHÔNG phải code production

Script ở đây **không được service nào import** (production không gọi tới thư mục này). Phần lớn là các
phép đo một lần dùng để **quyết định có nên đầu tư vào một hướng ML hay không** — chạy tay, đọc số, rồi
ghi kết luận vào `docs/AI/churn-risk-log.md` (churn) hoặc các file `docs/AI/recsys-*.md` (gợi ý).

**Ngoại lệ — có script GHI model:**
- `retrain_on_real_rees46.py` gọi đúng `train_and_evaluate()` của production (ghi đè tham số thời gian:
  nhãn 60 ngày, `LABEL_VERSION = churn_label_v3_orders_60d_min2_rees46real`), **lưu model và cập nhật
  `latest.json` nếu qua retrain gate** — tức là ĐỔI model mà forecast-service đang phục vụ. Mặc định trỏ
  `MODELS_DIR`/`REPO_ROOT` về `D:/JAVA/Graduation-Project` (máy cũ), phải đặt lại biến môi trường trước khi chạy.
- `recsys_sasrec.py`, `recsys_platform_sasrec.py` lưu checkpoint SASRec (`torch.save`, mặc định vào `/tmp/...pt`,
  đổi được qua `SASREC_MODEL_PATH` / `PLATFORM_SASREC_MODEL_PATH`).

Lý do tách riêng: mọi thứ trong `app/training/` còn lại đều nằm trên đường đi của
`POST /api/v1/models/train` (production). Trộn code thí nghiệm vào đó sẽ khiến người sau không biết
cái nào đang thật sự chạy.

## `cart_abandon_build_dataset.py` + `cart_abandon_rule_vs_ml.py`

Trả lời câu hỏi: **bài toán bỏ giỏ hàng có thuộc lớp mà rule KHÔNG bắt kịp được không?**

Dữ liệu: [RetailRocket clickstream](https://www.kaggle.com/datasets/retailrocket/ecommerce-dataset)
— hành vi người thật, 2,76M event. Tải bằng `kagglehub.dataset_download("retailrocket/ecommerce-dataset")`
(không cần xác thực), rồi copy `events.csv` vào `/tmp/rr_events.csv` trong container (hoặc đặt `RR_EVENTS_PATH`).

```bash
docker cp .../cart_abandon_build_dataset.py .../cart_abandon_rule_vs_ml.py ai-forecast-service:/tmp/
docker exec ai-forecast-service python /tmp/cart_abandon_build_dataset.py  # dựng nhãn + feature -> /tmp/seq_dataset.csv
docker exec ai-forecast-service python /tmp/cart_abandon_rule_vs_ml.py     # đo 4 mốc
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

## Danh sách script (theo nhóm)

| Nhóm | Script |
|---|---|
| Churn trên REES46 thật (2026-10) | `retrain_on_real_rees46.py` (re-baseline, **ghi model**), `ablation_on_real_rees46.py`, `rule_benchmark_on_real_rees46.py`, `algorithm_comparison_on_real_rees46.py`, `algorithm_comparison_full_on_real_rees46.py`, `fast_panel_builder.py` + `fast_candidates_builder.py` (panel builder pandas thay SQL chậm) |
| Churn — chẩn đoán / kiểm lại ablation | `diagnose_model_ceiling.py`, `churn_signal_decomposition.py`, `ablation_paired_retest.py`, `ablation_repeated_retest.py`, `churn_product_block.py` |
| Churn — neo số bằng dữ liệu ngoài | `churn_fit_bgnbd.py`, `churn_bgnbd_benchmark.py`, `churn_cancel_feature_onlineretail.py`, `churn_measure_amazon_repurchase.py`, `churn_measure_category_repurchase.py`, `churn_measure_cart_recovery.py`, `churn_measure_prechurn_behavior.py`, `churn_measure_session_split.py` |
| Bỏ giỏ / thứ tự hành vi | `cart_abandon_build_dataset.py`, `cart_abandon_rule_vs_ml.py`, `cart_sequence_early_warning.py`, `synthetic_sequence_dgp.py`, `cosmetics_build_dataset.py`, `cosmetics_order_test.py`, `cosmetics_order_importance.py` |
| Nâng cấp feature space (xem `docs/AI/feature-space-upgrade-plan.md`) | `build_item_features.py`, `build_population_features.py`, `measure_feature_groups.py`, `measure_feature_groups_repeated.py`, `measure_rule_parity.py`, `l1_path_AC.py`, `corr_audit.py`, `coverage_audit.py` |
| Khảo sát dữ liệu | `signal_survey.py`, `dataset_richness_survey.py`, `taobao_richness.py`, `taobao_timeline_check.py` |
| Recsys / SASRec | `recsys_build_interactions.py`, `recsys_filter_strong_signal.py`, `recsys_build_sequences.py`, `recsys_item_category_map.py`, `recsys_gts_baseline.py`, `recsys_pipeline.py`, `recsys_sasrec.py` (**ghi checkpoint**), `recsys_platform_sasrec.py` (**ghi checkpoint**), `recsys_platform_bootstrap_ci.py`, `run_platform_multiseed.sh`, `run_platform_multiseed_detached.sh` |
| Recsys — đo hành vi để lái bộ sinh dữ liệu | `recsys_behavior_stats.py`, `recsys_measure_behavior_patterns.py`, `recsys_measure_behavior_patterns_taobao.py`, `recsys_measure_item_popularity.py`, `recsys_measure_recency_baseline.py`, `recsys_measure_revisit_patterns.py` |
| Colab | `build_colab_notebook.py`, `colab_env_check.ipynb`, `colab_train_smoke.ipynb`, `colab_train_overnight.ipynb` |
