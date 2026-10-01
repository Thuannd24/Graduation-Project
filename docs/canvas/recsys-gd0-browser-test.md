# GĐ0 — Hướng dẫn kiểm thử gợi ý trên trình duyệt

> Mục đích: xác nhận điều kiện ra còn lại của GĐ0 ([`recsys-p1-assessment-and-plan.md`](recsys-p1-assessment-and-plan.md)):
> *"user đăng nhập → trang chủ hiện gợi ý cá nhân hoá (`sasrec`/`recency`), card có ảnh"*, **đi qua đúng FE → Gateway
> → Keycloak**. Đồng thời kiểm giả định duy nhất chưa chạy thật: *gateway vẫn inject `X-User-Id` khi request có JWT đi
> vào route public `/api/v1/public/**`*.
>
> Thời gian ước tính: 30–45 phút (phần lớn là khởi động service Java).
>
> ✅ **Đã chạy tự động ngày 2026-10-01**, qua gateway, Keycloak, product/order/inventory/user-service thật (script mô phỏng
> đúng request trình duyệt gửi). **5/5 ca đạt**, xem [kết quả ở cuối file](#kết-quả-chạy-tự-động-2026-10-01). Phần duy
> nhất script không thay được là **nhìn giao diện**: làm Bước 3–4 trên trình duyệt để xem tận mắt.

---

## Bước 0 — Hai việc hạ tầng cần bạn quyết (ngoài phạm vi P1)

| Vấn đề | Nguyên nhân | Cách xử lý |
|---|---|---|
| `infra-redis` không chạy | Container `bot-tele-redis-1` (project khác) đang chiếm cổng **6379** | Tạm dừng: `docker stop bot-tele-redis-1` rồi `docker start infra-redis`. Muốn dùng lại bot-tele thì làm ngược lại |
| `infra-keycloak` khởi động lại liên tục | Container được tạo từ bản compose **cũ** (không có biến `DOMAIN`), nên redirect URI `https://${DOMAIN}/*` trong realm export không hợp lệ | Tạo lại từ compose hiện tại: `docker compose -f BE/docker-compose-infra.yml up -d keycloak`. ⚠️ Container cũ đang chứa sẵn cấu hình Google login; container mới lấy từ `BE/.env` (hiện chưa có file này), nên **đăng nhập Google sẽ không chạy** cho tới khi bạn tạo `BE/.env` (copy từ `.env.example`, điền `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). Đăng nhập username/password vẫn chạy bình thường |

Kiểm tra sau bước 0:

```bash
docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "infra-(redis|mariadb|kafka|keycloak)"
# cả 4 phải "Up", keycloak KHÔNG được "Restarting"/"Up 2 seconds" lặp lại
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8083/realms/ecommerce-realm   # 200
```

---

## Bước 1 — Chạy backend Java (IntelliJ hoặc terminal)

Thứ tự bắt buộc: build `grpc-common` trước, sau đó eureka, rồi mới tới các service còn lại.

⚠️ **Phải dùng JDK 17** (hoặc 21). Máy đang mặc định **JDK 23**, và Lombok 1.18.30 của project không chạy trên JDK 23:
build sẽ báo `cannot find symbol: variable log` dù class có `@Slf4j`. Máy đã có sẵn `C:\Program Files\Java\jdk-17`.
Trong IntelliJ: *Project Structure → SDK = 17*. Ở terminal: `export JAVA_HOME="/c/Program Files/Java/jdk-17"`
(PowerShell: `$env:JAVA_HOME="C:\Program Files\Java\jdk-17"`).

⚠️ **user-service cần biến `KEYCLOAK_ADMIN_CLIENT_SECRET`**, thiếu thì không khởi động được. Để test luồng gợi ý, đặt
tạm giá trị bất kỳ (các thao tác quản trị Keycloak sẽ không chạy, nhưng luồng này không cần). Dùng thật thì lấy từ `BE/.env`.

```bash
cd BE
mvn -q -DskipTests install -pl grpc-common      # 1 lần
# mỗi service 1 terminal (hoặc Run trong IntelliJ):
mvn -q spring-boot:run -pl eureka-server        # :8761
AI_RECS_URL=http://localhost:8003 AI_FORECAST_URL=http://localhost:8004 \
  mvn -q spring-boot:run -pl api-gateway        # :8080 (gateway chạy ngoài Docker)
KEYCLOAK_ADMIN_CLIENT_SECRET=dummy mvn -q spring-boot:run -pl user-service   # :8085
mvn -q spring-boot:run -pl product-service      # :8089  — phát VIEW_PRODUCT
mvn -q spring-boot:run -pl inventory-service    # :8093  — giỏ hàng kiểm tồn kho qua gRPC
mvn -q spring-boot:run -pl order-service        # :8082  — phát ADD/REMOVE cart
```

Kiểm tra: mở http://localhost:8761. Phải thấy đủ `API-GATEWAY`, `USER-SERVICE`, `PRODUCT-SERVICE`, `INVENTORY-SERVICE`,
`ORDER-SERVICE`.

---

## Bước 2 — Chạy 2 service AI của P1

Chạy từ thư mục gốc repo, mỗi lệnh 1 terminal (cần `pip install -r requirements.txt` trong từng service trước):

```bash
# forecast-service: nhận vi hành vi + consumer Kafka ghi Redis/MySQL
cd AI/forecast-service
DB_NAME=ecommerce_order_db KAFKA_BOOTSTRAP_SERVERS=localhost:29092 uvicorn app.main:app --port 8004

# recs-service: checkpoint SASRec nằm ở AI/models/sasrec.pt
cd AI/recs-service
MODEL_WEIGHTS_PATH=../models/sasrec.pt uvicorn app.main:app --port 8003

# Nạp lại lịch sử Redis cho user seed (Redis vừa khởi động lại). Chỉ lấp key trống.
cd AI/recs-service && python scripts/backfill_history.py
```

> PowerShell: dùng `$env:DB_NAME="ecommerce_order_db"; ...; uvicorn ...` thay cho cú pháp `VAR=x cmd`.

Kiểm tra:
- `curl http://localhost:8003/health` → `"status":"UP"`.
- Log recs-service có dòng `Da nap SASRec platform_v1 ... 1,123 item` ngay ở request đầu tiên.

---

## Bước 3 — Chạy FE

```bash
cd FE && npm run dev      # http://localhost:5173  (API mặc định http://localhost:8080/api/v1)
```

Mở **DevTools → Network**, lọc theo `recommendations`.

---

## Bước 4 — Các ca kiểm thử

### Ca 1 — Khách chưa đăng nhập, lần đầu vào (cold-start)

1. Mở **cửa sổ ẩn danh** → http://localhost:5173.
2. Cuộn tới khối gợi ý có 3 tab: **GỢI Ý CHO BẠN · XEM GẦN ĐÂY · XU HƯỚNG MUA SẮM**. Mỗi tab là **một nguồn thật**
   (tham số `source` = `for_you` / `recent` / `trending`).

| Tab | Kỳ vọng | Trước khi sửa |
|---|---|---|
| Gợi ý cho bạn | **10 sản phẩm, có ảnh** (nhóm loa/tai nghe bán chạy: JBL, Marshall…), `x-recs-strategy: popularity` | Khối rỗng (khách bị chặn trả `[]`) |
| Xem gần đây | Thông báo *"Bạn chưa xem sản phẩm nào gần đây"* | — |
| Xu hướng mua sắm | 10 sản phẩm, `x-recs-strategy: popularity` | Cùng danh sách, chỉ sắp theo rating (= 0) |
| Network | 3 request `GET /api/v1/public/recommendations/personal?top_k=10&source=…` → **200** | Không có request |

### Ca 2 — Khách chưa đăng nhập, sau khi xem vài sản phẩm

1. Vẫn cửa sổ ẩn danh đó, mở **3 sản phẩm bất kỳ** (vào trang chi tiết).
2. Chờ khoảng 2 giây, quay lại trang chủ rồi **F5**.

| Tab | Kỳ vọng |
|---|---|
| Gợi ý cho bạn | `x-recs-strategy: sasrec`, **không chứa** 3 sản phẩm vừa xem (tầng SASRec loại item đã xem) |
| Xem gần đây | Đúng 3 sản phẩm vừa xem, **món xem sau cùng đứng đầu** |

Nếu vẫn ra `popularity`: xem mục "Xử lý sự cố" bên dưới.

### Ca 3 — Người dùng đăng nhập ⭐ (ca quan trọng nhất)

1. Đếm số key lịch sử user trước khi test:
   ```bash
   docker exec infra-redis redis-cli --scan --pattern "user:*:history" | wc -l     # ghi lại số N
   ```
2. Cửa sổ thường → **Đăng nhập** bằng tài khoản `customer` của realm (hoặc đăng ký tài khoản mới).
3. Xem **3 sản phẩm**, quay lại trang chủ, **F5**.
4. Đếm lại key:
   ```bash
   docker exec infra-redis redis-cli --scan --pattern "user:*:history" | wc -l     # phải = N + 1
   ```
5. Lấy user id: Keycloak admin http://localhost:8083 → realm `ecommerce-realm` → Users → `customer` → cột **ID**. Sau đó:
   ```bash
   docker exec infra-redis redis-cli lrange "user:<ID>:history" 0 -1     # 3 product id vừa xem, mới nhất ở đầu
   ```

| Kỳ vọng | Ý nghĩa |
|---|---|
| Có key `user:<ID>:history` mới | ✅ Gateway **có** inject `X-User-Id` trên route public khi có JWT (vì trang chi tiết SP cũng là route `/public/`) |
| Trang chủ `x-recs-strategy: sasrec` | ✅ recs-service đọc đúng lịch sử của user |
| Card có ảnh, giá, giá gạch ngang (nếu đang giảm) | ✅ response đủ field cho `ProductCard` |

❗ Nếu bước 4 **không** tăng thêm key user mà chỉ có key `session:*` tăng, thì giả định về gateway **sai**. Hãy dừng lại và
báo mình, vì khi đó cần sửa phía gateway/FE theo hướng khác.

### Ca 4 — Xoá khỏi giỏ không bị coi là "quan tâm"

1. Vẫn đang đăng nhập: thêm 1 sản phẩm **mới (chưa xem)** vào giỏ, rồi xoá nó khỏi giỏ.
2. Kiểm tra:
   ```bash
   docker exec infra-redis redis-cli lrange "user:<ID>:history" 0 4
   docker exec infra-mariadb mariadb -uroot -proot -e "SELECT action_type,item_id,created_at FROM ecommerce_order_db.user_events WHERE user_id='<ID>' ORDER BY id DESC LIMIT 5;"
   ```

| Kỳ vọng |
|---|
| Redis: product id đó xuất hiện **đúng 1 lần** (do ADD_TO_CART), **không** được đẩy thêm lần nữa khi REMOVE |
| MySQL: có đủ cả `ADD_TO_CART` **và** `REMOVE_FROM_CART` (bảng vẫn ghi mọi action) |

### Ca 5 — Trang giỏ hàng không crash

1. Để lại ít nhất 1 sản phẩm trong giỏ → mở trang **Giỏ hàng**.

| Kỳ vọng | Trước khi sửa |
|---|---|
| Trang hiển thị bình thường, có khối **"Ưu đãi mua kèm — AI Combo Recommended"** | Có thể trắng trang (`Cannot read properties of undefined (reading 'length')`) |

---

## Xử lý sự cố

| Triệu chứng | Kiểm tra |
|---|---|
| Request recs trả **503** / fallback | Gateway gọi `host.docker.internal:8003`. Nếu gateway chạy **ngoài Docker**, set `AI_RECS_URL=http://localhost:8003` và `AI_FORECAST_URL=http://localhost:8004` cho gateway |
| Ca 2/3 vẫn là `popularity` | (a) Log forecast-service có ghi message không? (b) `docker exec infra-mariadb mariadb -uroot -proot -e "SELECT COUNT(*) FROM ecommerce_order_db.user_events WHERE created_at > NOW() - INTERVAL 10 MINUTE"` phải > 0. (c) product-service có đang publish Kafka không (log `Published ProductViewedEvent`, cần bật debug) |
| Ra `recency` thay vì `sasrec` | Checkpoint chưa nạp: kiểm tra `MODEL_WEIGHTS_PATH` và log `Da nap SASRec` |
| Đăng nhập xong bị đá về `/login` | Token hết hạn hoặc Keycloak chưa sẵn sàng. Xem lại Bước 0 |

## Ghi kết quả

Điền bảng này rồi gửi lại cho mình. Nếu cả 5 ca đạt thì đóng GĐ0.

| Ca | Đạt? | Ghi chú (strategy, ảnh chụp Network) |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |

---

## Kết quả chạy tự động (2026-10-01)

Stack thật: gateway :8080, Keycloak, eureka, user/product/inventory/order-service (JDK 17), forecast-service,
recs-service với checkpoint `AI/models/sasrec.pt`. Script gửi đúng header mà trình duyệt gửi (`Authorization: Bearer`
lấy từ Keycloak bằng client `ecommerce-frontend`, và `X-Session-Id`). User test được tạo tạm rồi xoá sau khi chạy.

| Ca | Kết quả | Bằng chứng |
|---|---|---|
| 1 — Khách mới | ✅ | `for_you` và `trending`: 200, `popularity`, 10 SP đều có ảnh. `recent`: 200, rỗng |
| 2 — Khách xem 3 SP | ✅ | Consumer ghi sau 0,5 s. `for_you`: `sasrec`, không chứa SP đã xem. `recent`: `[23, 22, 21]`, đúng thứ tự mới nhất trước |
| 3 — Người dùng đăng nhập | ✅ | `user_events.user_id` **= Keycloak `sub`**, key `user:<sub>:history` được tạo (499 → 500), key session **rỗng**. ⇒ **Gateway có inject `X-User-Id` trên route `/public/**` khi có JWT** (giả định cuối cùng đã được xác nhận). `for_you`: `sasrec`, 10 SP có ảnh |
| 4 — Thêm rồi xoá khỏi giỏ | ✅ | Cart API 200/200. Redis: SP xuất hiện **đúng 1 lần** (do ADD). MySQL: có cả `ADD_TO_CART` và `REMOVE_FROM_CART` |
| 5 — Dữ liệu trang giỏ | ✅ | `cross-sell` qua gateway: 200, trả **mảng** 5 SP (FE đã đọc đúng dạng này, build thành công) |

Độ trễ **qua gateway** (tầng SASRec): p50 12 ms, p95 22 ms.

Ghi chú:
- Lần chạy đầu, ca 4 nhận **429** do rate limiter của gateway (20 req/s) ngay sau vòng đo độ trễ 50 request. Đây là
  hành vi đúng của gateway, không phải lỗi. Chạy lại sau 5 giây thì đạt.
- Chưa kiểm bằng mắt phần **giao diện** (3 tab, card, trang giỏ không trắng). Đây là phần duy nhất cần làm thủ công
  theo Bước 3–4.
