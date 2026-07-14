# TEST CASE: IDENTITY & USER SERVICE (user-service)

> Nguồn tham chiếu code thật: `BE/user-service/src/main/java/com/ecommerce/userservice/**`
> Tài liệu thiết kế đối chiếu: `docs/services/01_IDENTITY_USER_SERVICE.md`
> Ngày viết: 2026-07-14 — Rút gọn: 2026-07-14 (tập trung vào luồng nghiệp vụ quan trọng, gộp các test case chỉ khác nhau ở 1 field/validation đơn lẻ)

## 1. Phạm vi (Scope)

### 1.1. Có cover
- Toàn bộ REST endpoint thật có trong code (không phải endpoint mô tả trong doc nhưng không tồn tại):
  - `UserController` (`/api/v1/users/**`): `me` (GET/PUT), `me/avatar`, `me/addresses` (GET/POST/DELETE), `me/loyalty/points`, `me/loyalty/history`, `me/loyalty/redeem-preview`, `public/{keycloakUserId}`.
  - `AdminUserController` (`/api/v1/admin/users/**`): list/search, create, detail, update, delete, blacklist, tier, reset-password, roles (get all/get user/set user), stats.
  - `InternalUserController` (`/api/internal/users/**`): segmentation, profile-ai, keycloak/{id}, tier, points (PUT adjust, GET balance, POST redeem, POST refund).
  - `LocationController` (`/api/v1/public/locations/**`): provinces, wards.
- Business logic thật trong `service/impl/*`: auto-provisioning user khi login lần đầu, đồng bộ field từ JWT header mỗi lần gọi `/me`, validate DTO (`jakarta.validation`), `LoyaltyPointPolicy` (tính điểm, quy đổi điểm, giới hạn redeem), idempotency của redeem/refund điểm theo `orderId`, address default (unset default), soft-delete user, xử lý ngoại lệ tập trung (`GlobalExceptionHandler`).
- Phân quyền: 2 tầng theo `SecurityConfig` — `@PreAuthorize` role-based (ROLE_ADMIN/ROLE_STAFF/ROLE_USER) + `InternalApiKeyFilter` (header `X-Internal-Api-Key`) cho `/api/internal/**`.
- Edge case thật sự có giá trị: race condition khi 2 request đồng thời tạo hồ sơ cho cùng `keycloakUserId` hoặc redeem điểm 2 lần cho cùng `orderId`; giới hạn số học (điểm = 0, âm, vượt số dư).

### 1.2. KHÔNG cover (do phụ thuộc hệ thống ngoài / ngoài phạm vi service)
- Luồng đăng nhập/đăng ký/MFA/đổi mật khẩu thật qua Keycloak OIDC (`/realms/{realm}/protocol/openid-connect/token`, `/logout`) — đây là API của **Keycloak Server**, không nằm trong code `user-service`.
- Việc verify chữ ký JWT bằng JWKS tại API Gateway (thuộc về Gateway, không thuộc `user-service`).
- Hành vi thật của `KeycloakAdminClient` khi gọi Keycloak Admin REST API (tạo/xóa/update user, set password, set roles trên Keycloak) — trong test unit sẽ **mock** client này; test tích hợp thật với Keycloak (nếu có) thuộc nhóm test riêng (contract/E2E), không nằm trong file này.
- Hành vi thật của MinIO (upload ảnh vật lý) — mock `StorageService`/`MinioClient`.
- Hành vi thật của Kafka broker khi publish `UserRegisteredEvent` — mock `KafkaTemplate`, chỉ verify được gọi `send()`, không verify consumer phía downstream.
- Các entity/luồng được mô tả trong tài liệu thiết kế nhưng **không tồn tại trong code hiện tại**: `chat_sessions`, `chat_messages` (MongoDB), `user_devices` (chống gian lận thiết bị), API `/api/chat/**`. Các mục này được loại khỏi phạm vi vì không có source code tương ứng để kiểm thử — không có "wishlist" module trong service này.
- Chi tiết cấu hình Docker Compose / JWKS key rotation (thuộc kiến trúc hạ tầng, không phải logic ứng dụng).
- Các test case thuần validate 1 field riêng lẻ (thiếu field, sai format, quá dài, rỗng) được GỘP thành 1 dòng đại diện theo module — không liệt kê từng trường hợp field một, do rủi ro nghiệp vụ thấp và được `@Valid`/`GlobalExceptionHandler` xử lý đồng nhất.

### 1.3. Quy ước ký hiệu
- `UT-USER-xxx`: Unit Test — kiểm thử trực tiếp method của lớp Service (`*ServiceImpl`) hoặc lớp thuần logic (`LoyaltyPointPolicy`), có mock Repository/Client, không khởi động HTTP context.
- `IT-USER-xxx`: Integration Test — gọi qua tầng HTTP (MockMvc/WebTestClient hoặc thật), có Security Filter Chain, DB thật (Testcontainers) hoặc H2, có thể mock các Client ngoài (Keycloak/MinIO/Kafka) ở biên hệ thống.
- Priority: `High` (chặn release), `Medium` (nên có), `Low` (nice-to-have/edge case hiếm).

---

## 2. Module: Đăng ký / Tự động cung cấp hồ sơ (`GET /api/v1/users/me`)

