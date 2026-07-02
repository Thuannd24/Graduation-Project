# 🔑 Hướng Dẫn Setup Keycloak Đầy Đủ Qua Admin UI
## Hệ thống E-Commerce — Realm: `ecommerce-realm`

> **Truy cập Admin Console:** `http://localhost:8080` → Đăng nhập bằng `admin / adminpassword`

---

## 📋 Tổng Quan Các Bước Cần Thực Hiện

| # | Bước | Mục đích |
|---|---|---|
| 1 | Tạo Realm `ecommerce-realm` | Môi trường độc lập cho ứng dụng |
| 2 | Tạo 3 Realm Roles | Phân quyền ADMIN / STAFF / CUSTOMER |
| 3 | Tạo Client `ecommerce-backend` | Để API Gateway xác thực JWT |
| 4 | Tạo Client `ecommerce-frontend` | Để Frontend login (Public client) |
| 5 | Cấu hình Protocol Mappers (JWT Claims) | Inject roles vào JWT token |
| 6 | Cấu hình Google Social Login | Đăng nhập bằng Google |
| 7 | Cấu hình Default Role cho user mới | Tự động gán CUSTOMER khi đăng ký |
| 8 | Cấu hình Token & Session Timeout | Tuổi thọ JWT |
| 9 | Cấu hình Password Policy | Yêu cầu bảo mật mật khẩu |
| 10 | Tạo Users mẫu và gán Role | Test hệ thống |

---

## BƯỚC 1: Tạo Realm `ecommerce-realm`

1. Đăng nhập Admin Console → Nhấp **dropdown `master`** ở góc trên trái
2. Chọn **"Create realm"**
3. Điền thông tin:
   - **Realm name:** `ecommerce-realm`
   - **Enabled:** ✅ ON
4. Nhấn **"Create"**

> [!IMPORTANT]
> Sau khi tạo, mọi cấu hình tiếp theo đều thực hiện trong realm `ecommerce-realm` (không phải `master`)

---

## BƯỚC 2: Tạo 3 Realm Roles

Vào **Manage → Realm roles** → Nhấn **"Create role"**

### 2.1. Tạo Role `ROLE_ADMIN`
| Field | Giá trị |
|---|---|
| **Role name** | `ROLE_ADMIN` |
| **Description** | Quản trị viên tối cao — Toàn quyền hệ thống |

→ Nhấn **Save**

### 2.2. Tạo Role `ROLE_STAFF`
| Field | Giá trị |
|---|---|
| **Role name** | `ROLE_STAFF` |
| **Description** | Nhân viên vận hành — Quản lý sản phẩm, đơn hàng, khuyến mãi |

→ Nhấn **Save**

### 2.3. Tạo Role `ROLE_CUSTOMER`
| Field | Giá trị |
|---|---|
| **Role name** | `ROLE_CUSTOMER` |
| **Description** | Khách hàng — Mua sắm, quản lý đơn hàng cá nhân |

→ Nhấn **Save**

> [!NOTE]
> Kết quả: Vào **Realm roles** sẽ thấy 3 role vừa tạo trong danh sách.

---

## BƯỚC 3: Tạo Client `ecommerce-backend` (API Gateway)

Client này dùng để **API Gateway xác thực chữ ký JWT** từ Keycloak.

1. Vào **Manage → Clients** → Nhấn **"Create client"**

### Tab 1 — General Settings:
| Field | Giá trị |
|---|---|
| **Client type** | `OpenID Connect` |
| **Client ID** | `ecommerce-backend` |
| **Name** | E-Commerce Backend (API Gateway) |
| **Description** | Resource Server cho API Gateway |

→ Nhấn **Next**

### Tab 2 — Capability Config:
| Field | Giá trị |
|---|---|
| **Client authentication** | ✅ ON (Confidential client) |
| **Authorization** | ❌ OFF |
| **Standard flow** | ✅ ON |
| **Direct access grants** | ✅ ON |
| **Service accounts roles** | ✅ ON |

→ Nhấn **Next**

### Tab 3 — Login Settings:
| Field | Giá trị |
|---|---|
| **Root URL** | `http://localhost:8080` |
| **Home URL** | `http://localhost:8080` |
| **Valid redirect URIs** | `http://localhost:8080/*` |
| **Web origins** | `*` |

→ Nhấn **Save**

