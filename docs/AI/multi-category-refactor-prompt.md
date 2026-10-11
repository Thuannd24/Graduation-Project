# PROMPT — Chuyển web từ "cửa hàng điện tử" sang "sàn TMĐT đa ngành hàng"

> Dán TOÀN BỘ file này cho agent thực thi. Viết cho agent làm theo từng bước, không cần tự suy luận
> phạm vi. Người soạn đã khảo sát trước (2026-09-30); danh sách dưới đây là KẾT QUẢ khảo sát, agent
> chỉ cần xác minh lại và làm đúng.

---

## 0. Bối cảnh (đọc kỹ, không bỏ qua)

- Repo: `D:\JAVA\Graduation-Project` (Windows 10; có Git Bash và PowerShell). Đồ án tốt nghiệp: web
  thương mại điện tử microservices. FE = React + Vite (`FE/`), BE = Spring Boot nhiều service (`BE/`),
  AI = FastAPI (`AI/`).
- Hiện tại FE được dựng như **cửa hàng chuyên đồ điện tử** (điện thoại, laptop, phụ kiện...). Chủ dự án
  đã **CHỐT: web là sàn TMĐT ĐA NGÀNH HÀNG** (kiểu Shopee/Tiki: thời trang, mỹ phẩm, nhà cửa, mẹ & bé,
  điện tử...).
- BE và AI **đã tổng quát** (thuộc tính động EAV, cây danh mục, biến thể) → gần như không phải sửa.
  Phần phải sửa chủ yếu ở **FE**: các chỗ ghi cứng tên/slug danh mục điện tử, mốc giá, chữ mô tả.
- Nguyên tắc thiết kế mục tiêu: **FE phải chạy đúng với BẤT KỲ cây danh mục nào lấy từ API**, không
  được ghi cứng tên danh mục cụ thể (kể cả tên danh mục đa ngành mới). Ngoại lệ duy nhất được phép:
  bảng từ khoá → icon (mục T7), vì đó chỉ là fallback hiển thị.
- Git: đang ở nhánh `feat/multi-category-catalog`. Làm việc trên nhánh này.

## 1. LUẬT BẮT BUỘC (vi phạm = làm hỏng dự án)

1. **KHÔNG** `git commit`, `git push`, `git reset`, `git checkout -- <file>`, `git clean`, `git stash`.
   Chỉ sửa file. Chủ dự án sẽ review rồi tự commit.
2. **KHÔNG xoá file nào.** Component không dùng nữa thì chỉ bỏ `import`/bỏ render, ghi tên file vào
   báo cáo mục "Có thể xoá — chờ duyệt".
3. **KHÔNG** đụng DB (không chạy SQL, không chạy tool seed/import/cleanup trong `tools/`).
4. **KHÔNG** đổi tên thương hiệu "AuraTech", không đổi màu/brand color, không đổi layout tổng thể.
5. **KHÔNG** đổi API công khai của BE (URL, tên field JSON). Không thêm dependency mới (npm/maven/pip).
6. **KHÔNG** sửa file trong các thư mục: `tools/`, `data/`, `AI/forecast-service/`, `AI/recs-service/`,
   `BE/keycloak-*`, `docs/` (trừ file báo cáo được yêu cầu ở mục 4), file `.env*`, `docker-compose*`.
7. **KHÔNG** sửa file `BE/order-service/src/main/java/com/ecommerce/orderservice/grpc/InventoryGrpcClient.java`
   (đang có thay đổi riêng của chủ dự án).
8. Mỗi thay đổi nhỏ, giữ nguyên style code xung quanh (thụt lề, dấu nháy, đặt tên, ngôn ngữ comment
   tiếng Việt). Không "refactor tiện tay" những gì không nằm trong danh sách task.
9. Gặp tình huống không có trong prompt → **dừng task đó, ghi vào báo cáo mục "Câu hỏi cho chủ dự
   án"**, làm tiếp task khác. Không tự đoán.

## 2. Bước 0 — Kiểm tra nền (trước khi sửa gì)