Đây là luồng "đăng ký" thực tế trong hệ thống này: user đăng nhập lần đầu qua Keycloak → Gateway forward JWT → Service tự tạo (`auto-provision`) bản ghi `users` nếu chưa có, đồng thời đồng bộ lại field mỗi lần gọi. Đây là luồng nghiệp vụ quan trọng nhất của module, giữ chi tiết đầy đủ.

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-001 | UserServiceImpl.getCurrentUser | Unit | Auto-provision user mới khi `keycloakUserId` chưa tồn tại trong DB | `userRepository.findByKeycloakUserId` trả về `Optional.empty()` | Gọi `getCurrentUser("kc-uuid-1", "a@x.com", "userA", "Nguyễn Văn A", null)` | Gọi `userRepository.save()` 1 lần tạo user mới với `customerTier=MEMBER`, `isBlacklisted=false`, `active=true`; publish `UserRegisteredEvent`; trả về `UserProfileResponse` đúng dữ liệu | High |
| UT-USER-002 | UserServiceImpl.getCurrentUser | Unit | Không có email/username từ header (null) → dùng giá trị placeholder | Header email/username = null | `createUserFromKeycloak("kc-uuid-2", null, null, null, null)` | `email = "kc-uuid-2@placeholder.com"`, `username = "user_kc-uuid" (8 ký tự đầu)`, `fullName = "Keycloak User"` | High |
| UT-USER-003 | UserServiceImpl.getCurrentUser | Unit | User đã tồn tại, JWT header có email/fullName (Unicode có dấu) khác DB → tự đồng bộ (auto-sync) | User tồn tại với `email="old@x.com"`, `fullName="Keycloak User"` | Gọi `getCurrentUser` với `email="new@x.com"` và `X-User-Name="Nguyễn Văn Ánh"` | `email` và `fullName` được cập nhật đúng giá trị mới (giữ nguyên Unicode), `save()` được gọi 1 lần, `changed=true` | High |
| UT-USER-004 | UserServiceImpl.getCurrentUser | Unit | Không có gì thay đổi (email/username/fullName/avatar giống DB) | User tồn tại, header giống hệt DB | Gọi `getCurrentUser` | `save()` KHÔNG được gọi (không tạo update thừa) | Medium |
| UT-USER-005 | UserServiceImpl.getCurrentUser | Unit | Tự đồng bộ `phoneNumber` từ `username` khi DB đang trống & username hợp lệ định dạng SĐT; KHÔNG đồng bộ khi username không phải định dạng SĐT (VD email-based username) | `user.phoneNumber=null` | Gọi `getCurrentUser` với `username="0912345678"` và với `username="userA"` | Case 1: `phoneNumber` được set = "0912345678". Case 2: `phoneNumber` vẫn giữ `null` | Medium |
| UT-USER-006 | UserServiceImpl.getCurrentUser | Unit | Race condition: 2 thread gọi đồng thời cho cùng `keycloakUserId` chưa tồn tại | Repository chưa có record; dùng `synchronized(keycloakUserId.intern())` | Bắn 2 thread gọi `getCurrentUser` song song với cùng `keycloakUserId` | Chỉ 1 user được tạo (không có duplicate/`DataIntegrityViolationException` do unique constraint `keycloak_user_id`); thread thứ 2 nhận lại bản ghi đã tạo | High |
| IT-USER-007 | GET /api/v1/users/me | Integration | Happy path — user chưa từng đăng nhập, header đầy đủ | Không có header `Authorization` (Gateway đã xác thực, service chỉ đọc header) | GET `/api/v1/users/me` với `X-User-Id`, `X-User-Email`, `X-User-Username`, `X-User-Name` | HTTP 200, `code=SUCCESS`, `data.keycloakUserId` đúng, `data.customerTier="MEMBER"`, `data.loyaltyPoints=0` | High |
| IT-USER-008 | GET /api/v1/users/me | Integration | Thiếu header bắt buộc `X-User-Id` | Gateway lỗi cấu hình / gọi trực tiếp không qua Gateway | GET `/api/v1/users/me` không có header `X-User-Id` | HTTP 400 (Spring `MissingRequestHeaderException`) vì `@RequestHeader("X-User-Id")` không có `required=false` | High |
| IT-USER-009 | GET /api/v1/users/me | Integration | `X-User-Name` chứa ký tự URL-encoded tiếng Việt hợp lệ hoặc malformed percent-encoding | Header gửi dạng đã encode UTF-8 hoặc lỗi encode | GET với `X-User-Name=Nguy%E1%BB%85n%20V%C4%83n%20A` (hợp lệ) và `X-User-Name=%ZZinvalid` (lỗi) | HTTP 200 cho cả 2 trường hợp: decode đúng thành "Nguyễn Văn A" ở case hợp lệ; ở case lỗi, service catch exception, giữ nguyên `fullName` gốc, không throw 500 | Medium |
| IT-USER-010 | GET /api/v1/users/me | Integration | Gọi lại lần 2 cho cùng user đã tồn tại | Đã có user trong DB (từ IT-USER-007) | GET `/api/v1/users/me` lần 2 | HTTP 200, không tạo thêm record mới, `data.id` giống lần gọi trước | High |

---

## 3. Module: Cập nhật Profile (`PUT /api/v1/users/me`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-011 | UserServiceImpl.updateProfile | Unit | Cập nhật thành công fullName + phoneNumber | User tồn tại | `updateProfile(kcId, {fullName:"B", phoneNumber:"0987654321"})` | `save()` được gọi, response trả đúng field mới | High |
| UT-USER-012 | UserServiceImpl.updateProfile | Unit | Field null trong request → giữ nguyên giá trị cũ (partial update) | User có `fullName="A"` | `updateProfile(kcId, {fullName:null, phoneNumber:"0987654321"})` | `fullName` vẫn = "A", chỉ `phoneNumber` đổi | Medium |
| UT-USER-013 | UserServiceImpl.updateProfile | Unit | User không tồn tại (đã bị xóa data race) | `findByKeycloakUserId` trả `empty` | `updateProfile("kc-not-exist", req)` | Throw `ResourceNotFoundException` | High |
| IT-USER-014 | PUT /api/v1/users/me | Integration | Happy path cập nhật fullName tiếng Việt có dấu, phoneNumber hợp lệ | User đã tồn tại | Body `{"fullName":"Trần Thị Bích Ngọc","phoneNumber":"0912345678"}` | HTTP 200, `code=SUCCESS`, data trả về đúng fullName Unicode | High |
| IT-USER-015 | PUT /api/v1/users/me | Integration | Validate input cơ bản (thiếu header bắt buộc / field sai format hoặc quá dài / rỗng) — áp dụng cho toàn bộ request có `@Valid`: `fullName` > 100 ký tự, `phoneNumber` sai định dạng, `avatarUrl` không phải http/https, thiếu header `X-User-Id` | — | Gửi từng trường hợp lỗi tương ứng | HTTP 400 với `code=VALIDATION_FAILED`/lỗi field tương ứng cho mọi case; riêng `phoneNumber` rỗng hoặc đúng 10-11 số vẫn HTTP 200 (regex `^(0[0-9]{9,10}|)$`) | High |

---

