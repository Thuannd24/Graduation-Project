/**
 * Dashboard AI (forecast-service :8004) — Tài liệu kỹ thuật đầy đủ
 * Tab 1: Tổng quan & Dữ liệu (MariaDB)
 * Tab 2: Demand Forecasting (LightGBM winner / Prophet / LSTM-TFT)
 * Tab 3: Anomaly Detection (Isolation Forest / LSTM-AE)
 * Tab 4: Customer Segmentation (RFM + K-Means, K=4 → segmentationLabel)
 * Tab 5: Dynamic Pricing → Camunda workflow
 * Tab 6: Dashboard Admin (React + Recharts) & Tích hợp hệ thống
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
  { id: "pricing",   label: "5. Dynamic Pricing → Camunda" },
  { id: "integration", label: "6. Dashboard Admin & Tích hợp" },
];

function Tag({ label, tone }: { label: string; tone?: "info"|"success"|"warning"|"neutral"|"danger" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

// ─── TAB 1 ────────────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>AI Dashboard — Trợ lý chiến lược cho Admin</H2>
        <Text tone="secondary">
          <Code>forecast-service</Code> (FastAPI, cổng <Code>:8004</Code>) cung cấp 4 bài toán phân tích cho
          admin: dự báo nhu cầu, phát hiện bất thường, phân cụm khách hàng và định giá động. Kết quả được
          Frontend React (tab <Code>AnalyticsAITab.jsx</Code> dùng Recharts) hiển thị, không phải Streamlit.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="4" label="Bài toán AI" tone="info" />
        <Stat value="LightGBM" label="Demand (winner)" tone="success" />
        <Stat value="K-Means K=4" label="Segmentation" tone="info" />
        <Stat value=":8004" label="forecast-service" tone="warning" />
      </Grid>

      <Callout tone="warning" title="Trạng thái code hiện tại = scaffold">
        Các endpoint đã có thật trong <Code>forecast-service</Code> nhưng phần lớn trả kết quả mock/rule-based:
        <Code>demand.py</Code> sinh chuỗi seasonal giả (response ghi <Code>model_used="LightGBM"</Code>),
        <Code>anomaly.py</Code> đã dùng <Code>IsolationForest</Code> thật của sklearn, <Code>rfm.py</Code> chạy
        <Code>KMeans(K=4)</Code> thật (fallback simulation nếu DB rỗng), <Code>pricing.py</Code> chấm điểm bằng
        rule (mô phỏng output XGBoost). Tài liệu này là KẾ HOẠCH nâng cấp trên nền scaffold đó.
      </Callout>

      <H3>4 bài toán AI của Dashboard</H3>
      <Table
        headers={["Bài toán", "Input (nguồn MariaDB)", "Output", "Giá trị nghiệp vụ"]}
        striped
        rows={[
          [
            <Text weight="bold">Demand Forecasting</Text>,
            "Doanh thu/đơn theo ngày tổng hợp từ ecommerce_order_db (orders, order_items) + lịch lễ, khuyến mãi",
            "Dự báo số lượng / doanh thu 30 ngày kèm lower/upper bound",
            "Admin chủ động nhập hàng, lập kế hoạch tồn kho & khuyến mãi",
          ],
          [
            <Text weight="bold">Anomaly Detection</Text>,
            "Chuỗi metric giao dịch (giá trị đơn, tần suất, hành vi thanh toán)",
            "Gắn cờ giao dịch/khoảng thời gian bất thường kèm risk score",
            "Phát hiện gian lận, lỗi checkout, tấn công sớm",
          ],
          [
            <Text weight="bold">Customer Segmentation</Text>,
            "RFM tính từ orders (userId = Keycloak UUID, createdAt, total_amount)",
            "Nhãn segmentationLabel ghi ngược về user-service (MariaDB)",
            "Cá nhân hóa marketing, win-back, loyalty program",
          ],
          [
            <Text weight="bold">Dynamic Pricing</Text>,
            "userId, productId, customerTier, segmentationLabel, cartTotal",
            "aiPriceScore (0–1) + recommendedAction → Camunda workflow",
            "Định giá/giảm giá cá nhân hóa để giữ chân & tăng chuyển đổi",
          ],
        ]}
        columnAlign={["left","left","left","left"]}
      />

      <H3>Dữ liệu cần chuẩn bị (đều trên MariaDB, KHÔNG dùng PostgreSQL)</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Time-series (cho Forecasting + Anomaly)</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Nguồn thật", "Trường dùng", "Cách tổng hợp"]}
              rows={[
                [<Code>ecommerce_order_db.orders</Code>, "created_at, total_amount, status", "GROUP BY DATE(created_at) → doanh thu ngày"],
                [<Code>ecommerce_order_db.order_items</Code>, "product_id, quantity, order_id", "JOIN orders → nhu cầu theo sản phẩm/ngày"],
                [<Code>promotions (BE)</Code>, "start_date, end_date, discount_pct", "Feature is_promotion / discount_pct"],
                [<Code>Redis cache</Code>, "kết quả forecast/segment", "Cache TTL, tránh tính lại mỗi request"],
              ]}
              columnAlign={["left","left","left"]}
            />
            <Text size="small" tone="tertiary" style={{ marginTop: 8 }}>
              Chưa có bảng <Code>daily_revenue</Code> đúc sẵn — cần một job aggregate từ <Code>orders</Code>. Nên tối
              thiểu 6 tháng lịch sử cho Forecasting, 3 tháng cho Anomaly Detection.
            </Text>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Dữ liệu khách hàng (cho Segmentation & Pricing)</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Table
                framed={false} striped
                headers={["Trường", "Tính từ nguồn thật"]}
                rows={[
                  [<Code>user_id</Code>, "orders.userId (Keycloak UUID, String)"],
                  [<Code>recency</Code>, "DATEDIFF(NOW(), MAX(created_at)) WHERE status='DELIVERED'"],
                  [<Code>frequency</Code>, "COUNT(id) GROUP BY user_id"],
                  [<Code>monetary</Code>, "SUM(total_amount) GROUP BY user_id"],
                  [<Code>customerTier</Code>, "user-service: DIAMOND/GOLD/SILVER/BRONZE/MEMBER"],
                  [<Code>segmentationLabel</Code>, "user-service: Loyal/AtRisk/New/Dormant/Churned (ghi ngược)"],
                ]}
                columnAlign={["left","left"]}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader>External data — tích hợp để tăng độ chính xác (kế hoạch)</CardHeader>
        <CardBody>
          <Grid columns={3} gap={12}>
            <Stack gap={4}>
              <Tag label="OpenWeatherMap API" tone="info" />
              <Text tone="secondary" size="small">Nhiệt độ, mưa/nắng theo ngày tại các thành phố lớn. Ảnh hưởng đến doanh số một số nhóm hàng.</Text>
              <Text size="small" tone="tertiary">Free: 1.000 calls/ngày</Text>
            </Stack>
            <Stack gap={4}>
              <Tag label="Lịch lễ tết Việt Nam" tone="warning" />
              <Text tone="secondary" size="small">Hardcode ngày lễ lớn: Tết, 8/3, 20/10, Black Friday, 12/12. Feature quan trọng nhất cho seasonality.</Text>
              <Text size="small" tone="tertiary">Tạo sẵn file holidays.json</Text>
            </Stack>
            <Stack gap={4}>
              <Tag label="Promotion calendar" tone="success" />
              <Text tone="secondary" size="small">Lịch khuyến mãi lịch sử: mỗi campaign có start/end date và discount_pct.</Text>
              <Text size="small" tone="tertiary">Từ promotion-service (BE)</Text>
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
        <H2>Demand Forecasting — Dự báo nhu cầu 30 ngày tới</H2>
        <Text tone="secondary">
          Train 3 model, đánh giá bằng MAPE và RMSE, deploy model tốt nhất. Endpoint thật:
          <Code>GET /api/v1/forecast?productId=&amp;days=30</Code> (response <Code>model_used="LightGBM"</Code>) và
          <Code>GET /api/v1/admin/analytics/demand-forecasting</Code> (dữ liệu vẽ biểu đồ cho FE).
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

      <Callout tone="info" title="Model đang wired trong codebase">
        <Code>forecast-service/app/services/demand.py</Code> hiện trả chuỗi seasonal mock và endpoint ghi cứng
        <Code>model_used="LightGBM"</Code> — đúng với lựa chọn winner ở đây. Bước triển khai thật là thay phần
        mock bằng LightGBM đã train + Prophet làm alt dễ, LSTM/TFT khi đủ dữ liệu.
      </Callout>

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
                    [<Code>is_promotion</Code>, "promotion-service"],
                    [<Code>discount_pct</Code>, "promotion-service"],
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

      <H3>Prophet — Implement nhanh (alt dễ nhất)</H3>
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
              Prophet tự tạo <Code>yhat_lower</Code> và <Code>yhat_upper</Code> (80% CI) — khớp với 3 trường
              <Code>predicted_quantity / lower_bound / upper_bound</Code> mà endpoint <Code>/forecast</Code> đang trả.
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
        <H2>Anomaly Detection — Phát hiện bất thường</H2>
        <Text tone="secondary">
          AI gắn cờ giao dịch/khoảng thời gian bất thường (gian lận, lỗi checkout, DDoS). Endpoint thật:
          <Code>POST /api/v1/anomaly</Code> (body <Code>historical_data: float[]</Code>) và
          <Code>GET /api/v1/admin/analytics/anomalies</Code> (feed danh sách cảnh báo cho FE).
        </Text>
      </Stack>

      <Table
        headers={["Model", "Ý tưởng", "Ưu điểm", "Hạn chế", "F1 điển hình", "Trạng thái"]}
        striped
        rows={[
          [
            <Text weight="bold">Isolation Forest</Text>,
            "Isolate bất thường bằng random splits — anomaly dễ isolate hơn",
            "Sklearn 3 dòng. Nhanh. Không cần label. Tốt cho tabular data.",
            "Kém với time-series có seasonality mạnh. Khó tune threshold.",
            "0.65–0.75",
            <Pill tone="success" size="sm">Đã wired (sklearn)</Pill>,
          ],
          [
            <Text weight="bold">LSTM Autoencoder</Text>,
            "Học pattern 'bình thường', reconstruction error cao = bất thường",
            "Tốt nhất cho time-series. Phát hiện nhiều dạng anomaly phức tạp.",
            "Train cần 2–4 giờ. Cần đủ dữ liệu bình thường để train.",
            "0.78–0.88",
            <Pill tone="info" size="sm">Nâng cấp</Pill>,
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

      <Callout tone="info" title="Model đang wired trong codebase">
        <Code>forecast-service/app/services/anomaly.py</Code> dùng <Code>IsolationForest(contamination=0.05, random_state=42)</Code>
        thật: fit trên toàn bộ chuỗi trừ điểm cuối (lịch sử "bình thường"), predict điểm cuối, map
        <Code>decision_function</Code> qua sigmoid thành <Code>confidence_score</Code>, và trả
        <Code>threshold_value</Code> = percentile 5. LSTM-AE là hướng nâng cấp cho phân tích sâu.
      </Callout>

      <H3>Isolation Forest — chi tiết đang chạy</H3>
      <Card>
        <CardHeader>Pipeline thật trong anomaly.py</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              1. Yêu cầu tối thiểu 5 điểm dữ liệu; nếu ít hơn trả <Code>is_anomaly=False</Code>.
            </Text>
            <Text tone="secondary" size="small">
              2. <Code>X = np.array(data).reshape(-1,1)</Code>; train trên <Code>X[:-1]</Code>, target là <Code>X[-1]</Code>.
            </Text>
            <Text tone="secondary" size="small">
              3. <Code>clf.predict(target)</Code>: -1 = anomaly, 1 = normal. <Code>confidence = sigmoid(decision_function)</Code>.
            </Text>
            <Text tone="secondary" size="small">
              4. Với admin dashboard, danh sách cảnh báo (mã giao dịch, số tiền, riskScore, lý do) trả từ
              <Code>/admin/analytics/anomalies</Code> để render bảng cờ đỏ.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>LSTM Autoencoder — nâng cấp cho time-series</H3>
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
              <Text weight="semibold">Xác định ngưỡng anomaly</Text>
              <Text tone="secondary" size="small">
                Tính reconstruction error trên toàn bộ training data.
                Ngưỡng = mean + 3×std của reconstruction errors (3-sigma rule).
                Tuning: điều chỉnh multiplier (2.5–4) dựa trên false positive rate chấp nhận được.
              </Text>
            </Stack>
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
          ["Giao dịch giá trị cao bất thường", "Amount &gt; mean + 4σ (gian lận?)", <Pill tone="info" size="sm">Info</Pill>, "Gắn cờ đỏ + manual review"],
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
        <H2>Customer Segmentation — RFM + K-Means (K=4)</H2>
        <Text tone="secondary">
          Phân nhóm khách hàng tự động rồi ghi nhãn ngược về user-service. Endpoint thật:
          <Code>POST /api/v1/rfm/trigger</Code> (chạy clustering) và <Code>GET /api/v1/admin/analytics/segmentation</Code>
          (phân bố nhóm cho biểu đồ FE). Wired trong <Code>rfm.py</Code>.
        </Text>
      </Stack>

      <H3>Bước 1 — Tính RFM cho mỗi khách hàng (query thật)</H3>
      <Card>
        <CardHeader>SQL đang chạy trong rfm.py trên MariaDB (ecommerce_order_db)</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Table
              framed={false} striped
              headers={["Chỉ số", "Công thức (thật)", "Ý nghĩa"]}
              rows={[
                [<Text weight="bold">R (Recency)</Text>, "DATEDIFF(NOW(), MAX(created_at))", "Càng nhỏ càng tốt — mua gần đây"],
                [<Text weight="bold">F (Frequency)</Text>, "COUNT(id) GROUP BY user_id", "Càng lớn càng tốt — mua thường xuyên"],
                [<Text weight="bold">M (Monetary)</Text>, "SUM(total_amount) GROUP BY user_id", "Càng lớn càng tốt — chi tiêu nhiều"],
              ]}
              columnAlign={["left","left","left"]}
            />
            <Text tone="secondary" size="small">
              SQL: <Code>SELECT user_id, DATEDIFF(NOW(), MAX(created_at)) AS recency, COUNT(id) AS frequency, SUM(total_amount) AS monetary FROM orders WHERE status='DELIVERED' GROUP BY user_id</Code>.
              <Code>user_id</Code> = <Code>orders.userId</Code> (Keycloak UUID). Nếu DB rỗng, <Code>rfm.py</Code> chạy simulation 100 user.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>Bước 2 — Normalize và K-Means (K=4)</H3>
      <Card>
        <CardHeader>Pipeline thật trong rfm.py</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2.1</Pill><Text weight="semibold">Normalize</Text></Row>
              <Text tone="secondary" size="small">
                <Code>MinMaxScaler()</Code> trên [recency, frequency, monetary] (đúng như code hiện tại). Có thể nâng cấp:
                clip outlier percentile 1%/99% cho M và log-transform nếu skewed, đổi sang <Code>StandardScaler</Code>.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2.2</Pill><Text weight="semibold">Chọn K (K=4 đang dùng)</Text></Row>
              <Text tone="secondary" size="small">
                Code cố định <Code>KMeans(n_clusters=4, random_state=42, n_init='auto')</Code>. Để bảo vệ đồ án nên bổ sung
                Elbow (WCSS) + Silhouette cho K = 3..7 chứng minh K=4 tối ưu về mặt nghiệp vụ.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2.3</Pill><Text weight="semibold">Gán nhãn cluster</Text></Row>
              <Text tone="secondary" size="small">
                Tính <Code>cluster_means</Code> theo (R,F,M) rồi rule-map: F&amp;M cao + R thấp → VIP; R rất cao → At Risk;
                F thấp + R thấp → New; còn lại → Potential Loyalists. Đây là 4 cluster gốc.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Bước 3 — Ánh xạ sang segmentationLabel (enum thật của user-service)</H3>
      <Text tone="secondary" size="small">
        user-service lưu <Code>segmentationLabel</Code> với 5 giá trị. K-Means cho 4 cluster; tách thêm
        <Code>Dormant</Code>/<Code>Churned</Code> khỏi "At Risk" bằng ngưỡng recency (vd R &gt; 180 ngày = Churned).
      </Text>
      <Table
        headers={["segmentationLabel", "Nhãn hiển thị VN", "R (ngày)", "F/M", "Chiến lược marketing", "customerTier gợi ý"]}
        striped
        rows={[
          [<Pill tone="success" size="sm">Loyal</Pill>, "VIP / Trung thành", "&lt; 30", "F&gt;10, M cao", "Loyalty, early access, ưu đãi riêng", "DIAMOND / GOLD"],
          [<Pill tone="info" size="sm">New</Pill>, "Khách mới", "&lt; 30", "F=1, M thấp", "Onboarding, first-repeat incentive", "MEMBER / BRONZE"],
          [<Pill tone="warning" size="sm">AtRisk</Pill>, "Nguy cơ rời bỏ", "90–180", "F 1–3", "Win-back: coupon, email 'nhớ bạn'", "SILVER / BRONZE"],
          [<Pill tone="neutral" size="sm">Dormant</Pill>, "Ngủ đông", "180–365", "Bất kỳ", "Reactivation campaign, ưu đãi mạnh", "BRONZE / MEMBER"],
          [<Pill tone="danger" size="sm">Churned</Pill>, "Đã rời bỏ", "&gt; 365", "Bất kỳ", "Chiến dịch cuối, hoặc loại khỏi target", "MEMBER"],
        ]}
        rowTone={["success", "info", "warning", "neutral", "danger"]}
        columnAlign={["left","left","center","center","left","center"]}
      />

      <H3>Bước 4 — Ghi ngược nhãn về user-service</H3>
      <Card>
        <CardHeader>Write-back (đích thật)</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              Với mỗi user, gọi <Code>PUT {`{USER_SERVICE_URL}`}/api/internal/users/{`{id}`}/segmentation</Code>
              (env <Code>USER_SERVICE_URL=http://be-user-service:8085</Code>). user-service cập nhật cột
              <Code>segmentationLabel</Code> trong <Code>ecommerce_user_db.users</Code>.
            </Text>
            <Text size="small" tone="tertiary">
              Lưu ý: trong code hiện tại lời gọi HTTP PUT đang bị comment (chỉ đếm success) — cần bật thật khi go-live.
            </Text>
            <Callout tone="success" title="Điểm cộng: Tự động re-segment định kỳ">
              Chạy lại <Code>/rfm/trigger</Code> theo tuần (cron). So % mỗi nhóm tuần này vs tuần trước.
              Alert khi nhóm AtRisk/Dormant tăng &gt; 5% — Admin cần launch win-back ngay.
            </Callout>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 5: DYNAMIC PRICING → CAMUNDA ─────────────────────────────────────────

function PricingTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Dynamic Pricing — Định giá động cá nhân hóa → Camunda</H2>
        <Text tone="secondary">
          Chấm điểm độ nhạy giá (price sensitivity/elasticity) theo từng user/segment rồi phát ra hành động
          giảm giá. Endpoint thật: <Code>POST /api/v1/pricing/predict</Code> (wired trong <Code>pricing.py</Code>).
          Output được nạp vào Camunda workflow engine để phối hợp với promotion-service.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="/pricing/predict" label="Endpoint" tone="info" />
        <Stat value="0.0–1.0" label="aiPriceScore" tone="warning" />
        <Stat value="3 actions" label="recommendedAction" tone="success" />
        <Stat value="Camunda" label="Workflow engine" tone="info" />
      </Grid>

      <H3>Input / Output (khớp PricingRequest / PricingResponse)</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Input — PricingRequest</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Trường", "Kiểu", "Ý nghĩa / nguồn"]}
              rows={[
                [<Code>userId</Code>, "int", "Định danh khách hàng"],
                [<Code>productId</Code>, "int", "Sản phẩm đang xét (Product.id Long)"],
                [<Code>customerTier</Code>, "str", "DIAMOND/GOLD/SILVER/BRONZE/MEMBER (user-service)"],
                [<Code>segmentationLabel</Code>, "str", "Loyal/AtRisk/New/Dormant/Churned"],
                [<Code>cartTotal</Code>, "float", "Tổng giỏ hàng hiện tại (VNĐ)"],
              ]}
              columnAlign={["left","left","left"]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Output — PricingResponse</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Trường", "Kiểu", "Ý nghĩa"]}
              rows={[
                [<Code>aiPriceScore</Code>, "float", "Độ nhạy giá 0–1 (cao = dễ rời nếu không giảm)"],
                [<Code>recommendedAction</Code>, "str", "GIVE_HIGH_DISCOUNT / GIVE_LOW_DISCOUNT / NO_DISCOUNT"],
              ]}
              columnAlign={["left","left","left"]}
            />
            <Text size="small" tone="tertiary" style={{ marginTop: 8 }}>
              Ngưỡng: score &ge; 0.70 → HIGH; &ge; 0.40 → LOW; còn lại → NO_DISCOUNT.
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <H3>Logic chấm điểm (rule đang chạy — mô phỏng output XGBoost)</H3>
      <Table
        headers={["Yếu tố", "Điều kiện", "Δ score", "Diễn giải nghiệp vụ"]}
        striped
        rows={[
          ["Base", "Mặc định", "0.45", "Điểm nền cho mọi khách hàng"],
          ["customerTier", "VIP / GOLD", "-0.15 / -0.05", "Khách cao cấp ít nhạy giá, coi trọng brand/dịch vụ"],
          ["segmentationLabel", "AtRisk / New", "+0.35 / +0.15", "Sắp rời bỏ → rất cần incentive; khách mới cần kích hoạt"],
          ["cartTotal", "&gt; 2tr / &lt; 200k", "+0.10 / -0.10", "Giỏ lớn nhạy giá hơn; giỏ nhỏ ít cần giảm"],
        ]}
        columnAlign={["left","left","center","left"]}
        rowTone={["neutral", undefined, undefined, undefined]}
      />

      <Callout tone="info" title="Model đang wired & hướng nâng cấp">
        <Code>pricing.py</Code> hiện là rule-based (mô phỏng output của một XGBoost classifier như comment trong code
        ghi). Bước triển khai thật: train XGBoost/elasticity model trên lịch sử đơn + phản hồi khuyến mãi, giữ nguyên
        contract <Code>aiPriceScore</Code>/<Code>recommendedAction</Code> để không phá vỡ tích hợp Camunda.
      </Callout>

      <H3>Luồng tích hợp Camunda + promotion-service</H3>
      <Card>
        <CardHeader>Từ recommendedAction đến giảm giá thực tế</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Row gap={6} align="center" wrap>
              <Pill tone="neutral" size="sm">1</Pill>
              <Text tone="secondary" size="small">Checkout/cart flow gọi gateway <Code>POST /api/v1/pricing/predict</Code> (admin/nội bộ) với ngữ cảnh user + giỏ.</Text>
            </Row>
            <Row gap={6} align="center" wrap>
              <Pill tone="neutral" size="sm">2</Pill>
              <Text tone="secondary" size="small">forecast-service trả <Code>aiPriceScore + recommendedAction</Code>.</Text>
            </Row>
            <Row gap={6} align="center" wrap>
              <Pill tone="neutral" size="sm">3</Pill>
              <Text tone="secondary" size="small">Kết quả đưa vào biến process của <Text weight="semibold" as="span">Camunda</Text>; một BPMN gateway rẽ nhánh theo action (HIGH/LOW/NO_DISCOUNT).</Text>
            </Row>
            <Row gap={6} align="center" wrap>
              <Pill tone="neutral" size="sm">4</Pill>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">promotion-service</Text> phát mã/áp % giảm tương ứng; thay đổi phản ánh vào giá đơn.</Text>
            </Row>
            <Row gap={6} align="center" wrap>
              <Pill tone="neutral" size="sm">5</Pill>
              <Text tone="secondary" size="small">Phản hồi mua/không mua quay lại làm nhãn train cho model elasticity (vòng lặp cải tiến).</Text>
            </Row>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 6: DASHBOARD ADMIN (REACT + RECHARTS) & TÍCH HỢP ─────────────────────

function IntegrationTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Dashboard Admin (React + Recharts) & Tích hợp hệ thống</H2>
        <Text tone="secondary">
          Dashboard được giao là một trang <Text weight="semibold" as="span">React admin</Text> —
          <Code>features/admin/pages/AdminDashboardPage.jsx</Code>, tab <Code>analytics-ai</Code> render
          <Code>AnalyticsAITab.jsx</Code> dùng <Text weight="semibold" as="span">Recharts</Text>, lấy dữ liệu qua
          <Code>services/aiApi.ts</Code> gọi forecast-service. KHÔNG phải Streamlit.
        </Text>
      </Stack>

      <Callout tone="neutral" title="Streamlit chỉ là tool prototyping nội bộ (tùy chọn)">
        Có thể dùng Streamlit để nội bộ thử nghiệm model nhanh, nhưng sản phẩm bàn giao cho admin là React + Recharts.
        Dashboard người dùng cuối luôn là React.
      </Callout>

      <H3>Frontend — AnalyticsAITab.jsx (Recharts)</H3>
      <Card>
        <CardHeader>3 sub-view trong tab AI, hiện fed bằng aiApi với mock fallback</CardHeader>
        <CardBody>
          <Table
            framed={false} striped
            headers={["Sub-view", "Recharts", "Nguồn dữ liệu (aiApi.ts)", "Nội dung"]}
            rows={[
              ["Dự Báo Nhu Cầu", "AreaChart (Thực tế vs Dự báo)", <Code>getDemandForecasting()</Code>, "Biểu đồ 30 ngày + bảng khuyến nghị tồn kho"],
              ["Phát Hiện Bất Thường", "Bảng cờ đỏ", <Code>getAnomalyLogs()</Code>, "Danh sách giao dịch rủi ro + thao tác khóa user"],
              ["Phân Cụm KH", "BarChart + PieChart", <Code>getCustomerSegmentation()</Code>, "Số lượng nhóm + tỷ trọng doanh thu + targeted campaign"],
            ]}
            columnAlign={["left","left","left","left"]}
          />
          <Text size="small" tone="tertiary" style={{ marginTop: 8 }}>
            Tất cả gọi qua <Code>apiClient</Code> (base <Code>VITE_API_URL || http://localhost:8080/api/v1</Code>, tự gắn
            Bearer token Keycloak). Khi API AI chưa sẵn sàng, mỗi hàm rơi vào catch trả mock — nên hiện dashboard chạy bằng mock.
          </Text>
        </CardBody>
      </Card>

      <H3>Backend — cấu trúc forecast-service (FastAPI)</H3>
      <Table
        headers={["File / module", "Vai trò"]}
        striped
        rows={[
          [<Code>app/main.py</Code>, "FastAPI app, include router forecast + pricing với prefix API_V1_STR='/api/v1', /health"],
          [<Code>api/endpoints/forecast.py</Code>, "GET /forecast, POST /anomaly, POST /rfm/trigger, GET /admin/analytics/*"],
          [<Code>api/endpoints/pricing.py</Code>, "POST /pricing/predict"],
          [<Code>services/demand.py</Code>, "DemandForecastingService (LightGBM/Prophet — hiện mock seasonal)"],
          [<Code>services/anomaly.py</Code>, "AnomalyDetectionService (IsolationForest sklearn — thật)"],
          [<Code>services/rfm.py</Code>, "RfmSegmentationService (KMeans K=4, MinMaxScaler, write-back user-service)"],
          [<Code>services/pricing.py</Code>, "DynamicPricingService (rule-based, mô phỏng XGBoost)"],
          [<Code>shared_common</Code>, "get_mysql_connection() (pymysql/MariaDB), get_redis_client(), logger, settings"],
        ]}
        columnAlign={["left","left"]}
      />

      <H3>Bảng API thật (qua gateway :8080)</H3>
      <Table
        headers={["Method + Path (gateway)", "forecast-service", "Auth", "Dùng bởi"]}
        striped
        rows={[
          [<Code>GET /api/v1/admin/analytics/demand-forecasting</Code>, "get_admin_demand_forecasting()", <Pill tone="warning" size="sm">ADMIN/STAFF</Pill>, "AnalyticsAITab (AreaChart)"],
          [<Code>GET /api/v1/admin/analytics/anomalies</Code>, "get_admin_anomalies()", <Pill tone="warning" size="sm">ADMIN/STAFF</Pill>, "AnalyticsAITab (bảng)"],
          [<Code>GET /api/v1/admin/analytics/segmentation</Code>, "get_admin_segmentation()", <Pill tone="warning" size="sm">ADMIN/STAFF</Pill>, "AnalyticsAITab (Bar/Pie)"],
          [<Code>POST /api/v1/pricing/predict</Code>, "get_price_sensitivity()", <Pill tone="warning" size="sm">ADMIN/STAFF</Pill>, "Checkout flow → Camunda"],
          [<Code>GET /api/v1/forecast?productId=&amp;days=</Code>, "get_demand_forecast()", <Pill tone="info" size="sm">Nội bộ</Pill>, "Inventory planning"],
          [<Code>POST /api/v1/anomaly</Code>, "detect_metric_anomaly()", <Pill tone="info" size="sm">Nội bộ</Pill>, "Metric monitor"],
          [<Code>POST /api/v1/rfm/trigger</Code>, "trigger_rfm_clustering()", <Pill tone="info" size="sm">Nội bộ/cron</Pill>, "Re-segment định kỳ"],
        ]}
        columnAlign={["left","left","center","left"]}
      />
      <Text size="small" tone="tertiary">
        Gateway route <Code>/api/v1/admin/analytics/**</Code> và <Code>/api/v1/pricing/**</Code> chia sẻ circuit breaker
        <Code>ai-engine-cb</Code> (30s) + time limiter 30s + Redis rate limiting.
      </Text>

      <H3>Tích hợp thực tế trong dự án</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Service & Auth</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">Service:</Text> <Code>forecast-service</Code> FastAPI, cổng <Code>:8004</Code>, network Docker <Code>be_ecommerce-network</Code>.</Text>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">Gateway:</Text> <Code>/api/v1/admin/analytics/**</Code> + <Code>/api/v1/pricing/**</Code>, chỉ role <Code>ADMIN/STAFF</Code>.</Text>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">JWT:</Text> chỉ verify tại gateway (Keycloak realm <Code>ecommerce-realm</Code>); gateway inject <Code>X-User-Id</Code> (UUID) — service không tự parse JWT.</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Datastore & Downstream</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">Đọc:</Text> MariaDB <Code>ecommerce_order_db</Code> (orders/order_items) cho RFM &amp; forecast; cache Redis.</Text>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">Ghi:</Text> <Code>segmentationLabel</Code> về user-service (<Code>ecommerce_user_db.users</Code>) qua <Code>USER_SERVICE_URL=http://be-user-service:8085</Code>.</Text>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">Downstream:</Text> Dynamic Pricing → <Code>Camunda</Code> workflow → promotion-service.</Text>
              <Text tone="secondary" size="small"><Text weight="semibold" as="span">FE consumer:</Text> <Code>AnalyticsAITab.jsx</Code> (Recharts, hiện mock fallback).</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Callout tone="warning" title="Known FE wiring cần sửa khi backend go-real">
        <Code>aiApi.ts</Code> đọc <Code>response.data</Code> trong khi <Code>apiClient</Code> đã unwrap <Code>.data</Code>
        → double-unwrap (đang bị mock catch che). Cần thống nhất một contract envelope khi bật API thật.
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
          <H1>Dashboard AI — forecast-service (:8004)</H1>
          <Text tone="secondary">Demand Forecasting · Anomaly Detection · Customer Segmentation · Dynamic Pricing → Camunda · React + Recharts</Text>
        </Stack>
        <Row gap={8} wrap>
          {TABS.map(t => <Pill key={t.id} active={t.id === activeTab} onClick={() => setActiveTab(t.id)}>{t.label}</Pill>)}
        </Row>
        <Grid columns={5} gap={8}>
          <Stat value="LightGBM" label="Best forecaster" tone="success" />
          <Stat value="IsoForest→LSTM-AE" label="Anomaly" tone="warning" />
          <Stat value="K=4" label="RFM segments" tone="info" />
          <Stat value="XGBoost*" label="Pricing (rule now)" tone="info" />
          <Stat value="React+Recharts" label="Dashboard" tone="success" />
        </Grid>
        <Divider />
      </Stack>
      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "overview"    && <OverviewTab />}
        {activeTab === "forecast"    && <ForecastTab />}
        {activeTab === "anomaly"     && <AnomalyTab />}
        {activeTab === "segment"     && <SegmentTab />}
        {activeTab === "pricing"     && <PricingTab />}
        {activeTab === "integration" && <IntegrationTab />}
      </Stack>
    </Stack>
  );
}
