# Recommendation (SASRec) + Behavior Tracking — Preview luồng chi tiết & Kết quả chạy thật

> **Phạm vi:** phần việc P1 trong [`recsys_security_2_month_plan.md`](recsys_security_2_month_plan.md).
> **Ngày chạy:** 2026-09-26, trên máy local (Docker infra + service Python chạy trực tiếp), branch `ai/behavoir` @ `20fd2a4`.
> **Nguyên tắc:** mọi số ở đây là số **đo được khi chạy**, không lấy lại từ tài liệu cũ. Dữ liệu là **seed tổng hợp**
> (`tools/data-seed`) — chỉ dùng để kiểm hệ thống chạy đúng, **không** dùng để kết luận về hành vi người thật
> (đúng nguyên tắc §9 của [`recsys-execution-plan.md`](recsys-execution-plan.md)).

---

## 0. Tóm tắt 1 phút

| Hạng mục | Trạng thái | Ý chính |
|---|---|---|
| Ingest hành vi (FE → forecast-service → Kafka → consumer → Redis + MySQL) | ✅ **Chạy được** | Độ trễ consumer ~0,5 s; validate action/batch đúng (422) |
| Train SASRec `platform_v1` | ✅ **Chạy được** | 31 phút CPU, dừng sớm epoch 20, checkpoint được service nạp |
| Serving `recs-service` | ✅ **Chạy được** | p50 14 ms / p95 26 ms với SASRec (mục tiêu < 200 ms) |
| **Người dùng thật có nhận gợi ý cá nhân hoá không?** | ❌ **Không** | FE gọi API **không kèm `user_id`** → luôn rơi về Popularity; mà Popularity lại xếp **tuỳ ý** vì `sales_count` = 0 toàn bộ |
| SASRec có hơn Recency không? | ⚠️ **Tuỳ cách phục vụ** | Hơn có ý nghĩa **nếu cho gợi ý lại item đã xem** (HR@10 0,267 vs 0,212); nhưng code service **lọc item đã xem** + **đảo thứ tự lịch sử** → chỉ còn 0,066, **thua Recency 3,2 lần** |
| Micro-behavior (19 ký hiệu) có đi vào AI không? | ❌ **Chưa** | SASRec chỉ dùng `item_id` của VIEW/ADD_TO_CART; seed không sinh micro-behavior; event FE mất `user_id` và lệch múi giờ 7 h |

**Kết luận:** hạ tầng đầu-cuối đã có và chạy, nhưng **có 5 lỗi chặn** khiến tính năng "AI gợi ý" chưa thực sự tới tay người
dùng và chưa phản ánh đúng chất lượng model (xem §5). Tất cả đều sửa nhỏ, không cần đổi kiến trúc.

---

## 1. Kiến trúc tổng thể

