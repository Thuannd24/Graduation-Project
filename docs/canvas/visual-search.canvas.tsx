/**
 * Visual Search — Tài liệu kỹ thuật đầy đủ
 * Tab 1: Tổng quan & Dữ liệu
 * Tab 2: YOLO v8 — Phát hiện & Crop sản phẩm
 * Tab 3: Image Encoder — DINOv2 / CLIP / EfficientNet
 * Tab 4: FAISS Index & Serving
 * Tab 5: Đánh giá & Tích hợp hệ thống
 */
import {
  Stack, Row, Grid, H1, H2, H3, Text, Card, CardHeader, CardBody,
  Pill, Stat, Table, Callout, Divider, Code,
  useHostTheme, useCanvasState
} from "cursor/canvas";

const TABS = [
  { id: "overview", label: "1. Tổng quan & Dữ liệu" },
  { id: "yolo",     label: "2. YOLO v8 — Crop" },
  { id: "encoder",  label: "3. Image Encoder" },
  { id: "faiss",    label: "4. FAISS & Serving" },
  { id: "eval",     label: "5. Đánh giá & Tích hợp" },
];

function Tag({ label, tone }: { label: string; tone?: "info"|"success"|"warning"|"neutral" }) {
  return <Pill tone={tone ?? "info"} size="sm">{label}</Pill>;
}

// ─── TAB 1: TỔNG QUAN & DỮ LIỆU ─────────────────────────────────────────────

function OverviewTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Visual Search — Tìm sản phẩm bằng hình ảnh</H2>
        <Text tone="secondary">
          User chụp ảnh hoặc upload ảnh sản phẩm muốn tìm → hệ thống trả về các sản phẩm
          tương tự trong catalog. Không cần biết tên, không cần gõ từ khóa.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="2" label="Bước chính" />
        <Stat value="YOLO" label="Bước 1: Detect & Crop" tone="warning" />
        <Stat value="CLIP" label="Bước 2: Encode vector" tone="info" />
        <Stat value="FAISS" label="Bước 3: ANN Search" tone="success" />
      </Grid>

      <H3>Pipeline tổng thể</H3>
      <Table
        headers={["Bước", "Thành phần", "Input", "Output", "Thời gian"]}
        striped
        rows={[
          ["1", <Text weight="bold">YOLO v8 — Detect</Text>, "Ảnh gốc từ user", "Bounding box quanh sản phẩm", "~30ms"],
          ["2", <Text weight="bold">YOLO v8 — Crop</Text>, "Ảnh gốc + bounding box", "Ảnh sản phẩm đã crop", "~5ms"],
          ["3", <Text weight="bold">Image Encoder — Embed</Text>, "Ảnh đã crop (224×224)", "Vector 512-dim hoặc 768-dim", "~50ms"],
          ["4", <Text weight="bold">FAISS — Search</Text>, "Query vector", "Top-K item_id + distance", "~5ms"],
          ["5", <Text weight="bold">Metadata fetch</Text>, "Top-K item_id", "Tên, giá, ảnh sản phẩm", "~10ms"],
        ]}
        columnAlign={["center","left","left","left","center"]}
      />

      <H3>Dữ liệu cần chuẩn bị</H3>
      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill tone="warning" size="sm">Bắt buộc</Pill>}>Ảnh sản phẩm trong catalog</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Table
                framed={false} striped
                headers={["Yêu cầu", "Giá trị"]}
                rows={[
                  ["Số lượng tối thiểu", "500 sản phẩm, 1–5 ảnh/sản phẩm"],
                  ["Độ phân giải", "Tối thiểu 512×512px"],
                  ["Định dạng", "JPG hoặc PNG, RGB"],
                  ["Nền ảnh", "Nền trắng tốt nhất (studio shot)"],
                  ["Lưu trữ", "S3 / MinIO / local disk"],
                ]}
                columnAlign={["left","left"]}
              />
              <Text size="small" tone="tertiary">Mỗi sản phẩm nên có nhiều góc chụp: trước, sau, nghiêng. Cải thiện recall đáng kể.</Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Để train YOLO</Pill>}>Annotation cho YOLO (nếu cần)</CardHeader>
          <CardBody>
            <Stack gap={10}>
              <Text tone="secondary" size="small">
                YOLO v8 pretrained (COCO) có thể detect được hầu hết sản phẩm phổ biến (quần áo, điện thoại, túi xách) mà <Text weight="semibold" as="span">không cần fine-tune</Text>.
                Chỉ cần annotation khi sản phẩm rất đặc thù (linh kiện điện tử, mỹ phẩm lạ).
              </Text>
              <Table
                framed={false} striped
                headers={["Thông tin", "Giá trị"]}
                rows={[
                  ["Số ảnh annotation", "300–1.000 ảnh là đủ"],
                  ["Định dạng", "YOLO format (.txt, normalized xywh)"],
                  ["Tool annotation", "Roboflow (miễn phí), LabelImg"],
                  ["Cấu trúc file", "images/ + labels/ + data.yaml"],
                ]}
                columnAlign={["left","left"]}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader>data.yaml — file cấu hình dataset cho YOLO</CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Code>path: ./dataset</Code>
            <Code>train: images/train</Code>
            <Code>val: images/val</Code>
            <Code>nc: 1  # số class (product)</Code>
            <Code>names: ['product']</Code>
            <Text size="small" tone="secondary">Chỉ cần 1 class "product" — không cần phân biệt loại sản phẩm vì YOLO chỉ làm nhiệm vụ crop.</Text>
          </Stack>
        </CardBody>
      </Card>

      <H3>Cấu trúc thư mục dự án</H3>
      <Table
        headers={["Thư mục / File", "Nội dung"]}
        striped
        rows={[
          [<Code>data/products/images/</Code>, "Toàn bộ ảnh sản phẩm trong catalog, tên file = item_id"],
          [<Code>data/products/metadata.json</Code>, "Map item_id → {name, price, category, img_url}"],
          [<Code>data/yolo_dataset/</Code>, "images/ + labels/ + data.yaml cho YOLO fine-tune"],
          [<Code>models/yolo_product.pt</Code>, "YOLO v8 weights (pretrained hoặc fine-tuned)"],
          [<Code>models/encoder_best.pth</Code>, "Image encoder checkpoint tốt nhất"],
          [<Code>models/item_index.faiss</Code>, "FAISS index toàn bộ ảnh catalog"],
          [<Code>models/idx2item.json</Code>, "Map FAISS index → item_id"],
          [<Code>scripts/build_index.py</Code>, "Script encode catalog + build FAISS (chạy 1 lần)"],
          [<Code>scripts/evaluate.py</Code>, "Script tính Recall@K, mAP trên test set"],
        ]}
        columnAlign={["left","left"]}
      />
    </Stack>
  );
}