Chạy và ghi kết quả (đạt/lỗi + dòng lỗi) vào báo cáo:

```bash
cd /d/JAVA/Graduation-Project/FE && npm run build
cd /d/JAVA/Graduation-Project/BE && mvn -q -DskipTests compile -pl product-service,order-service -am
```

Nếu đã lỗi TRƯỚC khi sửa → ghi lại nguyên văn, KHÔNG sửa lỗi đó (không thuộc phạm vi), dùng làm mốc
so sánh ở bước cuối.

## 3. Bước 1 — Rà soát (audit), chưa sửa

### 3.1 Chạy đúng các lệnh tìm kiếm này (Git Bash, từ gốc repo)

```bash
grep -rniE "laptop|macbook|dien-thoai|điện thoại|iphone|ipad|tablet|máy tính bảng|phu-kien|phụ kiện|tai-nghe|tai nghe|smartwatch|đồng hồ|công nghệ|thiết bị|smartphone" FE/src --include=*.js --include=*.jsx --include=*.ts --include=*.tsx
grep -rnE "50000000|DEFAULT_MAX_PRICE|PRICE_PRESETS|LAPTOP_SPEC_FILTERS|SLUG_ALIASES|isLaptopCategory|matchesLegacyCategory|PHONE_BRANDS" FE/src
grep -rniE "warranty|bảo hành" FE/src BE --include=*.java --include=*.jsx --include=*.js
grep -rniE "laptop|điện thoại|iphone|bảo hành chính hãng|công nghệ" AI/chatbot-service/app
```

**Dương tính giả — BỎ QUA, không sửa:** `phone`/`phoneNumber`/`số điện thoại`/`sdt` (số điện thoại của
user/địa chỉ), `Serializer`/`serialization`, `sessionStorage`/`localStorage` (khớp chữ "storage"),
`cpu` trong `torch.load(map_location="cpu")`, icon Material `phone_iphone` dùng cho liên hệ/hotline.

### 3.2 Ghi kết quả vào `docs/canvas/multi-category-audit.md`

Bảng gồm cột: `File:dòng` | `Nội dung hiện tại (ngắn)` | `Loại` | `Cách xử lý` | `Task`.
- Loại **A** = bắt buộc sửa (ghi cứng ngành điện tử làm sai hành vi/giao diện với catalog đa ngành).
- Loại **B** = nên sửa (chữ mô tả, placeholder, dữ liệu mock hiển thị).
- Loại **C** = giữ nguyên (tổng quát sẵn / dương tính giả) — ghi lý do 1 dòng.
Mọi dòng tìm được ở 3.1 phải được xếp vào A/B/C. Dòng nào khớp 1 task ở mục 5 thì ghi mã task.

Danh sách đã biết trước (phải có mặt trong bảng; nếu tìm thấy thêm chỗ tương tự thì bổ sung):

