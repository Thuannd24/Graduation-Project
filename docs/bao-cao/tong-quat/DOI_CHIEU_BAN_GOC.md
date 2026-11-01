# Đối chiếu bản gốc và bản hiệu chỉnh

Nguồn: uc_tong_quan.vpp trong Downloads. Bản chính hiệu chỉnh: [uc_tong_quan.vpp](uc_tong_quan.vpp). Không thiết kế lại thành các nhóm UC mới.

| UC gốc | Sau hiệu chỉnh | ID model gốc | Bố cục |
|---|---|---|---|
| Manage User Accounts & RBAC | Manage User Accounts & RBAC | `FFLVSYWGAqAAaxIo` | Giữ nguyên |
| Business Statistics | Business Statistics | `MFLVSYWGAqAAaxIc` | Giữ nguyên |
| Validate BPMN Syntax | Validate BPMN Syntax | `J5LVSYWGAqAAaxIQ` | Giữ nguyên |
| Configure Camunda Campaign | Configure Camunda Campaign | `3ZLVSYWGAqAAaxIE` | Giữ nguyên |
| Manage Products & Categories | Manage Products & Categories | `BZLVSYWGAqAAaxH4` | Giữ nguyên |
| Process Refund Requests | Process Refund Requests | `BpLVSYWGAqAAaxHg` | Giữ nguyên |
| Process Orders & Shipping | Process Orders & Shipping | `0pLVSYWGAqAAaxHU` | Giữ nguyên |
| Direct Customer Support | Direct Customer Support | `9JLVSYWGAqAAaxHI` | Giữ nguyên |
| Live Handover to Staff | Live Handover to Staff | `SJLVSYWGAqAAaxG8` | Giữ nguyên |
| RAG Context Retrieval | RAG Context Retrieval | `HxLVSYWGAqAAaxGw` | Giữ nguyên |
| Chat with AI Assistant | Chat with AI Assistant | `.xLVSYWGAqAAaxGk` | Giữ vị trí; nới để hiển thị điểm mở rộng |
| Review & Rate Product | Review & Rate Product | `oxLVSYWGAqAAaxGY` | Giữ nguyên |
| Cancel Order & Refund | Cancel Order | `bBLVSYWGAqAAaxGM` | Đặt xuống cuối như ảnh gốc |
| VNPay Payment | VNPay Payment | `..LVSYWGAqAAaxGA` | Giữ nguyên |
| Hold Inventory Lock | Hold Inventory Lock | `e2LVSYWGAqAAaxF0` | Giữ nguyên |
| Apply Voucher | Apply Voucher | `jCLVSYWGAqAAaxFo` | Giữ nguyên |
| Select Delivery Address | Select Delivery Address | `Q0LVSYWGAqAAaxFc` | Giữ nguyên |
| Place Online Order | Place Online Order | `KYLVSYWGAqAAaxFQ` | Giữ vị trí; nới để hiển thị điểm mở rộng |
| Manage Cart | Manage Cart | `0QLVSYWGAqAAaxFE` | Giữ nguyên |
| Personalized Recommendations | Personalized Recommendations | `tALVSYWGAqAAaxE4` | Giữ nguyên |
| View Product Details | View Product Details | `I3zVSYWGAqAAaxEg` | Giữ nguyên |
| Login with OIDC / Password | Login with OIDC / Password | `8HzVSYWGAqAAaxD8` | Giữ nguyên |

## Actor và phạm vi

Giữ nguyên 5 actor tổng quan và tọa độ/ID của chúng. Thêm VNPay là hệ thống ngoài. Dùng chung actor ở sơ đồ tìm kiếm để tránh tên có hậu tố 2 khi nhập. Giữ nguyên ID diagram tổng quan, các diagram gốc, tên hệ thống, nền xanh và chiều rộng khung. Chiều cao tăng từ 1030 lên 1540 đơn vị để có chỗ cho UC mới.

## UC bổ sung

- Register Account
- Manage Inventory
- Reply to Product Review
- Pay for Order
- COD Payment
- Use Loyalty Points
- Retry Payment
- Manage Profile & Addresses
- Manage Wishlist
- Track Orders
- View Loyalty Points & Vouchers
- View Notifications
- View Warranty
- Preview Order
- Receive Payment Result
- Search Products — dùng lại model đã có trong sơ đồ tìm kiếm.

15 model UC mới và 1 view dùng lại Search Products; tổng quan có 38 view UC. Cả 22 ID model UC gốc đều giữ nguyên. Đây không phải thay bằng 38 nhóm nghiệp vụ khác.

Các điều kiện, quyền và ngoại lệ đối chiếu các controller: OrderController, PaymentController, AdminPaymentController, AdminInventoryController, UserController, WishlistController, CampaignController và Customer/StaffChatController. Code nghiệp vụ không bị thay đổi trong lần hiệu chỉnh sơ đồ này.
