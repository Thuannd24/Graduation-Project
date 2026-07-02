# HƯỚNG DẪN CÀI ĐẶT & CHẠY FRONTEND (TECHSTORE)

Ứng dụng Frontend của TechStore được xây dựng bằng ReactJS, Vite và Vanilla CSS, kết nối với API Gateway của Backend thông qua cấu hình môi trường linh hoạt.

---

## I. YÊU CẦU HỆ THỐNG CẦN CÀI ĐẶT CỤC BỘ

*   **Node.js** (Phiên bản v18 trở lên được khuyến nghị)
*   **npm** (Mặc định đi kèm khi cài đặt Node.js) hoặc **Yarn**

---

## II. CƠ CHẾ HOẠT ĐỘNG & BIẾN MÔI TRƯỜNG

Ứng dụng Frontend cần giao tiếp với API Gateway (Backend) và Server Keycloak để thực hiện xác thực và ủy quyền. Các tham số này được định cấu hình tại tệp tin `.env`.

### Cấu hình tệp tin `.env`
Sao chép tệp cấu hình mẫu và sửa đổi giá trị nếu cần thiết:
```bash
cp .env.example .env
```

Nội dung mặc định của tệp tin `FE/.env`:
```env
VITE_API_URL=http://localhost:8080/api/v1
VITE_KEYCLOAK_URL=http://localhost:8083
VITE_KEYCLOAK_REALM=ecommerce-realm
VITE_KEYCLOAK_CLIENT_ID=ecommerce-frontend
```

**Giải thích các biến môi trường:**
*   `VITE_API_URL`: Điểm cuối (Entry Point) của API Gateway để gửi các API request.
*   `VITE_KEYCLOAK_URL`: Địa chỉ của máy chủ Keycloak phục vụ đăng nhập OIDC.
*   `VITE_KEYCLOAK_REALM`: Realm được tạo trên Keycloak dành cho hệ thống E-commerce (Mặc định: `ecommerce-realm`).
*   `VITE_KEYCLOAK_CLIENT_ID`: ID Client dành cho ứng dụng Frontend được cấu hình trên Keycloak (Mặc định: `ecommerce-frontend`).

---

## III. HƯỚNG DẪN CHẠY LOCAL DEVELOPMENT

Thực hiện các lệnh sau tại thư mục `FE/` bằng Command Prompt, Terminal hoặc Powershell:

### 1. Cài đặt các thư viện phụ thuộc (Dependencies)
```bash
npm install
```

### 2. Khởi chạy ứng dụng ở chế độ Development
```bash
npm run dev
```
Sau khi chạy thành công, terminal sẽ hiển thị địa chỉ cục bộ (Mặc định: `http://localhost:5173`). Bạn hãy mở trình duyệt và truy cập vào địa chỉ trên để trải nghiệm ứng dụng.

---

## IV. ĐÓNG GÓI SẢN PHẨM (BUILD FOR PRODUCTION)

Để biên dịch và đóng gói ứng dụng tối ưu hóa dung lượng trước khi deploy lên Hosting hoặc Server Nginx:
```bash
npm run build
```
Sản phẩm đóng gói tĩnh nằm ở thư mục `dist/` sẵn sàng để đưa lên môi trường Production.