| File | Vấn đề | Task |
|---|---|---|
| `FE/src/features/catalog/utils/categoryUtils.js` | `SLUG_ALIASES`, `LAPTOP_SPEC_FILTERS`, `PRICE_PRESETS` (tối đa 50 triệu), `isLaptopCategory`, `matchesLegacyCategory` | T1 |
| `FE/src/features/catalog/hooks/useCategoryFilters.js:4` | `DEFAULT_MAX_PRICE = 50000000` | T2 |
| `FE/src/features/catalog/pages/SearchPage.jsx:14` | `DEFAULT_MAX_PRICE = 50000000` riêng | T2 |
| `FE/src/features/catalog/components/category/FilterPanel.jsx:117-119` | ghi cứng `50000000` | T2 |
| `FE/src/features/catalog/components/CategorySidebar.jsx:103` | slider `max="50000000" step="1000000"` | T2 |
| `FE/src/features/catalog/components/category/ActiveFilterChips.jsx:3,31` | lấy nhãn từ `LAPTOP_SPEC_FILTERS` | T3 |
| `FE/src/features/catalog/pages/CategoryPage.jsx:29-31,159-161,195-197,337-340` | `categoryPromotions.laptop`, ưu tiên mở danh mục "laptop", lọc `matchesLegacyCategory` | T4 |
| `FE/src/features/catalog/pages/HomePage.jsx:259-267` | render 3 section điện tử | T5 |
| `FE/src/features/catalog/components/CategoryDualSection.jsx` | `PHONE_BRANDS`, `DEFAULT_TABS` điện thoại/máy tính bảng, link cứng `dien-thoai` | T5 |
| `FE/src/features/catalog/components/AccessoriesSection.jsx` | tìm danh mục "phụ kiện", loại trừ điện thoại/laptop | T5 |
| `FE/src/features/catalog/components/LaptopShowcaseSection.jsx` | tab mặc định màn hình/PC/phụ kiện máy tính, loại trừ điện thoại/laptop | T5 |
| `FE/src/components/common/Header.jsx:11-24` | `getCategoryIconFallback` chỉ có từ khoá điện tử | T7 |
| `FE/src/components/common/Footer.jsx:45` | "Hệ thống bán lẻ điện thoại, laptop, thiết bị công nghệ..." | T8 |
| `FE/src/features/chatbot/components/AIChatbotWidget.jsx:71-73` | gợi ý "Tư vấn iPhone", "Tìm laptop tầm trung" | T8 |
| `FE/src/features/admin/components/AddProductTab.jsx:32-33,207-208,283-284,640,1366` | bảo hành mặc định 12 tháng "chính hãng"; placeholder tag "smartphone, apple, ios" | T6, T8 |
| `FE/src/features/admin/components/AnalyticsAITab.jsx:57` | fallback tên "iPhone 15 Pro Max 256GB Titanium" | T8 |
| `FE/src/features/admin/components/CategoriesTab.jsx:1000` | placeholder "Thiết bị di động" | T8 |
| `FE/src/features/admin/components/SupportChatTab.jsx:18-60` | dữ liệu mock hội thoại iPhone/Macbook/Asus | T8 |
| `BE/order-service/.../service/impl/OrderServiceImpl.java:1449,1469` | bảo hành mặc định 12 tháng cho MỌI sản phẩm | T6 |
| `AI/chatbot-service/app/services/rag.py:76` | câu trả lời mock "bảo hành chính hãng" | T8 |
| `FE/src/features/catalog/components/ProductCard.jsx:40,192-196` | nhánh `variant === "laptop"` — KHÔNG có nơi nào truyền `variant="laptop"` | C (giữ, ghi "code chết, có thể dọn sau") |
| `BE/order-service/.../service/impl/CartServiceImpl.java:144` | `size` fallback `storage` | C (tổng quát: size quần áo / dung lượng máy) |
| `FE/src/features/catalog/pages/ProductDetailPage.jsx:392` | map mã thuộc tính → tên, lấy từ API | C (tổng quát sẵn) |

## 4. Bước 2 — Sửa theo từng task

Làm **đúng thứ tự T1 → T8**. Sau MỖI task: chạy `cd FE && npm run build` (task có sửa BE thì chạy
thêm lệnh mvn ở mục 2). Build lỗi do mình vừa sửa → sửa ngay trước khi sang task sau. Ghi vào báo cáo
mục "Nhật ký" 1–3 dòng/task: sửa file nào, build đạt/không.

### T1 — `FE/src/features/catalog/utils/categoryUtils.js`

1. **Xoá hằng `SLUG_ALIASES`** (dòng 1–11) và **khối fallback dùng nó** trong `resolveCategory`
   (dòng 76–86: `if (!cat) { const key = ...; const aliases = ...; cat = ... }`). Phần còn lại của
   `resolveCategory` giữ nguyên.
2. **Xoá hằng `LAPTOP_SPEC_FILTERS`** (dòng 21–26). (T3 sẽ sửa chỗ đang import nó.)
3. **Xoá hàm `isLaptopCategory`** (dòng 96–99) và **hàm `matchesLegacyCategory`** (dòng 101–146).
   (T4 sẽ sửa chỗ đang import chúng.)
