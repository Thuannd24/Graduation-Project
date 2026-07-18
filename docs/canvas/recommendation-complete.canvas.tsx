/**
 * Recommendation System (recs-service) — Tài liệu kỹ thuật đầy đủ
 * Kế hoạch "best possible" bám sát codebase THẬT của AuraTech.
 *
 * Sự thật nền tảng (xem ALIGNMENT_SPEC): recs-service FastAPI :8003,
 * gateway /api/v1/recommendations/**, đọc X-User-Id (Keycloak UUID),
 * dữ liệu = MariaDB + MongoDB + Redis + Kafka (KHÔNG có PostgreSQL,
 * KHÔNG có bảng clickstream 12 action). Code hiện tại = scaffold
 * (SASRec PyTorch stub + popularity stub).
 *
 * Tab 1: Dữ liệu & Tín hiệu   — Kafka events THẬT, trọng số đề xuất, Redis, MariaDB
 * Tab 2: Train Models          — preprocessing, SASRec / GRU4Rec / BERT4Rec, FAISS + product_similarities
 * Tab 3: Đánh giá              — metrics, Leave-One-Out, benchmark 3 models
 * Tab 4: Cross-selling         — FP-Growth trên orders (MariaDB), cross_sell_rules
 * Tab 5: Trending & Mới        — time-decay score, Redis Sorted Sets, new arrivals
 * Tab 6: Tích hợp hệ thống     — Mixer, APIs THẬT, product_similarities, monitoring, A/B
 */
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const TABS = [
  { id: "data",     label: "1. Dữ liệu & Tín hiệu" },
  { id: "train",    label: "2. Train Models" },
  { id: "evaluate", label: "3. Đánh giá" },
  { id: "cross",    label: "4. Cross-selling" },
  { id: "trending", label: "5. Trending & Mới" },
  { id: "system",   label: "6. Tích hợp hệ thống" },
];

