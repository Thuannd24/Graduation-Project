# 🎨 BỘ PROMPT GENERATE GIAO DIỆN (UI-ONLY) THEO VAI TRÒ (ROLES & PERMISSIONS)

Tài liệu này cung cấp các câu lệnh **Prompt thiết kế giao diện (chưa cần code API/Backend)** được tối ưu hóa cho các công cụ AI (v0.dev, Lovable.dev, Bolt.new, v.v.). Các giao diện được phân chia rõ ràng theo **3 nhóm vai trò (Roles)**: **CUSTOMER (Khách hàng)**, **STAFF (Nhân viên)**, và **ADMIN (Quản trị viên)**.

---

## 🔐 PHẦN 1: GIAO DIỆN ĐĂNG NHẬP / ĐĂNG KÝ & CHUYỂN ĐỔI VAI TRÒ (AUTH & GATEWAY)

### 🎯 Yêu cầu giao diện
*   Màn hình Đăng nhập & Đăng ký sử dụng kính mờ (Glassmorphism), sang trọng.
*   **Có khu vực chuyển đổi vai trò nhanh (Role Switcher/Selector)** dành cho việc kiểm thử giao diện (Demo).

### 📝 Prompt Generate
```text
Create a premium, modern Authentication Screen (Login and Sign Up) with a demo role selector.
Design Requirements:
- Style: Glassmorphism panels, dark cyber-tech background with colorful neon highlights (teal and indigo).
- Dual Tabs: Easily toggle between "Sign In" and "Create Account".
- Sign In Form: Email input (with mail icon), Password input (with lock icon and show/hide toggle), "Remember me" checkbox, and a prominent "Sign In" button.
- Create Account Form: Full Name, Email, Password, and Confirm Password fields, "Accept Terms" checkbox, and a "Sign Up" button.
- Demo Role Selector (Crucial for UI preview): At the top or bottom of the card, add a clean pill-button selector for testing different user roles:
  * "Customer Role"
  * "Staff Role"
  * "Admin Role"
- Responsive layout, micro-interactions on hover, and custom input focus states.
```

---

## 🛒 PHẦN 2: GIAO DIỆN KHÁCH HÀNG (CUSTOMER PORTAL)

### 1. Trang chủ & Danh mục sản phẩm (Storefront & Catalogue)
```text
Design a beautiful customer-facing Homepage and Product Catalogue for a tech retail store.
- Visual style: High-end tech shop (Apple/Samsung style), clean typography, white-space, harmonized gray and blue accents.
- Homepage: A high-impact hero banner carousel showing promo banners. A grid of product categories with custom icons. A "Hot Deals" section with dynamic sale countdown timers.
- Catalogue & Filtering: 
  * Left sidebar: Price range slider, brand check-list (Apple, Asus, MSI, etc.), rating selectors (1-5 stars), and availability toggle (In Stock only).
  * Right grid: Responsive 4-column product grid. Each product card has: discount badge, product name, specs badges (e.g. 128GB, M3 Chip), stars rating, old/new price, and a sleek "Add to Cart" button.
- Keep it pure UI, with no backend logic. Use TailwindCSS, responsive design.
```

### 2. Giỏ hàng & Form thanh toán (Cart & Checkout Flow)
```text
Create a clean e-commerce Cart and Checkout page UI.
- Cart View: Table listing items in cart with product photo, name, selected variant (e.g., Space Gray, 256GB), quantity selector (+/- buttons), subtotal, and delete icon. Order summary card on the side showing Subtotal, Discount, Shipping (Free), and Final Total.
- Checkout View:
  * Shipping details form: Name, Phone, Email, Shipping address textarea.
  * Payment methods radio selector: Cash on Delivery (COD) and VNPAY (ATM/Credit Card/QR code).
  * Coupon code input field with "Apply" button.
  * A security notice badge at the bottom "Orders are processed through secure API Gateway".
```