4. **Thay `PRICE_PRESETS`** (dòng 13–19) bằng đúng khối sau, và thêm hằng `PRICE_MAX` ngay phía trên:

```js
// Mốc "không giới hạn" cho bộ lọc giá — sàn đa ngành có SP từ vài chục nghìn tới hàng chục triệu.
export const PRICE_MAX = 1000000000;

export const PRICE_PRESETS = [
  { label: "Tất cả", min: 0, max: PRICE_MAX },
  { label: "Dưới 200 nghìn", min: 0, max: 200000 },
  { label: "200 – 500 nghìn", min: 200000, max: 500000 },
  { label: "500 nghìn – 2 triệu", min: 500000, max: 2000000 },
  { label: "2 – 10 triệu", min: 2000000, max: 10000000 },
  { label: "Trên 10 triệu", min: 10000000, max: PRICE_MAX },
];
```

5. Giữ nguyên: `flattenCategories`, `getRootCategories`, `formatCategoryName`, `matchesSlugOrName`,
   `productMatchesSpec`, `fetchAllCategoryProducts`.

### T2 — Mốc giá tối đa dùng chung `PRICE_MAX`

1. `FE/src/features/catalog/hooks/useCategoryFilters.js`: dòng 4 đổi thành
   `import { PRICE_MAX } from "../utils/categoryUtils.js";` và `const DEFAULT_MAX_PRICE = PRICE_MAX;`
   (giữ tên `DEFAULT_MAX_PRICE` vì file khác đang dùng qua giá trị trả về của hook).
2. `FE/src/features/catalog/pages/SearchPage.jsx` dòng 14: đổi `const DEFAULT_MAX_PRICE = 50000000;`
   thành `const DEFAULT_MAX_PRICE = PRICE_MAX;` và thêm `PRICE_MAX` vào dòng import đã có ở dòng 10
   (`import { PRICE_PRESETS, PRICE_MAX } from "../utils/categoryUtils.js";`).
3. `FE/src/features/catalog/components/category/FilterPanel.jsx`:
   - Dòng 4: `import { PRICE_PRESETS, PRICE_MAX } from "../../utils/categoryUtils.js";` (bỏ `LAPTOP_SPEC_FILTERS`).
   - Dòng 117: `value={maxPrice >= PRICE_MAX ? "" : maxPrice}`
   - Dòng 119: `onPriceChange({ min: minPrice, max: Number(e.target.value) || PRICE_MAX })`
4. `FE/src/features/catalog/components/CategorySidebar.jsx` dòng 103: slider đổi thành
   `min="0" max="20000000" step="100000"` (giữ các thuộc tính khác). Nếu gần đó có chữ hiển thị mốc
   "50 triệu" thì đổi thành "20 triệu+". Nếu slider này điều khiển state rồi truyền `maxPrice` vào URL
   thì: khi giá trị = 20000000 phải truyền `PRICE_MAX` (import từ categoryUtils). Không rõ luồng dữ liệu
   → ghi vào "Câu hỏi cho chủ dự án", chỉ đổi min/max/step.
5. Chạy lại `grep -rn "50000000" FE/src` — chỉ còn được phép xuất hiện trong
   `features/admin/components/campaigns/CampaignBudgetBar.jsx` (placeholder ngân sách, loại C).

### T3 — `FE/src/features/catalog/components/category/ActiveFilterChips.jsx`

1. Xoá dòng import `LAPTOP_SPEC_FILTERS` (dòng 3).
2. Thêm prop `specLabels = {}` vào danh sách props của component (object `{ [key]: label }`).
3. Dòng 31 đổi thành `const groupLabel = specLabels[group] || group;`
4. Trong `FE/src/features/catalog/pages/CategoryPage.jsx`, chỗ render `<ActiveFilterChips` (khoảng dòng
   425), thêm prop:
   `specLabels={Object.fromEntries((dynamicSpecFilters || []).map((f) => [f.key, f.label]))}`
   (`dynamicSpecFilters` đã tồn tại trong CategoryPage, khai báo khoảng dòng 76, mỗi phần tử có
   `key` và `label`). Nếu `dynamicSpecFilters` có thể chứa `null` thì lọc trước: `.filter(Boolean)`.

