# TEST CASE: PRODUCT & CATALOG SERVICE

> **Nguồn tham chiếu:** `BE/product-service/src/main/java/com/ecommerce/productservice/**` (controller, service/impl, entity, dto, repository) và `docs/services/02_PRODUCT_CATALOG_SERVICE.md`.
> Khi tài liệu thiết kế và code thật lệch nhau, bộ test case này ưu tiên theo **code thật** (đã đọc trực tiếp các file `ProductServiceImpl`, `CategoryServiceImpl`, `BrandServiceImpl`, `AttributeServiceImpl`, `CatalogImportServiceImpl`, `SearchServiceImpl`, `MinioStorageServiceImpl` tại thời điểm viết).

> **Ghi chú rút gọn (2026-07-14):** Bộ test case này đã được rút gọn theo yêu cầu dự án — tập trung vào các **luồng nghiệp vụ quan trọng** (catalog import dry-run/apply/merge, category aggregation BFS, EAV attribute diff, product nhiều variant, search full-text + fallback ES, upload ảnh); các test case chỉ kiểm tra 1 field riêng lẻ (validate rỗng/sai định dạng/thiếu trường...) đã được gộp thành 1-2 dòng đại diện thay vì liệt kê từng trường hợp. Số lượng test case giảm từ 141 xuống 63 (~55%). 2 defect đã phát hiện được giữ nguyên đầy đủ: `IT-PRODUCT-002` (category tự làm cha, không validate cycle) và `IT-PRODUCT-008` (trùng slug/SKU → lỗi 500 thay vì 400).

## 0. Phạm vi & Tóm tắt

Bộ test case bao trùm các module nghiệp vụ của `product-service` (REST port `8089`):

| Module | Controller/Service liên quan | Ghi chú |
|---|---|---|
| Category (CRUD + Tree) | `CategoryController`, `AdminProductController` (create/update/delete category), `CategoryServiceImpl` | Cây danh mục đệ quy cha-con, không có validate cycle ở tầng service |
| Brand (CRUD) | `BrandController`, `AdminBrandController`, `BrandServiceImpl` | Có validate trùng slug ở tầng service (400) |
| Attribute (EAV definition + gán category) | `AdminAttributeController`, `AttributeServiceImpl` | Validate riêng cho `valueType=select` (đặc biệt khi `isColor=true`) |
| Product (CRUD + variants + EAV + tags + images) | `AdminProductController`, `ProductController`, `ProductServiceImpl` | Không validate trùng slug ở tầng service — dựa vào DB unique constraint → lỗi rơi xuống `500 INTERNAL_ERROR` (generic handler), là điểm cần lưu ý khi test |
| Category Product Aggregation | `ProductServiceImpl.getProductsByCategory` / `resolveCategoryIdsWithDescendants` | Danh mục cha trả về cả sản phẩm của toàn bộ category con (BFS đệ quy nhiều cấp) |
| Catalog Import (bulk) | `AdminCatalogImportController`, `CatalogImportServiceImpl` | `dryRun=true` (default) chỉ validate, `dryRun=false` mới ghi DB; brand-category merge (union, không overwrite) |
| Search | `ProductController#searchProducts`, `SearchServiceImpl` | Elasticsearch trước, fallback PostgreSQL `LIKE` khi ES lỗi |
| Ảnh sản phẩm | `AdminProductController#uploadProductImage`, `MinioStorageServiceImpl` | Chỉ nhận JPEG/PNG/GIF/WEBP, file rỗng → lỗi 400 |
| Internal API | `InternalProductController` | `/api/internal/products/price-info`, `/bulk` — dùng bởi Order Service |

**Quy ước Test ID:**
- `UT-PRODUCT-xxx`: Unit test (test logic 1 method/class độc lập, mock repository/dependency).
- `IT-PRODUCT-xxx`: Integration test (test qua REST endpoint thật, DB thật/test-container, có thể xuyên nhiều layer).

**Ký hiệu Priority:** High / Medium / Low.

---

