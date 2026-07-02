import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const MODULES = [
  { id: "overview", label: "Tổng quan" },
  { id: "visual", label: "Visual Search" },
  { id: "text", label: "Text Search" },
  { id: "behavior", label: "Recommendation" },
  { id: "forecast", label: "Dự báo & Anomaly" },
  { id: "chatbot", label: "Chatbot & NLP" },
];

function Tag({ label, tone }: { label: string; tone?: "info" | "success" | "warning" | "neutral" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

function WinnerBadge() {
  return <Pill tone="success" size="sm">Khuyến nghị</Pill>;
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

function HowToCompare({ steps }: { steps: string[] }) {
  return (
    <Callout tone="info" title="Cách so sánh & chọn model tốt nhất">
      <Stack gap={4}>
        {steps.map((s, i) => (
          <Text size="small" key={i}>{i + 1}. {s}</Text>
        ))}
      </Stack>
    </Callout>
  );
}

// ─── OVERVIEW ───────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>Chiến lược: Train nhiều model → Chọn tốt nhất</H2>
        <Text tone="secondary">
          Mỗi module AI đề xuất 2–3 model cạnh tranh. Train tất cả trên cùng tập dữ liệu,
          đánh giá bằng metric chung, lấy model thắng để deploy.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="5" label="Module AI" />
        <Stat value="13" label="Models đề xuất" tone="info" />
        <Stat value="A/B" label="Phương pháp so sánh" tone="success" />
        <Stat value="1 best" label="Model deploy mỗi module" tone="success" />
      </Grid>

      <Divider />

      <H3>Tổng hợp model theo module</H3>
      <Table
        headers={["Module", "Models đề xuất train", "Metric so sánh", "Model mạnh nhất"]}
        striped
        rows={[
          [
            <Text weight="semibold">Visual Search</Text>,
            <Row gap={4} wrap><Tag label="DINOv2" tone="info" /><Tag label="CLIP" tone="warning" /><Tag label="EfficientNet-B3" tone="neutral" /></Row>,
            "Recall@10, mAP",
            <Pill tone="success" size="sm">CLIP (nếu có text+img)</Pill>,
          ],
          [
            <Text weight="semibold">Text Search</Text>,
            <Row gap={4} wrap><Tag label="PhoBERT" tone="info" /><Tag label="multilingual-e5" tone="warning" /><Tag label="MiniLM-L12" tone="neutral" /></Row>,
            "MRR@10, NDCG@10",
            <Pill tone="success" size="sm">multilingual-e5-large</Pill>,
          ],
          [
            <Text weight="semibold">Recommendation</Text>,
            <Row gap={4} wrap><Tag label="SASRec" tone="warning" /><Tag label="GRU4Rec" tone="info" /><Tag label="BERT4Rec" tone="neutral" /></Row>,
            "HR@10, NDCG@10",
            <Pill tone="success" size="sm">SASRec</Pill>,
          ],
          [
            <Text weight="semibold">Demand Forecast</Text>,
            <Row gap={4} wrap><Tag label="Prophet" tone="info" /><Tag label="LightGBM" tone="warning" /><Tag label="LSTM" tone="neutral" /></Row>,
            "MAE, RMSE, MAPE",
            <Pill tone="success" size="sm">LightGBM (thường thắng)</Pill>,
          ],
          [
            <Text weight="semibold">Anomaly Detection</Text>,
            <Row gap={4} wrap><Tag label="Isolation Forest" tone="info" /><Tag label="LSTM-AE" tone="warning" /><Tag label="One-Class SVM" tone="neutral" /></Row>,
            "F1, Precision, Recall",
            <Pill tone="success" size="sm">LSTM Autoencoder</Pill>,
          ],
          [
            <Text weight="semibold">Sentiment / NLP</Text>,
            <Row gap={4} wrap><Tag label="PhoBERT" tone="info" /><Tag label="ViSoBERT" tone="warning" /><Tag label="XLM-RoBERTa" tone="neutral" /></Row>,
            "F1-macro, Accuracy",
            <Pill tone="success" size="sm">PhoBERT-sentiment</Pill>,
          ],
        ]}
        columnAlign={["left", "left", "center", "left"]}
      />

      <Callout tone="warning" title="Lưu ý quan trọng">
        Model "mạnh nhất" chỉ là gợi ý dựa trên benchmark chung. Kết quả thực tế phụ thuộc vào dữ liệu của bạn.
        Hãy luôn đánh giá trên validation set của chính dự án trước khi quyết định.
      </Callout>

      <H3>Quy trình so sánh model chuẩn</H3>
      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader>Bước 1 — Split data</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">Chia dữ liệu: 70% train / 15% validation / 15% test. Giữ nguyên test set, chỉ dùng để đánh giá lần cuối.</Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Bước 2 — Train song song</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">Train từng model trên cùng train set, tune hyperparameter trên validation set. Dùng MLflow để track experiments.</Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Bước 3 — Evaluate & Pick</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">Chạy test set một lần duy nhất. Model có metric tốt nhất + latency chấp nhận được → deploy.</Text>
          </CardBody>
        </Card>
      </Grid>
    </Stack>
  );
}

// ─── VISUAL SEARCH ──────────────────────────────────────────────────────────

function VisualSearchTab() {
  const models: ModelRow[] = [
    {
      name: "CLIP (OpenAI)",
      type: "Vision-Language",
      pros: "Encode cả ảnh lẫn text trong cùng vector space. Tìm kiếm multi-modal: 'tìm áo này màu đỏ'. Pretrained mạnh.",
      cons: "Nặng hơn DINOv2. Không chuyên cho product retrieval.",
      trainDiff: "TrungBinh",
      expectedPerf: "Recall@10 ≈ 78–85%",
      winner: true,
    },
    {
      name: "DINOv2 (Meta)",
      type: "Self-supervised ViT",
      pros: "Feature chất lượng rất cao cho ảnh. Không cần label. Fine-tune tốt với Triplet Loss.",
      cons: "Chỉ encode ảnh, không hỗ trợ text query trực tiếp.",
      trainDiff: "TrungBinh",
      expectedPerf: "Recall@10 ≈ 75–82%",
    },
    {
      name: "EfficientNet-B3",
      type: "CNN Encoder",
      pros: "Nhẹ, nhanh nhất trong 3 model. Dễ fine-tune với dữ liệu nhỏ.",
      cons: "Feature yếu hơn transformer-based. Kém ở ảnh phức tạp.",
      trainDiff: "De",
      expectedPerf: "Recall@10 ≈ 62–70%",
    },
  ];

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>Visual Search — So sánh 3 model</H2>
        <Text tone="secondary">Người dùng tải ảnh lên → tìm sản phẩm tương tự trong catalog.</Text>
      </Stack>

      <ModelCompareTable models={models} metric="Recall@10" />

      <HowToCompare steps={[
        "Chuẩn bị 1.000–5.000 ảnh sản phẩm, tạo ground truth (mỗi ảnh query → danh sách sản phẩm đúng).",
        "Encode toàn bộ catalog bằng từng model → lưu vào FAISS index riêng.",
        "Với mỗi ảnh query trong test set, tìm Top-10 → tính Recall@10 và mAP.",
        "So sánh Recall@10 + thời gian inference. Chọn model thắng.",
        "Nếu cần text+image query → CLIP thắng gần như chắc chắn.",
      ]} />

      <H3>Pipeline chung (áp dụng cho cả 3 model)</H3>
      <Table
        headers={["Bước", "Mô tả"]}
        striped
        rows={[
          ["Tiền xử lý", "Resize về 224x224 hoặc 336x336, normalize. Dùng Albumentations augment khi train."],
          ["Encoding catalog", "Encode 1 lần toàn bộ ảnh sản phẩm, lưu vector. Cập nhật incremental khi thêm sản phẩm mới."],
          ["Query encoding", "Encode ảnh người dùng với cùng model, tìm nearest neighbor trong FAISS (< 50ms)."],
          ["Fine-tuning (tùy chọn)", "Dùng Triplet Loss hoặc Contrastive Loss để kéo ảnh cùng sản phẩm lại gần nhau."],
        ]}
        columnAlign={["left", "left"]}
      />

      <Callout tone="success" title="Điểm cộng tối đa">
        Dùng CLIP để hỗ trợ query kiểu <Code>"tìm áo này nhưng màu xanh"</Code> — kết hợp ảnh gốc và text mô tả bổ sung.
        Đây là tính năng hiếm gặp, sẽ nổi bật hơn các đồ án khác.
      </Callout>
    </Stack>
  );
}