// ─── TAB 2: YOLO v8 ──────────────────────────────────────────────────────────

function YoloTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>YOLO v8 — Phát hiện và Crop sản phẩm</H2>
        <Text tone="secondary">
          Bước tiền xử lý quan trọng: tách vùng sản phẩm khỏi nền ảnh.
          Nếu bỏ qua bước này, encoder sẽ nhầm feature của background (sàn nhà, bàn) thành feature sản phẩm.
        </Text>
      </Stack>

      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill tone="success" size="sm">Ưu tiên dùng</Pill>}>YOLO v8 Pretrained (COCO)</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                YOLOv8 pretrained trên COCO có 80 classes, bao gồm: person, backpack, handbag, cell phone, laptop, bottle, cup...
                Với hầu hết e-commerce catalog, pretrained weights detect được không cần train thêm.
              </Text>
              <Stack gap={4}>
                <Text weight="semibold" size="small">Model variants:</Text>
                <Table
                  framed={false} striped
                  headers={["Variant", "Size", "mAP", "Speed", "Dùng khi"]}
                  rows={[
                    ["YOLOv8n", "3.2MB",  "37.3", "&lt; 1ms/img",  "Thiết bị yếu, mobile"],
                    ["YOLOv8s", "11.2MB", "44.9", "~2ms/img",    "Production cân bằng"],
                    [<Text weight="bold">YOLOv8m</Text>, "25.9MB", "50.2", "~5ms/img", <Text weight="semibold">Khuyến nghị</Text>],
                    ["YOLOv8l", "43.7MB", "52.9", "~10ms/img",   "Accuracy cao nhất"],
                  ]}
                  columnAlign={["left","right","right","right","left"]}
                />
              </Stack>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill tone="info" size="sm">Khi cần fine-tune</Pill>}>Fine-tune YOLO cho sản phẩm đặc thù</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text tone="secondary" size="small">
                Cần fine-tune khi: sản phẩm không có trong COCO (linh kiện điện tử, thực phẩm đặc thù, đồ handmade) hoặc cần bounding box chính xác hơn.
              </Text>
              <Table
                framed={false} striped
                headers={["Param", "Giá trị"]}
                rows={[
                  [<Code>model</Code>,    "yolov8m.pt (pretrained)"],
                  [<Code>data</Code>,     "data.yaml"],
                  [<Code>epochs</Code>,   "50–100"],
                  [<Code>imgsz</Code>,    "640"],
                  [<Code>batch</Code>,    "16"],
                  [<Code>lr0</Code>,      "0.01"],
                  [<Code>freeze</Code>,   "10 (freeze 10 layers đầu)"],
                ]}
                columnAlign={["left","right"]}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H3>Crop pipeline — từng bước code</H3>
      <Card>
        <CardHeader>Inference + Crop logic</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 1</Pill><Text weight="semibold">Load model và inference</Text></Row>
              <Text tone="secondary" size="small">
                <Code>from ultralytics import YOLO; model = YOLO("yolov8m.pt")</Code>.
                <Code>results = model(image, conf=0.25, iou=0.45)</Code>.
                <Code>conf=0.25</Code>: ngưỡng confidence. <Code>iou=0.45</Code>: NMS threshold.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 2</Pill><Text weight="semibold">Lấy bounding box lớn nhất (main product)</Text></Row>
              <Text tone="secondary" size="small">
                Nếu detect nhiều objects, lấy bbox có area lớn nhất (sản phẩm chính).
                <Code>boxes = results[0].boxes.xyxy.numpy()</Code> → shape (N, 4) dạng [x1, y1, x2, y2].
                Sort by area: <Code>areas = (boxes[:,2]-boxes[:,0]) * (boxes[:,3]-boxes[:,1])</Code>, lấy index max.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 3</Pill><Text weight="semibold">Crop với padding</Text></Row>
              <Text tone="secondary" size="small">
                Thêm padding 10% vào mỗi cạnh để tránh cắt mất viền sản phẩm.
                <Code>x1, y1, x2, y2 = box; pad = 0.1</Code>.
                <Code>w, h = x2-x1, y2-y1</Code>.
                Crop: <Code>image[max(0,y1-pad*h):y2+pad*h, max(0,x1-pad*w):x2+pad*w]</Code>.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">Bước 4</Pill><Text weight="semibold">Fallback khi không detect được</Text></Row>
              <Text tone="secondary" size="small">
                Nếu YOLO không detect object nào (conf &lt; threshold): dùng toàn bộ ảnh gốc.
                Center crop 90% để loại bỏ viền không cần thiết.
                Log lại để xem xét thêm annotation cho edge cases.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Augmentation khi build catalog index</H3>
      <Table
        headers={["Augmentation", "Thư viện", "Mục đích", "Áp dụng khi"]}
        striped
        rows={[
          ["Horizontal flip",         "Albumentations", "Tìm được sản phẩm cùng kiểu nhưng chụp từ bên kia",   "Build index"],
          ["Brightness/Contrast ±20%","Albumentations", "Tìm được sản phẩm dù ảnh user chụp sáng/tối khác",   "Build index"],
          ["Random crop 85–100%",     "Albumentations", "Tìm được dù ảnh user chụp không full sản phẩm",       "Build index"],
          ["Color jitter",            "torchvision",    "Tìm được sản phẩm dù màu sắc hơi lệch",               "Fine-tune encoder"],
        ]}
        columnAlign={["left","left","left","left"]}
      />

      <Callout tone="success" title="Mẹo tăng chất lượng crop">
        Với ảnh catalog chuẩn (nền trắng, 1 sản phẩm), có thể bỏ qua YOLO và dùng
        <Text weight="semibold" as="span"> center crop 80%</Text> + <Text weight="semibold" as="span">remove background</Text>
        bằng <Code>rembg</Code> library. Nhanh hơn 3x và kết quả tốt hơn với studio photos.
        YOLO chỉ thực sự cần với ảnh do user chụp trong môi trường thực (nhiều vật thể, nền lộn xộn).
      </Callout>
    </Stack>
  );
}

