# Test Case — API Gateway & Service Discovery (Eureka)

> Nguồn tham chiếu: `BE/api-gateway/src/main/resources/application.yml`, `BE/api-gateway/src/main/java/com/ecommerce/apigateway/**`, `BE/eureka-server/src/main/resources/application.yml`, `BE/eureka-server/src/main/java/com/ecommerce/eurekaserver/EurekaServerApplication.java`, `docs/services/08_API_GATEWAY_DISCOVERY.md`.
>
> **Lưu ý quan trọng:** Tài liệu `docs/services/08_API_GATEWAY_DISCOVERY.md` có nhiều điểm LỆCH so với code thật (ví dụ: doc dùng prefix `/api/...` nhưng code thật luôn có `/api/v1/...`; doc mô tả class filter tên `AuthenticationHeaderFilter` nhưng code thật là `UserHeaderFilter`; doc nói header inject chỉ có 3 header nhưng code thật inject 6 header, v.v.). Toàn bộ test case dưới đây được viết theo **code thật**, không theo doc.
>
> **Phạm vi rút gọn:** Bộ test case này tập trung vào các luồng quan trọng — routing đúng service theo path prefix, xác thực JWT đầy đủ (hợp lệ/hết hạn/sai signature/thiếu → header inject hoặc 401/403), chặn `/api/internal/**`, CORS, Eureka discovery + load balancing, và service down/fallback. Các test case liệt kê lặp lại cho từng service riêng lẻ (route giống nhau về logic) đã được gộp thành 1 test case đại diện theo pattern; các test case chỉ khác nhau ở "thiếu trường claim" (ví dụ thiếu `email`, `picture`) đã được bỏ qua.

## 1. Phạm vi (Scope) và cách test

| Nhóm | Có thể test với | Ghi chú |
|---|---|---|
| Route matching theo path prefix (predicate → `lb://service` hoặc URI tĩnh) | Mock/Test JWT hoặc không cần token (Unit test route config bằng `TestRestTemplate`/WireMock stub cho downstream) | Không cần Keycloak thật, chỉ cần chạy Gateway + stub service downstream |
| Public route (`permitAll`) không cần token | Không cần Keycloak — request không kèm `Authorization` | |
| Secured route thiếu token → 401 | Không cần Keycloak thật — chỉ cần Gateway đã cấu hình `oauth2ResourceServer` với issuer bất kỳ (kể cả issuer giả, vì gateway chỉ cần chặn request KHÔNG có token, không cần verify) | |
| Token hợp lệ → inject `X-User-*` header | **Cần JWT hợp lệ theo issuer đã cấu hình** — có thể dùng: (a) Keycloak thật (docker-compose realm `ecommerce-realm`), hoặc (b) mock JWKS endpoint (WireMock) + tự ký JWT bằng key tương ứng để giả lập Keycloak, hoặc (c) unit test trực tiếp `SecurityConfig.jwtAuthenticationConverter()` và `UserHeaderFilter` với `Jwt` object dựng tay (Mockito) — không cần gọi HTTP thật | Ưu tiên (c) cho UT, (a)/(b) cho IT |
| Token hết hạn / signature sai | Cần Keycloak thật hoặc tự ký JWT bằng key khác/claim `exp` quá khứ + mock JWKS trùng issuer | IT, cần hạ tầng JWT thật hoặc mock JWKS |
| Thiếu role ADMIN/STAFF cho `/api/v1/admin/**` | Cần JWT hợp lệ (thật hoặc mock) có `realm_access.roles` khác ADMIN/STAFF | IT |
| `/api/internal/**` bị chặn | Không cần token/Keycloak — `denyAll()` áp dụng vô điều kiện | UT/IT đơn giản |
| CORS | Không cần token — test preflight `OPTIONS` | |
| Eureka: service đăng ký, health check, route theo service name, load balancing | Cần chạy Eureka Server thật + ít nhất 1-2 instance service thật (hoặc dummy Spring Boot app có `@EnableDiscoveryClient`) | IT/System test, không mock được vì cần cơ chế heartbeat/lease thật |
| Circuit breaker / fallback khi service down | Cần Eureka + có thể tắt instance thật, hoặc mock downstream trả lỗi/timeout liên tục để mở circuit | IT |

---

