# 🚀 BỘ PROMPT GENERATE GIAO DIỆN FRONTEND CHUYÊN NGHIỆP (E-COMMERCE)

Tài liệu này cung cấp các đoạn **Prompt chi tiết bằng Tiếng Anh (tối ưu nhất cho các AI UI Generator như v0.dev, Lovable.dev, Bolt.new, Claude, v.v.)** và Hướng dẫn cụ thể cho từng màn hình của sàn thương mại điện tử TechStore. Tất cả các prompt đều được thiết kế dựa trên hợp đồng API thực tế của hệ thống Backend Microservices (Gateway tại `http://localhost:8080`, xác thực JWT qua Keycloak).

---

## 📌 LƯU Ý CHUNG KHI SỬ DỤNG PROMPT
1.  **Framework khuyến nghị**: React (Vite) + TailwindCSS (hoặc CSS Vanilla).
2.  **Định dạng dữ liệu API**: Tất cả API từ Gateway đều bọc trong cấu trúc:
    ```json
    {
      "code": "SUCCESS",
      "message": "...",
      "data": { ... }
    }
    ```
3.  **Authentication**: Sử dụng JWT Token gửi kèm header `Authorization: Bearer <token>`.
4.  **Idempotency**: Đối với API Đặt hàng (`POST /api/v1/orders/checkout`), bắt buộc sinh UUID ngẫu nhiên gửi vào Header `Idempotency-Key` để tránh trùng đơn.

---

## 📂 PHẦN 1: THEME CHỦ ĐẠO & HỆ THỐNG GIAO DIỆN (DESIGN SYSTEM & SHELL)

### 🎯 Mục tiêu
Tạo giao diện nền tảng (App Shell) bao gồm Header, Footer, hệ màu HSL sang trọng, hỗ trợ chế độ Dark Mode/Light Mode, các thông báo Toast và hiệu ứng chuyển trang mượt mà.

### 📝 Prompt Generate (Copy-paste vào AI Generator)
```text
Create a premium App Shell component for a tech e-commerce store (TechStore). 
Design Specifications:
- Style: Modern minimalist, subtle glassmorphism (backdrop-blur), high-end tech aesthetic.
- Color Palette: Rich dark/light modes. Custom HSL colors: Primary (Deep Navy/Indigo), Secondary (Sleek Slate), Accent (Vibrant Teal/Amber), Background (Clean off-white #f8f9fb / deep dark slate #0b0f19).
- Main Layout: A sticky responsive Header, a main content container with smooth page transitions, and a clean professional Footer.
- Header Elements: 
  1. Brand Logo (TechStore) on the left.
  2. A category dropdown trigger.
  3. A robust search bar with search button.
  4. Utilities on the right: Location Selector, Order Tracking Link, Cart Icon with a dynamic yellow badge showing items count, User Profile Avatar with dropdown options (Login, Profile, Logout).
- Footer Elements: Newsletter signup form, Links to Store Locations, Warranty Lookup, Support Hotline (1800.2097), Social Icons, and Trust Badges.
- Include a floating Toast notification system (success, error, warning) with micro-animations.
Use TailwindCSS, React, Lucide Icons, and ensure high responsiveness. No placeholder text, make it feel premium.
```

---

## 📂 PHẦN 2: TRANG CHỦ & TRANG DANH MỤC SẢN PHẨM (HOME & CATALOGUE)

### 🎯 Mục tiêu
Trang chủ bắt mắt với slide banner, sản phẩm nổi bật, và trang danh mục sản phẩm có thanh lọc thông minh ở sidebar bên trái.

