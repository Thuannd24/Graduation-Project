# AI Churn Detection → Auto-trigger Campaign — Implementation Plan

> Đây là plan triển khai thực thi, đi kèm [`recommendation-complete.md`](recommendation-complete.md)
> (blueprint concept gốc). File này để làm dần từng phase — tick checkbox khi xong, ghi chú lệch
> phát sinh ngay dưới mục tương ứng để không mất context giữa các buổi làm việc.

## Tiến độ

- [x] Phase 0 — Sửa hạ tầng chặn đường
- [x] Phase 1 — Tầng nền dùng chung (`shared-common`) — xem ghi chú lệch bên dưới
- [x] Phase 2 — Write-path hành vi (BE Java) + bảng `user_events` — xem ghi chú lệch bên dưới
- [x] Phase 3 — Seed dữ liệu thật — xem ghi chú lệch bên dưới
- [x] Phase 4 — forecast-service: consumer nạp hành vi — xem ghi chú lệch bên dưới
- [x] Phase 5 — Huấn luyện + đánh giá mô hình — xem ghi chú lệch bên dưới
- [x] Phase 6 — Chấm điểm định kỳ + phát sự kiện rủi ro — xem ghi chú lệch bên dưới
- [x] Phase 7 — Tích hợp campaign (promotion-service + FE) — xem ghi chú lệch bên dưới

---

## Context

Tính năng đích: user xem sản phẩm → thêm giỏ hàng → không thanh toán → AI phát hiện nguy cơ
rời bỏ → tự động kích hoạt campaign khuyến mãi cá nhân hóa qua engine Camunda có sẵn.

**Bản này thay thế hoàn toàn plan trước** sau khi nghiên cứu sâu phát hiện 2 vấn đề làm giả
định của plan cũ sai:

### Phát hiện 1 — Không có dữ liệu user/đơn hàng để ML (blocking)
- `tools/catalog-import/` chỉ seed **sản phẩm (~1.123 SP) + tồn kho**. Không script nào seed
  user/order. Toàn repo **0 file `.sql`/dump/fixture**, không `data.sql`, không seeder user/order.
- `docs/test/01_IDENTITY_USER_SERVICE_TEST_CASES.md:241` ghi "Data seed sẵn: 100 user" — chỉ là
  tiền điều kiện mô tả trên giấy, không có script hiện thực.
- Thực tế: vài chục user đăng ký tay, vài chục đơn, gần như không user nào có ≥2 đơn.
- **Hệ quả:** KMeans 4 cụm trên ~30 user là vô nghĩa thống kê. 13 feature đề xuất trước đó là
  sai (cần ~10 mẫu/chiều → 13 feature đòi 500+ user). → Seed dữ liệu là **điều kiện tiên quyết**,
  không phải việc phụ.

### Phát hiện 2 — 21 tính năng AI đã lên kế hoạch nhưng không chia sẻ tầng nền nào
Khảo sát `docs/` ra 21 tính năng AI (visual search, cross-encoder re-rank, FP-Growth cross-sell,
MMR mixer, GNN Neo4j, LSTM-AE, XGBoost pricing, NL-query dashboard...). Tầng nền đang lỗi:
- **3 quy ước Redis key xung đột** (`user:*:history`, `session:*:history`, `chat:*:history`), lại
  khác blueprint (`sess:{sid}:seq`) → BE Java và AI không cùng hợp đồng dữ liệu.
- Định nghĩa feature trùng/lệch: `recency` ở forecast tính từ `orders`, recs lấy từ Redis — 2
  định nghĩa độc lập cho cùng khái niệm.
- **Không connection pooling** (`get_mysql_connection()` mở connection mới mỗi lần gọi) → Kafka
  consumer xử lý mọi lượt view sẽ sập.
- **Không model persistence** — `rfm.py`/`anomaly.py` fit lại model **mỗi request**. Với churn đây
  là lỗi thật: refit mỗi giờ làm tâm cụm dịch → user "At Risk" giờ này, hết "At Risk" giờ sau
  thuần do khởi tạo lại, không phải do hành vi đổi.

→ **Đầu tư tối ưu là tầng hợp đồng dữ liệu dùng chung**, làm một lần đúng, để 20 tính năng AI
còn lại cắm vào thay vì mỗi cái tự dựng một kiểu.

