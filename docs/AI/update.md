Tổng hợp từ toàn bộ các bài nghiên cứu học thuật (UEH, QAAA Lab, IJCA, ResearchGate) và các bài triển khai thực tế (Viblo, VTI, Renewator), mỗi tài liệu giải quyết một mảnh ghép riêng (bài thì mạnh về định nghĩa dữ liệu RFM, bài thì chuyên sâu về xử lý mất cân bằng dữ liệu hoặc chọn thuật toán).

Khi ráp nối các điểm mạnh nhất lại, quy trình chuẩn mực nhất (Best Practice) để xây dựng hệ thống AI dự đoán khách hàng rời bỏ (Churn Prediction) trong Thương mại điện tử gồm **5 giai đoạn cốt lõi** dưới đây.

---

### Sơ đồ Kiến trúc Pipeline Tổng thể

Sơ đồ dưới đây mô hình hóa luồng đi của dữ liệu từ Database giao dịch thô cho đến khi ra quyết định giữ chân khách hàng tự động. Bạn có thể bấm vào từng bước để xem chi tiết kỹ thuật:

---

### Chi tiết 5 bước triển khai chuẩn nhất

```
*   **Chọn điểm mốc (Cutoff Date - $T_0$):** Ví dụ lùi về 60 ngày trước so với hôm nay.
*   **Cửa sổ quan sát (Observation Window):** Từ $T_0$ lùi về trước 6 tháng (dùng để rút trích đặc trưng hành vi của khách).
*   **Cửa sổ dự đoán (Prediction Window):** Từ $T_0$ tiến về phía trước $X$ ngày (ví dụ 30 hoặc 60 ngày). Nếu trong khoảng $X$ ngày này khách **không phát sinh đơn hàng** (hoặc không login), gán nhãn `Churn = 1`, ngược lại `Churn = 0`.
*   **Cách chọn $X$ chuẩn (theo bài nghiên cứu UEH & VTI):** Vẽ biểu đồ phân phối khoảng cách giữa 2 lần mua hàng liên tiếp của toàn bộ khách hàng. Lấy mốc **Percentile thứ 85 hoặc 90** (ví dụ: 90% khách hàng quay lại mua trong vòng 45 ngày $\rightarrow$ Đặt $X = 45$ ngày).

```

```
1.  **Nhóm RFM (Giao dịch cốt lõi):**
    *   `Recency`: Số ngày từ đơn hàng thành công cuối cùng đến mốc $T_0$.
    *   `Frequency`: Tổng số đơn hàng trong 3 tháng / 6 tháng gần nhất.
    *   `Monetary`: Tổng tiền chi tiêu và Giá trị đơn hàng trung bình (AOV).
2.  **Nhóm Động lượng / Xu hướng (Velocity Features - Rất quan trọng):**
    *   Tỷ lệ tần suất mua của 30 ngày gần nhất chia cho trung bình 90 ngày trước đó. Nếu tỷ lệ này giảm mạnh (nhỏ hơn 0.5), khách đang giảm dần sự quan tâm.
    *   Khoảng cách trung bình giữa các lần mua (Inter-purchase time) đang giãn ra hay thu hẹp lại.
3.  **Nhóm Hành vi Tương tác (Clickstream / Session):**
    *   Số lần mở app/web trong 14 ngày qua, thời gian trung bình mỗi phiên (Session duration).
    *   **Tỷ lệ bỏ giỏ hàng (Cart Abandonment Rate):** Số lần thêm vào giỏ nhưng không thanh toán.
4.  **Nhóm Trải nghiệm & Ma sát dịch vụ (Service Friction):**
    *   Tỷ lệ đơn hàng bị hủy, hoàn trả (Return/Refund rate) hoặc giao hàng trễ trong 3 đơn gần nhất.
    *   Số lần đánh giá 1-2 sao hoặc số ticket khiếu nại CSKH. (Khách vừa gặp trải nghiệm tệ có nguy cơ rời bỏ tăng vọt ngay lập tức).

```

