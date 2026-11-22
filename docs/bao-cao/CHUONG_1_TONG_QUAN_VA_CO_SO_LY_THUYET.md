# CHƯƠNG 1: TỔNG QUAN VỀ ĐỀ TÀI VÀ CƠ SỞ LÝ THUYẾT

---

## 1.1. Tổng quan vấn đề nghiên cứu

### 1.1.1. Bối cảnh chuyển đổi số trong lĩnh vực bán lẻ và thương mại điện tử
Chuyển đổi số trong lĩnh vực bán lẻ (Retail Digital Transformation) là quá trình ứng dụng toàn diện các công nghệ số tiên tiến nhằm tái cấu trúc chuỗi cung ứng, tự động hóa quy trình vận hành và nâng cao trải nghiệm mua sắm của khách hàng [1]. Trong bối cảnh cuộc Cách mạng Công nghiệp 4.0, sự phát triển vượt bậc của Trí tuệ nhân tạo (AI), Điện toán đám mây (Cloud Computing), Dữ liệu lớn (Big Data) và Kiến trúc hướng dịch vụ phân tán (Microservices Architecture) đã làm thay đổi sâu sắc phương thức thương mại truyền thống, biến các sàn thương mại điện tử thành trung tâm kết nối trực tiếp, linh hoạt giữa doanh nghiệp và người tiêu dùng [2].

Tại Việt Nam, thương mại điện tử được xác định là một trong những trụ cột tiên phong của nền kinh tế số theo Quyết định số 645/QĐ-TTg của Thủ tướng Chính phủ phê duyệt Kế hoạch tổng thể phát triển thương mại điện tử quốc gia giai đoạn 2021–2025 [3]. Theo Báo cáo Kinh tế số Đông Nam Á (e-Conomy SEA 2024) do Google, Temasek và Bain & Company công bố, tổng giá trị hàng hóa (GMV) thương mại điện tử Việt Nam duy trì tốc độ tăng trưởng kép hàng năm (CAGR) trên 18%, dự kiến đạt mốc 35 tỷ USD vào năm 2025 [4]. Người tiêu dùng hiện đại không chỉ tìm kiếm sự thuận tiện trong thanh toán và giao nhận, mà còn đòi hỏi các trải nghiệm cá nhân hóa sâu sắc, dịch vụ hỗ trợ khách hàng tức thì và khả năng đáp ứng ổn định của hệ thống trong những đợt mở bán cao điểm (Flash Sale).

### 1.1.2. Xu hướng phát triển các nền tảng thương mại điện tử thế hệ mới
Thị trường thương mại điện tử hiện đại đang chuyển dịch mạnh mẽ từ các hệ thống nguyên khối (Monolith) sang các nền tảng phân tán thế hệ mới với nhiều xu hướng công nghệ tiêu biểu:

> **[Khu vực bố trí hình ảnh / biểu đồ]:**
> * **Mô tả nội dung:** Biểu đồ cột thể hiện quy mô doanh thu TMĐT B2C Việt Nam giai đoạn 2020 – 2025 kết hợp đường biểu diễn tốc độ tăng trưởng hàng năm.
> * **Nguồn dữ liệu:** Sách trắng Thương mại điện tử Việt Nam (Bộ Công Thương) [3] và Báo cáo e-Conomy SEA 2024 [4].

**Hình 1.1: Biểu đồ tăng trưởng quy mô thị trường Thương mại điện tử B2C Việt Nam**

Các xu hướng công nghệ nổi bật bao gồm:
* **Kiến trúc Microservices hướng sự kiện (Event-Driven Architecture):** Tách biệt các miền nghiệp vụ thành những dịch vụ độc lập, giao tiếp bất đồng bộ qua hàng đợi thông điệp Apache Kafka, cho phép hệ thống mở rộng linh hoạt theo tải cục bộ [5].
* **Bộ nhớ đệm phân tán và Kiểm soát truy cập đồng thời cao (In-Memory Caching & Locking):** Ứng dụng Redis Cluster với các kịch bản thực thi nguyên tử (Atomic Scripts) và Khóa phân tán (Distributed Locks) nhằm xử lý bài toán giữ chỗ kho (Stock Reservation) và chống bán vượt tồn kho (Overselling) trong các đợt Flash Sale [6].
* **Tự động hóa quy trình nghiệp vụ (Business Process Management - BPMN):** Ứng dụng các công cụ điều phối luồng công việc như Camunda BPMN để cấu hình linh hoạt các chiến dịch khuyến mãi, tự động cấp phát voucher và tính điểm thưởng (Loyalty Points) theo hành vi người dùng [7].
* **Trợ lý ảo thông minh hướng tác vụ (Task-Oriented AI Assistant):** Ứng dụng các Mô hình Ngôn ngữ Lớn (LLMs) kết hợp với kiến trúc Tăng cường Tri thức Bằng Truy xuất (RAG) để tư vấn sản phẩm, so sánh thông số kỹ thuật thời gian thực và hỗ trợ tra cứu đơn hàng trực tiếp bằng ngôn ngữ tự nhiên [8].
* **Tìm kiếm đa phương thức và Gợi ý cá nhân hóa (Multimodal Search & Recommendation):** Tích hợp tìm kiếm ngữ nghĩa, tìm kiếm bằng hình ảnh và các thuật toán học máy đề xuất sản phẩm dựa trên lịch sử tương tác, giúp tối ưu hóa tỷ lệ chuyển đổi đơn hàng [9].

### 1.1.3. Những hạn chế trong các hệ thống thương mại điện tử hiện nay
Bên cạnh sự phát triển nhanh chóng của công nghệ, hoạt động thiết kế và vận hành các nền tảng thương mại điện tử thực tế vẫn đối mặt với nhiều hạn chế:
* **Về phía doanh nghiệp và vận hành:**
  * Khó khăn trong việc duy trì tính toàn vẹn dữ liệu giữa các khâu đặt hàng, trừ tồn kho và thanh toán khi xử lý giao dịch phân tán [5].
  * Hiện tượng cập nhật không đồng bộ (Dual-Write) giữa cơ sở dữ liệu và hàng đợi thông điệp dễ dẫn đến mất mát sự kiện khi có sự cố mạng.
  * Nguy cơ nghẽn khóa hàng (Row-level lock contention) trong cơ sở dữ liệu quan hệ khi xảy ra đột biến truy cập Flash Sale, dẫn đến quá tải hệ thống hoặc bán âm kho.
* **Về phía người dùng:**
  * Trải nghiệm tìm kiếm từ khóa truyền thống còn cứng nhắc, chưa hiểu được ngôn ngữ tự nhiên và ngữ cảnh thực tế của khách hàng.
  * Thiếu sự hỗ trợ tức thì 24/7; các kênh chăm sóc khách hàng tự động thông thường chỉ dừng lại ở kịch bản cố định, không có khả năng giải quyết linh hoạt các tác vụ giao dịch cụ thể.
* **Về phía phân hệ Trí tuệ nhân tạo:**
  * Việc ứng dụng LLMs vào chăm sóc khách hàng thường gặp rủi ro "ảo giác" (Hallucination), tự sinh thông tin sai lệch về thông số kỹ thuật, giá bán hoặc chính sách bảo hành [11].
  * Rủi ro bảo mật thông tin khi để LLMs can thiệp trực tiếp vào dữ liệu giao dịch nhạy cảm mà không có cơ chế phòng thủ ngăn chặn tấn công chèn lệnh (Prompt Injection) [12].

