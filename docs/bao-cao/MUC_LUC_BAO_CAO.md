# Mục lục Báo cáo Đồ án Tốt nghiệp

> Bố cục **Mở đầu + 4 chương + Kết luận**: Chương 1 đặt thẳng bài toán, Chương 2 trình bày
> các thành phần dùng trong giải pháp, Chương 3 áp dụng để xây dựng hệ thống, Chương 4 thực
> nghiệm và đánh giá. Dùng 4 chương (thay vì 3) vì đề tài có cả nền tảng microservices, workflow
> engine lẫn nhiều mô hình AI cần trình bày lý thuyết và đánh giá riêng.
>
> **Giả định phạm vi:** mọi chức năng đã có mã nguồn (kể cả đang làm dở) được coi là hoàn thành
> và đưa vào báo cáo. Những gì chưa có mã nguồn thì không đưa vào. Danh sách việc cần hoàn
> thiện để báo cáo khớp với sản phẩm khi bảo vệ nằm ở mục 4.
>
> **Cập nhật 2026-10-11** theo nhánh `develop` (đã gộp image search, nhánh của Geniedev1 và chatbot/chat-service mới
> từ `main`) và kết quả chạy thử toàn hệ thống cùng ngày.

---

## 1. Mục lục chính thức

```
LỜI CAM ĐOAN
LỜI CẢM ƠN
TÓM TẮT (Tiếng Việt + Tiếng Anh)
MỤC LỤC
DANH MỤC HÌNH VẼ
DANH MỤC BẢNG
DANH MỤC TỪ VIẾT TẮT

MỞ ĐẦU
 Lý do chọn đề tài
 Mục tiêu và phạm vi
 Hướng giải quyết
 Bố cục đồ án

CHƯƠNG 1. BÀI TOÁN XÂY DỰNG HỆ THỐNG THƯƠNG MẠI ĐIỆN TỬ PHÂN TÁN
          TÍCH HỢP TRÍ TUỆ NHÂN TẠO
 1.1 Phát biểu bài toán
 1.2 Các giải pháp hiện có
  1.2.1 Các hệ thống thương mại điện tử trong và ngoài nước
  1.2.2 Các hướng tiếp cận kiến trúc hệ thống thương mại điện tử
  1.2.3 Các hướng ứng dụng trí tuệ nhân tạo trong thương mại điện tử
 1.3 Giải pháp đề xuất của đồ án

CHƯƠNG 2. CƠ SỞ LÝ THUYẾT VÀ CÔNG NGHỆ
 2.1 Kiến trúc microservices và các mẫu thiết kế liên quan
 2.2 Giao tiếp giữa các dịch vụ và thu thập thay đổi dữ liệu
 2.3 Xác thực và phân quyền với OAuth2/OpenID Connect
 2.4 Tự động hóa quy trình nghiệp vụ với BPMN và Camunda
 2.5 Tìm kiếm sản phẩm: toàn văn, ngữ nghĩa và hình ảnh
 2.6 Mô hình gợi ý tuần tự SASRec
 2.7 Chatbot dựa trên mô hình ngôn ngữ lớn và kỹ thuật RAG
 2.8 Các mô hình phân tích khách hàng và kinh doanh
 2.9 Các nền tảng và công cụ sử dụng

CHƯƠNG 3. PHÂN TÍCH, THIẾT KẾ VÀ XÂY DỰNG HỆ THỐNG
 3.1 Mô tả bài toán và quy trình nghiệp vụ
 3.2 Phân tích yêu cầu
  3.2.1 Tác nhân và biểu đồ use case tổng quát
  3.2.2 Phân rã chức năng theo phân hệ
  3.2.3 Đặc tả các use case chính
  3.2.4 Yêu cầu phi chức năng
 3.3 Thiết kế kiến trúc
  3.3.1 Kiến trúc tổng thể và phân rã phân hệ
  3.3.2 Giao tiếp giữa các dịch vụ
  3.3.3 Đảm bảo nhất quán dữ liệu phân tán
  3.3.4 Bảo mật và phân quyền
  3.3.5 Khả năng chịu lỗi
  3.3.6 Tự động hóa quy trình bằng workflow engine
  3.3.7 Kiến trúc các dịch vụ trí tuệ nhân tạo
 3.4 Thiết kế chi tiết các phân hệ
  3.4.1 Phân hệ tài khoản và phân quyền
  3.4.2 Phân hệ sản phẩm, tìm kiếm và đánh giá
  3.4.3 Phân hệ giỏ hàng và đơn hàng
  3.4.4 Phân hệ kho hàng
  3.4.5 Phân hệ thanh toán
  3.4.6 Phân hệ khuyến mãi, tích điểm và chiến dịch tự động
  3.4.7 Phân hệ thông báo
  3.4.8 Phân hệ thu thập hành vi và gợi ý sản phẩm
  3.4.9 Phân hệ phân tích khách hàng và kinh doanh
  3.4.10 Phân hệ hỗ trợ khách hàng
 3.5 Thiết kế giao diện
 3.6 Cài đặt hệ thống
  3.6.1 Công cụ và cấu trúc mã nguồn
  3.6.2 Kết quả cài đặt các phân hệ
  3.6.3 Chuẩn bị dữ liệu
 3.7 Kiểm thử
 3.8 Triển khai
 
CHƯƠNG 4. THỰC NGHIỆM VÀ ĐÁNH GIÁ
 4.1 Môi trường và dữ liệu thực nghiệm
 4.2 Đánh giá mô hình gợi ý sản phẩm
  4.2.1 Kịch bản đánh giá
  4.2.2 Kết quả và phân tích ablation
  4.2.3 Đưa mô hình vào vận hành
 4.3 Đánh giá mô hình dự đoán rủi ro rời bỏ
  4.3.1 Kịch bản đánh giá
  4.3.2 Kết quả và hiệu chỉnh xác suất
  4.3.3 So sánh với phương pháp dựa trên luật
 4.4 Đánh giá chức năng tìm kiếm sản phẩm
  4.4.1 Tìm kiếm văn bản và ngữ nghĩa lai
 4.5 Đánh giá hiệu năng hệ thống

KẾT LUẬN
 Kết quả đạt được
 Hạn chế
 Hướng phát triển

TÀI LIỆU THAM KHẢO
PHỤ LỤC
 Phụ lục A. Danh sách API của các dịch vụ
 Phụ lục B. Hướng dẫn cài đặt và triển khai
```

**Mục có điều kiện (tùy số liệu có được):**
- 4.5 chỉ giữ nếu có số liệu đo tải/độ trễ thật.
- Có thể thêm *4.6 Đánh giá chatbot* (độ chính xác phân loại ý định, chất lượng câu trả lời trên bộ câu hỏi mẫu; đã có sẵn `AI/chatbot-service/scripts/run_ragas_eval.py` và `data/test-qa-dataset.md`) và *đánh giá dự báo nhu cầu* (MAE/RMSE) nếu có thời gian đo.

**Cách chia Chương 3:**
- **3.2.2, 3.4, 3.6.2 dùng chung 10 phân hệ** ở mục 2, cùng tên và cùng thứ tự.
- **3.3 chia theo vấn đề xuyên suốt** (giao tiếp, nhất quán, bảo mật, chịu lỗi, workflow, kiến trúc AI), vì các vấn đề này không thuộc riêng phân hệ nào.
- **3.5 Thiết kế giao diện** tách khỏi 3.4 vì không phải phân hệ; như vậy 3.4 chỉ gồm các phân hệ.
- Mỗi mục 3.4.x viết theo **cùng một khung**, dùng tiêu đề in đậm **không đánh số** để mục lục giữ tối đa 3 cấp:
  1. **Chức năng**: tham chiếu use case ở 3.2.2, tóm tắt các luật nghiệp vụ.
  2. **Thiết kế dữ liệu**: ERD hoặc mô hình dữ liệu của phân hệ.
  3. **Luồng xử lý**: sequence diagram các luồng chính (theo bảng mục 2.2).
  4. **Trạng thái**: state diagram, chỉ với Đơn hàng (3.4.3), Thanh toán (3.4.5), Voucher (3.4.6), Phòng chat hỗ trợ (3.4.10).
