# Dashboard AI — Trợ Lý Phân Tích Chiến Lược Cho Admin

> Tài liệu kỹ thuật chi tiết về hệ thống AI Dashboard phục vụ vận hành, quản lý kho hàng và phân tích khách hàng. Dashboard sử dụng Python/Streamlit để hiện thực hóa 3 mô hình học máy: Dự báo doanh thu (Demand Forecasting), Phát hiện bất thường (Anomaly Detection), và Phân cụm khách hàng (Customer Segmentation).

---

## 📌 Tổng Quan Hệ Thống

| Module AI | Mô hình sử dụng | Chỉ số đo lường chính | Giá trị nghiệp vụ |
| :--- | :--- | :---: | :--- |
| **Demand Forecasting** | LightGBM, Prophet, LSTM | MAPE, RMSE, MAE | Lập kế hoạch tồn kho, dự phòng Out-of-Stock |
| **Anomaly Detection** | LSTM Autoencoder, Isolation Forest | F1-score, Precision, Recall | Phát hiện sớm lỗi hệ thống, gian lận thanh toán |
| **Customer Segmentation** | RFM Analysis + K-Means Clustering | Silhouette Score, WCSS (Inertia) | Cá nhân hóa tiếp thị, win-back khách hàng rời bỏ |

* **Nền tảng giao diện:** Python Streamlit (Không dùng Javascript, phát triển nhanh, tích hợp trực tiếp mã nguồn AI).

---

## 1. Demand Forecasting (Dự Báo Nhu Cầu Tồn Kho)

Mục tiêu là dự báo doanh thu và lượng tiêu thụ sản phẩm cho 30 ngày tiếp theo theo từng danh mục sản phẩm (Category).

### Đối sánh các mô hình dự báo

| Mô hình | Ý tưởng cốt lõi | Ưu điểm | Hạn chế | Độ khó train | MAPE thực tế | Khuyến nghị |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **LightGBM + Features** | Chuyển chuỗi thời gian thành bài toán học máy dạng bảng (Tabular Regression). | Tối ưu hóa rất tốt trên dữ liệu dạng bảng. Dễ dàng thêm các biến ngoại vi (thời tiết, khuyến mãi). | Yêu cầu thiết kế đặc trưng (Feature Engineering) kỹ lưỡng. Không tự suy diễn tốt ngoài khoảng dữ liệu đã học. | Trung bình | **8% - 15%** | **Khuyến nghị** ⭐ |
| **Prophet (Facebook)** | Mô hình cộng tính (Additive): Phân rã chuỗi thành trend + seasonality + holidays. | Tự động xử lý tính chu kỳ ngày/tuần/năm. Code cực kỳ ngắn (5 dòng). Trả về khoảng tin cậy (Confidence Interval) đẹp. | Kém hiệu quả nếu chuỗi thời gian có quá nhiều biến động ngắn hạn đột ngột hoặc phụ thuộc sâu vào thời tiết. | Dễ | **12% - 20%** | Baseline tốt |
| **LSTM / TFT** | Học sâu chuỗi thời gian (Deep Learning Time-series). | Nắm bắt tốt các liên kết phi tuyến phức tạp trong chuỗi dài. | Đòi hỏi lượng dữ liệu lịch sử rất lớn (> 2 năm). Tốc độ train chậm và khó tinh chỉnh tham số. | Khó | **7% - 13%** | Nếu đủ data |

### Thiết kế các đặc trưng (Feature Engineering) cho LightGBM
* **Đặc trưng lịch (Calendar Features):** `day_of_week`, `day_of_month`, `month`, `quarter`, `week_of_year`, `is_weekend`, `is_month_start/end`.
* **Đặc trưng độ trễ (Lag Features):** `lag_1` (doanh thu hôm qua), `lag_7` (tuần trước), `lag_30` (tháng trước), `rolling_mean_7` (trung bình 7 ngày gần nhất), `rolling_std_7` (độ lệch chuẩn).
* **Đặc trưng ngoại vi (External Features):** `is_holiday` (lịch tết Việt Nam), `days_to_holiday` (đếm ngược đến ngày lễ tiếp theo), `is_promotion` (trạng thái khuyến mãi), `temperature`, `is_rainy` (lấy từ OpenWeatherMap API).