### Lấy Client Secret:
Sau khi Save → Vào tab **"Credentials"** → Copy giá trị **Client secret**

> [!IMPORTANT]
> Copy `Client secret` này và điền vào `application.yml` của `api-gateway`:
> ```yaml
> spring.security.oauth2.resourceserver.jwt.issuer-uri: http://keycloak:8080/realms/ecommerce-realm
> ```

---

## BƯỚC 4: Tạo Client `ecommerce-frontend` (SPA / Mobile)

Client này dùng để **Frontend/App đăng nhập và nhận JWT**.

1. Vào **Manage → Clients** → Nhấn **"Create client"**

### Tab 1 — General Settings:
| Field | Giá trị |
|---|---|
| **Client type** | `OpenID Connect` |
| **Client ID** | `ecommerce-frontend` |
| **Name** | E-Commerce Frontend App |

→ Nhấn **Next**

### Tab 2 — Capability Config:
| Field | Giá trị |
|---|---|
| **Client authentication** | ❌ OFF (**Public client** — SPA không giữ secret) |
| **Standard flow** | ✅ ON |
| **Direct access grants** | ✅ ON |
| **Implicit flow** | ❌ OFF |

→ Nhấn **Next**

### Tab 3 — Login Settings:
| Field | Giá trị |
|---|---|
| **Valid redirect URIs** | `http://localhost:3000/*` và `http://localhost:5173/*` |
| **Valid post logout redirect URIs** | `http://localhost:3000/*` |
| **Web origins** | `http://localhost:3000` và `http://localhost:5173` |

→ Nhấn **Save**

---

## BƯỚC 5: Cấu Hình Protocol Mappers — Inject Roles vào JWT

> [!IMPORTANT]
> Đây là bước **quan trọng nhất**. API Gateway cần đọc `roles` từ JWT token. Mặc định Keycloak không đặt roles ở vị trí chuẩn.

### 5.1. Tạo Mapper trong Client `ecommerce-backend`

Vào **Clients → ecommerce-backend → Client scopes** → Click vào **`ecommerce-backend-dedicated`**

→ Vào tab **"Mappers"** → Nhấn **"Add mapper" → "By configuration"** → Chọn **"User Realm Role"**

| Field | Giá trị |
|---|---|
| **Name** | `realm-roles-mapper` |
| **Realm Role prefix** | *(để trống)* |
| **Multivalued** | ✅ ON |
| **Token Claim Name** | `roles` |
| **Claim JSON Type** | `String` |
| **Add to ID token** | ✅ ON |
| **Add to access token** | ✅ ON |
| **Add to userinfo** | ✅ ON |

→ Nhấn **Save**

### 5.2. Tạo Mapper Email (inject email vào JWT)

Nhấn **"Add mapper" → "By configuration"** → Chọn **"User Property"**

| Field | Giá trị |
|---|---|
| **Name** | `email-mapper` |
| **Property** | `email` |
| **Token Claim Name** | `email` |
| **Claim JSON Type** | `String` |
| **Add to access token** | ✅ ON |

→ Nhấn **Save**

### 5.3. Tạo Mapper Full Name

Nhấn **"Add mapper" → "By configuration"** → Chọn **"Full name"**

| Field | Giá trị |
|---|---|
| **Name** | `full-name-mapper` |
| **Token Claim Name** | `name` |
| **Add to access token** | ✅ ON |

→ Nhấn **Save**

> [!TIP]
> Sau khi cấu hình, JWT token sẽ có dạng:
> ```json
> {
>   "sub": "e143d2c8-8fc2-4017-8051-fb05cf781a5c",
>   "email": "admin@ecommerce.com",
>   "name": "Nguyễn Văn A",
>   "roles": ["ROLE_ADMIN"]
> }
> ```
> → API Gateway đọc `sub` → inject `X-User-Id`, đọc `roles` → inject `X-User-Roles`

---

## BƯỚC 6: Cấu Hình Google Social Login