## 4. Module: Upload Avatar (`POST /api/v1/users/me/avatar`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-016 | UserServiceImpl.updateAvatar | Unit | Upload thành công, `storageService.uploadFile` trả URL | User tồn tại, file hợp lệ | `updateAvatar(kcId, mockFile)` | `user.avatarUrl` cập nhật đúng URL trả về, `save()` được gọi | High |
| UT-USER-017 | UserServiceImpl.updateAvatar | Unit | File null hoặc rỗng (`file.isEmpty()==true`) | — | `updateAvatar(kcId, null)` / `updateAvatar(kcId, emptyFile)` | Throw `IllegalArgumentException("File upload không được trống.")` trong cả 2 trường hợp | High |
| UT-USER-018 | UserServiceImpl.updateAvatar | Unit | User không tồn tại | `findByKeycloakUserId` empty | `updateAvatar("kc-not-exist", file)` | Throw `ResourceNotFoundException` | Medium |
| UT-USER-019 | MinioStorageServiceImpl.uploadFile | Unit | Content-Type không thuộc danh sách cho phép (VD `application/pdf`) → reject; Content-Type hợp lệ biên (`image/webp`, `image/gif`) → chấp nhận | — | `uploadFile(pdfFile, "avatars")` / `uploadFile(webpFile, "avatars")` | Case pdf: throw `IllegalArgumentException` "Định dạng tệp không hợp lệ...". Case webp/gif: không throw, trả về URL đúng format `endpoint/bucket/folder/uuid.ext` | High |
| UT-USER-020 | MinioStorageServiceImpl.uploadFile | Unit | Bucket chưa tồn tại → tự tạo bucket + set policy public-read; MinIO client throw exception khi `putObject` → wrap thành RuntimeException | `bucketExists()=false` (case 1); `minioClient.putObject` throw `IOException` (case 2) | `uploadFile(validFile, "avatars")` | Case 1: `makeBucket()` và `setBucketPolicy()` được gọi đúng 1 lần. Case 2: throw `RuntimeException("Không thể tải ảnh lên hệ thống lưu trữ.")` | Medium |
| IT-USER-021 | POST /api/v1/users/me/avatar | Integration | Happy path upload ảnh JPEG hợp lệ (multipart) | User tồn tại, MinIO mock/stub | Multipart `file=avatar.jpg (image/jpeg)` | HTTP 200, `data.avatarUrl` khác null, message "Avatar updated successfully" | High |
| IT-USER-022 | POST /api/v1/users/me/avatar | Integration | Upload file định dạng `.exe` giả mạo content-type image | File thực chất binary nhưng đặt Content-Type `image/png` | Upload file này | HTTP 400 với message lỗi định dạng (lưu ý: service chỉ check `contentType` header, KHÔNG check magic bytes — ghi nhận như risk note bảo mật, không phải fail chức năng) | Medium |

---

## 5. Module: Quản lý địa chỉ giao hàng (`/api/v1/users/me/addresses`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-023 | AddressServiceImpl.getAddresses | Unit | Lấy danh sách địa chỉ của user (có data / rỗng) | Repo trả về list 3 item hoặc list rỗng | `getAddresses(userId)` | Case có data: trả về đúng 3 `AddressResponse`. Case rỗng: trả về `[]`, không throw exception | Medium |
| UT-USER-024 | AddressServiceImpl.addAddress | Unit | Thêm địa chỉ mới với `isDefault=true` (khi đã có địa chỉ default khác) sẽ unset default cũ; `isDefault=false`/null thì không unset | Có sẵn 1 địa chỉ `isDefault=true` | `addAddress(userId, {..., isDefault:true})` và `addAddress(userId, {..., isDefault:null})` | Case true: `unsetDefaultByUserId(userId)` được gọi trước, địa chỉ mới `isDefault=true`, địa chỉ cũ về `false`. Case false/null: `unsetDefaultByUserId` KHÔNG được gọi | High |
| UT-USER-025 | AddressServiceImpl.deleteAddress | Unit | Xóa địa chỉ: thành công khi thuộc đúng user; ResourceNotFoundException khi không tồn tại hoặc thuộc user khác (kiểm tra IDOR) | `findByUserIdAndId` trả về Address (case thành công) hoặc `empty` (case không tồn tại/thuộc user khác) | `deleteAddress(userId, addressId)`; `deleteAddress(userIdA, addressIdOfUserB)` | Case thành công: `repository.delete()` được gọi. Case không tồn tại/IDOR: throw `ResourceNotFoundException` (không cho xóa chéo user — chống broken object level authorization) | High |
| IT-USER-026 | GET /api/v1/users/me/addresses | Integration | Happy path lấy danh sách địa chỉ | User có 2 địa chỉ | GET `/me/addresses` | HTTP 200, `data` là array 2 item đúng cấu trúc | High |
| IT-USER-027 | POST /api/v1/users/me/addresses | Integration | Thêm địa chỉ hợp lệ với địa danh tiếng Việt có dấu | — | Body `{"recipientName":"Nguyễn Thị Hoa","phoneNumber":"0987654321","province":"Hà Nội","districtWard":"Phường Cầu Giấy","detailAddress":"Số 10, ngõ 5, đường Xuân Thuỷ","isDefault":true}` | HTTP 200, địa chỉ được tạo với Unicode giữ nguyên, `isDefault=true` | High |
| IT-USER-028 | POST /api/v1/users/me/addresses | Integration | Validate input cơ bản (thiếu field bắt buộc / body rỗng / chỉ chứa khoảng trắng) — áp dụng cho toàn bộ request có `@Valid`: `recipientName`, `phoneNumber`, `province`, `districtWard`, `detailAddress` | — | Gửi body thiếu từng field / body `{}` / `detailAddress="   "` | HTTP 400, `code=VALIDATION_FAILED` với error field tương ứng (`@NotBlank` reject cả whitespace-only) | High |
| IT-USER-029 | DELETE /api/v1/users/me/addresses/{id} | Integration | Xóa địa chỉ thành công | Địa chỉ thuộc user hiện tại | DELETE `/me/addresses/{id}` | HTTP 200, message "Address deleted successfully" | High |
| IT-USER-030 | DELETE /api/v1/users/me/addresses/{id} | Integration | Xóa địa chỉ không tồn tại; User A cố xóa địa chỉ của User B (IDOR) | `id` không tồn tại, hoặc `id` là address của User B với header `X-User-Id` của A | DELETE `/me/addresses/999999`; DELETE `/me/addresses/{addressIdOfUserB}` với header của A | HTTP 404 trong cả 2 trường hợp (không lộ thông tin tồn tại của resource người khác) | High |

---

## 6. Module: Điểm thưởng phía User (`/api/v1/users/me/loyalty/**`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-031 | GET /api/v1/users/me/loyalty/points | Integration | Lấy đúng số dư điểm hiện tại (có điểm / user mới chưa có điểm) | User có `loyaltyPoints=1500`, hoặc user vừa auto-provision | GET `/me/loyalty/points` | HTTP 200, `data=1500` (case 1) hoặc `data=0` (case 2) | High |
| IT-USER-032 | GET /api/v1/users/me/loyalty/history | Integration | Lấy lịch sử điểm có phân trang | User có 25 transaction | GET `/me/loyalty/history` (mặc định page=0 size=20) và `?page=1&size=20` | Trang 1: HTTP 200, `data.content.size()=20`, `data.totalElements=25`. Trang 2: trả về 5 record còn lại | High |
| IT-USER-033 | POST /api/v1/users/me/loyalty/redeem-preview | Integration | Preview redeem hợp lệ với `orderAmount` > 0 | User có `loyaltyPoints=200`, tier MEMBER | Body `{"orderAmount": 150000}` | HTTP 200, `data.maxRedeemablePoints = min(200, 150)` = 150, `data.maxDiscountAmount = 150000` | High |
| IT-USER-034 | POST /api/v1/users/me/loyalty/redeem-preview | Integration | Validate input cơ bản (`orderAmount` <= 0 hoặc thiếu field); biên logic: balance=0 → maxRedeemablePoints=0; user không tồn tại → 404 | — | Body `{"orderAmount": 0}` / `{}`; `redeemPreview` với balance=0; `redeemPreview(999L, ...)` | HTTP 400 cho lỗi validate input; `maxRedeemablePoints=0, maxDiscountAmount=0` khi balance=0; `ResourceNotFoundException` khi user không tồn tại | Medium |

