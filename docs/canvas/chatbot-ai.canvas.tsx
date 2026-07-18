/**
 * Chatbot AI — Tài liệu kỹ thuật đầy đủ (đã căn chỉnh theo codebase thực tế)
 * Service thực: AI/chatbot-service (FastAPI, :8002) — RAG + PhoBERT intent + PhoBERT sentiment + Redis memory + Gemini 1.5 Flash (SSE).
 * Tab 1: Kiến trúc RAG & Tổng quan
 * Tab 2: Knowledge Base & Retrieval
 * Tab 3: Intent Classification
 * Tab 4: Sentiment Analysis — So sánh 3 model
 * Tab 5: LLM Generation & Streaming
 * Tab 6: Tích hợp hệ thống (thực tế trong dự án)
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
  { id: "llm",       label: "5. LLM & Streaming" },
  { id: "integ",     label: "6. Tích hợp hệ thống" },
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
          RAG = LLM không trả lời từ trí nhớ tĩnh mà tìm kiếm thông tin liên quan trước, rồi mới sinh câu trả lời.
          Trong dự án, phần truy hồi sản phẩm được <b>ủy quyền cho search-service (:8001)</b>, chatbot chỉ điều phối
          intent → retrieval → prompt → LLM. Đảm bảo câu trả lời chính xác, luôn cập nhật theo catalog thật.
        </Text>
      </Stack>

      <Callout tone="info" title="Trạng thái code hiện tại = scaffold">
        Service <Code>AI/chatbot-service</Code> đã dựng khung hoàn chỉnh (FastAPI :8002, SSE stream, gọi search-service, Redis memory,
        Gemini 1.5 Flash). Intent & Sentiment hiện chạy <b>heuristic từ khóa làm baseline</b>; PhoBERT là mô hình dự kiến thay thế.
        Tài liệu này là KẾ HOẠCH hoàn thiện trên nền scaffold — phần nào "cần bổ sung" sẽ được đánh dấu rõ.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="RAG" label="Kiến trúc" tone="info" />
        <Stat value="6" label="Loại intent" tone="warning" />
        <Stat value="PhoBERT" label="Sentiment (wired)" tone="success" />
        <Stat value="Gemini" label="LLM primary" tone="success" />
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
              <Text tone="secondary" size="small">• Thêm sản phẩm mới → search-service tự index, không sửa chatbot</Text>
              <Text tone="secondary" size="small">• Câu trả lời dựa trên dữ liệu thực, không hallucinate</Text>
              <Text tone="secondary" size="small">• Có thể trích dẫn nguồn ("Theo mô tả sản phẩm...")</Text>
              <Text tone="secondary" size="small">• Không cần GPU để train, dùng LLM API (Gemini) có sẵn</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Pipeline RAG đầy đủ (khớp app/api/endpoints/chatbot.py)</H3>
      <Table
        headers={["Bước", "Tầng", "Thành phần (service)", "Input → Output"]}
        striped
        rows={[
          ["1", "Pre-processing", "IntentClassifierService (intent.py)", "Câu hỏi user → 1/6 intent (product_search / price_inquiry / ...)"],
          ["2", "Retrieval", "RagEngineService → GET search-service :8001", "Chỉ khi intent ∈ {product_search, price_inquiry}: query → top_k=3 sản phẩm"],
          ["2b", "Retrieval", "Visual Search (nếu có ảnh) → search-service", "Ảnh (image) → sản phẩm tương tự (cần bổ sung endpoint ảnh trong chatbot)"],
          ["3", "Context Build", "PromptBuilderService (prompt.py)", "Retrieved items + user profile → system prompt tiếng Việt"],
          ["4", "Generation", "RagEngineService.generate_response_stream", "Prompt + history → Gemini 1.5 Flash → SSE chunks"],
          ["5", "Analysis", "SentimentAnalyzerService (sentiment.py)", "Tin nhắn user → sentiment (pos/neg/neutral) + score"],
          ["5b", "Escalation", "Ngưỡng trong chatbot.py", "Nếu negative & score &gt; 0.80 → log/alert (cần nối webhook thật)"],
        ]}
        columnAlign={["center","left","left","left"]}
      />

      <H3>Request flow chi tiết (đúng handler chat_stream)</H3>
      <Card>
        <CardHeader>Từ tin nhắn user → phản hồi chatbot (SSE)</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1</Pill><Text weight="semibold">Nhận message + context</Text></Row>
              <Text tone="secondary" size="small">
                FE gọi <Code>POST /api/v1/chatbot/message</Code> với body <Code>{"{ message, image, session_id }"}</Code>
                (alias nội bộ <Code>POST /api/v1/chat</Code>). Gateway :8080 xác thực JWT Keycloak và inject header
                <Code>X-User-Id</Code> (UUID string). Body Pydantic hiện có <Code>user_id: Optional[int]</Code> —
                <b> cần đổi sang đọc X-User-Id (UUID)</b> để định danh đúng. Load history từ Redis
                <Code>chat:{"{session_id}"}:history</Code>.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2</Pill><Text weight="semibold">Phân loại intent + sentiment</Text></Row>
              <Text tone="secondary" size="small">
                <Code>intent_classifier_service.predict_intent()</Code> → 1/6 intent quyết định chiến lược retrieval.
                Đồng thời <Code>sentiment_analyzer_service.analyze_sentiment()</Code> chấm cảm xúc tin nhắn user.
                Lưu ngay tin nhắn user vào Redis kèm metadata <Code>{"{ intent, sentiment }"}</Code>.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">3</Pill><Text weight="semibold">Retrieval qua search-service</Text></Row>
              <Text tone="secondary" size="small">
                Nếu intent ∈ {"{product_search, price_inquiry}"}: <Code>rag_engine.retrieve_context()</Code> gọi
                <Code>GET {"{SEARCH_SERVICE_URL}"}/api/v1/search?q=&amp;top_k=3</Code> → nhận <Code>items[]</Code>,
                format thành chuỗi context. Chatbot KHÔNG tự embed sản phẩm — mọi vector/RRF nằm ở search-service.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">4</Pill><Text weight="semibold">Build prompt và stream LLM</Text></Row>
              <Text tone="secondary" size="small">
                <Code>prompt_builder.build_system_prompt(user_name, context)</Code> ghép system prompt + hồ sơ khách + context.
                <Code>generate_response_stream()</Code> gọi Gemini 1.5 Flash (nếu có <Code>GEMINI_API_KEY</Code>),
                trả về <Code>StreamingResponse(media_type="text/event-stream")</Code>. Không có key → mock generator.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">5</Pill><Text weight="semibold">Escalation check + lưu history</Text></Row>
              <Text tone="secondary" size="small">
                Nếu <Code>label == "negative"</Code> và <Code>score &gt; 0.80</Code>: log cảnh báo + (dự kiến) bắn webhook
                Slack/Telegram/Zalo. Sau khi stream xong, ghép <Code>full_response_text</Code> và lưu bot reply vào Redis.
                Persist dài hạn xuống MariaDB là bước <b>cần bổ sung</b> (hiện chỉ Redis, TTL 24h).
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="neutral" title="Định dạng SSE thực tế">
        Chunk đầu là metadata: <Code>data: {"{ \"metadata\": { intent, sentiment, retrievedItems } }"}</Code>.
        Các chunk sau: <Code>data: {"{ \"chunk\": \"<từ>\" }"}</Code>. FE nối dần vào bong bóng tin nhắn.
      </Callout>
    </Stack>
  );
}

// ─── TAB 2: KNOWLEDGE BASE ────────────────────────────────────────────────────

function KBTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Knowledge Base & Retrieval — phân tách theo nguồn</H2>
        <Text tone="secondary">
          Nguyên tắc căn chỉnh: <b>truy hồi sản phẩm = gọi search-service :8001</b> (đã có CLIP + e5-large + BM25/RRF),
          chatbot KHÔNG dựng vector store riêng cho sản phẩm. KB "của riêng chatbot" chỉ dành cho FAQ / chính sách /
          hướng dẫn — dữ liệu tĩnh, ít thay đổi, có thể index bằng FAISS/Redis vector.
        </Text>
      </Stack>

      <H3>Phân tách nguồn dữ liệu & nơi truy hồi</H3>
      <Table
        headers={["Nguồn", "Nội dung", "Nơi lưu / truy hồi", "Cập nhật khi nào"]}
        striped
        rows={[
          [
            <Text weight="bold">Product catalog</Text>,
            "Tên, mô tả, giá, thuộc tính, ảnh — dùng cho product_search / price_inquiry",
            "search-service :8001 (ES + MariaDB/Mongo), gọi qua GET /api/v1/search",
            "search-service tự index theo event",
          ],
          [
            <Text weight="bold">FAQ — Chính sách</Text>,
            "Đổi trả, vận chuyển, bảo hành, thanh toán, khuyến mãi hiện tại",
            "KB nội bộ chatbot: FAISS / Redis vector (cần bổ sung)",
            "Khi chính sách thay đổi",
          ],
          [
            <Text weight="bold">Order status</Text>,
            "Trạng thái đơn, thời gian xử lý — cho intent order_tracking",
            "Query order-service (MariaDB ecommerce_order_db) theo X-User-Id",
            "Realtime từ DB đơn hàng",
          ],
          [
            "Brand & Category guides",
            "Hướng dẫn chọn cấu hình, so sánh brand, tips sử dụng",
            "KB nội bộ chatbot (Markdown → chunk → vector)",
            "Định kỳ theo mùa",
          ],
          [
            "Previous conversations",
            "Hội thoại chất lượng cao — học từ agent con người",
            "Redis (ngắn hạn) + MariaDB (dài hạn, cần bổ sung)",
            "Weekly batch",
          ],
        ]}
        columnAlign={["left","left","left","left"]}
      />

      <H3>Chunking strategy — chỉ áp dụng cho KB nội bộ (FAQ/chính sách)</H3>
      <Card>
        <CardHeader>Sản phẩm KHÔNG chunk ở đây — đã do search-service xử lý</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Callout tone="warning" title="Vì sao vẫn cần chunk cho FAQ/chính sách">
              Tài liệu chính sách dài → nếu nhét cả trang vào 1 chunk, embedding không capture chi tiết cụ thể,
              và context window LLM có giới hạn. Chunk giúp truy hồi đúng đoạn liên quan.
            </Callout>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Chunk size khuyến nghị (KB FAQ/chính sách)</Text>
                <Table
                  framed={false} striped
                  headers={["Loại tài liệu", "Chunk size", "Overlap"]}
                  rows={[
                    ["FAQ đơn lẻ", "200–300 tokens", "30 tokens"],
                    ["Chính sách dài", "400–600 tokens", "80 tokens"],
                    ["Hướng dẫn chọn máy", "300–500 tokens", "50 tokens"],
                  ]}
                  columnAlign={["left","center","center"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Metadata cho mỗi chunk</Text>
                <Text tone="secondary" size="small">
                  Gắn <Code>doc_type</Code> (faq/policy/guide), <Code>topic</Code>, <Code>updated_at</Code>.
                  Dùng để filter khi retrieval (ví dụ chỉ tìm trong nhóm "bảo hành"). Sản phẩm không nằm ở đây —
                  <Code>Product.id</Code> là <Code>Long</Code> và được search-service trả về trực tiếp.
                </Text>
              </Stack>
            </Grid>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Code chunking (LangChain, cho KB nội bộ)</Text>
              <Text tone="secondary" size="small">
                <Code>from langchain.text_splitter import RecursiveCharacterTextSplitter</Code>.
                <Code>splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=50)</Code>.
                <Code>chunks = splitter.create_documents([text], metadatas=[{"{"}"doc_type": "policy"{"}"}])</Code>.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Vector Store cho KB nội bộ (FAQ/chính sách) — sản phẩm dùng ES của search-service</H3>
      <Table
        headers={["Option", "Ưu điểm", "Hạn chế", "Dùng khi"]}
        striped
        rows={[
          [
            <Text weight="bold">FAISS + JSON</Text>,
            "Nhẹ, nhanh, không cần service mới. Đủ cho vài trăm chunk FAQ.",
            "Không hỗ trợ metadata filtering native. Phải filter thủ công.",
            <Pill tone="success" size="sm">Đồ án — đơn giản nhất</Pill>,
          ],
          [
            <Text weight="bold">Redis Vector (RediSearch)</Text>,
            "Đã có Redis trong stack (dùng cho memory). Tận dụng hạ tầng sẵn có.",
            "Cần module RediSearch bật trên Redis.",
            <Pill tone="info" size="sm">Tận dụng Redis sẵn có</Pill>,
          ],
          [
            "Qdrant / ChromaDB",
            "Metadata filtering mạnh, tích hợp LangChain tốt.",
            "Cần thêm container riêng — thừa cho lượng FAQ nhỏ.",
            <Pill tone="neutral" size="sm">Khi KB phình to</Pill>,
          ],
        ]}
        rowTone={["success", "info", undefined]}
        columnAlign={["left","left","left","left"]}
      />

      <H3>Lưu trữ hội thoại — Redis (hiện có) + MariaDB (cần bổ sung), KHÔNG PostgreSQL</H3>
      <Callout tone="info" title="Thực tế trong memory.py">
        Hiện chỉ dùng Redis List <Code>chat:{"{session_id}"}:history</Code> (LPUSH + LTRIM giữ 20 message = 10 turns, TTL 24h).
        Chưa có bảng quan hệ. Để lưu lịch sử dài hạn/analytics, đề xuất 2 bảng <b>MariaDB</b> (relational primary của dự án) dưới đây.
      </Callout>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>chat_sessions (MariaDB — cần bổ sung)</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Column", "Type"]}
              rows={[
                [<Code>session_id</Code>, "VARCHAR(64) PK"],
                [<Code>user_id</Code>, "VARCHAR(64) INDEX — Keycloak UUID"],
                [<Code>channel</Code>, "VARCHAR(16) — web/app"],
                [<Code>status</Code>, "VARCHAR(16) — active/closed/escalated"],
                [<Code>escalated_to</Code>, "VARCHAR(64) NULL — agent id"],
                [<Code>created_at</Code>, "DATETIME"],
                [<Code>last_message_at</Code>, "DATETIME INDEX"],
              ]}
              columnAlign={["left","left"]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>chat_messages (MariaDB — cần bổ sung)</CardHeader>
          <CardBody>
            <Table
              framed={false} striped
              headers={["Column", "Type"]}
              rows={[
                [<Code>id</Code>, "BIGINT AUTO_INCREMENT PK"],
                [<Code>session_id</Code>, "VARCHAR(64) INDEX"],
                [<Code>role</Code>, "VARCHAR(8) — user/bot/agent"],
                [<Code>content</Code>, "TEXT"],
                [<Code>intent</Code>, "VARCHAR(32) NULL"],
                [<Code>sentiment</Code>, "VARCHAR(16) NULL"],
                [<Code>sentiment_score</Code>, "FLOAT NULL"],
                [<Code>retrieved_items</Code>, "JSON — items từ search-service"],
                [<Code>created_at</Code>, "DATETIME INDEX"],
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
          Intent quyết định cả pipeline. Trong code (<Code>intent.py</Code>) hiện dùng heuristic từ khóa làm baseline;
          mô hình dự kiến là <b>PhoBERT</b> (<Code>vinai/phobert-base</Code>, từ env <Code>INTENT_MODEL_NAME</Code>) với
          classification head 6 lớp. Phân loại đúng intent giúp tránh gọi search-service/LLM không cần thiết.
        </Text>
      </Stack>

      <H3>6 intent cần phân loại (khớp docstring predict_intent)</H3>
      <Table
        headers={["Intent", "Ví dụ câu hỏi", "Pipeline xử lý", "Cần retrieval?"]}
        striped
        rows={[
          [
            <Text weight="bold">product_search</Text>,
            "'Tìm cho tôi laptop gaming', 'Có iPhone 15 không?'",
            "Gọi search-service :8001 (+ Visual nếu có ảnh) → context → LLM",
            <Pill tone="success" size="sm">Có — search-service</Pill>,
          ],
          [
            <Text weight="bold">price_inquiry</Text>,
            "'Cái này giá bao nhiêu?', 'iPhone 15 có rẻ hơn không?'",
            "Gọi search-service để lấy sản phẩm + giá → context → LLM",
            <Pill tone="info" size="sm">Có — search-service</Pill>,
          ],
          [
            <Text weight="bold">order_tracking</Text>,
            "'Đơn hàng của tôi đến đâu rồi?', 'Khi nào giao hàng?'",
            "Query order-service (MariaDB) bằng X-User-Id → template (cần bổ sung)",
            <Pill tone="neutral" size="sm">Không — DB đơn hàng</Pill>,
          ],
          [
            <Text weight="bold">policy_faq</Text>,
            "'Đổi trả như thế nào?', 'Ship bao nhiêu ngày?'",
            "Retrieval từ KB FAQ nội bộ → LLM sinh câu trả lời",
            <Pill tone="info" size="sm">Có — FAQ KB</Pill>,
          ],
          [
            <Text weight="bold">complaint</Text>,
            "'Hàng bị lỗi', 'Giao hàng chậm quá', 'Tôi muốn hoàn tiền'",
            "Template xin lỗi + escalate (kết hợp sentiment âm)",
            <Pill tone="warning" size="sm">Ưu tiên escalate</Pill>,
          ],
          [
            "general_chat",
            "'Xin chào', 'Cảm ơn', 'Bạn tên gì?'",
            "LLM sinh response ngắn, không cần retrieval",
            <Pill tone="neutral" size="sm">Không cần</Pill>,
          ],
        ]}
        columnAlign={["left","left","left","center"]}
        rowTone={[undefined, undefined, undefined, undefined, "warning", undefined]}
      />

      <Callout tone="neutral" title="Baseline hiện tại trong code">
        <Code>intent.py</Code> đang so khớp từ khóa (ví dụ "tìm/mua" → product_search, "giá/bao nhiêu" → price_inquiry).
        Đây là fallback nhanh, dùng làm nhãn khởi tạo dữ liệu; PhoBERT sẽ thay thế để tăng độ chính xác trên câu tự nhiên.
      </Callout>

      <H3>2 phương pháp implement</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Khuyến nghị (wired)</Pill>}>Fine-tune PhoBERT Classifier</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Text tone="secondary" size="small">
                Fine-tune PhoBERT với classification head (linear 768→6).
                Cần 200–500 câu ví dụ mỗi intent (tổng ~1.500–3.000 câu). Env: <Code>INTENT_MODEL_NAME=vinai/phobert-base</Code>.
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
                Gửi câu hỏi user + danh sách intent vào LLM (Gemini), yêu cầu phân loại.
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
                Nhược điểm: tốn thêm ~50ms + API cost mỗi request.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Tạo training data cho Intent Classifier</H3>
      <Card>
        <CardHeader>Cách sinh ~3.000 câu training examples</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Phương pháp 1 — LLM Data Augmentation (nhanh nhất)</Text>
              <Text tone="secondary" size="small">
                Prompt Gemini Flash: "Hãy viết 50 câu hỏi tiếng Việt tự nhiên khách hàng sẽ hỏi khi muốn [tìm sản phẩm].
                Đa dạng ngắn/dài, formal/informal, có lỗi chính tả đôi chút."
                Sinh cho mỗi intent → 300 câu × 6 = 1.800 câu trong 10 phút.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Phương pháp 2 — Thu thập từ chat logs thực</Text>
              <Text tone="secondary" size="small">
                Export lịch sử Redis/MariaDB → nhãn heuristic sẵn có làm pre-label, người review lại.
                Data thực chất lượng cao hơn data sinh nhân tạo — dùng để fine-tune thêm.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Augmentation kỹ thuật</Text>
              <Text tone="secondary" size="small">
                Back-translation (VI → EN → VI tạo paraphrase). Random word swap/delete (10%). Thay synonym từ điển.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Callout tone="success" title="Điểm cộng: Hierarchical Intent">
        Thêm sub-intent: complaint → {"{"} late_delivery | wrong_item | quality_issue | refund_request {"}"}.
        Giúp escalation chính xác hơn: "sản phẩm lỗi" → team QC, "hoàn tiền" → team finance.
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
          Phân tích cảm xúc tin nhắn user: positive / negative / neutral. Khi negative vượt ngưỡng → chuyển nhân viên.
          Mô hình được wire trong code là <b>PhoBERT-sentiment</b> (<Code>wonrax/phobert-base-vietnamese-sentiment</Code>,
          env <Code>SENTIMENT_MODEL_NAME</Code>); baseline hiện tại là heuristic từ khóa trong <Code>sentiment.py</Code>.
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
            <Pill tone="success" size="sm">Đã wire (wonrax/...)</Pill>,
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
          ["VLSP 2016 SA", "~5.000", "pos/neg/neutral", "VLSP Workshop", "Review điện thoại/điện máy — rất phù hợp"],
          ["PhoBERT fine-tuned", "Nhiều datasets", "Sẵn HuggingFace", "wonrax/phobert-base-vietnamese-sentiment", "Chính model đang cấu hình — dùng trực tiếp"],
          ["Custom e-commerce data", "Tự tạo", "pos/neg/neutral", "LLM generate", "Generate 500 câu/class cho domain của dự án"],
        ]}
        rowTone={["success", "info", "success", undefined]}
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
                <Code>model = AutoModelForSequenceClassification.from_pretrained("wonrax/phobert-base-vietnamese-sentiment", num_labels=3)</Code>.
                Labels: 0=negative, 1=neutral, 2=positive.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2</Pill><Text weight="semibold">Chuẩn bị dataset</Text></Row>
              <Text tone="secondary" size="small">
                Combine UIT-VSFC + VLSP + custom e-commerce data. Cân bằng class (oversample negative nếu ít).
                Split 80/10/10. Tokenize với PhoBERT tokenizer (max_length=128).
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
                Convert sang ONNX để inference nhanh 2–3x: <Code>from optimum.onnxruntime import ORTModelForSequenceClassification</Code>.
                Latency ~25ms → ~8ms/message. Load model 1 lần khi khởi tạo service.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Escalation logic (ngưỡng khớp chatbot.py: negative &amp; score &gt; 0.80)</H3>
      <Card>
        <CardHeader>Khi nào và cách nào chuyển nhân viên</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Table
              framed={false} striped
              headers={["Điều kiện", "Action", "Thông tin gửi kèm"]}
              rows={[
                ["negative &amp; score &gt; 0.80 (1 lần)", "Log cảnh báo, theo dõi tiếp", "session_id, intent"],
                ["negative &amp; score &gt; 0.80 (2 lần liên tiếp)", "Notify admin, offer kết nối nhân viên", "Session ID, user info"],
                ["intent = 'complaint' BẤT KỂ sentiment", "Ưu tiên escalate", "Type of complaint, order info"],
                ["User yêu cầu gặp người thật (FE gọi /chatbot/escalate)", "Escalate ngay", "Full chat history"],
                ["Chatbot trả lời 'không biết' 3 lần liên tiếp", "Escalate tự động", "Unanswered questions"],
              ]}
              columnAlign={["left","left","left"]}
            />
            <Callout tone="info" title="Thông báo cho Admin (cần nối thật)">
              Env <Code>ESCALATION_WEBHOOK_URL</Code> đã có sẵn trong config. Khi escalate: bắn webhook Slack/Telegram/Zalo với
              tên user, đoạn hội thoại cuối, loại vấn đề, link session. Hiện <Code>/chatbot/escalate</Code> mới trả
              <Code>{"{ status: SUCCESS }"}</Code> — cần gọi thật tới BE user-service/notification.
            </Callout>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 5: LLM & STREAMING ──────────────────────────────────────────────────

function LLMTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>LLM Generation & Streaming</H2>
        <Text tone="secondary">
          Chọn LLM provider, thiết kế system prompt, streaming SSE, quản lý conversation memory.
          Provider chính đang wire: <b>Gemini 1.5 Flash</b> (env <Code>GEMINI_API_KEY</Code>) trong <Code>rag.py</Code>;
          <Code>OPENAI_API_KEY</Code> / <Code>GROQ_API_KEY</Code> có sẵn trong shared-common làm phương án dự phòng.
        </Text>
      </Stack>

      <H3>So sánh LLM provider</H3>
      <Table
        headers={["Provider", "Model", "Free tier", "Tiếng Việt", "Context", "Trạng thái"]}
        striped
        rows={[
          [
            <Text weight="bold">Google Gemini</Text>,
            "gemini-1.5-flash",
            <Pill tone="success" size="sm">15 RPM, 1M tokens/ngày</Pill>,
            <Pill tone="success" size="sm">Rất tốt</Pill>,
            "1M tokens",
            <Pill tone="success" size="sm">Đang wire (primary)</Pill>,
          ],
          [
            "Groq",
            "llama-3.1-70b",
            <Pill tone="success" size="sm">30 RPM free</Pill>,
            <Pill tone="info" size="sm">Tốt</Pill>,
            "128K tokens",
            <Pill tone="info" size="sm">Optional (GROQ_API_KEY)</Pill>,
          ],
          [
            "OpenAI",
            "gpt-4o-mini",
            <Pill tone="neutral" size="sm">$5 credit</Pill>,
            <Pill tone="success" size="sm">Tốt</Pill>,
            "128K tokens",
            <Pill tone="neutral" size="sm">Optional (OPENAI_API_KEY)</Pill>,
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

      <H3>System Prompt Design (khớp prompt.py)</H3>
      <Card>
        <CardHeader>build_system_prompt(user_name, retrieved_context)</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              Prompt được ghép mỗi request. Hiện <Code>user_name</Code> = <Code>"User #{"{user_id}"}"</Code> —
              <b> cần bổ sung</b> load hồ sơ (tên, hạng thành viên, đơn gần đây) từ user-service/order-service (MariaDB) theo X-User-Id.
            </Text>
            <Stack gap={4}>
              <Code>Bạn là trợ lý mua sắm AI thông minh, thân thiện và chuyên nghiệp của shop.</Code>
              <Code>Trả lời bằng tiếng Việt tự nhiên, ngắn gọn (tối đa 3-4 câu).</Code>
              <Code>Chỉ tư vấn dựa trên THÔNG TIN SẢN PHẨM được cung cấp bên dưới.</Code>
              <Code>Nếu không biết → "Để tôi kiểm tra lại thông tin này với bộ phận hỗ trợ kỹ thuật nhé".</Code>
              <Code>KHÔNG bịa giá, số lượng tồn kho hay tính năng không có trong tài liệu.</Code>
              <Code>--- THÔNG TIN KHÁCH HÀNG --- Tên khách hàng: {"{user_name}"}</Code>
              <Code>--- SẢN PHẨM LIÊN QUAN TRONG KHO (CONTEXT) --- {"{retrieved_context}"}</Code>
            </Stack>
            <Text tone="secondary" size="small">
              Lưu ý: tồn kho KHÔNG nằm trên Product (thuộc inventory-service). Prompt chỉ khẳng định thông tin có trong context.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>Conversation Memory Management (khớp memory.py)</H3>
      <Card>
        <CardHeader>Sliding Window trên Redis</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stack gap={4}>
              <Text weight="semibold">Chiến lược hiện tại: Sliding Window</Text>
              <Text tone="secondary" size="small">
                Giữ tối đa 20 message (≈ 10 turns) gần nhất qua <Code>LTRIM(key, 0, 19)</Code>.
                <Code>get_history()</Code> LRANGE toàn bộ rồi reverse về thứ tự thời gian.
                <b> Summary hóa</b> (tóm tắt các turn cũ bằng LLM) là phần plan nâng cao — chưa có trong code.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Redis schema thực tế</Text>
              <Text tone="secondary" size="small">
                <Code>chat:{"{session_id}"}:history</Code> → Redis List, mỗi item = JSON {"{ role, content, metadata }"}.
                <Code>LPUSH</Code> khi có message mới, <Code>LTRIM 0 19</Code> giữ cửa sổ, <Code>EXPIRE 86400</Code> (TTL 24h).
                role ∈ {"{ user, bot }"}; metadata chứa {"{ intent, sentiment }"}.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>API Endpoints (khớp chatbot.py, prefix /api/v1)</H3>
      <Table
        headers={["Endpoint", "Method", "Input", "Output", "Latency"]}
        striped
        rows={[
          [<Code>/api/v1/chatbot/message</Code>, <Pill tone="warning" size="sm">POST</Pill>, <Code>{"{ message, image, session_id }"}</Code>, "SSE stream: metadata chunk + các chunk văn bản", "&lt; 200ms first token"],
          [<Code>/api/v1/chat</Code> (alias), <Pill tone="warning" size="sm">POST</Pill>, "Giống trên (ChatRequest)", "Giống /chatbot/message", "&lt; 200ms"],
          [<Code>/api/v1/chat/sessions/{"{id}"}/history</Code>, <Pill tone="info" size="sm">GET</Pill>, "session_id (path)", <Code>{"{ history: [...] }"}</Code>, "&lt; 50ms"],
          [<Code>/api/v1/chatbot/escalate</Code>, <Pill tone="warning" size="sm">POST</Pill>, <Code>{"{ session_id, reason }"}</Code>, <Code>{"{ status, message }"}</Code>, "&lt; 100ms"],
          [<Code>/api/v1/chat/sessions/escalate</Code> (alias), <Pill tone="warning" size="sm">POST</Pill>, "EscalationRequest", "Giống /chatbot/escalate", "&lt; 100ms"],
        ]}
        columnAlign={["left","center","left","left","center"]}
      />

      <H3>Streaming response với FastAPI + SSE (khớp rag.py)</H3>
      <Card>
        <CardHeader>Server-Sent Events — từng từ hiện ra real-time</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">
              Endpoint trả <Code>StreamingResponse(event_generator(), media_type="text/event-stream")</Code>.
            </Text>
            <Text tone="secondary" size="small">
              Chunk metadata trước: <Code>yield f"data: {"{json.dumps({'metadata': ...})}"}\\n\\n"</Code>.
            </Text>
            <Text tone="secondary" size="small">
              Với Gemini: <Code>model.generate_content(msg, stream=True)</Code> → mỗi <Code>chunk.text</Code> →
              <Code>yield f"data: {"{json.dumps({'chunk': chunk.text})}"}\\n\\n"</Code>. Không có key → mock generator (typing giả lập).
            </Text>
            <Text tone="secondary" size="small">
              Frontend nối chunk vào bong bóng tin nhắn — thấy từng từ hiện dần như ChatGPT/Claude, giảm latency cảm nhận.
            </Text>
            <Callout tone="success" title="Điểm cộng: Proactive recommendation">
              Nếu user browse &gt; 3 phút chưa add_to_cart: chatbot tự pop-up "Bạn cần tôi tư vấn thêm không?".
              Trigger từ FE sau 3 phút idle. Tăng conversion rate.
            </Callout>
          </Stack>
        </CardBody>
      </Card>

      <H3>Cấu trúc thư mục thực tế (AI/chatbot-service)</H3>
      <Table
        headers={["File / Thư mục", "Vai trò"]}
        striped
        rows={[
          [<Code>app/main.py</Code>, "FastAPI app, include_router(prefix=/api/v1), /health, uvicorn :8002"],
          [<Code>app/api/endpoints/chatbot.py</Code>, "Routes: /chat + /chatbot/message (SSE), /chatbot/escalate, /chat/sessions/{id}/history"],
          [<Code>app/services/rag.py</Code>, "retrieve_context() gọi search-service + generate_response_stream() Gemini SSE"],
          [<Code>app/services/intent.py</Code>, "IntentClassifierService.predict_intent → 6 intent (PhoBERT, hiện heuristic)"],
          [<Code>app/services/sentiment.py</Code>, "SentimentAnalyzerService.analyze_sentiment (PhoBERT-sentiment, hiện heuristic)"],
          [<Code>app/services/memory.py</Code>, "MemoryManagerService: Redis get/add history, LTRIM 20, TTL 24h"],
          [<Code>app/services/prompt.py</Code>, "PromptBuilderService: build_system_prompt + format_llm_messages"],
          [<Code>app/models/chatbot.py</Code>, "Pydantic: ChatRequest, EscalationRequest, ChatMessageResponse"],
          [<Code>app/core/config.py</Code>, "ChatbotSettings: PORT 8002, INTENT/SENTIMENT_MODEL_NAME, SEARCH_SERVICE_URL, ESCALATION_WEBHOOK_URL"],
        ]}
        columnAlign={["left","left"]}
      />
    </Stack>
  );
}

// ─── TAB 6: TÍCH HỢP HỆ THỐNG ────────────────────────────────────────────────

function IntegTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Tích hợp thực tế trong dự án AuraTech</H2>
        <Text tone="secondary">
          chatbot-service là 1 trong 4 microservice AI (FastAPI), join network Docker <Code>be_ecommerce-network</Code>.
          Mọi request đi qua API Gateway :8080 (xác thực JWT Keycloak, inject <Code>X-User-Id</Code>).
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value=":8002" label="chatbot-service port" tone="info" />
        <Stat value=":8001" label="search-service (RAG)" tone="info" />
        <Stat value="Redis" label="Chat memory" tone="success" />
        <Stat value="Gemini" label="LLM primary" tone="success" />
      </Grid>

      <H3>Bản đồ tích hợp</H3>
      <Table
        headers={["Thành phần", "Giá trị thực tế", "Ghi chú"]}
        striped
        rows={[
          ["Service / Port", "AI/chatbot-service — FastAPI :8002", "Dockerfile + requirements riêng, dùng shared-common"],
          ["Gateway path", "/api/v1/chatbot/** (+ /api/v1/public/chatbot/**)", "Circuit breaker ai-engine-cb (30s), Redis rate limit"],
          ["Auth", "Đọc header X-User-Id (Keycloak UUID string)", "JWT chỉ verify ở gateway; service KHÔNG parse JWT"],
          ["RAG retrieval", "GET http://ai-search-service:8001/api/v1/search?q=&amp;top_k=3", "Env SEARCH_SERVICE_URL; chatbot không tự embed sản phẩm"],
          ["Chat memory", "Redis (infra-redis) — key chat:{session_id}:history", "LPUSH/LTRIM 20, TTL 24h"],
          ["User/Order data", "user-service + order-service (MariaDB) — cần bổ sung", "Cá nhân hóa prompt & order_tracking theo X-User-Id"],
          ["LLM", "Gemini 1.5 Flash (GEMINI_API_KEY)", "OpenAI/Groq optional; không key → mock generator"],
        ]}
        columnAlign={["left","left","left"]}
      />

      <H3>Frontend tiêu thụ API</H3>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Khách hàng</Pill>}>AIChatbotWidget.jsx</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">
                <Code>features/chatbot/components/AIChatbotWidget.jsx</Code> — widget chat toàn cục, hỗ trợ upload ảnh và escalation.
              </Text>
              <Text tone="secondary" size="small">
                Gọi qua <Code>aiApi.sendMessage(message, image, sessionId)</Code> → <Code>POST /chatbot/message</Code>
                {" "}và <Code>aiApi.escalateSession(sessionId)</Code> → <Code>POST /chatbot/escalate</Code>.
              </Text>
              <Callout tone="warning" title="Escalation hiện mock ở FE">
                FE đang mô phỏng escalation qua localStorage. Cần để backend <Code>/chatbot/escalate</Code> thật điều khiển
                (bắn webhook + cập nhật trạng thái session cho staff).
              </Callout>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill tone="neutral" size="sm">Nhân viên</Pill>}>SupportChatTab.jsx</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text tone="secondary" size="small">
                <Code>features/admin/.../SupportChatTab.jsx</Code> — giao diện staff tiếp nhận session được escalate,
                xem lịch sử và trả lời khách trực tiếp.
              </Text>
              <Text tone="secondary" size="small">
                Nguồn hàng đợi: khi backend escalation hoạt động thật → đọc từ MariaDB <Code>chat_sessions</Code>
                (status = escalated) thay vì localStorage.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Lỗi wiring FE cần lưu ý (căn chỉnh khi backend thật)</H3>
      <Table
        headers={["Vấn đề", "Hiện trạng", "Đề xuất"]}
        striped
        rows={[
          ["Double-unwrap .data", "aiApi đọc response.data nhưng apiClient đã unwrap .data (đang bị mock catch che)", "Chuẩn hóa 1 tầng unwrap khi backend trả envelope thật"],
          ["Định danh user", "ChatRequest.user_id là Optional[int]", "Đổi sang đọc X-User-Id (UUID string) do gateway inject"],
          ["intent trả về từ mock", "Mock FE dùng 'qa_policy'/'greeting'/'escalate'", "Đồng bộ 6 intent chuẩn của backend (policy_faq, general_chat...)"],
          ["Ảnh trong body", "FE gửi image (base64/URL) trong /chatbot/message", "BE cần nhận & gọi search-service visual search (:8001) — cần bổ sung"],
        ]}
        columnAlign={["left","left","left"]}
      />

      <Callout tone="info" title="Tóm tắt cho hội đồng">
        Kiến trúc đã đúng hướng microservice: chatbot điều phối (intent → sentiment → retrieval qua search-service → prompt → Gemini SSE),
        state hội thoại ở Redis, định danh qua X-User-Id tại gateway. Phần "cần bổ sung": thay heuristic bằng PhoBERT thật,
        persist MariaDB, nối webhook escalation, visual search qua ảnh, và cá nhân hóa hồ sơ khách.
      </Callout>
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
          <H1>Chatbot AI — Tư vấn sản phẩm thông minh (AuraTech)</H1>
          <Text tone="secondary">
            RAG · Intent (PhoBERT) · Sentiment (PhoBERT) · Redis Memory · Gemini 1.5 Flash SSE · Escalation · search-service :8001
          </Text>
        </Stack>
        <Row gap={8} wrap>
          {TABS.map(t => <Pill key={t.id} active={t.id === activeTab} onClick={() => setActiveTab(t.id)}>{t.label}</Pill>)}
        </Row>
        <Grid columns={5} gap={8}>
          <Stat value=":8002" label="chatbot-service" tone="info" />
          <Stat value="6" label="Intent classes" tone="warning" />
          <Stat value="PhoBERT" label="Sentiment model" tone="success" />
          <Stat value="Gemini" label="LLM primary" tone="success" />
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
        {activeTab === "integ"     && <IntegTab />}
      </Stack>
    </Stack>
  );
}
