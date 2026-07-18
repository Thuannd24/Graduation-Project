# Hướng dẫn Deploy Production — AuraTech trên AWS EC2

Ghi lại toàn bộ các bước đã làm để deploy hệ thống lên production. Dùng để làm lại từ đầu (server mới) hoặc tham khảo khi cần sửa/mở rộng.

## ⚠️ Lịch sử phát hiện bảo mật (đã fix trong code, 17/7/2026)

Quét lại toàn bộ source code phát hiện các giá trị fallback mặc định (`${VAR:giá-trị-thật}`) bị hardcode nhầm **giá trị thật** thay vì placeholder giả — đã sửa hết trong code, nhưng lịch sử Git (commit cũ) vẫn còn chứa các giá trị này nếu repo là public:

1. **`notification-service/application.yml`** — Gmail cá nhân thật (`thuan2412004@gmail.com`) + App Password thật bị hardcode làm default. **Đã thu hồi/tạo App Password mới chưa? Nếu repo public và chưa làm — làm ngay tại myaccount.google.com → Security → App Passwords.**
2. **`user-service/application.yml`** — `KEYCLOAK_ADMIN_CLIENT_SECRET` thật bị hardcode làm default (cũng lộ trong `keycloak-data/ecommerce-realm-realm.json`) — đã regenerate qua Admin Console cho server đang chạy, đã sửa code dùng placeholder.
3. **`promotion-service/application.yml`** — Camunda admin/admin hardcode cứng không qua biến môi trường — đã sửa thành biến `CAMUNDA_ADMIN_PASSWORD`.

**Bài học áp dụng cho code sau này**: giá trị fallback mặc định (`${VAR:default}`) chỉ nên dùng cho config KHÔNG nhạy cảm (host, port...) hoặc giá trị **rõ ràng là giả** (`dev-xxx`, `changeme-xxx`) — không bao giờ được là secret/mật khẩu/token thật, kể cả để tiện code local.

## 0. Tài khoản & hạ tầng đã dùng

- **AWS**: tài khoản mới qua GitHub Student Pack, $200 credit (hết hạn ~9/9/2026 — cứng bất kể dùng ít hay nhiều).
- **EC2 instance**: `auratech-prod`, loại `m7i-flex.large` (2 vCPU / 8GB RAM), Ubuntu 24.04 LTS, region `us-east-1` (N. Virginia — lưu ý: KHÔNG phải Singapore như dự tính ban đầu, do lúc launch chọn nhầm region, độ trễ với user VN sẽ cao hơn — cân nhắc đổi region nếu launch lại từ đầu).
- **Storage**: 50GB gp3.
- **Key pair**: tên `aura` (file `.pem` đã tải về máy công ty lúc launch — cần cho SSH client thật; không bắt buộc nếu chỉ dùng EC2 Instance Connect qua browser).
- **Domain**: `auratechvn.online` (mua ở Tenten/Mắt Bão, ~35,000đ/năm). DNS: 3 bản ghi A (`@`, `auth`, `cdn`) đều trỏ về IP EC2.
- **IP hiện tại**: `13.217.142.118` (⚠️ IP này KHÔNG cố định — nếu instance bị stop/start lại, IP sẽ đổi trừ khi gắn Elastic IP. Nếu IP đổi, phải cập nhật lại 3 bản ghi A trên Tenten).

## 1. Launch EC2 instance

1. AWS Console → EC2 → Launch instance.
2. AMI: Ubuntu 22.04/24.04 LTS.
3. Instance type: `m7i-flex.large` (hoặc tương đương 8GB RAM — kiểm tra "Free tier eligible" trong danh sách vì AWS tính vào credit).
4. Key pair: tạo mới hoặc chọn có sẵn.
5. Network settings → Create security group:
   - SSH (22) — Source: My IP (sau khi launch xong nếu dùng EC2 Instance Connect qua browser bị lỗi "Failed to connect", đổi tạm Source sang Anywhere-IPv4 0.0.0.0/0 để test qua, rồi có thể siết lại sau).
   - HTTP (80) — Anywhere.
   - HTTPS (443) — Anywhere.
