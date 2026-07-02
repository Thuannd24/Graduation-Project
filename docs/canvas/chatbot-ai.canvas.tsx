/**
 * Chatbot AI — Tài liệu kỹ thuật đầy đủ
 * Tab 1: Kiến trúc RAG & Tổng quan
 * Tab 2: Knowledge Base & Retrieval
 * Tab 3: Intent Classification
 * Tab 4: Sentiment Analysis — So sánh 3 model
 * Tab 5: LLM Generation & Tích hợp hệ thống
 */
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const TABS = [
  { id: "rag",       label: "1. Kiến trúc RAG" },
  { id: "kb",        label: "2. Knowledge Base" },
  { id: "intent",    label: "3. Intent Classification" },
  { id: "sentiment", label: "4. Sentiment Analysis" },
  { id: "llm",       label: "5. LLM & Tích hợp" },
];

function Tag({ label, tone }: { label: string; tone?: "info"|"success"|"warning"|"neutral" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

// ─── TAB 1: KIẾN TRÚC RAG ────────────────────────────────────────────────────

function RagTab() {
  const theme = useHostTheme();
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Kiến trúc RAG — Retrieval-Augmented Generation</H2>
        <Text tone="secondary">
          RAG = LLM không trả lời từ trí nhớ tĩnh mà tìm kiếm thông tin liên quan từ knowledge base
          của dự án trước, rồi mới sinh câu trả lời. Đảm bảo câu trả lời chính xác, luôn cập nhật.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="RAG" label="Kiến trúc" tone="info" />
        <Stat value="5" label="Loại intent" tone="warning" />
        <Stat value="PhoBERT" label="Best sentiment" tone="success" />
        <Stat value="Gemini" label="LLM provider" tone="success" />
      </Grid>

      <H3>Tại sao dùng RAG thay vì fine-tune LLM?</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">Không dùng</Pill>}>Fine-tune LLM trực tiếp</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">• Cần hàng nghìn ví dụ Q&A chất lượng cao</Text>
              <Text tone="secondary" size="small">• Tốn GPU hours để train, chi phí cao</Text>
              <Text tone="secondary" size="small">• Khi catalog sản phẩm thay đổi → phải retrain lại</Text>
              <Text tone="secondary" size="small">• Model có thể "hallucinate" giá, tên sản phẩm sai</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Dùng RAG</Pill>}>RAG — Tìm trước, sinh sau</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">• Thêm sản phẩm mới → chỉ cần update knowledge base</Text>
              <Text tone="secondary" size="small">• Câu trả lời dựa trên dữ liệu thực, không hallucinate</Text>
              <Text tone="secondary" size="small">• Có thể trích dẫn nguồn ("Theo mô tả sản phẩm...")</Text>
              <Text tone="secondary" size="small">• Không cần GPU để train, dùng LLM API có sẵn</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Pipeline RAG đầy đủ</H3>
      <Table
        headers={["Bước", "Tầng", "Thành phần", "Input → Output"]}
        striped
        rows={[
          ["1", "Pre-processing", "Intent Classifier", "Câu hỏi user → intent (tìm_SP / hỏi_giá / khiếu_nại / ...)"],
          ["2", "Retrieval", "Text Search (e5-large + BM25)", "Câu hỏi → Top-5 đoạn text liên quan từ KB"],
          ["2b", "Retrieval", "Visual Search (nếu user gửi ảnh)", "Ảnh → Top-5 sản phẩm tương tự"],
          ["3", "Context Build", "Prompt Builder", "Retrieved docs + chat history + user profile → Prompt"],
          ["4", "Generation", "LLM (Gemini Flash / GPT-4o-mini)", "Prompt → Câu trả lời tự nhiên"],
          ["5", "Post-process", "Sentiment Analyzer", "Câu trả lời user → Sentiment (pos/neg/neutral)"],
          ["5b", "Escalation", "Escalation Logic", "Nếu sentiment âm → tag + chuyển nhân viên"],
        ]}
        columnAlign={["center","left","left","left"]}
      />

      <H3>Request flow chi tiết</H3>
      <Card>
        <CardHeader>Từ tin nhắn user → phản hồi chatbot</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1</Pill><Text weight="semibold">Nhận message + context</Text></Row>
              <Text tone="secondary" size="small">
                POST <Code>/chat</Code> với <Code>{"{ user_id, session_id, message, attachments[] }"}</Code>.
                Load chat history (tối đa 10 turns) từ Redis <Code>chat:{"{session_id}"}:history</Code>.
                Load user profile: tên, lịch sử mua gần nhất từ PostgreSQL.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2</Pill><Text weight="semibold">Phân loại intent</Text></Row>
              <Text tone="secondary" size="small">
                Chạy Intent Classifier → 1 trong 6 intent. Intent quyết định retrieval strategy tiếp theo.
                Nếu <Code>order_tracking</Code>: query trực tiếp DB đơn hàng, không cần retrieval từ KB.
                Nếu <Code>product_search</Code>: chạy full RAG retrieval.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">3</Pill><Text weight="semibold">Retrieval song song</Text></Row>
              <Text tone="secondary" size="small">
                asyncio.gather: chạy đồng thời text_search(query) + (visual_search(image) nếu có ảnh).
                Merge kết quả, dedup, lấy top-5 đoạn context liên quan nhất.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">4</Pill><Text weight="semibold">Build prompt và call LLM</Text></Row>
              <Text tone="secondary" size="small">
                Inject: system prompt + user profile + retrieved context + chat history + câu hỏi hiện tại.
                Stream response về frontend để hiển thị từng từ (trải nghiệm tốt hơn).
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">5</Pill><Text weight="semibold">Sentiment check + lưu history</Text></Row>
              <Text tone="secondary" size="small">
                Chạy sentiment model trên tin nhắn user (không phải câu trả lời LLM).
                Nếu negative score {'>'} 0.7: gắn flag "needs_escalation", alert admin, chuyển cuộc hội thoại.
                Lưu (user_msg, bot_response, intent, sentiment) vào Redis + PostgreSQL.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 2: KNOWLEDGE BASE ────────────────────────────────────────────────────

function KBTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Knowledge Base — Chuẩn bị và Index dữ liệu</H2>
        <Text tone="secondary">
          Knowledge Base là toàn bộ thông tin chatbot cần biết: sản phẩm, chính sách, FAQ.
          Phải được chunked và indexed trước để retrieval nhanh và chính xác.
        </Text>
      </Stack>

      <H3>Các nguồn dữ liệu cần đưa vào KB</H3>
      <Table
        headers={["Nguồn", "Nội dung", "Định dạng", "Cập nhật khi nào"]}
        striped
        rows={[
          [
            <Text weight="bold">Product catalog</Text>,
            "Tên, mô tả chi tiết, giá, thuộc tính (màu/size/chất liệu), tồn kho, hình ảnh URL",
            "JSON từ bảng products",
            "Mỗi khi thêm/sửa sản phẩm",
          ],
          [
            <Text weight="bold">FAQ — Chính sách</Text>,
            "Đổi trả, vận chuyển, bảo hành, thanh toán, chương trình khuyến mãi hiện tại",
            "Markdown hoặc JSON",
            "Khi chính sách thay đổi",
          ],
          [
            <Text weight="bold">Order status templates</Text>,
            "Các trạng thái đơn hàng, thời gian xử lý theo từng phương thức vận chuyển",
            "JSON",
            "Khi có nhà vận chuyển mới",
          ],
          [
            "Brand & Category guides",
            "Hướng dẫn chọn size, so sánh brand, tips sử dụng sản phẩm",
            "Markdown",
            "Định kỳ theo mùa",
          ],
          [
            "Previous conversations",
            "Các cuộc hội thoại được đánh dấu chất lượng cao — học từ agent con người",
            "JSON",
            "Weekly batch",
          ],
        ]}
        columnAlign={["left","left","center","left"]}
      />

      <H3>Chunking strategy — cách chia nhỏ tài liệu</H3>
      <Card>
        <CardHeader>Tại sao chunking quan trọng và cách làm</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Callout tone="warning" title="Nếu không chunk: một số vấn đề">
              Đưa cả trang mô tả sản phẩm 2.000 từ vào 1 chunk → embedding không capture được chi tiết cụ thể.
              Context window LLM có giới hạn → không nhét 50 sản phẩm cùng lúc được.
            </Callout>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Chunk size khuyến nghị</Text>
                <Table
                  framed={false} striped
                  headers={["Loại tài liệu", "Chunk size", "Overlap"]}
                  rows={[
                    ["Mô tả sản phẩm", "300–500 tokens", "50 tokens"],
                    ["FAQ", "200–300 tokens", "30 tokens"],
                    ["Chính sách dài", "400–600 tokens", "80 tokens"],
                  ]}
                  columnAlign={["left","center","center"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Chunking tốt nhất cho sản phẩm</Text>
                <Text tone="secondary" size="small">
                  Mỗi sản phẩm → 1 chunk chính (tên + mô tả + giá).
                  Thêm metadata vào mỗi chunk: item_id, category, price_range.
                  Metadata dùng để filter khi retrieval (ví dụ: chỉ tìm trong category "điện thoại").
                </Text>
              </Stack>
            </Grid>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Code chunking với LangChain</Text>
              <Text tone="secondary" size="small">
                <Code>from langchain.text_splitter import RecursiveCharacterTextSplitter</Code>.
                <Code>splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=50)</Code>.
                <Code>chunks = splitter.create_documents([text], metadatas=[{"{"}"item_id": id, "category": cat{"}"}])</Code>.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Vector Store — lưu và tìm kiếm embeddings</H3>
      <Table
        headers={["Option", "Ưu điểm", "Hạn chế", "Dùng khi"]}
        striped
        rows={[
          [
            <Text weight="bold">FAISS + JSON</Text>,
            "Đã có từ Visual/Text Search. Không cần service mới. Nhẹ, nhanh.",
            "Không hỗ trợ metadata filtering native. Phải filter thủ công.",
            <Pill tone="success" size="sm">Đồ án — đơn giản nhất</Pill>,
          ],
          [
            <Text weight="bold">Qdrant</Text>,
            "Hỗ trợ metadata filtering mạnh. REST API đẹp. Docker dễ setup.",
            "Cần service riêng (Docker container).",
            <Pill tone="info" size="sm">Khi cần filter phức tạp</Pill>,
          ],
          [
            "ChromaDB",
            "Tích hợp tốt với LangChain. Persistent storage tự động.",
            "Chậm hơn FAISS và Qdrant khi data lớn.",
            <Pill tone="neutral" size="sm">Prototype nhanh</Pill>,
          ],
        ]}
        rowTone={["success", "info", undefined]}
        columnAlign={["left","left","left","left"]}
      />

      <H3>Schema bảng PostgreSQL cho chat history</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>chat_sessions</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Column", "Type"]}
              rows={[
                [<Code>session_id</Code>, "VARCHAR(64) PK"],
                [<Code>user_id</Code>, "VARCHAR(64) INDEX"],
                [<Code>channel</Code>, "VARCHAR(16) — web/app/zalo"],
                [<Code>status</Code>, "VARCHAR(16) — active/closed/escalated"],
                [<Code>escalated_to</Code>, "VARCHAR(64) NULLABLE — admin_id"],
                [<Code>created_at</Code>, "TIMESTAMPTZ"],
                [<Code>last_message_at</Code>, "TIMESTAMPTZ INDEX"],
              ]}
              columnAlign={["left","left"]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>chat_messages</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Column", "Type"]}
              rows={[
                [<Code>id</Code>, "BIGSERIAL PK"],
                [<Code>session_id</Code>, "VARCHAR(64) INDEX"],
                [<Code>role</Code>, "VARCHAR(8) — user/bot/agent"],
                [<Code>content</Code>, "TEXT"],
                [<Code>intent</Code>, "VARCHAR(32) NULLABLE"],
                [<Code>sentiment</Code>, "VARCHAR(16) NULLABLE"],
                [<Code>sentiment_score</Code>, "FLOAT NULLABLE"],
                [<Code>retrieved_items</Code>, "JSONB — items từ RAG"],
                [<Code>created_at</Code>, "TIMESTAMPTZ INDEX"],
              ]}
              columnAlign={["left","left"]}
            />
          </CardBody>
        </Card>
      </Grid>
    </Stack>
  );
}

// ─── TAB 3: INTENT CLASSIFICATION ────────────────────────────────────────────

function IntentTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Intent Classification — Hiểu user muốn gì</H2>
        <Text tone="secondary">
          Intent quyết định cả pipeline xử lý tiếp theo. Phân loại đúng intent giúp chatbot
          trả lời nhanh hơn, chính xác hơn và tránh gọi LLM không cần thiết.
        </Text>
      </Stack>

      <H3>6 intent cần phân loại</H3>
      <Table
        headers={["Intent", "Ví dụ câu hỏi", "Pipeline xử lý", "Cần retrieval?"]}
        striped
        rows={[
          [
            <Text weight="bold">product_search</Text>,
            "'Tìm cho tôi áo khoác mùa đông', 'Có giày size 40 không?'",
            "Text Search KB + Visual Search (nếu có ảnh) → RAG → LLM",
            <Pill tone="success" size="sm">Có — full RAG</Pill>,
          ],
          [
            <Text weight="bold">price_inquiry</Text>,
            "'Cái này giá bao nhiêu?', 'iPhone 15 có rẻ hơn không?'",
            "Query DB trực tiếp bằng item_id + RAG KB",
            <Pill tone="info" size="sm">Có — DB query</Pill>,
          ],
          [
            <Text weight="bold">order_tracking</Text>,
            "'Đơn hàng của tôi đến đâu rồi?', 'Khi nào giao hàng?'",
            "Query bảng orders bằng user_id → template response",
            <Pill tone="neutral" size="sm">Không — DB only</Pill>,
          ],
          [
            <Text weight="bold">policy_faq</Text>,
            "'Đổi trả như thế nào?', 'Ship bao nhiêu ngày?'",
            "Retrieval từ FAQ KB → LLM sinh câu trả lời",
            <Pill tone="info" size="sm">Có — FAQ KB</Pill>,
          ],
          [
            <Text weight="bold">complaint</Text>,
            "'Hàng bị lỗi', 'Giao hàng chậm quá', 'Tôi muốn hoàn tiền'",
            "Ghi nhận, escalate ngay → template xin lỗi + chuyển nhân viên",
            <Pill tone="warning" size="sm">Escalate ngay</Pill>,
          ],
          [
            "general_chat",
            "'Xin chào', 'Cảm ơn', 'Bạn tên gì?'",
            "LLM sinh response ngắn không cần retrieval",
            <Pill tone="neutral" size="sm">Không cần</Pill>,
          ],
        ]}
        columnAlign={["left","left","left","center"]}
        rowTone={[undefined, undefined, undefined, undefined, "warning", undefined]}
      />

      <H3>2 phương pháp implement</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Khuyến nghị</Pill>}>Fine-tune PhoBERT Classifier</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Text tone="secondary" size="small">
                Fine-tune PhoBERT với classification head (linear layer 768→6).
                Cần 200–500 câu ví dụ mỗi intent (tổng ~1.500–3.000 câu).
              </Text>
              <Table
                framed={false} striped
                headers={["Param", "Giá trị"]}
                rows={[
                  [<Code>model</Code>, "vinai/phobert-base"],
                  [<Code>num_labels</Code>, "6"],
                  [<Code>epochs</Code>, "5–10"],
                  [<Code>lr</Code>, "2e-5"],
                  [<Code>batch_size</Code>, "16"],
                  [<Code>max_len</Code>, "128 tokens"],
                ]}
                columnAlign={["left","right"]}
              />
              <Text tone="secondary" size="small">
                Ưu điểm: nhanh (&lt; 10ms), chạy offline, chính xác cao trên intent đã biết.
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Zero-shot, không cần train</Pill>}>LLM Zero-shot Classification</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Text tone="secondary" size="small">
                Gửi câu hỏi user + danh sách intent vào LLM, yêu cầu phân loại.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Prompt template:</Text>
                <Code>Phân loại câu hỏi sau vào 1 trong các intent:</Code>
                <Code>[product_search, price_inquiry, order_tracking, policy_faq, complaint, general_chat]</Code>
                <Code>Câu hỏi: "{"{user_message}"}"</Code>
                <Code>Trả về chỉ tên intent, không giải thích.</Code>
              </Stack>
              <Text tone="secondary" size="small">
                Ưu điểm: không cần train data, dễ thêm intent mới.
                Nhược điểm: tốn thêm ~50ms + API cost cho mỗi request.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Tạo training data cho Intent Classifier</H3>
      <Card>
        <CardHeader>Cách sinh 3.000 câu training examples</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Phương pháp 1 — LLM Data Augmentation (nhanh nhất)</Text>
              <Text tone="secondary" size="small">
                Prompt Gemini Flash: "Hãy viết 50 câu hỏi tiếng Việt tự nhiên mà khách hàng sẽ hỏi khi muốn [tìm sản phẩm].
                Viết đa dạng: ngắn/dài, formal/informal, có lỗi chính tả đôi chút."
                Sinh cho mỗi intent → có ngay 300 câu per intent × 6 = 1.800 câu trong 10 phút.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Phương pháp 2 — Thu thập từ chat logs thực</Text>
              <Text tone="secondary" size="small">
                Export chat history → label thủ công hoặc semi-automatic (LLM pre-label, người review).
                Data thực chất lượng cao hơn data sinh nhân tạo — dùng để fine-tune thêm.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Augmentation kỹ thuật</Text>
              <Text tone="secondary" size="small">
                Back-translation: dịch sang English → dịch lại tiếng Việt (tạo paraphrase).
                Random word swap/delete (10% từ). Thay thế synonym từ từ điển.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="success" title="Điểm cộng: Hierarchical Intent">
        Thêm sub-intent: complaint → {"{"} late_delivery | wrong_item | quality_issue | refund_request {"}"}.
        Giúp escalation chính xác hơn: "sản phẩm lỗi" → gửi thẳng team QC, "hoàn tiền" → gửi team finance.
      </Callout>
    </Stack>
  );
}

