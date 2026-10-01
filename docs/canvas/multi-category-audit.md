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

## Giới hạn đã biết — chưa sửa

- Trang danh mục tải toàn bộ SP của danh mục về trình duyệt rồi mới lọc; `fetchAllCategoryProducts` dừng ở
  20 trang × 50 = 1.000 SP → danh mục lớn bị cắt. Cần API lọc/sắp xếp phía server (BE chỉ có phân trang).
- Catalog trong DB vẫn là Olist + 150 SP giả — nạp catalog đa ngành thật là việc riêng.