- 3.6.2 chủ yếu là ảnh chụp màn hình theo phân hệ và đoạn code tiêu biểu, không lặp lại thiết kế.
- Danh sách API đưa vào Phụ lục A, không đặt trong chương chính.

---

## 2. Mười phân hệ của hệ thống

### 2.1 Bảng phân hệ

| # | Phân hệ | Service / Dữ liệu | Chức năng chính | Mức độ trình bày |
|---|---|---|---|---|
| PH1 | Tài khoản và phân quyền | user-service, Keycloak, api-gateway / `user_db` | Đăng ký, đăng nhập (mật khẩu, Google), hồ sơ, địa chỉ, quản lý người dùng, vai trò | Vừa |
| PH2 | Sản phẩm, tìm kiếm và đánh giá | product-service, search-service / `product_db`, Elasticsearch, FAISS, MinIO | Cây danh mục đa ngành hàng, thương hiệu, thuộc tính động, sản phẩm + biến thể; tìm kiếm toàn văn (Elasticsearch), ngữ nghĩa lai và bằng hình ảnh (search-service); đánh giá; yêu thích; hệ thống cửa hàng; import catalog | **Sâu** |
| PH3 | Giỏ hàng và đơn hàng | order-service / `order_db`, Redis | Giỏ hàng, xem trước đơn, đặt hàng, trạng thái đơn, hủy và bù trừ, vận chuyển, bảo hành, thu cũ đổi mới | **Sâu** |
| PH4 | Kho hàng | inventory-service / `inventory_db`, Redis | Giữ chỗ, trừ và hoàn kho, nhập hàng, lịch sử biến động, cảnh báo sắp hết, đồng bộ | Vừa |
| PH5 | Thanh toán | payment-service / `payment_db` | VNPay, COD, callback, đối soát, hoàn tiền tự động và thủ công | **Sâu** |
| PH6 | Khuyến mãi, tích điểm và chiến dịch tự động | promotion-service + Camunda / `promotion_db`; điểm thưởng ở user-service | Voucher, chiến dịch kéo-thả BPMN, ngân sách, điểm thưởng (cộng qua hành động của chiến dịch, dùng khi thanh toán), hạng thành viên | **Sâu** |
| PH7 | Thông báo | notification-service / MongoDB | Mẫu thông báo, email theo sự kiện đơn/thanh toán/giao hàng, thông báo đẩy (FCM), hộp thư thông báo | Nhẹ |
| PH8 | Thu thập hành vi và gợi ý sản phẩm | forecast-service (thu thập), recs-service / `user_events`, Redis | Thu thập hành vi FE/BE, gợi ý cá nhân hóa, gợi ý mua kèm, xu hướng | **Sâu** |
| PH9 | Phân tích khách hàng và kinh doanh | forecast-service / `user_events`, registry mô hình | Phân khúc, dự đoán và quét rủi ro rời bỏ, dự báo nhu cầu, phát hiện bất thường, định giá | **Sâu** |
| PH10 | Hỗ trợ khách hàng | chatbot-service, chat-service / Redis, MongoDB `chat_db`, MinIO | Chatbot tư vấn (NLU bằng LLM + RAG sản phẩm/chính sách + công cụ tra cứu đơn, điểm, voucher, bảo hành); chat trực tiếp khách–nhân viên qua WebSocket, tự phân công nhân viên | **Sâu** |

**Tác nhân:**
- Người dùng: Khách vãng lai, Khách hàng, Nhân viên (ROLE_STAFF), Quản trị viên (ROLE_ADMIN).
- Tác nhân hệ thống: Bộ lập lịch, Dịch vụ AI.
- Hệ thống ngoài: VNPay, Google (đăng nhập), DeepSeek (LLM cho chatbot), máy chủ email (SMTP), Firebase (FCM), đơn vị vận chuyển (GHTK).

**Thống kê** không tách thành phân hệ riêng mà nằm ở phân hệ sở hữu dữ liệu:
- Tổng quan doanh số → PH3
- Thống kê giao dịch → PH5
- Thống kê khuyến mãi → PH6
- Phân khúc, dự báo, bất thường → PH9

**Câu hỏi hội đồng có thể hỏi về cách chia, nên chuẩn bị sẵn:**
- *"Sao không có phân hệ thống kê/báo cáo riêng?"* → Mỗi microservice có CSDL riêng, không có CSDL chung để làm phân hệ thống kê; mỗi phân hệ tự cung cấp số liệu của mình, dashboard admin tổng hợp ở giao diện.
- *"Điểm thưởng lưu ở user-service sao lại nằm ở PH6?"* → Dữ liệu điểm nằm cùng hồ sơ người dùng để khóa dòng khi cộng/trừ, nhưng nghiệp vụ tích/dùng điểm thuộc chính sách khách hàng thân thiết, do chiến dịch và đơn hàng điều khiển.
- *"Thu thập hành vi nằm ở forecast-service sao lại thuộc PH8?"* → Dữ liệu hành vi phục vụ cả PH8 và PH9; trình bày ở PH8 vì gợi ý là nơi dùng trực tiếp nhất, PH9 tham chiếu lại.
- *"Gateway thuộc phân hệ nào?"* → Không thuộc phân hệ nào; là thành phần kiến trúc, trình bày ở 3.3.2 và 3.3.4. Riêng việc tự tạo hồ sơ khi đăng nhập lần đầu nằm ở PH1.

### 2.2 Hình cần vẽ cho từng phân hệ