// ─── TAB 3: IMAGE ENCODER ────────────────────────────────────────────────────

function EncoderTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Image Encoder — So sánh 3 model</H2>
        <Text tone="secondary">
          Chuyển ảnh sản phẩm thành vector số. Train cả 3 model trên cùng tập dữ liệu,
          đánh giá bằng Recall@10, chọn model tốt nhất để build FAISS index.
        </Text>
      </Stack>

      <H3>So sánh 3 model</H3>
      <Table
        headers={["Model", "Kiến trúc", "Vector dim", "Ưu điểm", "Hạn chế", "Khuyến nghị"]}
        striped
        rows={[
          [
            <Text weight="bold">CLIP (ViT-B/32)</Text>,
            "Vision-Language Transformer",
            "512-dim",
            "Encode cả ảnh VÀ text cùng không gian. Hỗ trợ query 'tìm ảnh này màu đỏ'. Pretrained cực mạnh.",
            "Nặng hơn EfficientNet. Tối ưu cho image-text matching, không chuyên product retrieval.",
            <Pill tone="success" size="sm">Khuyến nghị nếu cần multi-modal</Pill>,
          ],
          [
            <Text weight="bold">DINOv2 (ViT-S/14)</Text>,
            "Self-supervised ViT",
            "384-dim",
            "Feature chất lượng rất cao cho image retrieval. Self-supervised → không cần label. Fine-tune tốt.",
            "Chỉ encode ảnh. Không hỗ trợ text query trực tiếp.",
            <Pill tone="info" size="sm">Khuyến nghị nếu image-only</Pill>,
          ],
          [
            "EfficientNet-B3",
            "CNN (Supervised)",
            "1536-dim (avg pool)",
            "Nhẹ nhất, nhanh nhất. Dễ fine-tune với dữ liệu nhỏ (&gt; 500 ảnh).",
            "Feature yếu hơn transformer. Kém với sản phẩm phức tạp.",
            <Pill tone="neutral" size="sm">Baseline / thiết bị yếu</Pill>,
          ],
        ]}
        rowTone={["success", "info", undefined]}
        columnAlign={["left","left","center","left","left","left"]}
      />

      <H3>Cách train / fine-tune từng model</H3>

      <Card collapsible defaultOpen>
        <CardHeader trailing={<Pill tone="success" size="sm">Train trước</Pill>}>CLIP — Dùng pretrained, không cần train thêm nhiều</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Callout tone="info" title="Zero-shot — dùng ngay không cần train">
              CLIP pretrained (openai/clip-vit-base-patch32) có thể encode ảnh sản phẩm ngay.
              Zero-shot performance thường đã đạt Recall@10 ~70% với catalog phổ biến.
            </Callout>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Nếu muốn fine-tune CLIP</Text>
                <Table
                  framed={false} striped
                  headers={["Param", "Giá trị"]}
                  rows={[
                    [<Code>batch_size</Code>,   "64"],
                    [<Code>lr</Code>,           "1e-5 (rất nhỏ)"],
                    [<Code>epochs</Code>,        "5–10"],
                    [<Code>loss</Code>,          "Contrastive (InfoNCE)"],
                    [<Code>freeze_text</Code>,   "True (chỉ train vision)"],
                  ]}
                  columnAlign={["left","right"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Multi-modal query (điểm mạnh độc đáo)</Text>
                <Text tone="secondary" size="small">
                  Query bằng ảnh + text: encode ảnh = vec_img, encode text = vec_txt.
                  Query vector = 0.7 × vec_img + 0.3 × vec_txt (weighted sum).
                  Ví dụ: ảnh chiếc áo + text "màu xanh" → tìm áo tương tự màu xanh.
                </Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <Card collapsible defaultOpen={false}>
        <CardHeader>DINOv2 — Fine-tune với Triplet Loss</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Hyperparameters fine-tune</Text>
                <Table
                  framed={false} striped
                  headers={["Param", "Giá trị"]}
                  rows={[
                    [<Code>model</Code>,         "dinov2_vits14 (nhỏ nhất)"],
                    [<Code>batch_size</Code>,    "32 triplets"],
                    [<Code>lr</Code>,            "1e-4"],
                    [<Code>epochs</Code>,        "20–30"],
                    [<Code>loss</Code>,          "TripletMarginLoss (margin=0.3)"],
                    [<Code>optimizer</Code>,     "AdamW"],
                    [<Code>scheduler</Code>,     "CosineAnnealingLR"],
                    [<Code>freeze_layers</Code>, "Freeze 8/12 blocks đầu"],
                  ]}
                  columnAlign={["left","right"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Triplet Mining — cách tạo training data</Text>
                <Text tone="secondary" size="small">
                  Mỗi triplet gồm: <Text weight="bold" as="span">Anchor</Text> (ảnh sản phẩm A), <Text weight="bold" as="span">Positive</Text> (ảnh khác của cùng sản phẩm A hoặc cùng model), <Text weight="bold" as="span">Negative</Text> (ảnh sản phẩm khác category).
                </Text>
                <Text tone="secondary" size="small">
                  Hard negative mining: chọn negative có vector gần anchor nhất (khó phân biệt nhất). Cải thiện training hiệu quả hơn random negative.
                </Text>
                <Text tone="secondary" size="small">
                  Không cần annotation phức tạp — chỉ cần biết item_id. Cùng item_id = positive.
                </Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <Card collapsible defaultOpen={false}>
        <CardHeader>EfficientNet-B3 — Fine-tune nhanh nhất</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Grid columns={2} gap={12}>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Hyperparameters</Text>
                <Table
                  framed={false} striped
                  headers={["Param", "Giá trị"]}
                  rows={[
                    [<Code>backbone</Code>,     "efficientnet_b3 (pretrained ImageNet)"],
                    [<Code>head</Code>,         "GlobalAvgPool → L2Norm"],
                    [<Code>embedding_dim</Code>,"256 (sau projection layer)"],
                    [<Code>batch_size</Code>,   "64"],
                    [<Code>lr</Code>,           "1e-3"],
                    [<Code>loss</Code>,         "ArcFace hoặc TripletMargin"],
                    [<Code>epochs</Code>,       "30"],
                    [<Code>freeze</Code>,       "Unfreeze dần từ cuối"],
                  ]}
                  columnAlign={["left","right"]}
                />
              </Stack>
              <Stack gap={6}>
                <Text weight="semibold" size="small">Khi nào dùng EfficientNet thay CLIP/DINOv2?</Text>
                <Text tone="secondary" size="small">Máy không có GPU đủ mạnh cho ViT. Cần inference nhanh trên CPU. Catalog đơn giản (nền trắng, 1 sản phẩm). Training data ít (&lt; 2.000 ảnh).</Text>
              </Stack>
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      <H3>Script build_index.py — encode toàn bộ catalog</H3>
      <Card>
        <CardHeader>Chạy 1 lần sau khi có model tốt nhất</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text tone="secondary" size="small">1. Load model encoder (CLIP / DINOv2 / EfficientNet).</Text>
            <Text tone="secondary" size="small">2. Đọc toàn bộ ảnh trong <Code>data/products/images/</Code>. Batch size 64.</Text>
            <Text tone="secondary" size="small">3. Preprocess: resize 224×224 (hoặc 336×336 cho DINOv2), normalize theo mean/std của model.</Text>
            <Text tone="secondary" size="small">4. <Code>model.eval(); torch.no_grad()</Code> → encode → L2 normalize → append vào list.</Text>
            <Text tone="secondary" size="small">5. Stack thành numpy array shape (N, D). Build <Code>faiss.IndexFlatIP(D)</Code>. Add embeddings.</Text>
            <Text tone="secondary" size="small">6. Lưu: <Code>faiss.write_index(index, "item_index.faiss")</Code> + <Code>json.dump({"{"}"idx": item_ids{"}"}, f)</Code>.</Text>
            <Callout tone="info" title="Cập nhật incremental khi thêm sản phẩm mới">
              Thay vì rebuild toàn bộ index: encode ảnh mới → <Code>index.add(new_embedding)</Code> → save lại.
              Với IndexFlatIP, add() không cần rebuild. Với IndexIVFFlat, cần retrain index định kỳ.
            </Callout>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── TAB 4: FAISS & SERVING ───────────────────────────────────────────────────

function FaissTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>FAISS Index & Serving</H2>
        <Text tone="secondary">
          FAISS tìm K ảnh sản phẩm gần nhất với query vector trong &lt; 10ms dù catalog có 1 triệu sản phẩm.
        </Text>
      </Stack>

      <H3>Chọn loại FAISS Index phù hợp</H3>
      <Table
        headers={["Index type", "Chính xác", "Tốc độ", "RAM", "Dùng khi"]}
        striped
        rows={[
          [<Text weight="bold">IndexFlatIP</Text>, <Pill tone="success" size="sm">100% exact</Pill>, <Pill tone="info" size="sm">O(N)</Pill>, "Thấp", "Catalog &lt; 50k sản phẩm (khuyến nghị cho đồ án)"],
          [<Text weight="bold">IndexIVFFlat</Text>, <Pill tone="info" size="sm">~95% recall</Pill>, <Pill tone="success" size="sm">O(√N)</Pill>, "Thấp", "Catalog 50k–500k, cần nhanh hơn"],
          ["IndexHNSW32", <Pill tone="info" size="sm">~96% recall</Pill>, <Pill tone="success" size="sm">O(log N)</Pill>, "Cao", "Catalog &gt; 500k, cần latency cực thấp"],
          ["IndexPQ", <Pill tone="warning" size="sm">~90% recall</Pill>, <Pill tone="success" size="sm">Nhanh nhất</Pill>, "Cực thấp", "RAM bị giới hạn, catalog lớn"],
        ]}
        rowTone={["success", undefined, undefined, undefined]}
        columnAlign={["left","center","center","center","left"]}
      />

      <H3>API Endpoints cho Visual Search</H3>
      <Table
        headers={["Endpoint", "Method", "Input", "Output", "Latency"]}
        striped
        rows={[
          [<Code>/search/image</Code>, <Pill tone="warning" size="sm">POST</Pill>, "multipart/form-data: image file", <Code>{"{ items: [{id, name, price, img, score}], crop_box }"}</Code>, "&lt; 200ms"],
          [<Code>/search/image/url</Code>, <Pill tone="warning" size="sm">POST</Pill>, <Code>{"{ image_url: string }"}</Code>, "Như trên", "&lt; 300ms"],
          [<Code>/search/multimodal</Code>, <Pill tone="warning" size="sm">POST</Pill>, "image file + text query", "Items tìm kiếm multi-modal", "&lt; 250ms"],
          [<Code>/items/{"{id}"}/similar</Code>, <Pill tone="info" size="sm">GET</Pill>, "item_id", "K items tương tự (pre-computed)", "&lt; 20ms"],
        ]}
        columnAlign={["left","center","left","left","center"]}
      />

      <H3>Inference service — logic chi tiết</H3>
      <Card>
        <CardHeader>POST /search/image — từng bước xử lý</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">1</Pill><Text weight="semibold">Validate và decode ảnh</Text></Row>
              <Text tone="secondary" size="small">
                Kiểm tra định dạng (JPG/PNG), kích thước tối thiểu (128×128), size file tối đa (10MB).
                Decode bằng PIL: <Code>image = Image.open(BytesIO(file_bytes)).convert("RGB")</Code>.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">2</Pill><Text weight="semibold">YOLO detect và crop</Text></Row>
              <Text tone="secondary" size="small">
                Chạy YOLO, lấy bbox lớn nhất, crop với padding 10%.
                Nếu không detect: fallback center crop. Log confidence score.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">3</Pill><Text weight="semibold">Encode với Image Encoder</Text></Row>
              <Text tone="secondary" size="small">
                Preprocess: resize, normalize theo mean/std của model.
                <Code>model.encode_image(tensor.unsqueeze(0)).squeeze().cpu().numpy()</Code>.
                L2 normalize: <Code>vec /= np.linalg.norm(vec)</Code>.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">4</Pill><Text weight="semibold">FAISS search</Text></Row>
              <Text tone="secondary" size="small">
                <Code>distances, indices = index.search(vec.reshape(1,-1), k=20)</Code>.
                Map indices → item_ids qua idx2item. Filter item hết hàng (stock=0).
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Row gap={6} align="center"><Pill tone="neutral" size="sm">5</Pill><Text weight="semibold">Fetch metadata và trả về</Text></Row>
              <Text tone="secondary" size="small">
                Batch fetch từ Redis (cache metadata) hoặc PostgreSQL.
                Convert distance → score: <Code>score = (1 + distance) / 2</Code> cho Inner Product (đã normalize).
                Trả về top-10, kèm crop_box để frontend hiển thị vùng đã detect.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Grid columns={2} gap={12}>
        <Callout tone="info" title="Pre-compute item-to-item similarity">
          Offline: với mỗi item trong catalog, tìm sẵn top-20 similar items.
          Lưu vào PostgreSQL bảng <Code>item_similarities</Code>.
          GET /items/{"{id}"}/similar trả về từ cache này — &lt; 20ms, không cần FAISS real-time.
        </Callout>
        <Callout tone="warning" title="Model serving — tránh load lại mỗi request">
          Load YOLO model, encoder model, FAISS index vào RAM 1 lần khi server start.
          Dùng <Code>@app.on_event("startup")</Code> trong FastAPI. Tổng RAM cần: ~2GB (CLIP + YOLO + index 100k items).
        </Callout>
      </Grid>
    </Stack>
  );
}

// ─── TAB 5: ĐÁNH GIÁ & TÍCH HỢP ─────────────────────────────────────────────

function EvalTab() {
  return (
    <Stack gap={28}>
      <Stack gap={8}>
        <H2>Đánh giá & Tích hợp UI</H2>
        <Text tone="secondary">
          Metrics đánh giá chất lượng search + cách tích hợp vào giao diện người dùng.
        </Text>
      </Stack>

      <H3>Metrics đánh giá Visual Search</H3>
      <Table
        headers={["Metric", "Công thức", "Ngưỡng tốt", "Ưu tiên"]}
        striped
        rows={[
          [<Text weight="bold">Recall@K</Text>, "Số ảnh đúng trong top-K / tổng ảnh đúng. Với K=1,5,10,20.", "R@10 &gt; 0.70", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          [<Text weight="bold">mAP (mean Average Precision)</Text>, "Diện tích dưới Precision-Recall curve. Đánh giá cả ranking.", "mAP@10 &gt; 0.60", <Pill tone="warning" size="sm">Bắt buộc</Pill>],
          ["Precision@K", "Trong top-K, bao nhiêu % là đúng category.", "P@10 &gt; 0.65", <Pill tone="info" size="sm">Thêm điểm</Pill>],
          ["NDCG@K", "Xếp hạng có trọng số — item đúng ở rank cao hơn quan trọng hơn.", "NDCG@10 &gt; 0.55", <Pill tone="info" size="sm">Thêm điểm</Pill>],
          ["Latency P95", "95th percentile end-to-end response time.", "&lt; 300ms", <Pill tone="neutral" size="sm">Non-functional</Pill>],
        ]}
        columnAlign={["left","left","center","center"]}
      />

      <H3>Cách tạo test set để evaluate</H3>
      <Card>
        <CardHeader>Ground truth dataset</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Stack gap={4}>
              <Text weight="semibold">Phương pháp 1 — Dùng chính ảnh catalog làm query (đơn giản nhất)</Text>
              <Text tone="secondary" size="small">
                Lấy 200 ảnh ngẫu nhiên từ catalog làm query. Ground truth = tất cả ảnh của cùng item_id.
                Query 1 ảnh → tìm các ảnh khác của cùng sản phẩm trong index.
                Không cần label thủ công — dùng item_id làm nhãn.
              </Text>
            </Stack>
            <Divider />
            <Stack gap={4}>
              <Text weight="semibold">Phương pháp 2 — Ảnh do user chụp (thực tế hơn)</Text>
              <Text tone="secondary" size="small">
                Thu thập 100–200 ảnh chụp thực tế (điện thoại, nhiều góc, ánh sáng khác nhau).
                Gán nhãn thủ công: ảnh này thuộc item_id nào.
                Đây là test set khó hơn và phản ánh real-world performance tốt hơn.
              </Text>
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <H3>Vị trí tích hợp trên UI</H3>
      <Table
        headers={["Vị trí", "Tính năng", "UX flow"]}
        striped
        rows={[
          ["Thanh tìm kiếm", "Nút camera bên cạnh search bar", "Click camera → chọn ảnh → kết quả hiện ngay"],
          ["Trang sản phẩm", "'Tìm sản phẩm tương tự bằng ảnh'", "Drag & drop ảnh → popup kết quả"],
          ["Chatbot", "Gửi ảnh trong chat", "Chatbot nhận ảnh → gọi /search/image → trả về kết quả trong chat"],
          ["Mobile app", "Chụp ảnh trực tiếp từ camera", "Permission → chụp → nhận diện ngay"],
        ]}
        columnAlign={["left","left","left"]}
      />

      <H3>So sánh kết quả 3 model trên cùng test set</H3>
      <Table
        headers={["Model", "Recall@5", "Recall@10", "mAP@10", "Latency", "Kết luận"]}
        striped
        rows={[
          [<Text weight="bold">CLIP ViT-B/32</Text>, "0.71", "0.83", "0.67", "~50ms", <Pill tone="success" size="sm">Best nếu có GPU</Pill>],
          ["DINOv2 ViT-S/14", "0.68", "0.80", "0.64", "~45ms", <Pill tone="info" size="sm">Tốt cho image-only</Pill>],
          ["EfficientNet-B3", "0.52", "0.67", "0.51", "~20ms", <Pill tone="neutral" size="sm">Baseline / CPU-friendly</Pill>],
        ]}
        rowTone={["success", undefined, undefined]}
        columnAlign={["left","center","center","center","center","left"]}
      />
      <Text tone="tertiary" size="small">Benchmark tham khảo. Kết quả thực tế phụ thuộc vào catalog và chất lượng ảnh.</Text>

      <Callout tone="success" title="Điểm cộng: Multi-modal search">
        Implement query <Text weight="semibold" as="span">"tìm ảnh này nhưng màu xanh"</Text>:
        encode ảnh query bằng CLIP → encode text "màu xanh" bằng CLIP text encoder →
        query_vec = 0.7 × img_vec + 0.3 × txt_vec → search FAISS.
        Tính năng này rất hiếm gặp trong đồ án, chắc chắn gây ấn tượng.
      </Callout>
    </Stack>
  );
}

export default function VisualSearch() {
  const theme = useHostTheme();
  const [activeTab, setActiveTab] = useCanvasState("vsTab", "overview");
  return (
    <Stack gap={0} style={{ minHeight: "100vh", background: theme.bg.editor }}>
      <Stack gap={16} style={{ padding: "24px 32px 0 32px" }}>
        <Stack gap={4}>
          <H1>Visual Search — Tìm sản phẩm bằng hình ảnh</H1>
          <Text tone="secondary">YOLO v8 → Image Encoder (CLIP / DINOv2) → FAISS → Top-K sản phẩm tương tự</Text>
        </Stack>
        <Row gap={8} wrap>
          {TABS.map(t => <Pill key={t.id} active={t.id === activeTab} onClick={() => setActiveTab(t.id)}>{t.label}</Pill>)}
        </Row>
        <Grid columns={5} gap={8}>
          <Stat value="YOLO v8" label="Detect & Crop" tone="warning" />
          <Stat value="CLIP" label="Best encoder" tone="info" />
          <Stat value="FAISS" label="ANN search" tone="success" />
          <Stat value="&lt;300ms" label="End-to-end" />
          <Stat value="R@10>70%" label="Target recall" tone="success" />
        </Grid>
        <Divider />
      </Stack>
      <Stack gap={0} style={{ padding: "24px 32px 48px 32px" }}>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "yolo"     && <YoloTab />}
        {activeTab === "encoder"  && <EncoderTab />}
        {activeTab === "faiss"    && <FaissTab />}
        {activeTab === "eval"     && <EvalTab />}
      </Stack>
    </Stack>
  );
}