---

## 7. Module: Business logic điểm thưởng — `LoyaltyPointPolicy` (Unit thuần logic)

Đây là logic tính điểm cốt lõi của toàn hệ thống loyalty, giữ chi tiết đầy đủ cho từng công thức.

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-035 | LoyaltyPointPolicy.tierMultiplier | Unit | Hệ số nhân đúng cho từng hạng, case-insensitive, fallback default cho tier không xác định | — | `tierMultiplier("SILVER"/"GOLD"/"VIP"/"DIAMOND"/"MEMBER"/null/"gold"/"XYZ")` | Trả về 1.2/1.5/2.0/2.5/1.0/1.0 tương ứng; `"gold"` (viết thường) vẫn trả 1.5 (do `.toUpperCase()`); tier lạ ("XYZ") trả về 1.0 (default) | High |
| UT-USER-036 | LoyaltyPointPolicy.calculateEarnFromOrderSpend | Unit | Tính điểm cơ bản đúng công thức `floor(amount/10000 * multiplier)` | — | `calculateEarnFromOrderSpend(150000, "GOLD")` | `150000/10000=15` × 1.5 = 22.5 → floor = 22 điểm | High |
| UT-USER-037 | LoyaltyPointPolicy.calculateEarnFromOrderSpend | Unit | `orderAmount` = 0, âm, hoặc null | — | `calculateEarnFromOrderSpend(0/-5000/null, "GOLD")` | Trả về 0 trong mọi trường hợp (không throw) | High |
| UT-USER-038 | LoyaltyPointPolicy.calculateEarnFromOrderSpend | Unit | Biên: `orderAmount` nhỏ hơn 10.000 (VD 9999) vs đúng 10.000 | — | `calculateEarnFromOrderSpend(9999, "MEMBER")` và `(10000, "MEMBER")` | Case 9999: basePoints = 0 (chia lấy phần nguyên, DOWN). Case 10000: basePoints = 1 × 1.0 = 1 điểm | Medium |
| UT-USER-039 | LoyaltyPointPolicy.calculateMaxRedeemablePoints | Unit | Giới hạn bởi số dư (khi balance nhỏ hơn giá trị đơn) hoặc bởi giá trị đơn (khi giá trị đơn nhỏ hơn số dư) | `balance=50` (case 1); `balance=10000` (case 2) | `calculateMaxRedeemablePoints(50, 1000000)`; `calculateMaxRedeemablePoints(10000, 5000)` | Case 1: trả về 50 (min(balance, maxByAmount)). Case 2: maxByAmount = 5000/1000 = 5 → trả về 5 | High |
| UT-USER-040 | LoyaltyPointPolicy.calculateMaxRedeemablePoints | Unit | `balance` = 0; `payableAmount` = null hoặc <= 0 | — | `calculateMaxRedeemablePoints(0, 100000)`; `(100, null)`, `(100, 0)`, `(100, -1)` | Trả về 0 trong mọi trường hợp | Medium |
| UT-USER-041 | LoyaltyPointPolicy.calculateDiscountFromPoints | Unit | Quy đổi điểm sang tiền; `points` <= 0 trả về ZERO | — | `calculateDiscountFromPoints(15)`; `(0)`, `(-5)` | Case 15: trả về 15 × 1000 = 15000 VND. Case <=0: trả về `BigDecimal.ZERO` | High |

---

## 8. Module: Loyalty Points — Internal API (`/api/internal/users/{userId}/points`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-042 | LoyaltyPointServiceImpl.adjustPoints | Unit | Mode FIXED cộng điểm dương / trừ điểm hợp lệ | User `loyaltyPoints=100` | `adjustPoints(userId, {calculationMode:"FIXED", pointAmount: 50})` và `pointAmount:-30` | Case +50: `newBalance=150`, tạo transaction `delta=50, balanceAfter=150`. Case -30: `newBalance=70` | High |
| UT-USER-043 | LoyaltyPointServiceImpl.adjustPoints | Unit | Mode FIXED trừ điểm vượt số dư (âm) | User `loyaltyPoints=20` | `pointAmount=-50` | Throw `IllegalArgumentException("Số dư điểm không đủ...")`, KHÔNG lưu transaction/không đổi balance | High |
| UT-USER-044 | LoyaltyPointServiceImpl.adjustPoints | Unit | Validate input cơ bản: Mode FIXED với `pointAmount=0`/null; Mode ORDER_SPEND thiếu `orderAmount` | — | `{calculationMode:"FIXED", pointAmount:0}`; `{calculationMode:"ORDER_SPEND", orderAmount:null}` | Throw `IllegalArgumentException` với message tương ứng ("FIXED yêu cầu pointAmount khác 0..." / "ORDER_SPEND yêu cầu orderAmount > 0...") | High |
| UT-USER-045 | LoyaltyPointServiceImpl.adjustPoints | Unit | Mode ORDER_SPEND hợp lệ kèm bonus | `orderAmount=150000`, tier GOLD, `pointAmount=10` (bonus) | `adjustPoints(userId, {calculationMode:"ORDER_SPEND", orderAmount:150000, pointAmount:10})` | earned = 15 (150000/10000*1.5), `delta = 15+10 = 25`, detail string đúng format | High |
| UT-USER-046 | LoyaltyPointServiceImpl.adjustPoints | Unit | User không tồn tại | `findById` empty | `adjustPoints(999L, req)` | Throw `ResourceNotFoundException` | High |
| IT-USER-047 | PUT /api/internal/users/{userId}/points | Integration | Happy path cộng điểm ORDER_SPEND kèm API key hợp lệ | Header `X-Internal-Api-Key` đúng | PUT với body ORDER_SPEND | HTTP 200, `data.newPointBalance` đúng | High |
| IT-USER-048 | PUT /api/internal/users/{userId}/points | Integration | Thiếu hoặc sai header `X-Internal-Api-Key` | — | PUT không có header / `X-Internal-Api-Key: wrong-key` | HTTP 401, `code=UNAUTHORIZED` trong cả 2 trường hợp | High |
| IT-USER-049 | PUT /api/internal/users/{userId}/points | Integration | Server chưa cấu hình `app.internal.api-key` (rỗng) — fail-closed | `app.internal.api-key=""` | Gọi endpoint (kèm hoặc không kèm header) | HTTP 403, `code=FORBIDDEN`, message "Internal API key not configured" | High |
| IT-USER-050 | PUT /api/internal/users/{userId}/points | Integration | `userId` không tồn tại | — | PUT `/api/internal/users/999999/points` | HTTP 404, `code=NOT_FOUND` | High |

