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