### 1.1.4. Tính cấp thiết và ý nghĩa của đề tài nghiên cứu
* **Tính cấp thiết:**
  Việc nghiên cứu và xây dựng một nền tảng thương mại điện tử bán lẻ thiết bị công nghệ hiện đại, kết hợp kiến trúc Microservices chịu tải cao với hệ sinh thái AI thông minh là yêu cầu cấp thiết. Đề tài tập trung giải quyết bài toán giữ chỗ kho nguyên tử qua Redis, điều phối giao dịch phân tán Saga trên Kafka qua mô hình Transactional Outbox CDC, đồng thời phát triển Trợ lý ảo AI Aura ứng dụng kiến trúc Dual-Pipeline RAG và bộ lọc Gatekeeper để loại bỏ hoàn toàn hiện tượng ảo giác, mang lại sự tin cậy tuyệt đối cho người dùng và doanh nghiệp.
* **Ý nghĩa khoa học:**
  Đề tài nghiên cứu và làm rõ quy trình tích hợp các giải pháp kiến trúc phần mềm phân tán tiên tiến: kiến trúc hướng sự kiện (EDA), mô hình Transactional Outbox kết hợp kỹ thuật bắt dữ liệu thay đổi (Debezium CDC), kỹ thuật khóa phân tán và điều phối quy trình tự động Camunda BPMN. Về mặt Trí tuệ nhân tạo, đề tài đóng góp mô hình kết hợp lai giữa hiểu ngôn ngữ tự nhiên định tuyến xác định (Deterministic No-LLM Tool Routing) và RAG kiểm soát độ tin cậy tri thức (Confidence Gatekeeper) kết hợp cơ sở dữ liệu vector FAISS, đóng góp vào cơ sở lý luận về kiểm soát chất lượng sinh nội dung của AI trong môi trường nghiệp vụ thương mại.
* **Ý nghĩa thực tiễn:**
  Hệ thống có khả năng triển khai thực tế phục vụ các doanh nghiệp kinh doanh thiết bị công nghệ. Hệ thống mang lại trải nghiệm mua sắm mượt mà với độ trễ thấp (<250ms cho các tác vụ tra cứu giao dịch), tự động hóa phần lớn quy trình tư vấn và hỗ trợ khách hàng, đồng thời cung cấp công cụ quản trị tập trung toàn diện cho nhân viên (Staff) và ban quản trị (Admin).

---

## 1.2. Mục tiêu nghiên cứu và phạm vi thực hiện

### 1.2.1. Mục tiêu tổng quát của đề tài
Nghiên cứu, phân tích, thiết kế và hiện thực hóa một hệ sinh thái thương mại điện tử bán lẻ thiết bị công nghệ toàn diện, vận hành trên nền tảng kiến trúc **Microservices** phân tán, bảo mật định danh tập trung (Keycloak OIDC), xử lý dữ liệu hướng sự kiện (Apache Kafka & Debezium CDC), kết hợp bộ giải pháp **Trí tuệ nhân tạo (AI Services)** hỗ trợ tìm kiếm ngữ nghĩa, gợi ý sản phẩm cá nhân hóa, dự báo kinh doanh và trợ lý ảo hội thoại Dual-RAG thông minh.

### 1.2.2. Các mục tiêu cụ thể
1. **Xây dựng hệ sinh thái Microservices Backend vững chắc:** Thiết kế và triển khai 8 microservice nghiệp vụ độc lập (`user-service`, `product-service`, `inventory-service`, `order-service`, `payment-service`, `promotion-service`, `notification-service`, `chat-service`) cùng hạ tầng Spring Cloud (API Gateway, Eureka Server, Keycloak OIDC/OAuth2).
2. **Hiện thực hóa quy trình giao dịch phân tán Saga & Tồn kho tốc độ cao:** 
   * Triển khai kiến trúc Event-Driven qua Apache Kafka, áp dụng Transactional Outbox Pattern với Debezium CDC nhằm loại bỏ hiện tượng Dual-Write [10], [13].
   * Xây dựng luồng Saga Choreography đảm bảo tính nhất quán dữ liệu giữa Đơn hàng - Tồn kho - Thanh toán kèm cơ chế bù trừ tự động khi phát sinh lỗi.
   * Áp dụng Redis Lua Scripts nguyên tử và Distributed Lock bảo vệ kho hàng khỏi tranh chấp dữ liệu khi Flash Sale [6].
3. **Phát triển Trợ lý ảo AI Aura với kiến trúc Dual-Pipeline RAG:**
   * Xây dựng bộ phân loại One-Pass NLU Classifier (DeepSeek JSON Schema mode) bóc tách đồng thời ý định và thực thể trong một lượt suy luận duy nhất [14].
   * Thiết lập kiến trúc Dual-RAG Pipeline: Nhánh tri thức chính sách phi cấu trúc (FAISS Vector DB với `multilingual-e5-base`) và Nhánh thông số sản phẩm thời gian thực (truy vấn trực tiếp Product Service :8089) [15], [16].
   * Triển khai Cổng kiểm soát độ tin cậy tri thức (Confidence Gatekeeper) với các ngưỡng khắt khe nhằm ngắt gọi LLM và trả về hotline hỗ trợ khi thiếu dữ liệu chính xác, triệt tiêu nguy cơ ảo giác.
   * Định tuyến 100% No-LLM cho các truy vấn tra cứu đơn hàng, voucher và điểm thưởng để bảo mật thông tin và tối ưu độ trễ phản hồi (<250ms).
4. **Phát triển các dịch vụ AI bổ trợ:**
   * Module Tìm kiếm ngữ nghĩa (Semantic Search) và Tìm kiếm hình ảnh (Visual Search).
   * Module Gợi ý cá nhân hóa (Recommendation Service).
   * Module Dự báo nhu cầu bán hàng (Sales Forecasting).
5. **Xây dựng giao diện ứng dụng Web Responsive & Thời gian thực:**
   * Phát triển giao diện người dùng và cổng quản trị Admin Portal chuyên nghiệp trên nền tảng React 18, Vite, TypeScript và Tailwind CSS.
   * Tích hợp WebSocket STOMP hỗ trợ tương tác trò chuyện trực tiếp giữa khách hàng và tư vấn viên, kết hợp quản lý trạng thái trực tuyến qua Redis Set.

### 1.2.3. Đối tượng và phạm vi nghiên cứu