```
*   **Chia tập dữ liệu theo thời gian (Out-of-time Split):** Không dùng `train_test_split` ngẫu nhiên thông thường. Hãy dùng dữ liệu tháng 1-6 để Train, và trượt sang tháng 2-7 để Test nhằm mô phỏng đúng thực tế dự đoán tương lai.
*   **Chuẩn hóa chống nhiễu:** Dùng `RobustScaler` hoặc biến đổi hàm `Log1p` cho các cột tiền tệ (`Monetary`) để các tài khoản mua buôn không làm lệch trọng số mô hình.
*   **Xử lý mất cân bằng:** 
    *   Với dữ liệu vừa phải (nhỏ hơn 100.000 dòng): Áp dụng **SMOTE** (sinh mẫu nhân tạo cho lớp thiểu số) *chỉ trên tập Train*.
    *   Với dữ liệu lớn (hàng trăm nghìn dòng như bài toán của QAAA Lab): Không dùng SMOTE vì tốn RAM và dễ sinh nhiễu; thay vào đó hãy điều chỉnh tham số trọng số phạt trực tiếp trong thuật toán (như `scale_pos_weight` trong XGBoost/LightGBM) hoặc huấn luyện phân tầng (Under-sampling lớp đa số kết hợp Ensemble).

```

```
*   **Thuật toán chuẩn nhất:** Sử dụng **LightGBM** hoặc **XGBoost** (hoặc **CatBoost** nếu có nhiều biến phân loại như *Danh mục ngành hàng yêu thích, Tỉnh/Thành phố*).
*   **Thước đo đánh giá (Metrics):** Tuyệt đối **không dùng Accuracy** (vì nếu 90% khách không rời bỏ, mô hình đoán tất cả không rời bỏ vẫn đạt 90% Accuracy nhưng vô dụng). Phải tối ưu hóa **Recall** (bắt được tối đa số khách sắp bỏ đi), **F1-Score** và **PR-AUC** (Precision-Recall AUC).
*   **Giải thích mô hình bằng SHAP (Explainable AI):** Đừng chỉ xuất ra con số "Khách hàng A có 85% nguy cơ rời bỏ". Hãy gắn thư viện `SHAP` vào LightGBM/XGBoost để trích xuất **Top lý do** khiến điểm số của khách đó cao (ví dụ: *Do `Return_Rate` cao* hay *Do `Recency` quá lâu*), phục vụ cho bước chăm sóc khách hàng.

```

```
*   **Nhóm 1: Nguy cơ rời bỏ CAO + Chi tiêu CAO (VIP sắp mất):** Nhóm ưu tiên số 1. Dựa vào chỉ số SHAP ở Bước 4 — nếu rời bỏ vì phí ship/giá, tự động gửi Voucher Freeship/Giảm giá sâu; nếu rời bỏ vì vừa có đơn hoàn trả/đánh giá 1 sao, đẩy cảnh báo sang hệ thống CRM để CSKH chủ động nhắn tin/gọi điện xin lỗi và tặng quà đền bù.
*   **Nhóm 2: Nguy cơ rời bỏ CAO + Chi tiêu THẤP:** Chỉ sử dụng các kênh chi phí bằng 0 (Zero-cost channels) như gửi Email tự động, App Push Notification nhắc nhở giỏ hàng hoặc gợi ý sản phẩm đang Flash Sale.
*   **Nhóm 3: Nguy cơ rời bỏ THẤP + Chi tiêu CAO:** Tuyệt đối không gửi voucher giảm giá tự phát (tránh lãng phí biên lợi nhuận vì họ vẫn đang mua đều), chỉ duy trì tích điểm thành viên (Loyalty program).

```

---

### Bảng đối chiếu: Phương pháp Nghiệp dư vs. Phương pháp Chuẩn (Production-Ready)