---

## 9. Module: Redeem/Refund điểm cho đơn hàng — Idempotency (`/api/internal/users/{userId}/points/redeem`, `/refund`)

Đây là luồng có rủi ro race-condition/idempotency đã phát hiện qua đọc code — giữ chi tiết đầy đủ, KHÔNG cắt.

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-051 | LoyaltyPointServiceImpl.redeemForOrder | Unit | Redeem hợp lệ lần đầu cho order | balance=200, chưa có transaction REDEMPTION cho orderId=500 | `redeemForOrder(userId, {orderId:500, pointsToRedeem:100, orderAmount:200000})` | `pointsRedeemed=100`, `discountAmount=100000`, `newPointBalance=100`, tạo transaction `sourceType=REDEMPTION, delta=-100` | High |
| UT-USER-052 | LoyaltyPointServiceImpl.redeemForOrder | Unit | Idempotent: gọi lại lần 2 cho CÙNG `orderId` (retry/duplicate request) | Đã có transaction REDEMPTION cho orderId=500 | `redeemForOrder(userId, {orderId:500, pointsToRedeem:100, ...})` (gọi lần 2) | KHÔNG trừ điểm thêm, trả về đúng kết quả transaction cũ (idempotent), không tạo transaction mới | High |
| UT-USER-053 | LoyaltyPointServiceImpl.redeemForOrder | Unit | Race condition: 2 request đồng thời redeem cùng `orderId` (chưa có transaction) | Cả 2 thread cùng check `findFirstByOrderIdAndSourceType` → cả 2 đều `empty` (chưa commit) | Bắn 2 thread gọi `redeemForOrder` song song với cùng orderId | **Rủi ro phát hiện**: có thể bị trừ điểm 2 lần do race condition (không có unique constraint hoặc lock ở DB cho cặp orderId+sourceType) → cần test để xác nhận có bug hay không, đề xuất thêm unique index `(order_id, source_type)` | High |
| UT-USER-054 | LoyaltyPointServiceImpl.redeemForOrder | Unit | `pointsToRedeem` <= 0, hoặc vượt quá `maxAllowed` | balance=50, orderAmount cho phép tối đa 30 điểm | `{pointsToRedeem:0}`; `{pointsToRedeem:100}` | Throw `IllegalArgumentException` với message tương ứng ("Số điểm đổi phải lớn hơn 0." / "Chỉ có thể dùng tối đa 30 điểm...") | High |
| UT-USER-055 | LoyaltyPointServiceImpl.refundForOrder | Unit | Refund hợp lệ cho order đã redeem trước đó | Có transaction REDEMPTION `delta=-100` cho orderId=500, chưa có REFUND | `refundForOrder(userId, 500)` | Cộng lại 100 điểm, tạo transaction `sourceType=REFUND, delta=+100` | High |
| UT-USER-056 | LoyaltyPointServiceImpl.refundForOrder | Unit | Refund cho order chưa từng redeem | Không có transaction REDEMPTION cho orderId=999 | `refundForOrder(userId, 999)` | Trả về `pointsApplied=0`, message "Không có điểm đã đổi cho đơn #999", KHÔNG tạo transaction | Medium |
| UT-USER-057 | LoyaltyPointServiceImpl.refundForOrder | Unit | Idempotent: refund 2 lần cho cùng order (double-refund) | Đã có REFUND transaction cho orderId=500 | `refundForOrder(userId, 500)` (gọi lần 2) | Trả về `pointsApplied=0`, message "Điểm đã được hoàn cho đơn #500", KHÔNG cộng điểm thêm lần 2 | High |
| IT-USER-058 | POST /api/internal/users/{userId}/points/redeem | Integration | Happy path redeem qua HTTP | API key hợp lệ | POST body `{pointsToRedeem:50, orderId:123, orderAmount:100000}` | HTTP 200, `data.pointsRedeemed=50` | High |
| IT-USER-059 | POST /api/internal/users/{userId}/points/redeem | Integration | Validate input cơ bản: thiếu field `orderId`, `pointsToRedeem` âm | — | Body thiếu `orderId`; body `pointsToRedeem: -10` | HTTP 400 cho cả 2 trường hợp | Medium |
| IT-USER-060 | POST /api/internal/users/{userId}/points/refund | Integration | Happy path refund qua HTTP | API key hợp lệ, đã có redemption trước | POST body `{orderId:123}` | HTTP 200, điểm được hoàn lại đúng | High |

---

## 10. Module: Public User Profile (`GET /api/v1/users/public/{keycloakUserId}`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-061 | GET /api/v1/users/public/{keycloakUserId} | Integration | Happy path — không cần token/header xác thực | User tồn tại | GET `/api/v1/users/public/{keycloakUserId}` không kèm bất kỳ header auth | HTTP 200, chỉ trả `id, keycloakUserId, username, fullName, avatarUrl` — KHÔNG trả `email`, `phoneNumber`, `loyaltyPoints` (kiểm tra rò rỉ thông tin nhạy cảm) | High |
| IT-USER-062 | GET /api/v1/users/public/{keycloakUserId} | Integration | `keycloakUserId` không tồn tại, hoặc chứa ký tự đặc biệt/SQL injection attempt | — | GET `/api/v1/users/public/kc-not-exist`; GET `/api/v1/users/public/' OR '1'='1` | HTTP 404 trong cả 2 trường hợp (không throw 500, không có SQL injection vì dùng JPA parameterized query) | Medium |

---

## 11. Module: Location Public API (`/api/v1/public/locations/**`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-063 | GET /api/v1/public/locations/provinces[/{code}/wards] | Integration | Lấy danh sách tỉnh/thành và phường/xã theo mã tỉnh hợp lệ, không cần auth; mã tỉnh không tồn tại hoặc không phải số | DB đã seed provinces | GET `/provinces`; GET `/provinces/1/wards`; GET `/provinces/99999/wards`; GET `/provinces/abc/wards` | HTTP 200 với list đúng (sắp xếp theo tên) cho case hợp lệ; HTTP 200 với list rỗng `[]` khi mã tỉnh không tồn tại; HTTP 400 khi `code` không phải số | Medium |

