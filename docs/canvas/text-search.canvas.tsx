/**
 * Text Search — Tài liệu kỹ thuật đầy đủ (đã căn chỉnh theo codebase AuraTech thật)
 * Tab 1: Tổng quan & Dữ liệu
 * Tab 2: Dense Retrieval — So sánh 3 model embedding (winner = multilingual-e5-large, 1024-dim)
 * Tab 3: BM25 với Elasticsearch (index `products` đã tồn tại, dùng chung với product-service)
 * Tab 4: Hybrid Search & Re-ranking (RRF k=60)
 * Tab 5: Đánh giá
 * Tab 6: Tích hợp thực tế trong dự án (search-service :8001)
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
  { id: "eval",     label: "5. Đánh giá" },
  { id: "integ",    label: "6. Tích hợp thực tế" },
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
          ["1 — Sparse",  "BM25 (Elasticsearch, index `products`)", "Query text tokenized", "Top-100 candidates theo BM25", "~20ms"],
          ["1 — Dense",   "multilingual-e5-large (1024-dim)", "Query text (prefix 'query: ')", "Query vector 1024-dim (L2-normalized)", "~50ms"],
          ["2 — Retrieve","Elasticsearch kNN (dense_vector) / FAISS", "Query vector 1024-dim", "Top-100 candidates theo cosine", "~5–10ms"],
          ["3 — Fuse",    "Reciprocal Rank Fusion (k=60)", "2 ranked lists", "1 merged ranked list", "~2ms"],
          ["4 — Re-rank", "Cross-encoder (tùy chọn)", "Top-20 pairs (query, item)", "Final ranked top-10", "~80ms"],
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
            <CardHeader trailing={<Pill tone="neutral" size="sm">Đã tồn tại</Pill>}>Nguồn dữ liệu thật trong dự án</CardHeader>
            <CardBody>
              <Table
                framed={false} striped
                headers={["Kho dữ liệu", "Vai trò trong text search"]}
                rows={[
                  [<Code>MariaDB · products</Code>, "Nguồn chân lý (Product.java): id Long, name, description, price, brand, categoryId, imageUrl (URL MinIO)"],
                  [<Code>Elasticsearch · products</Code>, "ProductDocument: keyword/full-text (name, description, brand...). CHƯA có field dense_vector"],
                  [<Code>MongoDB · product_similarities</Code>, "productId → danh sách sản phẩm tương tự (ghi bởi job AI, không bắt buộc cho text search)"],
                ]}
                columnAlign={["left","left"]}
              />
              <Text tone="tertiary" size="small">
                Chưa có bảng <Code>search_logs</Code>/clickstream trong dự án — nếu cần cặp query→click để fine-tune thì phải bổ sung pipeline log (đánh dấu rõ "cần thêm").
              </Text>
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
            "~560M tham số (~1.1GB fp16 / 2.2GB fp32), chậm hơn MiniLM ~3x.",
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

      <Callout tone="info" title="Model đang được wire trong code">
        <Code>search-service</Code> đã cấu hình <Code>TEXT_MODEL_NAME = "intfloat/multilingual-e5-large"</Code>
        (trong <Code>app/core/config.py</Code>, override được qua biến môi trường) và load bằng
        <Code>SentenceTransformer(...)</Code> ở <Code>text_search.py</Code>. Do đó "winner" của phần so sánh
        trùng đúng với model thực tế trong hệ thống.
      </Callout>

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

      <Callout tone="success" title="Elasticsearch đã có sẵn trong dự án — tái sử dụng, không dựng mới">
        Hệ thống AuraTech đã deploy Elasticsearch (host <Code>infra-elasticsearch</Code>) với index
        <Code>products</Code> (<Code>ProductDocument</Code>, <Code>@Document(indexName="products")</Code>) do
        product-service quản lý và index theo sự kiện (<Code>indexProduct(Long)</Code>). Đây chính là backend cho
        keyword search hiện có: <Code>GET /api/v1/public/products/search?q=</Code> (fallback về MariaDB).
        Vì vậy phần BM25 của hybrid search KHÔNG dựng cụm ES mới — nó truy vấn lại đúng index
        <Code>products</Code> này. Lưu ý: <Code>ProductDocument</Code> hiện chỉ có field keyword/text
        (name, description, brand, categoryId, price...), <Text as="span" weight="bold">CHƯA có field <Code>dense_vector</Code></Text>.
      </Callout>

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

      <H3>Cách dùng ES trong dự án (không dựng mới)</H3>
      <Card>
        <CardHeader>Truy vấn lại index `products` đã tồn tại</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Bước 1 — Kết nối ES đã deploy</Text>
              <Text tone="secondary" size="small">
                search-service dùng <Code>elasticsearch-py</Code> (đã có trong requirements) trỏ tới
                <Code>ELASTICSEARCH_HOST=infra-elasticsearch</Code>. Index name lấy từ config
                <Code>ES_INDEX_NAME=products</Code>. Không cần bulk-index lại: product-service đã ghi dữ liệu.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 2 — Multi-match BM25 trên các field có sẵn</Text>
              <Text tone="secondary" size="small">
                Query trên <Code>name</Code> (boost 3), <Code>brand</Code> (boost 2), <Code>description</Code> (boost 1).
                Thêm <Code>fuzziness: "AUTO"</Code> để chịu lỗi gõ. Filter <Code>active=true</Code>,
                <Code>status=PUBLISHED</Code>, và khoảng giá qua <Code>effectivePrice</Code> nếu user chỉ định.
                (Tồn kho KHÔNG nằm trên Product — thuộc inventory-service, nên không filter stock ở đây.)
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Bước 3 — Phân tích tiếng Việt (nâng cấp mapping, tùy chọn)</Text>
              <Text tone="secondary" size="small">
                Nếu cần chất lượng tiếng Việt cao hơn: thêm <Code>analysis-icu</Code> + custom analyzer
                (icu_tokenizer + lowercase + stop words) cho field <Code>name/description</Code>. Đây là thay đổi
                mapping phía product-service — cần phối hợp, không tự đổi từ AI.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Phần Dense/vector đặt ở đâu? (quyết định kiến trúc)</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Khuyến nghị</Pill>}>Phương án A — thêm `dense_vector` vào ES `products`</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">
                Bổ sung field <Code>dense_vector</Code> (dims=1024, similarity=cosine) vào mapping index
                <Code>products</Code>; search-service tính embedding e5-large rồi update từng doc.
              </Text>
              <Text tone="secondary" size="small">• Tận dụng ES 8.x kNN + BM25 ngay trong một cụm đã deploy.</Text>
              <Text tone="secondary" size="small">• KHÔNG thêm dependency mới (không cần faiss).</Text>
              <Text tone="secondary" size="small">• Đánh đổi: phải phối hợp với product-service vì index do BE sở hữu.</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Thay thế</Pill>}>Phương án B — FAISS riêng trong search-service</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">
                Giữ vector trong FAISS <Code>IndexFlatIP</Code> nội bộ search-service; BM25 vẫn từ ES.
                Fuse 2 danh sách bằng RRF trong Python — đúng như <Code>hybrid_search.py</Code> đang phác thảo.
              </Text>
              <Text tone="secondary" size="small">• Không đụng index của BE, AI tự chủ hoàn toàn.</Text>
              <Text tone="secondary" size="small">• Đánh đổi: thêm <Code>faiss</Code> vào requirements + tự đồng bộ khi catalog đổi.</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>
      <Text tone="tertiary" size="small">
        Chốt: ưu tiên Phương án A vì ES đã sẵn sàng và ES 8.x làm được hybrid kNN+BM25 trong một truy vấn.
        Nếu chưa muốn sửa mapping do BE quản lý, dùng Phương án B như bước trung gian (khớp code scaffold hiện tại).
      </Text>

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

      <Callout tone="info" title="rank_bm25 chỉ là fallback nhẹ — ES mới là đường chính">
        <Code>rank_bm25</Code> (Python) fit trên corpus sản phẩm → query → top-K doc indices, đủ cho demo
        offline với catalog &lt; 10k sản phẩm và không cần server. Tuy nhiên trong AuraTech, Elasticsearch
        <Code>products</Code> ĐÃ deploy nên đường chính (production) là truy vấn ES, không dùng rank_bm25.
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
                k = 60 (hằng số mặc định). rank_i(d) = thứ hạng của document d trong kết quả từ nguồn i.
                Item ở rank 1 trong cả 2 nguồn sẽ có RRF score cao nhất.
                Đây đúng là thuật toán trong <Code>hybrid_search.py</Code>: <Code>reciprocal_rank_fusion(..., k=60)</Code>,
                dùng <Code>1/(k+rank+1)</Code> (rank 0-based) và gán <Code>match_reason = "bm25+dense"</Code>.
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

      <H3>API Endpoints (khớp code thật)</H3>
      <Table
        headers={["Endpoint", "Method", "Input", "Output", "Trạng thái"]}
        striped
        rows={[
          [<Code>/api/v1/search</Code>, <Pill tone="info" size="sm">GET</Pill>, <Code>q, top_k=10, min_price?, max_price?</Code>, <Code>SearchResponse</Code>, <Pill tone="warning" size="sm">Scaffold (mock)</Pill>],
          [<Code>/api/v1/search/suggest</Code>, <Pill tone="info" size="sm">GET</Pill>, <Code>q (prefix)</Code>, <Code>SuggestResponse (suggestions[])</Code>, <Pill tone="warning" size="sm">Scaffold (mock)</Pill>],
          [<Code>/api/v1/public/products/search</Code>, <Pill tone="info" size="sm">GET</Pill>, <Code>q, page, size</Code>, "Keyword search (product-service, ES→MariaDB)", <Pill tone="success" size="sm">Đang chạy</Pill>],
        ]}
        rowTone={["neutral","neutral","success"]}
        columnAlign={["left","center","left","left","center"]}
      />
      <Text tone="tertiary" size="small">
        FE hiện gọi endpoint keyword của product-service; endpoint hybrid ngữ nghĩa <Code>/api/v1/search</Code>
        của search-service là đích migration (keyword → hybrid). Chi tiết ở tab "Tích hợp thực tế".
      </Text>

      <H3>Response format — SearchResponse (search-service)</H3>
      <Card>
        <CardHeader>GET /api/v1/search?q=áo khoác mùa đông — response mẫu</CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Code>{"{ "}</Code>
            <Code>{"  query_understood: { intent: 'product_search', extracted_attributes: { keywords: ['áo','khoác','mùa','đông'] } },"}</Code>
            <Code>{"  total: 10,"}</Code>
            <Code>{"  items: ["}</Code>
            <Code>{"    { id: 1024, name: 'Áo khoác Uniqlo mùa đông nam', price: 890000, score: 0.0320, match_reason: 'bm25+dense' },"}</Code>
            <Code>{"    ..."}</Code>
            <Code>{"  ]"}</Code>
            <Code>{"}"}</Code>
            <Text tone="tertiary" size="small">
              Field khớp <Code>SearchItem</Code>: id (Long), name, price, score, match_reason. <Code>query_understood</Code>
              hiện chỉ tách keywords; trích intent/giá/thuộc tính (tab Hybrid) là phần cần bổ sung. Ảnh sản phẩm khi
              hiển thị lấy từ <Code>imageUrl</Code> (URL MinIO tuyệt đối), ví dụ
              <Code>http://localhost:9000/product-images/products/&lt;uuid&gt;.jpg</Code>.
            </Text>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 6: TÍCH HỢP THỰC TẾ ─────────────────────────────────────────────────

function IntegrationTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Tích hợp thực tế trong dự án AuraTech</H2>
        <Text tone="secondary">
          Text search sống trong <Code>search-service</Code> (FastAPI). Phần dưới mô tả đúng cổng, đường gateway,
          kho dữ liệu, cách xác thực và các component FE tiêu thụ nó.
        </Text>
      </Stack>

      <Callout tone="warning" title="Trạng thái hiện tại: SCAFFOLD (trả mock)">
        <Code>text_search.py</Code> load e5-large nhưng <Code>search_semantic()</Code> trả kết quả giả;
        <Code>hybrid_search.py</Code> fuse BM25 giả + Dense giả bằng RRF (k=60); <Code>/search/suggest</Code> trả gợi ý cứng.
        Tài liệu này là KẾ HOẠCH triển khai thật (ES query + dense retrieval) trên nền scaffold đó.
        requirements đã có <Code>elasticsearch</Code>, <Code>sentence-transformers</Code>; phần <Code>faiss</Code>
        (nếu chọn Phương án B) chưa được thêm.
      </Callout>

      <H3>Thông số dịch vụ</H3>
      <Table
        headers={["Hạng mục", "Giá trị thật"]}
        striped
        rows={[
          ["Service / Port", <Code>search-service</Code>],
          ["Cổng", "8001 (container ai-search-service)"],
          ["Gateway path", <Code>/api/v1/search/**</Code> (+ <Code>/api/v1/public/search/**</Code>)],
          ["Router prefix (code)", <Code>API_V1_STR = "/api/v1"</Code>],
          ["Model text (env)", <Code>TEXT_MODEL_NAME = intfloat/multilingual-e5-large</Code>],
          ["Xác thực", <Text as="span" size="small">JWT verify TẠI gateway; service đọc header <Code>X-User-Id</Code> (UUID Keycloak) để cá nhân hóa / log</Text>],
        ]}
        columnAlign={["left","left"]}
      />

      <H3>Kho dữ liệu sử dụng</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Retrieval</Pill>}>Elasticsearch</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">
              Host <Code>infra-elasticsearch</Code>, index <Code>products</Code>. BM25 (keyword) + kNN
              (<Code>dense_vector</Code> nếu chọn Phương án A). Chia sẻ với keyword search của product-service.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Cache</Pill>}>Redis</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">
              Host <Code>infra-redis</Code>. Cache kết quả query nóng + autocomplete, giảm latency P95.
              Lấy client qua <Code>shared_common.get_redis_client()</Code>.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="neutral" size="sm">Metadata</Pill>}>MariaDB / MongoDB</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">
              MariaDB <Code>products</Code> là nguồn chân lý (id Long, price, imageUrl MinIO...).
              MongoDB <Code>product_similarities</Code> cho "sản phẩm tương tự". Truy cập qua
              <Code>get_mysql_connection()</Code> / <Code>get_mongo_client()</Code>.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="neutral" size="sm">Ảnh</Pill>}>MinIO</CardHeader>
          <CardBody>
            <Text tone="secondary" size="small">
              Bucket <Code>product-images</Code> (public-read). URL tuyệt đối lưu sẵn trong <Code>imageUrl</Code>:
              <Code>http://localhost:9000/product-images/products/&lt;uuid&gt;.jpg</Code>.
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <H3>Consumer phía Front-end</H3>
      <Table
        headers={["Thành phần FE", "Vai trò", "Endpoint gọi"]}
        striped
        rows={[
          [<Code>common/Header.jsx</Code>, "Thanh tìm kiếm (form + nút camera) → điều hướng /search", <Code>GET /public/products/search?q=&amp;page=&amp;size=</Code>],
          [<Code>catalog/pages/SearchPage.jsx</Code>, "Trang kết quả (route /search)", <Code>GET /public/products/search</Code> → (migrate) <Code>/api/v1/search</Code>],
          ["Autocomplete gợi ý", "Gợi ý khi đang gõ", <Code>GET /api/v1/search/suggest?q=</Code>],
        ]}
        columnAlign={["left","left","left"]}
      />

      <H3>Lộ trình migration: keyword → hybrid</H3>
      <Card>
        <CardHeader>3 giai đoạn, không phá vỡ trải nghiệm hiện tại</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">GĐ 1</Pill><Text weight="semibold">Hiện trạng</Text></Row>
              <Text tone="secondary" size="small">
                FE dùng <Code>GET /api/v1/public/products/search</Code> (product-service, ES keyword + fallback MariaDB).
                Đủ tốt cho khớp từ khóa, chưa hiểu ngữ nghĩa.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="info" size="sm">GĐ 2</Pill><Text weight="semibold">Bật hybrid ở search-service</Text></Row>
              <Text tone="secondary" size="small">
                Thay mock trong <Code>search_semantic()</Code> bằng ES kNN/FAISS thật, BM25 thật; giữ nguyên
                <Code>SearchResponse</Code>. <Code>SearchPage.jsx</Code> chuyển sang gọi <Code>/api/v1/search</Code>
                (map <Code>items[].id</Code> Long, hiển thị <Code>imageUrl</Code> MinIO). Có thể A/B hai đường.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="success" size="sm">GĐ 3</Pill><Text weight="semibold">Cá nhân hóa + gợi ý</Text></Row>
              <Text tone="secondary" size="small">
                Dùng <Code>X-User-Id</Code> để log query và re-rank nhẹ theo lịch sử; wire autocomplete vào
                <Code>/api/v1/search/suggest</Code>; bổ sung query understanding (intent, khoảng giá, thuộc tính).
              </Text>
            </Stack>
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
        {activeTab === "integ"    && <IntegrationTab />}
      </Stack>
    </Stack>
  );
}