```
                         ┌─────────────────────── BEHAVIOR TRACKING ───────────────────────┐
 Trình duyệt (React)     │                                                                  │
 ┌──────────────────┐    │  (A) Vi hành vi: IMPRESSION, SCROLL_DEPTH, TAB_HIDDEN, ...       │
 │ behaviorTracker  │────┼──POST /api/v1/public/behavior/events (gom lô 10 s / ≤200)──┐     │
 │ .ts (queue)      │    │                                                           ▼     │
 └──────────────────┘    │                                             ┌───────────────────┐│
 ┌──────────────────┐    │  (B) GET /public/products/{id}              │ forecast-service  ││
 │ ProductDetail    │────┼──► product-service ──► topic               │ :8004             ││
 │ Page             │    │     ProductViewEventProducer   product-viewed-events          ││
 └──────────────────┘    │                                      │      │ ingest endpoint   ││
 ┌──────────────────┐    │  (C) POST/PUT/DELETE cart            │      │  └► BehaviorEvent ││
 │ CartPage         │────┼──► order-service ──► topic           │      │     Producer ──► topic
 └──────────────────┘    │     CartEventProducer  cart-updated-events  │  user-behavior-events
                         │                                      │      │                   ││
                         │                                      ▼      ▼                   ││
                         │                       ┌──────────────────────────────────┐      ││
                         │                       │ BehaviorEventConsumer (asyncio)  │      ││
                         │                       │ group forecast-service-behavior  │      ││
                         │                       └──────────┬───────────────┬───────┘      ││
                         │                     chỉ VIEW/CART│               │ MỌI event    ││
                         │                                  ▼               ▼              ││
                         │                Redis user:{uid}:history   MySQL ecommerce_order_db
                         │                session:{sid}:history      .user_events         ││
                         │                (LPUSH, giữ 50, TTL 30 ngày)                     ││
                         └──────────────────────────────────┬───────────────┬──────────────┘
                                                            │               │ (offline)
                         ┌──────────── SERVING ─────────────┼───┐   ┌───────▼──────────────┐
                         │ recs-service :8003               │   │   │ recsys_platform_     │
 HomePage ──GET /api/v1/recommendations/personal?user_id=───┼──►│   │ sasrec.py (PyTorch)  │
  (qua api-gateway :8080, route ai-recs)                    │   │   │  → platform_sasrec.pt│
                         │  thang chiến lược:               │   │   └───────┬──────────────┘
                         │  1. SASRec  (nếu có ckpt platform_v1) ◄──────────┘ MODEL_WEIGHTS_PATH
                         │  2. Recency (item vừa xem)       │   │
                         │  3. Popularity (sales_count)     │   │
                         │  → tra name/price ở ecommerce_product_db.products
                         └──────────────────────────────────────┘
```

---

## 2. Preview luồng từng bước

### 2.1 Luồng A — Vi hành vi từ FE

