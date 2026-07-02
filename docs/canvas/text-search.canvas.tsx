/**
 * Text Search — Tài liệu kỹ thuật đầy đủ
 * Tab 1: Tổng quan & Dữ liệu
 * Tab 2: Dense Retrieval — So sánh 3 model embedding
 * Tab 3: BM25 với Elasticsearch
 * Tab 4: Hybrid Search & Re-ranking
 * Tab 5: Đánh giá & Tích hợp
 */
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const TABS = [
  { id: "overview", label: "1. Tổng quan & Dữ liệu" },
  { id: "dense",    label: "2. Dense Retrieval" },
  { id: "bm25",     label: "3. BM25 / Elasticsearch" },
  { id: "hybrid",   label: "4. Hybrid Search" },
  { id: "eval",     label: "5. Đánh giá & Tích hợp" },
];

function Tag({ label, tone }: { label: string; tone?: "info"|"success"|"warning"|"neutral" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

// ─── TAB 1 ────────────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Text Search — Tìm sản phẩm bằng văn bản tiếng Việt</H2>
        <Text tone="secondary">
          Người dùng gõ câu tự nhiên như "áo khoác mùa đông cho trẻ em giá rẻ" →
          hệ thống hiểu ngữ nghĩa và trả về sản phẩm phù hợp dù không khớp từ khóa chính xác.
        </Text>
      </Stack>

      <H3>Tại sao cần Semantic Search thay vì LIKE query?</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">Vấn đề với LIKE</Pill>}>SQL LIKE '%áo khoác%'</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">Query "áo khoác mùa đông" sẽ bỏ qua:</Text>
              <Text tone="secondary" size="small">• "jacket mùa lạnh" (tiếng Anh)</Text>
              <Text tone="secondary" size="small">• "áo chống rét" (từ đồng nghĩa)</Text>
              <Text tone="secondary" size="small">• "windbreaker trẻ em" (khác ngôn ngữ)</Text>
              <Text tone="secondary" size="small">• "áo phao giữ ấm" (cùng ngữ nghĩa, khác từ)</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Giải pháp Semantic</Pill>}>Dense + Sparse Hybrid</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">Encode câu query thành vector → tìm sản phẩm gần nhất trong không gian ngữ nghĩa.</Text>
              <Text tone="secondary" size="small">• Hiểu đồng nghĩa: "jacket" = "áo khoác"</Text>
              <Text tone="secondary" size="small">• Hiểu ngữ cảnh: "trẻ em" → filter size nhỏ</Text>
              <Text tone="secondary" size="small">• BM25 bổ sung: đảm bảo từ khóa chính xác không bị bỏ qua</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Kiến trúc tổng thể — Hybrid Search</H3>
      <Table
        headers={["Tầng", "Thành phần", "Input", "Output", "Latency"]}
        striped
        rows={[
          ["1 — Sparse",  "BM25 (Elasticsearch)", "Query text tokenized", "Top-100 candidates by TF-IDF", "~20ms"],
          ["1 — Dense",   "Sentence Embedding model", "Query text", "Query vector 768-dim", "~50ms"],
          ["2 — Retrieve","FAISS IndexFlatIP", "Query vector", "Top-100 candidates by cosine", "~5ms"],
          ["3 — Fuse",    "Reciprocal Rank Fusion", "2 ranked lists", "1 merged ranked list", "~2ms"],
          ["4 — Re-rank", "Cross-encoder (optional)", "Top-20 pairs (query, item)", "Final ranked top-10", "~80ms"],
        ]}
        columnAlign={["left","left","left","left","center"]}
      />

      <H3>Dữ liệu cần chuẩn bị</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">Bắt buộc</Pill>}>Product corpus</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Text tone="secondary" size="small">Mỗi sản phẩm cần có đoạn text để index. Ghép lại thành 1 document:</Text>
              <Code>doc = f"{"{"}name{"}"} {"{"}category{"}"} {"{"}brand{"}"} {"{"}description{"}"} {"{"}attributes{"}"}"</Code>
              <Table
                framed={false} striped
                headers={["Trường", "Ví dụ", "Tầm quan trọng"]}
                rows={[
                  [<Code>name</Code>, "Áo khoác Uniqlo mùa đông nam", <Pill tone="warning" size="sm">Rất cao</Pill>],
                  [<Code>category</Code>, "Thời trang nam &gt; Áo khoác", <Pill tone="warning" size="sm">Cao</Pill>],
                  [<Code>brand</Code>, "Uniqlo", <Pill tone="info" size="sm">Trung bình</Pill>],
                  [<Code>description</Code>, "Áo giữ ấm, chống gió...", <Pill tone="info" size="sm">Trung bình</Pill>],
                  [<Code>attributes</Code>, "Màu: đen, Size: M-XXL", <Pill tone="neutral" size="sm">Thấp</Pill>],
                ]}
                columnAlign={["left","left","center"]}
              />
            </Stack>
          </CardBody>
        </Card>

        <Stack gap={12}>
          <Card>
            <CardHeader trailing={<Pill tone="info" size="sm">Để evaluate</Pill>}>Query-Product pairs</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text tone="secondary" size="small">
                  300–500 cặp (query → danh sách item_id liên quan). Có thể tạo từ:
                </Text>
                <Text tone="secondary" size="small">• Log tìm kiếm thực: query text → sản phẩm user đã click</Text>
                <Text tone="secondary" size="small">• Tạo thủ công: nhờ người viết 300 câu tìm kiếm tự nhiên</Text>
                <Text tone="secondary" size="small">• LLM generate: dùng Gemini/GPT tạo câu query đa dạng từ tên sản phẩm</Text>
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>Schema PostgreSQL</CardHeader>
            <CardBody>
              <Table
                framed={false} striped
                headers={["Bảng", "Cột quan trọng"]}
                rows={[
                  [<Code>products</Code>, "item_id, name, category, brand, description, search_vector (tsvector)"],
                  [<Code>search_logs</Code>, "query, clicked_item_id, user_id, timestamp"],
                  [<Code>product_embeddings</Code>, "item_id, embedding (vector) — nếu dùng pgvector"],
                ]}
                columnAlign={["left","left"]}
              />
            </CardBody>
          </Card>
        </Stack>
      </Grid>
    </Stack>
  );
}