## 1. Category — CRUD & Category Tree

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-001 | `CategoryServiceImpl.createCategory` / `getCategoryTree` | Unit | Tạo category hợp lệ (có/không `parentId`) và build cây danh mục nhiều cấp | Repository mock | Tạo category cha/con; build tree từ danh sách category 3 cấp | Lưu thành công, `active=true` default; cây trả về đúng cấu trúc cha→con→cháu | High |
| IT-PRODUCT-001 | `POST /api/v1/admin/categories` | Integration | Tạo category qua API (hợp lệ) + thiếu field bắt buộc (`name`) | ROLE_ADMIN/STAFF | Body hợp lệ → 200; body thiếu `name` → 400 | HTTP 200 khi hợp lệ; HTTP 400 `VALIDATION_FAILED` khi thiếu `name` | High |
| IT-PRODUCT-002 | `PUT /api/v1/admin/categories/{id}` | Integration | **[DEFECT]** Cập nhật category set `parentId` = chính `id` của nó (tự làm cha) | Category id=10 đã tồn tại | `PUT /categories/10` body `{"parentId":10}` | **Không có validate chống cycle** ở `CategoryServiceImpl` → request lưu thành công (HTTP 200) dù `parentId==id`, tạo self-loop trong cây danh mục — defect cần dev xử lý | High |
| IT-PRODUCT-003 | `GET /api/v1/public/categories/tree`, `/{id}`, `/{id}/attributes`; `DELETE /admin/categories/{id}` | Integration | Nhóm hành vi chung: lấy tree công khai; lấy theo id không tồn tại; xóa category đang có con/sản phẩm; `parentId` trỏ tới id không tồn tại | DB có dữ liệu tương ứng | Gọi các endpoint trên | Tree trả đúng cấu trúc lồng nhau; id không tồn tại → `RuntimeException` thô → HTTP 500 (không phải 404 chuẩn); xóa/orphan reference không bị chặn vì không có FK cứng — ghi nhận là hành vi hiện tại | Low |

---

## 2. Brand — CRUD & Category Association

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-002 | `BrandServiceImpl.createBrand` / `updateBrand` | Unit | Tạo/cập nhật brand hợp lệ với `categoryIds`, giữ nguyên slug cũ khi không đổi | Repository mock | `createBrand({slug:"samsung", categoryIds:{1,2}})`; `updateBrand` không đổi slug | Lưu thành công, `categoryIds` đúng; update giữ nguyên `categoryIds` khi không đổi slug | High |
| UT-PRODUCT-003 | `BrandServiceImpl.createBrand` / `updateBrand` | Unit | Tạo/cập nhật brand trùng slug với brand khác | `existsBySlug` = true / slug đích đã bị chiếm | `createBrand`/`updateBrand` với slug trùng | Ném `IllegalArgumentException("Brand slug already exists: ...")`, dữ liệu cũ không đổi (khác Category/Product — Brand CÓ validate ở service layer) | High |
| IT-PRODUCT-004 | `POST /api/v1/admin/brands`, `GET /public/brands/category/{id}`, `DELETE /admin/brands/{id}` | Integration | Tạo brand qua REST; trùng slug → 400; lọc brand active theo category (không trả brand inactive); xóa brand đang được sản phẩm tham chiếu | Dữ liệu brand/category tương ứng | Gọi các endpoint trên | Tạo thành công 200; trùng slug → 400 `BAD_REQUEST`; chỉ trả brand `active=true`; xóa brand orphan `brandId` ở product (không có FK cứng) | Medium |

---

## 3. Attribute (EAV Definition) & Category-Attribute Link

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-004 | `AttributeServiceImpl.createAttribute` | Unit | Tạo attribute kiểu `text` hợp lệ + trùng `code` | `existsByCode` mock | Tạo attribute mới; tạo lại với code đã tồn tại | Lưu thành công với `text`; ném `IllegalArgumentException("Attribute code '...' already exists")` khi trùng | High |
| UT-PRODUCT-005 | `AttributeServiceImpl.validateAttribute` | Unit | Validate attribute `valueType=select`/`isColor=true`: `allowedValues` rỗng, thiếu `hex`, hex viết tắt, hex không hợp lệ, JSON sai format | Các input tương ứng | `createAttribute(dto)` với từng trường hợp | Các trường hợp sai (`allowedValues` rỗng, thiếu `hex`, hex/JSON không hợp lệ) → ném `IllegalArgumentException` đúng message; hex viết tắt (`f00`) được tự chuẩn hóa thành `#f00` và lưu thành công | High |
| UT-PRODUCT-006 | `AttributeServiceImpl.assignAttributeToCategory` | Unit | Gán attribute cho category (link mới / update link đã tồn tại) + gán attribute không tồn tại | Link tồn tại/không tồn tại theo case | `assignAttributeToCategory(...)` | Link mới được tạo; link cũ được update (không tạo trùng); `attributeId` sai → `ResourceNotFoundException` | High |
| IT-PRODUCT-005 | `POST /api/v1/admin/attributes`, `DELETE /admin/categories/{cid}/attributes/{aid}` | Integration | Tạo attribute màu qua REST thành công; gỡ liên kết attribute-category không tồn tại | ROLE_ADMIN | `POST /attributes` body hợp lệ; `DELETE` link không tồn tại | HTTP 200 khi tạo thành công; HTTP 404 `NOT_FOUND` khi gỡ link không tồn tại | Medium |