| Hạng mục | Cách làm phổ biến (Dễ sai sót) | Cách làm chuẩn tổng hợp từ nghiên cứu |
| --- | --- | --- |
| **Gán nhãn dữ liệu** | Lấy toàn bộ lịch sử đến hôm nay, ai lâu không mua thì gán nhãn Churn (Gây **Data Leakage** 100%). | Dùng **Sliding Window**: Chia tách rõ rệt quá khứ (Observation) và tương lai (Prediction) tại mốc $T_0$. |
| **Đặc trưng (Features)** | Chỉ dùng số liệu tổng cố định (Tổng đơn, Tổng tiền từ lúc đăng ký). | Dùng đặc trưng **Động lượng (Velocity)** & **Trải nghiệm xấu** (Tỷ lệ hủy đơn, hoàn hàng, bỏ giỏ hàng). |
| **Chia tập Train/Test** | Chia ngẫu nhiên (`Random Split` 80/20). | Chia theo thời gian (**Time-based Split**) để kiểm tra độ bền của mô hình trước xu hướng mùa vụ. |
| **Lựa chọn Thuật toán** | Cố dùng mạng Deep Learning phức tạp, tốn tài nguyên nhưng dễ Overfitting. | Dùng **LightGBM / XGBoost** kết hợp **SHAP Values** để vừa nhẹ, vừa biết chính xác *tại sao* khách rời đi. |
| **Đầu ra hệ thống** | Xuất file Excel danh sách khách hàng rủi ro mỗi tháng 1 lần. | Chạy **Batch Job định kỳ mỗi đêm** (hoặc Event-driven sau khi khách hủy đơn), bắn sự kiện sang Notification/Promotion Service. |


Bạn đã chạm đúng vào **"điểm mù"** lớn nhất của các mô hình truyền thống (như RFM hay bảng dữ liệu tĩnh).

Nếu chỉ gom dữ liệu thành các con số tổng hợp (như *tổng 5 đơn hàng, hủy 1 đơn*), mô hình sẽ coi hai khách hàng sau là **giống hệt nhau**:

* **Khách hàng A:** Hủy đơn đầu tiên (do chưa biết cách áp mã), sau đó mua liên tiếp 4 đơn thành công $\rightarrow$ **Đang rất gắn bó**.
* **Khách hàng B:** Mua 4 đơn đầu rất suôn sẻ, nhưng đơn thứ 5 bị giao trễ, yêu cầu hoàn tiền rồi ngừng mở app $\rightarrow$ **Nguy cơ rời bỏ 95%**.

Chính **trình tự nhân - quả của chuỗi sự kiện (Event Sequence)** và **khoảng thời gian trôi qua giữa chúng (Time-delta)** mới là nơi chứa tín hiệu dự đoán thực sự. Trong kiến trúc hệ thống và AI hiện đại, bài toán này được giải quyết bằng cách chuyển từ **Dữ liệu Bảng (Tabular)** sang **Chuỗi sự kiện (Sequential Event Modeling)**.

---

### Mô phỏng: Sự khác biệt khi theo dõi Chuỗi sự kiện theo thời gian thực

Biểu đồ dưới đây minh họa cách điểm rủi ro rời bỏ (Churn Risk Score) biến động tức thời theo từng mắt xích sự kiện liên kết từ các phân hệ khác nhau (App, Order, Shipping, CSKH):

---

### Làm sao để "Liên kết dữ liệu" và "Dự đoán theo chuỗi" trong thực tế?

Để biến tư duy của bạn thành một hệ thống chạy thực tế, kiến trúc cần giải quyết 2 bài toán: **Hợp nhất luồng sự kiện (Data Linking)** ở tầng Backend và **Mô hình hóa chuỗi (Sequential AI)** ở tầng Machine Learning.

#### 1. Tầng Kiến trúc Dữ liệu: Hợp nhất thành "Unified Event Log"

Trong một hệ thống thương mại điện tử (đặc biệt là kiến trúc phân tán / Microservices), dữ liệu của một khách hàng bị xé lẻ ở nhiều nơi:

* **Tracking / Frontend:** Lịch sử click, tìm kiếm, thêm vào giỏ (`Clickstream`).
* **Order & Payment Service:** Tạo đơn, thanh toán lỗi, hủy đơn.
* **Logistics / Fulfillment Service:** Giao hàng trễ, kẹt ở kho phân loại.
* **Review & CSKH Service:** Đánh giá 1 sao, mở khiếu nại hoàn tiền.

Nếu để các database này rời rạc, AI sẽ bị "mù" ngữ cảnh. Cách chuẩn nhất để liên kết chúng là thiết kế một **Event Pipeline (qua Message Broker như Kafka hoặc RabbitMQ)**:

* Mỗi khi có bất kỳ hành động nào xảy ra ở các service, một Event chuẩn hóa được bắn ra với cấu trúc chung:
`[User_ID] + [Timestamp] + [Event_Type] + [Context_Metadata (Giá trị, Mã lỗi, Thời gian trễ...)]`
* Các sự kiện này được gom về một kho tập trung, sắp xếp theo đúng thứ tự thời gian (`Timestamp`) của từng `User_ID` và nối kết bằng một `Correlation_ID` hoặc `Session_ID`. Lúc này, mỗi khách hàng không còn là 1 dòng dữ liệu tĩnh nữa, mà là một **cuốn nhật ký hành trình (User Journey Stream)** liên tục.