#### 1.2.3.1. Đối tượng nghiên cứu
* Quy trình nghiệp vụ thương mại điện tử bán lẻ: Quản lý danh mục đa tầng, sản phẩm và biến thể cấu hình (RAM, CPU, Dung lượng), giỏ hàng, quy trình đặt hàng, thanh toán trực tuyến (VNPay/COD), theo dõi tiến trình đơn hàng, quản lý kho và biến động kho.
* Mô hình kiến trúc phần mềm phân tán: Microservices Architecture, API Gateway Pattern, Service Discovery, Database-per-Service [5].
* Cơ chế giao tiếp hướng sự kiện (EDA) và Tính nhất quán dữ liệu: Apache Kafka, Debezium Change Data Capture (CDC), Transactional Outbox Pattern, Saga Pattern (Choreography & Compensation) [10], [13].
* Kỹ thuật In-Memory Caching & Concurrency Control: Redis Data Types (Hash, Set, List, String), Atomic Lua Scripts, Distributed Locks [6].
* Mô hình điều phối quy trình nghiệp vụ: Camunda BPMN 7.20 Workflow Engine [7].
* Công nghệ Trí tuệ nhân tạo: Large Language Models (LLMs), Retrieval-Augmented Generation (RAG) [8], Vector Database (FAISS) [15], Dense Embedding Models (`multilingual-e5-base`) [16], One-Pass NLU JSON Schema [14], Deterministic No-LLM Tool Routing.

#### 1.2.3.2. Đối tượng sử dụng hệ thống
Hệ thống phân chia 04 nhóm tác nhân (Actors) với ranh giới quyền hạn chặt chẽ (RBAC):
* **Khách vãng lai (Guest):** Người dùng chưa đăng nhập hệ thống, được phép duyệt xem danh mục sản phẩm, tìm kiếm thiết bị công nghệ, xem thông số kỹ thuật và đánh giá, thêm sản phẩm vào giỏ hàng phiên ẩn danh (Session Cart) và tương tác với Trợ lý AI Aura để nhận tư vấn cơ bản.
* **Khách hàng / Thành viên (Customer):** Người dùng đã đăng ký và xác thực tài khoản qua hệ thống Keycloak OIDC, quản lý hồ sơ cá nhân và sổ địa chỉ nhận hàng, quản lý giỏ hàng lưu trữ đồng bộ trên Redis, thực hiện đặt hàng, thanh toán trực tuyến, theo dõi tiến trình đơn hàng theo thời gian thực, áp dụng voucher ưu đãi, tích lũy và sử dụng điểm thưởng (Loyalty Points), gửi đánh giá sản phẩm và trò chuyện trực tuyến với nhân viên tư vấn (Staff) hoặc Trợ lý AI Aura.
* **Nhân viên (Staff):** Đảm nhiệm các tác vụ vận hành nghiệp vụ bán lẻ và chăm sóc khách hàng: quản lý danh mục sản phẩm, cấu hình biến thể phần cứng và giá bán, tiếp nhận xử lý và cập nhật tiến trình đơn hàng, theo dõi số lượng tồn kho thực tế, và trực tiếp nhắn tin tư vấn, giải đáp thắc mắc của khách hàng qua phân hệ Live Chat.
* **Quản trị viên hệ thống (Admin):** Nắm quyền quản trị toàn diện hệ thống: quản lý tài khoản người dùng và phân quyền theo vai trò (RBAC) trên Keycloak, thiết lập các quy trình khuyến mãi tự động trên Camunda BPMN, theo dõi số liệu thống kê doanh thu và giám sát tình trạng vận hành của các cụm Microservices.

#### 1.2.3.3. Phạm vi chức năng
Hệ thống bao gồm 11 phân hệ chức năng chính được phân bổ theo ranh giới nghiệp vụ độc lập:
1. *Phân hệ Cổng giao tiếp biên (API Gateway):* Định tuyến thông minh, kiểm tra JWT, đính kèm Header định danh (`X-User-Id`), cache trạng thái người dùng.
2. *Phân hệ Đăng ký & Khám phá dịch vụ (Service Discovery):* Quản lý địa chỉ mạng động và giám sát tình trạng hoạt động của các service qua Eureka Server.
3. *Phân hệ Người dùng & Định danh (User & Identity):* Quản lý hồ sơ cá nhân, sổ địa chỉ, tích lũy điểm thưởng và tích hợp xác thực Keycloak OIDC.
4. *Phân hệ Danh mục & Sản phẩm (Catalog & Product):* Quản lý danh mục đa cấp, sản phẩm công nghệ, biến thể cấu hình phần cứng, đánh giá và Wishlist.
5. *Phân hệ Tồn kho (Inventory):* Quản lý số lượng tồn thực tế/giữ chỗ, thực thi kịch bản Redis Lua trừ kho nguyên tử, quản lý phiếu nhập kho.
6. *Phân hệ Giỏ hàng & Đơn hàng (Cart & Order):* Quản lý giỏ hàng Redis Hash, tính toán đơn hàng, điều phối giao dịch phân tán Saga qua Kafka.
7. *Phân hệ Thanh toán (Payment):* Tích hợp cổng thanh toán trực tuyến VNPay qua Webhook IPN với mã băm bảo mật HMAC-SHA512, thanh toán COD và hoàn tiền.
8. *Phân hệ Khuyến mãi (Promotion):* Động cơ Camunda BPMN tự động cấp phát voucher chào mừng, voucher hạng thẻ và điểm tích lũy.
9. *Phân hệ Thông báo (Notification):* Gửi email biên lai (JavaMail) và gửi push notification qua Firebase Cloud Messaging (FCM).
10. *Phân hệ Tư vấn trực tuyến (Live Chat):* Kênh chat WebSocket STOMP giữa khách hàng và tư vấn viên, theo dõi trạng thái có mặt (Presence Tracking) trên Redis.
11. *Phân hệ Trợ lý ảo AI Aura:* One-Pass NLU, Dual-Pipeline RAG, Cổng Gatekeeper chặn ảo giác, Định tuyến No-LLM cho dữ liệu giao dịch.

#### 1.2.3.4. Phạm vi kỹ thuật
* **Kiến trúc:** Microservices kết hợp Event-Driven Architecture, CQRS cục bộ và Stateless REST/WebSocket APIs.
* **Ngôn ngữ lập trình:** Java 17 (Backend Microservices), Python 3.10+ (AI Services), TypeScript/JavaScript (Frontend Application).
* **Framework & Thư viện:**
  * Backend: Spring Boot 3.x, Spring Cloud 2023 (Gateway, Eureka, OpenFeign), Spring Security OAuth2 Resource Server, Camunda BPMN Engine 7.20, Redisson.
  * AI: FastAPI, PyTorch, FAISS, Transformers, LangChain Core, Sentence-Transformers (`multilingual-e5-base`), DeepSeek API.
  * Frontend: React 18.2, Vite 5.4, Tailwind CSS, Redux Toolkit, STOMP.js / SockJS.
* **Cơ sở dữ liệu & Caching:**
  * RDBMS: MySQL 8.0 & PostgreSQL (Database-per-Service).
  * In-Memory Cache & Key-Value Store: Redis 7.x Cluster.
  * Vector Database: FAISS FlatIP (Inner Product Cosine Similarity).
* **Hạ tầng & Điều phối:** Apache Kafka, Kafka Connect (Debezium CDC Plugin), Keycloak Identity Provider (Dockerized), Docker & Docker Compose.

---

## 1.3. Cơ sở hạ tầng công nghệ và nền tảng phát triển hệ thống

Hệ thống được thiết kế theo mô hình kiến trúc phân tầng chịu lỗi cao, tách bạch rõ ràng ranh giới giữa giao diện người dùng, cổng giao tiếp biên (API Gateway), các dịch vụ vi mô nghiệp vụ và hệ thống lưu trữ/điều phối sự kiện.