---

## 12. Module: Admin — Danh sách/Tìm kiếm User (`GET /api/v1/admin/users`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-064 | GET /api/v1/admin/users | Integration | RBAC: role ADMIN và STAFF đều được phép truy cập | JWT có `ROLE_ADMIN` hoặc `ROLE_STAFF` | GET `/api/v1/admin/users` | HTTP 200 cho cả 2 role, `data` là Page mặc định size=20, sort createdAt | High |
| IT-USER-065 | GET /api/v1/admin/users | Integration | RBAC: role USER thường bị chặn; không có token bị chặn | JWT `ROLE_USER`; hoặc không có Authorization | GET `/api/v1/admin/users` | HTTP 403 (role USER); HTTP 401 (không token) | High |
| IT-USER-066 | GET /api/v1/admin/users | Integration | Filter theo `search`/`tier`/`blacklisted`, kết hợp nhiều filter, ký tự đặc biệt SQL wildcard, và phân trang tuỳ chỉnh | — | GET `?search=nguyen`, `?tier=GOLD`, `?blacklisted=true`, `?search=a&tier=MEMBER&active=true`, `?search=%`, `?page=2&size=5` | HTTP 200 cho mọi trường hợp, kết quả lọc đúng điều kiện (AND khi kết hợp), không lỗi 500 với ký tự wildcard (parameterized query), phân trang đúng `size` | Medium |

---

## 13. Module: Admin — CRUD User (`POST/GET/PUT/DELETE /api/v1/admin/users`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-067 | UserServiceImpl.adminCreateUser | Unit | Tạo user thành công: gọi Keycloak trước, sau đó lưu DB, publish event; `customerTier` không truyền → mặc định "MEMBER" | `keycloakAdminClient.createUser` trả về UUID mới | `adminCreateUser(req)` với `customerTier=null` | User được lưu với `keycloakUserId` từ Keycloak và `customerTier="MEMBER"`, `publishUserRegistered` được gọi, response có `roles` | High |
| UT-USER-068 | UserServiceImpl.adminCreateUser | Unit | Keycloak tạo user thất bại (throw exception) | `keycloakAdminClient.createUser` throw `RuntimeException` | `adminCreateUser(req)` | Exception propagate lên, KHÔNG lưu record vào DB (rollback / không gọi save) | High |
| IT-USER-069 | POST /api/v1/admin/users | Integration | Happy path — role ADMIN | JWT `ROLE_ADMIN` | POST body đầy đủ hợp lệ | HTTP 200, message "Tạo người dùng thành công" | High |
| IT-USER-070 | POST/PUT/DELETE /api/v1/admin/users/{userId} | Integration | RBAC: role STAFF bị chặn ở create/update/delete user (chỉ ADMIN được phép) | JWT `ROLE_STAFF` | POST/PUT/DELETE với body hợp lệ | HTTP 403 Forbidden (`@PreAuthorize("hasRole('ROLE_ADMIN')")`) cho cả 3 action | High |
| IT-USER-071 | POST/PUT /api/v1/admin/users[/{userId}] | Integration | Validate input cơ bản khi tạo/sửa user: `username` < 3 ký tự, `email` sai format, `password` < 6 ký tự | — | Body `username:"ab"` / `email:"not-an-email"` / `password:"123"` | HTTP 400 với lỗi field tương ứng (`@Size`, `@Email`) cho từng trường hợp | High |
| IT-USER-072 | POST /api/v1/admin/users | Integration | Email đã tồn tại (trùng với user khác) | Email đã có trong DB | POST body với email trùng | HTTP 500/409 tuỳ tầng nào bắt lỗi — vì `email` có `unique=true` ở DB nhưng KHÔNG có check trùng ở service trước khi gọi Keycloak → **GAP**: có thể tạo user Keycloak thành công nhưng lưu DB thất bại do `DataIntegrityViolationException` (dữ liệu Keycloak và DB local bị lệch, tạo user "orphan" — rủi ro cần lưu ý) | High |
| IT-USER-073 | GET /api/v1/admin/users/{userId} | Integration | Happy path lấy chi tiết user; userId không tồn tại | JWT ROLE_ADMIN/STAFF | GET `/api/v1/admin/users/{userId}` (tồn tại và `999999`) | HTTP 200 với đầy đủ field (`roles`, `keycloakEnabled`) khi tồn tại; HTTP 404 khi không tồn tại | High |
| IT-USER-074 | GET /api/v1/admin/users/{userId} | Integration | Keycloak Admin API lỗi/timeout khi lấy roles | `keycloakAdminClient` throw exception | GET detail | HTTP 200 vẫn trả về (graceful degrade), `keycloakEnabled=false`, `roles=[]` — không để lỗi Keycloak làm sập API | Medium |
| IT-USER-075 | PUT /api/v1/admin/users/{userId} | Integration | Cập nhật thành công (chỉ ADMIN) | JWT ROLE_ADMIN | PUT body `{"fullName":"Tên mới"}` | HTTP 200 | High |
| UT-USER-076 | UserServiceImpl.adminUpdateUser / adminDeleteUser | Unit | Đồng bộ Keycloak thất bại (khi update hoặc delete) nhưng vẫn giữ thay đổi DB (catch exception, chỉ log warn) — graceful degrade | `keycloakAdminClient.updateUser`/`deleteUser` throw exception | `adminUpdateUser(userId, req)`; `adminDeleteUser(userId)` | DB đã lưu thay đổi (không rollback: cập nhật field hoặc `active=false`), method không throw ra ngoài, log warning | Medium |
| IT-USER-077 | DELETE /api/v1/admin/users/{userId} | Integration | Xoá (soft-delete) thành công | JWT ROLE_ADMIN | DELETE `/api/v1/admin/users/{userId}` | HTTP 200, user vẫn còn record nhưng `active=false` (soft-delete), Keycloak user bị xoá | High |

---

## 14. Module: Admin — Blacklist (`PUT /api/v1/admin/users/{userId}/blacklist`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-078 | PUT /api/v1/admin/users/{userId}/blacklist | Integration | Khoá tài khoản thành công | JWT ROLE_ADMIN, `blacklisted=true` | PUT body `{"blacklisted":true, "reason":"Gian lận khuyến mãi"}` | HTTP 200, message "Tài khoản đã bị khóa", `user.isBlacklisted=true` | High |
| IT-USER-079 | PUT /api/v1/admin/users/{userId}/blacklist | Integration | Mở khoá tài khoản | `blacklisted=false` | PUT body `{"blacklisted":false}` | HTTP 200, message "Tài khoản đã được mở khóa" | High |
| IT-USER-080 | PUT /api/v1/admin/users/{userId}/blacklist | Integration | RBAC: role STAFF cố khoá user (chỉ ADMIN) | JWT ROLE_STAFF | PUT body hợp lệ | HTTP 403 | High |
| IT-USER-081 | PUT /api/v1/admin/users/{userId}/blacklist | Integration | Validate input cơ bản (thiếu field `blacklisted`, userId không tồn tại) | — | Body `{}`; PUT `/api/v1/admin/users/999999/blacklist` | HTTP 400 (thiếu field) / HTTP 404 (không tồn tại). **GAP ghi nhận**: field `reason` trong DTO hiện chỉ dùng để log, KHÔNG có cột lưu tương ứng trong entity `User` (không có audit trail) | Low |

