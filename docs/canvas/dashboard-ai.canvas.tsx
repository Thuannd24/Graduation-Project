/**
 * Dashboard AI — Tài liệu kỹ thuật đầy đủ
 * Tab 1: Tổng quan & Dữ liệu
 * Tab 2: Demand Forecasting (Prophet / LightGBM / LSTM)
 * Tab 3: Anomaly Detection (Isolation Forest / LSTM-AE)
 * Tab 4: Customer Segmentation (RFM + K-Means)
 * Tab 5: Dashboard Streamlit & Tích hợp
 */
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const TABS = [
  { id: "overview",  label: "1. Tổng quan & Dữ liệu" },
  { id: "forecast",  label: "2. Demand Forecasting" },
  { id: "anomaly",   label: "3. Anomaly Detection" },
  { id: "segment",   label: "4. Customer Segmentation" },
  { id: "dashboard", label: "5. Dashboard Streamlit" },
];

function Tag({ label, tone }: { label: string; tone?: "info"|"success"|"warning"|"neutral" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

// ─── TAB 1 ────────────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>AI Dashboard — Trợ lý chiến lược cho Admin</H2>
        <Text tone="secondary">
          Thay vì biểu đồ tĩnh, Dashboard này tích hợp AI để tự động phát hiện vấn đề,
          dự báo tương lai và phân tích khách hàng — giúp Admin đưa ra quyết định nhanh hơn.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="3" label="Module AI" />
        <Stat value="Prophet" label="Forecasting engine" tone="info" />
        <Stat value="LSTM-AE" label="Anomaly detector" tone="warning" />
        <Stat value="K-Means" label="Segmentation" tone="success" />
      </Grid>

      <H3>3 bài toán AI của Dashboard</H3>
      <Table
        headers={["Bài toán", "Input", "Output", "Giá trị nghiệp vụ"]}
        striped
        rows={[
          [
            <Text weight="bold">Demand Forecasting</Text>,
            "Time-series doanh thu lịch sử, ngày lễ, khuyến mãi",
            "Dự báo doanh thu 30 ngày tới kèm confidence interval",
            "Admin chủ động nhập hàng, lên kế hoạch khuyến mãi",
          ],
          [
            <Text weight="bold">Anomaly Detection</Text>,
            "Time-series doanh thu/giờ, traffic/giờ, conversion rate",
            "Alert khi có sụt giảm bất thường hoặc traffic tăng đột biến",
            "Phát hiện lỗi hệ thống, gian lận, tấn công DDoS sớm",
          ],
          [
            <Text weight="bold">Customer Segmentation</Text>,
            "Lịch sử mua hàng: R (recency), F (frequency), M (monetary)",
            "4 nhóm khách hàng có thể hành động: VIP, Tiềm năng, Nguy cơ, Mới",
            "Cá nhân hóa marketing, win-back campaign, loyalty program",
          ],
        ]}
        columnAlign={["left","left","left","left"]}
      />

      <H3>Dữ liệu cần chuẩn bị</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Dữ liệu time-series (cho Forecasting + Anomaly)</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Bảng", "Trường", "Granularity"]}
              rows={[
                [<Code>daily_revenue</Code>, "date, revenue, order_count, category", "Ngày"],
                [<Code>hourly_metrics</Code>, "hour, revenue, sessions, conversion_rate, cart_abandonment", "Giờ"],
                [<Code>promotions</Code>, "start_date, end_date, discount_pct, category", "Event"],
                [<Code>inventory</Code>, "date, item_id, stock_level, reorder_point", "Ngày"],
              ]}
              columnAlign={["left","left","center"]}
            />
            <Text size="small" tone="tertiary" style={{ marginTop: 8 }}>Cần tối thiểu 6 tháng lịch sử cho Forecasting, 3 tháng cho Anomaly Detection.</Text>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Dữ liệu khách hàng (cho Segmentation)</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Table
                framed={false} striped
                headers={["Trường", "Tính từ bảng"]}
                rows={[
                  [<Code>user_id</Code>, "users"],
                  [<Code>recency</Code>, "MAX(order_date), tính số ngày từ lần mua cuối đến hôm nay"],
                  [<Code>frequency</Code>, "COUNT(order_id) GROUP BY user_id"],
                  [<Code>monetary</Code>, "SUM(order_total) GROUP BY user_id"],
                  [<Code>first_purchase</Code>, "MIN(order_date) — để tính customer tenure"],
                  [<Code>avg_order_value</Code>, "monetary / frequency"],
                ]}
                columnAlign={["left","left"]}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader>External data — tích hợp để tăng độ chính xác</CardHeader>
        <CardBody>
          <Grid columns={3} gap={12}>
            <Stack gap={4}>
              <Tag label="OpenWeatherMap API" tone="info" />
              <Text tone="secondary" size="small">Nhiệt độ, mưa/nắng theo ngày tại các thành phố lớn. Ảnh hưởng đến doanh số quần áo, đồ uống.</Text>
              <Text size="small" tone="tertiary">Free: 1.000 calls/ngày</Text>
            </Stack>
            <Stack gap={4}>
              <Tag label="Lịch lễ tết Việt Nam" tone="warning" />
              <Text tone="secondary" size="small">Hardcode tất cả ngày lễ lớn: Tết, 8/3, 20/10, Black Friday, 12/12. Là feature quan trọng nhất cho seasonality.</Text>
              <Text size="small" tone="tertiary">Tạo sẵn file holidays.json</Text>
            </Stack>
            <Stack gap={4}>
              <Tag label="Promotion calendar" tone="success" />
              <Text tone="secondary" size="small">Lịch khuyến mãi lịch sử: mỗi campaign có start/end date và discount_pct. Feature quan trọng cho forecasting.</Text>
              <Text size="small" tone="tertiary">Từ bảng promotions nội bộ</Text>
            </Stack>
          </Grid>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 2: DEMAND FORECASTING ────────────────────────────────────────────────

function ForecastTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Demand Forecasting — Dự báo doanh thu 30 ngày tới</H2>
        <Text tone="secondary">
          Train 3 model, đánh giá bằng MAPE và RMSE, deploy model tốt nhất.
          Dự báo theo từng danh mục sản phẩm, không phải toàn site.
        </Text>
      </Stack>

      <Table
        headers={["Model", "Ý tưởng", "Ưu điểm", "Hạn chế", "Khó", "MAPE điển hình"]}
        striped
        rows={[
          [
            <Text weight="bold">LightGBM + Features</Text>,
            "Tabular: mỗi ngày = 1 row, nhiều feature (lag, calendar, external)",
            "Thường thắng tabular data. Dễ thêm feature mới. Nhanh train.",
            "Cần feature engineering tốt. Không extrapolate ngoài training range.",
            <Pill tone="info" size="sm">Trung bình</Pill>,
            "8–15%",
          ],
          [
            <Text weight="bold">Prophet (Facebook)</Text>,
            "Additive: trend + seasonality + holidays + noise",
            "Tự handle weekly/yearly seasonality. Code 5 dòng. Confidence interval đẹp.",
            "Kém với data ít đặc trưng hoặc nhiều biến ngoại vi phức tạp.",
            <Pill tone="success" size="sm">Dễ nhất</Pill>,
            "12–20%",
          ],
          [
            "LSTM / Temporal Fusion Transformer",
            "Deep learning: học pattern phức tạp từ chuỗi dài",
            "Capture non-linear pattern. TFT là SOTA multivariate forecasting.",
            "Cần nhiều data (&gt; 2 năm). Train lâu. Khó debug.",
            <Pill tone="warning" size="sm">Khó</Pill>,
            "7–13% (nếu đủ data)",
          ],
        ]}
        rowTone={["success", undefined, undefined]}
        columnAlign={["left","left","left","left","center","center"]}
      />

      <H3>LightGBM — Feature engineering chi tiết</H3>
      <Card>
        <CardHeader>Toàn bộ features cần tạo</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Grid columns={3} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Temporal features</Text>
                <Table
                  framed={false} striped
                  headers={["Feature", "Ý nghĩa"]}
                  rows={[
                    [<Code>day_of_week</Code>, "0–6"],
                    [<Code>day_of_month</Code>, "1–31"],
                    [<Code>month</Code>, "1–12"],
                    [<Code>quarter</Code>, "1–4"],
                    [<Code>week_of_year</Code>, "1–52"],
                    [<Code>is_weekend</Code>, "0/1"],
                    [<Code>is_month_start/end</Code>, "0/1"],
                  ]}
                  columnAlign={["left","left"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Lag features (quá khứ)</Text>
                <Table
                  framed={false} striped
                  headers={["Feature", "Ý nghĩa"]}
                  rows={[
                    [<Code>lag_1</Code>, "Doanh thu hôm qua"],
                    [<Code>lag_7</Code>, "Cùng ngày tuần trước"],
                    [<Code>lag_14</Code>, "2 tuần trước"],
                    [<Code>lag_30</Code>, "1 tháng trước"],
                    [<Code>lag_365</Code>, "Cùng ngày năm ngoái"],
                    [<Code>rolling_mean_7</Code>, "Trung bình 7 ngày"],
                    [<Code>rolling_std_7</Code>, "Độ lệch chuẩn 7 ngày"],
                  ]}
                  columnAlign={["left","left"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">External features</Text>
                <Table
                  framed={false} striped
                  headers={["Feature", "Nguồn"]}
                  rows={[
                    [<Code>is_holiday</Code>, "Lịch lễ Việt Nam"],
                    [<Code>days_to_holiday</Code>, "Khoảng cách đến lễ gần nhất"],
                    [<Code>is_promotion</Code>, "Bảng promotions"],
                    [<Code>discount_pct</Code>, "Bảng promotions"],
                    [<Code>temperature</Code>, "OpenWeatherMap"],
                    [<Code>is_rainy</Code>, "OpenWeatherMap"],
                  ]}
                  columnAlign={["left","left"]}
                />
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <H3>LightGBM — Training pipeline</H3>
      <Card>
        <CardHeader>Từng bước train và evaluate</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1</Pill><Text weight="semibold">Time-series split (không được random shuffle!)</Text></Row>
              <Text tone="secondary" size="small">
                Train: ngày 1 đến T-30. Test: T-30 ngày cuối. Validation: T-45 đến T-30.
                TUYỆT ĐỐI không dùng random split — sẽ bị data leakage từ tương lai.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2</Pill><Text weight="semibold">Train model</Text></Row>
              <Text tone="secondary" size="small">
                <Code>import lightgbm as lgb</Code>.
                Hyperparams: <Code>n_estimators=500, learning_rate=0.05, num_leaves=31, reg_alpha=0.1</Code>.
                Early stopping: <Code>callbacks=[lgb.early_stopping(50)]</Code> trên val set.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">3</Pill><Text weight="semibold">Evaluate trên test set</Text></Row>
              <Text tone="secondary" size="small">
                MAPE = mean(|actual - predicted| / actual) × 100%.
                RMSE = sqrt(mean((actual - predicted)²)).
                MAE = mean(|actual - predicted|).
                So sánh 3 model, chọn MAPE thấp nhất.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">4</Pill><Text weight="semibold">Feature importance</Text></Row>
              <Text tone="secondary" size="small">
                <Code>lgb.plot_importance(model, max_num_features=15)</Code>.
                Thường thấy lag_7, lag_365, is_holiday là top features.
                Giải thích được trong báo cáo tại sao model dự báo tăng/giảm.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Prophet — Implement nhanh</H3>
      <Card>
        <CardHeader trailing={<Pill tone="success" size="sm">5 dòng code cốt lõi</Pill>}>Prophet với holidays Việt Nam</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              <Code>from prophet import Prophet</Code>.
              Tạo DataFrame với 2 cột: <Code>ds</Code> (date) và <Code>y</Code> (doanh thu).
            </Text>
            <Text tone="secondary" size="small">
              <Code>m = Prophet(seasonality_mode='multiplicative', yearly_seasonality=True)</Code>.
            </Text>
            <Text tone="secondary" size="small">
              Thêm holidays: <Code>m.add_country_holidays(country_name='VN')</Code> (Prophet có sẵn lịch Việt Nam).
            </Text>
            <Text tone="secondary" size="small">
              Thêm promotion regressors: <Code>m.add_regressor('is_promotion')</Code>.
            </Text>
            <Text tone="secondary" size="small">
              Fit và predict: <Code>m.fit(df); future = m.make_future_dataframe(periods=30); forecast = m.predict(future)</Code>.
            </Text>
            <Callout tone="success" title="Confidence interval miễn phí">
              Prophet tự tạo <Code>yhat_lower</Code> và <Code>yhat_upper</Code> (80% CI).
              Hiển thị trên Dashboard như "doanh thu dự kiến 350–420 triệu trong tháng tới".
            </Callout>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 3: ANOMALY DETECTION ─────────────────────────────────────────────────

function AnomalyTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Anomaly Detection — Phát hiện bất thường real-time</H2>
        <Text tone="secondary">
          AI tự động cảnh báo khi doanh thu sụt giảm đột ngột, traffic tăng bất thường (DDoS/bot),
          hay conversion rate drop (lỗi checkout). Admin không cần stare vào màn hình 24/7.
        </Text>
      </Stack>

      <Table
        headers={["Model", "Ý tưởng", "Ưu điểm", "Hạn chế", "F1 điển hình", "Khuyến nghị"]}
        striped
        rows={[
          [
            <Text weight="bold">LSTM Autoencoder</Text>,
            "Học pattern 'bình thường', reconstruction error cao = bất thường",
            "Tốt nhất cho time-series. Phát hiện được nhiều dạng anomaly phức tạp.",
            "Train cần 2–4 giờ. Cần đủ dữ liệu bình thường để train.",
            "0.78–0.88",
            <Pill tone="success" size="sm">Khuyến nghị</Pill>,
          ],
          [
            <Text weight="bold">Isolation Forest</Text>,
            "Isolate bất thường bằng random splits — anomaly dễ isolate hơn",
            "Sklearn 3 dòng. Nhanh. Không cần label. Tốt cho tabular data.",
            "Kém với time-series có seasonality mạnh. Khó tune threshold.",
            "0.65–0.75",
            <Pill tone="info" size="sm">Baseline nhanh</Pill>,
          ],
          [
            "One-Class SVM",
            "Học ranh giới của vùng 'bình thường' trong không gian feature",
            "Lý thuyết vững. Không cần negative samples.",
            "Chậm với data lớn. Kém hơn LSTM-AE với time-series.",
            "0.60–0.70",
            <Pill tone="neutral" size="sm">Ít dùng</Pill>,
          ],
        ]}
        rowTone={["success", undefined, undefined]}
        columnAlign={["left","left","left","left","center","center"]}
      />

      <H3>LSTM Autoencoder — chi tiết implement</H3>
      <Card>
        <CardHeader>Kiến trúc và training</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Kiến trúc</Text>
                <Stack gap={4}>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Encoder:</Text> LSTM(input=N_features, hidden=64) → LSTM(64, 32) → bottleneck vector.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Decoder:</Text> RepeatVector(seq_len) → LSTM(32, 64) → LSTM(64, N_features) → reconstruction.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Loss:</Text> MSE giữa input sequence và reconstructed sequence.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Sequence:</Text> Cửa sổ 24 giờ (24 timesteps). Stride 1 giờ.</Text>
                </Stack>
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Hyperparameters</Text>
                <Table
                  framed={false} striped
                  headers={["Param", "Giá trị"]}
                  rows={[
                    [<Code>seq_len</Code>,      "24 (giờ)"],
                    [<Code>n_features</Code>,   "3–5 (revenue, sessions, cvr...)"],
                    [<Code>hidden_size</Code>,  "[64, 32]"],
                    [<Code>batch_size</Code>,   "32"],
                    [<Code>lr</Code>,           "1e-3 (Adam)"],
                    [<Code>epochs</Code>,       "50"],
                    [<Code>dropout</Code>,      "0.2"],
                  ]}
                  columnAlign={["left","right"]}
                />
              </Stack>
            </Grid>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Training procedure</Text>
              <Text tone="secondary" size="small">
                1. Chọn dữ liệu "bình thường": loại bỏ các ngày biết có sự kiện bất thường (marketing campaign, lỗi hệ thống cũ).
              </Text>
              <Text tone="secondary" size="small">
                2. Normalize: MinMaxScaler per feature. Lưu scaler để dùng khi inference.
              </Text>
              <Text tone="secondary" size="small">
                3. Tạo sequences: sliding window 24h. Train trên 80%, val trên 20%.
              </Text>
              <Text tone="secondary" size="small">
                4. Train cho đến khi val loss không giảm thêm (early stopping patience=10).
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Xác định ngưỡng anomaly</Text>
              <Text tone="secondary" size="small">
                Tính reconstruction error trên toàn bộ training data.
                Ngưỡng = mean + 3×std của reconstruction errors (3-sigma rule).
                Tuning: điều chỉnh multiplier (2.5–4) dựa trên false positive rate chấp nhận được.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Isolation Forest — Baseline nhanh</H3>
      <Card>
        <CardHeader>Implement với sklearn (dưới 10 dòng)</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              <Code>from sklearn.ensemble import IsolationForest</Code>.
              Features: doanh thu giờ, traffic giờ, conversion rate giờ, giờ trong ngày, ngày trong tuần.
            </Text>
            <Text tone="secondary" size="small">
              <Code>clf = IsolationForest(contamination=0.05, random_state=42, n_estimators=200)</Code>.
              <Code>contamination=0.05</Code>: kỳ vọng 5% data là anomaly.
            </Text>
            <Text tone="secondary" size="small">
              <Code>clf.fit(X_train)</Code>. Predict: <Code>scores = clf.decision_function(X_new)</Code> → score âm = anomaly.
            </Text>
            <Callout tone="info" title="Kết hợp Isolation Forest + LSTM-AE">
              Isolation Forest cho cảnh báo nhanh (stateless, &lt; 1ms). LSTM-AE cho phân tích sâu hơn.
              Logic: IF phát hiện anomaly → LSTM-AE xác nhận → gửi alert.
            </Callout>
          </Stack>
        </CardBody>
      </Card>

      <H3>Alert system</H3>
      <Table
        headers={["Loại anomaly", "Điều kiện", "Severity", "Action"]}
        striped
        rows={[
          ["Doanh thu giảm đột ngột", "Revenue &lt; mean - 3σ trong 2 giờ liên tiếp", <Pill tone="danger" size="sm">Critical</Pill>, "Email + Slack + SMS cho Admin"],
          ["Traffic tăng bất thường", "Sessions &gt; mean + 5σ (có thể DDoS)", <Pill tone="warning" size="sm">Warning</Pill>, "Alert + log IP addresses"],
          ["Conversion rate drop", "CVR &lt; 50% of mean (lỗi checkout?)", <Pill tone="danger" size="sm">Critical</Pill>, "Alert + auto-test checkout flow"],
          ["Doanh thu tăng đột biến", "Revenue &gt; mean + 4σ (viral? bug giá?)", <Pill tone="info" size="sm">Info</Pill>, "Notification + manual review"],
        ]}
        columnAlign={["left","left","center","left"]}
        rowTone={["danger", "warning", "danger", "info"]}
      />
    </Stack>
  );
}

// ─── TAB 4: CUSTOMER SEGMENTATION ────────────────────────────────────────────

function SegmentTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Customer Segmentation — RFM + K-Means</H2>
        <Text tone="secondary">
          Phân nhóm khách hàng tự động để Admin có thể cá nhân hóa chiến lược marketing.
          RFM là phương pháp chuẩn ngành, K-Means tự động tìm nhóm tốt nhất.
        </Text>
      </Stack>

      <H3>Bước 1 — Tính RFM cho mỗi khách hàng</H3>
      <Card>
        <CardHeader>SQL query tính RFM</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Table
              framed={false} striped
              headers={["Chỉ số", "Công thức", "Ý nghĩa"]}
              rows={[
                [<Text weight="bold">R (Recency)</Text>, "Số ngày từ lần mua cuối đến hôm nay", "Càng nhỏ càng tốt — mua gần đây"],
                [<Text weight="bold">F (Frequency)</Text>, "Tổng số đơn hàng", "Càng lớn càng tốt — mua thường xuyên"],
                [<Text weight="bold">M (Monetary)</Text>, "Tổng số tiền đã chi", "Càng lớn càng tốt — chi tiêu nhiều"],
              ]}
              columnAlign={["left","left","left"]}
            />
            <Text tone="secondary" size="small">
              SQL: <Code>SELECT user_id, DATEDIFF(NOW(), MAX(order_date)) as R, COUNT(*) as F, SUM(total) as M FROM orders GROUP BY user_id</Code>
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>Bước 2 — Normalize và chọn K tối ưu</H3>
      <Card>
        <CardHeader>Pipeline từng bước</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2.1</Pill><Text weight="semibold">Xử lý outlier và normalize</Text></Row>
              <Text tone="secondary" size="small">
                Clip outlier: percentile 1% và 99% cho M (một số VIP chi tiêu cực cao sẽ skew clustering).
                Log transform M nếu phân phối rất skewed: <Code>M_log = np.log1p(M)</Code>.
                Normalize: <Code>StandardScaler</Code> cho cả R, F, M. Lưu scaler để inverse_transform khi giải thích.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2.2</Pill><Text weight="semibold">Chọn K tối ưu bằng Elbow Method + Silhouette</Text></Row>
              <Text tone="secondary" size="small">
                Thử K = 3, 4, 5, 6, 7. Tính inertia (WCSS) và Silhouette Score.
                Elbow method: chọn K mà sau đó inertia giảm chậm lại (điểm "khuỷu tay").
                K=4 thường cho kết quả nghiệp vụ tốt nhất: VIP, Tiềm năng, Nguy cơ, Mới.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2.3</Pill><Text weight="semibold">Train K-Means</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from sklearn.cluster import KMeans</Code>.
                <Code>kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)</Code>.
                <Code>labels = kmeans.fit_predict(X_scaled)</Code>.
                Chạy <Code>n_init=10</Code> lần để tránh local optima.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Bước 3 — Đặt tên và giải thích các nhóm</H3>
      <Table
        headers={["Nhóm", "R (ngày)", "F (đơn)", "M (triệu VNĐ)", "Chiến lược marketing", "% khách"]}
        striped
        rows={[
          [<Pill tone="success" size="sm">VIP Champions</Pill>, "&lt; 30", "&gt; 10", "&gt; 5tr", "Loyalty program, early access, ưu đãi đặc biệt", "~5–10%"],
          [<Pill tone="info" size="sm">Tiềm năng</Pill>, "30–90", "3–10", "1–5tr", "Upsell, cross-sell, tăng frequency bằng email", "~20–30%"],
          [<Pill tone="warning" size="sm">Nguy cơ rời bỏ</Pill>, "90–180", "1–3", "Bất kỳ", "Win-back: coupon 20%, email 'Chúng tôi nhớ bạn'", "~25–35%"],
          [<Pill tone="neutral" size="sm">Khách mới</Pill>, "&lt; 30", "1", "&lt; 1tr", "Onboarding: hướng dẫn, first repeat purchase incentive", "~30–40%"],
        ]}
        rowTone={["success", "info", "warning", undefined]}
        columnAlign={["left","center","center","center","left","center"]}
      />

      <H3>Visualization trên Dashboard</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>3D Scatter Plot (R, F, M)</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">
              Dùng Plotly 3D scatter: x=Recency, y=Frequency, z=Monetary. Mỗi điểm = 1 khách hàng, màu theo nhóm.
              Admin thấy ngay spatial distribution của khách hàng.
              <Code>px.scatter_3d(df, x='R', y='F', z='M', color='segment')</Code>
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Segment Distribution Chart</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">
              Pie chart + bar chart: số lượng và tỷ lệ % mỗi nhóm.
              Trend theo thời gian: nhóm "Nguy cơ" tăng hay giảm qua các tháng? Đây là KPI quan trọng.
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <Callout tone="success" title="Điểm cộng: Tự động schedule re-segmentation">
        Chạy lại K-Means mỗi tuần (cron job). So sánh % mỗi nhóm tuần này vs tuần trước.
        Alert khi nhóm "Nguy cơ" tăng &gt; 5% — Admin cần launch win-back campaign ngay.
      </Callout>
    </Stack>
  );
}

// ─── TAB 5: DASHBOARD STREAMLIT ──────────────────────────────────────────────

function DashboardTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Dashboard Streamlit — Xây dựng và tích hợp</H2>
        <Text tone="secondary">
          Streamlit là cách nhanh nhất để build AI Dashboard với Python thuần túy.
          Không cần frontend developer, không cần JavaScript.
        </Text>
      </Stack>

      <H3>Cấu trúc Dashboard</H3>
      <Card>
        <CardHeader>Layout các trang</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Table
              framed={false} striped
              headers={["Trang", "Nội dung", "Thời gian refresh"]}
              rows={[
                ["📊 Overview", "KPI cards: doanh thu hôm nay, đơn hàng, conversion rate, so sánh hôm qua/tuần trước", "Auto 5 phút"],
                ["🔮 Forecast", "Biểu đồ dự báo 30 ngày với confidence interval. Cho phép chọn category, model.", "Hàng ngày"],
                ["🚨 Anomaly", "Real-time alert feed. Timeline chart với anomaly markers. Lịch sử alerts.", "Auto 15 phút"],
                ["👥 Customers", "Segment pie chart, 3D scatter, bảng top VIP, bảng khách nguy cơ", "Hàng tuần"],
                ["📦 Inventory", "Sản phẩm sắp hết hàng, đề xuất nhập thêm dựa trên forecast", "Hàng ngày"],
              ]}
              columnAlign={["left","left","center"]}
            />
          </Stack>
        </CardBody>
      </Card>

      <H3>Cấu trúc file project</H3>
      <Table
        headers={["File", "Vai trò"]}
        striped
        rows={[
          [<Code>app.py</Code>, "Entry point Streamlit, navigation sidebar"],
          [<Code>pages/1_Overview.py</Code>, "Trang KPI tổng quan"],
          [<Code>pages/2_Forecast.py</Code>, "Trang dự báo nhu cầu"],
          [<Code>pages/3_Anomaly.py</Code>, "Trang anomaly detection"],
          [<Code>pages/4_Customers.py</Code>, "Trang phân khúc khách hàng"],
          [<Code>models/forecast.py</Code>, "Class ForecastModel: load, predict, retrain"],
          [<Code>models/anomaly.py</Code>, "Class AnomalyDetector: load, detect, get_threshold"],
          [<Code>models/segmentation.py</Code>, "Class CustomerSegmenter: fit, predict, explain"],
          [<Code>utils/db.py</Code>, "Query PostgreSQL, cache với @st.cache_data"],
          [<Code>utils/alerts.py</Code>, "Gửi email/webhook khi anomaly"],
          [<Code>scheduler.py</Code>, "APScheduler: cron jobs retrain + trending"],
        ]}
        columnAlign={["left","left"]}
      />

      <H3>Performance tips cho Streamlit</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Caching để tránh query DB mỗi lần rerun</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small"><Code>@st.cache_data(ttl=300)</Code> cho dữ liệu thay đổi mỗi 5 phút.</Text>
              <Text tone="secondary" size="small"><Code>@st.cache_resource</Code> cho model load (chỉ load 1 lần suốt lifetime app).</Text>
              <Text tone="secondary" size="small"><Code>st.cache_data.clear()</Code> để invalidate khi có data mới.</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Auto-refresh cho real-time data</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">Dùng <Code>streamlit-autorefresh</Code> component: <Code>st_autorefresh(interval=60000)</Code> để tự reload mỗi 60 giây.</Text>
              <Text tone="secondary" size="small">Hoặc dùng <Code>st.empty()</Code> + vòng lặp với <Code>time.sleep(60)</Code> cho live data.</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Deploy Dashboard</H3>
      <Table
        headers={["Cách deploy", "Phù hợp khi", "Chi phí", "Độ khó"]}
        striped
        rows={[
          ["Streamlit Cloud", "Demo, đồ án — share link public", "Miễn phí", <Pill tone="success" size="sm">Dễ nhất</Pill>],
          ["Docker + VPS", "Production, bảo mật, tích hợp với backend", "~100k/tháng VPS", <Pill tone="info" size="sm">Trung bình</Pill>],
          ["Hugging Face Spaces", "Demo nhanh, không cần setup", "Miễn phí", <Pill tone="success" size="sm">Dễ</Pill>],
        ]}
        rowTone={["success", undefined, undefined]}
        columnAlign={["left","left","center","center"]}
      />

      <Callout tone="success" title="Điểm cộng: Natural Language Query cho Dashboard">
        Thêm input box "Hỏi Dashboard": Admin gõ "Doanh thu tuần này so với tuần trước?" →
        LLM (Gemini Flash) nhận câu hỏi + data context → trả về phân tích bằng ngôn ngữ tự nhiên.
        Implement với LangChain Agent + pandas dataframe tool. Ấn tượng nhất trong phần Dashboard.
      </Callout>
    </Stack>
  );
}