### 1.3.1. Kiến trúc phân hệ Frontend và trải nghiệm giao diện người dùng
Phân hệ giao diện của hệ thống được xây dựng trên nền tảng **React 18.2** kết hợp công cụ đóng gói hiện đại **Vite 5.4**. React 18 vận hành dựa trên cơ chế Virtual DOM tối ưu và kiến trúc hướng thành phần (Component-Based), cho phép chia nhỏ mã nguồn thành các khối độc lập, có khả năng tái sử dụng cao. Đồng thời, phiên bản này tích hợp các tính năng tiên tiến như Concurrent Rendering và Automatic Batching, giúp ứng dụng duy trì khả năng phản hồi mượt mà ngay cả khi xử lý các tác vụ phức tạp.

Để đảm bảo tính toàn vẹn kiểu dữ liệu và nâng cao năng suất lập trình, dự án áp dụng ngôn ngữ **TypeScript** kết hợp với hệ sinh thái thư viện chuyên biệt:
* **Tailwind CSS:** Triển khai theo phương pháp Utility-first, cho phép xây dựng giao diện đáp ứng (Responsive Design) mượt mà trên nhiều độ phân giải màn hình, đồng thời tự động loại bỏ các lớp định kiểu dư thừa (PurgeCSS) giúp giảm tối đa dung lượng tải trang.
* **Redux Toolkit & React Context:** Quản lý tập trung các trạng thái toàn cục của ứng dụng như phiên đăng nhập người dùng, thông tin giỏ hàng và danh sách sản phẩm yêu thích (Wishlist).
* **STOMP Client over SockJS:** Thiết lập kết nối hai chiều WebSocket ổn định với Backend (`chat-service`), hỗ trợ cơ chế tự động kết nối lại (Auto-reconnect) khi xảy ra gián đoạn mạng, phục vụ tính năng trò chuyện tư vấn trực tiếp và nhận thông báo biến động đơn hàng theo thời gian thực.

### 1.3.2. Nền tảng Backend Microservices và hạ tầng Spring Cloud
Toàn bộ phần lõi nghiệp vụ của hệ thống được xây dựng trên nền tảng **Java 17** và hệ sinh thái **Spring Boot 3.x**, chia tách thành 8 dịch vụ độc lập kết hợp với các thành phần hạ tầng chuyên dụng của **Spring Cloud**:
* **Spring Cloud Netflix Eureka (`eureka-server`):** Đóng vai trò là trung tâm đăng ký và khám phá dịch vụ (Service Registration & Discovery). Các microservice tự động đăng ký địa chỉ mạng khi khởi động và gửi tín hiệu Heartbeat định kỳ, cho phép các dịch vụ gọi nhau thông qua tên logic thay vì phụ thuộc địa chỉ IP tĩnh.
* **Spring Cloud Gateway (`api-gateway`):** Đóng vai trò là Cổng giao tiếp biên duy nhất tiếp nhận mọi yêu cầu từ phía Client. Gateway chịu trách nhiệm định tuyến thông minh (Dynamic Routing), kiểm tra bảo mật lớp ngoài, giải mã JWT token và đính kèm các Header định danh (`X-User-Id`, `X-User-Roles`) trước khi chuyển tiếp vào mạng nội bộ. Đồng thời, Gateway tích hợp bộ lọc Reactive Redis Cache để cache trạng thái kích hoạt tài khoản người dùng với độ trễ `< 1ms`.
* **Hệ thống xác thực tập trung Keycloak (OIDC / OAuth 2.0):** Quản lý toàn bộ danh tính người dùng và phân quyền RBAC. Mọi microservice bên trong hoạt động như một OAuth2 Resource Server, xác thực yêu cầu dựa trên chữ ký số công khai RSA của Access Token (JWT).

### 1.3.3. Kiến trúc hướng sự kiện (Event-Driven) và mô hình Transactional Outbox
Để đảm bảo tính nhất quán dữ liệu giữa các microservice độc lập mà không làm nghẽn luồng xử lý đồng bộ, hệ thống áp dụng kiến trúc hướng sự kiện (EDA) dựa trên **Apache Kafka** kết hợp với mẫu thiết kế **Transactional Outbox Pattern** [10], [13]:

> **[Khu vực bố trí sơ đồ Transactional Outbox]:**
> * **Mô tả kiến trúc:** Quy trình xử lý gồm 4 bước chuẩn hóa:
>   1. *Transactional Write:* Dịch vụ nghiệp vụ (App Service) thực thi logic và ghi đồng thời dữ liệu vào bảng chính (Main Data Tables) cùng bảng sự kiện hộp thư (Outbox Table) trong cùng một giao dịch cục bộ ACID.
>   2. *Logical Decoding & CDC Read:* Bộ kết nối Debezium Connector đọc nhật ký giao dịch không xâm lấn (Transaction Log: MySQL Binlog / PostgreSQL WAL Log) theo thời gian thực.
>   3. *Routing & Publishing:* Thành phần Event Router SMT (Single Message Transformation) bóc tách payload và tự động định tuyến bản ghi vào các Kafka Topics tương ứng dựa trên trường định danh `aggregate_type`.
>   4. *Event Consumption:* Các dịch vụ tiêu thụ (Consumer Services) tiếp nhận sự kiện từ các Kafka Topics và xử lý nghiệp vụ bất đồng bộ.
> * **Nguồn tham khảo kiến trúc:** Debezium Official Documentation [13], Microservices Patterns (Chris Richardson) [10].

**Hình 1.2: Mô hình Giao dịch Phân tán Transactional Outbox Pattern kết hợp Debezium CDC và Apache Kafka**
*(Nguồn: Tham khảo kiến trúc chuẩn Debezium Outbox Pattern [13])*

* **Apache Kafka:** Nền tảng phân phối thông điệp phân tán với thông lượng cao, khả năng chịu lỗi và lưu trữ bền vững. Kafka đóng vai trò là xương sống kết nối các dịch vụ, cho phép giao tiếp bất đồng bộ, tách rời phụ thuộc trực tiếp giữa các microservices.
* **Mô hình Transactional Outbox kết hợp Debezium CDC:** Giải quyết triệt để bài toán Dual-Write và mất mát sự kiện. Việc kết hợp với Event Router SMT giúp phân loại và chuyển tiếp sự kiện tự động theo chủ đề mà không đòi hỏi viết thêm mã nguồn điều phối phức tạp, đảm bảo phân phối sự kiện ít nhất một lần (At-least-once Delivery).
* **Mô hình điều phối Saga (Saga Choreography):** Điều phối các chuỗi giao dịch phân tán kéo dài qua nhiều microservices (Tạo đơn hàng $\rightarrow$ Giữ chỗ tồn kho $\rightarrow$ Thanh toán). Khi xảy ra sự cố hết hàng hoặc thanh toán thất bại, luồng sự kiện bù trừ (Compensation) tự động được kích hoạt để khôi phục trạng thái kho và hủy đơn, đảm bảo tính nhất quán cuối cùng (Eventual Consistency) trên toàn bộ hệ thống.