### T4 — `FE/src/features/catalog/pages/CategoryPage.jsx`

1. Import từ categoryUtils (khoảng dòng 18–25): bỏ `isLaptopCategory`, `matchesLegacyCategory`. Giữ
   các tên khác.
2. Xoá hằng `categoryPromotions` (dòng 29–31).
3. Dòng 159–161: bỏ ưu tiên laptop, chỉ còn `const preferred = rootCategories[0];`.
4. Dòng 195–197: bỏ khối `if (categorySlug) { items = items.filter((p) => matchesLegacyCategory(p, categorySlug)); }`
   — khi không xác định được danh mục thì hiển thị tất cả `items` như API trả về.
5. Dòng 337–340: tìm mọi chỗ dùng biến `activePromotions`.
   - Nếu `activePromotions` chỉ để render một khối khuyến mãi theo danh mục → đặt
     `const activePromotions = [];` (giữ biến để không phải sửa JSX), ghi vào báo cáo là "khuyến mãi
     theo danh mục đang rỗng — cần nguồn dữ liệu thật (promotion-service) nếu muốn dùng".
6. Sau khi sửa, `grep -n "laptop\|Laptop" FE/src/features/catalog/pages/CategoryPage.jsx` phải rỗng
   (trừ comment giải thích nếu có — xoá luôn comment chỉ nói về laptop).

### T5 — Trang chủ: thay 3 section điện tử bằng section tổng quát

**Mục tiêu:** trang chủ tự sinh các khối theo danh mục GỐC lấy từ API, đúng với mọi catalog.

1. Tạo file mới `FE/src/features/catalog/components/CategoryShowcaseSection.jsx`:
   - **Sao chép** `LaptopShowcaseSection.jsx` làm điểm bắt đầu (đây là component tổng quát nhất: có
     tab, danh mục con, lọc thương hiệu, carousel sản phẩm). Đổi tên component thành
     `CategoryShowcaseSection`.
   - Props: `{ category }` — MỘT danh mục gốc (object có `id`, `name`, `slug`, `children`).
   - Tiêu đề khối = `formatCategoryName(category.name)` (import từ `../utils/categoryUtils.js`).
   - Tab = các danh mục con `category.children` đang active (`c.active !== false`), thêm tab đầu tiên
     "Tất cả" = chính `category`. Không có con → chỉ tab "Tất cả".
   - Thương hiệu: `productApi.listBrandsByCategory(<id tab đang chọn>)` (y như file gốc).
   - Sản phẩm: `productApi.listProducts({ categoryId: String(<id tab đang chọn>) })`, lọc theo thương
     hiệu nếu đang chọn, lấy tối đa 8 (y như file gốc).
   - Link "Xem tất cả" → `/category?activeCategory=${category.slug}`.
   - **Xoá toàn bộ** logic tab mặc định "monitor/pc/access", logic loại trừ điện thoại/laptop, mọi chữ
     "MÀN HÌNH MÁY TÍNH", "PC", "PHỤ KIỆN MÁY TÍNH", ảnh banner laptop. Chỗ nào file gốc hiển thị ảnh
     banner quảng cáo laptop → bỏ phần banner đó (không thay ảnh khác).
   - Giữ class CSS/Tailwind, màu, bố cục thẻ sản phẩm như file gốc.
   - `category` rỗng/không có `id` → `return null`.
2. Tạo file mới `FE/src/features/catalog/components/CategoryGridSection.jsx` thay cho
   `AccessoriesSection`:
   - **Sao chép** `AccessoriesSection.jsx` làm điểm bắt đầu, đổi tên component `CategoryGridSection`.
   - Props: `{ categories }`. Danh sách hiển thị = mọi danh mục GỐC đang active
     (`!c.parentId && c.active !== false`), sắp theo `sortOrder` tăng dần (dùng `getRootCategories` nếu
     `categories` là cây gốc).
   - Xoá logic tìm danh mục "phụ kiện" và loại trừ điện thoại/laptop. Link mỗi ô →
     `/category?activeCategory=${c.slug}`. Tiêu đề khối: "Danh mục nổi bật". Link cứng
     `/category?activeCategory=phu-kien` → đổi thành `/category`.
   - Giữ nguyên logic đệm ô trống (`getPaddedCats`) và giao diện.