## 2. Module: Routing theo path prefix

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-001 | Routing | Integration | Request `/api/v1/{service}/**` được route tới đúng downstream service (đại diện cho toàn bộ service: user, product, order, cart, payment, notification, promotion) | Gateway chạy, các service đã đăng ký Eureka (hoặc stub) | GET `/api/v1/users/me`, `/api/v1/products/1`, `/api/v1/orders/1`, `/api/v1/payments/1`... kèm JWT hợp lệ | Mỗi request được forward tới đúng `lb://{service-name}` tương ứng, downstream nhận đúng path (không bị strip prefix) | High |
| IT-GATEWAY-002 | Routing | Integration | Request tới các nhóm route dùng URI tĩnh (không qua `lb://`, ví dụ AI Search/Chatbot/Recommendations/Pricing) | Gateway + stub tại URI tĩnh tương ứng (`AI_SEARCH_URL`, `AI_CHATBOT_URL`, `AI_RECS_URL`, `AI_FORECAST_URL`) | GET `/api/v1/search?q=abc`, `/api/v1/chatbot/**`, `/api/v1/recommendations/**`, `/api/v1/pricing/**` kèm JWT hợp lệ | Mỗi path được forward trực tiếp tới đúng biến môi trường URI tĩnh tương ứng, không qua Eureka discovery | Medium |
| IT-GATEWAY-003 | Routing | Integration | Request `/api/v1/admin/**` (đại diện: `admin/inventories`, `admin/campaigns`) được route đúng service khi JWT có role ADMIN/STAFF hợp lệ | Gateway + service stub + JWT role ADMIN | GET `/api/v1/admin/inventories/sku-001` kèm JWT role ADMIN | Route thành công tới service tương ứng, trả 200 | High |
| IT-GATEWAY-004 | Routing | Integration | Request `/realms/**`, `/resources/**` route tới Keycloak server | Gateway chạy, biến `KEYCLOAK_SERVER_URL` cấu hình | GET `/realms/ecommerce-realm/.well-known/openid-configuration` | Route thành công tới Keycloak server, không bị chặn bởi Security filter (đã whitelist) | Medium |
| IT-GATEWAY-005 | Routing | Integration | Discovery locator tự sinh route `/<service-id>/**` cho service đã đăng ký Eureka | Gateway `spring.cloud.gateway.discovery.locator.enabled=true`, có service đăng ký (ví dụ `user-service`) | GET `/user-service/actuator/health` (path dạng discovery-locator, lowercase service id) | Request được route tự động tới instance `user-service` qua Eureka, không cần khai báo route tay | Low |
| IT-GATEWAY-006 | Routing | Integration | Không có `StripPrefix` filter trên bất kỳ route nào | Gateway + stub log lại path nhận được | GET `/api/v1/users/123` | Downstream `user-service` nhận đúng nguyên path `/api/v1/users/123`, không bị cắt bớt prefix | Medium |

---

## 3. Module: Public API (permitAll) không cần token

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-007 | Public route | Integration | Gọi các route public dưới `/api/v1/public/**` (đại diện: products, orders) không kèm `Authorization` header | Gateway chạy, service stub | GET `/api/v1/public/products/1`, `/api/v1/public/orders/track/abc123` không có header Authorization | HTTP 200, request lọt qua Security filter (whitelist), tới được service tương ứng, không bị 401 | High |
| IT-GATEWAY-008 | Public route | Integration | Gọi `/api/v1/inventories/**` (public đặc biệt, không nằm dưới `/public/`) không kèm token | Gateway + inventory-service stub | GET `/api/v1/inventories/sku-001` | HTTP 200, không bị 401 (do whitelist riêng path này) | High |
| IT-GATEWAY-009 | Public route | Integration | Gọi các endpoint hạ tầng whitelist (đại diện: `/actuator/health`, `/eureka/**`, `/fallback/**`) không kèm token | Gateway chạy | GET `/actuator/health`, `/eureka/apps`, `/fallback/user-service` | Không bị chặn 401 bởi Security filter; `/actuator/health` trả 200 với `"status":"UP"` | Medium |
| UT-GATEWAY-010 | Public route | Unit | Kiểm tra danh sách path whitelist trong `SecurityConfig.authorizeExchange` khớp đúng yêu cầu nghiệp vụ | Đọc cấu hình `SecurityConfig` | Duyệt danh sách `pathMatchers(...).permitAll()`: `/api/v1/public/**`, `/api/v1/inventories/**`, `/eureka/**`, `/actuator/health`, `/fallback/**`, `/realms/**`, `/resources/**` | Danh sách whitelist đúng như cấu hình, không có path nhạy cảm bị lọt vào whitelist ngoài ý muốn | High |

---