---

## 4. Product — CRUD, Variant EAV, Tags, Images

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-007 | `ProductServiceImpl.createProduct` | Unit | Tạo sản phẩm cơ bản không variant/tag/ảnh phụ | categoryId hợp lệ | `ProductDto{name, slug, price, categoryId, status:"DRAFT"}` | Lưu `Product`, DTO trả về `variants=[]`, `images=[]`, `tags=[]` | High |
| UT-PRODUCT-008 | `ProductServiceImpl.createProduct` (brand) | Unit | Resolve tên brand từ `brandId` hợp lệ; fallback dùng `brand` field khi `brandId` không tồn tại (orphan) | Brand mock tồn tại/không tồn tại | `createProduct` với `brandId` hợp lệ và với `brandId=999` không tồn tại | `brandId` hợp lệ → lấy tên brand từ entity; `brandId` không tồn tại → không throw, fallback dùng `productDto.getBrand()` | Medium |
| UT-PRODUCT-009 | `ProductServiceImpl.createProduct` (EAV) | Unit | Tạo sản phẩm kèm `attributes` (specs tĩnh) với code đã tồn tại và code chưa tồn tại (auto-create Attribute) | Attribute tồn tại/chưa tồn tại theo case | `attributes = {"xuat-xu":"Việt Nam"}` / `{"chat-lieu":"Cotton"}` | Ghi đúng `product_attribute_values`; tự tạo `Attribute` mới khi code chưa có, không tạo trùng khi đã có | High |
| UT-PRODUCT-010 | `ProductServiceImpl.createProduct` (Variant) | Unit | Tạo sản phẩm nhiều variant (≥3), mỗi variant có `variantAttr` khác nhau (màu/size) | Attribute `mau-sac`, `kich-co` đã tồn tại | 3 variant: `AT-S-DO`, `AT-M-DO`, `AT-L-XANH` với `variantAttr` map tương ứng | Lưu đúng 3 `ProductVariant` + `variant_option_values` tương ứng, DTO trả về đủ 3 variant với `variantAttr` là Map, không lẫn dữ liệu giữa variant | High |
| UT-PRODUCT-011 | `ProductServiceImpl.createProduct` (Images) | Unit | Tạo sản phẩm với gallery ảnh (`images` có dữ liệu / rỗng / null) | — | `images = ["url1","url2"]` và `images = null` | Có dữ liệu → lưu đúng `sortOrder`, `isPrimary=false`; rỗng/null → không lưu record nào, không lỗi | Medium |
| UT-PRODUCT-012 | `ProductServiceImpl.updateProduct` (Variant diff) | Unit | Cập nhật sản phẩm: giữ 1 variant cũ (update), thêm 1 variant mới, xóa variant không còn trong request | DB có SKU-A, SKU-B; request mới có SKU-A (update) + SKU-C (mới) | `updateProduct(id, {variants:[SKU-A mới, SKU-C]})` | SKU-A được update + reset `variant_option_values`; SKU-C insert mới; SKU-B (không còn trong list) bị xóa cùng `variant_option_values` liên quan | High |
| UT-PRODUCT-013 | `ProductServiceImpl.updateProduct` (EAV diff) | Unit | Cập nhật specs: xóa attribute value không còn trong request, update giá trị đổi, thêm attribute mới | DB có `{cpu:"Intel i5"}, {ram:"8GB"}`; request mới `{ram:"16GB", "man-hinh":"15 inch"}` | `updateProduct(id, {attributes:{ram:"16GB","man-hinh":"15 inch"}})` | `cpu` bị xóa (không còn trong incoming); `ram` được update value; `man-hinh` được insert mới (tự tạo Attribute nếu chưa có) | High |
| UT-PRODUCT-014 | `ProductServiceImpl.updateProduct` / `deleteProduct` | Unit | Cập nhật/xóa sản phẩm không tồn tại | `findById` = empty | `updateProduct(9999, dto)`; `deleteProduct(9999)` | `updateProduct` ném `ResourceNotFoundException`; `deleteProduct` không làm gì, không ném lỗi (check `if (product != null)`) | Medium |
| UT-PRODUCT-015 | `ProductServiceImpl.deleteProduct` | Unit | Xóa sản phẩm có variant + tag + image + attribute values (cascade đúng thứ tự) | Sản phẩm id=1 có đầy đủ dữ liệu liên quan | `deleteProduct(1)` | Xóa tuần tự: `product_attribute_values` → `variant_option_values`+`product_variants` → `product_tags` → `product_images` → `products`, không lỗi khóa ngoại | High |
| IT-PRODUCT-006 | `POST /api/v1/admin/products` | Integration | Tạo sản phẩm hợp lệ đầy đủ field qua REST (`variants[]`, `images[]`, `tags[]`) | ROLE_ADMIN | Body đầy đủ | HTTP 200, `code=SUCCESS`, `data.id` được sinh | High |
| IT-PRODUCT-007 | `POST /api/v1/admin/products` | Integration | Validate field số/enum không hợp lệ: thiếu `price`, `price<=0`, `salePrice>=price`, `salePrice=0`, `status` không thuộc enum | ROLE_ADMIN | `POST /products` với từng trường hợp trên | HTTP 400 `VALIDATION_FAILED`/`BAD_REQUEST` với message tương ứng cho mỗi trường hợp | High |
| IT-PRODUCT-008 | `POST /api/v1/admin/products` | Integration | **[DEFECT]** Tạo sản phẩm trùng `slug` với sản phẩm đã tồn tại, hoặc 2 variant trùng `sku` trong cùng request | Sản phẩm `slug=iphone-15` đã tồn tại | `POST /products` với slug trùng, hoặc 2 variant cùng `sku="SKU-001"` | **Không có validate trùng ở tầng service** → vi phạm unique constraint DB → HTTP 500 `INTERNAL_ERROR` (không phải lỗi nghiệp vụ 400 rõ nghĩa) — defect cần dev xử lý | High |
| IT-PRODUCT-009 | `PUT /api/v1/admin/products/{id}` | Integration | Cập nhật sản phẩm: gửi `tags`/`images` mới sẽ xóa toàn bộ dữ liệu cũ (kể cả khi gửi rỗng) | Sản phẩm có 3 tag cũ, ảnh gallery cũ | `PUT /products/{id}` body `{"tags":["new-tag"],"images":[]}` | 3 tag cũ bị xóa chỉ còn `["new-tag"]`; toàn bộ ảnh gallery cũ bị xóa vì `images=[]` (không giữ ảnh cũ khi không gửi lại) | High |
| IT-PRODUCT-010 | `POST /api/v1/admin/products`, `DELETE /admin/products/{id}` | Integration | Kiểm tra RBAC: tạo sản phẩm bằng `ROLE_USER` thường; xóa sản phẩm bằng `ROLE_STAFF` (chỉ ADMIN được xóa) | Token tương ứng | `POST`/`DELETE /products` | HTTP 403 Forbidden ở cả 2 trường hợp | High |
| IT-PRODUCT-011 | `GET /api/v1/internal/products/price-info` | Integration | Internal API lấy nhiều sản phẩm theo danh sách id (dùng bởi Order Service), trộn id tồn tại và không tồn tại | 3 sản phẩm id=1,2,3 tồn tại | `GET .../price-info?ids=1,2,3` và `?ids=1,99999` | Trả đủ 3 `ProductDto` khi tất cả id hợp lệ; id không tồn tại bị bỏ qua thầm lặng (chỉ trả record có thật) khi trộn lẫn | High |