3. Sửa `FE/src/features/catalog/pages/HomePage.jsx` (khoảng dòng 259–267):
   - Bỏ render `<CategoryDualSection .../>`, `<AccessoriesSection .../>`, `<LaptopShowcaseSection .../>`
     và 3 dòng import tương ứng (dòng 10 và các dòng import 2 component kia).
   - Thay bằng:
     ```jsx
     {/* Danh mục nổi bật */}
     <CategoryGridSection categories={categories} />
     {/* Mỗi danh mục gốc 1 khối (tối đa 6) */}
     {getRootCategories(categories).filter((c) => !c.parentId).slice(0, 6).map((cat) => (
       <CategoryShowcaseSection key={cat.id} category={cat} />
     ))}
     ```
     và import `CategoryGridSection`, `CategoryShowcaseSection`, `getRootCategories`
     (`import { getRootCategories } from "../utils/categoryUtils.js";`).
   - Kiểm tra `categories` trong HomePage là CÂY (có `children`) hay danh sách phẳng: xem hàm
     `productApi.listCategories()` trong `FE/src/services/productApi.ts`. Nếu là danh sách phẳng có
     `parentId` thì phải dựng `children` trước khi truyền (viết hàm nhỏ `buildCategoryTree(flat)` ngay
     trong HomePage: nhóm theo `parentId`). Ghi rõ vào nhật ký đã xác minh dạng dữ liệu nào.
   - Các comment `{/* Ảnh 3: Điện thoại / Máy tính bảng */}`, `{/* Ảnh 4: Phụ kiện... */}`,
     `{/* Ảnh 5: Laptop */}` xoá theo.
4. KHÔNG xoá `CategoryDualSection.jsx`, `AccessoriesSection.jsx`, `LaptopShowcaseSection.jsx` — ghi vào
   báo cáo mục "Có thể xoá — chờ duyệt" (sau khi `grep -rn` xác nhận không còn file nào import chúng).
5. Ảnh banner tĩnh ở `FE/src/assets/images/` (banner0–4, under0–2, left*.webp, school_promo_banner,
   black_friday_banner): **không sửa, không thay**. Mở từng ảnh xem nội dung; ảnh nào chỉ có đồ điện
   tử thì liệt kê vào báo cáo mục "Tài sản cần thay (người làm)".

### T6 — Bảo hành không còn mặc định cho mọi sản phẩm

1. `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java`,
   hàm `getMyWarranty`:
   - Dòng 1449: `warrantyMap.put(id, period != null ? period : 12);` → `warrantyMap.put(id, period != null ? period : 0);`
   - Dòng 1469: `int months = warrantyMap.getOrDefault(item.getProductId(), 12);` → đổi mặc định thành `0`,
     và ngay sau dòng đó thêm `if (months <= 0) continue; // SP không có bảo hành (vd thời trang, thực phẩm)`.
   - Không sửa gì khác trong hàm.
2. `FE/src/features/admin/components/AddProductTab.jsx`: ở 3 chỗ khởi tạo state (dòng 32–33, 207–208,
   283–284):
   - `warrantyPeriod: "12"` → `warrantyPeriod: "0"`; `detail.warrantyPeriod || "12"` →
     `detail.warrantyPeriod ?? "0"`.
   - `warrantyPolicy: "Bảo hành chính hãng 12 tháng."` → `warrantyPolicy: ""`;
     `detail.warrantyPolicy || "Bảo hành chính hãng 12 tháng."` → `detail.warrantyPolicy || ""`.
   - Dòng 640: `Number(basicInfo.warrantyPeriod || 12)` → `Number(basicInfo.warrantyPeriod || 0)`.
   - Nhãn ô nhập (khoảng dòng 1340) "Thời hạn bảo hành (tháng)" → "Thời hạn bảo hành (tháng, 0 = không bảo hành)".