### 📝 Prompt Generate (Copy-paste vào AI Generator)
```text
Build a responsive Product Catalog Page and Homepage for TechStore.
1. Homepage Section:
   - Dynamic Carousel Hero Banner showcasing hot tech trends (e.g., iPhone 15 Pro, Gaming Laptops) with smooth animations.
   - Featured Categories grid (Phones, Laptops, Accessories, Audio, Smartwatches) with rich icons and hover scale effects.
   - "Hot Deals" section with card items showing discount percentages, original vs. promotional price, and an "Add to Cart" quick action.
2. Catalogue Page Section:
   - Layout: Two-column layout (Left Sidebar: Filters, Right: Product Grid).
   - Sidebar Filters: Filter by Price Range (interactive range slider), Brands (checkboxes: Apple, Samsung, Asus, Sony), Star Rating (1 to 5 stars), and In-Stock Status toggle.
   - Product Grid: 3 or 4-column responsive grid displaying premium Product Cards.
   - Product Card design: Product image with zoom-on-hover, brand badge, product title, rating stars, current price, old price (strikethrough), and a sleek "Quick Buy" button.
- Integrate with API contracts:
  - Fetch category tree from: GET /api/v1/public/categories/tree
  - Fetch products from: GET /api/v1/public/products?active=true&page=0&size=12
Utilize React, TailwindCSS, and smooth CSS transitions. Make sure the cards look exceptionally clean and premium.
```

---

## 📂 PHẦN 3: CHI TIẾT SẢN PHẨM & QUẢN LÝ BIẾN THỂ (PRODUCT DETAILS & VARIANTS)

### 🎯 Mục tiêu
Trang chi tiết sản phẩm hiển thị bộ sưu tập ảnh, cấu hình kỹ thuật, chọn màu sắc/dung lượng (variants) cập nhật giá theo thời gian thực và phần bình luận đánh giá.

### 📝 Prompt Generate (Copy-paste vào AI Generator)
```text
Create a premium Product Detail Page (ProductDetailPage) for an e-commerce platform.
Layout & Components:
1. Product Gallery: Main large image with a hover zoom lens + a thumbnail carousel below to switch images.
2. Product Info: Brand name, Product title, Rating summary (average stars + number of reviews), stock status.
3. Variant Selector (Crucial): 
   - Interactive options for selecting storage capacity (e.g., 128GB, 256GB, 512GB) and colors (visual color circles).
   - The selected variant must dynamically update the displayed price and active stock status.
4. Buy Action Box: Quantity selector (with plus/minus buttons), "Add to Cart" button (teal/indigo gradient), "Buy Now" button (vibrant accent), and a wishlist toggle heart icon.
5. Tech Specifications: A clean, expandable accordion/table showcasing technical details (Chip, RAM, Battery, Screen Size).
6. Customer Reviews: 
   - Summary block (overall rating score, progress bars showing distribution of 5, 4, 3, 2, 1 stars).
   - Customer review list with user avatar, name, verified purchase badge, stars, review date, comment, and a "Was this helpful?" thumbs-up button.
- API Mapping:
  - Fetch detail from: GET /api/v1/public/products/{productId} (returns ProductDto containing an array of variants).
  - Add to wishlist: POST /api/v1/wishlist/{productId}
  - Post review: POST /api/v1/products/reviews
Make it highly engaging, optimized for conversions, using clean typography (Inter/Outfit) and micro-interactions.
```

---

## 📂 PHẦN 4: GIỎ HÀNG & QUY TRÌNH THANH TOÁN (CART & CHECKOUT FLOW)

### 🎯 Mục tiêu
Giỏ hàng trực quan và Form đặt hàng an toàn chống gửi trùng (Idempotency), tích hợp cổng thanh toán VNPay và COD.