---

## 5. Category Product Aggregation (Danh mục cha gộp sản phẩm danh mục con)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-016 | `ProductServiceImpl.resolveCategoryIdsWithDescendants` | Unit | Category không có con (leaf node) | `findByParentId(5)` trả `[]` | `resolveCategoryIdsWithDescendants(5)` | Trả về `[5]` (chỉ chính nó) | High |
| UT-PRODUCT-017 | `ProductServiceImpl.resolveCategoryIdsWithDescendants` | Unit | Category cha có 2 con trực tiếp, không có cháu | `findByParentId(1)→[2,3]` | `resolveCategoryIdsWithDescendants(1)` | Trả về `[1,2,3]` (thứ tự BFS) | High |
| UT-PRODUCT-018 | `ProductServiceImpl.resolveCategoryIdsWithDescendants` | Unit | Cây danh mục 3 cấp: cha → con → cháu | `findByParentId(1)→[2]`, `findByParentId(2)→[3,4]` | `resolveCategoryIdsWithDescendants(1)` | Trả về `[1,2,3,4]` — bao gồm cả cấp cháu, xác nhận đệ quy nhiều cấp qua BFS Queue | High |
| UT-PRODUCT-019 | `ProductServiceImpl.getProductsByCategory` | Unit | Category không có con — dùng query đơn `findByCategoryId` (tối ưu tránh `IN` không cần thiết) | `resolveCategoryIdsWithDescendants` trả `[5]` (size=1) | `getProductsByCategory(5, pageable)` | Gọi `findByCategoryId(5, pageable)`, KHÔNG gọi `findByCategoryIdIn` | Medium |
| UT-PRODUCT-020 | `ProductServiceImpl.getProductsByCategory` | Unit | Category cha có con → dùng `findByCategoryIdIn` | `resolveCategoryIdsWithDescendants` trả `[1,2,3]` | `getProductsByCategory(1, pageable)` | Gọi `findByCategoryIdIn([1,2,3], pageable)`, trả về sản phẩm gán trực tiếp vào cả 3 category | High |
| IT-PRODUCT-012 | `GET /api/v1/public/products/category/{categoryId}` | Integration | Category cha (Điện thoại) gộp sản phẩm của category con (Smartphone, Điện thoại phổ thông) | Cha(1) có con (2), (3). P1→cat1, P2→cat2, P3→cat3 | `GET /products/category/1?page=0&size=10` | HTTP 200, `data.content` chứa cả P1, P2, P3 mặc dù chỉ P1 gán trực tiếp vào category 1 | High |
| IT-PRODUCT-013 | `GET /api/v1/public/products/category/{categoryId}` | Integration | Gọi trên category con (Smartphone, id=2) — chỉ trả sản phẩm của chính nó, KHÔNG kéo ngược lên sản phẩm của cha | Như trên | `GET /products/category/2?page=0&size=10` | HTTP 200, chỉ trả về P2 (không có P1, P3) | High |
| IT-PRODUCT-014 | `GET /api/v1/public/products/category/{categoryId}` | Integration | Category cấp cháu 3 tầng: Cha(1)→Con(2)→Cháu(3), sản phẩm P3 chỉ gán vào Cháu(3) | Cây 3 cấp như trên | `GET /products/category/1?page=0&size=10` | HTTP 200, `data.content` chứa P3 (Cha(1) gộp đệ quy tới cấp cháu, không chỉ 1 cấp) | High |
| IT-PRODUCT-015 | `GET /api/v1/public/products/category/{categoryId}` | Integration | Category không có sản phẩm nào (chính nó + toàn bộ con); category không tồn tại trong DB | Category id=50 rỗng; categoryId=999999 chưa từng tạo | `GET /products/category/50`; `GET /products/category/999999` | HTTP 200, `data.content=[]`, `data.hasNext=false` ở cả 2 trường hợp (không lỗi 404, vì không kiểm tra category có tồn tại) | Medium |
| IT-PRODUCT-016 | `GET /api/v1/public/products/category/{categoryId}` | Integration | Phân trang khi category cha gộp nhiều sản phẩm từ nhiều category con (>10 sản phẩm) | Cha(1) + 3 con, tổng 25 sản phẩm phân bố cả 4 category | `GET /products/category/1?page=0&size=10` rồi `page=1&size=10` | Mỗi page trả đúng 10 phần tử liên tục không trùng lặp, `hasNext` đúng ở từng page | Medium |