## 4. Module: Secured API — thiếu/sai token bị chặn tại Gateway

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-011 | Auth chặn tại Gateway | Integration | Gọi route secured (không phải `/public/`) không kèm `Authorization` header (đại diện: users, orders, notifications) | Gateway chạy, service stub có log request nhận được | GET `/api/v1/users/me`, `/api/v1/orders/1`, `/api/v1/notifications` không có header Authorization | HTTP 401 Unauthorized trả về NGAY từ Gateway; xác nhận stub downstream KHÔNG nhận được request nào (chặn trước khi route) | High |
| IT-GATEWAY-012 | Auth chặn tại Gateway | Integration | Gọi route secured với header `Authorization` sai định dạng (không phải JWT hợp lệ) | Gateway chạy | GET `/api/v1/payments/1` với `Authorization: Bearer abc.def` (chuỗi không đúng cấu trúc JWT) | HTTP 401, body theo default Spring Security WebFlux JSON error (`status:401, error:"Unauthorized"`) | High |

---

## 5. Module: Token hợp lệ → Inject header X-User-*

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-GATEWAY-013 | Header injection | Unit | `jwtAuthenticationConverter()` map đúng `realm_access.roles` thành `SimpleGrantedAuthority` có tiền tố `ROLE_` | Dựng `Jwt` mock với claim `realm_access: {roles: ["ADMIN","STAFF"]}` | Gọi `jwtAuthenticationConverter().convert(jwt)` | Trả về Flux chứa `ROLE_ADMIN`, `ROLE_STAFF` | High |
| UT-GATEWAY-014 | Header injection | Unit | `jwtAuthenticationConverter()` khi claim `realm_access` null → trả Flux rỗng | Mock `Jwt` không có claim `realm_access` | Gọi convert | Trả về `Flux.empty()`, không NPE | High |
| UT-GATEWAY-015 | Header injection | Unit | `UserHeaderFilter` strip mọi header client gửi có prefix `x-user-` (case-insensitive) trước khi xử lý | Dựng `ServerWebExchange` giả có header `X-User-Id: fake-attacker`, `x-user-roles: ROLE_ADMIN` | Gọi `filter.filter(exchange, chain)` | Header `X-User-Id`/`x-user-roles` gốc bị loại bỏ khỏi request forward đi, không có giá trị "fake-attacker" nào lọt qua | High |
| IT-GATEWAY-016 | Header injection | Integration | Request có JWT hợp lệ (đủ claim `sub`, `email`, `preferred_username`, `name`, `picture`, `realm_access.roles`) qua Gateway tới service | Gateway + Keycloak (thật hoặc mock JWKS) + stub service echo lại header nhận được | GET `/api/v1/users/me` kèm JWT hợp lệ | Downstream nhận đủ 6 header: `X-User-Id` = sub, `X-User-Email` = email, `X-User-Username` = preferred_username, `X-User-Name` = name (URL-encoded UTF-8), `X-User-Avatar` = picture, `X-User-Roles` = roles nối dấu phẩy | High |
| IT-GATEWAY-017 | Header injection | Integration | Request public (không có JWT) qua `UserHeaderFilter`, kể cả khi client tự gửi header `X-User-*` giả mạo | Gateway, request không có Authorization | GET `/api/v1/public/products/1` không token, kèm header giả `X-User-Roles: ADMIN`, `X-User-Id: attacker` | Request forward đi đã bị strip toàn bộ header `X-User-*` gốc (giá trị giả không lọt qua) và không inject thêm gì (không có Authentication trong context) | High |
| UT-GATEWAY-018 | Header injection | Unit | `extractRoles()` join đúng nhiều role bằng dấu phẩy, không dấu cách dư | Mock claim `roles = ["ADMIN", "STAFF", "USER"]` | Gọi `extractRoles(jwt)` | Trả về chuỗi `"ADMIN,STAFF,USER"` | Low |

---

## 6. Module: Internal API bị chặn từ bên ngoài

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-019 | Chặn internal API | Integration | Gọi `/api/internal/**` từ client ngoài, không kèm token | Gateway chạy | GET `/api/internal/orders/sync` không có Authorization | HTTP 403 Forbidden (rule `denyAll()`), request không tới downstream nào | High |
| IT-GATEWAY-020 | Chặn internal API | Integration | Gọi `/api/internal/**` kèm JWT hợp lệ có role ADMIN | Gateway + JWT ADMIN hợp lệ | GET `/api/internal/orders/sync` kèm JWT role ADMIN | HTTP 403 Forbidden — `denyAll()` áp dụng vô điều kiện, bất kể có token/role gì | High |
| UT-GATEWAY-021 | Chặn internal API | Unit | Rule `.pathMatchers("/api/internal/**").denyAll()` được đặt ĐÚNG THỨ TỰ trước rule `anyExchange().authenticated()` trong `SecurityConfig` | Đọc code `SecurityConfig.java` | Kiểm tra thứ tự khai báo `authorizeExchange` | Rule `denyAll()` cho `/api/internal/**` nằm trước rule catch-all `authenticated()`, đảm bảo không bị rule sau override | High |