// ─── TAB 2: DENSE RETRIEVAL ───────────────────────────────────────────────────

function DenseTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Dense Retrieval — So sánh 3 Sentence Embedding models</H2>
        <Text tone="secondary">
          Train / fine-tune cả 3, đánh giá bằng MRR@10 trên tập query-product, chọn model tốt nhất.
        </Text>
      </Stack>

      <Table
        headers={["Model", "Base", "Dim", "Tiếng Việt", "Ưu điểm", "Nhược", "Khuyến nghị"]}
        striped
        rows={[
          [
            <Text weight="bold">multilingual-e5-large</Text>,
            "XLM-RoBERTa-L", "1024", <Pill tone="success" size="sm">Rất tốt</Pill>,
            "SOTA multilingual retrieval. Tiếng Việt tốt nhất trong 3 model.",
            "Nặng 560MB, chậm hơn MiniLM 3x.",
            <Pill tone="success" size="sm">Khuyến nghị</Pill>,
          ],
          [
            <Text weight="bold">PhoBERT + SimCSE</Text>,
            "RoBERTa (Vi)", "768", <Pill tone="success" size="sm">Chuyên biệt</Pill>,
            "Train trên 20GB tiếng Việt. Hiểu ngữ pháp, slang tốt nhất.",
            "Chỉ tiếng Việt. Cần fine-tune thêm cho retrieval.",
            <Pill tone="info" size="sm">Tốt cho Vi-only</Pill>,
          ],
          [
            "paraphrase-MiniLM-L12",
            "MiniLM", "384", <Pill tone="info" size="sm">Chấp nhận được</Pill>,
            "Rất nhanh (~15ms), nhẹ 120MB. Tốt cho prototype.",
            "Chất lượng thấp hơn e5 đáng kể. Không tối ưu tiếng Việt.",
            <Pill tone="neutral" size="sm">Prototype / CPU</Pill>,
          ],
        ]}
        rowTone={["success", "info", undefined]}
        columnAlign={["left","left","center","center","left","left","left"]}
      />

      <H3>Sử dụng multilingual-e5-large (không fine-tune)</H3>
      <Card>
        <CardHeader trailing={<Pill tone="success" size="sm">Zero-shot — dùng ngay</Pill>}>Encode với instruction prefix</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              E5 yêu cầu thêm prefix instruction để tăng chất lượng:
            </Text>
            <Stack gap={4}>
              <Text weight="semibold" size="small">Khi encode query (câu tìm kiếm của user):</Text>
              <Code>query = "query: áo khoác mùa đông cho trẻ em"</Code>
              <Text weight="semibold" size="small">Khi encode document (mô tả sản phẩm):</Text>
              <Code>doc = "passage: Áo khoác Uniqlo mùa đông nam, giữ ấm, chống gió..."</Code>
            </Stack>
            <Text tone="secondary" size="small">
              Encode: <Code>model = SentenceTransformer("intfloat/multilingual-e5-large")</Code>.
              <Code>embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)</Code>.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>Fine-tune với MultipleNegativesRankingLoss</H3>
      <Card>
        <CardHeader>Từng bước fine-tune trên dữ liệu của dự án</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 1</Pill><Text weight="semibold">Chuẩn bị training pairs</Text></Row>
              <Text tone="secondary" size="small">
                Cần cặp (query, positive_doc). Từ search_logs: query text → sản phẩm user đã click (positive).
                Hoặc dùng LLM generate queries cho mỗi sản phẩm: "Hãy viết 5 câu tìm kiếm tự nhiên cho sản phẩm này".
                300–1.000 cặp là đủ để thấy cải thiện rõ rệt.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 2</Pill><Text weight="semibold">Setup training với sentence-transformers</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from sentence_transformers import SentenceTransformer, losses, InputExample</Code>.
                Model: <Code>SentenceTransformer("intfloat/multilingual-e5-large")</Code>.
                Loss: <Code>losses.MultipleNegativesRankingLoss(model)</Code> — không cần negative samples, dùng in-batch negatives tự động.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 3</Pill><Text weight="semibold">Hyperparameters</Text></Row>
              <Table
                framed={false} striped
                headers={["Param", "Giá trị"]}
                rows={[
                  [<Code>batch_size</Code>,   "16–32 (lớn hơn = nhiều in-batch negatives hơn)"],
                  [<Code>epochs</Code>,        "3–5"],
                  [<Code>lr</Code>,            "2e-5"],
                  [<Code>warmup_steps</Code>,  "10% tổng steps"],
                  [<Code>evaluation_steps</Code>, "Đánh giá mỗi 100 steps trên val set"],
                ]}
                columnAlign={["left","left"]}
              />
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 4</Pill><Text weight="semibold">Encode lại toàn bộ catalog</Text></Row>
              <Text tone="secondary" size="small">
                Sau fine-tune, re-encode toàn bộ product documents → rebuild FAISS index.
                So sánh MRR@10 trước/sau fine-tune để chứng minh cải thiện trong báo cáo.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Fine-tune PhoBERT với SimCSE</H3>
      <Card>
        <CardHeader>SimCSE — Contrastive learning cho Vietnamese</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Text tone="secondary" size="small">
              SimCSE (Supervised) dùng NLI pairs để học sentence similarity. Cho PhoBERT khả năng tạo embedding phù hợp cho retrieval.
            </Text>
            <Grid columns={2} gap={12}>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Unsupervised SimCSE (không cần label)</Text>
                <Text tone="secondary" size="small">
                  Encode mỗi câu 2 lần với dropout khác nhau → 2 embeddings của cùng câu = positive pair. In-batch sentences = negative. Không cần dữ liệu label!
                </Text>
                <Text tone="secondary" size="small">
                  <Code>from simcse import SimCSE</Code>. Train trên corpus mô tả sản phẩm.
                </Text>
              </Stack>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Supervised SimCSE (có label)</Text>
                <Text tone="secondary" size="small">
                  Cần triplet (query, positive_product, hard_negative_product). Hard negative = sản phẩm cùng category nhưng không đúng.
                  Cải thiện tốt hơn unsupervised 5–10% MRR.
                </Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="success" title="Điểm cộng: So sánh pretrained vs fine-tuned">
        Trong báo cáo: vẽ bảng so sánh MRR@10 của (1) pretrained e5-large zero-shot,
        (2) e5-large fine-tuned, (3) PhoBERT fine-tuned.
        Chứng minh fine-tuning cải thiện hiệu suất trên domain e-commerce tiếng Việt.
      </Callout>
    </Stack>
  );
}