6. Configure storage: đổi từ 8GB mặc định lên **50GB**.
7. Launch instance.

## 2. Cài Docker + các tool cần thiết trên EC2

Kết nối vào server: EC2 Console → Instances → chọn instance → **Connect** → tab **EC2 Instance Connect** → **Connect**.

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot   # nếu có kernel update pending, đợi ~1 phút rồi connect lại
```

Cài Docker:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
sudo apt install -y docker-compose-plugin
exit   # thoát rồi connect lại để quyền docker group có hiệu lực
```

Cài Node.js 20 (cho FE build):
```bash
sudo apt remove -y nodejs npm libnode109   # nếu trước đó lỡ cài bản cũ từ apt
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```
> ✅ **Kết quả hợp lệ**: `v20.x.x`. Nếu ra `v18.x.x` → NodeSource chưa cài đè thành công, chạy lại 3 dòng trên.

Cài Java 17 + Maven (build BE services — Dockerfile của BE KHÔNG tự build Maven bên trong, cần jar build sẵn trước):
```bash
sudo apt install -y openjdk-17-jdk maven
java -version
mvn -version
```
> ✅ **Kết quả hợp lệ**: `java -version` ra `openjdk version "17...`; `mvn -version` ra `Apache Maven 3.x.x`, không có dòng `command not found`.

## 3. Clone code

```bash
git clone https://github.com/Thuannd24/Graduation-Project.git auratech
cd auratech
```

## 4. Đăng ký domain + trỏ DNS

Domain mua ở Tenten/Mắt Bão (thanh toán nội địa, né vấn đề thẻ quốc tế bị từ chối gặp phải ở DigitalOcean/Namecheap).

Vào phần quản lý DNS của domain, thêm 3 bản ghi **A**, đều trỏ về IP EC2 hiện tại:
| Tên | Loại | Giá trị |
|---|---|---|
| `@` | A | `<IP EC2>` |
| `auth` | A | `<IP EC2>` |
| `cdn` | A | `<IP EC2>` |

DNS lan truyền trong vòng vài phút đến 24 giờ.

> Nếu chưa có/không mua được domain: dùng free `<ip-with-dashes>.sslip.io` (ví dụ IP `13.217.142.118` → `13-217-142-118.sslip.io`), không cần đăng ký gì, Let's Encrypt vẫn cấp HTTPS bình thường.

## 4b. (Khuyến nghị) Đưa domain qua Cloudflare — chống DDoS, ẩn IP thật, miễn phí

Không bắt buộc để chạy được, nhưng nên làm vì server nhỏ không có bảo vệ DDoS/WAF chuyên dụng nếu trỏ DNS thẳng vào IP EC2.

1. Tạo tài khoản tại **cloudflare.com** (free, không cần thẻ).
2. **"Add a site"** → gõ domain → chọn gói **"Free"**.
3. Cloudflare tự quét DNS hiện có — kiểm tra đủ 3 bản ghi A (`@`, `auth`, `cdn`) trỏ đúng IP EC2. Thiếu thì thêm tay.
4. **Bật Proxy (icon đám mây màu 🟠 cam)** cho cả 3 bản ghi A — đây là bước quan trọng nhất, tắt (⚪ xám) thì không được bảo vệ gì cả.
5. Cloudflare cho 2 **nameserver** dạng `xxx.ns.cloudflare.com` — vào **Tenten → quản lý domain → mục "Nameserver"** (khác "DNS Record"), đổi sang 2 nameserver này. Đợi tối đa 24h để có hiệu lực (Cloudflare tự báo "Active" khi xong).
6. Trong Cloudflare Dashboard → **SSL/TLS**, chọn chế độ **"Full (strict)"** (KHÔNG chọn "Flexible" — sẽ lỗi vì Caddy đã tự có cert HTTPS thật rồi).
7. **SSL/TLS → Edge Certificates → bật "Always Use HTTPS"**.