---

## 15. Module: Admin — Tier & Reset Password

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-082 | PUT /api/v1/admin/users/{userId}/tier | Integration | Cập nhật tier hợp lệ | JWT ROLE_ADMIN | Body `{"tier":"GOLD"}` | HTTP 200, `user.customerTier="GOLD"` | High |
| IT-USER-083 | PUT /api/v1/admin/users/{userId}/tier, /reset-password | Integration | Validate input cơ bản: thiếu `tier`; `newPassword` < 6 ký tự | — | Body `{}` (tier); Body `{"newPassword":"123"}` | HTTP 400 cho cả 2 trường hợp (`@NotBlank`, `@Size(min=6)`) | High |
| IT-USER-084 | PUT /api/v1/admin/users/{userId}/tier | Integration | `tier` giá trị không thuộc enum hợp lệ (VD "SUPERVIP") — service KHÔNG validate whitelist | — | Body `{"tier":"SUPERVIP"}` | HTTP 200 — **GAP**: service chấp nhận bất kỳ string, không có validate enum whitelist (`MEMBER|SILVER|GOLD|VIP|DIAMOND`) → rủi ro dữ liệu bẩn, cần bổ sung validate | Medium |
| IT-USER-085 | PUT /api/v1/admin/users/{userId}/tier, /reset-password | Integration | RBAC: role STAFF cố đổi tier hoặc reset password (chỉ ADMIN) | JWT ROLE_STAFF | PUT body hợp lệ tới 2 endpoint | HTTP 403 cho cả 2 | High |
| IT-USER-086 | PUT /api/v1/admin/users/{userId}/reset-password | Integration | Reset password thành công; Keycloak lỗi khi set password | JWT ROLE_ADMIN; `keycloakAdminClient.setPassword` throw exception (case 2) | Body `{"newPassword":"NewPass123"}` | Case thành công: HTTP 200, message "Đặt lại mật khẩu thành công". Case lỗi Keycloak: HTTP 500, `code=INTERNAL_ERROR` | High |

---

## 16. Module: Admin — Phân quyền/Roles

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-087 | GET /api/v1/admin/users/roles | Integration | Lấy tất cả role hệ thống (chỉ ADMIN) | JWT ROLE_ADMIN | GET `/api/v1/admin/users/roles` | HTTP 200, list role từ Keycloak | High |
| IT-USER-088 | GET/PUT /api/v1/admin/users/roles, /{userId}/roles | Integration | RBAC: role STAFF bị chặn ở lấy-tất-cả-role và gán role (chỉ ADMIN) | JWT ROLE_STAFF | GET `/roles`; PUT `/{userId}/roles` | HTTP 403 cho cả 2 endpoint | High |
| IT-USER-089 | GET /api/v1/admin/users/{userId}/roles | Integration | Lấy roles của 1 user (ADMIN + STAFF được phép); Keycloak lỗi khi lấy roles → trả về rỗng, không throw | JWT ROLE_STAFF; `keycloakAdminClient.getUserRealmRoles` throw exception (case 2) | GET `/api/v1/admin/users/{userId}/roles` | HTTP 200 cho case happy path; case Keycloak lỗi trả về `[]`, không lỗi 500 | Medium |
| IT-USER-090 | PUT /api/v1/admin/users/{userId}/roles | Integration | Gán roles hợp lệ (validate `roles` rỗng → 400); Keycloak lỗi khi set roles → throw | JWT ROLE_ADMIN; `keycloakAdminClient.setUserRoles` throw exception (case 3) | Body `{"roles":["ROLE_USER","ROLE_SELLER"]}`; Body `{"roles":[]}` | HTTP 200 khi hợp lệ (roles Keycloak được ghi đè); HTTP 400 khi `roles` rỗng (`@NotEmpty`); HTTP 500 khi Keycloak lỗi | High |

---

## 17. Module: Admin — Thống kê (`GET /api/v1/admin/users/stats`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-091 | GET /api/v1/admin/users/stats | Integration | Happy path (ADMIN/STAFF) | Data seed sẵn: 100 user, 5 blacklist, phân bố tier | GET `/api/v1/admin/users/stats` | HTTP 200, `totalUsers=100`, `blacklistedUsers=5`, `activeUsers=95`, `tierDistribution` đủ 4 khóa DIAMOND/GOLD/SILVER/MEMBER | High |
| IT-USER-092 | GET /api/v1/admin/users/stats | Integration | Role USER thường cố xem stats | JWT ROLE_USER | GET | HTTP 403 | High |
| UT-USER-093 | UserServiceImpl.adminGetUserStats | Unit | Không có user nào trong hệ thống (không chia 0); `newUsersThisWeek`/`newUsersThisMonth` luôn = 0 | `count()=0` | `adminGetUserStats()` | `totalUsers=0, activeUsers=0`, không throw chia 0. **GAP ghi nhận**: `newUsersThisWeek`/`newUsersThisMonth` là giá trị hard-coded = 0, chưa implement thật dù có field trong response | Low |

---