### 1.3.4. Cơ sở lý thuyết về bộ nhớ đệm phân tán và kiểm soát đồng thời trên Redis
Hệ thống tận dụng tối đa sức mạnh của **Redis Cluster** để giải quyết các bài toán về độ trễ truy xuất thấp và kiểm soát tranh chấp dữ liệu đồng thời [6]:
* **Các cấu trúc dữ liệu tối ưu trong bộ nhớ:**
  * `Hash`: Lưu trữ dữ liệu giỏ hàng của từng người dùng, hỗ trợ thao tác cập nhật số lượng từng sản phẩm nhanh chóng, giảm thiểu tối đa tải ghi trực tiếp vào cơ sở dữ liệu quan hệ.
  * `String (Atomic)`: Lưu trữ số lượng tồn kho khả dụng của từng biến thể sản phẩm, kết hợp các hàm biến đếm nguyên tử phục vụ kiểm tra và giữ chỗ kho tức thì.
  * `Set`: Quản lý danh sách sản phẩm yêu thích (Wishlist) và danh sách nhân viên tư vấn đang trực tuyến (Presence Tracking), cho phép kiểm tra sự tồn tại phần tử với độ phức tạp $O(1)$.
  * `List`: Lưu trữ lịch sử hội thoại gần nhất phục vụ cơ chế cửa sổ trượt (Sliding Memory Window) của trợ lý ảo AI.
* **Kịch bản thực thi nguyên tử (Atomic Lua Scripts):**
  Thực thi kịch bản kiểm tra và trừ số lượng tồn kho trực tiếp trong một tiến trình duy nhất trên máy chủ Redis. Cơ chế này loại bỏ hoàn toàn hiện tượng Race Condition khi hàng nghìn khách hàng cùng tranh mua một sản phẩm trong các đợt mở bán cao điểm.
* **Khóa phân tán (Distributed Locks):**
  Ứng dụng lệnh gán có điều kiện kèm thời gian sống (TTL) để khóa luồng xử lý cục bộ, chống việc người dùng nhấn đúp tạo đơn hàng trùng lặp và bảo vệ giao dịch thanh toán phân tán.

### 1.3.5. Tự động hóa quy trình nghiệp vụ với Camunda BPMN
Hệ thống nhúng động cơ quy trình **Camunda BPMN 7.20** vào phân hệ khuyến mãi (`promotion-service`) [7]. Camunda cho phép mô hình hóa các quy trình nghiệp vụ phức tạp bằng chuẩn trực quan BPMN 2.0:
* Tự động phát hành voucher chào mừng khi tiếp nhận sự kiện người dùng mới đăng ký.
* Lắng nghe sự kiện đơn hàng thanh toán thành công để tự động tính lũy điểm thưởng và nâng hạng thành viên.
* Tách biệt logic quy trình khuyến mãi ra khỏi mã nguồn ứng dụng, giúp quản trị viên có thể điều chỉnh điều kiện áp dụng hoặc luồng tặng thưởng linh hoạt mà không cần biên dịch lại dịch vụ.

---

## 1.4. Cơ sở lý thuyết về Trí tuệ nhân tạo và Dịch vụ thông minh (AI Services)

Nhằm nâng cao trải nghiệm mua sắm cho khách hàng và tối ưu hóa hiệu quả vận hành kinh doanh, hệ thống tích hợp 03 phân hệ Trí tuệ nhân tạo (AI) độc lập, được phát triển trên nền tảng Python (FastAPI) và kết nối với cụm dịch vụ Spring Boot qua REST API và bộ đệm Redis:
1. **Phân hệ Trợ lý ảo tư vấn thông minh (AI Chatbot):** Hỗ trợ khách hàng tự động, giải đáp chính sách và tra cứu đơn hàng/sản phẩm theo thời gian thực (Trọng tâm nghiên cứu của tác giả).
2. **Phân hệ Tìm kiếm và Gợi ý sản phẩm thông minh (Search & Recommendation):** Tìm kiếm ngữ nghĩa/hình ảnh và đề xuất sản phẩm cá nhân hóa.
3. **Phân hệ Dự báo nhu cầu bán hàng (Sales Forecasting):** Dự báo xu hướng tiêu thụ sản phẩm phục vụ kế hoạch nhập hàng và quản trị chuỗi cung ứng.

### 1.4.1. Phân hệ Trợ lý ảo tư vấn thông minh (AI Chatbot)

#### 1.4.1.1. Mô hình ngôn ngữ lớn (LLM) và Cơ chế hiểu ngôn ngữ tự nhiên (NLU)
Hệ thống sử dụng mô hình ngôn ngữ lớn **DeepSeek-V3 / DeepSeek-Chat** [14] nhờ khả năng suy luận tốt, hiểu sâu ngữ cảnh tiếng Việt và chi phí vận hành tối ưu.

Để xử lý yêu cầu của người dùng một cách chính xác, hệ thống triển khai cơ chế **One-Pass NLU Classifier** dựa trên định dạng dữ liệu có cấu trúc (JSON Schema):
* Trong một lượt xử lý duy nhất (Single Inference Pass), mô hình đồng thời phân tích ý định của người dùng (`intent`), đánh giá cảm xúc (`sentiment`), trích xuất mã đơn hàng (`order_id`) và xác định chủ đề hội thoại.
* Phương pháp này thay thế các bước xử lý ngôn ngữ tự nhiên tuần tự truyền thống, giúp giảm thiểu độ trễ phản hồi và đảm bảo dữ liệu đầu ra luôn chuẩn xác để hệ thống backend tiếp nhận.

#### 1.4.1.2. Kỹ thuật Tăng cường Tri thức Bằng Truy xuất (RAG) và Cơ sở dữ liệu Vector
Trong lĩnh vực thương mại điện tử, câu trả lời của trợ lý ảo đòi hỏi tính xác thực tuyệt đối về giá cả, cấu hình kỹ thuật và chính sách bán hàng. Hệ thống ứng dụng kỹ thuật **Tăng cường Tri thức Bằng Truy xuất (Retrieval-Augmented Generation - RAG)** [8] kết hợp nguồn dữ liệu đa dạng:

> **[Khu vực bố trí sơ đồ Multi-Source Knowledge Base]:**
> * **Mô tả kiến trúc:** Kiến trúc tích hợp tri thức gồm 3 thành phần chính: Khách hàng tương tác và nhận thông tin phản hồi trực quan (Rich Card UI); Bộ điều phối hội thoại trung tâm (Aura Dialogue Engine); Nguồn tri thức đa tầng kết hợp giữa CSDL Vector FAISS (chính sách), CSDL Sản phẩm thời gian thực (product-service) và Dữ liệu giao dịch người dùng (đơn hàng, voucher, điểm thưởng).
> * **File sơ đồ dự án có sẵn:** [co_so_tri_thuc_da_nguon_chatbot.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/co_so_tri_thuc_da_nguon_chatbot.puml)
> * 🔗 **Xem trực tuyến trên VPasCode:** [Mở sơ đồ Multi-Source Knowledge Base](https://www.vpascode.com/editor/#plantuml:hLPTRnl75NtdhpYb08LIHKUKI4bKa23ayaECP8eGbqw1g136k-FT0PUpxEoiBRKeaBH0sY8883TFAfh6TA32QkkcGGCKuGBDmmhw7vDVKiykALEo_5AP3mjYPlQUEUVUU-w-7qWYP3ZmOFa7WNyW1JkGRcWTsEI0Ew7F3ooNoFk-pFn4kdH0CVG8uvcWp_YG23B0VMBr7U67t3PypnUOQoI_cHCsVK12JpPyBjjaG97jKiUdwBMoIwW8Hhmb18G7-O0Azc3clKbGmQb0eJYp4RZ4zXynxa2AaCvi427yHwRBh3wdGO2LwrkJ6nRNIwMrScOMYbgISCUZ-5K60AglaDfeL1f6kkSBcuh9-bfnlRXHJTOrlydgSgEmlbAvNEsoNr8KLZA_deMqYIJtIV1wn5J6Ln5NrzOQXUk8XNgXMgpUXFWMtlq_VvctS7wiej-tjpQnlHL_OcnXA_wutSJRQ3Sllb7HdrkenIVjvcqmNYgV1HONjzruPBbmuoVSqJZEnRzKz2M37N_FdSL5O9_dcepui9cAViVn8RsFjw6YPzo1hQ9Jxg36SFvOHIVSMSY21EW5L62kNgkN6_LtFCRfvhgnMgdNtf7qK6uMZKAjNBgbJEPUhzs46V_cxYOglRqAQgtApcwpLqUztMorwszGeAgAJZ28HqSuFsOg-YJ4q5NHOuOj5PqmIDTNun539HHa8fV-2vC4_VokO9HBQgF6YESx8KMTEupJXNt-uyTFqN7ZfnnU6Y3-Cb7nC-wYlTD3RfVJV8S40GoF105xmAYOlAPhH1-JuP4Q_y3HzlCxEtSnZrf8lFnUfOaE6r8jV9AE519pzNfZfT584r9i5DVgfJGXaqg-PKBK-A_j9cgwIl_KsjJYV0fpIqN7xIQCYoVegkWlCFTQoU8p0-V75RIRFHNziNqRv26n-iIXo1eN8mGg-Wgcq4bHqPdrGYW2xeGg-e8dIcnN3moVIyAqmUb-hzQhgHwrylhwybggHtcbkBnSdxX4yhXqZad7-BCWXXi_vou2tKPf0ImkTbm6IurFGqWHZwt5nNsUp-VJx9dn4mPFDrE8kqJqRVyHX-6BOHYa1mnNHN_0G4Md5XgLLhUBUzIIla2jcXuOX9va7dl1Z7XvMihhgoNyEhx7hAFjAkOQfSRgDDStDDzhc5rgM5FHDzCxTjNuQwvhVdmscF8ptSGZ74Pu8iEtLobsX6-7baINYeVCeiXjRYnlb2VLQn2fUm4suUw4fQl6eqIluRJ02RmaRGuyDJuzGdT8hG0vezDRmbxbRkep4vY4xtAZFEMxlB9HDDPJlilhfVB6Q_dEqamzJaMVlSpYh3LUuRUhfyDIudDB-XO3NpAVJz8h22mLdOKuVtmnukdRIxZdXvPBHNgcgiPV-nYeyNE93puqyLFKw0FA0vfdF5-ZG-ac_4n1UA3PrOr6hL6Qi2kLrzRA4tPhnVfgzTOpPoVfmYQQhSekp9OQ_xU3UxgDt-3KIMP2_gEvr7YMvFIJuTsLd-VVcrhK9h8et84fmYCyLEDJ3kx4t-cdJfHKqRVWBel_nf4xNCXc9c_bFvfBHRaUDS7KCLVkeECcPUogw0js9L8_VZQ0wQfn12bq9UCN8U786KJOwBKMicz8N3F-N8zp5JtjpDfWglFgr0frv_qJEoqLVTgx7MxXpiGEi5sTKIerW-jANHg7LYkH_p1KurE9Tg8yTzppCu9Q_EH8pwZnVwnzdglfWaMN3WYNpC8UbOBHXyHRo6Okmzq8k6IJmANsjRoV7-ino25VEgiruwomt52DppWEuv56D_rXlWJ33Na_UD4_oMZ-xI3Dh6GyJPlE-yIAheYGEiGh8bpQIQ92_8y1-aoDVnZ0LD7VqNVZVnFCmtH35PrOaFfo-potGm-PHJpCeq6938NMX0ZBrJfSHhmHz6OXJ3V-ZZlQXn-ZhwBl8JNpvnBpQB9ub8XprNltUMwF4YylsO1Ed78UE-mXHKSmYwPQhDv9_OHOsgkkwN5Z-qpjHr-ggQBF6OpaPfQAJl6pU6HDlrUIOf1K31XdWQu5q_SzjBX30usraCrCGzs8zHePX2u71zADH-n6BrrwcNLNVxH-nPrzdlkWkzj6XnnvFh6HVmzxbDjKGBUp5k9zokrmu6N-1m00)

**Hình 1.3: Sơ đồ Kiến trúc Tích hợp Cơ sở Tri thức Đa nguồn của Trợ lý AI Aura**

Quy trình tăng cường tri thức được chia thành 02 luồng dữ liệu song song:
* **Tra cứu văn bản chính sách (Policy RAG):** Các quy định bảo hành, vận chuyển, đổi trả được chia nhỏ thành các đoạn ngắn (chunks), mã hóa thành vector 768 chiều bằng mô hình `multilingual-e5-base` [16] và lưu trữ trong cơ sở dữ liệu vector **FAISS** [15]. Khi người dùng hỏi, hệ thống tìm kiếm Top-5 đoạn văn bản có độ tương đồng ngữ nghĩa cao nhất để đưa vào ngữ cảnh cho mô hình ngôn ngữ lớn.
* **Tra cứu thông tin sản phẩm thời gian thực (Product RAG):** Đối với các câu hỏi về thông số kỹ thuật (RAM, chip, pin) hoặc giá bán sản phẩm, hệ thống gọi API nội bộ tới `product-service` để truy vấn trực tiếp từ cơ sở dữ liệu, đảm bảo thông tin luôn chính xác và cập nhật tại thời điểm trò chuyện.

#### 1.4.1.3. Kiểm soát độ tin cậy tri thức và Phản hồi trực tiếp không qua LLM
Để loại bỏ hiện tượng mô hình tự sinh thông tin sai lệch (ảo giác / hallucination) [11] và đảm bảo an toàn hệ thống [12], phân hệ triển khai cơ chế kiểm soát đa tầng:
* **Cổng kiểm soát độ tin cậy (Confidence Gatekeeper):** Dựa vào điểm số tương đồng ngữ nghĩa khi tìm kiếm tài liệu từ FAISS để quyết định hành động:
  * Điểm tương đồng cao: Đưa nội dung tài liệu vào ngữ cảnh để mô hình ngôn ngữ sinh câu trả lời tự nhiên.
  * Điểm tương đồng trung bình: Tự động bổ sung lời nhắc người dùng câu trả lời mang tính chất tham khảo.
  * Điểm tương đồng thấp (không tìm thấy thông tin phù hợp): Chủ động ngắt gọi mô hình ngôn ngữ lớn (Hard Stop), trả về thông báo hướng dẫn liên hệ tổng đài hoặc tư vấn viên, giúp triệt tiêu nguy cơ trả lời sai lệch và tiết kiệm chi phí gọi API.
* **Phản hồi trực tiếp không qua LLM (Deterministic No-LLM Routing):** Với các câu hỏi tra cứu dữ liệu cá nhân (trạng thái đơn hàng, danh sách mã giảm giá, điểm thưởng tích lũy), hệ thống định tuyến gọi thẳng API Backend và đóng gói kết quả thành **Thẻ giao diện trực quan (Rich Card UI)** gửi về giao diện người dùng với thời gian phản hồi nhanh (<250ms), loại bỏ hoàn toàn nguy cơ rò rỉ dữ liệu hoặc tấn công Prompt Injection [12].
* **Lưu trữ ngữ cảnh hội thoại:** Lịch sử trò chuyện gần nhất được lưu tạm thời trên Redis theo cơ chế cửa sổ trượt (Sliding Window), giúp duy trì mạch hội thoại tự nhiên mà không làm tràn giới hạn bộ nhớ của mô hình.

### 1.4.2. Phân hệ Tìm kiếm và Gợi ý sản phẩm thông minh (Search & Recommendation System)
...

### 1.4.3. Phân hệ Dự báo nhu cầu bán hàng và Quản trị chuỗi cung ứng (Sales Forecasting System)
...

---

## 1.5. Phương pháp tiếp cận và Bố cục đồ án

### 1.5.1. Phương pháp nghiên cứu và quy trình phát triển hệ thống
Nhằm hoàn thành khối lượng công việc lớn của một hệ sinh thái phân tán kết hợp AI, đề tài áp dụng phương pháp luận nghiên cứu khoa học kết hợp quy trình phát triển phần mềm lặp **Agile/Scrum** [17]:

#### 1.5.1.1. Phương pháp nghiên cứu tài liệu và phân tích đối sánh
* **Nghiên cứu công nghệ nền tảng:** Phân tích tài liệu kỹ thuật chính thống và các nghiên cứu khoa học về kiến trúc Microservices (Spring Cloud) [5], cơ chế bất đồng bộ của Apache Kafka, các mẫu thiết kế Outbox Pattern, Saga Pattern [10], mô hình phân tán Redis [6], cơ chế tối ưu hóa câu truy vấn của FAISS [15] và các kỹ thuật căn chỉnh prompt/schema trên mô hình ngôn ngữ lớn [14].
* **Khảo sát và đối sánh thực tế:** Khảo sát các sàn thương mại điện tử lớn tại Việt Nam (Shopee, Tiki, Thế Giới Di Động, FPT Shop) về luồng đặt hàng, cách thức tổ chức biến thể sản phẩm, phương thức phân loại voucher và cơ chế chat trực tuyến, từ đó định hình các tính năng khác biệt và tối ưu cho đề tài.
* **Mô hình hóa hệ thống:** Ứng dụng ngôn ngữ mô hình hóa thống nhất (UML 2.5) [18] để xây dựng chi tiết các biểu đồ Ca sử dụng (Use Case), biểu đồ Lớp thực thể (Class Diagram), biểu đồ Tuần tự (Sequence Diagram), biểu đồ Chuyển trạng thái (State Diagram) và biểu đồ Kiến trúc gói (Package Diagram).

#### 1.5.1.2. Quy trình phát triển lặp theo mô hình Agile/Scrum
Quá trình xây dựng hệ thống được chia thành 04 giai đoạn (Sprints) nối tiếp nhau, mỗi Sprint kéo dài từ 2 đến 3 tuần với mục tiêu và sản phẩm bàn giao định lượng [17]:

**Bảng 1.1: Kế hoạch triển khai hệ thống theo các chu kỳ Sprint (Agile/Scrum Roadmap)**

| Chu kỳ (Sprint) | Thời lượng | Nội dung công việc thực hiện chính | Kết quả đạt được (Deliverables) |
| :---: | :---: | :--- | :--- |
| **Sprint 1: Nền tảng hạ tầng & Danh mục** | 3 tuần | • Khởi tạo hạ tầng: Eureka Server, API Gateway, Keycloak Identity.<br>• Thiết kế CSDL quan hệ cho các service cốt lõi.<br>• Hiện thực hóa `product-service`, `user-service`.<br>• Dựng khung giao diện người dùng React 18 + Vite + Tailwind CSS. | • Cụm Spring Cloud hoạt động ổn định.<br>• Đăng nhập SSO và phân quyền RBAC qua Keycloak.<br>• Hiển thị danh mục và chi tiết sản phẩm đa biến thể. |
| **Sprint 2: Đơn hàng, Tồn kho & Saga Kafka** | 3 tuần | • Xây dựng `inventory-service` tích hợp Redis Lua Script trừ kho.<br>• Xây dựng `order-service` với giỏ hàng Redis Hash.<br>• Tích hợp Apache Kafka và Debezium CDC Transactional Outbox.<br>• Xây dựng `payment-service` tích hợp cổng VNPay và xử lý IPN.<br>• Hoàn thiện luồng Saga Choreography xử lý đặt hàng. | • Luồng tạo đơn hàng, trừ kho, thanh toán VNPay và hoàn tác Saga hoạt động trơn tru 100%.<br>• Dòng thời gian Saga hiển thị trực quan trên Admin Portal. |
| **Sprint 3: Khuyến mãi Camunda, Chat & Push**| 2 tuần | • Nhúng Camunda BPMN vào `promotion-service`, thiết lập quy trình voucher.<br>• Xây dựng `chat-service` qua WebSocket STOMP, quản lý Presence trên Redis.<br>• Xây dựng `notification-service` kết nối Kafka gửi email và Firebase Push. | • Tự động hóa phát voucher và tích lũy Loyalty Points.<br>• Kênh Chat trực tuyến giữa Khách và Nhân viên thông suốt.<br>• Hệ thống gửi email biên lai và thông báo đơn tức thời. |
| **Sprint 4: Tích hợp AI Services & Đóng gói** | 3 tuần | • Phát triển `chatbot-service` (Aura Engine, NLU, Dual-RAG, Gatekeeper, No-LLM).<br>• Phát triển `search-service` (Semantic & Visual Search) và `recs-service`.<br>• Tích hợp giao diện Chatbot Widget và Rich Card UI lên Frontend.<br>• Kiểm thử chịu tải, kiểm thử bảo mật và đóng gói Docker Compose. | • Trợ lý AI Aura hoạt động hoàn hảo, chặn 100% ảo giác.<br>• Tìm kiếm ngữ nghĩa/hình ảnh và gợi ý sản phẩm đi vào vận hành.<br>• Đóng gói toàn bộ hệ thống bằng Docker sẵn sàng bảo vệ đồ án. |

#### 1.5.1.3. Phương pháp kiểm thử và cơ chế triển khai
* **Kiểm thử tự động (Automated Testing) [19]:** Viết Unit Test và Integration Test bằng JUnit 5 và Mockito cho các tầng Controller, Service và Repository của Spring Boot; sử dụng Pytest kiểm thử các Endpoint của AI Services; kiểm thử các hàm xử lý dữ liệu và kịch bản Lua Script trên Redis.
* **Kiểm thử thủ công (Manual Testing & End-to-End Testing):** Thực nghiệm các kịch bản mua hàng phức tạp, thanh toán VNPay thực tế qua môi trường Sandbox, mô phỏng hủy đơn để kiểm tra quy trình bù trừ kho (Saga Compensation), kiểm thử độ chịu lỗi khi ngắt đột ngột một Microservice.
* **Cơ chế triển khai (Containerization & Deployment) [20]:** Toàn bộ các thành phần của hệ thống (Microservices, Kafka, Zookeeper, Kafka Connect, Redis, Keycloak, MySQL, PostgreSQL, AI Services) đều được container hóa bằng **Docker** và điều phối triển khai thông qua các tệp `docker-compose.yml`, đảm bảo tính nhất quán giữa môi trường phát triển và môi trường chạy thử nghiệm.

### 1.5.2. Cấu trúc và nội dung các chương của đồ án
Báo cáo đồ án tốt nghiệp được kết cấu thành 05 chương chính theo đúng quy chuẩn học thuật:

* **Chương 1: Tổng quan về bài toán và cơ sở lý thuyết**
  Trình bày bối cảnh bài toán, các hướng tiếp cận liên quan, mục tiêu nghiên cứu, phạm vi đề tài và cơ sở lý thuyết nền tảng về kiến trúc Microservices, giao tiếp hướng sự kiện cùng các phân hệ Trí tuệ nhân tạo.

* **Chương 2: Phân tích yêu cầu và thiết kế hệ thống**
  Đặc tả các yêu cầu chức năng và phi chức năng, xây dựng mô hình các ca sử dụng (Use Case), thiết kế kiến trúc phân rã các dịch vụ và mô hình dữ liệu tổng thể của hệ thống.

* **Chương 3: Các giải pháp kỹ thuật trọng tâm và tích hợp Trí tuệ nhân tạo**
  Mô tả chi tiết các giải pháp kỹ thuật cốt lõi (điều phối giao dịch phân tán, quản lý tồn kho, kiểm soát tương tranh) và phương thức hiện thực hóa, tích hợp các phân hệ Trí tuệ nhân tạo (Trợ lý ảo AI Chatbot, Tìm kiếm & Gợi ý sản phẩm, Dự báo bán hàng).

* **Chương 4: Xây dựng, triển khai và kiểm thử hệ thống**
  Trình bày quá trình xây dựng mã nguồn thực tế, triển khai hệ thống thông qua Docker container, minh họa các màn hình giao diện chính và báo cáo kết quả kiểm thử chức năng, phi chức năng.

* **Chương 5: Kết luận, đánh giá giới hạn và đề xuất hướng phát triển**
  Tổng kết các kết quả khoa học và thực tiễn đã đạt được của đề tài, đánh giá các giới hạn còn tồn tại và đề xuất định hướng phát triển trong tương lai. Danh mục tài liệu tham khảo được đặt sau phần nội dung chính.

---

## TÀI LIỆU THAM KHẢO (REFERENCES)

[1] P. C. Verhoef et al., "Digital transformation: A multidisciplinary reflection and research agenda," *Journal of Business Research*, vol. 122, pp. 889–901, Jan. 2021. DOI: [10.1016/j.jbusres.2019.09.022](https://doi.org/10.1016/j.jbusres.2019.09.022).

[2] K. Laudon and C. Traver, *E-Commerce 2023: Business, Technology, Society*, 17th ed., London: Pearson, 2023.

[3] Thủ tướng Chính phủ, "Quyết định số 645/QĐ-TTg ngày 15/05/2020 phê duyệt Kế hoạch tổng thể phát triển thương mại điện tử quốc gia giai đoạn 2021–2025," Cổng Thông tin điện tử Chính phủ nước CHXHCN Việt Nam, 2020. [Online]. Available: [https://vanban.chinhphu.vn](https://vanban.chinhphu.vn).

[4] Google, Temasek, and Bain & Company, "e-Conomy SEA 2024: Profitable Growth in Vietnam & Southeast Asia," *Bain & Company Industry Reports*, Nov. 2024. [Online]. Available: [https://www.bain.com/insights/e-conomy-sea-2024/](https://www.bain.com/insights/e-conomy-sea-2024/).

[5] S. Newman, *Building Microservices: Designing Fine-Grained Systems*, 2nd ed., Sebastopol, CA: O'Reilly Media, 2021.

[6] J. L. Carlson, *Redis in Action*, Shelter Island, NY: Manning Publications, 2013.

[7] B. Rücker, *Practical Process Automation: Orchestration and Integration in Microservices and Cloud-Native Architectures*, Sebastopol, CA: O'Reilly Media, 2021.

[8] P. Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks," in *Advances in Neural Information Processing Systems (NeurIPS 2020)*, vol. 33, pp. 9459–9474, Dec. 2020. [Online]. Available: [https://arxiv.org/abs/2005.11401](https://arxiv.org/abs/2005.11401).

[9] F. Ricci, L. Rokach, and B. Shapira, *Recommender Systems Handbook*, 3rd ed., New York, NY: Springer, 2022. DOI: [10.1007/978-1-0716-2197-4](https://doi.org/10.1007/978-1-0716-2197-4).

[10] C. Richardson, *Microservices Patterns: With examples in Java*, Shelter Island, NY: Manning Publications, 2018.

[11] Z. Ji et al., "Survey of Hallucination in Natural Language Generation," *ACM Computing Surveys*, vol. 55, no. 12, pp. 1–38, Mar. 2023. DOI: [10.1145/3571730](https://doi.org/10.1145/3571730).

[12] OWASP Foundation, "OWASP Top 10 for Large Language Model Applications v2.0," *Open Web Application Security Project*, Oct. 2023. [Online]. Available: [https://owasp.org/www-project-top-10-for-large-language-model-applications/](https://owasp.org/www-project-top-10-for-large-language-model-applications/).

[13] Debezium Community, "Debezium User Guide: Outbox Event Router & MySQL CDC Connector," *Red Hat / Debezium Docs*, 2024. [Online]. Available: [https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html).

[14] DeepSeek-AI, "DeepSeek-V3 Technical Report," *arXiv preprint arXiv:2412.19437*, Dec. 2024. [Online]. Available: [https://arxiv.org/abs/2412.19437](https://arxiv.org/abs/2412.19437).

[15] J. Johnson, M. Douze, and H. Jégou, "Billion-scale similarity search with GPUs," *IEEE Transactions on Big Data*, vol. 7, no. 3, pp. 535–547, July 2021. DOI: [10.1109/TBDATA.2019.2921572](https://doi.org/10.1109/TBDATA.2019.2921572).

[16] L. Wang et al., "Text Embeddings by Weakly-Supervised Contrastive Pre-training," *arXiv preprint arXiv:2212.03533*, Dec. 2022. [Online]. Available: [https://arxiv.org/abs/2212.03533](https://arxiv.org/abs/2212.03533).

[17] K. Schwaber and M. Beedle, *Agile Software Development with Scrum*, Upper Saddle River, NJ: Prentice Hall, 2002.

[18] Object Management Group (OMG), "Unified Modeling Language (OMG UML) Version 2.5.1 Specification," *OMG Formal Specifications*, Dec. 2017. [Online]. Available: [https://www.omg.org/spec/UML/2.5.1](https://www.omg.org/spec/UML/2.5.1).

[19] P. Hamill, *Unit Test Frameworks: Tools for High-Quality Software Development*, Sebastopol, CA: O'Reilly Media, 2004.

[20] D. Merkel, "Docker: Lightweight Linux Containers for Consistent Development and Deployment," *Linux Journal*, vol. 2014, no. 239, Mar. 2014.
