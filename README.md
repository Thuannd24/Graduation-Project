# AuraTech — Hệ Thống Thương Mại Điện Tử Phân Tán (Microservices)

Kiến trúc Microservices hiệu năng cao, giao tiếp qua **gRPC** và **Event-Driven Kafka**, đảm bảo tính nhất quán dữ liệu phân tán.

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

> 💡 **IntelliJ Maven:** `Settings → Build → Maven → Runner → JRE → Java 21`, sau đó chạy `clean` → `package` từ tab Maven.

---

## 🌐 FRONTEND (FE)

```bash
cd FE
npm install
npm run dev     # http://localhost:5173
```

---

## 🔧 TOOLS — Khởi Tạo Dữ Liệu DB

Sau khi hệ thống chạy, import ~1.100 sản phẩm (categories, brands, products, variants, ảnh R2, tồn kho) bằng công cụ tại `tools/catalog-import/`.

> 📄 Hướng dẫn chi tiết: [`tools/catalog-import/README.md`](tools/catalog-import/README.md)

```bash
cd tools/catalog-import
npm install
cp .env.example .env     # điền ADMIN_TOKEN (xem bên dưới)

npm run setup            # import toàn bộ catalog
npm run seed-inventory   # set tồn kho mặc định = 10/variant
```

**Lấy `ADMIN_TOKEN`:** Đăng nhập admin → F12 → Application → Local Storage → copy `access_token`.
> ⚠️ Token hết hạn sau **15 phút**. Nếu gặp lỗi `401` — lấy token mới, dán vào `.env`, chạy lại (an toàn, dữ liệu cũ sẽ được **update** thay vì tạo trùng).

**Reset DB trước khi import lại (nếu cần):**
```bash
docker exec -i infra-mariadb mariadb -u root -proot ecommerce_product_db -e "
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE variant_option_values; TRUNCATE TABLE product_variants;
TRUNCATE TABLE product_images; TRUNCATE TABLE product_tags;
TRUNCATE TABLE product_attribute_values; TRUNCATE TABLE products;
TRUNCATE TABLE brand_categories; TRUNCATE TABLE brands;
TRUNCATE TABLE category_attributes; TRUNCATE TABLE categories; TRUNCATE TABLE attributes;
SET FOREIGN_KEY_CHECKS=1;"

docker exec -i infra-mariadb mariadb -u root -proot ecommerce_inventory_db -e "
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE inventories; TRUNCATE TABLE inventory_transactions;
SET FOREIGN_KEY_CHECKS=1;"
```

---

## 📊 CỔNG DỊCH VỤ & QUẢN TRỊ

| Dịch vụ | URL / Port | Tài khoản |
|---|---|---|
| **Frontend** | http://localhost:5173 | Đăng ký trực tiếp / Google OAuth |
| **API Gateway** | http://localhost:8080 | — |
| **Eureka Dashboard** | http://localhost:8761 | — |
| **Keycloak Admin** | http://localhost:8083 | `admin` / `admin` |
| **MinIO Console** | http://localhost:9001 | `minio` / `12345678a@` |
| **Kafka UI** | http://localhost:8090 | — |
| **Redis Insight** | http://localhost:5540 | — |
| **MariaDB** | localhost:3308 | `root` / `root` |
| **MongoDB** | localhost:27017 | — |