> ⚠️ Sau khi đổi nameserver sang Cloudflare, việc sửa DNS record (nếu IP EC2 đổi sau này) phải làm trong **Cloudflare Dashboard**, không còn làm ở Tenten nữa.

## 5. Tạo file `.env` cho BE (production)

```bash
cd ~/auratech/BE
cp .env.example .env

export NEW_DB_PASSWORD=$(openssl rand -base64 24)
export NEW_MINIO_SECRET=$(openssl rand -base64 24)
export NEW_INTERNAL_API_KEY=$(openssl rand -base64 32)
export NEW_SHIPPING_WEBHOOK_SECRET=$(openssl rand -base64 32)
export NEW_KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 16)
export NEW_KEYCLOAK_CLIENT_SECRET=$(openssl rand -base64 24)
export NEW_CAMUNDA_ADMIN_PASSWORD=$(openssl rand -base64 16)
export DOMAIN="auratechvn.online"   # đổi theo domain thật của bạn
echo "Keycloak admin password (LƯU LẠI): $NEW_KEYCLOAK_ADMIN_PASSWORD"

sed -i \
  -e "s#^DB_PASSWORD=.*#DB_PASSWORD=${NEW_DB_PASSWORD}#" \
  -e "s#^MINIO_SECRET_KEY=.*#MINIO_SECRET_KEY=${NEW_MINIO_SECRET}#" \
  -e "s#^KEYCLOAK_ISSUER_URI=.*#KEYCLOAK_ISSUER_URI=https://auth.${DOMAIN}/realms/ecommerce-realm#" \
  -e "s#^KEYCLOAK_SERVER_URL=.*#KEYCLOAK_SERVER_URL=https://auth.${DOMAIN}#" \
  -e "s#^KEYCLOAK_ADMIN_URL=.*#KEYCLOAK_ADMIN_URL=https://auth.${DOMAIN}#" \
  -e "s#^VNPAY_RETURN_URL=.*#VNPAY_RETURN_URL=https://${DOMAIN}/api/v1/public/payments/vnpay-callback#" \
  -e "s#^FRONTEND_URL=.*#FRONTEND_URL=https://${DOMAIN}#" \
  -e "s#^MINIO_PUBLIC_ENDPOINT=.*#MINIO_PUBLIC_ENDPOINT=https://cdn.${DOMAIN}#" \
  .env

cat >> .env << EOF

# --- Added for production deploy ---
DOMAIN=${DOMAIN}
KEYCLOAK_ADMIN_PASSWORD=${NEW_KEYCLOAK_ADMIN_PASSWORD}
KEYCLOAK_ADMIN_CLIENT_SECRET=${NEW_KEYCLOAK_CLIENT_SECRET}
CAMUNDA_ADMIN_PASSWORD=${NEW_CAMUNDA_ADMIN_PASSWORD}
INTERNAL_API_KEY=${NEW_INTERNAL_API_KEY}
SHIPPING_WEBHOOK_SECRET=${NEW_SHIPPING_WEBHOOK_SECRET}
WARRANTY_OTP_EXPOSE=false
EOF
```

Cần điền tay thêm (đang để placeholder, không bắt buộc để chạy được nhưng cần cho tính năng đầy đủ):
- `MAIL_USERNAME` / `MAIL_PASSWORD` — Gmail thật + App Password (để gửi email xác nhận đơn hàng).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — cần đăng ký OAuth client thật trên Google Cloud Console, thêm redirect URI `https://auth.<domain>/realms/ecommerce-realm/broker/google/endpoint` (để nút "Đăng nhập Google" hoạt động).

