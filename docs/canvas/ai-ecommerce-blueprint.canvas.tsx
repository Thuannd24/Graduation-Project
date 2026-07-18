/**
 * Blueprint AI — AuraTech (đã align với codebase thực tế)
 * File index: tổng quan kiến trúc 4 AI microservices + tóm tắt từng module.
 * Chi tiết từng module xem các canvas riêng: visual-search, text-search,
 * recommendation-complete, dashboard-ai, chatbot-ai.
 */
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const MODULES = [
  { id: "overview", label: "Tổng quan & Kiến trúc" },
  { id: "search",   label: "Search (Visual + Text)" },
  { id: "recs",     label: "Recommendation" },
  { id: "analytics",label: "Dashboard & Forecast" },
  { id: "chatbot",  label: "Chatbot & NLP" },
];

function Tag({ label, tone }: { label: string; tone?: "info" | "success" | "warning" | "neutral" | "danger" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

function WinnerBadge({ label }: { label?: string }) {
  return <Pill tone="success" size="sm">{label ?? "Đang dùng"}</Pill>;
}

type ModelRow = {
  name: string;
  type: string;
  pros: string;
  cons: string;
  trainDiff: "De" | "TrungBinh" | "Kho";
  expectedPerf: string;
  winner?: boolean;
};

function ModelCompareTable({ models, metric }: { models: ModelRow[]; metric: string }) {
  const diffLabel = (d: ModelRow["trainDiff"]) => {
    if (d === "De") return <Pill tone="success" size="sm">Dễ</Pill>;
    if (d === "TrungBinh") return <Pill tone="info" size="sm">Trung bình</Pill>;
    return <Pill tone="warning" size="sm">Khó</Pill>;
  };
  return (
    <Table
      headers={["Model", "Kiến trúc", "Ưu điểm", "Hạn chế", "Độ khó train", `Hiệu suất (${metric})`, ""]}
      striped
      rows={models.map(m => [
        <Text weight={m.winner ? "bold" : "normal"}>{m.name}</Text>,
        <Tag label={m.type} tone="neutral" />,
        <Text size="small" tone="secondary">{m.pros}</Text>,
        <Text size="small" tone="secondary">{m.cons}</Text>,
        diffLabel(m.trainDiff),
        <Text weight="semibold">{m.expectedPerf}</Text>,
        m.winner ? <WinnerBadge /> : null,
      ])}
      rowTone={models.map(m => m.winner ? "success" as const : undefined)}
      columnAlign={["left", "center", "left", "left", "center", "center", "center"]}
    />
  );
}

// ─── OVERVIEW ───────────────────────────────────────────────────────────────

function OverviewTab() {
  const theme = useHostTheme();
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>Kiến trúc AI: 4 FastAPI microservices sau API Gateway</H2>
        <Text tone="secondary">
          Tầng AI (<Code>AI/</Code>) tách biệt, ngang hàng với <Code>BE/</Code> và <Code>FE/</Code>. Gồm 4 service FastAPI
          dùng chung thư viện <Code>shared-common</Code>, join network <Code>be_ecommerce-network</Code>, đứng sau
          Spring Cloud Gateway (<Code>:8080</Code>). Mỗi module: train 2–3 model cạnh tranh → chọn tốt nhất để deploy.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="4" label="AI microservices" />
        <Stat value="8" label="Bài toán AI" tone="info" />
        <Stat value=":8080" label="Qua API Gateway" tone="neutral" />
        <Stat value="1 best" label="Model deploy / bài toán" tone="success" />
      </Grid>

      <Divider />

      <H3>4 microservices AI</H3>
      <Table
        headers={["Service", "Cổng", "Bài toán / Model đang dùng", "Gateway path", "Datastore chính"]}
        striped
        rows={[
          [
            <Text weight="semibold">search-service</Text>, <Code>:8001</Code>,
            <Row gap={4} wrap><Tag label="Visual: CLIP" tone="info" /><Tag label="Text: e5-large + BM25 (RRF)" tone="warning" /></Row>,
            <Code>/api/v1/search/**</Code>,
            "Elasticsearch + FAISS + Redis",
          ],
          [
            <Text weight="semibold">chatbot-service</Text>, <Code>:8002</Code>,
            <Row gap={4} wrap><Tag label="RAG + Gemini" tone="success" /><Tag label="PhoBERT intent/sentiment" tone="info" /></Row>,
            <Code>/api/v1/chatbot/**</Code>,
            "Redis (memory) + Mongo/MariaDB",
          ],
          [
            <Text weight="semibold">recs-service</Text>, <Code>:8003</Code>,
            <Row gap={4} wrap><Tag label="SASRec (PyTorch)" tone="info" /><Tag label="Trending cold-start" tone="neutral" /></Row>,
            <Code>/api/v1/recommendations/**</Code>,
            "MariaDB + Redis + Mongo (similarities)",
          ],
          [
            <Text weight="semibold">forecast-service</Text>, <Code>:8004</Code>,
            <Row gap={4} wrap><Tag label="LightGBM" tone="warning" /><Tag label="K-Means RFM" tone="success" /><Tag label="Anomaly" tone="danger" /><Tag label="Dynamic Pricing" tone="info" /></Row>,
            <Code>/api/v1/admin/analytics/** · /pricing/**</Code>,
            "MariaDB + Redis",
          ],
        ]}
        columnAlign={["left", "center", "left", "left", "left"]}
      />

      <H3>Hạ tầng dùng chung (khác với giả định monolith/PostgreSQL)</H3>
      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader>Datastores</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small" tone="secondary"><Text weight="semibold" as="span">MariaDB</Text> — product/order/user (quan hệ). ID sản phẩm = Long.</Text>
              <Text size="small" tone="secondary"><Text weight="semibold" as="span">MongoDB</Text> — ecommerce_product_nosql, collection product_similarities.</Text>
              <Text size="small" tone="secondary"><Text weight="semibold" as="span">Redis</Text> — cache, session, chat memory, trending sorted-set.</Text>
              <Text size="small" tone="secondary"><Text weight="semibold" as="span">Elasticsearch</Text> — index products (BM25 keyword).</Text>
              <Text size="small" tone="secondary"><Text weight="semibold" as="span">MinIO</Text> — bucket product-images (URL public).</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Giao tiếp & Auth</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small" tone="secondary">Gateway verify Keycloak JWT (chỉ tại gateway), inject <Code>X-User-Id</Code> (UUID) cho AI service đọc.</Text>
              <Text size="small" tone="secondary">BE: Spring Boot + Eureka + gRPC + Kafka (event-driven, Outbox/Debezium).</Text>
              <Text size="small" tone="secondary">AI đọc tín hiệu hành vi qua Kafka (order/cart/review events).</Text>
              <Text size="small" tone="secondary">Route AI share circuit breaker <Code>ai-engine-cb</Code> (30s) + rate limit Redis.</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Frontend tiêu thụ</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text size="small" tone="secondary">React 19 + Vite, base <Code>VITE_API_URL=/api/v1</Code>.</Text>
              <Text size="small" tone="secondary"><Code>services/aiApi.ts</Code> đã gọi search/chatbot/recs/analytics (đang mock fallback).</Text>
              <Text size="small" tone="secondary">Admin dashboard React + Recharts (<Code>AnalyticsAITab.jsx</Code>) — KHÔNG phải Streamlit.</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Callout tone="warning" title="Trạng thái codebase: scaffold → cần implement">
        Các service AI hiện là khung (endpoint + model load, phần lớn trả kết quả mock). Bộ canvas này là
        <Text weight="semibold" as="span"> bản plan để hiện thực hóa</Text> trên khung đó — mỗi canvas chi tiết ghi rõ "đã có" vs "cần build".
      </Callout>

      <H3>Tổng hợp model theo bài toán (winner = model đã wired trong code)</H3>
      <Table
        headers={["Bài toán", "Service", "Models so sánh", "Metric", "Model đang dùng"]}
        striped
        rows={[
          [
            <Text weight="semibold">Visual Search</Text>, <Code>:8001</Code>,
            <Row gap={4} wrap><Tag label="CLIP" tone="info" /><Tag label="DINOv2" tone="warning" /><Tag label="EfficientNet-B3" tone="neutral" /></Row>,
            "Recall@10, mAP",
            <Pill tone="success" size="sm">CLIP ViT-B/32</Pill>,
          ],
          [
            <Text weight="semibold">Text Search</Text>, <Code>:8001</Code>,
            <Row gap={4} wrap><Tag label="multilingual-e5" tone="info" /><Tag label="PhoBERT" tone="warning" /><Tag label="MiniLM-L12" tone="neutral" /></Row>,
            "MRR@10, NDCG@10",
            <Pill tone="success" size="sm">e5-large + BM25 (RRF)</Pill>,
          ],
          [
            <Text weight="semibold">Recommendation</Text>, <Code>:8003</Code>,
            <Row gap={4} wrap><Tag label="SASRec" tone="info" /><Tag label="GRU4Rec" tone="warning" /><Tag label="BERT4Rec" tone="neutral" /></Row>,
            "HR@10, NDCG@10",
            <Pill tone="success" size="sm">SASRec</Pill>,
          ],
          [
            <Text weight="semibold">Demand Forecast</Text>, <Code>:8004</Code>,
            <Row gap={4} wrap><Tag label="LightGBM" tone="info" /><Tag label="Prophet" tone="warning" /><Tag label="LSTM/TFT" tone="neutral" /></Row>,
            "MAE, RMSE, MAPE",
            <Pill tone="success" size="sm">LightGBM</Pill>,
          ],
          [
            <Text weight="semibold">Anomaly Detection</Text>, <Code>:8004</Code>,
            <Row gap={4} wrap><Tag label="Isolation Forest" tone="info" /><Tag label="LSTM-AE" tone="warning" /><Tag label="One-Class SVM" tone="neutral" /></Row>,
            "F1, Precision, Recall",
            <Pill tone="success" size="sm">LSTM-AE</Pill>,
          ],
          [
            <Text weight="semibold">Segmentation + Pricing</Text>, <Code>:8004</Code>,
            <Row gap={4} wrap><Tag label="K-Means RFM" tone="info" /><Tag label="Dynamic Pricing → Camunda" tone="warning" /></Row>,
            "Silhouette / elasticity",
            <Pill tone="success" size="sm">K-Means (K=4) + Pricing</Pill>,
          ],
          [
            <Text weight="semibold">Sentiment / NLP</Text>, <Code>:8002</Code>,
            <Row gap={4} wrap><Tag label="PhoBERT" tone="info" /><Tag label="ViSoBERT" tone="warning" /><Tag label="XLM-RoBERTa" tone="neutral" /></Row>,
            "F1-macro, Accuracy",
            <Pill tone="success" size="sm">PhoBERT-sentiment</Pill>,
          ],
          [
            <Text weight="semibold">Chatbot Generation</Text>, <Code>:8002</Code>,
            <Row gap={4} wrap><Tag label="Gemini 1.5 Flash" tone="success" /><Tag label="GPT-4o-mini" tone="neutral" /><Tag label="Groq" tone="neutral" /></Row>,
            "Human eval / RAG faithfulness",
            <Pill tone="success" size="sm">Gemini 1.5 Flash</Pill>,
          ],
        ]}
        columnAlign={["left", "center", "left", "center", "left"]}
      />

      <Callout tone="info" title="Chi tiết từng module">
        Xem các canvas: <Code>visual-search</Code>, <Code>text-search</Code>, <Code>recommendation-complete</Code>,
        <Code> dashboard-ai</Code> (forecast + anomaly + segmentation + pricing), <Code>chatbot-ai</Code>.
      </Callout>

      <H3>Quy trình so sánh model chuẩn</H3>
      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader>Bước 1 — Split data</CardHeader>
          <CardBody><Text tone="secondary" size="small">Chia 70% train / 15% val / 15% test. Giữ nguyên test set, chỉ dùng đánh giá lần cuối. Time-series thì split theo thời gian.</Text></CardBody>
        </Card>
        <Card>
          <CardHeader>Bước 2 — Train song song</CardHeader>
          <CardBody><Text tone="secondary" size="small">Train từng model trên cùng train set, tune trên val set. Dùng MLflow track experiments.</Text></CardBody>
        </Card>
        <Card>
          <CardHeader>Bước 3 — Evaluate &amp; Pick</CardHeader>
          <CardBody><Text tone="secondary" size="small">Chạy test set 1 lần. Model có metric tốt nhất + latency chấp nhận được → deploy vào service tương ứng.</Text></CardBody>
        </Card>
      </Grid>

      <Callout tone="warning" title="Lưu ý quan trọng">
        Model "đang dùng" là lựa chọn đã wired trong code + hợp lý theo benchmark chung. Kết quả thực tế phụ thuộc dữ liệu của dự án —
        luôn đánh giá trên validation set của chính dự án trước khi kết luận.
      </Callout>
    </Stack>
  );
}

// ─── SEARCH (VISUAL + TEXT) ───────────────────────────────────────────────────

function SearchTab() {
  const visualModels: ModelRow[] = [
    {
      name: "CLIP (ViT-B/32)",
      type: "Vision-Language",
      pros: "Encode cả ảnh lẫn text cùng vector space. Multi-modal: 'tìm áo này màu đỏ'. Đang wired (clip-ViT-B-32).",
      cons: "Retrieval ảnh-thuần đôi khi kém DINOv2.",
      trainDiff: "TrungBinh",
      expectedPerf: "Recall@10 ≈ 78–85%",
      winner: true,
    },
    {
      name: "DINOv2 (ViT-S/14)",
      type: "Self-supervised ViT",
      pros: "Feature ảnh chất lượng rất cao. Không cần label. Fine-tune tốt với Triplet Loss.",
      cons: "Chỉ encode ảnh, không hỗ trợ text query.",
      trainDiff: "TrungBinh",
      expectedPerf: "Recall@10 ≈ 75–82%",
    },
    {
      name: "EfficientNet-B3",
      type: "CNN Encoder",
      pros: "Nhẹ, nhanh nhất. Dễ fine-tune với dữ liệu nhỏ.",
      cons: "Feature yếu hơn transformer.",
      trainDiff: "De",
      expectedPerf: "Recall@10 ≈ 62–70%",
    },
  ];
  const textModels: ModelRow[] = [
    {
      name: "multilingual-e5-large",
      type: "Dense Retrieval",
      pros: "SOTA multilingual, tiếng Việt tốt. Đang wired (intfloat/multilingual-e5-large, 1024-dim).",
      cons: "Nặng ~560M tham số (~1.1GB fp16).",
      trainDiff: "TrungBinh",
      expectedPerf: "MRR@10 ≈ 0.78–0.85",
      winner: true,
    },
    {
      name: "PhoBERT + SimCSE",
      type: "Sentence Embedding",
      pros: "Chuyên tiếng Việt, hiểu ngữ pháp tốt hơn mBERT.",
      cons: "Chỉ tiếng Việt. Cần fine-tune thêm cho retrieval.",
      trainDiff: "TrungBinh",
      expectedPerf: "MRR@10 ≈ 0.72–0.80",
    },
    {
      name: "paraphrase-MiniLM-L12",
      type: "Lightweight Dense",
      pros: "Rất nhanh, nhẹ. Đủ cho prototype/CPU.",
      cons: "Chất lượng thấp hơn e5. Tiếng Việt không tối ưu.",
      trainDiff: "De",
      expectedPerf: "MRR@10 ≈ 0.60–0.68",
    },
  ];

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>search-service :8001 — Visual + Text Hybrid Search</H2>
        <Text tone="secondary">
          Một service lo cả tìm bằng ảnh (CLIP) và tìm bằng chữ (e5-large + BM25 fuse bằng RRF k=60).
          Gateway <Code>/api/v1/search/**</Code>. Chi tiết: canvas <Code>visual-search</Code> và <Code>text-search</Code>.
        </Text>
      </Stack>

      <H3>Visual Search — so sánh 3 encoder</H3>
      <ModelCompareTable models={visualModels} metric="Recall@10" />
      <Text tone="tertiary" size="small">
        Pipeline: YOLO v8 crop → CLIP encode 512-dim → FAISS ANN → fetch metadata (ảnh từ MinIO). Item-to-item lưu MongoDB <Code>product_similarities</Code>.
      </Text>

      <Divider />

      <H3>Text Search — so sánh 3 embedding + Hybrid</H3>
      <ModelCompareTable models={textModels} metric="MRR@10" />
      <Card>
        <CardHeader trailing={<Pill tone="success" size="sm">Đang wired</Pill>}>Hybrid: Dense (e5) + BM25 (Elasticsearch) = RRF</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              BM25 dùng chính index <Code>products</Code> của Elasticsearch (đã có, keyword). Dense dùng e5-large.
              Fuse bằng <Code>reciprocal_rank_fusion(k=60)</Code> (đã có trong <Code>hybrid_search.py</Code>).
            </Text>
            <Grid columns={2} gap={12}>
              <Stack gap={4}>
                <Text weight="semibold" size="small">BM25 tốt hơn khi</Text>
                <Text tone="secondary" size="small">Query tên/mã sản phẩm cụ thể: "iPhone 15 Pro Max 256GB"</Text>
              </Stack>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Dense tốt hơn khi</Text>
                <Text tone="secondary" size="small">Query mô tả: "áo mùa đông cho trẻ em không bị dị ứng"</Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="info" title="Endpoints thực tế">
        Text: <Code>GET /api/v1/search?q=&amp;top_k=&amp;min_price=&amp;max_price=</Code> + <Code>/search/suggest</Code>.
        Visual: <Code>POST /api/v1/search/image</Code> (multipart). Keyword cũ của product-service: <Code>GET /api/v1/public/products/search?query=</Code>.
      </Callout>
    </Stack>
  );
}

// ─── RECOMMENDATION ──────────────────────────────────────────────────────────

function RecsTab() {
  const models: ModelRow[] = [
    {
      name: "SASRec",
      type: "Self-Attention Transformer",
      pros: "SOTA session-based. Nhanh, nhẹ, dễ train. Đang wired trong recs-service (PyTorch).",
      cons: "Cần đủ dữ liệu session. Cold-start yếu.",
      trainDiff: "TrungBinh",
      expectedPerf: "HR@10 ≈ 0.65–0.72",
      winner: true,
    },
    {
      name: "GRU4Rec",
      type: "Recurrent (GRU)",
      pros: "Đơn giản hơn SASRec. Tốt với session ngắn.",
      cons: "Kém với chuỗi dài. Khó song song hóa.",
      trainDiff: "TrungBinh",
      expectedPerf: "HR@10 ≈ 0.58–0.65",
    },
    {
      name: "BERT4Rec",
      type: "Bidirectional Transformer",
      pros: "Cloze task, hiểu ngữ cảnh 2 chiều.",
      cons: "Train chậm hơn 2–3x. Inference phức tạp hơn.",
      trainDiff: "Kho",
      expectedPerf: "HR@10 ≈ 0.66–0.74",
    },
  ];

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>recs-service :8003 — Gợi ý cá nhân hóa</H2>
        <Text tone="secondary">
          SASRec cho session-based + Trending/Popularity cho cold-start. Gateway <Code>/api/v1/recommendations/**</Code>.
          Chi tiết: canvas <Code>recommendation-complete</Code>.
        </Text>
      </Stack>

      <ModelCompareTable models={models} metric="HR@10" />

      <Callout tone="warning" title="Dữ liệu hành vi: không có clickstream riêng">
        Dự án CHƯA có bảng view/click tracking. Tín hiệu có sẵn: Kafka events (<Code>OrderCreatedEvent</Code>, <Code>CartUpdatedEvent</Code>,
        <Code> ProductReviewedEvent</Code>). recs-service consume các event này → dựng chuỗi tương tác lưu Redis/MariaDB để train.
        Có thể bổ sung <Code>POST /track</Code> view-event (đề xuất) để làm giàu dữ liệu.
      </Callout>

      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Item-to-item</CardHeader>
          <CardBody><Text tone="secondary" size="small">Ghi top-K similar vào MongoDB <Code>product_similarities</Code> (product-service đọc lại). FAISS cho user→item ở inference.</Text></CardBody>
        </Card>
        <Card>
          <CardHeader>Endpoints (FE đã gọi)</CardHeader>
          <CardBody><Text tone="secondary" size="small"><Code>GET /recommendations/personal?user_id=</Code>, <Code>GET /recommendations/cross-sell?item_ids=</Code>. User = X-User-Id (UUID).</Text></CardBody>
        </Card>
      </Grid>
    </Stack>
  );
}

// ─── ANALYTICS (FORECAST) ──────────────────────────────────────────────────────

function AnalyticsTab() {
  const forecastModels: ModelRow[] = [
    {
      name: "LightGBM + Features",
      type: "Gradient Boosting",
      pros: "Thường thắng tabular time-series. Xử lý tốt ngày lễ, khuyến mãi. Đang wired.",
      cons: "Không dự báo uncertainty tự nhiên. Cần feature engineering.",
      trainDiff: "TrungBinh",
      expectedPerf: "MAPE ≈ 8–15%",
      winner: true,
    },
    {
      name: "Prophet (Meta)",
      type: "Additive Model",
      pros: "Tự handle trend + seasonality + holidays. Confidence interval đẹp.",
      cons: "Kém với time-series phức tạp, nhiều biến ngoại vi.",
      trainDiff: "De",
      expectedPerf: "MAPE ≈ 12–20%",
    },
    {
      name: "LSTM / TFT",
      type: "Deep Learning",
      pros: "Capture pattern phức tạp. TFT là SOTA multivariate.",
      cons: "Cần nhiều data, train chậm, khó tune.",
      trainDiff: "Kho",
      expectedPerf: "MAPE ≈ 7–13% (nếu đủ data)",
    },
  ];
  const anomalyModels: ModelRow[] = [
    {
      name: "LSTM Autoencoder",
      type: "Deep Learning AE",
      pros: "Tốt nhất cho time-series anomaly. Tự học ngưỡng bình thường.",
      cons: "Train lâu. Cần đủ dữ liệu 'bình thường'.",
      trainDiff: "TrungBinh",
      expectedPerf: "F1 ≈ 0.78–0.88",
      winner: true,
    },
    {
      name: "Isolation Forest",
      type: "Ensemble (Unsupervised)",
      pros: "Nhanh, không cần label. Sklearn 3 dòng.",
      cons: "Kém với time-series seasonality. Khó tune threshold.",
      trainDiff: "De",
      expectedPerf: "F1 ≈ 0.65–0.75",
    },
    {
      name: "One-Class SVM",
      type: "Kernel SVM",
      pros: "Lý thuyết vững, không cần nhiều data.",
      cons: "Chậm với data lớn. Ít dùng production.",
      trainDiff: "TrungBinh",
      expectedPerf: "F1 ≈ 0.60–0.70",
    },
  ];

  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>forecast-service :8004 — Phân tích cho Admin</H2>
        <Text tone="secondary">
          Dự báo doanh thu, phát hiện bất thường, phân khúc khách hàng (RFM) và Dynamic Pricing.
          Gateway <Code>/api/v1/admin/analytics/**</Code> + <Code>/api/v1/pricing/**</Code> (chỉ ADMIN/STAFF).
          Hiển thị trên admin React (<Code>AnalyticsAITab.jsx</Code>, Recharts). Chi tiết: canvas <Code>dashboard-ai</Code>.
        </Text>
      </Stack>

      <Stack gap={12}>
        <H3>Demand Forecasting — so sánh 3 model</H3>
        <ModelCompareTable models={forecastModels} metric="MAPE" />
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H3>Anomaly Detection — so sánh 3 model</H3>
        <ModelCompareTable models={anomalyModels} metric="F1" />
      </Stack>

      <Grid columns={2} gap={12}>
        <Callout tone="success" title="Customer Segmentation (K-Means RFM)">
          Tính RFM từ MariaDB <Code>ecommerce_order_db</Code>, K-Means K=4 → ghi <Code>segmentationLabel</Code>
          (Loyal/AtRisk/New/Dormant/Churned) về user-service.
        </Callout>
        <Callout tone="info" title="Dynamic Pricing → Camunda">
          Đánh giá độ nhạy giá theo user/segment → sinh action cho Camunda workflow + promotion-service.
          Endpoint <Code>/api/v1/pricing/predict</Code>.
        </Callout>
      </Grid>
    </Stack>
  );
}

// ─── CHATBOT & NLP ────────────────────────────────────────────────────────────

function ChatbotTab() {
  const sentimentModels: ModelRow[] = [
    {
      name: "PhoBERT-sentiment",
      type: "BERT (tiếng Việt)",
      pros: "Fine-tuned cho sentiment tiếng Việt. Đang wired trong chatbot-service.",
      cons: "Chỉ tiếng Việt. Cần fine-tune cho domain e-commerce.",
      trainDiff: "De",
      expectedPerf: "F1-macro ≈ 0.88–0.93",
      winner: true,
    },
    {
      name: "ViSoBERT",
      type: "BERT (Vi Social)",
      pros: "Train trên mạng xã hội, hiểu slang/viết tắt tốt.",
      cons: "Ít phổ biến hơn PhoBERT, ít tài nguyên.",
      trainDiff: "De",
      expectedPerf: "F1-macro ≈ 0.86–0.91",
    },
    {
      name: "XLM-RoBERTa-large",
      type: "Multilingual BERT",
      pros: "Đa ngôn ngữ, tốt khi ít data (few-shot).",
      cons: "Nặng nhất (~1.1GB), chậm hơn.",
      trainDiff: "TrungBinh",
      expectedPerf: "F1-macro ≈ 0.84–0.90",
    },
  ];

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>chatbot-service :8002 — RAG Chatbot &amp; NLP</H2>
        <Text tone="secondary">
          RAG tư vấn sản phẩm (gọi search-service để retrieval) + Intent (PhoBERT) + Sentiment (PhoBERT) + LLM Gemini,
          stream SSE. Gateway <Code>/api/v1/chatbot/**</Code>. Chi tiết: canvas <Code>chatbot-ai</Code>.
        </Text>
      </Stack>

      <H3>Kiến trúc RAG (gọi chéo search-service)</H3>
      <Table
        headers={["Tầng", "Chức năng", "Công nghệ"]}
        striped
        rows={[
          ["Intent", "Phân loại câu hỏi", <Tag label="PhoBERT classifier" tone="info" />],
          ["Retrieval", "Tìm sản phẩm/FAQ liên quan", <Row gap={4} wrap><Tag label="search-service :8001" tone="warning" /><Tag label="FAISS FAQ" tone="neutral" /></Row>],
          ["Generation", "Sinh câu trả lời (SSE stream)", <Tag label="Gemini 1.5 Flash" tone="success" />],
          ["Post-process", "Sentiment → escalate", <Tag label="PhoBERT-sentiment" tone="info" />],
          ["Memory", "Lịch sử hội thoại", <Tag label="Redis (sliding window + summary)" tone="neutral" />],
        ]}
        columnAlign={["left", "left", "left"]}
      />

      <H3>Sentiment Analysis — so sánh 3 model</H3>
      <ModelCompareTable models={sentimentModels} metric="F1-macro" />

      <Callout tone="info" title="Endpoints thực tế + FE">
        FE (<Code>aiApi.ts</Code>) gọi <Code>POST /api/v1/chatbot/message</Code> và <Code>/chatbot/escalate</Code>.
        Widget: <Code>features/chatbot/components/AIChatbotWidget.jsx</Code>. LLM key qua env <Code>GEMINI_API_KEY</Code>.
      </Callout>
    </Stack>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function AIEcommerceBlueprint() {
  const theme = useHostTheme();
  const [activeTab, setActiveTab] = useCanvasState("activeTab2", "overview");

  return (
    <Stack gap={0} style={{ minHeight: "100vh", background: theme.bg.editor }}>
      <Stack gap={16} style={{ padding: "24px 32px 0 32px" }}>
        <Stack gap={4}>
          <H1>Blueprint AI — AuraTech (E-commerce Microservices)</H1>
          <Text tone="secondary">
            4 AI microservices (FastAPI) sau Gateway :8080 · MariaDB · MongoDB · Redis · Elasticsearch · MinIO · Keycloak · FE React
          </Text>
        </Stack>

        <Row gap={8} wrap>
          {MODULES.map(m => (
            <Pill key={m.id} active={m.id === activeTab} onClick={() => setActiveTab(m.id)}>
              {m.label}
            </Pill>
          ))}
        </Row>

        <Divider />
      </Stack>

      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "search" && <SearchTab />}
        {activeTab === "recs" && <RecsTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "chatbot" && <ChatbotTab />}
      </Stack>
    </Stack>
  );
}