| # | Bước | Code | Chi tiết |
|---|---|---|---|
| A1 | Khởi động tracker | [`main.jsx:16`](../../FE/src/main.jsx#L16) → [`initBehaviorTracker`](../../FE/src/services/behaviorTracker.ts#L147) | Gắn listener `visibilitychange`, `scroll` (passive), `popstate`, `pagehide`; `setInterval` flush 10 s |
| A2 | Sinh event | các `trackBehavior(...)` rải ở CartPage, CheckoutPage, CategoryPage, SearchPage, ProductDetailPage, SuggestedSection | Event = `{actionType, itemId?, categoryId?, weight?, timestamp, sessionId}` |
| A3 | Timestamp | [`behaviorTracker.ts:116`](../../FE/src/services/behaviorTracker.ts#L116) | `new Date().toISOString().slice(0,19)` — **giờ UTC**, không có hậu tố `Z` |
| A4 | Session | [`behaviorTracker.ts:59`](../../FE/src/services/behaviorTracker.ts#L59) | `sessionStorage["techstore_session_id"]` — **dùng chung** với header `X-Session-Id` của `apiClient` |
| A5 | IMPRESSION | [`trackImpressions`](../../FE/src/services/behaviorTracker.ts#L133) | Fan-out 1 event / sản phẩm, tối đa 20 / danh sách |
| A6 | Gom lô & gửi | [`flushBehavior`/`sendBatch`](../../FE/src/services/behaviorTracker.ts#L73) | Mỗi 10 s, hoặc khi đủ 200, hoặc khi ẩn tab/rời trang (`sendBeacon`). `fetch` **không gắn Authorization** |
| A7 | Gateway | [`application.yml:137`](../../BE/api-gateway/src/main/resources/application.yml#L137) route `ai-forecast` | `/api/v1/public/behavior/**` → `:8004`. Strip `X-User-*` của client, chỉ inject từ JWT (nếu có) |
| A8 | Validate | [`models/behavior.py`](../../AI/forecast-service/app/models/behavior.py) | `actionType ∈ FE_BEHAVIOR_ACTIONS` (14 loại), `weight ∈ [0, 86400]`, lô ≤ 200 → sai thì **422 cả lô** |
| A9 | Publish | [`ingest_behavior_events`](../../AI/forecast-service/app/api/endpoints/forecast.py#L279) → [`BehaviorEventProducer.publish_batch`](../../AI/forecast-service/app/kafka/behavior_producer.py) | Topic `user-behavior-events`, key = `sessionId` (giữ thứ tự trong phiên). Luôn trả 200 kể cả publish lỗi |

### 2.2 Luồng B — Xem sản phẩm (VIEW_PRODUCT)

| # | Bước | Code | Chi tiết |
|---|---|---|---|
| B1 | FE gọi chi tiết SP | [`productApi.getProductDetail`](../../FE/src/services/productApi.ts#L152) | `GET /public/products/{id}` kèm `X-Session-Id` (+ JWT nếu đăng nhập) |
| B2 | Controller | [`ProductController.java:48`](../../BE/product-service/src/main/java/com/ecommerce/productservice/controller/ProductController.java#L48) | Đọc `X-User-Id` (Keycloak `sub`, UUID), `X-Session-Id` |
| B3 | Publish | [`ProductViewEventProducer`](../../BE/product-service/src/main/java/com/ecommerce/productservice/event/producer/ProductViewEventProducer.java) | Topic `product-viewed-events`, key = productId, `timestamp = LocalDateTime.now()` (**giờ local của JVM**) |

⚠️ Mọi nơi gọi `getProductDetail` đều bị tính là "xem": ngoài `ProductDetailPage` còn có
[`InventoryTab.jsx:102`](../../FE/src/features/admin/components/InventoryTab.jsx#L102) (admin, gọi hàng loạt),
`OrderDetailPage`, `ProfilePage`, `ProductReviewsTab`, `AddProductTab`.

### 2.3 Luồng C — Thao tác giỏ hàng

| # | Bước | Code | Chi tiết |
|---|---|---|---|
| C1 | Cart API | `CartController` → [`CartServiceImpl`](../../BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/CartServiceImpl.java#L294) | ADD_ITEM / UPDATE_QTY / REMOVE_ITEM / CLEAR_CART |
| C2 | Publish | [`CartEventProducer`](../../BE/order-service/src/main/java/com/ecommerce/orderservice/event/producer/CartEventProducer.java) | Topic `cart-updated-events`, key = userId. **Bỏ qua khách vãng lai** (`userId = "anonymous"`) |

### 2.4 Luồng D — Consumer ghi Redis + MySQL

[`BehaviorEventConsumer`](../../AI/forecast-service/app/kafka/behavior_consumer.py) chạy nền trong lifespan của forecast-service.

1. Subscribe 3 topic, `group_id=forecast-service-behavior-group`, `auto_offset_reset=earliest`, commit thủ công sau **mỗi** message.
2. `_parse_message` chuẩn hoá về `{user_id, session_id, item_id, category_id, action_type, weight, created_at}`
   (cart action map qua `CART_ACTION_MAP`, FE action kiểm lại `FE_BEHAVIOR_ACTIONS`).
3. Bỏ event không có cả `user_id` lẫn `session_id`.
4. `_write_to_redis` — **chỉ** khi `action_type ∉ FE_BEHAVIOR_ACTIONS` và có `item_id`:
   `LPUSH key item_id` → `LTRIM 0 49` → `EXPIRE 30 ngày`, với `key = user:{uid}:history` (ưu tiên) hoặc `session:{sid}:history`.
   → Redis giữ **50 item gần nhất, mới nhất ở đầu (newest-first)**.
5. `_write_to_db` — INSERT **mọi** event vào `ecommerce_order_db.user_events` (bảng do Hibernate của order-service tạo từ
   [`UserEvent.java`](../../BE/order-service/src/main/java/com/ecommerce/orderservice/entity/UserEvent.java)).

### 2.5 Luồng E — Train SASRec (offline)

[`recsys_platform_sasrec.py`](../../AI/forecast-service/app/training/experiments/recsys_platform_sasrec.py):

1. Đọc `user_events` với `action_type IN (VIEW_PRODUCT, ADD_TO_CART)`, sắp theo `user_id, created_at`.
2. Map `product_id → index 0..n-1` (`item_id_map`), embedding dùng `index+1` (0 = pad).
3. Chia **leave-last-out**: item cuối của mỗi user = target, phần trước = train.
4. Tập train = **mọi prefix** của mỗi chuỗi (tương đương sliding window), left-pad về `MAXLEN=15`.
5. Model: `Embedding(item) + Embedding(pos)` → `TransformerEncoder` (1 block, 2 head, d=32, GELU, causal mask + padding mask) → LayerNorm.
6. Loss: **sampled softmax** — 1 positive + 50 negative lấy mẫu theo độ phổ biến, `cross_entropy`. Adam lr 1e-3, batch 32, tối đa 30 epoch, dừng khi loss giảm < 0,2 %.
7. Đánh giá recall@10/20 trên target (xếp hạng toàn catalog), so với Popularity.
8. Lưu checkpoint `{model_state_dict, config, item_space="platform_v1", item_id_map}`.

### 2.6 Luồng F — Serving gợi ý

[`recommend.py`](../../AI/recs-service/app/api/endpoints/recommend.py):

1. `GET /api/v1/recommendations/personal?user_id=…` (FE dùng) hoặc `POST /api/v1/recommend {userId, sessionId}` (FE **không** dùng, gateway **không** route).
2. `LRANGE key 0 49` → danh sách int (newest-first).
3. Thang chiến lược `_recommend_for_history`:
   1. **SASRec** nếu `is_ready()` (checkpoint tồn tại + `item_space=="platform_v1"` + có `item_id_map`) — lấy `idx_seq[-maxlen:]`, chạy model, **loại item đã có trong history**, topK.
   2. **Recency** — trả lại chính các item trong history, bỏ trùng, tối đa `top_k`.
   3. **Popularity** — `ORDER BY sales_count DESC, rating_avg DESC`.
4. Tra `name/price` thật từ `ecommerce_product_db.products` (`active=1`), bỏ item đã ẩn.
5. `GET /recommendations/cross-sell` → hiện **luôn** là Popularity (TODO trong code).

### 2.7 Luồng G — FE hiển thị & vòng phản hồi

1. [`HomePage.jsx:60`](../../FE/src/features/catalog/pages/HomePage.jsx#L60) gọi `aiApi.getPersonalizedRecommendations()` **không tham số**.
2. [`aiApi.ts:52`](../../FE/src/services/aiApi.ts#L52): chưa đăng nhập → trả `[]` luôn; đã đăng nhập → `GET /recommendations/personal?user_id=` (chuỗi rỗng).
3. [`SuggestedSection`](../../FE/src/features/catalog/components/SuggestedSection.jsx) hiển thị 3 tab (sắp xếp lại cùng 1 danh sách) và bắn IMPRESSION cho 10 item đang hiện.
4. Người dùng click → ProductDetailPage → quay lại Luồng B (VIEW_PRODUCT) → đóng vòng.

### 2.8 Hợp đồng dữ liệu

| Loại | Tên | Nguồn sự thật |
|---|---|---|
| Redis | `user:{user_id}:history`, `session:{session_id}:history` — list, newest-first, 50 item, TTL 30 ngày | [`contracts.py`](../../AI/shared-common/shared_common/contracts.py) |
| Kafka | `product-viewed-events`, `cart-updated-events`, `user-behavior-events` | `contracts.py` |
| Bảng | `user_events(id, user_id VARCHAR(100), session_id, item_id, category_id, action_type VARCHAR(30), weight, created_at)` | `UserEvent.java` |
| Bảng chữ cái | 5 nghiệp vụ (VIEW_PRODUCT, ADD_TO_CART, UPDATE_CART_QTY, REMOVE_FROM_CART, CLEAR_CART) + 14 vi hành vi = 19 | `contracts.py` |

---

## 3. Môi trường đã chạy

| Thành phần | Cách chạy |
|---|---|
| MariaDB / Redis / Kafka | container `infra-*` của `BE/docker-compose-infra.yml` (đã có sẵn trên máy) |
| Dữ liệu | `tools/data-seed`: `node seed.mjs --demo-users 0` → 500 user, 3.691 đơn, **148.864 VIEW_PRODUCT + 10.363 ADD_TO_CART**, 1.123 sản phẩm. Bảng `user_events` chưa tồn tại trên máy nên đã tạo bằng SQL khớp `UserEvent.java` |
| forecast-service | `uvicorn app.main:app --port 8004` với `DB_NAME=ecommerce_order_db`, `KAFKA_BOOTSTRAP_SERVERS=localhost:29092` |
| recs-service | `uvicorn app.main:app --port 8003`, lần 1 không checkpoint, lần 2 `MODEL_WEIGHTS_PATH=platform_sasrec.pt` |
| Train | `recsys_platform_sasrec.py` (seed 42) |

Không sửa dòng code nào của project; các script kiểm thử nằm ngoài repo.

---

## 4. Kết quả chạy

### 4.1 E2E Behavior Tracking (gửi payload giống hệt FE và Java producer)

| Kiểm tra | Kết quả |
|---|---|
| POST lô 3 vi hành vi hợp lệ | `200 {received: 3, accepted: 3}` ✅ |
| `actionType` lạ (`HACKED`) | `422` ✅ |
| Lô 201 event | `422` ✅ |
| Độ trễ Kafka → `user_events` | **0,53 s** cho 10 event ✅ |
| Redis `user:{uid}:history` | `[3, 5, 4, 3, 2, 3, 1]`, TTL 2.592.000 s ✅ (nhưng xem lỗi #4, #5) |
| Khách vãng lai (chỉ session) | `session:{sid}:history = [5]` ✅ |
| Vi hành vi **không** vào Redis | ✅ đúng thiết kế |
| `created_at` của vi hành vi FE | `09:29:36` — của VIEW_PRODUCT cùng lúc: `16:29:36` ❌ **lệch 7 giờ** |
| `GET /personal?user_id=<uuid>` | Recency `[3, 5, 4, 2, 1]` — item **3 vừa bị REMOVE_FROM_CART lại đứng đầu** ❌ |
| `GET /personal?user_id=` (đúng như FE gọi) | Popularity `[256, 512, 768, 1024, 1]` ❌ |
| `POST /recommend {userId: <uuid>}` | `422 int_parsing` ❌ |
| `GET /cross-sell?item_ids=1` | Giống hệt Popularity ⚠️ |

### 4.2 Train

| | Seed 42 |
|---|---|
| Mẫu train | 158.229 |
| Loss epoch 1 → dừng | 4,258 → 2,579 (dừng sớm epoch 20) |
| Thời gian (CPU) | 31 phút |
| recall@10 / @20 (protocol script) | **0,2665 / 0,3808** |
| Popularity (cùng protocol) | 0,0020 / 0,0100 |

⚠️ Chỉ có **1 seed**. Lần train seed 7 để đo độ biến thiên theo khởi tạo không hoàn thành (treo hơn 5 giờ, đã dừng),
nên CI ở §4.3 chỉ phản ánh độ biến thiên theo **mẫu user**, chưa tính biến thiên theo **seed train**.

### 4.3 Đánh giá offline độc lập (499 user, leave-last-out, xếp hạng full catalog 1.123 item)

Bổ sung các metric plan yêu cầu (HR, NDCG, Coverage) và baseline mạnh hơn Popularity. CI95 = bootstrap 2.000 lần.

| Chiến lược | HR@10 [CI95] | HR@20 | NDCG@10 | MRR@20 | Coverage@10 |
|---|---|---|---|---|---|
| Popularity (tầng 3) | 0,0020 [0,000–0,006] | 0,0100 | 0,0006 | 0,0007 | 0,028 |
| Markov-1 (item → item kế tiếp) | 0,0361 [0,020–0,054] | 0,0441 | 0,0220 | 0,0180 | 0,913 |
| Category-Pop (category của item cuối) | 0,0301 [0,016–0,046] | 0,0581 | 0,0201 | 0,0189 | 0,411 |
| **Recency** (tầng 2, đang chạy thật) | 0,2124 [0,178–0,251] | 0,2926 | 0,1261 | 0,1053 | 0,949 |
| **SASRec — không lọc item đã xem** (protocol của script train) | **0,2665** [0,228–0,303] | **0,3808** | **0,1397** | **0,1089** | 0,812 |
| SASRec — lọc item đã xem, thứ tự đúng | 0,0942 [0,068–0,120] | 0,1383 | 0,0469 | 0,0358 | 0,848 |
| **SASRec — đúng như code service hiện tại** (lọc + thứ tự Redis newest-first) | 0,0661 [0,046–0,090] | 0,1042 | 0,0368 | 0,0303 | 0,878 |
| Hybrid: 3 item Recency + SASRec (lọc) | 0,1804 [0,146–0,214] | 0,2405 | 0,1152 | 0,0995 | 0,888 |

So sánh ghép cặp (HR@10, bootstrap 5.000 lần):

| Cặp | Δ | CI95 | Kết luận |
|---|---|---|---|
| SASRec (không lọc) − Recency | **+0,054** | [+0,018, +0,092] | SASRec **thắng có ý nghĩa** |
| SASRec (lọc, đúng thứ tự) − Recency | −0,118 | [−0,166, −0,070] | Thua có ý nghĩa |
| SASRec (đúng thứ tự) − SASRec (như service) | +0,028 | [0,000, +0,058] | Lỗi thứ tự làm mất ~30 % HR |
| SASRec (lọc) − Category-Pop | +0,064 | [+0,038, +0,090] | Thắng có ý nghĩa |

Tách theo loại target (**58,2 %** target là item user **đã từng xem** — hành vi "xem lại" rất phổ biến):

| Chiến lược | HR@10 target **mới** (n=209) | HR@10 target **lặp lại** (n=290) |
|---|---|---|
| Recency | 0,000 (không thể trúng) | 0,366 |
| Markov-1 | **0,086** | 0,000 |
| Category-Pop | 0,072 | 0,000 |
| SASRec không lọc | 0,048 | **0,424** |
| SASRec lọc, đúng thứ tự | 0,081 | 0,103 |

**Đọc kết quả:**
- Sức mạnh của SASRec trên dữ liệu này nằm ở việc **dự đoán user sẽ quay lại item nào** (0,424 vs Recency 0,366).
  Với item **mới**, SASRec (0,081) chỉ **ngang** Markov-1 (0,086) — chưa có bằng chứng model học được gì hơn
  "item hay đi sau item này".
- Con số 0,2665 của script **không phản ánh** thứ người dùng sẽ nhận, vì service lọc item đã xem còn script thì không.
  Đây là **lệch protocol train/serve** — cần chọn một và đo đúng cái đó.
- Số này **khác** số trong `recsys-execution-plan.md` §5.8 (0,1058 vs Recency 0,1118) vì seed tổng hợp phụ thuộc thời
  điểm chạy và dữ liệu máy khác; kết luận định tính ("chỉ ngang heuristic trên item mới") vẫn giống.

### 4.4 Serving

| | p50 | p95 | max |
|---|---|---|---|
| Popularity / Recency (không checkpoint) | 17,5 ms | 34,0 ms | 48,1 ms |
| **SASRec** (user 2.253 event, history 50) | **14,3 ms** | **25,5 ms** | 33,0 ms |

Đạt mục tiêu < 200 ms của plan với dư địa lớn (chưa cần Redis cache cho kết quả).
Trên cùng 1 user, top-10 service trả ra và top-10 khi đưa lịch sử đúng thứ tự chỉ trùng **7/10**.

---

## 5. Lỗi & khoảng trống (xếp theo mức độ)

### 🔴 Chặn — người dùng không nhận gợi ý cá nhân hoá

| # | Lỗi | Bằng chứng | Sửa đề xuất |
|---|---|---|---|
| 1 | **FE không truyền `user_id`**, khách chưa đăng nhập bị chặn hẳn | [`HomePage.jsx:60`](../../FE/src/features/catalog/pages/HomePage.jsx#L60) gọi không tham số; [`aiApi.ts:53`](../../FE/src/services/aiApi.ts#L53) `hasAuthToken()` false → `[]`. E2E: `user_id=` → Popularity | recs-service đọc `X-User-Id` (gateway inject từ JWT) và `X-Session-Id` thay vì query param; bỏ chặn `hasAuthToken` để khách có gợi ý theo session. Cũng vá luôn việc ai cũng xem được lịch sử của người khác qua `?user_id=` |
| 2 | **Popularity xếp tuỳ ý** | `sales_count = 0`, `rating_avg = 0` cho **1.123/1.123** SP; không có code BE nào tăng `sales_count` (grep toàn `BE/`). Top 1 cold-start là "Laptop Dell … Cũ Xước Cấn" | Tính popularity từ `user_events`/`order_items` (vd 30 ngày gần nhất) trong recs-service, cache vài phút |

### 🟠 Sai kết quả model / dữ liệu

| # | Lỗi | Bằng chứng | Sửa đề xuất |
|---|---|---|---|
| 3 | **SASRec nhận lịch sử đảo ngược** | Redis newest-first (LPUSH), nhưng [`sasrec.py:122`](../../AI/recs-service/app/services/sasrec.py#L122) lấy `idx_seq[-maxlen:]` như thể chronological → lấy 15 item **cũ nhất** trong 50, đặt item mới nhất ở xa vị trí dự đoán. HR@10 0,094 → 0,066 | `item_history = list(reversed(item_history))` trước khi map |
| 4 | **Lệch protocol train/serve** (lọc item đã xem) | Script không lọc (0,2665), service lọc [`sasrec.py:130`](../../AI/recs-service/app/services/sasrec.py#L130) (0,094) | Quyết định sản phẩm: (a) bỏ lọc → dùng SASRec thay Recency ngay (+0,054 có ý nghĩa), hoặc (b) giữ lọc → đo & train theo protocol "item mới" và báo cáo số đó |
| 5 | **REMOVE_FROM_CART / UPDATE_CART_QTY bị đẩy vào history** như "quan tâm" | [`behavior_consumer.py:167`](../../AI/forecast-service/app/kafka/behavior_consumer.py#L167) chỉ loại FE action. E2E: item vừa xoá khỏi giỏ lên top 1 | Whitelist `{VIEW_PRODUCT, ADD_TO_CART}` — khớp đúng tập train dùng |
| 6 | **Lệch múi giờ 7 h** giữa event FE và event Java | FE: `toISOString()` (UTC) [`behaviorTracker.ts:116`](../../FE/src/services/behaviorTracker.ts#L116); Java: `LocalDateTime.now()` (giờ máy). E2E: `09:29` vs `16:29` | Chuẩn hoá mọi producer về UTC (Java `LocalDateTime.now(ZoneOffset.UTC)` hoặc gửi `Instant`), consumer parse có timezone. Rất quan trọng vì luận điểm của đồ án là **thứ tự** hành vi |
| 7 | **Vi hành vi FE mất `user_id`** | [`sendBatch`](../../FE/src/services/behaviorTracker.ts#L85) dùng `fetch`/`sendBeacon` không có `Authorization` → gateway không inject `X-User-Id` → `user_id = NULL` cho mọi vi hành vi | Gửi kèm token trong `fetch`; với `sendBeacon` (không set header được) thì ghép qua `session_id` ở bước offline, hoặc map session→user khi login |
| 8 | **VIEW_PRODUCT giả** | Admin [`InventoryTab.jsx:102`](../../FE/src/features/admin/components/InventoryTab.jsx#L102) gọi chi tiết cho hàng loạt SP; OrderDetail/Profile/Review cũng vậy | Tách endpoint "xem chi tiết" (có publish) khỏi endpoint "lấy dữ liệu" (không publish), hoặc thêm query `?track=false` |

### 🟡 Khoảng trống so với plan / chất lượng

| # | Vấn đề | Ghi chú |
|---|---|---|
| 9 | `POST /recommend` hỏng với user thật | [`models/recommend.py:5`](../../AI/recs-service/app/models/recommend.py#L5) `userId: Optional[int]` nhưng user id là UUID Keycloak → 422. Gateway cũng không route `/api/v1/recommend` |
| 10 | SASRec **không dùng** bảng chữ cái 19 hành vi | Chỉ `item_id` của VIEW/ADD_TO_CART; không có action-type embedding (tầng 1 của execution-plan chưa làm). Seed cũng chỉ sinh VIEW/ADD_TO_CART |
| 11 | Chưa có backfill Redis từ `user_events` | 500 user seed có lịch sử trong DB nhưng Redis trống → service coi như cold-start cho tới khi có event mới |
| 12 | `PAGE_DWELL`/`SCROLL_DEPTH` sai với SPA | App dùng `BrowserRouter` (pushState) — `popstate` chỉ bắn khi bấm Back, nên mốc cuộn không reset theo trang và dwell gộp nhiều trang |
| 13 | IMPRESSION thiếu ngữ cảnh | Không có trường "nguồn" (home-recs / search / category) và bắn lại mỗi lần đổi tab trong SuggestedSection → không tính được CTR của gợi ý |
| 14 | Cross-sell = Popularity | TODO trong code; Markov-1 ở §4.3 là ứng viên rẻ (đã có Coverage 0,91) |
| 15 | Metadata checkpoint | `epoch` luôn ghi `N_EPOCHS=30` dù dừng sớm ở 20; không có validation split riêng, dừng theo train loss |
| 16 | Chuỗi dài bị cắt mạnh | Median 233 event/user nhưng `MAXLEN=15` (Redis giữ 50) |
| 17 | Plan chưa làm | Spring Boot gọi FastAPI + Redis cache 15', ItemKNN cho anonymous, gắn cờ bot (phụ thuộc P2) |

---

## 6. Đối chiếu với kế hoạch P1

| Hạng mục plan | Trạng thái |
|---|---|
| Schema `UserEvent` (view/cart/remove/purchase/impression) | ✅ có; ⚠️ chưa có `PURCHASE` trong `user_events` |
| Kafka Producer/Consumer clickstream | ✅ chạy, độ trễ ~0,5 s |
| Preprocessing padding/truncation | ✅ left-pad, maxlen 15 |
| SASRec sampled softmax + causal mask | ✅ |
| Đánh giá NDCG@10, HR@10, Coverage vs Recency | ⚠️ script chỉ có recall vs Popularity — harness trong tài liệu này bổ sung |
| FastAPI serving < 200 ms | ✅ p95 26 ms |
| Spring Boot gọi AI + Redis cache | ❌ FE → gateway → FastAPI trực tiếp, không cache |
| Fallback Popularity/Recency | ⚠️ có thang fallback, nhưng Popularity vô nghĩa (lỗi #2) |
| E2E User click → Kafka → AI → FE | ❌ đứt ở bước FE gọi API (lỗi #1) |

---

## 7. Thứ tự sửa đề xuất

1. **#1 + #2** — để demo "User browse → AI recommend" thật sự hiện gợi ý cá nhân hoá.
2. **#3 + #5** — 2 dòng code, sửa đúng input của model.
3. **#4** — chốt protocol, train lại, cập nhật số trong báo cáo.
4. **#6 + #7** — trước khi dùng micro-behavior cho bất kỳ phân tích thứ tự nào.
5. **#11** — script backfill Redis từ `user_events` để demo ngay với user seed.

---

## 8. Tái lập

```bash
# hạ tầng
docker compose -f BE/docker-compose-infra.yml up -d mariadb redis kafka
# dữ liệu (bảng user_events phải tồn tại: chạy order-service 1 lần hoặc tạo theo UserEvent.java)
cd tools/data-seed && npm install && node seed.mjs --demo-users 0
# train
cd AI/forecast-service/app/training/experiments
PLATFORM_SASREC_MODEL_PATH=./platform_sasrec.pt python recsys_platform_sasrec.py
# service
cd AI/forecast-service && DB_NAME=ecommerce_order_db KAFKA_BOOTSTRAP_SERVERS=localhost:29092 uvicorn app.main:app --port 8004
cd AI/recs-service    && MODEL_WEIGHTS_PATH=<path>/platform_sasrec.pt uvicorn app.main:app --port 8003
```