| Phân hệ | Use case / Activity | Sequence diagram | State diagram | Dữ liệu (ERD / mô hình) |
|---|---|---|---|---|
| PH1 | UC quản lý tài khoản, quản lý người dùng | Đăng nhập OIDC → gateway kiểm JWT, gắn header → tự tạo hồ sơ | — | User, Address |
| PH2 | UC quản lý sản phẩm, mua sắm, tìm kiếm | **Tìm kiếm lai: BM25 (Elasticsearch) + vector e5 (FAISS) → hợp nhất RRF**; Dựng chỉ mục offline (`build_index.py`); Tạo sản phẩm → commit → đánh chỉ mục ES; Đánh giá có xác thực đã mua | — | Category (cây), Attribute, Brand, Product, Variant, Review, Wishlist, Store; chỉ mục ES (văn bản), chỉ mục FAISS (văn bản) |
| PH3 | UC đặt hàng; **Activity đặt hàng** | **Đặt hàng → giữ kho → Kafka → chờ thanh toán → xác nhận**; **Hủy đơn và bù trừ**; Giao hàng → webhook GHTK | **Đơn hàng** | Order, OrderItem, OutboxEvent, CompensationTask, TradeIn |
| PH4 | UC quản lý kho | Nhận `OrderCreated` → `SELECT FOR UPDATE` → phát `inventory-events` | — | Inventory, InventoryTransaction, RestockRequest, InventoryDailySnapshot |
| PH5 | UC thanh toán, hoàn tiền | **Thanh toán VNPay → callback → Outbox/Debezium → xác nhận đơn**; Hoàn tiền | **Thanh toán** | Payment, Refund, WebhookLog, OutboxEvent |
| PH6 | UC quản lý chiến dịch; **Activity thiết kế → kiểm tra → deploy** | **Sự kiện → kích hoạt workflow → delegate → phát voucher**; Áp voucher khi đặt hàng | **Voucher**, Chiến dịch | Campaign, IssuedVoucher, ExecutedAction, LoyaltyPointTransaction; ví dụ một BPMN |
| PH7 | UC xem thông báo | Sự kiện đơn/thanh toán → chọn mẫu → gửi email / đẩy FCM / lưu hộp thư | — | Notification, NotificationTemplate, FcmToken (MongoDB) |
| PH8 | UC xem gợi ý, xem sản phẩm mua kèm | **Hành vi FE/BE → Kafka → lưu trữ → gợi ý (SASRec → Recency → Popularity)** | — | `user_events`, lịch sử Redis, checkpoint SASRec |
| PH9 | UC xem phân tích (quản trị) | **Quét rủi ro → `user-risk-events` → Camunda**; Huấn luyện có cổng kiểm tra → registry | — | Đặc trưng khách hàng, registry mô hình, model card |
| PH10 | UC trò chuyện với chatbot, yêu cầu gặp nhân viên, hỗ trợ khách (nhân viên) | **Tin nhắn → NLU bằng LLM (dự phòng từ khóa) → RAG sản phẩm / RAG chính sách / công cụ tra cứu → DeepSeek → JSON {message, products, card}**; **Chuyển nhân viên: tạo phòng chat-service → tự phân công nhân viên online ít phòng nhất → WebSocket STOMP** | **Phòng chat** (AI_CHAT → WAITING → ACTIVE → CLOSED) | Lịch sử hội thoại (Redis, 20 tin/24h), ChatRoom + ChatMessage (MongoDB), ảnh chat (MinIO), chỉ mục FAISS chính sách |

Tên entity lấy từ code (TradeIn, Store, FcmToken là tên dự kiến); kiểm tra lại khi vẽ ERD. Các hình **in đậm** là hình quan trọng nhất. Riêng sequence đặt hàng → thanh toán thể hiện gRPC, Kafka, Outbox và bù trừ trong cùng một luồng.

### 2.3 Nội dung mục 3.3 (kiến trúc xuyên suốt)

| Mục | Nội dung |
|---|---|
| 3.3.1 | Sơ đồ kiến trúc tổng thể; bảng ánh xạ phân hệ → service → CSDL; lý do tách |
| 3.3.2 | REST qua gateway, gRPC (giá, tồn kho), Feign nội bộ, Kafka (danh sách topic), WebSocket STOMP qua gateway (chat), Eureka |
| 3.3.3 | Transactional Outbox + Debezium, saga kiểu choreography với bù trừ, idempotency (khóa đặt hàng, ledger điểm, khóa kích hoạt chiến dịch) |
| 3.3.4 | Keycloak OIDC, gateway gắn header và chống giả mạo, phân quyền 2 lớp, API nội bộ có khóa riêng |
| 3.3.5 | Rate limit, circuit breaker + timeout + fallback, retry + Dead Letter Topic, scheduler có khóa phân tán |
| 3.3.6 | Vị trí của Camunda trong kiến trúc: nhúng trong promotion-service; nhận sự kiện từ Kafka (đăng ký, đơn hàng, thanh toán, đánh giá, rủi ro rời bỏ) và từ timer; delegate gọi sang user/order/notification-service qua Feign; vòng đời một chiến dịch (thiết kế → biên dịch BPMN → deploy → kích hoạt → thực thi → thống kê); chống kích hoạt trùng và idempotency của từng hành động |
| 3.3.7 | 4 dịch vụ AI (FastAPI) tách khỏi khối Java: lý do tách, đi qua gateway, thư viện dùng chung `shared-common`, registry mô hình có phiên bản, cổng đánh giá trước khi đưa mô hình vào phục vụ, cơ chế dự phòng khi mô hình không sẵn sàng; chatbot gọi LLM bên ngoài (DeepSeek) và chuyển giao sang chat-service |

**Phân biệt mục kiến trúc và mục phân hệ** để không viết trùng:
- **3.3.6** trả lời *workflow engine được tích hợp vào hệ thống phân tán như thế nào*; **3.4.6** trình bày *nghiệp vụ khuyến mãi cụ thể* (voucher, ngân sách, luật kiểm tra workflow, trạng thái voucher, điểm thưởng).
- **3.3.7** trả lời *các dịch vụ AI nằm ở đâu và phối hợp ra sao*; **3.4.2, 3.4.8, 3.4.9, 3.4.10** trình bày *từng chức năng AI cụ thể*.

### 2.4 Quy trình nghiệp vụ cho mục 3.1

Mục 3.1 mô tả các quy trình nghiệp vụ chính **trước khi** đi vào use case. Nên vẽ bằng **BPMN** (có swimlane theo tác nhân) để thống nhất với Camunda mà hệ thống dùng:

| # | Quy trình | Tác nhân / swimlane | Phân hệ liên quan |
|---|---|---|---|
| QT1 | Mua hàng và thanh toán (VNPay / COD) | Khách hàng, Hệ thống, VNPay | PH3, PH4, PH5, PH7 |
| QT2 | Hủy đơn và hoàn tiền | Khách hàng / Nhân viên, Hệ thống | PH3, PH4, PH5, PH6 |
| QT3 | Xử lý và giao đơn hàng | Nhân viên, Hệ thống, Đơn vị vận chuyển | PH3, PH7 |
| QT4 | Nhập hàng và quản lý tồn kho | Nhân viên, Hệ thống | PH4 |
| QT5 | Thiết kế và vận hành chiến dịch khuyến mãi | Quản trị viên, Camunda | PH6 |
| QT6 | Chăm sóc khách hàng có nguy cơ rời bỏ | Dịch vụ AI, Camunda, Khách hàng | PH9, PH6, PH7 |
| QT7 | Hỗ trợ khách hàng qua chatbot và chuyển sang nhân viên (tự phân công; không có nhân viên online thì chờ) | Khách hàng, Chatbot, Nhân viên | PH10 |
| QT8 | Đánh giá sản phẩm sau khi mua | Khách hàng, Nhân viên | PH2, PH3, PH6 |
| QT9 | Thu cũ đổi mới | Khách hàng, Nhân viên | PH3 |

Quy trình mô tả *nghiệp vụ diễn ra thế nào* (góc nhìn người dùng). Sequence diagram ở 3.4 mô tả *các service phối hợp ra sao* (góc nhìn kỹ thuật). QT1, QT2, QT5, QT6, QT7 là bắt buộc; các quy trình còn lại có thể gộp hoặc bỏ nếu thiếu trang.

---

## 3. Danh sách chức năng

Kiểm kê từ code (controller, endpoint, trang FE, Kafka listener, scheduler). Cột cuối là phân hệ (PH) hoặc mục kiến trúc trình bày chức năng đó.

### 3.1 Khách hàng