3. `FE/src/features/profile/components/WarrantyTab.jsx`: đọc file, xác nhận có hiển thị trạng thái
   danh sách rỗng. Nếu KHÔNG có → thêm 1 dòng thông báo "Chưa có sản phẩm nào đang được bảo hành."
   theo style chữ xám có sẵn trong file. Có rồi thì không sửa.
4. Build BE bằng lệnh mvn ở mục 2.

### T7 — `FE/src/components/common/Header.jsx`, hàm `getCategoryIconFallback` (dòng 11–24)

Giữ các dòng điện tử hiện có, **thêm** các dòng sau NGAY TRƯỚC dòng `return "category";` (icon là tên
Material Symbols, dự án đang dùng qua component `Icon`):

```js
  if (normalized.includes("thời trang") || normalized.includes("quần") || normalized.includes("áo") || normalized.includes("giày") || normalized.includes("túi")) return "checkroom";
  if (normalized.includes("làm đẹp") || normalized.includes("mỹ phẩm") || normalized.includes("chăm sóc")) return "spa";
  if (normalized.includes("nhà cửa") || normalized.includes("nội thất") || normalized.includes("đời sống")) return "chair";
  if (normalized.includes("bếp") || normalized.includes("gia dụng")) return "kitchen";
  if (normalized.includes("mẹ") || normalized.includes("bé") || normalized.includes("trẻ em")) return "child_care";
  if (normalized.includes("thể thao") || normalized.includes("du lịch") || normalized.includes("dã ngoại")) return "sports_soccer";
  if (normalized.includes("sách") || normalized.includes("văn phòng phẩm")) return "menu_book";
  if (normalized.includes("đồ chơi")) return "toys";
  if (normalized.includes("thực phẩm") || normalized.includes("đồ uống") || normalized.includes("bách hoá") || normalized.includes("bách hóa")) return "restaurant";
  if (normalized.includes("sức khỏe") || normalized.includes("sức khoẻ") || normalized.includes("y tế")) return "health_and_safety";
  if (normalized.includes("xe") || normalized.includes("ô tô") || normalized.includes("phụ tùng")) return "directions_car";
  if (normalized.includes("thú cưng")) return "pets";
```

Lưu ý thứ tự: dòng "phụ kiện" hiện có đứng trước sẽ bắt "phụ kiện thời trang" thành icon điện tử
`extension` → **chuyển dòng "thời trang..." lên TRƯỚC dòng "phụ kiện"**. Kiểm tra: nếu Header đã dùng
`category.icon` từ API khi có (tìm `.icon` trong file) thì giữ ưu tiên đó; hàm này chỉ là fallback.

### T8 — Chữ mô tả / placeholder / dữ liệu mock (loại B)

| File | Đổi thành |
|---|---|
| `FE/src/components/common/Footer.jsx:45` | "Sàn thương mại điện tử đa ngành hàng: thời trang, làm đẹp, nhà cửa, mẹ & bé, điện tử và hơn thế nữa." — giữ phần câu phía sau (nếu có "Cam kết ...") |
| `FE/src/features/chatbot/components/AIChatbotWidget.jsx:71` | `{ text: "Gợi ý quà tặng dưới 500 nghìn", icon: "redeem" }` |
| `...AIChatbotWidget.jsx:72` | `{ text: "Chính sách đổi trả ra sao?", icon: "shield" }` |
| `...AIChatbotWidget.jsx:73` | `{ text: "Tìm sản phẩm đang giảm giá", icon: "local_offer" }` |
| `AIChatbotWidget.jsx` câu chào dòng ~97 | nếu có nhắc điện thoại/laptop/công nghệ → thay bằng "mọi ngành hàng"; không có thì giữ |
| `FE/src/features/admin/components/AddProductTab.jsx:1366` | placeholder `"Ví dụ: áo thun, cotton, unisex"` |
| `FE/src/features/admin/components/AnalyticsAITab.jsx:57` | fallback `"Sản phẩm mẫu"` |
| `FE/src/features/admin/components/CategoriesTab.jsx:1000` | placeholder `"Ví dụ: Thời trang nam"`; comment dòng 343 đổi ví dụ "Điện thoại, Tablet" → "Thời trang" |
| `FE/src/features/admin/components/SupportChatTab.jsx:18-60` | Mock: giữ cấu trúc, đổi nội dung sang đa ngành: session `session_order_user` hỏi "Đơn áo khoác của tôi khi nào giao?"; `session_return_help` hỏi "Mỹ phẩm đã mở hộp có đổi trả được không?"; câu thứ 3 hỏi "Shop còn size M của váy hoa không?". Câu trả lời assistant viết tương ứng, ngắn, lịch sự. Đổi cả key localStorage tương ứng (`aura_chat_session_session_order_user`...) cho khớp tên session mới |
| `AI/chatbot-service/app/services/rag.py:76` | `"Sản phẩm này hiện đang có mức giá ưu đãi và chính sách đổi trả rõ ràng từ cửa hàng. "` |

