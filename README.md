# AuraTech — Hệ Thống Thương Mại Điện Tử Phân Tán (Microservices)


**Stack:** Spring Boot 3.x · Spring Cloud Gateway · Netflix Eureka · FastAPI · ReactJS · Vite · MariaDB · MongoDB · Redis · Kafka · Elasticsearch · MinIO · Keycloak 24.x

---

## ⚙️ CẤU HÌNH CHUNG (thực hiện trước cả hai hướng)

```bash
cp BE/.env.example BE/.env
cp FE/.env.example FE/.env
```

---

## 🖥️ BACKEND (BE)

### Hướng 1 — Full Docker *(demo nhanh)*

```bash
cd BE
mvn clean package -DskipTests      # build JAR trên host
cd ..
docker-compose up -d --build        # khởi động toàn bộ hệ thống
```

### Hướng 2 — Hybrid: Infra Docker + Service trên IntelliJ *(phát triển / debug)*

```bash
# 1. Build JAR cho Eureka + Gateway
cd BE && mvn clean package -DskipTests

# 2. Khởi động hạ tầng lõi (DB, Kafka, Redis, MinIO, Keycloak...)
docker-compose -f docker-compose-infra.yml up -d --build
```

Sau đó chạy từng service trong IntelliJ (Run Spring Boot Application):

| Service | Port |
|---|---|
| `user-service` | 8085 |
| `product-service` | 8089 |
| `order-service` | 8082 |
| `inventory-service` | 8093 |
| `payment-service` | 8084 |
| `notification-service` | 8086 |
| `promotion-service` | 8087 |


## 🌐 FRONTEND (FE)

```bash
cd FE
npm install
npm run dev     # http://localhost:5173
```

---

## 🤖 AI SERVICES (Python/FastAPI — độc lập với BE, KHÔNG chạy trong IntelliJ)

> 4 service Python nằm trong `AI/`: `chatbot-service` (8002), `search-service` (8001), `recs-service` (8003), `forecast-service` (8004). Chi tiết kiến trúc: [`AI/README.md`](AI/README.md); riêng chatbot xem thêm [`docs/canvas/chatbot-ai.md`](docs/canvas/chatbot-ai.md).

```bash
cd AI
cp .env.example .env       # điền DEEPSEEK_API_KEY để chatbot trả lời thật (không có thì chạy chế độ mock)

python -m venv venv
.\venv\Scripts\activate     # Linux/macOS: source venv/bin/activate
```

**Hướng 1 — Docker (chạy cả 4 service cùng lúc):**
```bash
docker-compose up --build -d
```

**Hướng 2 — Chạy từng service (phát triển/debug), ví dụ chatbot-service:**
```bash
cd chatbot-service
pip install -r requirements.txt
python scripts/build_policy_index.py   # bắt buộc, chỉ cần chạy lần đầu (dựng FAISS index chính sách)
python main.py                          # cổng 8002
```
Lặp lại `pip install -r requirements.txt` + `python main.py` trong thư mục từng service còn lại (`search-service`, `recs-service`, `forecast-service`).

> Cần Redis chạy sẵn (từ `docker-compose-infra.yml` ở BE) để lưu lịch sử chat. Thiếu `order-service`/`user-service`/`promotion-service` vẫn khởi động được, chỉ các câu hỏi tra cứu đơn hàng/điểm thưởng/voucher sẽ báo "chưa tra cứu được".

---

## 🔧 TOOLS — Khởi Tạo Dữ Liệu DB

> 📄 Hướng dẫn chi tiết: [`tools/catalog-import/README.md`](tools/catalog-import/README.md)

**Lấy `ADMIN_TOKEN`:** Đăng nhập admin → F12 → Application → Local Storage → copy `access_token`.

```bash
cd tools/catalog-import
npm install
cp .env.example .env     # điền ADMIN_TOKEN (xem bên dưới)

npm run setup            # import toàn bộ catalog
npm run seed-inventory   # set tồn kho mặc định = 10/variant
```