> 💡 **Quan trọng — làm đúng thứ tự để KHÔNG phải sửa tay trong Keycloak Admin Console mỗi lần deploy lại:**
> File `keycloak-data/ecommerce-realm-realm.json` đã được sửa để dùng placeholder `${DOMAIN}` cho redirect URI của client `ecommerce-frontend`, và Google Identity Provider đã sẵn dùng `${GOOGLE_CLIENT_ID}`/`${GOOGLE_CLIENT_SECRET}`. Các placeholder này **chỉ được thay thế đúng vào lúc Keycloak import realm LẦN ĐẦU TIÊN** (database `keycloak_db` còn trống). Vì vậy:
> - Phải điền **`DOMAIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` thật** vào `.env` **TRƯỚC KHI** chạy `docker compose up` cho Keycloak lần đầu trên 1 server mới.
> - Nếu deploy xong rồi mới đổi các giá trị này trong `.env` → **không có tác dụng** (vì realm đã tồn tại, `IGNORE_EXISTING` sẽ bỏ qua) — lúc đó phải sửa tay qua Admin Console (Clients/Identity Providers) như đã làm ở lần deploy đầu tiên này.
> - Nói cách khác: **set đúng `.env` trước, deploy 1 lần cho sạch** — sẽ không cần đụng vào Keycloak Admin Console UI nữa.

## 6. Tạo `.env` cho FE + build

```bash
cd ~/auratech/FE
cat > .env << EOF
VITE_API_URL=https://auratechvn.online/api/v1
VITE_KEYCLOAK_URL=https://auth.auratechvn.online
VITE_KEYCLOAK_REALM=ecommerce-realm
VITE_KEYCLOAK_CLIENT_ID=ecommerce-frontend
EOF
npm install
npm run build
```

(`npm run build` phải chạy SAU khi tạo `.env` vì Vite bake giá trị env vào lúc build.)

## 7. Tạo database `keycloak_db` + đồng bộ mật khẩu root MariaDB

MariaDB trong `docker-compose.yml` gốc khởi tạo với root password cứng là `root` (biến `MARIADB_ROOT_PASSWORD=root`), khác với `DB_PASSWORD` mới rotate ở bước 5 — cần đồng bộ lại (chỉ cần làm 1 lần, lúc volume MariaDB còn mới/trống):

```bash
cd ~/auratech/BE
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d mariadb
# đợi ~15-20s cho MariaDB khởi động xong

DB_PASS=$(grep '^DB_PASSWORD=' .env | cut -d '=' -f2-)
docker exec -it local-mariadb mariadb -uroot -proot -e "
ALTER USER 'root'@'%' IDENTIFIED BY '$DB_PASS';
ALTER USER 'root'@'localhost' IDENTIFIED BY '$DB_PASS';
FLUSH PRIVILEGES;
CREATE DATABASE IF NOT EXISTS keycloak_db;
"
docker exec -it local-mariadb mariadb -uroot -p"$DB_PASS" -e "SHOW DATABASES;"
```
> ✅ **Kết quả hợp lệ**: lệnh `ALTER USER`/`CREATE DATABASE` không in ra gì (im lặng = thành công). Lệnh `SHOW DATABASES` cuối phải liệt kê được `keycloak_db` trong danh sách. Nếu thấy `ERROR 1045 Access denied` — nghĩa là mật khẩu chưa đồng bộ, chạy lại đúng khối lệnh trên (không được bỏ dòng `ALTER USER`).

> ⚠️ **Quan trọng**: file `docker-compose.prod.yml` phải dùng `KC_DB=mariadb` (không phải `mysql`) và `KC_DB_URL=jdbc:mariadb://...` — dùng nhầm `mysql` sẽ khiến Liquibase (migration tool của Keycloak) nhận sai dialect, dẫn tới lỗi `Table 'PROTOCOL_MAPPER' already exists` lặp lại vô hạn mỗi lần Keycloak restart. Bản trong repo đã sửa đúng, không cần làm lại nếu clone code mới.