### Quy trình huấn luyện & Đánh giá
1. **Phân chia chuỗi thời gian (Time-series Split):** Chia tập dữ liệu theo thứ tự thời gian để tránh rò rỉ dữ liệu tương lai (Data Leakage). Train: ngày 1 đến $T-30$, Validation: $T-45$ đến $T-30$, Test: 30 ngày cuối cùng.
2. **Huấn luyện:** Khởi tạo LightGBM Regressor với các tham số: `n_estimators=500`, `learning_rate=0.05`, `num_leaves=31`. Sử dụng cơ chế dừng sớm (Early Stopping) sau 50 epochs không giảm validation loss.
3. **Đánh giá:** Tính toán chỉ số **MAPE** (Mean Absolute Percentage Error) trên tập Test. Mô hình có MAPE thấp nhất sẽ được đóng gói để chạy hàng ngày.

---

## 2. Anomaly Detection (Phát Hiện Giao Dịch Bất Thường)

Hệ thống giám sát các chỉ số vận hành theo giờ (Hourly metrics) như: Doanh thu, lượt truy cập (Sessions), tỷ lệ chuyển đổi (Conversion Rate), tỷ lệ hủy giỏ hàng (Cart Abandonment) để kịp thời đưa ra cảnh báo.

### Đối sánh các mô hình phát hiện bất thường

| Mô hình | Nguyên lý hoạt động | Ưu điểm | Hạn chế | F1-score | Khuyến nghị |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **LSTM Autoencoder** | Học cách tái tạo (reconstruct) dữ liệu chuỗi thời gian bình thường. Sai số tái tạo cao = Bất thường. | Nắm bắt sự biến động phụ thuộc vào thời gian và chu kỳ rất tốt. | Thời gian huấn luyện lâu. Cần lọc dữ liệu huấn luyện sạch. | **0.78 - 0.88** | **Khuyến nghị** ⭐ |
| **Isolation Forest** | Phân tách các điểm dữ liệu bằng các lát cắt ngẫu nhiên. Điểm bất thường sẽ dễ bị cô lập sớm hơn. | Tốc độ cực nhanh. Cài đặt 3 dòng code. Không cần nhãn dữ liệu trước. | Bỏ qua tính liên kết chuỗi thời gian (seasonality). Khó xác định ngưỡng phân loại. | 0.65 - 0.75 | Baseline nhanh |
| **One-Class SVM** | Tìm ranh giới bao quanh vùng tập trung dữ liệu bình thường. | Lý thuyết chặt chẽ. Hiệu quả trên tập mẫu nhỏ. | Tốc độ tính toán giảm mạnh khi dữ liệu lớn. | 0.60 - 0.70 | Ít sử dụng |

### Cấu hình chi tiết mô hình LSTM Autoencoder
* **Kiến trúc mạng:**
  * **Encoder:** 2 lớp LSTM (Lớp 1: 64 units, Lớp 2: 32 units) → Bottleneck Vector đại diện cho đặc trưng chuỗi.
  * **Decoder:** Lớp `RepeatVector` (độ dài cửa sổ 24 timesteps) → 2 lớp LSTM (32 units và 64 units) → Lớp Dense đầu ra tái tạo lại dữ liệu ban đầu.
* **Quy trình xác định ngưỡng cảnh báo (Anomaly Threshold):**
  * Tính sai số tái tạo (MSE) trên toàn bộ tập dữ liệu huấn luyện bình thường.
  * Áp dụng quy tắc **3-Sigma**: Ngưỡng cảnh báo = $\text{Mean(MSE)} + 3 \times \text{Std(MSE)}$. Những mẫu có MSE vượt qua ngưỡng này sẽ bị gắn cờ đỏ.

### Phân cấp cảnh báo (Alert System)
* **Critical (Nguy hiểm):** Doanh thu sụt giảm mạnh hoặc tỷ lệ chuyển đổi (Conversion Rate) giảm xuống dưới 50% mức trung bình trong 2 giờ liên tiếp (nghi ngờ lỗi cổng thanh toán / lỗi checkout) → Gửi tin nhắn SMS/Telegram khẩn cấp cho Admin.
* **Warning (Cảnh báo):** Lượt truy cập tăng vọt đột biến > 5 lần mức bình thường (nghi ngờ DDoS hoặc Spam bot) → Ghi nhận log IP và gửi cảnh báo Slack.

---

## 3. Customer Segmentation (Phân Khúc Khách Hàng)

Sử dụng mô hình học máy không giám sát **K-Means** kết hợp với chỉ số **RFM** để phân nhóm khách hàng tự động, giúp quản trị viên đưa ra chiến lược tiếp thị cá nhân hóa.

