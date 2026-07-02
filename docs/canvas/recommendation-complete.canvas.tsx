/**
 * Recommendation System — Tài liệu kỹ thuật đầy đủ
 * Đủ để một developer đọc và implement từ đầu đến cuối.
 *
 * Tab 1: Dữ liệu & Schema       — action types, DB schema, Redis, tracking pipeline
 * Tab 2: Train Models            — preprocessing, SASRec / GRU4Rec / BERT4Rec, FAISS
 * Tab 3: Đánh giá                — metrics, Leave-One-Out, benchmark 3 models
 * Tab 4: Cross-selling           — FP-Growth, co-purchase, cross_sell_rules
 * Tab 5: Trending & Mới          — time-decay score, new arrivals, Wilson Score
 * Tab 6: Tích hợp hệ thống       — Mixer, APIs, serving logic, monitoring, retrain
 */
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const TABS = [
  { id: "data",     label: "1. Dữ liệu & Schema" },
  { id: "train",    label: "2. Train Models" },
  { id: "evaluate", label: "3. Đánh giá" },
  { id: "cross",    label: "4. Cross-selling" },
  { id: "trending", label: "5. Trending & Mới" },
  { id: "system",   label: "6. Tích hợp hệ thống" },
];

function Tag({ label, tone }: { label: string; tone?: "info" | "success" | "warning" | "neutral" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — DỮ LIỆU & SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

function DataTab() {
  const theme = useHostTheme();
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Mô hình dữ liệu toàn diện</H2>
        <Text tone="secondary">
          Mọi action của người dùng đều được ghi lại với trọng số riêng.
          Đây là nguyên liệu thô để train tất cả model và tính các score real-time.
        </Text>
      </Stack>

      <Callout tone="warning" title="Neo4j và FAISS — có cần không?">
        <Stack gap={6}>
          <Text size="small">
            <Text weight="semibold" as="span">Neo4j: KHÔNG cần</Text> cho SASRec / GRU4Rec / BERT4Rec.
            Neo4j dùng cho Graph Neural Network (PinSage, LightGCN) — phức tạp hơn nhiều.
            PostgreSQL là đủ cho toàn bộ pipeline này.
          </Text>
          <Text size="small">
            <Text weight="semibold" as="span">FAISS: CÓ</Text>, nhưng chỉ ở bước inference cuối.
            Sau khi model sinh user embedding, FAISS tìm K sản phẩm gần nhất trong &lt; 5ms.
            Không cần trong quá trình train.
          </Text>
        </Stack>
      </Callout>

      <H3>Toàn bộ action types và trọng số</H3>
      <Table
        headers={["Action", "Ý nghĩa", "Weight", "Lưu vào", "Ghi chú"]}
        striped
        rows={[
          [<Code>view</Code>,             "Xem trang sản phẩm",              <Text weight="bold">1</Text>,        "Redis session + PG",    "Chỉ tính nếu dừng trên 3 giây"],
          [<Code>search_click</Code>,     "Click từ kết quả tìm kiếm",       <Text weight="bold">1.5</Text>,      "Redis session + PG",    "Có thêm trường query_text"],
          [<Code>compare</Code>,          "Thêm vào trang so sánh",          <Text weight="bold">2</Text>,        "Redis session + PG",    "Intent cao, đang cân nhắc kỹ"],
          [<Code>share</Code>,            "Chia sẻ sản phẩm",                <Text weight="bold">2</Text>,        "PG only",               "Channel: zalo, facebook, copy link"],
          [<Code>wishlist_add</Code>,     "Thêm vào yêu thích",              <Text weight="bold">3</Text>,        "PG + Redis user_state", "Tín hiệu mua sau (save for later)"],
          [<Code>wishlist_remove</Code>,  "Xóa khỏi yêu thích",             <Text weight="bold">-1</Text>,       "PG + Redis user_state", "Giảm interest, vẫn ghi lại"],
          [<Code>add_to_cart</Code>,      "Thêm vào giỏ hàng",               <Text weight="bold">4</Text>,        "Redis session + PG",    "Intent mua rất cao"],
          [<Code>remove_from_cart</Code>, "Xóa khỏi giỏ hàng",              <Text weight="bold">-2</Text>,       "PG + Redis session",    "Giảm intent nhưng không về 0"],
          [<Code>rating</Code>,           "Đánh giá sao 1–5",                <Text weight="bold">stars × 2</Text>,"PG only",               "Rating 1★ = weight -2 (âm)"],
          [<Code>review_write</Code>,     "Viết đánh giá sản phẩm",          <Text weight="bold">6</Text>,        "PG only",               "Commitment cao nhất ngoài mua hàng"],
          [<Code>purchase</Code>,         "Đặt hàng thành công",             <Text weight="bold">10</Text>,       "PG (orders table)",     "Signal mạnh nhất, ground truth"],
          [<Code>return_request</Code>,   "Yêu cầu trả hàng",               <Text weight="bold">-5</Text>,       "PG only",               "Trải nghiệm tệ, penalize item"],
        ]}
        columnAlign={["left", "left", "center", "left", "left"]}
        rowTone={[
          undefined, undefined, undefined, undefined,
          "success", "danger",
          "success", "danger",
          "info", "info", "success", "danger",
        ]}
      />

      <H3>Schema PostgreSQL đầy đủ</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">Bảng chính</Pill>}>
            user_events
          </CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Table
                framed={false} striped
                headers={["Column", "Type", "Index"]}
                rows={[
                  [<Code>id</Code>,            "BIGSERIAL PK",   "—"],
                  [<Code>user_id</Code>,        "VARCHAR(64)",    "YES"],
                  [<Code>session_id</Code>,     "VARCHAR(64)",    "YES"],
                  [<Code>item_id</Code>,        "VARCHAR(64)",    "YES"],
                  [<Code>action_type</Code>,    "VARCHAR(24)",    "—"],
                  [<Code>weight</Code>,         "FLOAT",          "—"],
                  [<Code>query_text</Code>,     "TEXT NULLABLE",  "—"],
                  [<Code>dwell_time_ms</Code>,  "INT NULLABLE",   "—"],
                  [<Code>device_type</Code>,    "VARCHAR(16)",    "—"],
                  [<Code>created_at</Code>,     "TIMESTAMPTZ",    "YES"],
                ]}
                columnAlign={["left", "left", "center"]}
              />
              <Text size="small" tone="tertiary">Composite index: (user_id, created_at DESC)</Text>
            </Stack>
          </CardBody>
        </Card>

        <Stack gap={12}>
          <Card>
            <CardHeader trailing={<Pill tone="info" size="sm">Cho cross-sell</Pill>}>
              orders + order_items
            </CardHeader>
            <CardBody>
              <Table
                framed={false} striped
                headers={["Column", "Type"]}
                rows={[
                  [<Code>order_id</Code>,    "VARCHAR(64) PK"],
                  [<Code>user_id</Code>,     "VARCHAR(64) INDEX"],
                  [<Code>item_id</Code>,     "VARCHAR(64) INDEX"],
                  [<Code>quantity</Code>,    "INT"],
                  [<Code>price</Code>,       "DECIMAL(12,2)"],
                  [<Code>category_id</Code>, "VARCHAR(32) INDEX"],
                  [<Code>created_at</Code>,  "TIMESTAMPTZ INDEX"],
                ]}
                columnAlign={["left", "left"]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>cross_sell_rules</CardHeader>
            <CardBody>
              <Table
                framed={false} striped
                headers={["Column", "Type"]}
                rows={[
                  [<Code>antecedent_item_id</Code>, "VARCHAR(64) INDEX"],
                  [<Code>consequent_item_id</Code>, "VARCHAR(64)"],
                  [<Code>confidence</Code>,          "FLOAT"],
                  [<Code>lift</Code>,                "FLOAT"],
                  [<Code>support</Code>,             "FLOAT"],
                  [<Code>co_purchase_count</Code>,   "INT"],
                  [<Code>updated_at</Code>,          "TIMESTAMPTZ"],
                ]}
                columnAlign={["left", "left"]}
              />
            </CardBody>
          </Card>
        </Stack>
      </Grid>

      <H3>Redis key schema</H3>
      <Table
        headers={["Key pattern", "Kiểu Redis", "TTL", "Dùng để"]}
        striped
        rows={[
          [<Code>sess:{"{sid}"}:seq</Code>,          "List",        "1800s",  "Chuỗi item_id trong session hiện tại (LPUSH)"],
          [<Code>sess:{"{sid}"}:weights</Code>,      "Hash",        "1800s",  "item_id → weight tích lũy trong session"],
          [<Code>user:{"{uid}"}:wishlist</Code>,     "Set",         "7 ngày", "Tập item_id đang trong wishlist"],
          [<Code>user:{"{uid}"}:purchased</Code>,    "Set",         "30 ngày","Tập item_id đã mua (dùng để filter)"],
          [<Code>rec:{"{uid}"}:{"{ctx}"}:result</Code>, "List",    "300s",   "Cache kết quả gợi ý đã blend"],
          [<Code>item:{"{iid}"}:meta</Code>,         "Hash",        "3600s",  "Cache name, price, img_url sản phẩm"],
          [<Code>trending:global</Code>,             "Sorted Set",  "—",      "Top items toàn site (ZINCRBY, no TTL)"],
          [<Code>trending:cat:{"{cid}"}</Code>,      "Sorted Set",  "—",      "Top items theo danh mục"],
        ]}
        columnAlign={["left", "center", "center", "left"]}
      />

      <H3>Luồng ghi dữ liệu khi user thực hiện action</H3>
      <Card>
        <CardHeader>Event tracking pipeline — async, không block UI</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={8} align="center">
                <Pill tone="neutral" size="sm">Bước 1</Pill>
                <Text weight="semibold">Frontend gửi event (fire-and-forget)</Text>
              </Row>
              <Text tone="secondary" size="small">
                POST <Code>/api/track</Code> với payload <Code>{"{ user_id, session_id, item_id, action_type, dwell_time_ms }"}</Code>.
                Không <Code>await</Code> response — không chặn UX. Gửi ngay sau khi action xảy ra.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={8} align="center">
                <Pill tone="neutral" size="sm">Bước 2</Pill>
                <Text weight="semibold">FastAPI tính weight, ghi 3 chỗ song song (asyncio.gather)</Text>
              </Row>
              <Grid columns={3} gap={8}>
                <Stack gap={3}>
                  <Tag label="Redis session" tone="warning" />
                  <Text size="small" tone="secondary">LPUSH seq + HINCRBYFLOAT weights. Dùng ngay cho inference.</Text>
                </Stack>
                <Stack gap={3}>
                  <Tag label="PostgreSQL" tone="neutral" />
                  <Text size="small" tone="secondary">INSERT INTO user_events. Dùng để retrain model mỗi tuần.</Text>
                </Stack>
                <Stack gap={3}>
                  <Tag label="Redis trending" tone="info" />
                  <Text size="small" tone="secondary">ZINCRBY trending:global và trending:cat:{"{cid}"}.</Text>
                </Stack>
              </Grid>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={8} align="center">
                <Pill tone="neutral" size="sm">Bước 3</Pill>
                <Text weight="semibold">Invalidate cache gợi ý khi có action quan trọng</Text>
              </Row>
              <Text tone="secondary" size="small">
                Khi action_type ∈ {"{purchase, add_to_cart, wishlist_add}"} → DEL <Code>rec:{"{uid}"}:*</Code>
                để request gợi ý tiếp theo tính lại kết quả mới.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="info" title="Sinh dữ liệu giả lập khi chưa có user thật">
        Dùng <Code>Faker</Code> + <Code>scipy.stats</Code> sinh 10.000 user, 500 sản phẩm,
        500.000 events trong 6 tháng. Phân phối Power-law: 80% traffic vào 20% sản phẩm phổ biến.
        Đủ để train và demo toàn bộ hệ thống mà không cần dữ liệu thật.
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
          Train 3 model cạnh tranh (SASRec, GRU4Rec, BERT4Rec) trên cùng pipeline dữ liệu.
          Đánh giá bằng cùng metric, chọn model tốt nhất để deploy.
        </Text>
      </Stack>

      <H3>Bước 1 — Preprocessing dữ liệu (dùng chung cho 3 model)</H3>
      <Card>
        <CardHeader>Data pipeline (Python ~100 dòng)</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1.1</Pill><Text weight="semibold">Query và lọc</Text></Row>
              <Text tone="secondary" size="small">
                <Code>SELECT user_id, item_id, weight, created_at FROM user_events WHERE weight {'>'} 0 ORDER BY user_id, created_at ASC</Code>.
                Loại user &lt; 5 tương tác. Loại item xuất hiện &lt; 3 lần toàn bộ data.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1.2</Pill><Text weight="semibold">Xây dựng weighted sequence</Text></Row>
              <Text tone="secondary" size="small">
                Group by user_id → chuỗi (item_id, weight) theo thời gian.
                Nếu cùng item xuất hiện nhiều lần trong 1 session → cộng dồn weight, giữ vị trí cuối cùng.
                Kết quả: <Code>user_seqs = {"{"}"u1": [101, 55, 203, 88], "u2": [7, 31, ...]{"}"}</Code>
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1.3</Pill><Text weight="semibold">Encode item ID + Padding</Text></Row>
              <Text tone="secondary" size="small">
                Map item_id (string) → integer 1..N. Index 0 = PAD token. Lưu <Code>item2idx.json</Code> và <Code>idx2item.json</Code>.
                Cắt sequence tối đa 50 items. Ngắn hơn → left-pad bằng 0.
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
        <CardHeader trailing={<Pill tone="success" size="sm">Khuyến nghị train trước</Pill>}>
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
                <Text weight="semibold" size="small">Kiến trúc</Text>
                <Stack gap={4}>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Item Embedding:</Text> bảng lookup (N+1)×D. Index 0 = PAD, không cập nhật.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Positional Embedding:</Text> trainable, không dùng sinusoidal cố định.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">2× Transformer Block:</Text> causal self-attention + point-wise FF + LayerNorm + Dropout.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Loss:</Text> BCE với negative sampling. Loss = BCE(score_pos,1) + BCE(score_neg,0).</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Early stop:</Text> dừng khi val HR@10 không tăng sau 20 epoch liên tiếp.</Text>
                  <Text tone="secondary" size="small"><Text weight="semibold" as="span">Augmentation:</Text> item crop, item mask (10%) để tăng robustness.</Text>
                </Stack>
                <Callout tone="info" title="Repo tham khảo">
                  <Code>pmixer/SASRec.pytorch</Code> — code sạch, có sẵn dataloader, khoảng 300 dòng.
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
                  Train lâu hơn SASRec 2–3x. Trên máy không có GPU mạnh → train SASRec và GRU4Rec trước.
                </Callout>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <H3>Bước 3 — Build FAISS Index sau khi train xong</H3>
      <Card>
        <CardHeader>Trích xuất item embeddings → FAISS index (chạy 1 lần offline)</CardHeader>
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
              4. Build FAISS: <Code>index = faiss.IndexFlatIP(D); index.add(embeddings[1:])</Code> (bỏ PAD index 0).
            </Text>
            <Text tone="secondary" size="small">
              5. Lưu: <Code>faiss.write_index(index, "item_index.faiss")</Code> + <Code>json.dump(idx2item, open("idx2item.json","w"))</Code>
            </Text>
            <Text tone="secondary" size="small">
              6. Khi server khởi động: load index vào RAM 1 lần. Inference: <Code>index.search(user_vec, k=20)</Code> → &lt; 5ms.
            </Text>
            <Callout tone="info" title="Khi nào cần FAISS vs brute-force?">
              Catalog &lt; 10k sản phẩm: brute-force numpy dot product là đủ.
              Catalog &gt; 50k sản phẩm: FAISS IndexFlatIP (chính xác) hoặc IndexIVFFlat (nhanh hơn, xấp xỉ).
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
            "Trong K gợi ý, bao nhiêu % là đúng (thường chỉ có 1 ground truth nên P@K = HR@K / K).",
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
                Model có HR@10 cao nhất trên test set → deploy. Lưu kết quả vào MLflow.
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
          [<Text weight="bold">SASRec</Text>, "0.578", "0.718", "0.453", "0.496", "0.412", <Pill tone="success" size="sm">Tốt nhất tổng thể</Pill>],
          ["BERT4Rec",                        "0.571", "0.712", "0.447", "0.490", "0.407", <Pill tone="info" size="sm">Sát SASRec, train lâu hơn</Pill>],
          ["GRU4Rec",                         "0.520", "0.658", "0.401", "0.441", "0.368", <Pill tone="neutral" size="sm">Baseline nhanh nhất</Pill>],
        ]}
        rowTone={["success", undefined, undefined]}
        columnAlign={["left", "center", "center", "center", "center", "center", "left"]}
      />
      <Text tone="tertiary" size="small">
        Kết quả trên dữ liệu của bạn sẽ khác. Benchmark này chỉ để định hướng kỳ vọng.
        SASRec thường thắng vì self-attention capture long-range dependency tốt hơn GRU.
      </Text>

      <Callout tone="success" title="Điểm cộng trong báo cáo">
        Vẽ biểu đồ HR@K với K từ 1 đến 20 cho cả 3 model (dùng matplotlib).
        Cho thấy rõ model nào tốt hơn ở mức K nào.
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
          Hoàn toàn độc lập với session-based — phải dùng dữ liệu orders, không phải clickstream.
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
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 1</Pill><Text weight="semibold">Chuẩn bị transaction data từ bảng orders</Text></Row>
              <Text tone="secondary" size="small">
                Query: GROUP BY order_id → list(item_id). Chỉ lấy đơn hàng có ít nhất 2 items.
                Lọc bỏ đơn hàng chỉ có 1 category (ví dụ: mua nhiều áo cùng loại không phải cross-sell).
              </Text>
              <Text tone="secondary" size="small">
                Kết quả: <Code>transactions = [["iphone_15", "magsafe_case", "usbc_charger"], ["samsung_s24", "clear_case"], ...]</Code>
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 2</Pill><Text weight="semibold">One-hot encode và chạy FP-Growth</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from mlxtend.preprocessing import TransactionEncoder</Code> → encode thành DataFrame boolean.
                <Code>from mlxtend.frequent_patterns import fpgrowth</Code>.
                Tune <Code>min_support=0.005</Code> (0.5% đơn hàng). Catalog &lt; 200 items → tăng lên 0.02.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 3</Pill><Text weight="semibold">Sinh và filter Association Rules</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from mlxtend.frequent_patterns import association_rules</Code>.
                Filter: <Code>confidence {'>'} 0.25</Code> VÀ <Code>lift {'>'} 1.5</Code>.
                Lift &gt; 1 = A và B thường mua cùng nhau hơn ngẫu nhiên.
                Lift = 4.2 nghĩa là xác suất mua kèm cao gấp 4.2 lần so với nếu không liên quan.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 4</Pill><Text weight="semibold">Lưu rules vào PostgreSQL</Text></Row>
              <Text tone="secondary" size="small">
                INSERT INTO cross_sell_rules (antecedent_item_id, consequent_item_id, confidence, lift, support, co_purchase_count).
                Index trên antecedent_item_id để query O(1) khi serving.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 5</Pill><Text weight="semibold">Serving real-time khi user add_to_cart</Text></Row>
              <Text tone="secondary" size="small">
                Trigger: user add_to_cart item X.
                Query: <Code>SELECT consequent_item_id, confidence FROM cross_sell_rules WHERE antecedent_item_id = X ORDER BY lift DESC LIMIT 5</Code>.
                Hiển thị trong giỏ hàng: <Text weight="semibold" as="span">"Khách mua iPhone 15 thường mua thêm..."</Text>
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
              Sản phẩm mới ra (thêm 7 ngày) chưa có đủ đơn hàng để tính rule.
              Fallback: dùng rule ở cấp category: <Code>"category:phone → category:phone_case"</Code> với confidence trung bình của category.
            </Text>
            <Text tone="secondary" size="small">
              Tạo thêm bảng <Code>category_cross_sell_rules</Code> với cùng schema nhưng thay item_id bằng category_id.
              Khi item-level không có rule → query category-level → lấy top items trong category gợi ý.
            </Text>
            <Callout tone="success" title="Temporal decay cho rules cũ">
              Rules tính từ 3 tháng gần nhất quan trọng hơn từ 1 năm trước (xu hướng thay đổi).
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
          Không cần ML phức tạp nhưng phải tính toán thông minh.
          Giải quyết cold-start hoàn toàn và luôn có sản phẩm hot để hiển thị
          dù user chưa có lịch sử nào.
        </Text>
      </Stack>

      <H3>3 loại score cần tính</H3>
      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">Real-time</Pill>}>Trending Score</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                Sản phẩm đang được mua/xem nhiều trong 24–72 giờ qua.
                Sự kiện gần đây quan trọng hơn sự kiện cũ — dùng time-decay.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Công thức:</Text>
                <Code>score = Σ weight_i × exp(−λ × hours_ago_i)</Code>
                <Text tone="secondary" size="small">λ = 0.1 → half-life ~7 giờ. Cập nhật mỗi 15 phút bằng cron job.</Text>
              </Stack>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Theo danh mục</Pill>}>Hot in Category</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                Top trending trong từng danh mục riêng. User đang xem điện thoại → chỉ hiển thị trending điện thoại, không phải trending toàn site.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Redis key:</Text>
                <Code>trending:cat:{"{category_id}"}</Code>
                <Text tone="secondary" size="small">Sorted Set, cập nhật mỗi 15 phút. ZREVRANGE lấy top-20 &lt; 1ms.</Text>
              </Stack>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Cold-start fix</Pill>}>New Arrivals Boost</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                Sản phẩm mới (&lt; 30 ngày) được boost điểm để xuất hiện nhiều hơn, tránh bị chìm trong catalog lớn.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Công thức boost:</Text>
                <Code>new_score = base × (1 + 2 × exp(−days_old / 7))</Code>
                <Text tone="secondary" size="small">Ngày 1: boost 3x. Sau 7 ngày: boost 1.27x. Sau 30 ngày: về gần 1x.</Text>
              </Stack>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>trending_worker.py — cron job chạy mỗi 15 phút</H3>
      <Card>
        <CardHeader>Pipeline tính và lưu trending scores</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Bước 1 — Query events 72 giờ gần nhất</Text>
              <Text tone="secondary" size="small">
                <Code>SELECT item_id, category_id, weight, created_at FROM user_events WHERE created_at {'>'} NOW() - INTERVAL '72 hours' AND weight {'>'} 0</Code>
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 2 — Tính decay score mỗi item</Text>
              <Text tone="secondary" size="small">
                Group by item_id. Với mỗi event: <Code>hours_ago = (now - created_at).total_seconds() / 3600</Code>.
                Cộng dồn: <Code>score += weight × math.exp(-0.1 × hours_ago)</Code>.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 3 — Ghi vào Redis (pipeline 1 roundtrip)</Text>
              <Text tone="secondary" size="small">
                Dùng Redis pipeline: ZADD trending:global {"{score: item_id}"}, ZADD trending:cat:{"{cat}"} {"{score: item_id}"}
                cho từng danh mục. Dùng pipeline để tránh N roundtrips.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 4 — Snapshot vào PostgreSQL</Text>
              <Text tone="secondary" size="small">
                INSERT INTO trending_snapshots (item_id, score, category_id, computed_at).
                Dùng để vẽ chart xu hướng theo thời gian trên Admin Dashboard.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Serving APIs</H3>
      <Table
        headers={["Endpoint", "Logic xử lý", "Latency"]}
        striped
        rows={[
          [<Code>GET /recommend/trending</Code>,               "ZREVRANGE trending:global 0 19 → fetch metadata",                       "&lt; 10ms"],
          [<Code>GET /recommend/trending?category=phones</Code>, "ZREVRANGE trending:cat:phones 0 19",                                  "&lt; 10ms"],
          [<Code>GET /recommend/new-arrivals</Code>,            "SELECT WHERE created_at &gt; NOW()-30d ORDER BY new_score DESC LIMIT 20", "&lt; 50ms"],
          [<Code>GET /recommend/bestsellers?period=7d</Code>,   "Precomputed daily, cache Redis 1h",                                     "&lt; 10ms"],
        ]}
        columnAlign={["left", "left", "center"]}
      />

      <Callout tone="success" title="Điểm cộng: Wilson Score Interval cho ranking đánh giá">
        5 đánh giá 5★ không đáng tin bằng 500 đánh giá 4.8★. Dùng Wilson Score thay trung bình đơn giản.
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
          4 nguồn (Session, Cross-sell, Trending, New) không hiển thị riêng lẻ.
          Một Mixer kết hợp, loại trùng lặp, xếp hạng theo ngữ cảnh, trả về danh sách cuối.
        </Text>
      </Stack>

      <H3>Request flow tổng thể</H3>
      <Card>
        <CardHeader>Từ click của user → gợi ý xuất hiện trên màn hình</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Row gap={8} align="center" wrap>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">User click sản phẩm</Text>
                <Text size="small" tone="secondary">Frontend</Text>
              </Stack>
              <Text tone="tertiary">→ POST /track (async)</Text>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">Tracking Service</Text>
                <Text size="small" tone="secondary">Redis + PG + Trending</Text>
              </Stack>
            </Row>
            <Row gap={8} align="center" wrap>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">Request gợi ý</Text>
                <Text size="small" tone="secondary">Frontend</Text>
              </Stack>
              <Text tone="tertiary">→ GET /recommend/{"{uid}"}?ctx={"{context}"}</Text>
              <Stack gap={2} style={{ background: theme.accent.primary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold" style={{ color: theme.text.onAccent }}>Mixer Service</Text>
                <Text size="small" style={{ color: theme.text.onAccent }}>Blend + Rank + Filter</Text>
              </Stack>
              <Text tone="tertiary">→ JSON items</Text>
              <Stack gap={2} style={{ background: theme.fill.secondary, padding: "8px 14px", borderRadius: 6 }}>
                <Text size="small" weight="semibold">Render gợi ý</Text>
                <Text size="small" tone="secondary">Frontend</Text>
              </Stack>
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
          ["Trang SP — 'Sản phẩm tương tự'",   <Tag label="FAISS item-item" tone="info" />,        <Tag label="Same category hot" tone="neutral" />,  "6–8",  "Mở trang sản phẩm"],
          ["Giỏ hàng — 'Đừng quên thêm'",      <Tag label="Cross-sell (high confidence)" tone="warning" />, <Tag label="Trending cart categories" tone="neutral" />, "4–5", "add_to_cart"],
          ["Trang danh mục — 'Đang hot'",       <Tag label="Trending by category" tone="success" />,"—",                                               "12–20", "Load danh mục"],
          ["Popup sau mua hàng",                 <Tag label="Cross-sell high lift" tone="warning" />, <Tag label="New arrivals" tone="neutral" />,      "3–4",  "purchase confirm"],
          ["Email marketing (batch)",            <Tag label="SASRec offline" tone="info" />,        <Tag label="Bestsellers" tone="neutral" />,         "10",   "Cron job hàng ngày"],
        ]}
        columnAlign={["left", "left", "left", "center", "left"]}
      />

      <H3>Mixer API — logic 6 bước chi tiết</H3>
      <Card>
        <CardHeader trailing={<Pill tone="success" size="sm">Core component</Pill>}>
          GET /recommend/{"{user_id}"}?context={"{context}"}
        </CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Text weight="semibold">1 — Xác định context weights</Text>
              <Table
                framed={false} striped
                headers={["Context", "Session", "Cross-sell", "Trending", "New"]}
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
                Gọi đồng thời 4 hàm: get_session_recs() + get_crosssell_recs() + get_trending_recs() + get_new_arrivals().
                Mỗi nguồn trả về 20 items với raw score của nó. Timeout 100ms mỗi nguồn.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">3 — Normalize scores và blend</Text>
              <Text tone="secondary" size="small">
                Min-max normalize score từng nguồn về [0,1].
                final_score = Σ (w_source × score_source). Items không có score từ nguồn nào → 0.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">4 — Filter và dedup</Text>
              <Text tone="secondary" size="small">
                Loại items user đã mua (check Redis user:{"{uid}"}:purchased).
                Loại items hết hàng (stock = 0). Loại trùng item_id từ nhiều nguồn → giữ final_score cao nhất.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">5 — Diversity boost (MMR)</Text>
              <Text tone="secondary" size="small">
                Maximal Marginal Relevance: xen kẽ categories. Item tiếp theo được chọn phải thuộc
                category chưa xuất hiện trong danh sách đã chọn. Tránh trả về 10 items cùng loại.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">6 — Cache và trả về</Text>
              <Text tone="secondary" size="small">
                SET Redis rec:{"{uid}"}:{"{ctx}"}:result TTL 300s.
                Response format: <Code>{"{ items: [{id, name, price, img, score, source, reason}] }"}</Code>
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
          ["session",    "'Dựa trên lịch sử duyệt của bạn'",     "SASRec output + attention item có weight cao nhất"],
          ["cross_sell", "'Thường mua kèm với iPhone 15'",        "FP-Growth rule consequent, antecedent = item trong cart"],
          ["trending",   "'Đang được mua nhiều hôm nay'",         "Trending decay score cao"],
          ["new_arrival","'Mới về hôm nay'",                      "created_at &lt; 7 ngày + new_score boost"],
          ["popular",    "'Bán chạy nhất tuần này'",              "Bestseller fallback khi không có session"],
          ["similar",    "'Tương tự sản phẩm bạn đang xem'",     "FAISS item-to-item cosine similarity"],
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
                <Row gap={6} align="center"><Tag label="SASRec / BERT4Rec" tone="info" /><Text size="small" tone="secondary">Mỗi tuần, full retrain. MLflow so sánh HR@10 trước/sau deploy.</Text></Row>
              </Stack>
              <Divider />
              <Stack gap={3}>
                <Row gap={6} align="center"><Tag label="FP-Growth rules" tone="warning" /><Text size="small" tone="secondary">Mỗi tuần. Thêm rules mới, xóa rules cho item hết hàng.</Text></Row>
              </Stack>
              <Divider />
              <Stack gap={3}>
                <Row gap={6} align="center"><Tag label="Trending scores" tone="success" /><Text size="small" tone="secondary">Cron mỗi 15 phút. Không train model — chỉ recompute scores.</Text></Row>
              </Stack>
              <Divider />
              <Stack gap={3}>
                <Row gap={6} align="center"><Tag label="FAISS index" tone="neutral" /><Text size="small" tone="secondary">Sau mỗi lần retrain model. Load vào RAM không downtime (hot-swap).</Text></Row>
              </Stack>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Callout tone="success" title="Điểm cộng tối đa: A/B Testing Framework">
        Chia user thành 2 nhóm (hash user_id % 2): nhóm A dùng Mixer mặc định, nhóm B tăng weight cross-sell.
        So sánh CTR và conversion rate sau 1 tuần. Log kết quả ra DB.
        Đây là cách Shopee, Lazada, Amazon vận hành recommendation thực tế —
        đưa vào báo cáo sẽ gây ấn tượng mạnh với giám khảo kỹ thuật.
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
          <H1>Recommendation System — Tài liệu kỹ thuật</H1>
          <Text tone="secondary">
            Đủ để implement từ đầu đến cuối: dữ liệu → train → đánh giá → cross-sell → trending → tích hợp
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
          <Stat value="12"    label="Action types" />
          <Stat value="3"     label="Models so sánh" tone="info" />
          <Stat value="FAISS" label="Vector search" tone="info" />
          <Stat value="FP-G"  label="Cross-sell engine" tone="warning" />
          <Stat value="Mixer" label="Blending logic" tone="success" />
          <Stat value="A/B"   label="Online eval" tone="success" />
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