| Chức năng | Nơi cài đặt | Thuộc |
|---|---|---|
| Đăng ký, đăng nhập, quên mật khẩu qua email, đăng nhập Google; giao diện đăng nhập tùy biến tiếng Việt | Keycloak realm, theme `techstore` | PH1 |
| Liên kết tài khoản khi cùng email đăng nhập bằng mật khẩu và Google; tự tạo hồ sơ ở request đầu tiên | `UserServiceImpl`, `UserHeaderFilter` (gateway) | PH1 |
| Hồ sơ cá nhân, ảnh đại diện (MinIO), sổ địa chỉ theo tỉnh/xã (2 cấp) | `UserController`, `LocationController` | PH1 |
| Trang chủ dựng theo cây danh mục đa ngành hàng (mỗi danh mục gốc một khối) | `RootCategoryProductSection`, `CategoryGridSection` | PH2 |
| Duyệt danh mục với bộ lọc (thương hiệu, giá, khuyến mãi, cấu hình), sắp xếp, phân trang | `CategoryPage`, product-service | PH2 |
| Chi tiết sản phẩm: chọn biến thể, phóng to ảnh, thông số, bảo hành, sản phẩm liên quan | `ProductDetailPage` | PH2 |
| Tìm kiếm toàn văn bằng Elasticsearch, tự chuyển sang truy vấn DB khi ES lỗi | `SearchServiceImpl` (product-service) | PH2 |
| Tìm kiếm ngữ nghĩa lai (BM25 + vector multilingual-e5-large + RRF), gợi ý từ khóa — backend đã chạy thật, trang tìm kiếm của web chưa gọi | search-service `/search`, `/search/suggest` | PH2 |
| Đánh giá sản phẩm có xác thực đã mua, kèm ảnh; xem đánh giá đang chờ trong hồ sơ | `ReviewServiceImpl`, order-service `check-eligible` | PH2 |
| Danh sách yêu thích (khách vãng lai lưu cục bộ) | `WishlistController` | PH2 |
| Tra cứu hệ thống cửa hàng | `StorePage`, `GET /stores` | PH2 |
| Giỏ hàng trên Redis, kiểm tra tồn kho khi thêm | `CartController` | PH3 |
| Xem trước đơn hàng tính phía server: VAT 10%, phí ship, voucher, điểm | `OrderPricingHelper`, `/orders/checkout/preview` | PH3 |
| Đặt hàng có khóa chống đặt trùng (`Idempotency-Key`) | `OrderController` | PH3 |
| Theo dõi đơn và vận chuyển, tự hủy đơn trong 2 giờ | `OrderDetailPage`, `ProfilePage` | PH3 |
| Tra cứu bảo hành theo sản phẩm đã nhận | `/orders/warranty/me`, `WarrantyTab` | PH3 |
| Thu cũ đổi mới: gửi yêu cầu định giá máy cũ | `TradeInPage`, `POST /tradein` | PH3 |
| Thanh toán **VNPay** hoặc **COD** | payment-service, `CheckoutPage` | PH5 |
| Ví voucher cá nhân, áp voucher khi thanh toán | `VouchersTab`, `VoucherPicker` | PH6 |
| Điểm thưởng: được cộng khi chiến dịch có hành động `Action_Loyalty_Point` (cố định, hoặc theo giá trị đơn: 1 điểm/10.000đ × hệ số hạng Silver ×1.2, Gold ×1.5, VIP ×2); lịch sử điểm; dùng điểm khi thanh toán (1 điểm = 1.000đ). **Không tự cộng cho mọi đơn** | `LoyaltyPointServiceImpl`, `LoyaltyPointDelegate`, `LoyaltyPointsPicker` | PH6 |
| Nhận email: xác nhận đơn, hủy đơn, đang giao, đã giao, thanh toán thành công/thất bại, voucher từ chiến dịch; thông báo đẩy và hộp thư thông báo | notification-service | PH7 |
| Gợi ý trang chủ 3 tab: Dành cho bạn / Đã xem gần đây / Xu hướng (cả khách vãng lai) | `SuggestedSection`, recs-service | PH8 |
| Gợi ý sản phẩm mua kèm trong giỏ hàng | `CartPage`, `/recommendations/cross-sell` | PH8 |
| Chatbot tư vấn (cả khách vãng lai): hiểu ý định bằng LLM, gợi ý sản phẩm kèm thẻ, so sánh sản phẩm, trả lời chính sách có trích nguồn, ghi nhớ hội thoại | chatbot-service (DeepSeek), `AIChatbotWidget` | PH10 |
| Tra cứu qua chatbot (khi đăng nhập): trạng thái đơn, bảo hành, điểm thưởng, voucher; hướng dẫn hủy đơn | chatbot-service `tools.py` | PH10 |
| Chuyển sang nhân viên và chat trực tiếp (WebSocket), gửi ảnh | `AIChatbotWidget` → chat-service `/public/chat/rooms/*/handover` | PH10 |

### 3.2 Quản trị viên và nhân viên (ROLE_ADMIN, ROLE_STAFF)

| Chức năng | Nơi cài đặt | Thuộc |
|---|---|---|
| Khách hàng: tìm kiếm, thống kê theo hạng, tạo/sửa/xóa, chặn tài khoản (khóa cả Keycloak), đổi hạng, đặt lại mật khẩu, gán vai trò | `CustomersTab`, `AdminUserController` | PH1 |
| Hồ sơ quản trị, đổi ảnh đại diện; giao diện tối | `AdminRoleTab`, `AdminDashboardPage` | PH1 |
| Sản phẩm: tạo/sửa với biến thể, thuộc tính động theo danh mục, ảnh theo biến thể; xóa (chỉ ADMIN) | `AddProductTab`, `ProductsTab` | PH2 |
| Cây danh mục (chống vòng lặp), thuộc tính, thương hiệu | `CategoriesTab`, `BrandsTab` | PH2 |
| Import catalog: chạy thử trước, upsert theo slug/SKU, sắp xếp danh mục theo thứ tự cha-con | `AdminCatalogImportController` | PH2 |
| Phản hồi đánh giá của khách | `AdminReviewController`, `ReviewsTab` | PH2 |
| Tổng quan: doanh số, số đơn theo trạng thái, xu hướng theo tuần | `OverviewTab`, `OrdersTab` | PH3 |
| Đơn hàng: lọc, xem chi tiết kèm thanh toán, tạo vận đơn, cập nhật trạng thái giao, hủy | `OrdersTab` | PH3 |
| Tồn kho: đặt số lượng, nhập hàng (ghi nhà cung cấp), lịch sử biến động, cảnh báo sắp hết, đồng bộ Redis | `InventoryTab`, `AdminInventoryController` | PH4 |
| Giao dịch: thống kê, tỉ lệ COD/VNPay, **hoàn tiền toàn phần/một phần** | `TransactionsTab`, `AdminPaymentController` | PH5 |
| **Thiết kế chiến dịch kéo-thả**: 5 trigger, 6 điều kiện, 6 hành động; kiểm tra hợp lệ phía server; deploy BPMN lên Camunda; xuất file BPMN; bật/tắt chiến dịch | `campaigns/` (FE), `WorkflowValidatorService`, `BpmnCompilerService` | PH6 |
| Thống kê khuyến mãi, ngân sách chiến dịch, danh sách voucher đã phát | `PromotionStatsTab` | PH6 |
| Phân tích AI: phân khúc khách hàng, dự báo nhu cầu theo sản phẩm, nhật ký bất thường (khóa tài khoản / đánh dấu an toàn) | `AnalyticsAITab`, `/admin/analytics/*` | PH9 |
| Hỗ trợ chat: danh sách phòng chờ/đang xử lý, nhận phòng (hoặc được tự phân công), trả lời thời gian thực, đóng phòng | `SupportChatTab`, chat-service `/admin/chat/**` | PH10 |