// ─── TAB 4: SENTIMENT ANALYSIS ───────────────────────────────────────────────

function SentimentTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Sentiment Analysis — So sánh 3 model tiếng Việt</H2>
        <Text tone="secondary">
          Phân tích cảm xúc tin nhắn của user: positive / negative / neutral.
          Khi negative vượt ngưỡng → tự động chuyển nhân viên kèm nhãn "Khách hàng bức xúc".
        </Text>
      </Stack>

      <Table
        headers={["Model", "Pretrained trên", "F1-macro", "Latency", "Size", "Khuyến nghị"]}
        striped
        rows={[
          [
            <Text weight="bold">PhoBERT-sentiment</Text>,
            "20GB tiếng Việt (báo, wiki, social)",
            "0.88–0.93",
            "~25ms",
            "135MB",
            <Pill tone="success" size="sm">Tốt nhất cho tiếng Việt</Pill>,
          ],
          [
            <Text weight="bold">ViSoBERT</Text>,
            "Mạng xã hội tiếng Việt (FB, Twitter, TikTok)",
            "0.86–0.91",
            "~25ms",
            "130MB",
            <Pill tone="info" size="sm">Tốt khi user dùng slang</Pill>,
          ],
          [
            "XLM-RoBERTa-large",
            "100 ngôn ngữ (multilingual)",
            "0.84–0.90",
            "~60ms",
            "1.1GB",
            <Pill tone="neutral" size="sm">Nặng, dùng khi ít data</Pill>,
          ],
        ]}
        rowTone={["success", "info", undefined]}
        columnAlign={["left","left","center","center","center","left"]}
      />

      <H3>Dataset tiếng Việt để train</H3>
      <Table
        headers={["Dataset", "Số mẫu", "Labels", "Link / Nguồn", "Ghi chú"]}
        striped
        rows={[
          [<Text weight="bold">UIT-VSFC</Text>, "16.175", "pos/neg/neutral", "GitHub: UIT-NLP", "Dataset chuẩn nhất, từ review sinh viên"],
          ["VLSP 2016 SA", "~5.000", "pos/neg/neutral", "VLSP Workshop", "Review về điện thoại và điện máy — rất phù hợp"],
          ["PhoBERT fine-tuned", "Nhiều datasets", "Sẵn HuggingFace", "wonrax/phobert-base-vietnamese-sentiment", "Dùng trực tiếp, không cần train thêm"],
          ["Custom e-commerce data", "Tự tạo", "pos/neg/neutral", "LLM generate", "Generate 500 câu per class cho domain của dự án"],
        ]}
        rowTone={["success", "info", undefined, "success"]}
        columnAlign={["left","center","center","left","left"]}
      />

      <H3>Fine-tune PhoBERT cho sentiment — từng bước</H3>
      <Card>
        <CardHeader>Training pipeline với Hugging Face Transformers</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1</Pill><Text weight="semibold">Load pretrained và thêm classification head</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from transformers import AutoModelForSequenceClassification</Code>.
                <Code>model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=3)</Code>.
                Labels: 0=negative, 1=neutral, 2=positive.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2</Pill><Text weight="semibold">Chuẩn bị dataset</Text></Row>
              <Text tone="secondary" size="small">
                Combine UIT-VSFC + VLSP + custom e-commerce data.
                Cân bằng class (có thể oversample negative nếu ít hơn).
                Split 80/10/10 train/val/test. Tokenize với PhoBERT tokenizer (max_length=128).
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">3</Pill><Text weight="semibold">Training với Hugging Face Trainer</Text></Row>
              <Table
                framed={false} striped
                headers={["Param", "Giá trị"]}
                rows={[
                  [<Code>num_train_epochs</Code>, "5"],
                  [<Code>per_device_train_batch_size</Code>, "16"],
                  [<Code>learning_rate</Code>, "2e-5"],
                  [<Code>warmup_ratio</Code>, "0.1"],
                  [<Code>weight_decay</Code>, "0.01"],
                  [<Code>evaluation_strategy</Code>, "epoch"],
                  [<Code>load_best_model_at_end</Code>, "True"],
                  [<Code>metric_for_best_model</Code>, "f1_macro"],
                ]}
                columnAlign={["left","right"]}
              />
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">4</Pill><Text weight="semibold">Inference nhanh</Text></Row>
              <Text tone="secondary" size="small">
                Convert model sang ONNX để inference nhanh hơn 2–3x: <Code>from optimum.onnxruntime import ORTModelForSequenceClassification</Code>.
                Latency drop từ ~25ms xuống ~8ms per message.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Escalation logic</H3>
      <Card>
        <CardHeader>Khi nào và cách nào chuyển nhân viên</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Table
              framed={false} striped
              headers={["Điều kiện", "Action", "Thông tin gửi kèm"]}
              rows={[
                ["sentiment_score_negative &gt; 0.75 (1 lần)", "Gắn flag warning, theo dõi tiếp", "—"],
                ["sentiment_score_negative &gt; 0.75 (2 lần liên tiếp)", "Notify admin, offer kết nối nhân viên", "Session ID, user info"],
                ["intent = 'complaint' BẤT KỂ sentiment", "Escalate ngay", "Type of complaint, order info"],
                ["User từ chối chatbot, yêu cầu người thật", "Escalate ngay", "Full chat history"],
                ["Chatbot trả lời 'Tôi không biết' 3 lần liên tiếp", "Escalate tự động", "Unanswered questions"],
              ]}
              columnAlign={["left","left","left"]}
            />
            <Callout tone="info" title="Thông báo cho Admin">
              Khi escalate: gửi webhook đến Slack/Telegram của team support với:
              tên user, đoạn hội thoại cuối, loại vấn đề, link vào session để xem đầy đủ.
              Admin click link → vào được giao diện live chat để tiếp tục trò chuyện.
            </Callout>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 5: LLM & TÍCH HỢP ───────────────────────────────────────────────────

function LLMTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>LLM Generation & Tích hợp hệ thống</H2>
        <Text tone="secondary">
          Chọn LLM provider, thiết kế system prompt, implement streaming,
          quản lý conversation memory và tích hợp vào frontend.
        </Text>
      </Stack>

      <H3>So sánh LLM provider</H3>
      <Table
        headers={["Provider", "Model", "Free tier", "Tiếng Việt", "Context", "Khuyến nghị"]}
        striped
        rows={[
          [
            <Text weight="bold">Google Gemini</Text>,
            "gemini-1.5-flash",
            <Pill tone="success" size="sm">15 RPM, 1M tokens/ngày</Pill>,
            <Pill tone="success" size="sm">Rất tốt</Pill>,
            "1M tokens",
            <Pill tone="success" size="sm">Dùng cho đồ án</Pill>,
          ],
          [
            "Groq",
            "llama-3.1-70b",
            <Pill tone="success" size="sm">30 RPM free</Pill>,
            <Pill tone="info" size="sm">Tốt</Pill>,
            "128K tokens",
            <Pill tone="info" size="sm">Demo realtime</Pill>,
          ],
          [
            "OpenAI",
            "gpt-4o-mini",
            <Pill tone="neutral" size="sm">$5 credit</Pill>,
            <Pill tone="success" size="sm">Tốt</Pill>,
            "128K tokens",
            <Pill tone="neutral" size="sm">Nếu có budget</Pill>,
          ],
          [
            "Ollama (local)",
            "qwen2.5:7b",
            <Pill tone="success" size="sm">Miễn phí</Pill>,
            <Pill tone="info" size="sm">Khá</Pill>,
            "32K tokens",
            <Pill tone="neutral" size="sm">Offline / privacy</Pill>,
          ],
        ]}
        rowTone={["success", undefined, undefined, undefined]}
        columnAlign={["left","left","center","center","center","left"]}
      />

      <H3>System Prompt Design</H3>
      <Card>
        <CardHeader>System prompt template (tiếng Việt)</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              Prompt được inject khi mỗi conversation bắt đầu. Inject thêm user profile và context retrieved.
            </Text>
            <Stack gap={4}>
              <Code>Bạn là trợ lý mua sắm AI của [Tên shop], thân thiện và chuyên nghiệp.</Code>
              <Code>Luôn trả lời bằng tiếng Việt tự nhiên, ngắn gọn (tối đa 3-4 câu).</Code>
              <Code>Chỉ tư vấn dựa trên THÔNG TIN SẢN PHẨM được cung cấp bên dưới.</Code>
              <Code>Nếu không biết → nói thật: "Để tôi kiểm tra lại cho bạn".</Code>
              <Code>KHÔNG bịa giá, số lượng tồn kho, hay thông tin không có trong context.</Code>
              <Code>---THÔNG TIN KHÁCH HÀNG---</Code>
              <Code>Tên: {"{user_name}"}. Mua gần nhất: {"{last_purchase}"}.</Code>
              <Code>---SẢN PHẨM LIÊN QUAN---</Code>
              <Code>{"{retrieved_context}"}</Code>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Conversation Memory Management</H3>
      <Card>
        <CardHeader>Tránh vượt context window khi chat dài</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Text weight="semibold">Chiến lược: Sliding Window + Summary</Text>
              <Text tone="secondary" size="small">
                Giữ tối đa 10 turns gần nhất trong context (sliding window).
                Với conversation dài hơn: dùng LLM tóm tắt 10 turns đầu thành 3-4 câu ngắn.
                Inject summary vào đầu context: "Tóm tắt hội thoại trước: [summary]".
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Redis schema cho memory</Text>
              <Text tone="secondary" size="small">
                <Code>chat:{"{session_id}"}:history</Code> → Redis List, mỗi item = JSON {"{ role, content, timestamp }"}.
                LPUSH khi có message mới. LTRIM để giữ tối đa 20 messages.
                TTL = 24 giờ cho session active, 7 ngày cho session ended.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>API Endpoints cho Chatbot</H3>
      <Table
        headers={["Endpoint", "Method", "Input", "Output", "Latency"]}
        striped
        rows={[
          [<Code>/chat</Code>, <Pill tone="warning" size="sm">POST</Pill>, <Code>{"{ user_id, session_id, message, attachments }"}</Code>, "Server-Sent Events stream", "&lt; 200ms first token"],
          [<Code>/chat/sessions</Code>, <Pill tone="info" size="sm">GET</Pill>, <Code>user_id</Code>, "Danh sách session + last message", "&lt; 50ms"],
          [<Code>/chat/sessions/{"{id}"}/history</Code>, <Pill tone="info" size="sm">GET</Pill>, "session_id", "Toàn bộ tin nhắn trong session", "&lt; 50ms"],
          [<Code>/chat/sessions/{"{id}"}/escalate</Code>, <Pill tone="warning" size="sm">POST</Pill>, "session_id + reason", "Chuyển session cho admin", "&lt; 100ms"],
          [<Code>/admin/chat/queue</Code>, <Pill tone="info" size="sm">GET</Pill>, "admin_id", "Danh sách session cần xử lý", "&lt; 30ms"],
        ]}
        columnAlign={["left","center","left","left","center"]}
      />

      <H3>Streaming response với FastAPI + SSE</H3>
      <Card>
        <CardHeader>Server-Sent Events — từng từ hiện ra real-time</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              Dùng <Code>StreamingResponse</Code> của FastAPI + async generator để stream LLM output.
            </Text>
            <Text tone="secondary" size="small">
              Backend: <Code>async for chunk in llm_client.stream(prompt): yield f"data: {"{chunk}"}\\n\\n"</Code>.
            </Text>
            <Text tone="secondary" size="small">
              Frontend: <Code>EventSource("/chat")</Code> → <Code>onmessage: append chunk to message bubble</Code>.
            </Text>
            <Text tone="secondary" size="small">
              Trải nghiệm user: thấy từng từ xuất hiện dần dần, không phải chờ toàn bộ response.
              Giống ChatGPT, Claude. Latency perceived giảm đáng kể dù total time như nhau.
            </Text>
            <Callout tone="success" title="Điểm cộng: Proactive recommendation">
              Nếu user browse &gt; 3 phút mà chưa add_to_cart: chatbot tự pop-up "Bạn cần tôi tư vấn thêm không?".
              Trigger từ frontend sau 3 phút idle. Tăng conversion rate đáng kể.
            </Callout>
          </Stack>
        </CardBody>
      </Card>

      <H3>Cấu trúc thư mục project chatbot</H3>
      <Table
        headers={["File / Thư mục", "Vai trò"]}
        striped
        rows={[
          [<Code>chatbot/router.py</Code>, "FastAPI routes: /chat, /sessions, /escalate"],
          [<Code>chatbot/rag_engine.py</Code>, "Pipeline: retrieve → build prompt → stream LLM"],
          [<Code>chatbot/intent_classifier.py</Code>, "Load PhoBERT, predict intent, cache model"],
          [<Code>chatbot/sentiment_analyzer.py</Code>, "Load PhoBERT-sentiment, predict, escalation trigger"],
          [<Code>chatbot/memory_manager.py</Code>, "Redis operations: get/set/trim history, summarize"],
          [<Code>chatbot/prompt_builder.py</Code>, "Assemble system prompt + context + history"],
          [<Code>chatbot/escalation.py</Code>, "Detect escalation conditions, notify webhook"],
          [<Code>chatbot/kb/</Code>, "Knowledge base: product chunks, FAQ chunks, index FAISS"],
          [<Code>chatbot/models/</Code>, "intent_model.pt, sentiment_model.onnx"],
        ]}
        columnAlign={["left","left"]}
      />
    </Stack>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function ChatbotAI() {
  const theme = useHostTheme();
  const [activeTab, setActiveTab] = useCanvasState("cbTab", "rag");
  return (
    <Stack gap={0} style={{ minHeight: "100vh", background: theme.bg.editor }}>
      <Stack gap={16} style={{ padding: "24px 32px 0 32px" }}>
        <Stack gap={4}>
          <H1>Chatbot AI — Tư vấn sản phẩm thông minh</H1>
          <Text tone="secondary">
            RAG Architecture · Intent Classification · Sentiment Analysis · LLM Streaming · Escalation
          </Text>
        </Stack>
        <Row gap={8} wrap>
          {TABS.map(t => <Pill key={t.id} active={t.id === activeTab} onClick={() => setActiveTab(t.id)}>{t.label}</Pill>)}
        </Row>
        <Grid columns={5} gap={8}>
          <Stat value="RAG" label="Kiến trúc" tone="info" />
          <Stat value="6" label="Intent classes" tone="warning" />
          <Stat value="PhoBERT" label="Sentiment model" tone="success" />
          <Stat value="Gemini" label="LLM (free)" tone="success" />
          <Stat value="SSE" label="Streaming" tone="info" />
        </Grid>
        <Divider />
      </Stack>
      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "rag"       && <RagTab />}
        {activeTab === "kb"        && <KBTab />}
        {activeTab === "intent"    && <IntentTab />}
        {activeTab === "sentiment" && <SentimentTab />}
        {activeTab === "llm"       && <LLMTab />}
      </Stack>
    </Stack>
  );
}
