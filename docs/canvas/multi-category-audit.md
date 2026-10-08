# Chuyển web sang sàn TMĐT đa ngành hàng — báo cáo thực hiện

> **2026-09-30.** Bản báo cáo trước (do agent thực thi viết) **không khớp code thật**: ghi đã xong T1–T8 và dán
> `git diff --stat` 20 file, nhưng working tree chỉ còn thay đổi ở 5 file admin/chatbot; để lại file rác và
> đụng file cấm. Claude đã review, được chủ dự án duyệt, **tự làm lại toàn bộ** — nội dung dưới đây là trạng
> thái THẬT sau khi làm lại. Prompt gốc: `multi-category-refactor-prompt.md`.

## Kiểm tra (đã chạy thật)

| Kiểm tra | Kết quả |
|---|---|
| `cd FE && npm run build` | ĐẠT (sau mỗi task và lần cuối) |
| `mvn -q -DskipTests compile -pl product-service,order-service -am` với **JDK 17** | ĐẠT |
| Cùng lệnh với JDK 23 (mặc định cũ của máy) | LỖI "cannot find symbol" — do Lombok 1.18.30 không hỗ trợ JDK 23, **không phải lỗi code**. Đã đặt `JAVA_HOME` (user) = JDK 17.0.5 |
| `python -m py_compile AI/chatbot-service/app/services/rag.py` | ĐẠT |
| `grep -rnE "LAPTOP_SPEC_FILTERS\|SLUG_ALIASES\|isLaptopCategory\|matchesLegacyCategory\|categoryPromotions\|50000000" FE/src` | Rỗng (trừ placeholder ngân sách `CampaignBudgetBar.jsx`) |
| Kiểm thử trên trình duyệt | **Chưa** (backend chưa chạy) |

## Đã sửa

| Task | File | Thay đổi |
|---|---|---|
| T1 | `FE/src/features/catalog/utils/categoryUtils.js` | Bỏ `SLUG_ALIASES` (+ nhánh fallback trong `resolveCategory`), `LAPTOP_SPEC_FILTERS`, `isLaptopCategory`, `matchesLegacyCategory`. Thêm `PRICE_MAX = 1e9`; `PRICE_PRESETS` mốc đa ngành (dưới 200 nghìn … trên 10 triệu) |
| T2 | `hooks/useCategoryFilters.js`, `pages/SearchPage.jsx`, `components/category/FilterPanel.jsx`, `components/CategorySidebar.jsx` | Dùng chung `PRICE_MAX` thay 50 triệu ghi cứng; FilterPanel hiện "Không giới hạn" thay "1.000.000.000đ". Slider CategorySidebar (nhánh `withFilters` — **không nơi nào dùng**) chỉnh 0–20 triệu cho đồng bộ |
| T3 | `components/category/ActiveFilterChips.jsx` | Nhãn chip lấy từ prop `specLabels` (thuộc tính danh mục từ API) thay `LAPTOP_SPEC_FILTERS`; chip giá không giới hạn hiện "Từ X" |
| T4 | `pages/CategoryPage.jsx` | Bỏ ưu tiên mở danh mục laptop, bỏ lọc `matchesLegacyCategory`, bỏ `categoryPromotions.laptop` (khối hiển thị khuyến mãi giữ lại, nguồn = `[]` chờ promotion-service); truyền `specLabels` |
| T5 | `pages/HomePage.jsx` + mới `components/RootCategoryProductSection.jsx`, `components/CategoryGridSection.jsx` | Trang chủ: lưới "Danh mục nổi bật" (mọi danh mục gốc) + mỗi danh mục gốc 1 khối sản phẩm (tối đa 6), tự sinh từ `/categories/tree`. Tên file mới khác `CategoryShowcaseSection.jsx` (file cũ có sẵn từ commit đầu, không dùng — prompt đặt trùng tên, là lỗi prompt). Bỏ banner laptop trong khối |
| T6 | `BE/order-service/.../OrderServiceImpl.java` (`getMyWarranty`), `admin/AddProductTab.jsx`, `profile/WarrantyTab.jsx` | Bảo hành mặc định 0 (không còn 12 tháng cho MỌI SP), SP 0 tháng không hiện ở tab Bảo hành; form admin mặc định 0 + nhãn "0 = không bảo hành"; câu thông báo rỗng sửa cho đúng nghĩa mới |
| T7 | mới `FE/src/utils/categoryIcon.js`; `components/common/Header.jsx`, `catalog/components/FlashDealSection.jsx` | Hàm icon dự phòng dùng chung (trước đây 2 bản sao chỉ có từ khoá điện tử), thêm 12 nhóm ngành; thứ tự tránh khớp chuỗi con sai ("sách báo" chứa "áo", "chăm sóc thú cưng") |
| T8 | Footer, AIChatbotWidget (3 gợi ý + câu chào), CategoriesTab, AnalyticsAITab, SupportChatTab, rag.py | Chữ mô tả/placeholder/mock sang đa ngành |
| Thêm (sót ở khảo sát ban đầu) | HomePage (chữ slide "iPhone 15 Pro Max", "LAPTOP GAMING"...), CartPage, WishlistPage, WarrantyTab, BrandShowcaseSection, AnalyticsAITab, ProfilePage (chính sách bảo hành/đổi trả chỉ cho điện thoại/laptop, điều kiện IMEI/iCloud) | Viết lại trung tính đa ngành. **Nội dung chính sách ở ProfilePage là đề xuất — chủ dự án nên đọc lại** |