**Chi tiết chiến dịch (PH6):**
- *Trigger:* khách mới đăng ký, đặt hàng/thanh toán thành công (lọc giá trị tối thiểu), đánh giá sản phẩm (lọc số sao), rủi ro rời bỏ từ AI, hẹn giờ (cron/ngày).
- *Điều kiện:* tổng chi tiêu (theo số ngày), hạng thành viên, khu vực, chứa sản phẩm, chứa danh mục, mức rủi ro rời bỏ.
- *Hành động:* voucher % (giới hạn giảm tối đa), voucher giảm tiền (đơn tối thiểu), voucher freeship; cộng điểm (cố định hoặc theo giá trị đơn); nâng hạng; gửi email.
- *Luật kiểm tra workflow:* đúng 1 trigger, có điểm kết thúc, mỗi nhánh rẽ có đúng 1 nhánh mặc định, không có nút mồ côi, không có vòng lặp, mọi đường đều đến điểm kết thúc.
- *Ngân sách:* giữ trước giá trị tối đa của voucher khi phát, trả lại khi voucher hết hạn.
- *Chống trùng:* khóa Redis khi kích hoạt; mỗi hành động có khóa idempotency theo processInstance + activity.

### 3.3 Xử lý tự động phía hệ thống

| Chức năng | Nơi cài đặt | Thuộc |
|---|---|---|
| Gateway: xác thực JWT, xóa header giả mạo rồi gắn thông tin người dùng, chặn `/api/internal/**` | `UserHeaderFilter`, `SecurityConfig` (gateway) | 3.3.4, PH1 |
| Phân quyền 2 lớp: gateway lọc theo vai trò, từng service kiểm tra lại bằng `@PreAuthorize`; API nội bộ bảo vệ bằng khóa riêng | `InternalApiKeyFilter`, Feign interceptor | 3.3.4 |
| Gọi đồng bộ qua gRPC: giá sản phẩm, tồn kho | `product.proto`, `inventory.proto` | 3.3.2 |
| Transactional Outbox + Debezium (EventRouter) cho `order-events`, `payment-events` | order/payment-service, `debezium-init` | 3.3.3 |
| Rate limit (token bucket Redis 20 req/s, burst 50), circuit breaker + timeout (Resilience4j), fallback | api-gateway | 3.3.5 |
| Retry + Dead Letter Topic cho consumer Kafka (order, inventory) | `KafkaConfig` | 3.3.5 |
| Cache Redis cho sản phẩm và wishlist, xóa cache sau khi commit; đồng bộ chỉ mục Elasticsearch (văn bản) sau khi commit; chỉ mục vector FAISS dựng offline và tự nạp lại trong ~30 giây | `CacheConfig`, `WishlistServiceImpl`, `SearchServiceImpl`, `build_index.py` | PH2 |
| Máy trạng thái đơn hàng: PENDING → AWAITING_PAYMENT → CONFIRMED → SHIPPED → DELIVERED / CANCELLED, chỉ tiến không lùi | `OrderServiceImpl` | PH3 |
| Tạo vận đơn và nhận webhook trạng thái giao hàng có chữ ký HMAC | `OrderServiceImpl`, `PublicShippingWebhookController` | PH3 |
| Bù trừ khi hủy đơn: hoàn kho, hoàn tiền, trả voucher, hoàn điểm; thử lại tối đa 10 lần | `CompensationRetryScheduler` | PH3, 3.3.3 |
| Hủy đơn quá hạn 30 phút, dọn outbox | `OrderExpiryScheduler`, `OutboxCleanupScheduler` | PH3 |
| Giữ chỗ tồn kho trên Redis bằng Lua script, trừ kho DB bằng `SELECT FOR UPDATE` (sắp xếp để tránh deadlock), xử lý trường hợp lệnh hủy đến trước lệnh tạo | inventory-service, order-service | PH4 |
| Đồng bộ tồn kho Redis hằng đêm, chụp tồn kho hằng ngày | `InventorySyncScheduler` | PH4 |
| Tự hoàn tiền khi hủy đơn; đối soát VNPay (QueryDR) trước khi hết hạn thanh toán; ghi log webhook; xử lý hoàn tiền định kỳ | payment-service | PH5 |
| Hết hạn voucher định kỳ, trả lại ngân sách | promotion-service scheduler | PH6 |
| Thông báo theo sự kiện `order-events` (xác nhận, hủy, đang giao, đã giao) và `payment-events`: email (SMTP), đẩy (FCM), lưu hộp thư; chống gửi trùng theo `(orderId, eventType)` | notification-service | PH7 |
| Thu thập 14 loại hành vi ở FE (xem, cuộn, thời gian ở trang, tìm kiếm, lọc, hiển thị, áp voucher…), gửi theo lô mỗi 10 giây | `behaviorTracker.ts` → `/public/behavior/events` | PH8 |
| Sự kiện hành vi từ BE: xem sản phẩm, thay đổi giỏ, mua hàng (từ `OrderConfirmedEvent`) → ghi `user_events` và lịch sử Redis | forecast-service `behavior_consumer.py` | PH8 |
| Gợi ý: SASRec → Recency → Popularity theo chuỗi dự phòng; **cổng đánh giá** chỉ nạp SASRec khi thắng baseline | recs-service | PH8, 4.2 |
| Phân khúc KMeans + dự đoán rời bỏ (Logistic Regression hiệu chỉnh isotonic); registry mô hình có phiên bản; model card | forecast-service, `shared_common/registry.py` | PH9, 4.3 |
| Quét rủi ro rời bỏ mỗi giờ: lọc khách có rủi ro cao và bỏ giỏ trong 24h, xếp hạng theo thiệt hại kỳ vọng, tối đa 50 voucher/lần → `user-risk-events` → Camunda | `risk_scheduler.py` | PH9 → PH6 |
| Dự báo nhu cầu theo sản phẩm (LightGBM) | forecast-service `/forecast`, `demand.py` | PH9 |
| Phát hiện bất thường (Isolation Forest) | forecast-service `/anomaly` | PH9 |
| Đề xuất mức giảm giá theo độ nhạy giá của khách | forecast-service `/pricing/predict` | PH9 |
| NLU một lần gọi LLM (JSON): ý định (8 nhãn), cảm xúc, mã đơn, chủ đề tài khoản; dự phòng bằng luật từ khóa; ý định khiếu nại → đề nghị gặp nhân viên | chatbot-service `nlu/classifier.py`, `nlu/heuristics.py` | PH10 |
| RAG chính sách: FAISS + multilingual-e5-base trên 11 văn bản chính sách (`FE/src/assets/policies_source/*.md`), ngưỡng tin cậy, từ chối khi không đủ căn cứ, trích nguồn | chatbot-service `rag/policy_rag.py` | PH10 |
| RAG sản phẩm: tìm theo từ khóa ở product-service, tách câu so sánh, lấy thông số | chatbot-service `rag/product_rag.py` | PH10 |
| Ghi nhớ hội thoại trên Redis (20 tin gần nhất, 24 giờ) | chatbot-service `memory.py` | PH10 |
| Theo dõi nhân viên online (Redis), tự phân công phòng cho nhân viên ít phòng nhất, ảnh chat lưu MinIO (TTL 3 ngày) | chat-service `ChatRoomServiceImpl`, `WebSocketEventListener` | PH10 |

### 3.4 Hạ tầng và công cụ