// ─── TAB 3: BM25 / ELASTICSEARCH ─────────────────────────────────────────────

function BM25Tab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>BM25 với Elasticsearch — Sparse Retrieval</H2>
        <Text tone="secondary">
          BM25 là thuật toán keyword matching thông minh — tốt hơn TF-IDF.
          Cần thiết vì Dense Retrieval đôi khi bỏ qua exact keyword match (tên thương hiệu, mã sản phẩm).
        </Text>
      </Stack>

      <H3>Tại sao vẫn cần BM25 dù đã có Dense?</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>Dense tốt hơn khi</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text tone="secondary" size="small">• Query dài, mô tả: "áo giữ ấm cho bé gái 5 tuổi đi học"</Text>
              <Text tone="secondary" size="small">• Query có từ đồng nghĩa: "jacket" = "áo khoác"</Text>
              <Text tone="secondary" size="small">• Query tìm kiếm theo usecase: "quà tặng sinh nhật cho bạn gái"</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>BM25 tốt hơn khi</CardHeader>
          <CardBody>
            <Stack gap={4}>
              <Text tone="secondary" size="small">• Query chứa brand: "iPhone 15 Pro Max 256GB"</Text>
              <Text tone="secondary" size="small">• Query mã sản phẩm: "NMD_R1 FW9426"</Text>
              <Text tone="secondary" size="small">• Query số cụ thể: "áo size XL màu đen"</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Setup Elasticsearch</H3>
      <Card>
        <CardHeader>Index mapping cho sản phẩm tiếng Việt</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Bước 1 — Cài Elasticsearch + plugin phân tích tiếng Việt</Text>
              <Text tone="secondary" size="small">
                Docker: <Code>docker run -d -p 9200:9200 elasticsearch:8.x</Code>.
                Cài plugin: <Code>elasticsearch-plugin install analysis-icu</Code> để xử lý Unicode tốt hơn.
                Hoặc dùng Elasticsearch Service trên cloud (free tier 14 ngày).
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 2 — Tạo index với custom analyzer</Text>
              <Text tone="secondary" size="small">
                Tạo <Code>vi_analyzer</Code> với tokenizer <Code>icu_tokenizer</Code> + lowercase filter + Vietnamese stop words.
                Field <Code>name</Code> boost=3, <Code>category</Code> boost=2, <Code>description</Code> boost=1.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 3 — Index toàn bộ sản phẩm</Text>
              <Text tone="secondary" size="small">
                Dùng <Code>elasticsearch-py</Code> bulk API. Mỗi document: id=item_id, fields: name, category, brand, description, price, stock.
                Batch 500 documents mỗi lần bulk insert.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 4 — Query với BM25</Text>
              <Text tone="secondary" size="small">
                Multi-match query trên các fields với boost khác nhau.
                Thêm <Code>fuzziness: "AUTO"</Code> để tolerate typo.
                Filter theo stock &gt; 0, price range nếu user chỉ định.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Xử lý tiếng Việt đặc thù</H3>
      <Table
        headers={["Vấn đề", "Giải pháp", "Công cụ"]}
        striped
        rows={[
          ["Từ ghép tiếng Việt: 'áo khoác' vs 'áo' + 'khoác'", "Dùng underthesea tokenizer trước khi index", <Code>underthesea.word_tokenize()</Code>],
          ["Không dấu: 'ao khoac' → 'áo khoác'", "Thêm query expansion với bỏ dấu", "Preprocess cả query lẫn document"],
          ["Viết tắt: 'đt' = 'điện thoại'", "Từ điển mở rộng: map viết tắt → từ đầy đủ", "Custom dict trong analyzer"],
          ["Lỗi chính tả: 'aó khoắc'", "fuzziness AUTO trong query", "Elasticsearch built-in"],
          ["Số và đơn vị: '100k', '1tr'", "Chuẩn hóa trước: '100.000', '1.000.000'", "Regex normalizer"],
        ]}
        columnAlign={["left","left","left"]}
      />

      <Callout tone="info" title="Thay thế nhẹ hơn Elasticsearch: BM25 với rank_bm25">
        Nếu không muốn setup Elasticsearch: dùng <Code>rank_bm25</Code> Python library.
        Fit trên corpus sản phẩm → query → top-K doc indices. Đủ tốt cho demo với catalog &lt; 10k sản phẩm.
        Không cần Docker, không cần server riêng.
      </Callout>
    </Stack>
  );
}