### Quyết định đã chốt
- Seed đầy đủ: **~500 user + ~3.000 đơn + hành vi**.
- Mô hình: **KMeans segmentation (chọn loại campaign) + classifier xác suất churn (quyết định có
  trigger + ưu tiên)** — có precision/recall/AUC để đánh giá định lượng.
- Không làm: Neo4j, SASRec training, microservice mới.

---

## Phase 0 — Sửa hạ tầng chặn đường

1. `AI/docker-compose.yml`:
   - Sửa `networks.ecommerce-network.name`: `be_ecommerce-network` → **`ecommerce-network`**
     (tên thật do `BE/docker-compose.yml` tạo; hiện AI **không thể** join network của BE).
   - `forecast-service`: thêm `DB_USER/DB_PASSWORD/DB_NAME=ecommerce_order_db` tường minh (đang
     chạy default `ecommerce_product_db` → sai schema), thêm `KAFKA_BOOTSTRAP_SERVERS=kafka:9092`.
   - Thêm volume mount `./models:/app/data/models` để lưu model artifact (Phase 5).
2. `BE/api-gateway/src/main/resources/application.yml` — block route `ai-forecast`: thêm
   `/api/v1/rfm/**`, `/api/v1/risk/**`, `/api/v1/models/**` vào predicate Path.

**Verify:** `docker network ls` đối chiếu tên thật; `curl localhost:8004/health` → UP, log không
lỗi kết nối DB/Kafka.

---

## Phase 1 — Tầng nền dùng chung trong `shared-common` (nền cho cả 21 tính năng)

Tạo trong `AI/shared-common/shared_common/`:

- **`contracts.py`** — nguồn sự thật duy nhất cho tên Redis key + Kafka topic. Giải quyết xung
  đột 3 quy ước: chọn **một** tên chuẩn (đề xuất giữ `user:{uid}:history` / `session:{sid}:history`
  vì recs-service đã đọc sẵn → ít sửa code nhất), rồi **migrate các chỗ lệch** (`recommend.py`
  dùng hằng số từ contracts thay vì hardcode; cập nhật `docs/canvas/recommendation-complete.md`
  cho khớp code thay vì để doc và code nói khác nhau).
- **`pool.py`** — `redis.ConnectionPool` dùng chung + SQLAlchemy engine có pool; hàm
  `get_readonly_engine(db_name)` để tính năng AI sau chỉ gọi lại, không tự viết connection logic.
  Giữ `database.py` cũ cho tương thích nhưng đánh dấu deprecated.
- **`features/`** — định nghĩa feature **một lần duy nhất**, dùng chung cho churn/recs/pricing:
  - `behavior.py`: đọc `user_events` → view count, days_since_last_activity, cart abandon,
    view→cart conversion, category diversity.
  - `rfm.py`: đọc `orders` → recency/frequency/monetary + avg_order_value, cancel_rate,
    discount_dependency.
  - `assembler.py`: ghép thành feature vector chuẩn, có `FEATURE_VERSION` để log lại model đã
    train bằng bộ feature nào.
- **`registry.py`** — `save_model(name, version, artifact, metadata)` / `load_model(name)` lưu
  xuống `/app/data/models`, kèm ghi log run (thời điểm, feature version, metrics) để trả lời được
  "model nào, version nào, chạy lúc nào" khi bảo vệ.
- `setup.py`: khai `install_requires` (pandas/numpy/sqlalchemy/redis) thay vì để mỗi service tự khai.

**Ghi chú lệch phát sinh khi làm Phase 1:**
- Scope xuống 11 feature (bỏ `review_count`/`avg_rating_given` từ product-service và
  `voucher_usage_rate` từ promotion-service) — 2 feature đó cần thêm DB connection + MySQL
  read-only user riêng (thao tác hạ tầng, không làm được thuần từ code). `pool.get_engine()` đã
  hỗ trợ sẵn tham số `user`/`password` riêng nên bổ sung sau này chỉ cần thêm 1 hàm fetch mới
  trong `features/`, không phải sửa kiến trúc.
- Phát hiện + sửa 1 bug thật khi test `registry.py`: version mặc định (`strftime` tới giây) bị
  trùng nếu 2 lần train cách nhau dưới 1 giây → ghi đè mất bản cũ âm thầm. Đã thêm `%f`
  (microsecond) vào format, test lại xác nhận đúng.