| Thành phần | Chi tiết | Mục |
|---|---|---|
| Container | MariaDB, MongoDB, Redis, Kafka, Debezium, Elasticsearch, MinIO, Keycloak, Eureka, Gateway, 8 service nghiệp vụ (gồm chat-service), 4 service AI | 3.8 |
| Production | AWS EC2, Caddy 2 tự cấp HTTPS (Let's Encrypt) cho 3 tên miền: web + API, `auth.` → Keycloak, `cdn.` → MinIO; Cloudflare proxy | 3.8 |
| `tools/catalog-import` | Crawl cellphones.com.vn (~1.100 SP điện tử) và Tiki (`scrape-tiki.mjs`: 12 danh mục gốc, manifest ~6.500 SP, 91 danh mục), chuyển ảnh sang Cloudflare R2, lọc sản phẩm lỗi ảnh, import qua admin API, đặt tồn kho. DB chạy thử ngày 2026-10-11 có 1.123 SP | 3.6.3 |
| `tools/data-seed` | Dữ liệu tổng hợp có seed cố định: ~500 user, ~3.000 đơn trong 12 tháng, 19 loại hành vi có báo cáo độ trung thực so với REES46/Taobao, đánh giá, voucher; chế độ xuất CSV cho huấn luyện; biến đổi REES46 | 3.6.3, 4.1 |
| `tools/real-data-seed` | Import bộ dữ liệu thật Olist (Kaggle): đơn và đánh giá; hành vi được sinh khớp với thời điểm đặt hàng thật | 3.6.3, 4.1 |

**Không đưa vào báo cáo** (chưa có mã nguồn): ví MoMo, trả hàng/đổi trả (RMA), SMS, **SIEM/SOAR**, pipeline CI/CD, giám sát (Prometheus/Grafana/tracing), sao lưu CSDL tự động. Những mục này thuộc *Hạn chế / Hướng phát triển*.

---

## 4. Việc cần hoàn thiện để khớp với báo cáo

Rà soát code và **chạy thử toàn hệ thống trên nhánh `develop` ngày 2026-10-11**. Báo cáo coi các chức năng này là hoàn
thành, nên cần làm xong (hoặc chuyển sang *Hạn chế*) trước buổi bảo vệ: hội đồng có thể yêu cầu demo bất kỳ chức năng nào.

### 4.1 Còn mở

| Xong | Phân hệ | Chức năng | Việc còn thiếu | Vị trí |
|---|---|---|---|---|
| [ ] | PH2 | Tìm kiếm ngữ nghĩa lai, gợi ý từ khóa | Backend chạy thật (FAISS + ES + RRF) nhưng trang tìm kiếm của web vẫn gọi product-service; chưa có FE gọi `/search`, `/search/suggest` | `SearchPage.jsx`, `productApi.ts` |
| [ ] | PH2 | Sản phẩm liên quan | Đang lấy 8 sản phẩm đầu danh sách | `ProductDetailPage.jsx:446` |
| [ ] | PH2 | Điểm đánh giá trung bình | Trang sản phẩm hiện 0 sao dù có đánh giá | `ProductDetailPage.jsx` |
| [ ] | PH2 | Hệ thống cửa hàng | Chưa có backend và route gateway cho `GET /stores` | `shopApi.ts` |
| [ ] | PH3 | Thu cũ đổi mới | Chưa có backend và route gateway cho `POST /tradein` | `shopApi.ts`, `TradeInPage.jsx` |
| [ ] | PH3 | Vận chuyển | Mã vận đơn giả `MOCK-GHTK-*`, phí ship cố định 30.000đ | `OrderServiceImpl.java`, `ShippingFeeCalculator.java` |
| [ ] | PH3 | Tổng quan đơn hàng | Badge xu hướng là số cố định | `OrdersTab.jsx` |
| [ ] | PH6 | Điểm thưởng theo đơn | Không tự cộng cho mọi đơn; chỉ cộng khi có chiến dịch `Action_Loyalty_Point`. Trang đăng nhập đang quảng cáo "Tích điểm mọi đơn hàng" | `LoyaltyPointDelegate.java`, theme Keycloak |
| [ ] | PH6 | Chiến dịch hẹn giờ | Không có ngữ cảnh người dùng nên hành động bị bỏ qua; xóa chiến dịch không gỡ deployment Camunda | `CampaignUserContextResolver.java`, `CampaignServiceImpl.java` |
| [ ] | PH7 | Thông báo đẩy, hộp thư | FCM chỉ ghi log; FE chưa có chuông thông báo cho khách; chuông ở admin chỉ trang trí | `NotificationServiceImpl.java`, `AdminHeader.jsx` |
| [ ] | PH7 | Email hoàn tiền; email khi không có nhân viên online | Chưa xử lý `RefundCompleted`; chat-service gửi `notification-events` nhưng **không service nào nghe**; một loại sự kiện thiếu email nên gửi tới địa chỉ giả `<userId>@ecommerce.com` | notification-service, `ChatMessageServiceImpl.java` |
| [ ] | PH8 | Gợi ý mua kèm | Bỏ qua sản phẩm trong giỏ, trả về danh sách phổ biến | `recommend.py` |
| [ ] | PH9 | Dự báo nhu cầu | Dữ liệu minh họa: dashboard admin dùng đường tăng + nhiễu ngẫu nhiên (`is_demo_data`), endpoint `/forecast` dùng sóng sin + nhiễu; chưa huấn luyện LightGBM | `forecast.py`, `demand.py` |
| [ ] | PH9 | Phát hiện bất thường | Dashboard dùng 3 dòng cố định; nút "khóa"/"đánh dấu an toàn" chỉ hiện alert | `forecast.py`, `AnalyticsAITab.jsx` |
| [ ] | PH9 | Định giá | Luật if/else, không ai gọi | `pricing.py` |
| [ ] | PH9 | Đặc trưng "bỏ giỏ" của churn | `orders.created_at` ghi giờ VN trong khi `user_events` là UTC → so khung 24h lệch 7 giờ | `shared_common/features/behavior.py` |
| [ ] | PH9 | Số liệu cho 4.3 | Model đã train được, nhưng cần chạy và lưu kết quả ablation/calibration/so sánh với luật; ghi rõ nhãn đang dùng (`churn_label_v2_orders_120d_min2`) khác nhãn của thí nghiệm REES46 (v3, 60 ngày) | `AI/forecast-service/app/training/` |
| [ ] | PH10 | Chatbot lọc theo giá | Hỏi "tai nghe dưới 2 triệu" trả điện thoại 10–20 triệu: RAG sản phẩm tìm theo từ khóa, không tách khoảng giá thành bộ lọc | `rag/product_rag.py` |
| [ ] | PH10 | Cảm xúc tiêu cực | Mới chỉ ghi log, chưa cảnh báo nhân viên | `chatbot.py` |
| [ ] | — | Mã nguồn thừa | `/chatbot/escalate` chỉ ghi log (FE dùng chat-service thay thế); MongoDB khai báo nhưng không dùng ở user-service; `ProductSimilarityRepository` không ai gọi | — |

### 4.2 Đã xong (kiểm chứng ngày 2026-10-11)

| Phân hệ | Chức năng | Ghi chú |
|---|---|---|
| PH2 | Tìm kiếm ngữ nghĩa/ảnh trả kết quả thật | FAISS 10.287 vector ảnh, 1.123 vector văn bản; upload ảnh từ FE hoạt động |
| PH2 | Khách xem trang chi tiết sản phẩm | Sửa: gateway mở `GET /users/public/**`, hồ sơ công khai chỉ trả tên + ảnh, username được che |
| PH3 | Tra cứu bảo hành | Sửa: order-service gửi khóa API nội bộ khi gọi product-service |
| PH7 | Email đang giao / đã giao | notification-service xử lý `OrderShipped`, `OrderDelivered` |
| PH8 | Thời điểm `PURCHASE` | Sửa: outbox ghi UTC; dòng `PURCHASE` cũ (trước bản sửa) vẫn lệch +7 giờ |
| PH9 | Huấn luyện churn, phân khúc, quét rủi ro, RFM | Sửa lỗi collation; train ~13 giây, AUC từng fold 0,65–0,85 trên dữ liệu seed |
| PH10 | Chatbot | Khách vãng lai dùng được, trả JSON có thẻ sản phẩm, có lịch sử hội thoại |
| PH10 | Chuyển sang nhân viên | Phòng chat thật trên chat-service, tự phân công, WebSocket |

## 5. Điểm nhấn nên làm nổi bật

Hệ thống có một **vòng khép kín từ dữ liệu đến hành động**. Nên trình bày thành mạch xuyên suốt: giới thiệu ở 1.3, quy trình QT6 ở 3.1, thiết kế ở 3.3.6, 3.4.6, 3.4.8, 3.4.9, minh họa ở 3.6.2, đánh giá ở 4.2 và 4.3.

```
Hành vi người dùng (FE tracker + Kafka) ──▶ user_events / lịch sử Redis
        │                                          │
        ▼                                          ▼
  Gợi ý SASRec (có cổng đánh giá)        Phân khúc + dự đoán rời bỏ
                                                   │ user-risk-events
                                                   ▼
                              Camunda: chiến dịch do admin thiết kế kéo-thả
                                                   │
                                                   ▼
                    Voucher / điểm thưởng / email / thông báo đẩy ──▶ khách quay lại
```

Đây là điểm khác biệt lớn so với đồ án TMĐT thông thường: AI không chỉ hiển thị kết quả mà **kích hoạt hành động nghiệp vụ tự động**, có kiểm soát ngân sách.

---

## 6. Nguồn nội dung trong repo cho từng mục

| Mục | Nội dung cần viết | Nguồn tham khảo |
|---|---|---|
| Mở đầu | Lý do chọn đề tài, hướng giải quyết, tóm tắt từng chương | Viết sau cùng |
| 1.1 | Bài toán TMĐT đồ công nghệ: mở rộng, nhất quán dữ liệu, tìm kiếm, cá nhân hóa, hỗ trợ khách hàng, giữ chân khách hàng | [README.md](../../README.md) |
| 1.2.1 | So sánh Shopee, Tiki, CellphoneS, Amazon… (bảng chức năng) | Tự khảo sát |
| 1.2.2 | Monolith vs microservices | Tự khảo sát |
| 1.2.3 | AI trong TMĐT: tìm kiếm ngữ nghĩa/ảnh, gợi ý, chatbot, phân tích khách hàng, marketing tự động | [churn-risk-feature-overview.md](../AI/churn-risk-feature-overview.md), [dashboard-ai.md](../AI/dashboard-ai.md), [chatbot-ai.md](../AI/chatbot-ai.md), [text-search.md](../AI/text-search.md) |
| 1.3 | Microservices + Kafka/CDC + Camunda + các dịch vụ AI (cầu nối sang Chương 2) | Mục 5 của file này, [AI/README.md](../../AI/README.md) |
| 2.1–2.3 | Gateway, Eureka, gRPC, Kafka, Outbox, Debezium, WebSocket/STOMP, circuit breaker, Keycloak | [services/00_INDEX.md](../services/00_INDEX.md), [keycloak_setup_guide.md](../keycloak_setup_guide.md) |
| 2.4 | BPMN 2.0 (sự kiện, gateway, service task, timer), Camunda engine, delegate | [07_PROMOTION_SERVICE.md](../services/07_PROMOTION_SERVICE.md) |
| 2.5 | Chỉ mục ngược + BM25; dense retrieval (multilingual-e5); Reciprocal Rank Fusion | [text-search.md](../AI/text-search.md) |
| 2.6 | SASRec: nguồn gốc, kiến trúc, độ phức tạp O(n²d), ví dụ | [09_AI_ENGINE_SERVICE.md](../services/09_AI_ENGINE_SERVICE.md), `AI/recs-service` |
| 2.7 | LLM, Retrieval-Augmented Generation, NLU bằng LLM (đầu ra JSON) kèm luật dự phòng, embedding multilingual-e5 + FAISS cho truy xuất chính sách, gọi công cụ (tool) | [chatbot-ai.md](../AI/chatbot-ai.md) |
| 2.8 | RFM + KMeans; Logistic Regression + hiệu chỉnh xác suất (isotonic/Platt); LightGBM cho dự báo chuỗi thời gian; Isolation Forest | [churn-risk-feature-overview.md](../AI/churn-risk-feature-overview.md), [dashboard-ai.md](../AI/dashboard-ai.md) |
| 2.9 | Spring Boot/Cloud, FastAPI, React, MariaDB, MongoDB, Redis, Elasticsearch, MinIO, Caddy | docker-compose trong `BE/`, `AI/` |
| 3.1 | 9 quy trình nghiệp vụ vẽ bằng BPMN (mục 2.4 của file này) | [DETAILED_ORDER_FLOW.md](../DETAILED_ORDER_FLOW.md) |
| 3.2 | Tác nhân, use case theo 10 phân hệ (mục 2 và 3 của file này) | [system_roles_permissions.md](../system_roles_permissions.md) |
| 3.3 | Theo mục 2.3 của file này | `BE/api-gateway`, `BE/order-service`, `BE/payment-service`, `BE/promotion-service`, `AI/shared-common`, docker-compose (Debezium) |
| 3.4.1–3.4.7 | Theo mục 2.2 của file này | [services/01…08](../services/), mã nguồn từng service |
| 3.4.2 (tìm kiếm) | Tìm kiếm toàn văn, lai | `BE/product-service`, `AI/search-service`, [text-search.md](../AI/text-search.md) |
| 3.4.6 | Dữ liệu chiến dịch/voucher/ngân sách, luật kiểm tra workflow, trigger/điều kiện/hành động, trạng thái voucher, điểm thưởng | `BE/promotion-service`, `FE/src/features/admin/components/campaigns/` |
| 3.4.8 | Luồng hành vi FE/BE → Kafka → forecast-service → MariaDB/Redis → recs | [09_AI_ENGINE_SERVICE.md](../services/09_AI_ENGINE_SERVICE.md), `AI/recs-service` |
| 3.4.9 | Phân khúc, rời bỏ, quét rủi ro, dự báo, bất thường, định giá | [churn-risk-feature-overview.md](../AI/churn-risk-feature-overview.md), [dashboard-ai.md](../AI/dashboard-ai.md), `AI/forecast-service` |
| 3.4.10 | Chatbot, chat-service, chuyển sang nhân viên | [chatbot-ai.md](../AI/chatbot-ai.md), [10_CHAT_SERVICE.md](../services/10_CHAT_SERVICE.md), `AI/chatbot-service`, `BE/chat-service`, `SupportChatTab.jsx` |
| 3.5 | Wireframe/ảnh các màn hình chính | `FE/src/features/` |
| 3.6.2 | Ảnh chụp màn hình theo phân hệ, đoạn code tiêu biểu | `FE/`, `BE/`, `AI/` |
| 3.6.3 | Crawl/import sản phẩm (cellphones, Tiki), dữ liệu tổng hợp, dữ liệu Olist, biến đổi REES46 | [tools/](../../tools/) |
| 3.7 | Chiến lược và kết quả kiểm thử; test của recs-service và forecast-service | [docs/test/](../test/), Postman collection (đã xoá khỏi `docs/` ở commit `0454831`; lấy lại: `git show 0454831^:docs/order_service_test_collection.json`), `AI/recs-service/tests/`, `AI/forecast-service/tests/` |
| 3.8 | Docker Compose, Caddy, AWS EC2 | [BE/DEPLOY.md](../../BE/DEPLOY.md) |
| 4.1 | Mô tả bộ dữ liệu (tổng hợp và Olist), tỉ lệ chia, phần cứng | `tools/data-seed`, `tools/real-data-seed` |
| 4.2 | Temporal split, 2 track explore/repeat, 5 baseline, HR/NDCG/MRR, coverage, Gini, khoảng tin cậy bootstrap, ablation, cổng đánh giá | `AI/recs-service/evaluation/`, [09_AI_ENGINE_SERVICE.md](../services/09_AI_ENGINE_SERVICE.md) |
| 4.3 | Ablation, calibration, chẩn đoán nhãn, so sánh với luật, model card. ⚠️ Số liệu trong `churn-risk-feature-overview.md` (AUC 0,7354) là thí nghiệm REES46, không phải model đang chạy | `AI/forecast-service/app/training/`, `/models/*`, [churn-risk-feature-overview.md](../AI/churn-risk-feature-overview.md) |
| 4.4 | Văn bản: MRR, Hit@k (so BM25, dense, lai). Đánh giá hiệu năng tìm kiếm | [text-search.md](../AI/text-search.md), `AI/search-service/scripts/evaluate.py` |
| Kết luận / Hạn chế | Các mục "Không đưa vào báo cáo" ở cuối mục 3.4 và các mục còn mở ở 4.1 | — |
| Phụ lục A | Danh sách API | Controller từng service; bản hợp đồng API cũ `FRONTEND_API_CONTRACT.md` đã xoá ở commit `0454831` (lấy lại: `git show 0454831^:docs/prompt_Fe/FRONTEND_API_CONTRACT.md`) |
| Phụ lục B | Hướng dẫn cài đặt, cấu hình Keycloak | [README.md](../../README.md), [keycloak_setup_guide.md](../keycloak_setup_guide.md) |

---

## 7. Thứ tự viết đề xuất

1. **Chương 3 (3.1–3.3)**: quy trình nghiệp vụ (BPMN), tác nhân, use case tổng quát, phân rã 10 phân hệ, sơ đồ kiến trúc tổng thể.
2. **Chương 3 (3.4)**: thiết kế chi tiết theo phân hệ, ưu tiên các phân hệ "Sâu": PH3 → PH5 → PH6 → PH8 → PH9 → PH2; sau đó PH10, PH1, PH4, PH7.
3. **Chương 3 (3.5–3.8)**: viết song song với chụp màn hình FE và trích code tiêu biểu.
4. **Chương 4**: chạy lại evaluation recs, train + các nghiên cứu churn, đo tìm kiếm để lấy số liệu thật, rồi **đóng băng kết quả**.
5. **Chương 2**: chỉ viết lý thuyết mà Chương 3–4 thực sự dùng.
6. **Chương 1**: khảo sát giải pháp hiện có, chốt giải pháp đề xuất khớp với Chương 2.
7. **Mở đầu và Kết luận**: viết sau cùng.
8. Tóm tắt, danh mục hình/bảng/từ viết tắt, tài liệu tham khảo, phụ lục.

---

## 8. Phân bổ số trang tham khảo

| Phần | Số trang |
|---|---|
| Mở đầu | ~3 |
| Chương 1. Bài toán | ~8 |
| Chương 2. Cơ sở lý thuyết và công nghệ | ~15–18 |
| Chương 3. Phân tích, thiết kế và xây dựng | ~35–40 |
| &nbsp;&nbsp;↳ 3.4 Thiết kế chi tiết (phân hệ "Sâu" mỗi phân hệ ~3 trang; còn lại mỗi phân hệ ~1–2 trang) | ~22–26 |
| Chương 4. Thực nghiệm và đánh giá | ~15–18 |
| Kết luận | ~2–3 |
| **Tổng (chưa tính phụ lục)** | **~80–90** |

Nếu trường giới hạn số trang thấp hơn, rút gọn trước ở PH1, PH4, PH7 và các quy trình nghiệp vụ không bắt buộc.

---

## 9. Nguyên tắc trình bày

- Mở đầu và Kết luận **không đánh số chương**; đánh số trang chính thức bắt đầu từ Mở đầu.
- Tên Chương 1 là **tên bài toán**, không phải tên công nghệ. Mục cuối Chương 1 nêu giải pháp, làm cầu sang Chương 2.
- Chương 2 chỉ trình bày thứ **đã có của người khác** mà đồ án dùng. Thuật toán cần có nguồn gốc, nội dung, độ phức tạp, ví dụ minh họa.
- Chương 3 mở đầu bằng việc đặt lại bài toán chi tiết; chỉ rõ phần nào áp dụng thành phần nào của Chương 2.
- 10 phân hệ được dùng **cùng tên, cùng thứ tự** ở 3.2.2, 3.4 và 3.6.2.
- Chương 4 phải có chuẩn bị dữ liệu, kịch bản đánh giá, kết quả có số liệu và phân tích. **Nói rõ dữ liệu là tổng hợp hay thật**, và báo cáo cả khoảng tin cậy (ví dụ: SASRec HR@10 0.0499 so với 0.0340 của Category-Pop, nhưng khoảng tin cậy của chênh lệch là [−0.016; 0.043], tức chưa có ý nghĩa thống kê).
- Đánh số tối đa 3 cấp; tiêu đề là cụm danh từ, không có ghi chú hay mũi tên trong mục lục chính thức.
- Tài liệu tham khảo theo một chuẩn thống nhất (IEEE), ưu tiên bài gốc: SASRec (Kang & McAuley, 2018), CLIP (Radford et al., 2021), E5 (Wang et al., 2022), RAG (Lewis et al., 2020), RRF (Cormack et al., 2009), LightGBM (Ke et al., 2017), Isolation Forest (Liu et al., 2008), đặc tả BPMN 2.0 (OMG), Platt (1999), Zadrozny & Elkan (2002)…

---

## 10. Các điểm cần sửa khi lấy nội dung từ docs

- [ ] `docs/services/` ghi **PostgreSQL**, nhưng docker-compose đang chạy **MariaDB 10.11**.
- [ ] Docs mô tả một "AI Engine :8000" duy nhất; thực tế là **4 service**: search :8001, chatbot :8002, recs :8003, forecast :8004.
- [ ] **Không có MoMo**: chỉ có VNPay và COD (MoMo chỉ xuất hiện ở logo footer và một comment).
- [ ] "Kiểm duyệt đánh giá" thực tế chỉ là **phản hồi** đánh giá; không có duyệt/ẩn/xóa.
- [ ] Địa chỉ là **2 cấp tỉnh/xã**, không phải tỉnh/huyện/xã.
- [ ] Blueprint liệt kê các mô hình *đề xuất*; báo cáo chỉ ghi mô hình hệ thống thực sự dùng (mỗi bài toán một mô hình, trừ khi có thực nghiệm so sánh).
- [ ] Chatbot dùng **DeepSeek**, NLU bằng LLM (không PhoBERT), trả **JSON** (không SSE). Các tài liệu cũ nhắc Gemini/PhoBERT/SSE đã được gắn banner.
- [ ] Nhiều tài liệu thiết kế trong `docs/services/` và `docs/AI/` đã được gắn banner "thiết kế ban đầu / lịch sử": chỉ trích phần khớp code.
- [ ] Code không dùng từ "Saga" nhưng có **bù trừ khi hủy đơn**. Có thể trình bày là saga kiểu choreography.
- [ ] Ảnh sản phẩm từ tool import nằm trên **Cloudflare R2**; ảnh upload qua admin nằm trên **MinIO**.

---

## 11. Câu hỏi còn mở

- [ ] Tên đề tài chính thức (tên Chương 1 ở trên đang đặt tạm, cần khớp với tên đề tài).
- [ ] Trường/khoa có template bắt buộc không? Nếu có, ánh xạ bố cục này vào template.