// ─── TEXT SEARCH ─────────────────────────────────────────────────────────────

function TextSearchTab() {
  const models: ModelRow[] = [
    {
      name: "multilingual-e5-large",
      type: "Dense Retrieval",
      pros: "SOTA cho multilingual retrieval. Tiếng Việt rất tốt. Tốt hơn BERT trên nhiều benchmark.",
      cons: "Nặng (~560MB), chậm hơn MiniLM.",
      trainDiff: "TrungBinh",
      expectedPerf: "MRR@10 ≈ 0.78–0.85",
      winner: true,
    },
    {
      name: "PhoBERT + SimCSE",
      type: "Sentence Embedding",
      pros: "Chuyên tiếng Việt, hiểu ngữ pháp tốt hơn mBERT. Fine-tune với SimCSE dễ.",
      cons: "Chỉ tiếng Việt. Cần fine-tune thêm để tốt cho retrieval.",
      trainDiff: "TrungBinh",
      expectedPerf: "MRR@10 ≈ 0.72–0.80",
    },
    {
      name: "paraphrase-MiniLM-L12",
      type: "Lightweight Dense",
      pros: "Rất nhanh (~90ms/query), nhẹ, free. Đủ tốt cho demo.",
      cons: "Chất lượng thấp hơn e5. Tiếng Việt không tối ưu.",
      trainDiff: "De",
      expectedPerf: "MRR@10 ≈ 0.60–0.68",
    },
  ];

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>Text Search — So sánh 3 model embedding</H2>
        <Text tone="secondary">Người dùng gõ câu tìm kiếm → tìm sản phẩm khớp về ngữ nghĩa.</Text>
      </Stack>

      <ModelCompareTable models={models} metric="MRR@10" />

      <HowToCompare steps={[
        "Tạo tập evaluation: 300–500 cặp (query → product_id đúng). Có thể tạo thủ công từ log tìm kiếm thực.",
        "Encode toàn bộ mô tả sản phẩm bằng từng model, lưu vào FAISS.",
        "Với mỗi query trong test set, tìm Top-10 → tính MRR@10 và NDCG@10.",
        "So sánh kết hợp: metric + latency P95. Nếu chênh lệch nhỏ → chọn model nhanh hơn.",
        "Kết hợp Hybrid (model tốt nhất + BM25) thường tốt hơn từng cái riêng lẻ.",
      ]} />

      <H3>Kiến trúc Hybrid Search (khuyến nghị cuối cùng)</H3>
      <Card>
        <CardHeader trailing={<Pill tone="success" size="sm">Best practice</Pill>}>Dense Model tốt nhất + BM25 = Hybrid</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary">Chạy song song: <Code>Dense retrieval</Code> (semantic) và <Code>BM25</Code> (keyword). Fuse điểm bằng Reciprocal Rank Fusion (RRF).</Text>
            <Grid columns={2} gap={12}>
              <Stack gap={4}>
                <Text weight="semibold" size="small">BM25 tốt hơn khi</Text>
                <Text tone="secondary" size="small">Query chứa tên sản phẩm cụ thể: "iPhone 15 Pro Max 256GB"</Text>
              </Stack>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Dense tốt hơn khi</Text>
                <Text tone="secondary" size="small">Query mô tả: "áo mùa đông cho trẻ em không bị dị ứng"</Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="success" title="Điểm cộng">
        Fine-tune <Code>multilingual-e5</Code> với dữ liệu query-product của chính dự án bằng <Code>sentence-transformers</Code> + <Code>MultipleNegativesRankingLoss</Code>. Cải thiện MRR@10 thêm 5–10%.
      </Callout>
    </Stack>
  );
}