## 8. Build Maven (bắt buộc trước khi docker build)

Dockerfile của các service Java **không tự build Maven** — chỉ COPY jar có sẵn từ `<service>/target/`. Phải build trước:

```bash
cd ~/auratech/BE
mvn clean package -DskipTests
```

(Lần đầu mất ~5-15 phút do tải dependency + compile 10 module.)

> ✅ **Kết quả hợp lệ**: cuối log thấy `BUILD SUCCESS` và bảng "Reactor Summary" liệt kê đủ 10 module (`ecommerce-parent`, `grpc-common`, `eureka-server`, `api-gateway`, `user-service`, `product-service`, `order-service`, `inventory-service`, `payment-service`, `notification-service`, `promotion-service`) đều `SUCCESS`. Nếu có dòng `BUILD FAILURE` — đọc lỗi ngay phía trên, thường do thiếu dependency mạng hoặc code lỗi biên dịch.

## 9. Chạy toàn bộ stack production

```bash
cd ~/auratech/BE
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build \
  eureka-server api-gateway user-service product-service order-service \
  inventory-service payment-service notification-service promotion-service \
  mariadb mongodb redis kafka debezium-connect debezium-init elasticsearch \
  minio keycloak caddy
```

Cố ý **không** chạy `kafka-ui`, `redis-insight`, `kibana` (tool dev-only, không đáng RAM trên máy 8GB).

> ✅ **Kết quả hợp lệ**: cuối cùng thấy dòng `[+] up N/N` với toàn bộ container `Started`/`Healthy`/`Running`, không có dòng `ERROR`/`failed to solve`. Container `local-debezium-connect` và `local-debezium-init` có thể mất tới ~4-5 phút mới chuyển sang healthy (do healthcheck `start_period: 180s`) — thấy "Waiting"/"Starting" lâu là bình thường, không phải lỗi, cứ để chạy tiếp (không cần Ctrl+C).
>
> Kiểm tra lại bất cứ lúc nào bằng:
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
> ```
> Cột `STATUS` phải là `Up ... (healthy)` hoặc `Up ...` (một số service không khai báo healthcheck nên chỉ hiện `Up`, vẫn bình thường).

## 10. Các bước kiểm tra sau khi deploy

- [ ] `docker compose ps` — tất cả container ở trạng thái `Up`/`healthy`.
- [ ] `docker stats --no-stream` — kiểm tra cột `MEM USAGE / LIMIT` không có container nào sát trần `mem_limit` đã đặt.
- [ ] `curl -I https://auratechvn.online` → kỳ vọng `HTTP/2 200`.
- [ ] `curl -I https://auth.auratechvn.online` → kỳ vọng `HTTP/2 302` với header `location: .../admin/` (Keycloak redirect trang gốc sang admin console — đây là bình thường, không phải lỗi).
- [ ] Truy cập `https://auratechvn.online` trên trình duyệt — FE load được, ổ khóa HTTPS hợp lệ (không cảnh báo "Not secure").
- [ ] Truy cập `https://auth.auratechvn.online/admin` — vào được trang đăng nhập Keycloak Admin Console, login bằng `admin` + mật khẩu đã lưu (`KEYCLOAK_ADMIN_PASSWORD` trong `.env`).
- [ ] Đăng ký 1 user test qua UI thật, xong chạy `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart keycloak`, kiểm tra user đó **không bị mất** (xác nhận fix `IGNORE_EXISTING` hoạt động). ⚠️ Sau khi restart bất kỳ service backend nào thủ công, nhớ restart luôn `caddy` (`docker compose ... restart caddy`) — nếu không Caddy có thể giữ kết nối tới IP nội bộ cũ và trả về lỗi 502.
- [ ] Kiểm tra các port cũ (3308, 27017, 6379, 9200, 8090, 5540, 5601, 9001, 8761, 8085, 8089, 8082, 8093, 8084, 8086, 8087) **không** truy cập được từ bên ngoài.

  **Cách test** (bắt buộc làm từ **máy khác**, KHÔNG phải từ chính server — vì trong docker network port vẫn "mở" nội bộ, đó là bình thường):
  - Cách 1 — dùng trang **canyouseeme.org**: đổi IP về `13.217.142.118` (hoặc IP hiện tại), nhập lần lượt từng port (`3306`, `27017`, `6379`, `8085`, `8089`, `8082`, `8093`, `8084`, `8086`, `8087`, `8761`, `9200`, `8090`, `5540`, `5601`, `9001`) → kỳ vọng **"Error: I could not see your service"** (nghĩa là đóng, an toàn) cho TẤT CẢ các port này.
  - Cách 2 — có terminal (máy nhà/điện thoại có Termux...): `curl -m 5 http://13.217.142.118:3306` → kỳ vọng lệnh treo rồi báo timeout (`curl: (28) Connection timed out`), KHÔNG được trả lời gì (nếu trả lời tức là đang lộ).
  - Chỉ port **80** và **443** được phép "mở"/trả lời — đây là port Caddy phục vụ công khai, đúng thiết kế.