function Tag({ label, tone }: { label: string; tone?: "info" | "success" | "warning" | "neutral" | "danger" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — DỮ LIỆU & TÍN HIỆU
// ─────────────────────────────────────────────────────────────────────────────

function DataTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Mô hình dữ liệu — dựa trên tín hiệu CÓ THẬT</H2>
        <Text tone="secondary">
          Dự án AuraTech CHƯA có bảng clickstream/product-view/dwell-time. Vì vậy recs-service
          xây chuỗi tương tác từ các tín hiệu thật đang chạy: <Text weight="semibold" as="span">Kafka events</Text> (đơn
          hàng, giỏ hàng, đánh giá) phát qua Outbox + Debezium CDC lên topic <Code>order-events</Code>.
          recs-service consume các event này → dựng session/user sequence trong Redis + lịch sử bền vững trong MariaDB.
        </Text>
      </Stack>

      <Callout tone="warning" title="Neo4j, FAISS, PostgreSQL — dùng cái nào?">
        <Stack gap={6}>
          <Text size="small">
            <Text weight="semibold" as="span">PostgreSQL: KHÔNG có trong dự án.</Text> Stack dữ liệu thật là
            MariaDB (quan hệ) + MongoDB (<Code>ecommerce_product_nosql</Code>) + Redis (cache/session) + Kafka (event).
            Toàn bộ pipeline này chạy tốt trên MariaDB + Redis.
          </Text>
          <Text size="small">
            <Text weight="semibold" as="span">Neo4j: KHÔNG cần</Text> cho SASRec / GRU4Rec / BERT4Rec.
            Neo4j chỉ phục vụ Graph Neural Network (PinSage, LightGCN) — ngoài phạm vi.
          </Text>
          <Text size="small">
            <Text weight="semibold" as="span">FAISS: CÓ</Text>, chỉ ở bước inference cuối: từ user embedding tìm K sản
            phẩm gần nhất trong &lt; 5ms. Không cần khi train.
          </Text>
        </Stack>
      </Callout>

      <H3>Tín hiệu hành vi CÓ THẬT — Kafka events (topic order-events)</H3>
      <Table
        headers={["Kafka event", "Trường chính", "Cường độ tín hiệu", "Service phát"]}
        striped
        rows={[
          [<Code>OrderConfirmedEvent</Code>,  "userId, items[{productId, quantity}]",             "Rất mạnh (ground truth mua)", "order-service"],
          [<Code>ProductReviewedEvent</Code>, "userId, productId, rating (1–5)",                   "Rất mạnh (commitment)",       "product/review-service"],
          [<Code>OrderCreatedEvent</Code>,    "userId, items[{productId, quantity}]",             "Mạnh (intent mua)",            "order-service"],
          [<Code>CartUpdatedEvent</Code>,     "userId, sessionId, productId, action (ADD/UPDATE/REMOVE/CLEAR)", "Trung bình",       "cart-service"],
          [<Code>OrderCancelledEvent</Code>,  "userId, items[{productId, quantity}]",             "Âm (huỷ đơn)",                 "order-service"],
        ]}
        columnAlign={["left", "left", "left", "left"]}
        rowTone={["success", "success", "info", "neutral", "danger"]}
      />
      <Text tone="tertiary" size="small">
        <Text weight="semibold" as="span">productId là kiểu Long</Text> (auto-increment MariaDB), không phải UUID.
        Danh tính người dùng là <Text weight="semibold" as="span">Keycloak UUID (String)</Text> — lấy từ
        <Code>Order.userId</Code> và header <Code>X-User-Id</Code> do gateway inject.
      </Text>

      <H3>Trọng số đề xuất khi map từ event types có sẵn</H3>
      <Text tone="secondary" size="small">
        Không phát minh action mới — chỉ gán trọng số cho các event đã có ở trên (review &gt; mua đã xác nhận &gt;
        đơn tạo &gt; thêm giỏ &gt; bỏ giỏ/huỷ). Trọng số dùng để cộng dồn trong sequence và tính trending decay.
      </Text>
      <Table
        headers={["Hành vi", "Map từ event có sẵn", "Trọng số đề xuất", "Ghi chú"]}
        striped
        rows={[
          ["Viết đánh giá",     <Code>ProductReviewedEvent</Code>,                 <Text weight="bold">stars × 2</Text>, "1★ = weight -2 (âm). Commitment cao nhất ngoài mua."],
          ["Mua đã xác nhận",   <Code>OrderConfirmedEvent</Code>,                  <Text weight="bold">10</Text>,        "Ground truth mạnh nhất."],
          ["Tạo đơn hàng",      <Code>OrderCreatedEvent</Code>,                    <Text weight="bold">6</Text>,         "Intent mua, chưa xác nhận/thanh toán."],
          ["Thêm vào giỏ",      <><Code>CartUpdatedEvent</Code> ADD_ITEM</>,       <Text weight="bold">4</Text>,         "Intent mua cao."],
          ["Tăng số lượng",     <><Code>CartUpdatedEvent</Code> UPDATE_QTY</>,     <Text weight="bold">2</Text>,         "Quan tâm rõ rệt."],
          ["Bỏ khỏi giỏ",       <><Code>CartUpdatedEvent</Code> REMOVE_ITEM</>,    <Text weight="bold">-2</Text>,        "Giảm intent, không về 0."],
          ["Huỷ đơn",           <Code>OrderCancelledEvent</Code>,                  <Text weight="bold">-5</Text>,        "Trải nghiệm tệ, penalize item."],
          ["Xem sản phẩm",      <Text tone="tertiary" as="span">POST /track</Text>, <Text weight="bold">1</Text>,        "CẦN BỔ SUNG — hiện CHƯA có pipeline view/click."],
        ]}
        columnAlign={["left", "left", "center", "left"]}
        rowTone={["success", "success", "info", "success", "info", "danger", "danger", "neutral"]}
      />

      <Callout tone="info" title="Enhancement tuỳ chọn: POST /track (cần bổ sung — hiện chưa có)">
        <Text size="small">
          Để làm giàu dữ liệu train, có thể bổ sung một pipeline nhẹ <Code>POST /api/v1/recommendations/track</Code>
          {" "}ghi nhận view/click (fire-and-forget từ FE). <Text weight="semibold" as="span">Đây là phần đề xuất
          thêm, hiện CHƯA tồn tại trong code</Text> — không được trình bày như đã có. Khi có, nó bổ sung tín hiệu
          view (weight 1) vào cùng cấu trúc sequence bên dưới.
        </Text>
      </Callout>

      <H3>Nơi lưu trữ THẬT — Redis (nóng) + MariaDB (bền)</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">recs-service tự dựng</Pill>}>
            MariaDB — rec_interactions (lịch sử để train)
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small" tone="secondary">
                Bảng do recs-service tạo, được nạp bởi Kafka consumer (map event → productId + weight). Đây là
                nguồn bền vững để retrain hàng tuần.
              </Text>
              <Table
                framed={false} striped
                headers={["Column", "Type", "Index"]}
                rows={[
                  [<Code>id</Code>,          "BIGINT PK AUTO_INCREMENT", "—"],
                  [<Code>user_id</Code>,      "VARCHAR(64) — Keycloak UUID", "YES"],
                  [<Code>session_id</Code>,   "VARCHAR(64) NULLABLE",     "YES"],
                  [<Code>product_id</Code>,   "BIGINT — Long",            "YES"],
                  [<Code>event_type</Code>,   "VARCHAR(32)",              "—"],
                  [<Code>weight</Code>,       "FLOAT",                    "—"],
                  [<Code>created_at</Code>,   "DATETIME",                 "YES"],
                ]}
                columnAlign={["left", "left", "center"]}
              />
              <Text size="small" tone="tertiary">Composite index: (user_id, created_at DESC)</Text>
            </Stack>
          </CardBody>
        </Card>

        <Stack gap={12}>
          <Card>
            <CardHeader trailing={<Pill tone="info" size="sm">Chỉ đọc (order-service)</Pill>}>
              MariaDB ecommerce_order_db — orders / order_items
            </CardHeader>
            <CardBody>
              <Text size="small" tone="secondary" style={{ marginBottom: 6 }}>
                Nguồn cho cross-sell. recs-service đọc (hoặc consume OrderConfirmedEvent) — KHÔNG sở hữu bảng này.
              </Text>
              <Table
                framed={false} striped
                headers={["Column", "Type"]}
                rows={[
                  [<Code>Order.id</Code>,          "BIGINT PK"],
                  [<Code>Order.userId</Code>,      "VARCHAR — Keycloak UUID"],
                  [<Code>Order.status</Code>,      "VARCHAR (CONFIRMED/…)"],
                  [<Code>Order.createdAt</Code>,   "DATETIME (dùng thay per-item ts)"],
                  [<Code>OrderItem.productId</Code>,"BIGINT — Long"],
                  [<Code>OrderItem.quantity</Code>,"INT"],
                  [<Code>OrderItem.unitPrice</Code>,"DECIMAL(12,2)"],
                ]}
                columnAlign={["left", "left"]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader trailing={<Pill tone="warning" size="sm">recs-service tạo</Pill>}>MariaDB — cross_sell_rules</CardHeader>
            <CardBody>
              <Table
                framed={false} striped
                headers={["Column", "Type"]}
                rows={[
                  [<Code>antecedent_product_id</Code>, "BIGINT INDEX"],
                  [<Code>consequent_product_id</Code>, "BIGINT"],
                  [<Code>confidence</Code>,             "FLOAT"],
                  [<Code>lift</Code>,                   "FLOAT"],
                  [<Code>support</Code>,                "FLOAT"],
                  [<Code>co_purchase_count</Code>,      "INT"],
                  [<Code>updated_at</Code>,             "DATETIME"],
                ]}
                columnAlign={["left", "left"]}
              />
            </CardBody>
          </Card>
        </Stack>
      </Grid>

      <Callout tone="success" title="Item-to-item: MongoDB product_similarities (đã tồn tại thật)">
        <Text size="small">
          Collection <Code>product_similarities</Code> trong <Code>ecommerce_product_nosql</Code> đã có sẵn và đang
          được product-service ĐỌC. Shape: <Code>{"{ productId: Long, similar: [{ similarProductId, similarityScore }] }"}</Code>.
          Offline job của recs-service (và "sản phẩm tương tự" của visual search) sẽ <Text weight="semibold" as="span">GHI</Text> vào
          đây → đó là đường phục vụ item-to-item chính thức, không cần bảng mới.
        </Text>
      </Callout>

      <H3>Redis key schema (Redis là thật trong dự án)</H3>
      <Table
        headers={["Key pattern", "Kiểu Redis", "TTL", "Dùng để"]}
        striped
        rows={[
          [<Code>user:{"{uid}"}:history</Code>,        "List",       "7 ngày",   "Chuỗi productId gần nhất của user (Keycloak UUID). Code hiện đọc key này."],
          [<Code>session:{"{sid}"}:history</Code>,      "List",       "1800s",    "Chuỗi productId của session ẩn danh. Code hiện đọc key này."],
          [<Code>user:{"{uid}"}:purchased</Code>,       "Set",        "30 ngày",  "productId đã mua (dùng để filter khỏi gợi ý)"],
          [<Code>rec:{"{uid}"}:{"{ctx}"}:result</Code>, "List",       "300s",     "Cache kết quả gợi ý đã blend theo context"],
          [<Code>item:{"{pid}"}:meta</Code>,            "Hash",       "3600s",    "Cache name/price/imageUrl (đọc từ product-service)"],
          [<Code>trending:global</Code>,                "Sorted Set", "—",        "Top items toàn site (ZINCRBY, không TTL)"],
          [<Code>trending:cat:{"{cid}"}</Code>,         "Sorted Set", "—",        "Top items theo category"],
        ]}
        columnAlign={["left", "center", "center", "left"]}
      />

      <H3>Luồng dữ liệu THẬT — Kafka consumer dựng sequence</H3>
      <Card>
        <CardHeader>Event ingestion pipeline — async, event-driven qua topic order-events</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={8} align="center">
                <Pill tone="neutral" size="sm">Bước 1</Pill>
                <Text weight="semibold">Outbox + Debezium CDC phát event</Text>
              </Row>
              <Text tone="secondary" size="small">
                order-service / cart-service / product-service ghi vào Outbox → Debezium CDC đẩy lên Kafka topic
                <Code>order-events</Code> (OrderConfirmedEvent, CartUpdatedEvent, ProductReviewedEvent, …).
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={8} align="center">
                <Pill tone="neutral" size="sm">Bước 2</Pill>
                <Text weight="semibold">recs-service consumer map event → (productId, weight)</Text>
              </Row>
              <Text tone="secondary" size="small">
                Với mỗi event: lấy <Code>userId</Code>/<Code>sessionId</Code> + <Code>productId</Code> (Long) và tra
                trọng số đề xuất ở bảng trên (ví dụ OrderConfirmed → 10, CartUpdated ADD_ITEM → 4).
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={8} align="center">
                <Pill tone="neutral" size="sm">Bước 3</Pill>
                <Text weight="semibold">Ghi song song 3 đích</Text>
              </Row>
              <Grid columns={3} gap={8}>
                <Stack gap={3}>
                  <Tag label="Redis session/user" tone="warning" />
                  <Text size="small" tone="secondary">RPUSH vào <Code>user:{"{uid}"}:history</Code> / <Code>session:{"{sid}"}:history</Code>. Dùng ngay cho inference (SASRec).</Text>
                </Stack>
                <Stack gap={3}>
                  <Tag label="MariaDB rec_interactions" tone="neutral" />
                  <Text size="small" tone="secondary">INSERT dòng bền vững. Dùng để retrain model hàng tuần.</Text>
                </Stack>
                <Stack gap={3}>
                  <Tag label="Redis trending" tone="info" />
                  <Text size="small" tone="secondary">ZINCRBY <Code>trending:global</Code> và <Code>trending:cat:{"{cid}"}</Code> theo weight.</Text>
                </Stack>
              </Grid>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={8} align="center">
                <Pill tone="neutral" size="sm">Bước 4</Pill>
                <Text weight="semibold">Invalidate cache gợi ý khi có tín hiệu mạnh</Text>
              </Row>
              <Text tone="secondary" size="small">
                Khi nhận OrderConfirmed / CartUpdated(ADD_ITEM) / ProductReviewed → DEL <Code>rec:{"{uid}"}:*</Code>
                để request gợi ý kế tiếp tính lại.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="info" title="Sinh dữ liệu giả lập khi chưa đủ user thật">
        Dùng <Code>Faker</Code> + <Code>scipy.stats</Code> sinh user (Keycloak-UUID giả), sản phẩm (productId Long),
        và các đơn hàng / cart event / review theo phân phối Power-law (80% traffic vào 20% sản phẩm hot).
        Nạp qua đúng đường Kafka/MariaDB ở trên để train và demo mà không cần dữ liệu production.
      </Callout>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — TRAIN MODELS
// ─────────────────────────────────────────────────────────────────────────────

function TrainTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Train Models — Từng bước chi tiết</H2>
        <Text tone="secondary">
          Train 3 model cạnh tranh (SASRec, GRU4Rec, BERT4Rec) trên cùng pipeline dữ liệu, cùng metric,
          chọn model tốt nhất để deploy. <Text weight="semibold" as="span">Winner = SASRec (PyTorch)</Text> — đúng
          model đang được nối trong recs-service (<Code>app/services/sasrec.py</Code>, hiện là scaffold cần hoàn thiện).
        </Text>
      </Stack>

      <Callout tone="info" title="Trạng thái code hiện tại (scaffold)">
        <Text size="small">
          <Code>sasrec.py</Code> hiện dùng một <Code>SASRecModel</Code> tạm (LSTM baseline) load weight nếu tồn tại,
          nếu không thì chạy weight khởi tạo; <Code>popularity.py</Code> trả mock trending. Tài liệu này là KẾ HOẠCH
          hoàn thiện kiến trúc SASRec đúng nghĩa (self-attention) trên nền scaffold đó.
        </Text>
      </Callout>

      <H3>Bước 1 — Preprocessing dữ liệu (dùng chung cho 3 model)</H3>
      <Card>
        <CardHeader>Data pipeline (Python ~100 dòng)</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1.1</Pill><Text weight="semibold">Query và lọc từ MariaDB</Text></Row>
              <Text tone="secondary" size="small">
                <Code>SELECT user_id, product_id, weight, created_at FROM rec_interactions WHERE weight {'>'} 0 ORDER BY user_id, created_at ASC</Code>.
                Loại user &lt; 5 tương tác. Loại product xuất hiện &lt; 3 lần toàn bộ data. (rec_interactions được nạp từ Kafka — Tab 1.)
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1.2</Pill><Text weight="semibold">Xây dựng weighted sequence</Text></Row>
              <Text tone="secondary" size="small">
                Group by user_id → chuỗi (productId, weight) theo thời gian.
                Cùng productId lặp lại trong 1 session → cộng dồn weight, giữ vị trí cuối.
                Kết quả: <Code>user_seqs = {"{"}"uuid-a": [101, 55, 203, 88], "uuid-b": [7, 31, ...]{"}"}</Code>
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1.3</Pill><Text weight="semibold">Remap productId + Padding</Text></Row>
              <Text tone="secondary" size="small">
                productId đã là Long nhưng thưa/không liên tục → remap sang integer 1..N cho embedding. Index 0 = PAD.
                Lưu <Code>item2idx.json</Code> và <Code>idx2item.json</Code> (idx → productId Long).
                Cắt sequence tối đa 50 items (khớp <Code>max len = 50</Code> trong code). Ngắn hơn → left-pad bằng 0.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1.4</Pill><Text weight="semibold">Leave-One-Out split</Text></Row>
              <Table
                framed={false} striped
                headers={["Split", "Dữ liệu dùng làm input", "Ground truth"]}
                rows={[
                  ["Train",      "Sequence đến item (N-2)",  "Dự đoán item (N-1) — dùng khi train"],
                  ["Validation", "Sequence đến item (N-2)",  "Item (N-1) — tune hyperparams"],
                  ["Test",       "Sequence đến item (N-1)",  "Item (N) — đánh giá cuối cùng, dùng 1 lần"],
                ]}
                columnAlign={["left", "left", "left"]}
              />
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Bước 2 — Train từng model</H3>

      <Card collapsible defaultOpen>
        <CardHeader trailing={<Pill tone="success" size="sm">Winner — wired trong recs-service</Pill>}>
          SASRec — Self-Attentive Sequential Recommendation
        </CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Hyperparameters</Text>
                <Table
                  framed={false} striped
                  headers={["Param", "Giá trị"]}
                  rows={[
                    [<Code>hidden_size</Code>,  "64 hoặc 128"],
                    [<Code>num_heads</Code>,     "2 hoặc 4"],
                    [<Code>num_layers</Code>,    "2"],
                    [<Code>dropout</Code>,       "0.2"],
                    [<Code>max_seq_len</Code>,   "50"],
                    [<Code>batch_size</Code>,    "256"],
                    [<Code>lr</Code>,            "1e-3 (Adam)"],
                    [<Code>weight_decay</Code>,  "1e-4"],
                    [<Code>epochs</Code>,        "200 (early stop)"],
                    [<Code>neg_sample_size</Code>,"100 per positive"],
                  ]}
                  columnAlign={["left", "right"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Kiến trúc (thay LSTM baseline của scaffold)</Text>
                <Stack gap={4}>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Item Embedding:</Text> lookup (N+1)×D. Index 0 = PAD, không cập nhật (khớp <Code>padding_idx=0</Code>).</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Positional Embedding:</Text> trainable, không dùng sinusoidal cố định.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">2× Transformer Block:</Text> causal self-attention + point-wise FF + LayerNorm + Dropout.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Loss:</Text> BCE với negative sampling. Loss = BCE(score_pos,1) + BCE(score_neg,0).</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Early stop:</Text> dừng khi val HR@10 không tăng sau 20 epoch.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Augmentation:</Text> item crop, item mask (10%) tăng robustness.</Text>
                </Stack>
                <Callout tone="info" title="Repo tham khảo">
                  <Code>pmixer/SASRec.pytorch</Code> — code sạch, có sẵn dataloader, ~300 dòng.
                </Callout>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <Card collapsible defaultOpen={false}>
        <CardHeader>GRU4Rec — Gated Recurrent Unit for Recommendation</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Hyperparameters</Text>
                <Table
                  framed={false} striped
                  headers={["Param", "Giá trị"]}
                  rows={[
                    [<Code>hidden_size</Code>,   "100"],
                    [<Code>num_layers</Code>,    "1 hoặc 2"],
                    [<Code>dropout</Code>,       "0.25"],
                    [<Code>batch_size</Code>,    "512 (session-parallel)"],
                    [<Code>lr</Code>,            "1e-3 (Adagrad)"],
                    [<Code>loss</Code>,          "TOP1-max hoặc BPR-max"],
                    [<Code>epochs</Code>,        "30"],
                  ]}
                  columnAlign={["left", "right"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Điểm đặc biệt</Text>
                <Text tone="secondary" size="small">
                  Dùng <Text weight="semibold" as="span">session-parallel mini-batches</Text>:
                  nhiều session chạy song song trong 1 batch, tận dụng tối đa GPU.
                </Text>
                <Text tone="secondary" size="small">
                  Reset hidden state khi session kết thúc — không trộn state giữa các user khác nhau.
                </Text>
                <Text tone="secondary" size="small">
                  TOP1-max loss: score của item đúng phải cao hơn K random item cùng batch.
                </Text>
                <Text tone="secondary" size="small">
                  Kém SASRec với chuỗi dài (&gt;20 items) do GRU bị vanishing gradient.
                </Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <Card collapsible defaultOpen={false}>
        <CardHeader>BERT4Rec — Bidirectional Encoder Representations for Recommendation</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Hyperparameters</Text>
                <Table
                  framed={false} striped
                  headers={["Param", "Giá trị"]}
                  rows={[
                    [<Code>hidden_size</Code>,          "64"],
                    [<Code>num_attention_heads</Code>,  "2"],
                    [<Code>num_hidden_layers</Code>,    "2"],
                    [<Code>mask_prob</Code>,            "0.2 (mask 20% items)"],
                    [<Code>max_seq_len</Code>,          "50"],
                    [<Code>batch_size</Code>,           "256"],
                    [<Code>lr</Code>,                   "1e-4 (Adam)"],
                    [<Code>epochs</Code>,               "300 (chậm hơn SASRec)"],
                  ]}
                  columnAlign={["left", "right"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Cloze Task — khác SASRec</Text>
                <Text tone="secondary" size="small">
                  <Text weight="semibold" as="span">Khi train:</Text> random mask 20% item trong sequence bằng [MASK] token.
                  Model dự đoán item bị mask dựa trên cả ngữ cảnh trước và sau (bidirectional).
                </Text>
                <Text tone="secondary" size="small">
                  <Text weight="semibold" as="span">Khi inference:</Text> đặt [MASK] ở vị trí cuối cùng.
                  Model dự đoán item tiếp theo user sẽ tương tác.
                </Text>
                <Callout tone="warning" title="Lưu ý">
                  Train lâu hơn SASRec 2–3x. Máy không có GPU mạnh → train SASRec và GRU4Rec trước.
                </Callout>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <H3>Bước 3 — Build FAISS Index + ghi MongoDB product_similarities (offline)</H3>
      <Card>
        <CardHeader>Trích xuất item embeddings → FAISS (user→item) + item-to-item top-k (chạy 1 lần sau train)</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              1. Load checkpoint tốt nhất: <Code>model = SASRec(...); model.load_state_dict(torch.load("best.pth"))</Code>
            </Text>
            <Text tone="secondary" size="small">
              2. Lấy embedding matrix: <Code>embeddings = model.item_emb.weight.detach().numpy()</Code> → shape (N+1, D).
            </Text>
            <Text tone="secondary" size="small">
              3. L2 normalize: <Code>embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)</Code>
            </Text>
            <Text tone="secondary" size="small">
              4. Build FAISS: <Code>index = faiss.IndexFlatIP(D); index.add(embeddings[1:])</Code> (bỏ PAD index 0). Dùng cho user→item NN lúc inference.
            </Text>
            <Text tone="secondary" size="small">
              5. <Text weight="semibold" as="span">Item-to-item:</Text> với mỗi item lấy top-K láng giềng (cosine) → map idx về productId (Long) →
              <Text weight="semibold" as="span"> GHI vào MongoDB</Text> <Code>product_similarities</Code>: <Code>{"{ productId, similar: [{ similarProductId, similarityScore }] }"}</Code> (upsert).
            </Text>
            <Text tone="secondary" size="small">
              6. Lưu <Code>item_index.faiss</Code> + <Code>idx2item.json</Code>. Server khởi động load FAISS vào RAM; inference: <Code>index.search(user_vec, k=20)</Code> → &lt; 5ms.
            </Text>
            <Callout tone="info" title="FAISS vs brute-force vs product_similarities">
              Catalog &lt; 10k sản phẩm: brute-force numpy đủ nhanh cho user→item. Item-to-item ("sản phẩm tương tự")
              phục vụ trực tiếp từ MongoDB <Code>product_similarities</Code> (product-service đã đọc sẵn) — O(1), không cần FAISS lúc serving.
            </Callout>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — ĐÁNH GIÁ
// ─────────────────────────────────────────────────────────────────────────────

function EvaluateTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Đánh giá model — Metrics và quy trình chuẩn</H2>
        <Text tone="secondary">
          Leave-One-Out Protocol: item cuối cùng trong sequence của mỗi user là ground truth.
          Model phải đưa đúng item đó vào top-K gợi ý từ 100 candidates.
        </Text>
      </Stack>

      <H3>Các metrics cần báo cáo</H3>
      <Table
        headers={["Metric", "Công thức / Ý nghĩa", "Ngưỡng tốt", "Mức ưu tiên"]}
        striped
        rows={[
          [
            <Text weight="bold">HR@K (Hit Rate)</Text>,
            "Tỷ lệ user có ground truth item trong top-K. HR@10 = #hits / #users.",
            "HR@10 &gt; 0.60",
            <Pill tone="warning" size="sm">Bắt buộc báo cáo</Pill>,
          ],
          [
            <Text weight="bold">NDCG@K</Text>,
            "Phần thưởng cao hơn nếu item đúng ở vị trí cao hơn. discount = 1/log₂(rank+1).",
            "NDCG@10 &gt; 0.40",
            <Pill tone="warning" size="sm">Bắt buộc báo cáo</Pill>,
          ],
          [
            "MRR (Mean Reciprocal Rank)",
            "Trung bình 1/rank của ground truth. MRR=1 nếu luôn xếp đầu.",
            "MRR &gt; 0.35",
            <Pill tone="info" size="sm">Điểm cộng</Pill>,
          ],
          [
            "Precision@K",
            "Trong K gợi ý, bao nhiêu % là đúng (thường chỉ 1 ground truth nên P@K = HR@K / K).",
            "P@10 &gt; 0.10",
            <Pill tone="neutral" size="sm">Tùy chọn</Pill>,
          ],
          [
            "Coverage",
            "Tỷ lệ sản phẩm khác nhau xuất hiện trong toàn bộ gợi ý — đo độ đa dạng.",
            "&gt; 20% catalog",
            <Pill tone="neutral" size="sm">Tùy chọn</Pill>,
          ],
        ]}
        columnAlign={["left", "left", "center", "center"]}
      />

      <H3>Quy trình Leave-One-Out Evaluation</H3>
      <Card>
        <CardHeader>4 bước thực hiện evaluation chuẩn</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Text weight="semibold">Bước 1 — Chuẩn bị 100 candidates cho mỗi user test</Text>
              <Text tone="secondary" size="small">
                Ground truth = item cuối (item N) trong sequence. Tạo thêm 99 negative items:
                random sample từ toàn catalog, loại trừ những item user đã từng tương tác.
                Tổng 100 candidates = 1 positive + 99 random negatives.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 2 — Chạy inference</Text>
              <Text tone="secondary" size="small">
                Input: sequence [i1..iN-1]. Model sinh user embedding.
                Tính score với 100 candidates bằng dot product với item embeddings.
                Sort giảm dần theo score.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 3 — Tính metrics</Text>
              <Text tone="secondary" size="small">
                Với mỗi user: tìm rank r của ground truth trong danh sách đã sort (1-indexed).
                HR@K = 1 nếu r ≤ K, else 0. NDCG@K = 1/log₂(r+1) nếu r ≤ K, else 0.
                Trung bình cộng qua tất cả users trong test set.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 4 — So sánh 3 model và chọn winner</Text>
              <Text tone="secondary" size="small">
                Chạy cùng evaluation script cho SASRec, GRU4Rec, BERT4Rec.
                Model có HR@10 cao nhất trên test set → deploy (dự kiến SASRec, khớp code). Lưu kết quả vào MLflow.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Benchmark tham khảo (MovieLens-1M, leave-one-out)</H3>
      <Table
        headers={["Model", "HR@5", "HR@10", "NDCG@5", "NDCG@10", "MRR", "Kết luận"]}
        striped
        rows={[
          [<Text weight="bold">SASRec</Text>, "0.578", "0.718", "0.453", "0.496", "0.412", <Pill tone="success" size="sm">Tốt nhất tổng thể → deploy</Pill>],
          ["BERT4Rec",                        "0.571", "0.712", "0.447", "0.490", "0.407", <Pill tone="info" size="sm">Sát SASRec, train lâu hơn</Pill>],
          ["GRU4Rec",                         "0.520", "0.658", "0.401", "0.441", "0.368", <Pill tone="neutral" size="sm">Baseline nhanh nhất</Pill>],
        ]}
        rowTone={["success", undefined, undefined]}
        columnAlign={["left", "center", "center", "center", "center", "center", "left"]}
      />
      <Text tone="tertiary" size="small">
        Kết quả trên dữ liệu của bạn sẽ khác. Benchmark này chỉ để định hướng kỳ vọng.
        SASRec thường thắng vì self-attention capture long-range dependency tốt hơn GRU — và đây cũng là model
        được nối trong recs-service.
      </Text>

      <Callout tone="success" title="Điểm cộng trong báo cáo">
        Vẽ biểu đồ HR@K với K từ 1 đến 20 cho cả 3 model (matplotlib).
        Phân tích định tính: "SASRec tốt hơn GRU4Rec vì attention nắm bắt được cả pattern gần và xa trong chuỗi."
      </Callout>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — CROSS-SELLING
// ─────────────────────────────────────────────────────────────────────────────

function CrossTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Bài toán Cross-selling — "Mua điện thoại → gợi ý ốp lưng"</H2>
        <Text tone="secondary">
          Co-purchase recommendation: tìm sản phẩm thường được mua chung trong cùng 1 đơn hàng.
          Độc lập với session-based — dùng dữ liệu orders (MariaDB <Code>ecommerce_order_db</Code>),
          không phải hành vi duyệt web.
        </Text>
      </Stack>

      <H3>3 phương pháp — chọn tốt nhất theo độ phức tạp</H3>
      <Table
        headers={["Phương pháp", "Ý tưởng cốt lõi", "Ưu điểm", "Hạn chế", "Khó", "Dùng khi"]}
        striped
        rows={[
          [
            <Text weight="bold">Co-purchase Matrix</Text>,
            "Đếm số đơn hàng có cả A và B → normalize thành PMI score",
            "Cực đơn giản, không cần thư viện đặc biệt",
            "Bị bias bởi item phổ biến. Không tìm được pattern phức tạp.",
            <Pill tone="success" size="sm">Dễ</Pill>,
            "Catalog nhỏ, prototype nhanh",
          ],
          [
            <Text weight="bold">FP-Growth Rules</Text>,
            "Tìm frequent itemsets → sinh rule A→B với confidence và lift",
            "Có confidence + lift để giải thích. Rule nhiều item (A,B→C).",
            "Bùng nổ rule khi catalog lớn. Cần tune min_support cẩn thận.",
            <Pill tone="info" size="sm">Trung bình</Pill>,
            <Text weight="semibold" tone="primary">Khuyến nghị chính</Text>,
          ],
          [
            "Item-based CF (orders)",
            "Mỗi đơn hàng = 1 'user', tính cosine similarity trên ma trận order-item",
            "Capture pattern phức tạp hơn FP-Growth. Tự nhiên handle popularity bias.",
            "Cần nhiều đơn hàng. Ma trận thưa khi catalog lớn.",
            <Pill tone="info" size="sm">Trung bình</Pill>,
            "Kết hợp thêm với FP-Growth",
          ],
        ]}
        rowTone={[undefined, "success", undefined]}
        columnAlign={["left", "left", "left", "left", "center", "left"]}
      />

      <H3>FP-Growth chi tiết — từng bước implement</H3>
      <Card>
        <CardHeader>Implement với thư viện mlxtend (Python)</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 1</Pill><Text weight="semibold">Chuẩn bị transaction data từ orders (MariaDB)</Text></Row>
              <Text tone="secondary" size="small">
                Query order-service: <Code>SELECT order_id, product_id FROM order_items JOIN orders … WHERE status='CONFIRMED' GROUP BY order_id</Code> → list(productId).
                Chỉ lấy đơn có ≥ 2 items. Lọc đơn chỉ có 1 category (mua nhiều cùng loại không phải cross-sell).
              </Text>
              <Text tone="secondary" size="small">
                Kết quả (productId là Long): <Code>transactions = [[1015, 2043, 3187], [1204, 2211], ...]</Code>
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 2</Pill><Text weight="semibold">One-hot encode và chạy FP-Growth</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from mlxtend.preprocessing import TransactionEncoder</Code> → DataFrame boolean.
                <Code>from mlxtend.frequent_patterns import fpgrowth</Code>.
                Tune <Code>min_support=0.005</Code> (0.5% đơn). Catalog &lt; 200 items → tăng lên 0.02.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 3</Pill><Text weight="semibold">Sinh và filter Association Rules</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from mlxtend.frequent_patterns import association_rules</Code>.
                Filter: <Code>confidence {'>'} 0.25</Code> VÀ <Code>lift {'>'} 1.5</Code>.
                Lift &gt; 1 = A và B mua cùng nhau nhiều hơn ngẫu nhiên. Lift = 4.2 → xác suất mua kèm gấp 4.2 lần.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 4</Pill><Text weight="semibold">Lưu rules vào MariaDB</Text></Row>
              <Text tone="secondary" size="small">
                INSERT INTO <Code>cross_sell_rules</Code> (antecedent_product_id, consequent_product_id, confidence, lift, support, co_purchase_count).
                Index trên antecedent_product_id để query O(1) khi serving. (Tuỳ chọn: đồng bộ combo mạnh sang MongoDB product_similarities.)
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 5</Pill><Text weight="semibold">Serving qua GET /recommendations/cross-sell</Text></Row>
              <Text tone="secondary" size="small">
                FE gọi <Code>GET /api/v1/recommendations/cross-sell?item_ids=1015,1204</Code> (đã có trong <Code>aiApi.ts</Code>).
                Query: <Code>SELECT consequent_product_id, confidence FROM cross_sell_rules WHERE antecedent_product_id IN (…) ORDER BY lift DESC LIMIT 5</Code>.
                Hiển thị: <Text weight="semibold" as="span">"Khách mua sản phẩm này thường mua thêm..."</Text>
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Fallback theo category khi sản phẩm mới chưa đủ data</H3>
      <Card>
        <CardHeader>Category-level rules — xử lý cold-start cho sản phẩm</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              Sản phẩm mới (&lt; 7 ngày) chưa đủ đơn hàng để tính rule.
              Fallback: dùng rule ở cấp category (<Code>categoryId</Code> Long trên Product): <Code>category:phone → category:phone_case</Code> với confidence trung bình.
            </Text>
            <Text tone="secondary" size="small">
              Tạo bảng <Code>category_cross_sell_rules</Code> cùng schema nhưng thay product_id bằng category_id.
              Item-level không có rule → query category-level → lấy top items trong category.
            </Text>
            <Callout tone="success" title="Temporal decay cho rules cũ">
              Rules từ 3 tháng gần nhất quan trọng hơn từ 1 năm trước.
              Thêm cột <Code>recency_weight = exp(-days_since_computed / 90)</Code>.
              Sort theo <Code>lift × recency_weight</Code> thay vì chỉ lift.
            </Callout>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — TRENDING & MỚI
// ─────────────────────────────────────────────────────────────────────────────

function TrendingTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Trending & Sản phẩm mới nổi bật</H2>
        <Text tone="secondary">
          Không cần ML phức tạp nhưng phải tính toán thông minh. Đây chính là chiến lược cold-start
          của recs-service (khớp <Code>popularity.py</Code>): luôn có sản phẩm hot để hiển thị dù user chưa có lịch sử.
        </Text>
      </Stack>

      <H3>3 loại score cần tính</H3>
      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">Real-time</Pill>}>Trending Score</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                Sản phẩm đang được mua/thêm giỏ nhiều trong 24–72 giờ (nguồn: Kafka events → ZINCRBY).
                Sự kiện gần đây quan trọng hơn — dùng time-decay.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Công thức:</Text>
                <Code>score = Σ weight_i × exp(−λ × hours_ago_i)</Code>
                <Text tone="secondary" size="small">λ = 0.1 → half-life ~7 giờ. Recompute mỗi 15 phút bằng worker.</Text>
              </Stack>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Theo danh mục</Pill>}>Hot in Category</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                Top trending trong từng danh mục. User xem điện thoại → chỉ hiển thị trending điện thoại.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Redis key:</Text>
                <Code>trending:cat:{"{categoryId}"}</Code>
                <Text tone="secondary" size="small">Sorted Set, cập nhật mỗi 15 phút. ZREVRANGE top-20 &lt; 1ms.</Text>
              </Stack>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Cold-start fix</Pill>}>New Arrivals Boost</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                Sản phẩm mới (&lt; 30 ngày, theo <Code>Product.createdAt</Code>) được boost để không bị chìm.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Công thức boost:</Text>
                <Code>new_score = base × (1 + 2 × exp(−days_old / 7))</Code>
                <Text tone="secondary" size="small">Ngày 1: boost 3x. Sau 7 ngày: 1.27x. Sau 30 ngày: về ~1x.</Text>
              </Stack>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>trending_worker.py — job chạy mỗi 15 phút</H3>
      <Card>
        <CardHeader>Pipeline tính và lưu trending scores</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Bước 1 — Đọc tương tác 72 giờ gần nhất (MariaDB)</Text>
              <Text tone="secondary" size="small">
                <Code>SELECT product_id, weight, created_at FROM rec_interactions WHERE created_at {'>'} NOW() - INTERVAL 72 HOUR AND weight {'>'} 0</Code>.
                (Hoặc cộng dồn trực tiếp từ Kafka consumer theo thời gian thực.)
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 2 — Tính decay score mỗi item</Text>
              <Text tone="secondary" size="small">
                Group by product_id. Mỗi event: <Code>hours_ago = (now - created_at).total_seconds() / 3600</Code>.
                Cộng dồn: <Code>score += weight × math.exp(-0.1 × hours_ago)</Code>. categoryId lấy từ product-service.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 3 — Ghi vào Redis (pipeline 1 roundtrip)</Text>
              <Text tone="secondary" size="small">
                ZADD <Code>trending:global</Code> {"{score: productId}"}, ZADD <Code>trending:cat:{"{cid}"}</Code> {"{score: productId}"}
                cho từng danh mục. Dùng Redis pipeline để tránh N roundtrips.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 4 — Snapshot vào MariaDB</Text>
              <Text tone="secondary" size="small">
                INSERT INTO <Code>trending_snapshots</Code> (product_id, score, category_id, computed_at).
                Dùng để vẽ chart xu hướng trên Admin Dashboard (React + Recharts).
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Serving — thuộc recs-service :8003 (gateway /api/v1/recommendations/**)</H3>
      <Table
        headers={["Endpoint (recs-service)", "Logic xử lý", "Latency"]}
        striped
        rows={[
          [<Code>GET /recommendations/personal?user_id=</Code>, "History rỗng → popularity/trending fallback (ZREVRANGE trending:global). CÓ trong code.", "&lt; 10ms"],
          [<Code>GET /recommendations/trending</Code>,          "ZREVRANGE trending:global 0 19 → fetch metadata. (Kế hoạch — chưa có route.)",         "&lt; 10ms"],
          [<Code>GET /recommendations/trending?category=</Code>,"ZREVRANGE trending:cat:{cid} 0 19. (Kế hoạch.)",                                        "&lt; 10ms"],
          [<Code>GET /recommendations/new-arrivals</Code>,      "Query product-service createdAt &gt; NOW()-30d ORDER BY new_score. (Kế hoạch.)",         "&lt; 50ms"],
        ]}
        columnAlign={["left", "left", "center"]}
      />

      <Callout tone="success" title="Điểm cộng: Wilson Score Interval cho ranking đánh giá">
        5 đánh giá 5★ không đáng tin bằng 500 đánh giá 4.8★. Dùng Wilson Score thay trung bình đơn giản (Product có sẵn <Code>ratingAvg</Code>).
        Công thức: <Code>w = (p̂ + z²/2n − z√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n)</Code> với z=1.96 (95% CI).
        Đây là cách Amazon, Reddit, Yelp rank sản phẩm/bình luận.
      </Callout>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6 — TÍCH HỢP HỆ THỐNG
// ─────────────────────────────────────────────────────────────────────────────

function SystemTab() {
  const theme = useHostTheme();
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Tích hợp hệ thống — Recommendation Mixer</H2>
        <Text tone="secondary">
          4 nguồn (SASRec session, Cross-sell, Trending, New/Similar) không hiển thị riêng lẻ.
          Một Mixer kết hợp, loại trùng, xếp hạng theo ngữ cảnh, trả về danh sách cuối.
        </Text>
      </Stack>

      <Callout tone="info" title="Tích hợp thực tế trong dự án AuraTech">
        <Grid columns={2} gap={10}>
          <Stack gap={4}>
            <Text size="small"><Text weight="semibold" as="span">Service:</Text> recs-service (FastAPI) trên <Code>:8003</Code>.</Text>
            <Text size="small"><Text weight="semibold" as="span">Gateway:</Text> <Code>/api/v1/recommendations/**</Code> + <Code>/api/v1/public/recommendations/**</Code> (circuit breaker ai-engine-cb 30s).</Text>
            <Text size="small"><Text weight="semibold" as="span">Auth:</Text> JWT verify tại gateway; recs đọc header <Code>X-User-Id</Code> (Keycloak UUID String).</Text>
            <Text size="small"><Text weight="semibold" as="span">Kafka:</Text> consume topic <Code>order-events</Code> (Outbox + Debezium CDC).</Text>
          </Stack>
          <Stack gap={4}>
            <Text size="small"><Text weight="semibold" as="span">MariaDB:</Text> đọc orders/products; ghi rec_interactions, cross_sell_rules.</Text>
            <Text size="small"><Text weight="semibold" as="span">MongoDB:</Text> offline job GHI <Code>product_similarities</Code> (product-service đọc lại).</Text>
            <Text size="small"><Text weight="semibold" as="span">Redis:</Text> session/user history, cache kết quả, trending Sorted Sets.</Text>
            <Text size="small"><Text weight="semibold" as="span">FE:</Text> <Code>aiApi.ts</Code> gọi <Code>/recommendations/personal</Code> &amp; <Code>/cross-sell</Code>.</Text>
          </Stack>
        </Grid>
      </Callout>

      <Callout tone="warning" title="Trạng thái code & khoảng trống cần đóng">
        <Stack gap={4}>
          <Text size="small">
            recs-service hiện là <Text weight="semibold" as="span">scaffold</Text>: <Code>sasrec.py</Code> (SASRec stub PyTorch) + <Code>popularity.py</Code> (trending stub, trả mock).
            Endpoint <Code>GET /recommendations/personal</Code> và <Code>/cross-sell</Code> đã tồn tại; cross-sell hiện trả popularity tạm.
          </Text>
          <Text size="small">
            <Text weight="semibold" as="span">Gap FE:</Text> <Code>SuggestedSection.jsx</Code> đang re-sort phía client và CHƯA gọi <Code>aiApi</Code>
            (<Code>getPersonalizedRecommendations</Code>/<Code>getCrossSellCombo</Code> đã định nghĩa nhưng chưa nối). Cần nối vào 2 endpoint trên.
          </Text>
        </Stack>
      </Callout>

      <H3>Request flow tổng thể</H3>
      <Card>
        <CardHeader>Từ FE → gateway :8080 → recs-service :8003 (dữ liệu train đến qua Kafka, offline)</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Row gap={8} align="center" wrap>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">Kafka order-events</Text>
                <Text size="small" tone="secondary">Order/Cart/Review events</Text>
              </Stack>
              <Text tone="tertiary">→ consume (offline)</Text>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">recs-service ingest</Text>
                <Text size="small" tone="secondary">Redis history + MariaDB + trending</Text>
              </Stack>
            </Row>
            <Row gap={8} align="center" wrap>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">FE (SuggestedSection)</Text>
                <Text size="small" tone="secondary">aiApi.ts</Text>
              </Stack>
              <Text tone="tertiary">→ GET /recommendations/personal?user_id=</Text>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">Gateway :8080</Text>
                <Text size="small" tone="secondary">JWT → inject X-User-Id</Text>
              </Stack>
              <Text tone="tertiary">→</Text>
              <Stack gap={2} style={{ background: theme.accent.primary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold" style={{ color: theme.text.onAccent }}>recs-service :8003 Mixer</Text>
                <Text size="small" style={{ color: theme.text.onAccent }}>Blend + Rank + Filter</Text>
              </Stack>
              <Text tone="tertiary">→ JSON items</Text>
            </Row>
          </Stack>
        </CardBody>
      </Card>

      <H3>Vị trí hiển thị gợi ý và nguồn tương ứng</H3>
      <Table
        headers={["Vị trí UI", "Nguồn chính", "Fallback", "Số items", "Trigger"]}
        striped
        rows={[
          ["Trang chủ — 'Dành cho bạn'",       <Tag label="SASRec session" tone="info" />,        <Tag label="Trending global" tone="neutral" />,    "8–12", "Load trang"],
          ["Trang SP — 'Thường mua kèm'",       <Tag label="Cross-sell rules" tone="warning" />,   <Tag label="Category trending" tone="neutral" />,  "4–6",  "Mở trang sản phẩm"],
          ["Trang SP — 'Sản phẩm tương tự'",   <Tag label="MongoDB product_similarities" tone="success" />, <Tag label="Same category hot" tone="neutral" />,  "6–8",  "Mở trang sản phẩm"],
          ["Giỏ hàng — 'Đừng quên thêm'",      <Tag label="Cross-sell (high confidence)" tone="warning" />, <Tag label="Trending cart categories" tone="neutral" />, "4–5", "CartUpdated ADD_ITEM"],
          ["Trang danh mục — 'Đang hot'",       <Tag label="Trending by category" tone="success" />,<Tag label="Bestsellers" tone="neutral" />,        "12–20", "Load danh mục"],
          ["Popup sau mua hàng",                 <Tag label="Cross-sell high lift" tone="warning" />, <Tag label="New arrivals" tone="neutral" />,      "3–4",  "OrderConfirmed"],
          ["Email marketing (batch)",            <Tag label="SASRec offline" tone="info" />,        <Tag label="Bestsellers" tone="neutral" />,         "10",   "Cron job hàng ngày"],
        ]}
        columnAlign={["left", "left", "left", "center", "left"]}
      />

      <H3>Mixer — logic 6 bước chi tiết</H3>
      <Card>
        <CardHeader trailing={<Pill tone="success" size="sm">Core component</Pill>}>
          GET /api/v1/recommendations/personal?user_id={"{X-User-Id}"}&amp;context={"{ctx}"}
        </CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Text weight="semibold">1 — Xác định context weights</Text>
              <Table
                framed={false} striped
                headers={["Context", "Session", "Cross-sell", "Trending", "New/Similar"]}
                rows={[
                  ["homepage",            "0.5", "0.1", "0.3", "0.1"],
                  ["product_page",        "0.3", "0.4", "0.2", "0.1"],
                  ["cart",                "0.2", "0.6", "0.1", "0.1"],
                  ["new_user (cold-start)","0.0", "0.0", "0.6", "0.4"],
                ]}
                columnAlign={["left", "center", "center", "center", "center"]}
              />
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">2 — Thu thập candidates song song (asyncio.gather)</Text>
              <Text tone="secondary" size="small">
                Gọi đồng thời: get_session_recs() (SASRec + Redis history) + get_crosssell_recs() (MariaDB rules)
                + get_trending_recs() (Redis) + get_similar/new() (MongoDB product_similarities). Mỗi nguồn 20 items, timeout 100ms.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">3 — Normalize scores và blend</Text>
              <Text tone="secondary" size="small">
                Min-max normalize score từng nguồn về [0,1].
                final_score = Σ (w_source × score_source). Item không có score từ nguồn nào → 0.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">4 — Filter và dedup</Text>
              <Text tone="secondary" size="small">
                Loại items user đã mua (check Redis <Code>user:{"{uid}"}:purchased</Code>).
                Loại item hết hàng (kiểm tra qua inventory-service — stock KHÔNG nằm trên Product).
                Dedup productId từ nhiều nguồn → giữ final_score cao nhất.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">5 — Diversity boost (MMR)</Text>
              <Text tone="secondary" size="small">
                Maximal Marginal Relevance: xen kẽ categories (theo <Code>categoryId</Code>). Tránh trả về 10 items cùng loại.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">6 — Cache và trả về</Text>
              <Text tone="secondary" size="small">
                SET Redis <Code>rec:{"{uid}"}:{"{ctx}"}:result</Code> TTL 300s.
                Response khớp <Code>AIProduct</Code> của FE: <Code>{"{ id, name, price, oldPrice?, image, brand, category, matchScore? }"}</Code> + <Code>source/reason</Code>.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Trường source + reason trong response — Explainability</H3>
      <Table
        headers={["source value", "reason hiển thị cho user", "Nguồn kỹ thuật"]}
        striped
        rows={[
          ["session",    "'Dựa trên lịch sử của bạn'",           "SASRec output + item có weight cao nhất trong sequence"],
          ["cross_sell", "'Thường mua kèm với sản phẩm này'",     "FP-Growth rule consequent, antecedent = productId trong cart"],
          ["trending",   "'Đang được mua nhiều hôm nay'",         "Trending decay score cao (Redis Sorted Set)"],
          ["new_arrival","'Mới về'",                              "Product.createdAt &lt; 7 ngày + new_score boost"],
          ["popular",    "'Bán chạy nhất'",                       "Popularity fallback (cold-start) — khớp popularity.py"],
          ["similar",    "'Tương tự sản phẩm bạn đang xem'",     "MongoDB product_similarities (item-to-item)"],
        ]}
        columnAlign={["left", "left", "left"]}
      />

      <H3>Monitoring và retrain</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Online metrics cần theo dõi hàng ngày</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Row gap={6} align="center" justify="space-between">
                <Text size="small">CTR (click-through rate trên gợi ý)</Text>
                <Tag label="Target > 5%" tone="success" />
              </Row>
              <Row gap={6} align="center" justify="space-between">
                <Text size="small">Conversion rate từ gợi ý</Text>
                <Tag label="Target > 2%" tone="success" />
              </Row>
              <Row gap={6} align="center" justify="space-between">
                <Text size="small">Revenue attributed to rec</Text>
                <Tag label="Track daily" tone="info" />
              </Row>
              <Row gap={6} align="center" justify="space-between">
                <Text size="small">Avg categories per recommendation</Text>
                <Tag label="Target > 3" tone="info" />
              </Row>
              <Row gap={6} align="center" justify="space-between">
                <Text size="small">Coverage (% items được gợi ý)</Text>
                <Tag label="Target > 15%" tone="neutral" />
              </Row>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Lịch retrain</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Stack gap={3}>
                <Row gap={6} align="center"><Tag label="SASRec / BERT4Rec" tone="info" /><Text size="small" tone="secondary">Mỗi tuần, full retrain từ rec_interactions. MLflow so sánh HR@10 trước/sau.</Text></Row>
              </Stack>
              <Divider />
              <Stack gap={3}>
                <Row gap={6} align="center"><Tag label="FP-Growth + product_similarities" tone="warning" /><Text size="small" tone="secondary">Mỗi tuần. Thêm rules mới, ghi lại MongoDB, xóa item hết hàng.</Text></Row>
              </Stack>
              <Divider />
              <Stack gap={3}>
                <Row gap={6} align="center"><Tag label="Trending scores" tone="success" /><Text size="small" tone="secondary">Worker mỗi 15 phút. Không train — chỉ recompute Redis Sorted Sets.</Text></Row>
              </Stack>
              <Divider />
              <Stack gap={3}>
                <Row gap={6} align="center"><Tag label="FAISS index" tone="neutral" /><Text size="small" tone="secondary">Sau mỗi lần retrain. Hot-swap vào RAM, không downtime.</Text></Row>
              </Stack>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Callout tone="info" title="Cá nhân hoá theo tier (tuỳ chọn, dữ liệu từ user-service)">
        <Text size="small">
          RFM/segmentation thuộc forecast-service, ghi <Code>segmentationLabel</Code> vào user-service. recs CHỈ tiêu thụ
          (đọc) <Code>customerTier</Code> (DIAMOND/GOLD/…) / <Code>segmentationLabel</Code> nếu muốn điều chỉnh nhẹ blend — KHÔNG tự tính, KHÔNG write-back.
        </Text>
      </Callout>

      <Callout tone="success" title="Điểm cộng tối đa: A/B Testing Framework">
        Chia user thành 2 nhóm bằng hash Keycloak UUID (<Code>hash(user_id) % 2</Code>): nhóm A dùng Mixer mặc định,
        nhóm B tăng weight cross-sell. So sánh CTR và conversion sau 1 tuần, log ra MariaDB.
        Đây là cách Shopee, Lazada, Amazon vận hành recommendation thực tế — ghi điểm mạnh với giám khảo kỹ thuật.
      </Callout>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

export default function RecommendationSystem() {
  const theme = useHostTheme();
  const [activeTab, setActiveTab] = useCanvasState("recFinalTab", "data");

  return (
    <Stack gap={0} style={{ minHeight: "100vh", background: theme.bg.editor }}>
      <Stack gap={16} style={{ padding: "24px 32px 0 32px" }}>
        <Stack gap={4}>
          <H1>Recommendation System — Tài liệu kỹ thuật (recs-service :8003)</H1>
          <Text tone="secondary">
            Kế hoạch bám codebase THẬT: Kafka events → train → đánh giá → cross-sell → trending → tích hợp.
            Dữ liệu = MariaDB + MongoDB + Redis + Kafka (không PostgreSQL).
          </Text>
        </Stack>

        <Row gap={8} wrap>
          {TABS.map(t => (
            <Pill key={t.id} active={t.id === activeTab} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </Pill>
          ))}
        </Row>

        <Grid columns={6} gap={8}>
          <Stat value="SASRec" label="Model deploy" tone="success" />
          <Stat value="5"      label="Kafka event types" tone="info" />
          <Stat value=":8003"  label="recs-service port" tone="info" />
          <Stat value="FP-G"   label="Cross-sell engine" tone="warning" />
          <Stat value="Mongo"  label="product_similarities" tone="info" />
          <Stat value="A/B"    label="Online eval" tone="success" />
        </Grid>

        <Divider />
      </Stack>

      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "data"     && <DataTab />}
        {activeTab === "train"    && <TrainTab />}
        {activeTab === "evaluate" && <EvaluateTab />}
        {activeTab === "cross"    && <CrossTab />}
        {activeTab === "trending" && <TrendingTab />}
        {activeTab === "system"   && <SystemTab />}
      </Stack>
    </Stack>
  );
}