Các dòng loại B khác tìm thấy ở Bước 1 mà không có trong bảng: sửa theo cùng tinh thần (bỏ ví dụ chỉ
riêng điện tử, thay bằng ví dụ đa ngành), ghi vào nhật ký.

## 5. Bước 3 — Kiểm tra cuối

1. `cd FE && npm run build` → phải ĐẠT (hoặc chỉ còn đúng các lỗi đã có từ Bước 0).
2. `cd BE && mvn -q -DskipTests compile -pl product-service,order-service -am` → ĐẠT.
3. `python -m py_compile AI/chatbot-service/app/services/rag.py` → ĐẠT.
4. Chạy lại các lệnh grep ở 3.1: mọi dòng còn lại phải thuộc loại C trong báo cáo. Chạy thêm:
   `grep -rnE "LAPTOP_SPEC_FILTERS|SLUG_ALIASES|isLaptopCategory|matchesLegacyCategory|categoryPromotions" FE/src` → phải rỗng.
5. `git status` và `git diff --stat` → dán vào báo cáo. Đối chiếu: không có file nào ngoài danh sách
   được phép (mục 1.6, 1.7) bị sửa; không file nào bị xoá.
6. KHÔNG chạy `npm run dev`/docker (không có backend đang chạy — không kiểm thử giao diện thật được);
   ghi rõ trong báo cáo "chưa kiểm thử trên trình duyệt".

## 6. Báo cáo cuối (`docs/canvas/multi-category-audit.md`)

Cấu trúc bắt buộc:
1. **Bước 0 — build nền** (kết quả nguyên văn).
2. **Bảng rà soát** (mục 3.2).
3. **Nhật ký** theo task T1–T8 (file đã sửa, build sau task).
4. **Kiểm tra cuối** (mục 5, dán output rút gọn + `git diff --stat`).
5. **Có thể xoá — chờ duyệt** (file component không còn dùng).
6. **Tài sản cần thay (người làm)** (ảnh banner chỉ có đồ điện tử).
7. **Giới hạn đã biết — KHÔNG sửa đợt này** (ghi nguyên các ý sau):
   - Trang danh mục tải toàn bộ SP của danh mục về trình duyệt rồi mới lọc; `fetchAllCategoryProducts`
     dừng ở 20 trang × 50 = 1.000 SP → danh mục lớn bị cắt. Cần API lọc/sắp xếp phía server (BE hiện
     chỉ có phân trang: `ProductController` không nhận brand/price/sort).
   - Catalog trong DB hiện là dữ liệu Olist + 150 SP giả — việc nạp catalog đa ngành thật do chủ dự án
     làm riêng.
   - Tên thương hiệu "AuraTech" gợi ý đồ công nghệ — chủ dự án quyết định có đổi không.
8. **Câu hỏi cho chủ dự án** (mọi chỗ đã dừng theo luật 1.9).

Trả lời cuối cùng trong chat: tóm tắt ≤ 15 dòng + đường dẫn báo cáo. Không commit.