## 11. Import dữ liệu catalog mẫu (~1,100 sản phẩm)

Dùng công cụ có sẵn ở `tools/catalog-import/` (đã có 19 file JSON scrape sẵn trong `manifests/`, ảnh đã trỏ Cloudflare R2 — không phụ thuộc site nguồn).

1. Lấy `ADMIN_TOKEN`: đăng nhập tài khoản admin tại `https://auratechvn.online` (user admin có sẵn từ Keycloak realm import) → F12 → Application → Local Storage → copy giá trị `access_token`.
   > Token hết hạn sau 15 phút — nếu `npm run setup` báo lỗi 401 giữa chừng, lấy token mới dán lại, chạy lại (an toàn, dữ liệu cũ được update chứ không tạo trùng).

2. Chạy trên server (đã có Node 20 từ bước 2) hoặc máy nhà (chỉ cần trỏ đúng `API_BASE_URL`):
   ```bash
   cd ~/auratech/tools/catalog-import
   npm install
   cp .env.example .env
   ```
   Sửa `.env`:
   ```env
   API_BASE_URL=https://auratechvn.online/api/v1
   ADMIN_TOKEN=<token vừa lấy>
   ```
   (Chưa cần điền phần `R2_*` — chỉ cần khi chạy `mirror-images.mjs`/`backup-manifests.mjs`/`clean-broken-products.mjs`, không cần cho `setup`/`seed-inventory` cơ bản.)

3. Import:
   ```bash
   npm run setup            # import categories, brands, products, variants, ảnh (URL R2 có sẵn)
   npm run seed-inventory    # set tồn kho mặc định = 10/variant
   ```

## 12. Quy trình cập nhật code sau này (không cần làm lại từ đầu)

Từ máy nhà (có git):
```bash
git add .
git commit -m "..."
git push
```

Trên server (sửa 1 service):
```bash
cd ~/auratech
git pull
cd BE
mvn clean package -DskipTests -pl <tên-service> -am   # chỉ build service đã sửa
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build <tên-service>
```

Nếu sửa **nhiều service cùng lúc** — liệt kê tên cách nhau bằng dấu **phẩy** cho Maven (`-pl`), dấu **cách** cho Docker Compose:
```bash
cd ~/auratech
git pull
cd BE
mvn clean package -DskipTests -pl product-service,order-service,inventory-service -am
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build product-service order-service inventory-service
```
(`-am` build kèm các module mà những service trên phụ thuộc, ví dụ `grpc-common` — luôn giữ `-am` dù build 1 hay nhiều service.)

Nếu sửa FE:
```bash
cd ~/auratech/FE
git pull   # nếu chưa pull ở BE
npm run build
docker compose -f ../BE/docker-compose.yml -f ../BE/docker-compose.prod.yml restart caddy
```