## 18. Module: Internal API — Segmentation, AI Profile, Tier (dùng cho AI/Order Service)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-094 | PUT /api/internal/users/{userId}/segmentation | Integration | Cập nhật nhãn phân khúc thành công, gồm Unicode tiếng Việt có dấu | API key hợp lệ | Body `{"segmentationLabel":"VIP Champions"}` và `{"segmentationLabel":"Nguy cơ rời bỏ"}` | HTTP 200, `user.segmentationLabel` đúng, lưu đúng UTF-8, message "Segmentation label updated successfully" | High |
| IT-USER-095 | PUT/GET /api/internal/users/** | Integration | Không có API key `X-Internal-Api-Key` | — | Gọi bất kỳ endpoint internal không kèm header | HTTP 401 | High |
| IT-USER-096 | GET /api/internal/users/{userId}/profile-ai | Integration | Happy path lấy AI profile; userId không tồn tại | API key hợp lệ | GET `/api/internal/users/{userId}/profile-ai` (tồn tại và `999999`) | HTTP 200 với đủ field (`customerTier, segmentationLabel, isBlacklisted`) khi tồn tại; HTTP 404 khi không tồn tại | High |
| IT-USER-097 | GET /api/internal/users/keycloak/{keycloakUserId} | Integration | Happy path lấy profile theo Keycloak UUID; UUID không tồn tại | API key hợp lệ | GET `/api/internal/users/keycloak/{kcId}` (tồn tại và UUID lạ) | HTTP 200 trả `InternalUserProfileResponse` (id, keycloakUserId, email, phoneNumber, customerTier, loyaltyPoints) khi tồn tại; HTTP 404 khi không tồn tại | High |
| IT-USER-098 | PUT /api/internal/users/{userId}/tier, GET /points | Integration | Cập nhật tier qua internal API (Order Service gọi sau khi hoàn tất đơn); lấy số dư điểm qua internal API | API key hợp lệ | Body `{"tier":"VIP"}`; GET `/api/internal/users/{userId}/points` | HTTP 200 cho cả 2, tier cập nhật đúng; `data` = số điểm hiện tại (kiểu Integer, không wrap Page) | Medium |

---

## 19. Module: Bảo mật xuyên suốt (Cross-cutting Security)

Luồng bảo mật xuyên suốt (401/403) là trọng tâm quan trọng của toàn hệ thống — giữ chi tiết đầy đủ.

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-USER-099 | Security | Integration | JWT hợp lệ nhưng đã hết hạn (expired) | Token có `exp` trong quá khứ | GET `/api/v1/users/me` với token hết hạn | HTTP 401 (`oauth2ResourceServer` reject) | High |
| IT-USER-100 | Security | Integration | JWT không có claim `realm_access.roles` | Token thiếu claim | Gọi API secured admin | Authorities = `[]` → mọi `@PreAuthorize` role-based đều fail → HTTP 403 | Medium |
| IT-USER-101 | Security | Integration | Role trong JWT không có prefix `ROLE_` (VD chỉ "ADMIN") | `realm_access.roles=["ADMIN"]` | Gọi `/api/v1/admin/users` | `jwtAuthConverter` tự thêm prefix → thành `ROLE_ADMIN` → HTTP 200 (converter hoạt động đúng) | High |
| IT-USER-102 | Security | Integration | Gọi `/api/internal/**` kèm JWT hợp lệ nhưng KHÔNG có `X-Internal-Api-Key` | — | GET internal endpoint chỉ có Bearer token | HTTP 401 (API key filter chạy trước, độc lập với JWT — xác nhận 2 tầng bảo mật hoạt động độc lập) | High |
| IT-USER-103 | Security | Integration | `/api/v1/public/**` và `/api/v1/users/public/**` không cần bất kỳ auth nào | — | GET không có Authorization header | HTTP 200 (permitAll) | High |
| IT-USER-104 | Security | Integration | `/actuator/health` không cần auth; endpoint bất kỳ không thuộc whitelist mặc định yêu cầu xác thực | — | GET `/actuator/health`; GET endpoint không nằm trong pattern whitelist, không token | HTTP 200 (health); HTTP 401 (`anyRequest().authenticated()`) cho case còn lại | Low |

---

## 20. Module: Xử lý lỗi tập trung (GlobalExceptionHandler)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-USER-105 | GlobalExceptionHandler.handleResourceNotFound | Unit | Bắt `ResourceNotFoundException` | — | Throw `ResourceNotFoundException("User","id",1L)` trong controller | HTTP 404, `code=NOT_FOUND`, message đúng format `"User not found with id : '1'"` | High |
| UT-USER-106 | GlobalExceptionHandler.handleIllegalArgument | Unit | Bắt `IllegalArgumentException` | — | Throw exception với message tuỳ ý | HTTP 400, `code=INVALID_PARAM` | High |
| UT-USER-107 | GlobalExceptionHandler.handleValidationErrors | Unit | Bắt `MethodArgumentNotValidException` với nhiều field lỗi | — | Request thiếu 3 field bắt buộc cùng lúc | HTTP 400, `code=VALIDATION_FAILED`, `data` là map đủ 3 field lỗi | High |
| UT-USER-108 | GlobalExceptionHandler.handleGenericException | Unit | Bắt exception không xác định (VD `NullPointerException` runtime) | — | Throw `NullPointerException` bất kỳ trong service | HTTP 500, `code=INTERNAL_ERROR`, message chung KHÔNG lộ stack trace/chi tiết lỗi thật ra client | High |

---

## 21. Ghi chú tổng hợp rủi ro/gap phát hiện qua đọc code (không phải test case, để tham khảo khi review)

- `redeemForOrder` kiểm tra idempotency bằng "check-then-act" (`findFirstByOrderIdAndSourceType` rồi mới `save`) mà không có ràng buộc unique index ở DB hoặc lock — có khả năng race condition khi 2 request đồng thời cùng `orderId` (xem UT-USER-053). Cần test thực nghiệm với concurrency test (VD `ExecutorService` + `CountDownLatch`) trên môi trường DB thật.
- `TierUpdateRequest.tier` (cả admin và internal) chỉ có `@NotBlank`, không validate whitelist giá trị (`MEMBER|SILVER|GOLD|VIP|DIAMOND`) → có thể lưu giá trị tier tuỳ ý (IT-USER-084).
- `BlacklistRequest.reason` không có cột lưu trong entity `User` — chỉ dùng để log, không có audit trail lưu DB (IT-USER-081).
- `adminCreateUser`: tạo user trên Keycloak trước, sau đó lưu DB — nếu bước lưu DB thất bại (VD trùng email/username unique constraint) sẽ để lại user "orphan" trên Keycloak không có bản ghi tương ứng trong DB local (IT-USER-072). Không có cơ chế rollback/compensating transaction (Saga) giữa 2 hệ thống.
- `UserStatsResponse.newUsersThisWeek`/`newUsersThisMonth` hard-code = 0, chưa implement thật dù có field trong response (UT-USER-093).
- `getPublicUserProfile`/`public/{keycloakUserId}` là endpoint không cần xác thực, cần luôn kiểm tra không có rò rỉ field nhạy cảm (email, phone, loyaltyPoints) khi có thay đổi code trong tương lai (IT-USER-061).

---

*File test case này chỉ mô tả kế hoạch (Markdown), không chứa mã nguồn test thật (.java). Khi hiện thực hoá bằng JUnit 5 + Mockito (UT) và Spring Boot Test/MockMvc + Testcontainers (IT), cần mock rõ 3 client biên ngoài: `KeycloakAdminClient`, `StorageService` (MinIO), `KafkaTemplate` — theo đúng phần Scope đã nêu ở mục 1.*