#### 2. Tầng AI: 3 cách dạy Máy học hiểu được "Chuỗi sự kiện"

Khi đã có chuỗi sự kiện liên kết theo thời gian $S = \{e_1, e_2, e_3, \dots, e_t\}$, bạn có 3 cấp độ mô hình để dự đoán:

| Cấp độ | Phương pháp kỹ thuật | Cách thức hoạt động | Khi nào nên dùng? |
| --- | --- | --- | --- |
| **Cấp độ 1: Giả chuỗi (Sequential Features trên GBDT)** | **Lag & Transition Features** + **LightGBM / XGBoost** | Thay vì chỉ tính tổng, bạn tạo ra các cột mô tả sự chuyển dịch: `Trạng_thái_đơn_cuối_cùng`, `Chênh_lệch_thời_gian_giữa_2_lần_mua_cuối`, `Số_lần_mở_app_sau_khi_hoàn_hàng`. | Dễ triển khai nhất, tận dụng được tốc độ của LightGBM nhưng vẫn bắt được mạch nhân - quả ngắn hạn. |
| **Cấp độ 2: Xác suất chuyển trạng thái** | **Markov Chains (Chuỗi Markov)** | Tính ma trận xác suất chuyển đổi giữa các hành động. Ví dụ: Xác suất từ `Giao_trễ` $\rightarrow$ `Trả_hàng` $\rightarrow$ `Rời_bỏ` là bao nhiêu phần trăm so với luồng bình thường. | Rất mạnh để phát hiện "điểm gãy" (Drop-off point) trong quy trình vận hành của sàn. |
| **Cấp độ 3: Deep Learning Chuỗi thực thụ (State-of-the-Art)** | **LSTM / GRU** hoặc **Transformer (Behavior Sequence Transformer - BST)** | Coi mỗi sự kiện ($e_i$) như một "từ" trong câu (giống cách hoạt động của các mô hình ngôn ngữ). Mô hình đọc toàn bộ chuỗi lịch sử kèm khoảng cách thời gian ($\Delta t$) giữa các sự kiện để dự đoán "từ tiếp theo" là `Mua_hàng` hay `Rời_bỏ`. | Khi hệ thống có lượng log hành vi (Clickstream + Order) lớn và cần dự đoán theo thời gian thực ngay trong phiên truy cập. |

---

### Bí quyết "Ăn tiền" nhất: Đưa yếu tố Thời gian ($\Delta t$) vào Chuỗi

Một chuỗi sự kiện chỉ có thứ tự thôi là chưa đủ, **khoảng trống thời gian giữa các sự kiện** mới là thứ tố cáo ý định rời bỏ rõ nhất:

* Chuỗi `[Xem SP] -> (2 phút sau) -> [Thêm vào giỏ] -> (5 phút sau) -> [Thanh toán lỗi] -> (1 phút sau) -> [Thoát App]`: Thể hiện sự **bực tức tức thời** do lỗi hệ thống thanh toán.
* Chuỗi `[Nhận hàng] -> (3 giờ sau) -> [Đánh giá 1 sao] -> (14 ngày không mở App)`: Thể hiện sự **thất vọng về chất lượng sản phẩm** dẫn đến từ bỏ nền tảng.

Khi bạn liên kết được cả **Loại sự kiện (What)** + **Ngữ cảnh (Why)** + **Khoảng cách thời gian (When)** vào cùng một dòng chảy dữ liệu, hệ thống có thể kích hoạt kịch bản giữ chân **ngay tại thời điểm sự kiện xấu vừa kết thúc** (Real-time Intervention), thay vì đợi 30 ngày sau khi khách đã sang sàn khác mua hàng mới chạy mô hình dự đoán.

Bạn đang hướng tới việc thiết kế luồng gom dữ liệu sự kiện này ở tầng kiến trúc hệ thống (Database / Message Queue) trước, hay muốn đi vào cách cấu trúc dữ liệu chuỗi để đưa vào mô hình huấn luyện?