---

## 6. Catalog Import (Bulk Import từ JSON Manifest)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-021 | `CatalogImportServiceImpl.validateManifest` | Unit | Nhóm lỗi validate manifest cơ bản: manifest null, category slug trùng trong manifest, `parentSlug` không tồn tại, category tự làm cha, brand/product tham chiếu `categorySlug`/`brandSlug` không tồn tại, `price<=0`, `salePrice>=price`, SKU trùng giữa các product | Từng input tương ứng theo case | `importCatalog(manifest, dryRun=true)` cho mỗi case | Mỗi case trả `result.errors` chứa message đúng nghĩa tương ứng, `success=false`, không ghi DB | High |
| UT-PRODUCT-022 | `CatalogImportServiceImpl.sortCategories/visitCategory` | Unit | Cycle gián tiếp qua nhiều category (A→parent=B, B→parent=A), không tự-tham-chiếu trực tiếp nên qua được check cơ bản | 2 category tham chiếu vòng lẫn nhau | `importCatalog(manifest, true)` | Ném `IllegalArgumentException("Category parent cycle detected at slug: ...")` | High |
| UT-PRODUCT-023 | `CatalogImportServiceImpl.importCatalog` (dry-run) | Unit | Dry-run hợp lệ hoàn toàn — không ghi DB | Manifest hợp lệ | `importCatalog(manifest, dryRun=true)` | `success=true`, cảnh báo "Dry-run mode...", id giả (`fakeId`) được sinh, KHÔNG có bản ghi thực nào được lưu (verify `save` không được gọi) | High |
| UT-PRODUCT-024 | `CatalogImportServiceImpl.importCatalog` (apply) | Unit | Import thật (`dryRun=false`) tạo mới toàn bộ attribute/category/brand/product theo đúng thứ tự | Manifest hợp lệ đầy đủ, DB rỗng | `importCatalog(manifest, dryRun=false)` | Ghi DB thật theo thứ tự: attributes → categories → categoryAttributes → brands → products; `counts.*` khớp số lượng; `success=true` | High |
| UT-PRODUCT-025 | `CatalogImportServiceImpl.importCategories` | Unit | Import categories theo đúng thứ tự cha trước con (dùng `sortCategories`) dù JSON để con trước cha | Manifest có category con đứng TRƯỚC category cha | `importCatalog(manifest, dryRun=false)` | Category cha được insert trước để category con lấy được `parentId` đúng | High |
| UT-PRODUCT-026 | `CatalogImportServiceImpl.importBrands` (merge category) | Unit | Import 2 file riêng biệt, cùng brand slug nhưng khác `categorySlugs` — brand-category KHÔNG bị ghi đè (union merge) | Lần 1: brand `samsung` gắn `dien-thoai`; lần 2: brand `samsung` gắn `tivi` | Gọi `importCatalog(manifest2, dryRun=false)` sau khi đã import manifest1 | Brand `samsung` sau lần 2 có `categoryIds={dien-thoai, tivi}` — KHÔNG bị mất liên kết cũ | High |
| UT-PRODUCT-027 | `CatalogImportServiceImpl.importBrands/importAttributes/importProducts` | Unit | Import lại brand/attribute/product đã tồn tại (theo slug/code) → update thay vì tạo trùng; field không gửi (null) giữ nguyên giá trị cũ | Brand/attribute/product đã tồn tại với dữ liệu cũ | Import item chỉ gửi 1 phần field mới | Gọi `update*` tương ứng, `counts.*Updated` tăng, field không gửi giữ nguyên giá trị cũ (ví dụ `valueType`/`allowedValues` của attribute) | High |
| UT-PRODUCT-028 | `CatalogImportServiceImpl.importProducts` | Unit | Variant kế thừa giá từ product cha khi không set giá riêng; `salePrice>=price` của variant tự động set null (không throw) | `ImportVariantItem{price:null}` và `{price:100000, salePrice:150000}` | `importCatalog(manifest, dryRun=false)` | Variant kế thừa `salePrice`/`price` của product cha khi thiếu; variant có `salePrice` không hợp lệ được lưu với `salePrice=null`, không lỗi | Medium |
| IT-PRODUCT-017 | `POST /api/v1/admin/import/catalog?dryRun=true` | Integration | Import dry-run (mặc định) qua REST — không ghi DB | ROLE_ADMIN, manifest hợp lệ | `POST /admin/import/catalog` (default `dryRun=true`) | HTTP 200, `data.dryRun=true`, `data.success=true`; xác nhận KHÔNG có category/product mới nào được tạo | High |
| IT-PRODUCT-018 | `POST /api/v1/admin/import/catalog?dryRun=false` | Integration | Import thật ghi DB qua REST (kèm unicode tiếng Việt) | ROLE_ADMIN, manifest với 2 category, 1 brand, 3 product | `POST /admin/import/catalog?dryRun=false` | HTTP 200, dữ liệu được ghi thật vào DB, `GET /products/slug/{slug}` trả đúng tên tiếng Việt có dấu | High |
| IT-PRODUCT-019 | `POST /api/v1/admin/import/catalog?dryRun=false` | Integration | Import manifest có lỗi validate (slug trùng) → rollback toàn bộ | Manifest có 2 category cùng slug | `POST /admin/import/catalog?dryRun=false` | HTTP 200 nhưng `data.success=false`, `data.errors` không rỗng, KHÔNG có dữ liệu nào được ghi (transaction rollback toàn bộ vì `validateManifest` chặn sớm) | High |
| IT-PRODUCT-020 | `POST /api/v1/admin/import/catalog` | Integration | Import 2 lần liên tiếp — lần 2 chứa brand cùng slug với `categorySlugs` khác, xác nhận merge qua REST thật (end-to-end) | Lần 1 import brand `samsung` gắn `dien-thoai`; lần 2 gắn `tivi` (2 request `dryRun=false` riêng biệt) | Gọi lần 1 rồi lần 2 | Sau lần 2, `GET /brands/slug/samsung` trả về `categoryIds` chứa CẢ `dien-thoai` và `tivi` (không bị lần 2 ghi đè xóa mất) | High |