---

## 7. Module: CORS

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-022 | CORS | Integration | Preflight `OPTIONS` request từ origin FE bất kỳ | Gateway chạy, `CorsConfig` allowedOriginPatterns=`*` | OPTIONS `/api/v1/products/1` với header `Origin: http://localhost:3000`, `Access-Control-Request-Method: GET` | HTTP 200, response header `Access-Control-Allow-Origin: http://localhost:3000` (pattern `*` match mọi origin), `Access-Control-Allow-Methods` chứa GET/POST/PUT/DELETE/PATCH/OPTIONS | High |
| IT-GATEWAY-023 | CORS | Integration | Preflight `OPTIONS` không cần token (bypass Security) | Gateway chạy | OPTIONS `/api/v1/users/me` (secured route) không kèm Authorization | HTTP 200 (rule `OPTIONS /**` → `permitAll()`), không trả 401 | High |
| IT-GATEWAY-024 | CORS | Integration | Kiểm tra `Access-Control-Allow-Credentials` | Gateway chạy | OPTIONS request bất kỳ | Response KHÔNG có header `Access-Control-Allow-Credentials: true` (vì `allowCredentials=false` trong `CorsConfig`) | Medium |

---

## 8. Module: Eureka Service Discovery & Load Balancing

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-025 | Eureka registration | Integration | Service (ví dụ `user-service`) và Gateway tự đăng ký thành công lên Eureka Server, health hiển thị đúng | Eureka Server chạy port 8761, service cấu hình `eureka.client.serviceUrl.defaultZone` đúng | Khởi động `user-service` và `api-gateway`, chờ tối đa 30s (lease renewal interval) | `GET http://localhost:8761/eureka/apps/USER-SERVICE` và `.../API-GATEWAY` trả về instance với status `UP` | High |
| IT-GATEWAY-026 | Routing theo service name qua Eureka | Integration | Gateway route `lb://user-service` phân giải đúng instance đã đăng ký (1 instance) | 1 instance `user-service` đăng ký Eureka | GET `/api/v1/users/me` qua Gateway | Request được forward tới đúng instance đang chạy, response 200 | High |
| IT-GATEWAY-027 | Load balancing nhiều instance | Integration | Nhiều instance cùng tên (2-3+ instance) đăng ký, traffic được phân phối luân phiên (round-robin) | Chạy 2-3 instance cùng service (port khác nhau), cùng đăng ký Eureka | Gửi 20-30 request liên tiếp qua Gateway tới service đó | Request được phân phối luân phiên tới các instance — xác nhận qua log/response header đánh dấu instance nào xử lý; không có instance nào nhận 100% traffic khi tất cả healthy | High |
| IT-GATEWAY-028 | Instance down giữa lúc load balancing | Integration | 1 trong nhiều instance bị tắt giữa lúc đang gửi traffic | 2 instance chạy, đăng ký Eureka | Bắt đầu gửi liên tục request, tắt 1 instance ở giữa loạt request | Sau khi lease hết hạn (tối đa 90s theo default) hoặc instance tự deregister khi shutdown graceful, toàn bộ traffic chuyển về instance còn sống, không còn request nào bị route tới instance đã tắt | Medium |
| IT-GATEWAY-029 | Eureka standalone mode | Integration | Xác nhận Eureka Server chạy standalone, không tự đăng ký với chính nó | Đọc `eureka-server/application.yml`: `registerWithEureka: false`, `fetchRegistry: false` | Khởi động Eureka Server, gọi `/eureka/apps` | Danh sách app KHÔNG chứa entry `EUREKA-SERVER` (server không tự đăng ký) | Low |

---