### 📝 Prompt Generate (Copy-paste vào AI Generator)
```text
Design a complete Cart Page and Checkout Page (Checkout Flow) for TechStore.
1. Cart Page:
   - Table/List showing items in cart: Product thumbnail, name, selected variant description, unit price, quantity modifier (plus/minus with loading states), total price, and a trash icon to remove.
   - Sticky Order Summary Sidebar: Original subtotal, discount, shipping fee, final total, and a "Proceed to Checkout" button.
2. Checkout Page:
   - Left Column (Shipping Info Form): Full Name, Phone Number, Email, Address, Order Note.
   - Coupon Section: Promo code input field with "Apply" button showing success/error messages.
   - Payment Method Selector: Sleek radio cards with icons for:
     * Cash on Delivery (COD)
     * VNPAY Online Gateway (QR Code, ATM, Credit Card)
   - Right Column (Order Review): List of items, final price breakdown.
   - Security Implementation: The "Place Order" button must generate a unique UUID and set it as the `Idempotency-Key` header on request. Show a non-disruptive spinner on click to prevent double clicks.
- API Mapping:
  - Get Cart: GET /api/v1/cart
  - Add/Update Cart: PUT /api/v1/cart/items/{productId}?variantId={vId}&quantity={qty}
  - Checkout request: POST /api/v1/orders/checkout [Headers: Idempotency-Key: UUID]
  - Initiate Payment: POST /api/v1/payments/initiate { orderId, paymentMethod: "COD" | "VNPAY" }. 
    * If VNPAY, redirect browser to response.data.paymentUrl.
    * If COD, redirect to a success confirmation screen.
Use React, TailwindCSS, validation validation using Zod (or custom validation), and premium loading animations.
```

---

## 📂 PHẦN 5: TÀI KHOẢN CÁ NHÂN & THEO DÕI ĐƠN HÀNG (PROFILE & ORDER TRACKING)

### 🎯 Mục tiêu
Quản lý thông tin cá nhân, danh sách địa chỉ nhận hàng và lịch sử đơn hàng phân chia theo các tab trạng thái rõ ràng.

### 📝 Prompt Generate (Copy-paste vào AI Generator)
```text
Create a User Profile and Order History Dashboard (ProfilePage) for TechStore.
Layout: 2-column sidebar navigation layout.
1. Sidebar: User Profile summary (avatar, name, email) and tabs:
   - "Personal Info" (Hồ sơ cá nhân)
   - "Address Book" (Sổ địa chỉ)
   - "My Orders" (Lịch sử đơn hàng)
2. Tab: Personal Info: Form to update Name, Phone, Email, and Change Password.
3. Tab: Address Book: Card list of saved shipping addresses with "Set Default", "Edit", and "Delete" actions. An "Add New Address" modal form.
4. Tab: My Orders (Crucial):
   - Filter Tabs by status: All, Pending, Awaiting Payment, Shipped, Delivered, Cancelled.
   - Order List Cards: Showing Order ID, order date, total price, dynamic status badge with custom colors, list of ordered items, and a "View Details" button.
   - Order Detail View: Detailed item pricing breakdown, shipping tracking status timeline (visual horizontal steps showing PENDING -> CONFIRMED -> SHIPPED -> DELIVERED), and a "Cancel Order" button (only visible if order status is PENDING or AWAITING_PAYMENT).
- API Mapping:
  - Get/Update User: GET/PUT /api/v1/users/me
  - Addresses: GET/POST/DELETE /api/v1/users/me/addresses
  - Get Order Details: GET /api/v1/orders/{orderId}
  - Cancel Order: POST /api/v1/orders/{orderId}/cancel
Use TailwindCSS, clean cards, hover animations, and intuitive responsive layout.
```

---

## 🛠️ PHỤ LỤC KỸ THUẬT: CẤU HÌNH API CLIENT (AXIOS UTILITY)

Để AI Generator hoặc lập trình viên tích hợp API dễ dàng, hãy cấu hình file `apiClient.ts` ở Frontend theo mẫu chuẩn sau:

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:8080', // API Gateway URL
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Tự động đính kèm Token Keycloak JWT
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Chuẩn hóa dữ liệu đầu ra và xử lý lỗi tập trung
apiClient.interceptors.response.use(
  (response) => {
    // Trả về trực tiếp object chứa { code, message, data } từ backend
    return response.data;
  },
  (error) => {
    const status = error.response ? error.response.status : null;
    
    if (status === 401) {
      console.warn('Unauthorized! Redirecting to login...');
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    } else if (status === 409) {
      // Lỗi trùng lặp đơn hàng do Idempotency-Key
      alert('Yêu cầu đang được xử lý, vui lòng không click liên tiếp!');
    }
    
    return Promise.reject(error.response?.data || error.message);
  }
);

export default apiClient;
```