---

## 7. Search (Elasticsearch + Fallback PostgreSQL)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-029 | `SearchServiceImpl.searchProducts` | Unit | Elasticsearch hoạt động bình thường: có keyword và keyword rỗng/null (lấy toàn bộ) | ES mock trả kết quả | `searchProducts("nike", pageable)`; `searchProducts(null, pageable)` | Trả về `Page<ProductDocument>` từ ES trực tiếp (không gọi fallback DB); keyword rỗng gọi `findAll` không lọc | High |
| UT-PRODUCT-030 | `SearchServiceImpl.searchProducts` | Unit | Elasticsearch ném exception (mất kết nối) → fallback DB, cả khi keyword có giá trị và khi keyword rỗng | Mock ES throw exception | `searchProducts("nike"/"" , pageable)` khi ES lỗi | Catch exception, log lỗi, gọi `productRepository.findByNameContainingOrDescriptionContaining` (có keyword) hoặc `findByActive(true, ...)` (keyword rỗng), map `Product` → `ProductDocument` đúng field | High |
| UT-PRODUCT-031 | `SearchServiceImpl.indexProduct` / `removeProductIndex` | Unit | Index/remove sản phẩm khi ES lỗi hoặc sản phẩm không tồn tại | ES throw exception / `findById` empty | `indexProduct(id)`, `removeProductIndex(id)` | Không throw ra ngoài (silent fail, chỉ log warning), không ảnh hưởng transaction chính; sản phẩm không tồn tại → không gọi `save` | Medium |
| IT-PRODUCT-021 | `GET /api/v1/public/products/search?q=...` | Integration | Tìm kiếm full-text theo tên (kể cả tiếng Việt có dấu) và trường hợp không khớp kết quả nào | ES đã index sản phẩm mẫu | `GET /products/search?q=nike`; `q=màu đỏ`; `q=xyzkhongtontai123` | HTTP 200; trả đúng sản phẩm khớp (kể cả unicode có dấu, không lỗi encoding); không khớp → `data.content=[]` | High |
| IT-PRODUCT-022 | `GET /api/v1/public/products/search?q=...` | Integration | Elasticsearch container down (giả lập ngắt kết nối ES) | ES service bị stop/network partition | `GET /products/search?q=nike` | HTTP 200 (không lỗi 5xx), kết quả trả về từ fallback PostgreSQL `LIKE`, cấu trúc `ProductDocument` giữ nguyên format | High |