### Các bước triển khai phân cụm
1. **Tính toán chỉ số RFM từ DB:**
   * **R (Recency):** Số ngày kể từ đơn hàng cuối cùng của khách hàng đến thời điểm hiện tại.
   * **F (Frequency):** Tổng số đơn hàng thành công của khách hàng đó.
   * **M (Monetary):** Tổng số tiền khách hàng đã chi tiêu.
2. **Tiền xử lý dữ liệu:**
   * Loại bỏ các giá trị ngoại lai (outliers) ở mức 1% và 99% để tránh làm lệch tâm cụm.
   * Áp dụng Log Transform `np.log1p(Monetary)` do thuộc tính Monetary thường bị lệch phải nghiêm trọng.
   * Chuẩn hóa dữ liệu bằng `StandardScaler` đưa các chỉ số về cùng thang đo.
3. **Lọc số cụm K tối ưu:** Chạy K-Means thử nghiệm từ $K=3$ đến $K=7$. Sử dụng phương pháp đường cong **Elbow Method** kết hợp đánh giá chỉ số **Silhouette Score**. Lựa chọn tối ưu thường là **$K=4$ cụm**.

### Phân loại 4 nhóm khách hàng mục tiêu

| Nhóm khách hàng | Đặc trưng Recency | Đặc trưng Frequency | Đặc trưng Monetary | Chiến lược tiếp thị hành động | Tỷ lệ điển hình |
| :--- | :---: | :---: | :---: | :--- | :---: |
| **VIP Champions** | Rất gần (< 30 ngày) | Rất cao (> 10 đơn) | Lớn (> 5 triệu VNĐ) | Tri ân khách hàng thân thiết, cung cấp đặc quyền trải nghiệm sớm sản phẩm mới. | **5% - 10%** |
| **Khách hàng tiềm năng** | Vừa phải (30 - 90 ngày) | Khá (3 - 10 đơn) | Khá (1 - 5 triệu VNĐ) | Gợi ý sản phẩm chéo (Cross-sell), gửi email giới thiệu combo giảm giá để tăng tần suất mua. | **20% - 30%** |
| **Khách nguy cơ rời bỏ** | Xa (90 - 180 ngày) | Thấp (1 - 3 đơn) | Bất kỳ | Chiến dịch cứu vãn (Win-back campaign): Tặng mã giảm giá 20% khẩn cấp qua email/SMS. | **25% - 35%** |
| **Khách hàng mới** | Gần (< 30 ngày) | Thấp (1 đơn) | Nhỏ (< 1 triệu VNĐ) | Gửi hướng dẫn mua sắm, tặng quà chào mừng cho đơn hàng thứ hai. | **30% - 40%** |

---

## 4. Hiện Thực Hóa Dashboard Với Python Streamlit

### Cấu trúc dự án Streamlit
* `app.py`: Tệp khởi chạy chính, quản lý thanh điều hướng Sidebar.
* `pages/1_Overview.py`: Hiển thị các thẻ KPI (doanh thu, đơn hàng, conversion rate) cập nhật tự động mỗi 5 phút bằng thư viện `streamlit-autorefresh`.
* `pages/2_Forecast.py`: Trang biểu đồ trực quan dự báo doanh thu 30 ngày tới kèm theo dải khoảng tin cậy.
* `pages/3_Anomaly.py`: Bản tin cảnh báo bất thường real-time và lịch sử lỗi checkout/DDoS.
* `pages/4_Customers.py`: Hiển thị biểu đồ phân cụm **3D Scatter Plot (R, F, M)** tương tác bằng Plotly cùng danh sách khách hàng VIP/Nguy cơ.
* `models/`: Chứa các class load mô hình huấn luyện sẵn (`forecast.py`, `anomaly.py`, `segmentation.py`).
* `utils/db.py`: Thực hiện kết nối PostgreSQL và tối ưu hóa truy vấn thông qua decorator `@st.cache_data(ttl=300)`.

> [!TIP]
> **Điểm nhấn công nghệ (Natural Language Query):** Tích hợp thêm một hộp thoại nhập liệu dạng chatbot: *"Hỏi Dashboard"*. Quản trị viên có thể gõ câu hỏi bằng ngôn ngữ tự nhiên (ví dụ: *"Doanh số tuần này tăng bao nhiêu phần trăm so với tuần trước?"*). Hệ thống sẽ chuyển câu hỏi cùng dữ liệu Pandas DataFrame hiện tại vào mô hình ngôn ngữ lớn (Gemini 1.5 Flash) để tự động phân tích và đưa ra câu trả lời diễn giải ngắn gọn. Tính năng này được xây dựng dễ dàng bằng thư viện LangChain Pandas Dataframe Agent.