// ─── TAB 4: HYBRID SEARCH ─────────────────────────────────────────────────────

function HybridTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Hybrid Search — Kết hợp BM25 + Dense + Re-ranking</H2>
        <Text tone="secondary">
          Hybrid thường tốt hơn mỗi phương pháp riêng lẻ 10–20% MRR.
          Reciprocal Rank Fusion (RRF) là cách fuse đơn giản nhất và hiệu quả.
        </Text>
      </Stack>

      <H3>Reciprocal Rank Fusion (RRF)</H3>
      <Card>
        <CardHeader>Công thức và implement</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Công thức RRF:</Text>
              <Code>rrf_score(d) = Σ 1 / (k + rank_i(d))</Code>
              <Text tone="secondary" size="small">
                k = 60 (hằng số, thường dùng mặc định). rank_i(d) = thứ hạng của document d trong kết quả từ nguồn i.
                Item ở rank 1 trong cả 2 nguồn sẽ có RRF score cao nhất.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Ví dụ:</Text>
              <Table
                framed={false} striped
                headers={["Item", "BM25 rank", "Dense rank", "RRF score", "Final rank"]}
                rows={[
                  ["iPhone 15 case", "1",  "3",  "1/(60+1) + 1/(60+3) = 0.0320", "1"],
                  ["Ốp lưng MagSafe","3",  "1",  "1/(60+3) + 1/(60+1) = 0.0320", "2"],
                  ["Điện thoại Samsung","2","10", "1/(60+2) + 1/(60+10) = 0.0302","3"],
                ]}
                columnAlign={["left","center","center","left","center"]}
              />
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Code implement (Python &lt; 20 dòng):</Text>
              <Text tone="secondary" size="small">
                1. <Code>bm25_results = es.search(query, size=100)</Code> → list of (item_id, bm25_score).
              </Text>
              <Text tone="secondary" size="small">
                2. <Code>dense_results = faiss_search(query_vec, k=100)</Code> → list of (item_id, cosine_score).
              </Text>
              <Text tone="secondary" size="small">
                3. Build rank maps: <Code>bm25_rank = {"{"} id: i for i, id in enumerate(bm25_ids) {"}"}</Code>.
              </Text>
              <Text tone="secondary" size="small">
                4. Compute RRF: <Code>for id in all_ids: score = 1/(k+bm25_rank.get(id,100)) + 1/(k+dense_rank.get(id,100))</Code>.
              </Text>
              <Text tone="secondary" size="small">
                5. Sort by RRF score giảm dần, lấy top-20.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Re-ranking với Cross-encoder (tùy chọn nâng cao)</H3>
      <Card>
        <CardHeader trailing={<Pill tone="warning" size="sm">Nâng cao</Pill>}>Re-rank top-20 sau RRF</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Text tone="secondary" size="small">
              Cross-encoder nhận cặp (query, document) → score relevance. Chính xác hơn bi-encoder nhưng chậm hơn (O(N) vs O(1)).
              Chỉ dùng cho top-20 sau bước RRF, không chạy trên toàn catalog.
            </Text>
            <Grid columns={2} gap={12}>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Model khuyến nghị</Text>
                <Text tone="secondary" size="small"><Code>cross-encoder/ms-marco-MiniLM-L-6-v2</Code></Text>
                <Text tone="secondary" size="small">Nhẹ (66MB), latency ~80ms cho 20 pairs.</Text>
                <Text tone="secondary" size="small">Hoặc dùng <Code>cross-encoder/mmarco-mMiniLMv2-L12-H384-v1</Code> (multilingual, hỗ trợ tiếng Việt).</Text>
              </Stack>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Trade-off</Text>
                <Text tone="secondary" size="small">Tổng latency tăng thêm ~80ms (từ ~100ms lên ~180ms). Cải thiện MRR@10 ~3–5%. Chỉ bật nếu latency &lt; 300ms vẫn đạt được.</Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <H3>Query Understanding — Xử lý trước khi search</H3>
      <Table
        headers={["Tính năng", "Mô tả", "Implement"]}
        striped
        rows={[
          ["Query normalization", "Lowercase, bỏ dấu phẩy/chấm, normalize số (1tr → 1000000)", "Python regex + unicodedata"],
          ["Spell correction", "Sửa lỗi chính tả: 'aó khoắc' → 'áo khoác'", "SymSpell hoặc Elasticsearch fuzzy"],
          ["Intent detection", "Phân loại query: tìm sản phẩm / hỏi giá / tìm brand", "Zero-shot LLM hoặc classifier đơn giản"],
          ["Price extraction", "Trích xuất khoảng giá: 'dưới 500k', '200-500 nghìn'", "Regex + unit normalization"],
          ["Attribute extraction", "Màu sắc, size, material từ query text", "NER hoặc regex từ điển"],
        ]}
        columnAlign={["left","left","left"]}
      />

      <Callout tone="success" title="Điểm cộng: AutoComplete với Trie">
        Implement gợi ý search khi user đang gõ: dùng Trie structure index từ toàn bộ tên sản phẩm + query phổ biến.
        Gợi ý hiện ngay sau 2 ký tự, latency &lt; 5ms. Cải thiện UX rõ rệt và dễ implement (Elasticsearch có built-in completion suggester).
      </Callout>
    </Stack>
  );
}