export default function DashboardAI() {
  const theme = useHostTheme();
  const [activeTab, setActiveTab] = useCanvasState("dbTab", "overview");
  return (
    <Stack gap={0} style={{ minHeight: "100vh", background: theme.bg.editor }}>
      <Stack gap={16} style={{ padding: "24px 32px 0 32px" }}>
        <Stack gap={4}>
          <H1>Dashboard AI — Trợ lý chiến lược cho Admin</H1>
          <Text tone="secondary">Demand Forecasting · Anomaly Detection · Customer Segmentation · Streamlit</Text>
        </Stack>
        <Row gap={8} wrap>
          {TABS.map(t => <Pill key={t.id} active={t.id === activeTab} onClick={() => setActiveTab(t.id)}>{t.label}</Pill>)}
        </Row>
        <Grid columns={5} gap={8}>
          <Stat value="LightGBM" label="Best forecaster" tone="success" />
          <Stat value="LSTM-AE" label="Best anomaly" tone="warning" />
          <Stat value="K=4" label="Segments" tone="info" />
          <Stat value="Prophet" label="Easiest model" tone="info" />
          <Stat value="Streamlit" label="Dashboard" tone="success" />
        </Grid>
        <Divider />
      </Stack>
      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "overview"  && <OverviewTab />}
        {activeTab === "forecast"  && <ForecastTab />}
        {activeTab === "anomaly"   && <AnomalyTab />}
        {activeTab === "segment"   && <SegmentTab />}
        {activeTab === "dashboard" && <DashboardTab />}
      </Stack>
    </Stack>
  );
}