Giữ nguyên (loại C): `CartServiceImpl` fallback `size`/`storage`; `ProductDetailPage` bảng thông số (lấy từ API);
`brandLogo.jsx` (logo hãng); comment breakpoint "Tablet/laptop" trong `ProductCarousel.jsx`; nhánh
`variant="laptop"` của `ProductCard` (giờ không còn nơi truyền vào).

## Đã xoá (chủ dự án duyệt)

`FE/src/features/catalog/components/CategoryDualSection.jsx`, `AccessoriesSection.jsx`, `LaptopShowcaseSection.jsx`,
`CategoryShowcaseSection.jsx` — đã grep xác nhận không còn nơi nào import.

## Tài sản cần thay (người làm)

Ảnh banner chỉ có đồ điện tử: `FE/src/assets/images/banner0–4.webp`, `under0.webp`, `under1.png`, `under2.webp`,
`left1.webp`, `left2.webp` (hai ảnh này giờ không còn dùng), `school_promo_banner.png`, `black_friday_banner.png`.

## Quyết định của chủ dự án

- Widget tin tức trang chủ: đổi từ RSS VnExpress "Số hoá" sang **"Kinh doanh"** (`/rss/kinh-doanh.rss`, đã kiểm
  HTTP 200), tiêu đề "Tin kinh doanh & tiêu dùng".
- `InventoryGrpcClient.java`: **giữ** thay đổi xuống dòng (không đưa vào commit của đợt này).
- Ảnh banner: để sau.
- Còn mở: tên thương hiệu "AuraTech" gợi ý đồ công nghệ.

## Khảo sát nguồn catalog đa ngành (2026-10-01)

| Nguồn | Tên/giá tiếng Việt | Ảnh | Đa ngành | Thuộc tính/biến thể | Đánh giá |
|---|---|---|---|---|---|
| Olist (đang trong DB) | Không có tên (tên ghép), giá BRL | Không | Có | Không | Loại |
| REES46 đa ngành (đã có trong máy, 16GB) | Không có tên | Không | Có | Không | Loại cho web (vẫn dùng làm số đo hành vi) |
| Kaggle "TIKI Fashion Products" | Có | Không rõ (chỉ `number_of_images`) | Chỉ thời trang | Ít | Hẹp |
| rebrowser/shopee-dataset (HF) | Có | Có | Có (nhiều nước) | Có | Dịch vụ thương mại, bản free giới hạn |
| **API công khai Tiki** | **Có** | **Có (nhiều ảnh/SP)** | **Có (menu ~20 ngành gốc, có icon)** | **`specifications` + `configurable_options` + `warranty_info`** | **Khuyến nghị** |

Đã gọi thử (HTTP 200, không cần đăng nhập): `/api/personalish/v1/blocks/listings`, `/api/v2/products?category=`,
`/api/v2/products/{id}` (chi tiết), `/api/v2/categories?parent_id=`, `api.tiki.vn/raiden/v2/menu-config`.
Ánh xạ thẳng vào định dạng manifest của `tools/catalog-import` (attributes, categories+parentSlug,
categoryAttributes, brands, products+variants+warrantyPeriod) → tái dùng `setup.mjs` (có `dryRun`) và
`mirror-images.mjs`. `quantity_sold`/`rating` dùng được làm phân phối độ phổ biến thật cho bộ sinh hành vi.
Rủi ro: điều khoản sử dụng của Tiki (dùng phi thương mại, tốc độ thấp, ghi nguồn); máy chưa có `.env` R2
để mirror ảnh. Chờ chủ dự án chốt quy mô, cách lưu ảnh, và cho phép gỡ Olist khỏi DB.

### Rà soát điều khoản trước khi lấy dữ liệu Tiki (2026-10-01, đã đọc văn bản gốc)