// ─── TAB 5: ĐÁNH GIÁ & TÍCH HỢP ─────────────────────────────────────────────

function EvalTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Đánh giá & Tích hợp</H2>
        <Text tone="secondary">
          Đánh giá chất lượng search bằng offline metrics trên tập query-product pairs,
          sau đó tích hợp vào hệ thống thực tế.
        </Text>
      </Stack>

      <H3>Offline metrics</H3>
      <Table
        headers={["Metric", "Ý nghĩa", "Ngưỡng tốt", "Ưu tiên"]}
        striped
        rows={[
          [<Text weight="bold">MRR@10</Text>, "Sản phẩm đúng có ở vị trí nào trong top-10? Càng cao rank → MRR càng cao.", "MRR &gt; 0.70", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          [<Text weight="bold">NDCG@10</Text>, "Giống MRR nhưng tính tất cả relevant items, không chỉ item đầu tiên.", "NDCG &gt; 0.75", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          ["Recall@20", "Tỷ lệ sản phẩm liên quan xuất hiện trong top-20.", "R@20 &gt; 0.85", <Pill tone="info" size="sm">Thêm điểm</Pill>],
          ["Latency P95", "95th percentile response time.", "&lt; 200ms", <Pill tone="neutral" size="sm">Non-functional</Pill>],
        ]}
        columnAlign={["left","left","center","center"]}
      />

      <H3>Benchmark so sánh các phương pháp</H3>
      <Table
        headers={["Phương pháp", "MRR@10", "NDCG@10", "Recall@20", "Latency", "Kết luận"]}
        striped
        rows={[
          ["BM25 only", "0.51", "0.56", "0.71", "~20ms", <Pill tone="neutral" size="sm">Baseline</Pill>],
          ["Dense only (e5-large pretrained)", "0.67", "0.72", "0.82", "~70ms", <Pill tone="info" size="sm">Tốt hơn BM25</Pill>],
          ["Dense only (e5-large fine-tuned)", "0.74", "0.79", "0.88", "~70ms", <Pill tone="info" size="sm">Rõ cải thiện</Pill>],
          [<Text weight="bold">Hybrid RRF (BM25 + Dense ft)</Text>, "0.81", "0.85", "0.93", "~90ms", <Pill tone="success" size="sm">Best</Pill>],
          ["Hybrid + Cross-encoder", "0.84", "0.88", "0.93", "~170ms", <Pill tone="success" size="sm">Best + nâng cao</Pill>],
        ]}
        rowTone={[undefined, undefined, undefined, "success", "success"]}
        columnAlign={["left","center","center","center","center","left"]}
      />
      <Text tone="tertiary" size="small">Benchmark tham khảo. Kết quả thực tế phụ thuộc vào chất lượng dữ liệu và tập đánh giá.</Text>

      <H3>API Endpoints</H3>
      <Table
        headers={["Endpoint", "Method", "Input", "Output", "Latency"]}
        striped
        rows={[
          [<Code>/search</Code>, <Pill tone="info" size="sm">GET</Pill>, <Code>q=áo khoác&top_k=10&min_price=0&max_price=500000</Code>, <Code>{"{ items, total, query_understood }"}</Code>, "&lt; 200ms"],
          [<Code>/search/suggest</Code>, <Pill tone="info" size="sm">GET</Pill>, <Code>q=áo kho (prefix)</Code>, "5 gợi ý autocomplete", "&lt; 10ms"],
          [<Code>/search/similar/{"{item_id}"}</Code>, <Pill tone="info" size="sm">GET</Pill>, "item_id", "Sản phẩm tương tự (text similarity)", "&lt; 50ms"],
        ]}
        columnAlign={["left","center","left","left","center"]}
      />

      <H3>Response format</H3>
      <Card>
        <CardHeader>GET /search?q=áo khoác mùa đông — response mẫu</CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Code>{"{ "}</Code>
            <Code>{"  query_understood: { intent: 'product_search', attributes: {season: 'winter', type: 'jacket'} },"}</Code>
            <Code>{"  total: 156,"}</Code>
            <Code>{"  items: ["}</Code>
            <Code>{"    { id: 'item_001', name: 'Áo khoác Uniqlo...', price: 890000, score: 0.92, match_reason: 'bm25+dense' },"}</Code>
            <Code>{"    ..."}</Code>
            <Code>{"  ]"}</Code>
            <Code>{"}"}</Code>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

export default function TextSearch() {
  const theme = useHostTheme();
  const [activeTab, setActiveTab] = useCanvasState("tsTab", "overview");
  return (
    <Stack gap={0} style={{ minHeight: "100vh", background: theme.bg.editor }}>
      <Stack gap={16} style={{ padding: "24px 32px 0 32px" }}>
        <Stack gap={4}>
          <H1>Text Search — Tìm sản phẩm bằng văn bản</H1>
          <Text tone="secondary">BM25 + Dense Retrieval (multilingual-e5) → Hybrid RRF → Re-ranking</Text>
        </Stack>
        <Row gap={8} wrap>
          {TABS.map(t => <Pill key={t.id} active={t.id === activeTab} onClick={() => setActiveTab(t.id)}>{t.label}</Pill>)}
        </Row>
        <Grid columns={5} gap={8}>
          <Stat value="Hybrid" label="Kiến trúc" tone="info" />
          <Stat value="e5-large" label="Best model" tone="success" />
          <Stat value="RRF" label="Fusion method" tone="info" />
          <Stat value="MRR>0.80" label="Target" tone="success" />
          <Stat value="&lt;200ms" label="Latency" />
        </Grid>
        <Divider />
      </Stack>
      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "dense"    && <DenseTab />}
        {activeTab === "bm25"     && <BM25Tab />}
        {activeTab === "hybrid"   && <HybridTab />}
        {activeTab === "eval"     && <EvalTab />}
      </Stack>
    </Stack>
  );
}