### 3. Trang cá nhân & Lịch sử đơn hàng (Customer Profile & Orders)
```text
Build a customer Profile Dashboard UI.
- Left navigation sidebar: Overview, Address Book, My Orders, Support.
- Address Book section: Card layout showing saved shipping addresses, a "Default Address" label, "Edit/Delete" actions, and an "Add New Address" modal form.
- My Orders section: Tabs for order status (All, Pending, Shipped, Delivered, Cancelled). Order list showing Order ID, date, status badges (e.g. Amber for Pending, Green for Delivered, Red for Cancelled), and summary of products. Clicking an order reveals a step-by-step horizontal Delivery Timeline (Pending -> Confirmed -> Shipped -> Delivered).
```

---

## 🛠️ PHẦN 3: GIAO DIỆN NHÂN VIÊN VẬN HÀNH (STAFF DASHBOARD)

### 🎯 Quyền hạn của STAFF
*   Quản lý danh mục & sản phẩm (thêm/sửa).
*   Quản lý đơn hàng (xác nhận, giao hàng).
*   Quản lý tồn kho (nhập kho, điều chỉnh).
*   Tạo chiến dịch khuyến mãi mới.

### 📝 Prompt Generate
```text
Create a Staff Portal Dashboard UI for an e-commerce operation staff member.
- Theme: Professional admin panel style. Light/Dark dashboard theme, sidebar navigation on the left, main workspace on the right.
- Left Sidebar Menu: 
  * "Dashboard Overview"
  * "Order Fulfillment"
  * "Product & Category Catalog"
  * "Inventory Manager"
  * "Campaigns & Coupons"
- Page 1: Dashboard Overview: Quick stat cards showing (Pending Orders, Low Stock Alerts, Active Campaigns, Daily Deliveries) with colorful border highlights.
- Page 2: Order Fulfillment: A data table of all system orders. Column headers: Order ID, Customer Name, Total Amount, Date, Status (Awaiting Confirmation, Preparing, Shipped, Delivered). Actions: "Approve Order" button, "Ship Order" button, and "Cancel" button.
- Page 3: Product Manager: Table of products with pricing, stock level, active status toggle. A floating "Add Product" button that opens a modal form with inputs for: Product Name, Category, Base Price, Specs (RAM, Storage), and Image URL uploader.
- Page 4: Inventory Manager: Form to process stock-in (select product, input quantity, input supplier) and adjust physical discrepancy list.
```

---

## 👑 PHẦN 4: GIAO DIỆN QUẢN TRỊ VIÊN TỐI CAO (ADMIN PORTAL)

### 🎯 Quyền hạn của ADMIN (Bao gồm của STAFF và thêm quyền đặc trị)
*   Xem báo cáo doanh thu, biểu đồ doanh số.
*   Quản lý tài khoản nhân viên (STAFF).
*   Khóa/mở khóa tài khoản khách hàng (Blacklist).
*   Phê duyệt hoàn tiền đơn hàng bị hủy (Refunds).

### 📝 Prompt Generate
```text
Create an Enterprise Admin Dashboard UI for TechStore's administrator.
- Theme: Clean, minimal, dashboard layout with data charts and analytics grids.
- Navigation Sidebar:
  * "Analytics & Revenue"
  * "Staff Management"
  * "User Access & Blacklist"
  * "Financials & Refunds"
  * "System Settings"
- Page 1: Analytics & Revenue: Beautiful charts (mocked area/bar charts) for monthly revenue, payment method distribution (COD vs. VNPAY), and top-selling product categories.
- Page 2: Staff Management: List of staff accounts with avatar, name, department, role switcher (Staff / Admin), and a button to "Create Staff Account".
- Page 3: User Access & Blacklist: Searchable list of registered customers. Columns: Name, Email, Status (Active, Suspended). Actions: A toggle switch/button to "Lock/Unlock Account" or "Move to Blacklist" with status warning colors.
- Page 4: Financials & Refunds: Table showing cancelled prepaid orders requesting refunds. Columns: Order ID, Amount, Payment Gateway Ref, Cancel Reason. Actions: "Approve Refund" button (with loading spinner state) and "Reject Refund" button.
```