## 9. Module: Test case lỗi (Error cases)

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-030 | Token hết hạn | Integration | Gọi secured API với JWT có claim `exp` đã qua | JWT hợp lệ về signature nhưng `exp` < thời điểm hiện tại | GET `/api/v1/orders/1` kèm JWT hết hạn | HTTP 401 Unauthorized (`invalid_token` — expired), request không tới order-service | High |
| IT-GATEWAY-031 | Token bị sửa đổi (invalid signature) | Integration | Gọi secured API với JWT bị thay đổi payload nhưng giữ nguyên signature cũ (hoặc tự ký bằng key khác) | JWT có signature không khớp JWKS của issuer cấu hình | GET `/api/v1/users/me` kèm JWT signature sai | HTTP 401 Unauthorized (`invalid_token` — signature verification failed) | High |
| IT-GATEWAY-032 | Gọi service đã down | Integration | Gọi route mà service đích không có instance nào đăng ký trên Eureka (hoặc tất cả instance down) | `order-service` không chạy/không đăng ký Eureka | GET `/api/v1/orders/1` kèm JWT hợp lệ | Circuit breaker `order-service-cb` phát hiện lỗi liên tục → sau khi vượt `failureRateThreshold=50%` trong sliding window 10 request, circuit OPEN → trả về fallback `forward:/fallback/order-service`: HTTP 503, body JSON `{"status":503,"error":"Service Unavailable","message":"Dịch vụ order tạm thời không khả dụng...","service":"order-service"}` | High |
| IT-GATEWAY-033 | Thiếu role ADMIN/STAFF cho endpoint admin | Integration | Gọi `/api/v1/admin/**` (đại diện: products, inventories) với JWT hợp lệ nhưng role chỉ có `USER` | JWT hợp lệ, `realm_access.roles=["USER"]` | GET `/api/v1/admin/products/1` kèm JWT role USER | HTTP 403 Forbidden (`hasAnyRole("ADMIN","STAFF")` không thỏa) | High |
| IT-GATEWAY-034 | Redis down khi rate limiting | Integration | Rate limiter dùng Redis (`RequestRateLimiter` + `userKeyResolver`), Redis không khả dụng | Tắt Redis, Gateway vẫn chạy | GET bất kỳ route nào | Request lỗi 500 hoặc bị filter rate-limiter chặn do không kết nối được Redis (cần xác nhận hành vi thực tế qua log — không có fallback graceful cấu hình sẵn) | Medium |
| IT-GATEWAY-035 | Timeout downstream vượt TimeLimiter | Integration | Downstream phản hồi chậm hơn 30s (`timeoutDuration=30s` default) | Stub service delay > 30s | GET `/api/v1/products/1` | Request bị TimeLimiter cắt sau 30s, circuit breaker ghi nhận lỗi timeout, trả fallback 503 nếu vượt threshold | Medium |

---

## 10. Module: Edge case & bảo mật

| Test ID | Module/Chức năng | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-GATEWAY-036 | Discovery locator route trùng path với route bị chặn tay | Integration | Service có tên trùng path nhạy cảm (ví dụ service tên `internal`) tự động sinh route qua discovery-locator | `spring.cloud.gateway.discovery.locator.enabled=true`, có service đăng ký Eureka tên `internal-service` | GET `/internal-service/**` | Cảnh báo bảo mật: request có thể lọt qua vì discovery-locator sinh route tự động KHÔNG đi qua rule `denyAll()` của `/api/internal/**` (pattern path khác nhau) — cần xác nhận đây có phải lỗ hổng hay không | High |
| UT-GATEWAY-037 | Rate limiter key resolver không đọc header X-User-Id | Unit | Xác nhận `userKeyResolver` lấy key từ `SecurityContext` (JWT sub) hoặc IP, KHÔNG đọc header `X-User-Id` (vì `UserHeaderFilter` chạy sau `RequestRateLimiter` theo thứ tự filter) | Mock `ServerWebExchange` có header `X-User-Id` giả nhưng SecurityContext rỗng | Gọi `userKeyResolver().resolve(exchange)` | Key trả về dựa trên `"ip:" + remoteAddress`, KHÔNG dùng giá trị từ header `X-User-Id` | Medium |

---

## 11. Tổng hợp Test ID theo module

| Module | Khoảng Test ID |
|---|---|
| Routing theo path prefix | IT-GATEWAY-001 → 006 |
| Public API không cần token | IT-GATEWAY-007 → 009, UT-GATEWAY-010 |
| Secured API chặn tại Gateway (thiếu/sai token) | IT-GATEWAY-011 → 012 |
| Inject header X-User-* | UT-GATEWAY-013 → 015, 018, IT-GATEWAY-016 → 017 |
| Chặn Internal API | IT-GATEWAY-019 → 020, UT-GATEWAY-021 |
| CORS | IT-GATEWAY-022 → 024 |
| Eureka discovery & load balancing | IT-GATEWAY-025 → 029 |
| Lỗi (token/role/service down) | IT-GATEWAY-030 → 035 |
| Edge case & bảo mật | IT-GATEWAY-036, UT-GATEWAY-037 |