- Đã migrate `recs-service/recommend.py` sang dùng `shared_common.contracts` thay vì hardcode
  key string, và cập nhật `docs/canvas/recommendation-complete.md` (mục Redis key) cho khớp
  thực tế `user:{uid}:history`/`session:{sid}:history` thay vì `sess:{sid}:seq` cũ.

---

## Phase 2 — Write-path hành vi (BE Java) + bảng `user_events`

- **product-service**: tạo `event/ProductViewedEvent.java` + `event/producer/ProductViewEventProducer.java`
  (topic `product-viewed-events`, theo pattern `ProductEventProducer` sẵn có); sửa
  `ProductController` nhận header optional `X-User-Id`, publish fire-and-forget sau khi lấy product.
- **order-service**: tạo `event/producer/CartEventProducer.java` publish `CartUpdatedEvent`
  (**DTO đã tồn tại, chưa từng dùng**) lên topic `cart-updated-events`; sửa `CartServiceImpl` gọi
  ở cả 4 method (add/update/remove/clear), publish **sau khi** thao tác dữ liệu thành công.
  Guard: bỏ qua khi `userId` rỗng hoặc `"anonymous"`.
- **order-service**: tạo `entity/UserEvent.java` (`@Table(name="user_events")`) — fields `id,
  userId (String, khớp kiểu `Order.userId`), sessionId, itemId (Long, **không FK** vì product
  thuộc DB khác), actionType, weight, createdAt`, index `(user_id, created_at)` + `(session_id)`.
  Hibernate `ddl-auto: update` tự tạo bảng (dự án không dùng Flyway/Liquibase).

**Verify:** gọi API xem SP/thêm giỏ với `X-User-Id` thật → thấy message trên Kafka UI ở 2 topic
mới; gọi không có header → không có message (guard hoạt động); restart order-service → bảng
`user_events` xuất hiện trong `ecommerce_order_db`.