> [!NOTE]
> Bước này yêu cầu bạn đã có **Google OAuth2 Client ID và Client Secret** từ [Google Cloud Console](https://console.cloud.google.com). Nếu chưa có, làm theo hướng dẫn tạo bên dưới.

### 6.1. Tạo Google OAuth2 Credentials (trên Google Cloud)

1. Vào `https://console.cloud.google.com`
2. Tạo project hoặc chọn project có sẵn
3. Vào **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Chọn **Application type:** `Web application`
5. Điền:
   - **Authorized JavaScript origins:** `http://localhost:8080`
   - **Authorized redirect URIs:** `http://localhost:8080/realms/ecommerce-realm/broker/google/endpoint`
6. Nhấn **Create** → Copy **Client ID** và **Client Secret**

### 6.2. Cấu hình trong Keycloak

Vào **Configure → Identity providers** → Nhấn **"Add provider" → chọn "Google"**

| Field | Giá trị |
|---|---|
| **Client ID** | *(Google Client ID vừa tạo)* |
| **Client Secret** | *(Google Client Secret vừa tạo)* |
| **Display name** | Đăng nhập với Google |
| **Enabled** | ✅ ON |
| **Trust Email** | ✅ ON *(Email từ Google đã được verify)* |
| **Sync Mode** | `FORCE` *(Luôn cập nhật profile từ Google)* |
| **Store tokens** | ✅ ON |
| **Default scopes** | `openid email profile` |

→ Nhấn **Save**

### 6.3. Cấu hình First Login Flow (Auto-link Google account)

Khi user lần đầu đăng nhập bằng Google, Keycloak cần biết phải làm gì. Mặc định nó sẽ hỏi user confirm.

Trong trang cấu hình Google Identity Provider → Cuộn xuống **Advanced settings:**

| Field | Giá trị |
|---|---|
| **First login flow** | `first broker login` *(mặc định — OK)* |
| **Post login flow** | *(để trống)* |

> [!TIP]
> Nếu muốn Google user tự động được tạo tài khoản mà không cần confirm, vào:
> **Authentication → Flows → first broker login**
> Tìm bước **"Review Profile"** → Đổi requirement từ `REQUIRED` thành `DISABLED`

---

## BƯỚC 7: Cấu Hình Default Role Cho User Mới

Mọi user đăng ký mới (kể cả qua Google) sẽ tự động có role `ROLE_CUSTOMER`.

1. Vào **Configure → Realm settings** → Tab **"User registration"**
2. Tìm **"Default roles"** → Nhấn **"Assign role"**
3. Filter by **"Filter by realm roles"** → Chọn **`ROLE_CUSTOMER`**
4. Nhấn **Assign**

> [!IMPORTANT]
> Sau bước này, mọi user đăng ký mới tự động là CUSTOMER. Để nâng lên STAFF/ADMIN, phải gán thủ công.

---

## BƯỚC 8: Cấu Hình Token & Session Timeout

Vào **Configure → Realm settings** → Tab **"Tokens"**

### Tab Tokens — Giải thích từng setting:

| Setting | Nó là gì | Ví dụ thực tế | Nên đặt |
|---|---|---|---|
| **Default Signature Algorithm** | Thuật toán dùng để ký JWT | RS256 = bảo mật cao nhất, chuẩn công nghiệp | `RS256` |
| **Access Token Lifespan** | JWT token có hiệu lực bao lâu. Hết hạn → client phải dùng Refresh Token đổi token mới | Như vé xem phim — hết giờ phải đổi vé mới. User mua hàng xong trong 15 phút là đủ | `15 phút` |
| **Access Token Lifespan For Implicit Flow** | Giống trên nhưng cho luồng SPA cũ — hầu như không dùng nữa | Bỏ qua, để giống Access Token Lifespan | `15 phút` |
| **Client Login Timeout** | User có bao nhiêu thời gian để hoàn thành màn hình đăng nhập | Nếu user mở trang login nhưng 5 phút không nhập gì → trang login hết hạn | `5 phút` |
| **User-Initiated Action Lifespan** | Link hành động do user tự kích hoạt tồn tại bao lâu | Link "Xác nhận email" gửi tới user — hết X phút link chết | `5 phút` |
| **Default Admin-Initiated Action Lifespan** | Link hành động do Admin tạo tồn tại bao lâu | Admin gửi link "Đặt lại mật khẩu" cho nhân viên mới — cần nhiều giờ để họ xử lý | `12 giờ` |
| **Email Verification** (Override) | Ghi đè riêng thời gian link xác thực email | Để trống = kế thừa User-Initiated Action Lifespan | *(để trống)* |
| **Forgot password** (Override) | Ghi đè riêng thời gian link quên mật khẩu | Nên dài hơn 5 phút vì user cần mở email, đọc link... | `30 phút` |
| **Execute actions** (Override) | Ghi đè thời gian các link action khác | Để trống là OK | *(để trống)* |

→ Nhấn **Save**

---

### Tab Sessions — Giải thích từng setting:

Vào tab **"Sessions"** trong Realm settings:

| Setting | Nó là gì | Ví dụ thực tế | Nên đặt |
|---|---|---|---|
| **SSO Session Idle** | Nếu user không làm gì trong X phút → tự động logout | Như ATM: "10 phút không thao tác, máy tự thoát" | `30 phút` |
| **SSO Session Max** | Dù user có hoạt động liên tục, tối đa X giờ phải đăng nhập lại. Bảo mật cứng. | Nhân viên làm việc cả ngày nhưng buổi tối phải login lại | `12 giờ` |
| **SSO Session Idle Remember Me** | Như SSO Session Idle nhưng áp dụng khi user tick "Nhớ đăng nhập" | *(để trống = kế thừa SSO Session Idle)* | *(để trống)* |
| **SSO Session Max Remember Me** | Như SSO Session Max nhưng khi user tick "Nhớ đăng nhập" | *(để trống = kế thừa SSO Session Max)* | *(để trống)* |
| **Client Session Idle** | Thời gian idle của từng Client cụ thể (ghi đè SSO) | Thường để trống | *(để trống)* |
| **Client Session Max** | Thời gian tối đa của từng Client (ghi đè SSO) | Thường để trống | *(để trống)* |
| **Offline Session Idle** | Refresh Token của tính năng "Nhớ đăng nhập" hết hạn sau bao lâu không dùng | User không mở app 30 ngày → phải đăng nhập lại | `30 ngày` |
| **Offline Session Max Limited** | Có bật giới hạn tối đa cho Offline Session không | Bật để kiểm soát bảo mật | ✅ ON |
| **Offline Session Max** | Dù user có dùng liên tục, tối đa bao lâu thì Offline Session hết hạn | Dù user dùng hàng ngày, sau 60 ngày phải login lại | `60 ngày` |

→ Nhấn **Save**

> [!TIP]
> - **Access Token ngắn (15 phút)** → Bảo mật cao, client cần dùng Refresh Token thường xuyên
> - **SSO Session Max dài (12 giờ)** → UX tốt, user không bị logout giữa chừng khi đang mua hàng
> - **Offline Session 30 ngày** → Phục vụ tính năng "Nhớ đăng nhập" trên Mobile App

---

## BƯỚC 9: Cấu Hình Password Policy

Vào **Configure → Authentication** → Tab **"Policies"** → Tab **"Password policy"**

Nhấn **"Add policy"** và thêm lần lượt:

| Policy | Giá trị | Giải thích |
|---|---|---|
| **Minimum length** | `8` | Tối thiểu 8 ký tự |
| **Not username** | *(bật)* | Không được dùng tên đăng nhập |
| **Not email** | *(bật)* | Không được dùng email |
| **Uppercase characters** | `1` | Ít nhất 1 chữ hoa |
| **Lowercase characters** | `1` | Ít nhất 1 chữ thường |
| **Digits** | `1` | Ít nhất 1 chữ số |
| **Special characters** | `1` | Ít nhất 1 ký tự đặc biệt |
| **Password history** | `3` | Không được dùng lại 3 mật khẩu gần nhất |

→ Nhấn **Save**

---

## BƯỚC 10: Tạo Users Mẫu Và Gán Role

### 10.1. Tạo User ADMIN

Vào **Manage → Users** → Nhấn **"Create new user"**

| Field | Giá trị |
|---|---|
| **Username** | `admin_ecommerce` |
| **Email** | `admin@ecommerce.vn` |
| **Email verified** | ✅ ON |
| **First name** | Admin |
| **Last name** | System |

→ Nhấn **Create**

**Đặt mật khẩu:** Vào tab **"Credentials"** → **"Set password"**
- Password: `Admin@123456`
- Temporary: ❌ OFF

**Gán Role:** Vào tab **"Role mapping"** → **"Assign role"**
- Filter: "Filter by realm roles"
- Chọn: `ROLE_ADMIN` → **Assign**

### 10.2. Tạo User STAFF

Tương tự, tạo user:
| Field | Giá trị |
|---|---|
| **Username** | `staff_01` |
| **Email** | `staff01@ecommerce.vn` |
| **Email verified** | ✅ ON |

→ Gán role: **`ROLE_STAFF`**

### 10.3. Tạo User CUSTOMER (Test)

| Field | Giá trị |
|---|---|
| **Username** | `customer_test` |
| **Email** | `customer@test.vn` |
| **Email verified** | ✅ ON |

→ Role `ROLE_CUSTOMER` đã tự động gán (từ Default Role ở Bước 7)

---

## BƯỚC 11: Cấu Hình Required Actions (Tuỳ Chọn)

Vào **Configure → Authentication** → Tab **"Required actions"**

| Action | Trạng thái khuyến nghị |
|---|---|
| **Verify Email** | ✅ Enabled + Default ON *(Bắt user xác thực email khi đăng ký)* |
| **Update Password** | Enabled, Default OFF |
| **Configure OTP** | Enabled, Default OFF *(Cho phép bật 2FA tùy ý)* |
| **Update Profile** | Enabled, Default OFF |
| **Terms and Conditions** | Enabled, Default OFF |

---

## BƯỚC 12: Kiểm Tra Kết Quả

### 12.1. Test lấy JWT Token (Direct Grant)

Mở Terminal hoặc Postman, chạy:

```bash
curl -X POST http://localhost:8080/realms/ecommerce-realm/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=ecommerce-frontend" \
  -d "username=admin_ecommerce" \
  -d "password=Admin@123456"
```

**Response mong đợi:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 900,
  "refresh_expires_in": 43200,
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer"
}
```

### 12.2. Giải mã JWT và kiểm tra claims

Copy `access_token` → Paste vào `https://jwt.io` → Kiểm tra payload phải có:

```json
{
  "sub": "uuid-của-user",
  "email": "admin@ecommerce.vn",
  "name": "Admin System",
  "roles": ["ROLE_ADMIN"],
  "iss": "http://localhost:8080/realms/ecommerce-realm"
}
```

### 12.3. Kiểm tra JWKS Endpoint (API Gateway dùng cái này)

```bash
curl http://localhost:8080/realms/ecommerce-realm/protocol/openid-connect/certs
```

→ Phải trả về JSON chứa public keys. Đây là endpoint API Gateway tự động fetch để verify JWT.

---

## 📌 Checklist Cuối Cùng

- [ ] ✅ Realm `ecommerce-realm` đã tạo và enabled
- [ ] ✅ 3 Roles: `ROLE_ADMIN`, `ROLE_STAFF`, `ROLE_CUSTOMER` đã tạo
- [ ] ✅ Client `ecommerce-backend` (Confidential) đã tạo và có Client Secret
- [ ] ✅ Client `ecommerce-frontend` (Public) đã tạo
- [ ] ✅ Protocol Mappers đã cấu hình (roles, email, name trong JWT)
- [ ] ✅ Google Identity Provider đã cấu hình
- [ ] ✅ Default Role `ROLE_CUSTOMER` đã gán cho user mới
- [ ] ✅ Token Lifespan: Access 15 phút, Session 12 giờ
- [ ] ✅ Password Policy đã cấu hình
- [ ] ✅ Users test (admin, staff, customer) đã tạo và gán role
- [ ] ✅ JWT test thành công, claims `roles` và `email` có trong token

---

## 🔗 Các URL Quan Trọng Sau Khi Setup

| Mục đích | URL |
|---|---|
| Admin Console | `http://localhost:8080/admin` |
| Login Page | `http://localhost:8080/realms/ecommerce-realm/account` |
| OIDC Discovery Endpoint | `http://localhost:8080/realms/ecommerce-realm/.well-known/openid-configuration` |
| JWKS (Public Keys) | `http://localhost:8080/realms/ecommerce-realm/protocol/openid-connect/certs` |
| Token Endpoint | `http://localhost:8080/realms/ecommerce-realm/protocol/openid-connect/token` |
| Logout Endpoint | `http://localhost:8080/realms/ecommerce-realm/protocol/openid-connect/logout` |

> [!TIP]
> Dán URL OIDC Discovery vào trình duyệt sẽ thấy toàn bộ endpoints Keycloak — rất hữu ích khi debug.