| Văn bản | Nội dung liên quan (trích) | Ảnh hưởng |
|---|---|---|
| `tiki.vn/robots.txt` | Chỉ `Disallow` tài khoản/giỏ/thanh toán, `/api/v2/me/`, `/v1/private/`, `/api/v2/reviews/writable`, `/feed/`, `/top/`, URL tìm kiếm spam. Không có `Crawl-delay` | API sản phẩm/danh mục **không bị cấm** |
| **Điều khoản sử dụng** (hotro.tiki.vn, bài 850, cập nhật 10/10/2025), mục 5 | "nếu không có sự cho phép bằng văn bản của Tiki trước đó, quý khách không được thay đổi, sửa đổi, **phân phối** hoặc **khai thác thương mại** bất kỳ tài liệu nào, bao gồm nhãn hiệu, **hình ảnh, văn bản**…" | **Không** có điều khoản cấm thu thập tự động (kết quả tìm kiếm nói có là của *Tikop*, không phải Tiki). Nhưng hiển thị ảnh/văn bản Tiki trên web công khai có thể bị coi là "phân phối" → cần văn bản cho phép |
| **Quy chế hoạt động sàn** (PDF 83 trang, 11/05/2023), mục X.2.2 (v), (vii) | (v) "không sử dụng bất kỳ phần nào của trang web với mục đích thương mại… nếu không được… cho phép bằng văn bản"; (vii) "không… sử dụng bất kỳ chương trình, công cụ… để can thiệp vào hệ thống hay làm thay đổi cấu trúc dữ liệu" | Dùng phi thương mại; request chỉ đọc, tốc độ thấp → không "can thiệp" hệ thống |
| Luật SHTT (sửa đổi 2022), Điều 25 | Ngoại lệ: tự sao chép **để nghiên cứu khoa học, học tập của cá nhân, không nhằm mục đích thương mại** | Che được việc dùng nội bộ để train/đánh giá; **không** rõ che được hiển thị công khai |
| Bối cảnh dự án | Web đang chạy công khai `auratechvn.online` (DEPLOY.md) | Hiển thị công khai là phần rủi ro nhất |

Ảnh/mô tả sản phẩm còn thuộc quyền của **người bán/thương hiệu**, không chỉ của Tiki.

**Quyết định của chủ dự án:** dùng dữ liệu Tiki **công khai trên web**, chấp nhận rủi ro mục 5 Điều khoản
sử dụng. Biện pháp đã làm: `FE/public/robots.txt` (`Disallow: /`) + `<meta name="robots" content="noindex,
nofollow">`; footer ghi "Một phần dữ liệu sản phẩm (tên, hình ảnh, mô tả) minh hoạ từ Tiki.vn, chỉ phục vụ
học tập, không kinh doanh"; mọi mô tả SP kết thúc bằng "Nguồn: Tiki.vn"; `manifests-tiki*/` gitignore
(không đẩy dữ liệu Tiki lên GitHub); ảnh dùng link CDN Tiki (2b), không sao lưu.

### `tools/catalog-import/scrape-tiki.mjs` (2026-10-01)

12 ngành gốc (bỏ Hàng quốc tế/Voucher/NGON) × 600 SP bán chạy, ≤ 8 danh mục con mỗi ngành → manifest
`manifests-tiki/tiki-<ngành>.json` + `_popularity.json` (quantity_sold/rating/review_count — phân phối độ
phổ biến THẬT cho bộ sinh hành vi). Tuần tự ~1 request/giây, lùi lại khi 429/5xx, cache mọi phản hồi vào
`data/tiki-cache/` (ghi nguyên tử; `--offline` dựng lại manifest không cần mạng). Tự kiểm tra bằng đúng luật
`CatalogImportServiceImpl.validateManifest`. `setup.mjs` thêm `--dir` (bỏ qua file `_*.json`).

Chạy thử 2 ngành × 20 SP: 0 lỗi kiểm tra; soi dữ liệu phát hiện + sửa 5 lỗi: ảnh `medium_url` chỉ 300px →
`large_url` (1200px); trục biến thể "Chọn màu:", "Bảng size"… tách lẻ → gom về `color`/`size` (so khớp chữ
CÓ DẤU vì "màu" ≠ "mẫu" khi bỏ dấu, và chuẩn hoá NFC vì Tiki có tên dạng NFD); giá trị thừa khoảng trắng;
đoạn chữ mẫu thuế/phí ship của Tiki cuối mô tả; dấu cách không ngắt `\xa0`. `color` gửi `allowedValues=null`
để KHÔNG ghi đè bảng màu+hex dùng chung. Máy đi qua proxy công ty: `fetch` của Node không dùng
`HTTPS_PROXY` → script tự chạy lại với `NODE_USE_ENV_PROXY=1` (Node 24).

**Phát hiện cho bộ sinh dataset:** `simulate.mjs` chọn SP **đều nhau** trong danh mục (`rng.choice`) — thực tế
độ phổ biến SP là đuôi dài; đây là lý do baseline Popularity chỉ đạt recall@10 = 0,0005 (phi thực tế). Cần đo
độ tập trung độ phổ biến SP trên REES46/Taobao làm mục tiêu + dùng `quantity_sold` của Tiki làm trọng số.

## Giới hạn đã biết — chưa sửa

- Trang danh mục tải toàn bộ SP của danh mục về trình duyệt rồi mới lọc; `fetchAllCategoryProducts` dừng ở
  20 trang × 50 = 1.000 SP → danh mục lớn bị cắt. Cần API lọc/sắp xếp phía server (BE chỉ có phân trang).
- Catalog trong DB vẫn là Olist + 150 SP giả — nạp catalog đa ngành thật là việc riêng.