**Ghi chú lệch phát sinh khi làm Phase 2:**
- `UserEvent.java` có thêm cột `category_id` (nullable, không FK) so với schema gốc trong
  blueprint — cần cho feature `category_diversity_viewed` (Phase 1's `features/behavior.py`)
  mà không phải cross-service JOIN sang product-service. `ProductViewedEvent` mang sẵn
  `categoryId` nên không tốn thêm 1 lượt gọi nào để có dữ liệu này.
- Không thể `mvn compile` để verify (môi trường không có mạng, `grpc-bom` chưa cache trong
  `.m2` nên Maven không đọc nổi parent POM kể cả `-o` offline). Đã review thủ công từng file,
  và bắt được 1 lỗi biên dịch thật khi soát lại: biến `newQuantity` trong `addItemToCart` khai
  báo bên trong `try` block nhưng gọi `publishCartUpdated(...)` lại nằm ngoài — sửa bằng
  `itemRequest.getQuantity()` (đã được set lại cùng giá trị bên trong try, còn scope vì là tham
  số method). **Cần chạy `mvn compile` thật ở máy có mạng trước khi tin tưởng hoàn toàn.**
- `ProductViewEventProducer` KHÔNG guard bỏ qua khi thiếu userId (khác với `CartEventProducer`
  guard `"anonymous"` ngay tại Java) — vì `ProductViewedEvent` không có `sessionId`, việc lọc
  "không có identity nào" chuyển xuống `behavior_consumer.py` ở Phase 4 (đúng như plan đã định).

---

## Phase 3 — Seed dữ liệu thật (mở khóa toàn bộ phần ML)

Tạo `tools/data-seed/` theo đúng pattern `tools/catalog-import/` đã có (Node `.mjs` + package.json).

**Nguyên tắc quan trọng nhất — tránh suy luận vòng tròn:** KHÔNG gán nhãn "user này at-risk" bằng
tay rồi để model tìm lại đúng nhãn đó (như vậy đánh giá vô nghĩa). Thay vào đó sinh dữ liệu từ
**tiến trình sinh có tham số ẩn**, để trạng thái rời bỏ *xuất hiện tự nhiên*:
- Mỗi user có tham số ẩn: tần suất mua (λ), độ nhạy giá, ngành hàng ưa thích, xu hướng λ theo thời
  gian (một phần user có λ giảm dần → rời bỏ tự nhiên, không dán nhãn).
- ~500 user; đơn hàng sinh theo tiến trình Poisson theo λ riêng rải trên 12 tháng (~3.000 đơn
  `DELIVERED`), giá trị đơn theo phân bố lognormal/Pareto (lệch thật, không đều).
- Hành vi (~30-50k event `user_events`): view/cart nhất quán với đơn hàng (có xem trước khi mua),
  kèm tỉ lệ bỏ giỏ thực tế.
- Gắn vào ~1.1k sản phẩm **có sẵn** từ catalog-import.
- Script phải **idempotent** + có `--dry-run`.

**Chia đôi tập user:** ~10 user tạo qua **Keycloak Admin API** để đăng nhập thật được (phục vụ
demo end-to-end); ~490 user còn lại insert trực tiếp DB làm "dân số thống kê" cho train model
(không cần login). Giữ `userId` nhất quán giữa user-service DB và `orders`/`user_events`.

**Ghi chú trung thực bắt buộc đưa vào báo cáo:** dữ liệu là tổng hợp (synthetic), nên metric đo
được phản ánh "model có phục hồi được cấu trúc sinh dữ liệu hay không", **không phải** "model dự
đoán đúng hành vi người thật". Đây là giới hạn chính đáng của đồ án, nhưng phải nói rõ.

**Verify:** query phân bố sau seed (số user có ≥2 đơn, histogram recency/monetary) → xác nhận
lệch thật chứ không phẳng; `SELECT COUNT(*)` trên `orders`/`user_events` đúng khối lượng.

**Ghi chú lệch phát sinh khi làm Phase 3:**
- Xây ở `tools/data-seed/` (Node.js, theo đúng pattern `tools/catalog-import/`), KHÔNG qua REST
  API (khác nhẹ so với catalog-import) — vì cần backdate `created_at` của order/event trải 12
  tháng, mà API tạo đơn luôn set `createdAt = now()`. Ghi thẳng vào DB qua `mysql2` là cách duy
  nhất khả thi cho việc này.
- Phát hiện quan trọng: `X-User-Id` trong toàn hệ thống là **Keycloak UUID** (sub claim JWT), không
  phải `users.id` nội bộ (xem `BE/api-gateway/.../UserHeaderFilter.java`) — nên 490 user chỉ-để-train
  (không có tài khoản Keycloak thật) vẫn cần 1 UUID hợp lệ (`crypto.randomUUID()`) làm
  `keycloak_user_id`/`orders.user_id`/`user_events.user_id`, đánh dấu nhận diện qua email
  `*@seed.internal` thay vì encode vào UUID.
- Đã test được toàn bộ logic KHÔNG cần Docker chạy: phân phối Poisson/log-normal đúng kỳ vọng,
  mô phỏng cho thấy user "rời bỏ" có `days_since_last_activity` lớn hẳn (122 ngày ở 1 test case)
  mà không cần dán nhãn tay, sinh user không trùng UUID/email, và SQL bulk-insert khớp chính xác
  số placeholder/tham số (test qua mock `mysql2.createPool`). **Chưa test được ghi DB thật** (Docker
  Desktop không chạy trong môi trường này) — cần chạy `npm run seed:dry-run` rồi `npm run seed`
  thật trên máy có Docker trước khi tin tưởng hoàn toàn phần ghi dữ liệu.
- Số liệu thực tế từ test mô phỏng (500 user, seed=42): ~3.500 đơn, ~63.000 event — hơi nhiều hơn
  mục tiêu "~3.000 đơn/30-50k event" nhưng đây không phải vấn đề (nhiều dữ liệu hơn giúp model ổn
  định hơn), không cần tinh chỉnh lại tham số λ.

---

## Phase 4 — forecast-service: consumer nạp hành vi thời gian thực

- `requirements.txt`: thêm `aiokafka` (async, khớp event loop FastAPI).
- `app/kafka/behavior_consumer.py`: `BehaviorEventConsumer` chạy nền qua `asyncio.Task` (start ở
  FastAPI lifespan), subscribe `product-viewed-events` + `cart-updated-events`. Mỗi message:
  chuẩn hóa `action_type` → (a) ghi Redis sequence dùng **key từ `contracts.py`** (LPUSH/LTRIM 50/
  EXPIRE) → recs-service đọc được ngay (lợi ích phụ: "sửa" luôn mục Gợi ý cho bạn ở Trang chủ);
  (b) insert `user_events` qua **pool.py**, không mở connection mới mỗi event.
- Guard: bỏ qua event không có cả userId lẫn sessionId. Lỗi 1 message không được giết consumer loop.

**Verify:** thao tác trên FE → `redis-cli LRANGE user:<id>:history 0 -1` có item; `user_events` có
record mới; consumer group offset không lag trên Kafka UI.

**Ghi chú lệch phát sinh khi làm Phase 4:**
- Redis/DB client dùng bản đồng bộ (sync) của `shared_common`, gọi tuần tự trong consumer loop
  thay vì driver async — đơn giản hơn, tự nhiên tạo backpressure, đánh đổi throughput thấp hơn
  (chấp nhận được ở quy mô đồ án). `aiokafka` (bản thân consumer) vẫn async để không chặn FastAPI.
- Đã test được: toàn bộ 6 kịch bản parse message (view có/không userId, cart ADD_ITEM,
  CLEAR_CART không có item_id, action lạ bị từ chối, parse timestamp) bằng cách gọi trực tiếp
  `_parse_message`/`_parse_timestamp` trong venv thật — không cần Kafka chạy vì đây là hàm
  thuần (pure function), tách riêng khỏi phần I/O. Đã import thành công toàn bộ `app.main`
  (FastAPI + lifespan + consumer) trong venv có đủ dependency — xác nhận wiring không lỗi.
  **Chưa test được với Kafka/Redis/MySQL thật** (cần Docker chạy).

---

## Phase 5 — Huấn luyện + đánh giá mô hình (tách fit / predict)

Tạo `AI/forecast-service/app/training/`:

- **Sinh nhãn churn (supervised)**: cắt mốc thời gian T; feature tính từ dữ liệu **đến T**; nhãn =
  1 (churn) nếu user **không có hoạt động/đơn nào** trong `(T, T+30 ngày]`. Chỉ train trên phần
  lịch sử có `T+30 < hiện tại` để nhãn đã biết → **temporal split** đúng chuẩn, không rò rỉ tương lai.
- **Mô hình 1 — KMeans segmentation**: tái dùng logic `rfm.py` sẵn có, `k=4`, nhưng dùng feature
  vector từ `shared_common.features.assembler` (10-13 chiều, hợp lệ vì đã có ~500 user). Đánh giá
  bằng silhouette score + mô tả tâm cụm.
- **Mô hình 2 — Churn classifier**: **Logistic Regression** (`class_weight='balanced'`) — chọn LR
  vì cho xác suất hiệu chỉnh tốt, ít tham số (an toàn với ~500 mẫu), và **giải thích được hệ số**
  (nói được "feature nào đẩy rủi ro lên" khi bảo vệ). Đánh giá: precision/recall/F1/AUC +
  confusion matrix trên tập test theo thời gian.
- **Sửa bug `rfm.py`**: bỏ hẳn fallback sinh 100 user giả khi query lỗi → raise lỗi rõ ràng.
- Persist scaler + KMeans + LR qua `registry.py` kèm version, feature version, metrics.
- Endpoint `POST /api/v1/models/train` (admin, chạy tay khi demo) + tùy chọn lịch hàng ngày.

**Verify:** gọi train → xem log metrics (AUC, precision/recall), file artifact xuất hiện trong
`AI/models/`; xác nhận không còn log "Running simulation".

**Ghi chú lệch phát sinh khi làm Phase 5:**
- Thêm `POST /api/v1/models/train` (mới) làm nơi DUY NHẤT fit model; `POST /api/v1/rfm/trigger`
  (endpoint cũ, giữ nguyên contract cho FE admin) giờ chỉ *predict* bằng model đã lưu qua
  `app/services/risk_scoring.py` — nếu chưa train lần nào sẽ raise lỗi rõ ràng (500 kèm thông báo
  "Chạy /models/train trước") thay vì âm thầm trả dữ liệu giả như code cũ.
- Nhãn churn sinh theo panel 6 mốc thời gian (60-210 ngày trước, cách nhau 30 ngày) — mỗi mốc
  đóng góp ~500 dòng train, nhân hiệu quả dữ liệu train lên ~3.000 dòng dù chỉ có 500 user (kỹ
  thuật "panel/multiple snapshot" phổ biến cho churn modeling khi ít user). Mốc gần nhất giữ lại
  làm test set (temporal holdout, không random split) — mô phỏng đúng tình huống thật: model chỉ
  thấy quá khứ, đánh giá trên dữ liệu "tương lai" so với lúc train.
- Đã test được TOÀN BỘ cơ chế pipeline (train → save → load → predict) bằng cách giả lập tầng đọc
  dữ liệu (monkey-patch `build_feature_matrix`/`compute_churn_labels`) — xác nhận không lỗi,
  metrics đúng khoảng giá trị hợp lệ, version giữa KMeans/classifier khớp nhau, predict() ra đúng
  shape. **AUC trong test ~0.5 (ngẫu nhiên) là do dữ liệu giả trong test không tương quan với nhãn
  giả — không phải lỗi code**, chỉ có thể đánh giá AUC thật khi train trên dữ liệu seed thật
  (Phase 3) qua DB thật.

---

## Phase 6 — Chấm điểm định kỳ + phát sự kiện rủi ro

- `app/services/risk_scheduler.py`: `AsyncIOScheduler` (apscheduler), `max_instances=1`, chu kỳ qua
  env `RISK_SCAN_INTERVAL_HOURS` (default 1). Job **chỉ `predict()`** bằng artifact đã lưu — không
  refit → phân cụm ổn định, không "flapping" giữa các lần chạy.
- Điều kiện trigger 2 tầng: **AI** cho `segment` (chọn loại campaign) + `churn_probability` (có
  trigger hay không, ngưỡng qua env) — **rule** cho thời điểm (`có bỏ giỏ hàng gần đây`).
- `app/kafka/risk_producer.py`: publish topic `user-risk-events`, `eventUniqueId = f"{userId}:{yyyyMMdd}"`
  (tận dụng dedupe theo businessKey sẵn có ở `CampaignTriggerService`), payload mang `churnProbability`
  + `segment` để dùng làm biến điều kiện trong BPMN.
- Endpoint debug `POST /api/v1/risk/trigger-scan` để demo không phải đợi lịch.

**Verify:** gọi trigger-scan → log "Published ChurnRiskDetectedEvent", message trên
`user-risk-events` đúng format `eventUniqueId`.

**Ghi chú lệch phát sinh khi làm Phase 6:**
- Thêm `app/state.py` (không có trong plan gốc) để giữ singleton `behavior_consumer`/
  `risk_producer`/`risk_scheduler` — cần thiết để tránh circular import giữa `main.py` (khởi tạo
  lifespan) và `forecast.py` (endpoint `/risk/trigger-scan` cần gọi `risk_scheduler` tay).
- Sửa lại 3 chỗ tài liệu sai trong Phase 1 (`features/behavior.py`, `features/rfm.py`): ghi nhầm
  "user_id (int)" — thực ra là String/Keycloak UUID (phát hiện ở Phase 3). Không phải bug logic
  (SQL/pandas không ép kiểu ở đâu), chỉ là docstring/type-hint sai, đã sửa lại chính xác.
- Đã test: import toàn bộ `app.main` với `apscheduler` cài thật, xác nhận không circular import,
  và cả 3 route (`/models/train`, `/rfm/trigger`, `/risk/trigger-scan`) đăng ký đúng (kiểm bằng
  cách duyệt đệ quy `original_router` — FastAPI bản mới bọc router include khác cấu trúc cũ).
  **Chưa test được chạy APScheduler thật/publish Kafka thật** (cần Docker).

---

## Phase 7 — Tích hợp campaign (promotion-service + FE)

**Bắt buộc cả 2, thiếu 1 là mất chống trùng:**
- `PromotionKafkaConsumer.java`: thêm `@KafkaListener(topics="user-risk-events")` theo pattern 4
  consumer sẵn có → `campaignTriggerService.triggerByEventType("Trigger_Event_ChurnRisk", variables)`.
- `CampaignTriggerService.resolveEventUniqueId(...)`: thêm nhánh `Trigger_Event_ChurnRisk` đọc
  `eventVariables.get("eventUniqueId")`. **Bỏ qua bước này → trả null → chạy không có businessKey
  → mất hoàn toàn khả năng chống trigger trùng trong ngày.**

Đăng ký trigger type mới (chỉ thêm 1 entry, không đổi logic): `BpmnCompilerService.java`
(`TRIGGER_TYPES` — nếu thiếu, compiler hiểu nhầm node là `serviceTask` thay vì `startEvent`),
`WorkflowTriggerResolver.java`, `WorkflowValidatorService.java`.

FE campaign builder (`FE/src/features/admin/components/campaigns/`) — chỉ thêm entry:
`constants.js` (NODE_TYPES), `PropertyPanel.jsx` (dropdown), `utils/bpmn.js`,
`utils/clientValidation.js`, `utils/nodeDisplay.js`. `fields/TriggerFields.jsx` không cần sửa.

**Lợi thế thêm:** vì `churnProbability` được truyền vào process variables, admin có thể dựng nhánh
điều kiện trong BPMN theo mức rủi ro (rủi ro cao → voucher lớn, rủi ro vừa → chỉ email nhắc) mà
không cần code thêm.

**Verify end-to-end:** dựng campaign trong FE (Trigger = Nguy cơ rời bỏ → Action = voucher/email)
→ Activate → trigger risk-scan → Camunda Cockpit có Process Instance với đúng businessKey →
voucher/email tới đúng user → gọi lại lần 2 cùng ngày → **không** có instance thứ 2 (dedupe OK).

**Ghi chú lệch phát sinh khi làm Phase 7:**
- Xác nhận `CampaignVariableEnricher.resolveUserDbId()` (Java, có sẵn từ trước) **đã tự xử lý
  đúng** trường hợp `userId` dạng Keycloak UUID (kiểm tra `contains("-")` → gọi
  `userClient.getProfileByKeycloakId()` để suy ra `userDbId` nội bộ + email/phone) — không cần
  sửa gì thêm ở đây, dù lo ngại ban đầu là service này có thể giả định userId luôn là số.
- `passesTriggerFilter()` không có case riêng cho `Trigger_Event_ChurnRisk` → mặc định trả `true`
  (không lọc thêm điều kiện), giống hệt `Trigger_Event_NewUser` — đúng ý đồ vì node loại này
  không có property nào trong `constants.js` (`def: {}`).
- Đã review thủ công toàn bộ 5 file Java thay đổi (không compile được, thiếu mạng) + syntax-check
  bằng `node --check` cho 4 file JS thuần (`constants.js`, `bpmn.js`, `clientValidation.js`,
  `nodeDisplay.js`); `PropertyPanel.jsx` là JSX nên không check được bằng cách này, chỉ review
  thủ công (thay đổi 1 dòng, rủi ro thấp).

---

## Rủi ro / Giới hạn đã biết

- **Dữ liệu synthetic** — metric đo cấu trúc sinh dữ liệu, không phải hành vi người thật. Phải nói
  rõ trong báo cáo (đã ghi ở Phase 3).
- **Chỉ chính xác với user đã đăng nhập** — guest hiện dùng chung `X-User-Id: anonymous` (bug có
  sẵn, ngoài phạm vi); pipeline chủ động bỏ qua identity không thật.
- **Mất cân bằng nhãn churn** — dùng `class_weight='balanced'`, báo cáo precision/recall thay vì
  chỉ accuracy (accuracy vô nghĩa khi lệch lớp).
- **`user_events` không unique theo `eventId`** — Kafka at-least-once có thể tạo bản ghi trùng thưa
  thớt; chấp nhận vì COUNT/MAX không nhạy cảm. Follow-up nếu cần chặt hơn.
- **Ổn định cụm giữa các lần train** — nhãn cụm (0,1,2,3) có thể đổi thứ tự sau mỗi lần fit; phải
  gán nhãn theo **đặc trưng tâm cụm** (như code hiện tại đang làm) chứ không theo cluster_id.
- **Keycloak sync** — 490 user seed không tồn tại trong Keycloak (không login được); chỉ 10 user
  demo là end-to-end thật. Cần nhớ khi demo.

## Critical Files

- `AI/shared-common/shared_common/{contracts,pool,registry}.py`, `features/`
- `tools/data-seed/` (mới)
- `AI/forecast-service/app/{kafka,training}/`, `app/services/rfm.py`, `risk_scheduler.py`
- `BE/order-service/.../{entity/UserEvent.java, event/producer/CartEventProducer.java, service/impl/CartServiceImpl.java}`
- `BE/product-service/.../controller/ProductController.java`
- `BE/promotion-service/.../{event/consumer/PromotionKafkaConsumer.java, service/CampaignTriggerService.java}`
- `AI/docker-compose.yml`, `BE/api-gateway/src/main/resources/application.yml`
