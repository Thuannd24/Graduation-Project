# TÀI LIỆU THIẾT KẾ: API GATEWAY & SERVICE DISCOVERY
## (Cổng Kết Nối API & Đăng Ký Dịch Vụ)

> **Port:** Gateway `8080`, Eureka Server `8761` | **Technology:** Spring Cloud Gateway, Netflix Eureka Server, Keycloak, Redis | **Version:** 1.0.0

---

## I. TỔNG QUAN VÀ NHIỆM VỤ

Trong một hệ thống microservice quy mô lớn, API Gateway và Service Discovery là hai thành phần thiết yếu đóng vai trò làm hạ tầng chịu tải và điều phối toàn bộ giao tiếp.

### 1.1. Nhiệm vụ của API Gateway (`8080`)
1. **Entry Point (Cửa ngõ duy nhất):** Mọi request từ Client (Web/Mobile App) đi vào hệ thống đều phải đi qua Gateway.
2. **Centralized Authentication (Xác thực tập trung):** Tích hợp OAuth2 Resource Server với **Keycloak**. Kiểm tra tính hợp lệ của JWT token ngay tại Gateway.
3. **Header Propagation (Lan truyền dữ liệu xác thực):** Gateway sau khi verify token sẽ tự động giải mã JWT, lấy thông tin User ID, Email, Roles và inject vào các HTTP Headers (`X-User-Id`, `X-User-Email`, `X-User-Roles`) trước khi forward request xuống các microservice nghiệp vụ. Nhờ vậy, các service phía sau không cần kết nối với Keycloak hay viết lại code verify token.
4. **Dynamic Routing (Định tuyến động):** Tự động phân giải địa chỉ IP của các service từ Eureka Server để cân bằng tải (Load Balancing) thông qua Spring Cloud LoadBalancer.
5. **WebSocket & SSE Support:** Định tuyến chính xác và duy trì các kết nối thời gian thực phục vụ Chatbot (SSE) và live chat với tư vấn viên (WebSocket).
6. **Rate Limiting:** Sử dụng Redis Rate Limiter để giới hạn tần suất gửi request của Client trên mỗi User ID/IP Address nhằm chống DDOS và kiểm soát chi phí gọi AI API.

### 1.2. Nhiệm vụ của Eureka Discovery Server (`8761`)
1. **Service Registration (Đăng ký dịch vụ):** Các microservice khi khởi động sẽ tự động đăng ký tên dịch vụ (ví dụ: `product-service`, `order-service`) kèm địa chỉ IP và Port hiện tại với Eureka Server.
2. **Service Discovery (Phát hiện dịch vụ):** Gateway và các microservice gọi chéo lẫn nhau (qua OpenFeign/WebClient) sẽ truy vấn Eureka để tìm địa chỉ IP hoạt động của service đích mà không cần cấu hình IP cứng.
3. **Heartbeat & Health Check:** Tự động loại bỏ các instance của service ra khỏi danh sách định tuyến nếu không nhận được tín hiệu heartbeat định kỳ (30 giây).

---

## II. SƠ ĐỒ ĐỊN H TUYẾN VÀ BẢO MẬT (ROUTING & SECURITY FLOW)

```
[ Khách hàng / Client ]
           │
  (Gửi Request + JWT)
           │
           ▼
┌────────────────────────────────────────────────────────┐
│               API GATEWAY (Port 8080)                  │
│                                                        │
│  1. Check whitelist (đường dẫn public)                 │
│  2. Verify JWT token với Keycloak                      │
│  3. Giải mã JWT -> Lấy User ID, Roles, Email           │
│  4. Inject Headers: X-User-Id, X-User-Roles            │
│  5. Redis Rate Limiter check (Token Bucket)            │
│  6. Hỏi Eureka Server địa chỉ IP của service đích      │
└──────────────────┬─────────────────────────────────────┘
                   │
         (Forward request kèm Header)
                   │
  ┌────────────────┼────────────────┬────────────────┐
  ▼                ▼                ▼                ▼
[User-Service] [Product-Service] [Order-Service] [AI-FastAPI-Service]
 (Port 8085)    (Port 8089)      (Port 8082)      (Port 8000)
```

---

## III. CHI TIẾT ĐỊNH TUYẾN (ROUTE MAP)

Gateway định tuyến dựa trên prefix của URL request:

| Prefix | Service Đích | Load Balancer URI | Loại API | Cấu hình Đặc biệt |
|---|---|---|---|---|
| `/api/users/**` | Identity & User Service | `lb://user-service` | Cần JWT | Cho phép CORS |
| `/api/products/**` | Product & Catalog Service | `lb://product-service` | Public | Cache Response |
| `/api/orders/**` | Cart & Order Service | `lb://order-service` | Cần JWT | Hỗ trợ Spring Session |
| `/api/payments/**` | Payment Service | `lb://payment-service` | Hỗ trợ hỗn hợp | Webhook public, API cần JWT |
| `/api/notifications/**` | Notification Service | `lb://notification-service` | Cần JWT | Cho phép WebSocket upgrade |
| `/api/promotions/**` | Promotion Service | `lb://promotion-service` | Cần JWT | - |
| `/api/chat/**` | Identity & User Service | `lb://user-service` | Cần JWT | Hỗ trợ SSE (Server-Sent Events) |
| `/api/ai/**` | AI Engine (FastAPI) | `lb://ai-engine-service` | Nội bộ/Public | Timeout dài hơn (đợi LLM trả lời) |

---

## IV. CẤU HÌNH XÁC THỰC VÀ TRUYỀN DẪN HEADER (SECURITY DESIGN)

### 4.1. Security Filter Chain trên Gateway (Kotlin/Java)

```java
@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
        http
            .csrf(csrf -> csrf.disable())
            .authorizeExchange(exchanges -> exchanges
                // Whitelist các API công khai không cần token
                .pathMatchers("/api/products/**", "/api/payments/webhook/**", "/eureka/**").permitAll()
                // Tất cả các API khác đều phải xác thực
                .anyExchange().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(grantedAuthoritiesExtractor()))
            );
        return http.build();
    }
}
```

### 4.2. Gateway Filter: Inject User Info Headers
Khi Token hợp lệ, Gateway Filter sẽ chạy qua class sau để giải mã và inject thông tin vào Header gửi xuống các microservice nội bộ:

```java
@Component
public class AuthenticationHeaderFilter extends AbstractGatewayFilterFactory<AuthenticationHeaderFilter.Config> {

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> exchange.getPrincipal()
            .cast(JwtAuthenticationToken.class)
            .map(jwtToken -> {
                Jwt jwt = jwtToken.getToken();
                String userId = jwt.getSubject(); // Sub claim từ Keycloak (UUID)
                String email = jwt.getClaimAsString("email");
                List<String> roles = jwt.getClaimAsStringList("roles");

                // Tạo request mới chứa các header bổ sung
                ServerHttpRequest request = exchange.getRequest().mutate()
                    .header("X-User-Id", userId)
                    .header("X-User-Email", email)
                    .header("X-User-Roles", String.join(",", roles))
                    .build();

                return exchange.mutate().request(request).build();
            })
            .defaultIfEmpty(exchange)
            .flatMap(chain::filter);
    }
}
```

---

## V. CẤU HÌNH RATE LIMITER (CHỐNG SPAM AI API)

Sử dụng Redis Rate Limiter để giới hạn tần suất gọi API, đặc biệt là `/api/chat` (LLM RAG) để tránh lạm dụng làm tăng phí Cloud API.

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: chatbot-route
          uri: lb://user-service
          predicates:
            - Path=/api/chat/**
          filters:
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 2      # Tốc độ nạp token (2 token/giây)
                redis-rate-limiter.burstCapacity: 10     # Dung lượng tối đa (chứa tối đa 10 request đồng thời)
                key-resolver: "#{@userKeyResolver}"     # Phân biệt giới hạn theo từng User ID
```

---

## VI. CẤU HÌNH DOCKER COMPOSE CHO HẠ TẦNG

```yaml
version: '3.8'

services:
  eureka-server:
    image: ecommerce/eureka-server:latest
    ports:
      - "8761:8761"
    environment:
      EUREKA_CLIENT_REGISTER_WITH_EUREKA: "false"
      EUREKA_CLIENT_FETCH_REGISTRY: "false"
    networks:
      - ecommerce-network

  api-gateway:
    image: ecommerce/api-gateway:latest
    ports:
      - "8080:8080"
    environment:
      SPRING_APPLICATION_NAME: api-gateway
      EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE: http://eureka-server:8761/eureka/
      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI: http://keycloak:8080/realms/ecommerce-realm
      SPRING_DATA_REDIS_HOST: redis
    depends_on:
      - eureka-server
      - redis
      - keycloak
    networks:
      - ecommerce-network

networks:
  ecommerce-network:
    external: true
```

---
*Tài liệu thuộc nhóm 2 — Kiến trúc & Kỹ thuật chuyên sâu.*