// ─── RECOMMENDATION ──────────────────────────────────────────────────────────

function BehaviorTab() {
  const models: ModelRow[] = [
    {
      name: "SASRec",
      type: "Self-Attention Transformer",
      pros: "SOTA session-based. Nhanh, nhẹ, dễ train. Xử lý chuỗi dài tốt nhờ attention.",
      cons: "Cần đủ dữ liệu session. Cold-start yếu với user mới.",
      trainDiff: "TrungBinh",
      expectedPerf: "HR@10 ≈ 0.65–0.72",
      winner: true,
    },
    {
      name: "GRU4Rec",
      type: "Recurrent (GRU)",
      pros: "Pioneer session-based rec. Đơn giản hơn SASRec. Tốt với session ngắn.",
      cons: "Kém hơn SASRec với chuỗi dài. Khó song song hóa khi train.",
      trainDiff: "TrungBinh",
      expectedPerf: "HR@10 ≈ 0.58–0.65",
    },
    {
      name: "BERT4Rec",
      type: "Bidirectional Transformer",
      pros: "Dùng cloze task (mask item). Hiểu ngữ cảnh 2 chiều, tốt hơn SASRec trong vài benchmark.",
      cons: "Train chậm hơn. Inference phức tạp hơn (cần mask cuối).",
      trainDiff: "Kho",
      expectedPerf: "HR@10 ≈ 0.66–0.74",
    },
  ];

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>Recommendation — So sánh 3 model</H2>
        <Text tone="secondary">Gợi ý sản phẩm cá nhân hóa dựa trên hành vi người dùng trong phiên hiện tại.</Text>
      </Stack>

      <ModelCompareTable models={models} metric="HR@10" />

      <HowToCompare steps={[
        "Xử lý dữ liệu: nhóm click/view/buy theo session_id, sắp xếp theo timestamp.",
        "Dùng leave-one-out evaluation: bỏ item cuối cùng của mỗi session làm test.",
        "Train từng model với tập train, validate trên val set (item áp chót).",
        "Tính HR@10 và NDCG@10 trên test set (item cuối cùng) → chọn model thắng.",
        "Bổ sung Cold-start: với user mới, fallback về popularity-based hoặc content-based.",
      ]} />

      <H3>Dữ liệu tối thiểu cần chuẩn bị</H3>
      <Table
        headers={["Trường", "Ý nghĩa", "Bắt buộc"]}
        striped
        rows={[
          [<Code>user_id</Code>, "Định danh người dùng", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          [<Code>item_id</Code>, "Định danh sản phẩm", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          [<Code>timestamp</Code>, "Thời điểm tương tác (Unix epoch)", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          [<Code>session_id</Code>, "Nhóm các hành động trong 1 phiên", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          [<Code>action_type</Code>, "view / add_cart / purchase (để weight khác nhau)", <Pill tone="info" size="sm">Nên có</Pill>],
          [<Code>category_id</Code>, "Danh mục sản phẩm (feature bổ sung)", <Pill tone="neutral" size="sm">Tùy chọn</Pill>],
        ]}
        columnAlign={["left", "left", "center"]}
      />

      <Grid columns={2} gap={12}>
        <Callout tone="info" title="Khi dữ liệu ít (< 10k sessions)">
          Dùng GRU4Rec hoặc SASRec với data augmentation. Tránh BERT4Rec — cần nhiều data hơn để ổn định.
        </Callout>
        <Callout tone="success" title="Điểm cộng">
          Kết hợp SASRec với RFM Segmentation: mỗi nhóm khách hàng dùng model riêng hoặc thêm segment embedding vào input.
        </Callout>
      </Grid>
    </Stack>
  );
}

// ─── FORECAST & ANOMALY ───────────────────────────────────────────────────────

function ForecastTab() {
  const forecastModels: ModelRow[] = [
    {
      name: "LightGBM + Features",
      type: "Gradient Boosting",
      pros: "Thường thắng trong tabular time-series. Xử lý tốt ngày lễ, khuyến mãi. Dễ thêm external features.",
      cons: "Không dự báo uncertainty tự nhiên. Cần feature engineering.",
      trainDiff: "TrungBinh",
      expectedPerf: "MAPE ≈ 8–15%",
      winner: true,
    },
    {
      name: "Prophet (Facebook)",
      type: "Additive Model",
      pros: "Tự handle trend + seasonality + holidays. Code cực ngắn. Cho confidence interval đẹp.",
      cons: "Kém với time-series phức tạp, nhiều biến ngoại vi.",
      trainDiff: "De",
      expectedPerf: "MAPE ≈ 12–20%",
    },
    {
      name: "LSTM / Temporal Fusion Transformer",
      type: "Deep Learning",
      pros: "Capture pattern phức tạp. TFT là SOTA cho multivariate forecasting.",
      cons: "Cần nhiều data hơn. Train chậm. Khó tune.",
      trainDiff: "Kho",
      expectedPerf: "MAPE ≈ 7–13% (nếu đủ data)",
    },
  ];

  const anomalyModels: ModelRow[] = [
    {
      name: "LSTM Autoencoder",
      type: "Deep Learning AE",
      pros: "Tốt nhất cho time-series anomaly. Tự học ngưỡng bình thường, phát hiện nhiều dạng bất thường.",
      cons: "Train lâu hơn. Cần đủ dữ liệu 'bình thường' để train.",
      trainDiff: "TrungBinh",
      expectedPerf: "F1 ≈ 0.78–0.88",
      winner: true,
    },
    {
      name: "Isolation Forest",
      type: "Ensemble (Unsupervised)",
      pros: "Nhanh nhất, không cần label. Sklearn 3 dòng code. Tốt cho multivariate tabular anomaly.",
      cons: "Kém hơn LSTM-AE với time-series. Khó tune threshold.",
      trainDiff: "De",
      expectedPerf: "F1 ≈ 0.65–0.75",
    },
    {
      name: "One-Class SVM",
      type: "Kernel SVM",
      pros: "Lý thuyết vững, không cần nhiều data.",
      cons: "Chậm với data lớn. Ít dùng trong production thực tế.",
      trainDiff: "TrungBinh",
      expectedPerf: "F1 ≈ 0.60–0.70",
    },
  ];

  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Dự báo nhu cầu & Phát hiện bất thường</H2>
        <Text tone="secondary">Hai bài toán AI cho Admin Dashboard: dự báo doanh thu 30 ngày + phát hiện anomaly real-time.</Text>
      </Stack>

      <Stack gap={12}>
        <H3>Demand Forecasting — So sánh 3 model</H3>
        <ModelCompareTable models={forecastModels} metric="MAPE" />
        <HowToCompare steps={[
          "Chuẩn bị time-series: daily revenue per category, ít nhất 6–12 tháng.",
          "Tạo features cho LightGBM: day_of_week, month, is_holiday, is_promotion, lag_7, lag_30, rolling_mean_7.",
          "Train/test split theo thời gian: train đến T-30, test là 30 ngày cuối.",
          "Tính MAE, RMSE, MAPE trên test set → chọn model thắng.",
          "Thêm external features (thời tiết, dịp lễ) cho LightGBM để tăng độ chính xác.",
        ]} />
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H3>Anomaly Detection — So sánh 3 model</H3>
        <ModelCompareTable models={anomalyModels} metric="F1" />
        <HowToCompare steps={[
          "Dùng dữ liệu hourly: doanh thu/giờ, traffic/giờ, conversion rate/giờ.",
          "Train LSTM-AE và Isolation Forest trên dữ liệu 'bình thường' (không có sự kiện bất thường).",
          "Tạo test set: inject manual anomaly (đột ngột giảm 50% hoặc tăng 300%).",
          "Đánh giá Precision, Recall, F1. Tune threshold trên validation set.",
          "Deploy model tốt nhất, chạy inference mỗi 15 phút, alert qua webhook.",
        ]} />
      </Stack>

      <Callout tone="success" title="Điểm cộng cho cả 2 bài toán">
        Tích hợp dữ liệu ngoại vi: gọi <Code>OpenWeatherMap API</Code> lấy nhiệt độ (ảnh hưởng đến quần áo),
        lịch lễ tết Việt Nam hardcode vào feature. Với LightGBM, thêm feature này cực dễ và thường cải thiện MAPE 3–5%.
      </Callout>

      <H3>Features quan trọng cho LightGBM Forecasting</H3>
      <Table
        headers={["Feature", "Loại", "Mô tả"]}
        striped
        rows={[
          [<Code>lag_1, lag_7, lag_30</Code>, "Temporal", "Doanh thu 1 ngày, 7 ngày, 30 ngày trước"],
          [<Code>rolling_mean_7, rolling_std_7</Code>, "Statistical", "Trung bình và độ lệch chuẩn 7 ngày"],
          [<Code>day_of_week, month, quarter</Code>, "Calendar", "Đặc trưng thời gian"],
          [<Code>is_holiday, days_to_holiday</Code>, "External", "Ngày lễ tết Việt Nam"],
          [<Code>is_promotion, discount_pct</Code>, "Business", "Có đang khuyến mãi không"],
          [<Code>temperature, weather_code</Code>, "External", "Thời tiết (OpenWeatherMap)"],
        ]}
        columnAlign={["left", "center", "left"]}
      />
    </Stack>
  );
}

// ─── CHATBOT & NLP ────────────────────────────────────────────────────────────

function ChatbotTab() {
  const sentimentModels: ModelRow[] = [
    {
      name: "PhoBERT-sentiment",
      type: "BERT (tiếng Việt)",
      pros: "Fine-tuned sẵn cho sentiment tiếng Việt. Tốt nhất cho domain Việt.",
      cons: "Chỉ tiếng Việt. Cần thêm fine-tune cho domain e-commerce.",
      trainDiff: "De",
      expectedPerf: "F1-macro ≈ 0.88–0.93",
      winner: true,
    },
    {
      name: "ViSoBERT",
      type: "BERT (Vi Social)",
      pros: "Train trên mạng xã hội Việt Nam. Hiểu slang, viết tắt rất tốt.",
      cons: "Ít phổ biến hơn PhoBERT, ít tài nguyên hỗ trợ.",
      trainDiff: "De",
      expectedPerf: "F1-macro ≈ 0.86–0.91",
    },
    {
      name: "XLM-RoBERTa-large",
      type: "Multilingual BERT",
      pros: "Đa ngôn ngữ, pretrained mạnh. Tốt khi data ít (few-shot).",
      cons: "Nặng nhất trong 3 model (~1.1GB). Chậm hơn.",
      trainDiff: "TrungBinh",
      expectedPerf: "F1-macro ≈ 0.84–0.90",
    },
  ];

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H2>Chatbot AI & NLP Tasks</H2>
        <Text tone="secondary">Chatbot RAG tư vấn sản phẩm + Sentiment Analysis để phát hiện khách hàng bức xúc.</Text>
      </Stack>

      <H3>Kiến trúc RAG Chatbot (chung cho mọi lựa chọn LLM)</H3>
      <Table
        headers={["Tầng", "Chức năng", "Công nghệ"]}
        striped
        rows={[
          ["Retrieval", "Tìm sản phẩm/FAQ liên quan đến câu hỏi", <Row gap={4} wrap><Tag label="FAISS" tone="neutral" /><Tag label="model text tốt nhất từ tab Text" tone="info" /></Row>],
          ["Augmentation", "Tổng hợp context đưa vào prompt", <Code>LangChain / LlamaIndex</Code>],
          ["Generation", "Sinh câu trả lời tự nhiên", <Row gap={4} wrap><Tag label="Gemini Flash (free)" tone="success" /><Tag label="GPT-4o-mini" tone="neutral" /></Row>],
          ["Post-process", "Phân tích sentiment + chuyển nhân viên", "Sentiment model tốt nhất (bên dưới)"],
        ]}
        columnAlign={["left", "left", "left"]}
      />

      <Divider />

      <H3>Sentiment Analysis — So sánh 3 model (dùng trong Chatbot)</H3>
      <ModelCompareTable models={sentimentModels} metric="F1-macro" />

      <HowToCompare steps={[
        "Tập dữ liệu: 2.000–5.000 câu review/chat tiếng Việt gán nhãn pos/neg/neutral. Có thể dùng UIT-VSFC (public dataset).",
        "Fine-tune cả 3 model với cùng tập train/val/test. Dùng Hugging Face Trainer.",
        "So sánh F1-macro (quan trọng hơn accuracy vì class imbalanced). Chọn model tốt nhất.",
        "Tích hợp vào chatbot: mỗi tin nhắn user → chạy qua sentiment model → nếu negative threshold → escalate.",
      ]} />

      <H3>So sánh LLM provider cho Generation</H3>
      <Table
        headers={["Provider", "Model", "Free tier", "Tốc độ", "Chất lượng", "Khuyến nghị"]}
        striped
        rows={[
          [
            <Text weight="bold">Google Gemini</Text>,
            "gemini-1.5-flash",
            <Pill tone="success" size="sm">Rất hào phóng</Pill>,
            <Pill tone="success" size="sm">Nhanh</Pill>,
            <Pill tone="info" size="sm">Tốt</Pill>,
            <Pill tone="success" size="sm">Đồ án dùng</Pill>,
          ],
          [
            "Groq",
            "llama-3.1-70b",
            <Pill tone="success" size="sm">Có free</Pill>,
            <Pill tone="success" size="sm">Nhanh nhất</Pill>,
            <Pill tone="info" size="sm">Tốt</Pill>,
            <Pill tone="info" size="sm">Demo realtime</Pill>,
          ],
          [
            "OpenAI",
            "gpt-4o-mini",
            <Pill tone="neutral" size="sm">$5 credit</Pill>,
            <Pill tone="info" size="sm">Trung bình</Pill>,
            <Pill tone="warning" size="sm">Rất tốt</Pill>,
            <Pill tone="neutral" size="sm">Nếu có budget</Pill>,
          ],
          [
            "Ollama (local)",
            "qwen2.5 / llama3.2",
            <Pill tone="success" size="sm">Miễn phí</Pill>,
            <Pill tone="neutral" size="sm">Phụ thuộc GPU</Pill>,
            <Pill tone="neutral" size="sm">Khá</Pill>,
            <Pill tone="neutral" size="sm">Offline demo</Pill>,
          ],
        ]}
        rowTone={["success", undefined, undefined, undefined]}
        columnAlign={["left", "left", "center", "center", "center", "center"]}
      />

      <Callout tone="success" title="Điểm cộng tối đa">
        Xây dựng <Code>Intent Classifier</Code> nhỏ (fine-tune PhoBERT với 6 nhãn: tìm_sản_phẩm / hỏi_giá / tra_đơn / khiếu_nại / hỏi_chính_sách / khác).
        Kết quả intent quyết định cách chatbot phản hồi: gọi API khác nhau, dùng retrieval khác nhau.
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
          <H1>Blueprint AI — Thương mại điện tử</H1>
          <Text tone="secondary">
            Mỗi module: 2–3 model cạnh tranh → train cùng data → đánh giá bằng metric → chọn model tốt nhất deploy
          </Text>
        </Stack>

        <Row gap={8} wrap>
          {MODULES.map(m => (
            <Pill
              key={m.id}
              active={m.id === activeTab}
              onClick={() => setActiveTab(m.id)}
            >
              {m.label}
            </Pill>
          ))}
        </Row>

        <Divider />
      </Stack>

      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "visual" && <VisualSearchTab />}
        {activeTab === "text" && <TextSearchTab />}
        {activeTab === "behavior" && <BehaviorTab />}
        {activeTab === "forecast" && <ForecastTab />}
        {activeTab === "chatbot" && <ChatbotTab />}
      </Stack>
    </Stack>
  );
}