---

## 8. Upload ảnh sản phẩm (MinIO)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PRODUCT-032 | `MinioStorageServiceImpl.uploadFile` | Unit | Upload file rỗng hoặc `null` | `MultipartFile` mock rỗng/null | `uploadFile(emptyFile/null, "products")` | Ném `IllegalArgumentException("Tệp tin tải lên không được trống.")` | High |
| UT-PRODUCT-033 | `MinioStorageServiceImpl.uploadFile` | Unit | `contentType` không hợp lệ (`application/pdf`, `text/plain`) hoặc `null` | Mock file tương ứng | `uploadFile(file, "products")` | Ném `IllegalArgumentException("Định dạng tệp không hợp lệ. Chỉ chấp nhận JPEG, PNG, GIF, WEBP.")` cho cả 2 trường hợp | High |
| UT-PRODUCT-034 | `MinioStorageServiceImpl.uploadFile` | Unit | Upload thành công file WEBP hợp lệ | Mock `contentType="image/webp"`, MinIO client mock thành công | `uploadFile(webpFile, "products")` | Trả về URL dạng `{publicEndpoint}/{bucket}/products/{uuid}.webp` | High |
| UT-PRODUCT-035 | `MinioStorageServiceImpl.uploadFile` | Unit | `folder` chứa ký tự đặc biệt / path traversal (`../../etc`) | `folder = "../../etc"` | `uploadFile(file, "../../etc")` | Ký tự không hợp lệ bị loại bỏ qua regex `replaceAll("[^a-zA-Z0-9/_-]", "")` → object path an toàn, không có path traversal thực sự ra ngoài bucket | Medium |
| UT-PRODUCT-036 | `MinioStorageServiceImpl.uploadFile` | Unit | Bucket chưa tồn tại lần đầu chạy; MinIO server lỗi kết nối khi `putObject` | `bucketExists()=false` / `putObject` throw exception | `uploadFile(file, "products")` | Bucket chưa có → gọi `makeBucket`+`setBucketPolicy` trước khi ghi; lỗi kết nối → ném `RuntimeException("Không thể tải ảnh lên hệ thống lưu trữ.", e)`, không lộ raw exception | Medium |
| IT-PRODUCT-023 | `POST /api/v1/admin/products/images/upload` | Integration | Upload ảnh thành công qua REST (multipart) | ROLE_ADMIN/STAFF, MinIO test container sẵn sàng | Multipart `file=anh.webp`, `folder=products` | HTTP 200, `data.url` là URL public hợp lệ tới MinIO | High |
| IT-PRODUCT-024 | `POST /api/v1/admin/products/images/upload` | Integration | Nhóm lỗi validate: thiếu field `file`, file rỗng (0 byte), định dạng không hỗ trợ (`.pdf`) | ROLE_ADMIN | 3 request multipart tương ứng | HTTP 400 cho cả 3 trường hợp với message đúng nghĩa (thiếu param / "Tệp tin tải lên không được trống." / "Định dạng tệp không hợp lệ...") | High |

---

## 9. Edge Case & Cross-cutting Concerns (tiêu biểu)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-PRODUCT-025 | Product nhiều variant | Integration | Sản phẩm có 6 variant (3 màu x 2 size) — kiểm tra dữ liệu trả về đầy đủ, không lẫn giữa các variant | Tạo sản phẩm với 6 variant, mỗi variant có `variantAttr` khác nhau | `GET /products/{id}` | HTTP 200, `data.variants` có đúng 6 phần tử, mỗi variant có `variantAttr` map đúng cặp color/size riêng biệt | High |
| UT-PRODUCT-037 | `ProductServiceImpl.saveSpecifications` | Unit | `specsObj` là chuỗi JSON string (dữ liệu import cũ) thay vì Map, hoặc chuỗi rỗng/không hợp lệ | `attributes` là String với nội dung hợp lệ/rỗng/sai format | `createProduct(dto)` với từng dạng input | Chuỗi JSON hợp lệ được parse và lưu đúng; chuỗi rỗng/`"null"` không lưu gì, không lỗi; chuỗi sai format bị catch, log lỗi, sản phẩm vẫn tạo thành công nhưng không có specs (không rollback toàn bộ) | Medium |
| IT-PRODUCT-026 | Import + Search đồng bộ | Integration | Sau khi `POST /admin/import/catalog?dryRun=false` tạo sản phẩm mới, sản phẩm phải được index vào ES post-commit và tìm được ngay qua search | Manifest import 1 sản phẩm mới | 1) `POST /admin/import/catalog?dryRun=false`. 2) `GET /products/search?q=...` | Sản phẩm mới xuất hiện trong kết quả search (`importProducts` cũng kích hoạt `searchService.indexProduct` post-commit như luồng tạo sản phẩm thông thường) | Medium |

---

## 10. Ma trận Priority tổng hợp

| Priority | Số lượng Test Case (ước tính) | Nhóm tiêu biểu |
|---|---|---|
| High | ~40 | CRUD/variant/EAV luồng chính, category aggregation, catalog import (dry-run/apply/merge), search fallback, upload ảnh, 2 defect (slug/SKU 500, category cycle) |
| Medium | ~19 | Case phụ trợ, orphan reference, phân trang, EAV field giữ nguyên giá trị cũ, path traversal sanitize |
| Low | ~4 | Case hiếm gặp, hành vi chung không lỗi nghiêm trọng |

**Lưu ý khi thực thi:**
1. `IT-PRODUCT-002` (category tự làm cha, không validate cycle) và `IT-PRODUCT-008` (trùng slug/SKU → lỗi 500 thay vì 400) là 2 defect đã xác nhận trên code thật — QA cần trao đổi với dev để mở bug ticket hoặc ghi nhận vào Known Issues, không tự sửa kỳ vọng test.
2. Test Elasticsearch/MinIO cần môi trường test-container hoặc mock server; `IT-PRODUCT-022` yêu cầu khả năng chủ động ngắt kết nối ES giữa bài test.
3. Test catalog import cần dọn dữ liệu (rollback DB) giữa các test case vì `importCatalog` ghi nhiều bảng cùng lúc trong 1 transaction.
