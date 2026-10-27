# Những thiếu sót về nghiệp vụ trong luồng hệ thống hiện tại

Tài liệu này liệt kê những chỗ hệ thống **chạy đúng như code viết, nhưng quy tắc nghiệp vụ chưa giống thực tế** của một sàn
thương mại điện tử bán đồ công nghệ. So sánh dựa trên cách làm phổ biến của các sàn và chuỗi bán lẻ lớn (Shopee, Tiki,
Thế Giới Di Động, CellphoneS…).

- **Nguồn:** kết quả review code, kiểm thử API, giao diện, unit test và hiệu năng ngày 17–18/10/2026 (nhánh `develop`).
  Báo cáo chi tiết kèm bằng chứng nằm trong `docs/test/SQA_TechStore.xlsx`. Mã như `UI_PH4_FR02_007` hay `TC_PH3_DELIV_03` là ID ca kiểm thử trong báo cáo đó (`UI_*`: giao diện, `TC_*`: unit test).
- **Không bao gồm** các lỗi thuần kỹ thuật (sai mã HTTP, thiếu timeout, race condition…). Những lỗi đó đã nằm trong báo cáo kiểm thử.
- **Mức độ:**
  - **Cao:** gây thiệt hại tiền, hàng, hoặc khiếu nại trực tiếp.
  - **Trung bình:** trải nghiệm kém hoặc vận hành khó.
  - **Thấp:** thiếu tính năng thường có, có thể để vào Hướng phát triển.

---

## Tóm tắt: 11 điểm nên ưu tiên

| # | Thiếu sót | Luồng | Mức độ |
|---|---|---|---|
| 1 | VAT 10% bị **cộng thêm** lên giá niêm yết, khách trả nhiều hơn giá đã thấy | Đặt hàng | Cao |
| 2 | Admin hủy đơn **đang giao** thì kho được cộng lại ngay, dù hàng còn nằm ở đơn vị vận chuyển | Hủy đơn / Kho | Cao |
| 3 | Hủy đơn COD là **mất voucher**, vì COD được xác nhận ngay lúc đặt | Hủy đơn / Khuyến mãi | Cao |
| 4 | Thanh toán VNPay thất bại thì đơn **bị hủy ngay**, khách không được thanh toán lại hoặc đổi sang COD | Thanh toán | Cao |
| 5 | Khách hủy ở trang VNPay vẫn thấy thông báo **"thành công"** | Thanh toán | Cao |
| 6 | Admin có thể chuyển đơn **chưa thanh toán** thẳng sang **Đã giao** | Vận chuyển | Cao |
| 7 | Để trống ô chỉnh tồn kho rồi lưu thì tồn kho về **0** mà vẫn báo thành công | Kho | Cao |
| 8 | Phí ship **cố định 30.000đ** cho mọi địa chỉ và mọi khối lượng | Đặt hàng | Trung bình |
| 9 | **Không có đổi trả** sau khi nhận hàng, và không có yêu cầu bảo hành | Sau bán | Trung bình |
| 10 | Dashboard AI hiển thị **số liệu giả** (dự báo, khuyến nghị nhập hàng, nút gửi email) như số thật | Phân tích | Trung bình |
| 11 | **COD không giới hạn giá trị đơn**: đơn hàng chục triệu vẫn được thanh toán khi nhận, rủi ro "bom hàng" | Thanh toán | Cao |

---

## Trạng thái xử lý (cập nhật 21/10/2026)

Các bảng chi tiết bên dưới giữ nguyên để làm tư liệu phân tích. Mục này ghi lại những gì **đã sửa trong code** sau đợt rà soát.
Kiểm chứng: 232 unit test Java (gồm toàn bộ BugCheck), 272 test Python của 4 dịch vụ AI, và 41 ca E2E chạy qua API
gateway trên hệ thống thật đều đạt.

**Đã sửa: toàn bộ 11 điểm ưu tiên** (riêng điểm 8, 9, 10 là sửa một phần, ghi rõ dưới đây)

| # | Cách xử lý |
|---|---|
| 1 | Giá niêm yết **đã gồm VAT**; VAT chỉ tách ra để hiển thị ("Trong đó VAT"). Số tiền xem trước ở checkout lấy từ server nên luôn khớp với đơn tạo ra |
| 2 | Hủy đơn đang giao → trạng thái **Chờ hoàn hàng** (`RETURNING`), chưa cộng kho; admin bấm "Xác nhận đã nhận hàng hoàn" → `RETURNED`, khi đó mới cộng kho và hoàn tiền (nếu đã trả online) |
| 3 | Hủy trước khi giao (kể cả COD) **trả voucher** nếu còn hạn; lỗi khi trả voucher được tự thử lại |
| 4 | VNPay thất bại **không hủy đơn**: đơn được giữ 30 phút, khách **thanh toán lại** hoặc **đổi sang COD** (nếu trong ngưỡng) ngay trong trang chi tiết đơn |
| 5 | Trang kết quả đọc **trạng thái thật từ server**; tham số trên URL không còn quyết định thông báo |
| 6 | Trạng thái đơn đi theo **máy trạng thái** ở backend; sự kiện đến muộn không làm "sống lại" đơn đã hủy |
| 7 | Chỉnh tồn kho: ô trống, số lẻ, thiếu lý do đều bị từ chối; điều chỉnh lớn phải xác nhận |
| 8 | *Một phần:* phí ship 30.000đ, **miễn phí cho đơn từ 500.000đ**; bước giỏ hàng ghi "Tính ở bước sau". Chưa tính theo vùng/khối lượng |
| 9 | *Chưa làm luồng online:* tài liệu chính sách đã sửa cho đúng (đổi trả, bảo hành qua hotline/CSKH) |
| 10 | *Một phần:* khuyến nghị nhập hàng tính từ **tồn kho thật**; dự báo và phát hiện bất thường gắn nhãn **"Dữ liệu minh họa"**; các nút giả bị vô hiệu |
| 11 | COD chỉ áp dụng cho đơn **đến 20.000.000đ**; giao diện khóa lựa chọn COD và giải thích lý do |

**Đã sửa trong các mục chi tiết**
- **Tài khoản:** đổi họ tên được lưu (không bị Keycloak ghi đè); kiểm tra số điện thoại Việt Nam; đơn lưu **tên và số điện thoại người nhận** riêng; khóa tài khoản báo lỗi rõ nếu Keycloak lỗi.
- **Sản phẩm:** API công khai **ẩn giá vốn**; sản phẩm ngừng bán bị ẩn và **không đặt mua được**; điểm đánh giá hiển thị đúng; bỏ ★5 giả; bỏ "Ship 2 ngày / Hà Nội"; đánh giá chỉ 1–5 sao, chỉ người **đã nhận hàng**, không kiểm tra được đơn thì từ chối; bộ lọc giá giữ đúng lựa chọn; sản phẩm liên quan theo cùng loại, thương hiệu, tầm giá; ô tìm kiếm dùng **tìm kiếm AI** (có dự phòng theo từ khóa).
- **Giỏ hàng / đặt hàng:** tối đa **5 sản phẩm mỗi loại**, tối đa **3 đơn chưa thanh toán**; chữ "đang chọn" sửa thành "trong giỏ"; trang đặt hàng thành công hiện đúng địa chỉ.
- **Hủy đơn:** bắt buộc chọn **lý do hủy**; quy tắc hủy kiểm tra ở backend **theo trạng thái** (bỏ mốc 2 giờ); trang đơn hiển thị lý do, người hủy và trạng thái hoàn tiền.
- **Thanh toán:**
  - Admin hoàn tiền chỉ báo "thành công" khi cổng thanh toán đã xác nhận.
  - Chỉ chấp nhận VNPay và COD.
  - Nếu khách vẫn trả ở trang VNPay cũ sau khi đã bấm thanh toán lại, giao dịch vẫn được ghi nhận; trả trùng thì tạo yêu cầu hoàn tiền.
- **Khuyến mãi:**
  - Tắt hoặc xóa chiến dịch là dừng hẳn tiến trình Camunda.
  - Sửa chiến dịch không ghi đè ngân sách còn lại.
  - Điều kiện địa chỉ nhận tên tỉnh đầy đủ.
  - Lỗi tạm thời khi phát voucher hoặc cộng điểm được thử lại.
  - Trang hạng thành viên không còn hứa tự tích điểm.
- **Thông báo:** email "Đang giao" gửi đúng địa chỉ khách; email xác nhận có danh sách sản phẩm và tổng tiền; thêm **email hoàn tiền**; gửi email lỗi thì thử lại.
- **Gợi ý sản phẩm:**
  - "Mua kèm" dựa trên sản phẩm trong giỏ.
  - Sửa lỗi định dạng thời gian khiến "Xem gần đây" không cập nhật.
  - Sau model có bước sắp xếp lại theo tầm giá và độ đa dạng, loại bỏ sản phẩm hết hàng hoặc ngừng bán.
  - "Thêm nhanh vào giỏ" chỉ báo kết quả thật.
- **AI / quản trị:** API huấn luyện và quét rủi ro **chỉ quản trị viên** gọi được; sửa header CORS trùng làm hỏng tab AI Analytics.
- **Chatbot / CSKH:**
  - Hiểu câu hỏi theo khoảng giá.
  - Khách đã đăng nhập hỏi đơn thì được liệt kê đơn gần nhất.
  - Khách bực bội hoặc hỏi lặp lại thì được đề nghị gặp nhân viên.
  - Bỏ câu "đã chuyển tiếp email" vốn sai sự thật; tin nhắn ngoài giờ được lưu và báo cho bộ phận hỗ trợ.
  - Khách vãng lai không truy cập được phòng chat của người khác.

**Chưa làm (đề xuất đưa vào Hướng phát triển)**
- Sau bán: đổi trả, yêu cầu bảo hành online, trạng thái đóng gói, hủy một phần đơn.
- Khách lẻ: khách vãng lai thêm vào giỏ, chọn từng món khi thanh toán.
- Doanh nghiệp: xuất hóa đơn VAT công ty.
- Khuyến mãi: mã khuyến mãi công khai, tự tích điểm theo đơn, điểm hết hạn.
- Vận chuyển: phí ship theo vùng và khối lượng, tích hợp hãng vận chuyển thật.
- Kho: phiếu nhập có duyệt, giá nhập theo lô, nhiều kho, kiểm kê, định mức tồn riêng cho từng sản phẩm.
- Thanh toán: trả góp, ví điện tử.
- Thông báo và CSKH: trung tâm thông báo, thông báo đẩy, chuyển lịch sử chat AI sang nhân viên, CSAT, hàng chờ.
- Dữ liệu AI: dự báo nhu cầu và phát hiện bất thường trên dữ liệu thật.
- Dữ liệu catalog: 311 sản phẩm trang nguồn ghi "Liên hệ" (trước để giá tạm 1.000.000đ) **đã được thay bằng giá tham khảo**
  ước tính có căn cứ, xem `tools/catalog-import/price-estimates.csv`. Khi có nguồn giá thật nên cập nhật lại.

---

## 1. Tài khoản và hồ sơ khách hàng

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| Khách đổi họ tên được báo thành công, nhưng lần sau mở hồ sơ tên bị ghi đè lại bằng tên trong Keycloak (`UI_PH1_FR02_002`) | Khách tự quản lý tên hiển thị, tên nhận hàng | Khách không đổi được tên, tưởng hệ thống lỗi | Trung bình |
| Sổ địa chỉ chấp nhận số điện thoại "abcxyz" (`UI_PH1_FR02_007`) | Kiểm tra định dạng số điện thoại Việt Nam | Shipper không liên lạc được, giao hàng thất bại | Trung bình |
| Đơn hàng **không lưu tên người nhận**; chi tiết đơn hiện tên tài khoản (`UI_PH3_FR03_002`) | Mỗi đơn lưu tên, số điện thoại, địa chỉ người nhận riêng (mua tặng, nhờ người nhận hộ) | Không giao hộ hay mua tặng được | Trung bình |
| Admin khóa tài khoản: nếu đồng bộ Keycloak lỗi, hệ thống vẫn báo đã khóa nhưng khách vẫn đăng nhập được (`TC_PH1_ADMIN_07`) | Khóa tài khoản phải có hiệu lực thật, hoặc báo lỗi rõ ràng | Không chặn được tài khoản gian lận | Trung bình |
| Bắt buộc đăng nhập mới thêm được vào giỏ | Nhiều sàn cho khách vãng lai thêm giỏ, đến lúc thanh toán mới yêu cầu đăng nhập | Mất khách mua lần đầu | Thấp |

> Địa chỉ 2 cấp (tỉnh/thành + phường/xã) là **đúng thực tế** theo sắp xếp đơn vị hành chính từ 01/07/2025, không phải thiếu sót.

## 2. Sản phẩm, giá và tìm kiếm

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| API công khai trả cả **giá vốn** (`costPrice`) của sản phẩm (`ProductServiceImpl.java:649, 669`) | Giá vốn là dữ liệu nội bộ, chỉ quản trị thấy | Lộ biên lợi nhuận cho đối thủ | Cao |
| Sản phẩm đã ẩn (ngừng bán) vẫn có thể xuất hiện trong danh sách và kết quả tìm kiếm công khai | Sản phẩm ngừng bán không hiển thị, hoặc hiện "Ngừng kinh doanh" | Khách đặt món không còn bán | Trung bình |
| Ô tìm kiếm trên web chỉ so khớp **chứa chuỗi**; tìm kiếm ngữ nghĩa và AI đã xây dựng nhưng web không dùng | Ô tìm kiếm chính dùng công nghệ tốt nhất đang có | Khách gõ "tai nghe chống ồn" không ra "headphone ANC"; tính năng AI không tới được người dùng | Trung bình |
| Trang sản phẩm luôn hiện **0 sao** dù đã có đánh giá (`UI_PH2_FR02_004`) | Hiển thị điểm trung bình và số lượt đánh giá | Mất niềm tin, giảm chuyển đổi | Trung bình |
| Ngược lại, thẻ sản phẩm (trang chủ, danh sách, gợi ý) hiện **★5 cho sản phẩm chưa có đánh giá nào**: giao diện tự thay rating 0 bằng 5 (`ProductCard.jsx:13`: `rating > 0 ? rating : 5`) | Ghi "Chưa có đánh giá" hoặc ẩn số sao | Thông tin sai lệch với khách; sản phẩm chưa ai mua trông như được chấm điểm tuyệt đối | Trung bình |
| Thẻ sản phẩm hiện **"Ship 2 ngày"** và **"Hà Nội"** cho mọi sản phẩm, nhưng đây là chữ viết cứng (`ProductCard.jsx:295`, `:306`), không tính theo địa chỉ hay kho | Thời gian giao dự kiến tính theo địa chỉ khách và vị trí kho; chưa tính được thì không hiện | Hứa thời gian giao không có cơ sở, dễ bị khiếu nại | Thấp |
| Điểm đánh giá không bị giới hạn 1–5 sao (`TC_PH2_REVIEW_06`) | Chỉ cho chọn 1–5 sao | Điểm trung bình bị méo | Trung bình |
| Order-service lỗi thì đánh giá vẫn được lưu, không kiểm tra khách đã mua hay chưa (`TC_PH2_REVIEW_07`) | Chỉ người đã nhận hàng mới được đánh giá | Có thể bị đánh giá ảo | Trung bình |
| Bộ lọc khoảng giá có sẵn ("2 – 10 triệu") bị ghi đè về toàn bộ khoảng giá (`UI_PH2_FR01_004`) | Bộ lọc giữ đúng lựa chọn | Khách không lọc được theo ngân sách | Trung bình |
| "Sản phẩm liên quan" luôn là 8 sản phẩm đầu danh sách | Sản phẩm cùng loại, cùng tầm giá, hoặc thường mua cùng | Gợi ý không liên quan | Thấp |

## 3. Giỏ hàng, giá thanh toán và đặt hàng

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| **VAT 10% được cộng thêm** lên giá sản phẩm (`OrderPricingHelper.java:44-45`). Ví dụ trên trang giỏ hàng: tạm tính 47.480.000đ + VAT 4.748.000đ + ship 30.000đ = **52.258.000đ**, trong khi dòng chú thích lại ghi "Đã bao gồm VAT" | Ở Việt Nam, giá bán lẻ niêm yết cho người tiêu dùng thường **đã bao gồm VAT**; VAT chỉ được tách ra trên hóa đơn | Khách thấy giá A nhưng trả A + 10% (trong ví dụ là thừa khoảng 4,7 triệu). Dễ bị phản ánh "báo giá sai", có thể vi phạm quy định niêm yết giá; dòng chú thích mâu thuẫn với cách tính | **Cao** |
| Phí ship **cố định 30.000đ**, không phụ thuộc địa chỉ, khối lượng hay giá trị đơn; mã vận đơn giả lập `MOCK-GHTK-*`. Ở bước 1 (Giỏ hàng), **khách chưa nhập địa chỉ mà đã thấy phí ship** | Tính phí theo khu vực và khối lượng qua API hãng vận chuyển; ở bước giỏ hàng ghi "Tính ở bước sau"; miễn phí ship khi đơn vượt ngưỡng (đơn vài chục triệu gần như luôn được miễn phí) | Đơn tivi giao tỉnh xa vẫn 30.000đ; đơn 47 triệu vẫn bị tính phí ship | Trung bình |
| Thanh toán luôn lấy **toàn bộ giỏ**, không chọn từng món được. Giỏ hàng vẫn ghi **"2 sản phẩm đang chọn"** dù không có ô chọn: con số chỉ là tổng số dòng trong giỏ (`CartPage.jsx:348`); code có biến `selectedItems` nhưng không dùng | Tích chọn món cần mua, phần còn lại giữ trong giỏ | Khách phải xóa bớt giỏ mới thanh toán được; chữ "đang chọn" gây hiểu nhầm | Trung bình |
| **Không giới hạn số lượng mỗi sản phẩm** trong giỏ hay trong một đơn; nút "+" tăng được tới hết tồn kho | Sản phẩm hot (điện thoại mới ra mắt) thường giới hạn 2–3 chiếc mỗi khách | Một người có thể gom hết hàng để bán lại | Trung bình |
| **Không có lựa chọn xuất hóa đơn VAT** (tên công ty, mã số thuế, địa chỉ nhận hóa đơn) | Checkout có mục "Xuất hóa đơn công ty" | Khách doanh nghiệp không lấy được hóa đơn, nhất là với đơn giá trị cao | Trung bình |
| Giỏ hàng **không hiển thị số lượng còn lại**, và **không báo khi giá thay đổi** so với lúc thêm vào giỏ | Hiện "Chỉ còn 2 sản phẩm" và "Giá đã thay đổi" để khách quyết định | Khách bất ngờ khi tổng tiền đổi hoặc khi bị báo hết hàng lúc thanh toán | Thấp |
| Tổng tiền ở trang checkout **lệch vài nghìn đồng** so với đơn tạo ra khi dùng điểm (web tính VAT trước khi trừ điểm, server tính sau) (`UI_PH6_FR03_006`) | Số tiền xem trước và số tiền thanh toán luôn khớp | Khách thấy một số, bị trừ một số khác | Trung bình |
| Trang "Đặt hàng thành công" bỏ trống địa chỉ nhận khi khách nhập địa chỉ mới (`UI_PH3_FR02_005`) | Hiện đầy đủ thông tin để khách kiểm tra lại | Khách không chắc đơn có đúng địa chỉ | Thấp |
| Không có trạng thái **đang đóng gói / chờ lấy hàng** giữa "Đã xác nhận" và "Đang giao" | Có trạng thái chuẩn bị hàng để khách và kho cùng biết tiến độ | Không biết đơn đã được đóng gói chưa, nên hủy đơn bị tùy tiện (xem mục 4) | Thấp |
| Không giới hạn số đơn chờ thanh toán của một khách. Mỗi đơn giữ hàng trong kho 30 phút | Giới hạn số đơn chưa thanh toán, hoặc giữ hàng ngắn hơn | Một tài khoản có thể "giữ" hết hàng hot | Thấp |

## 4. Hủy đơn

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| Admin **hủy đơn đang giao** thì kho được cộng lại **ngay lập tức** | Đơn chuyển sang "chờ hoàn hàng"; kho chỉ cộng lại khi hàng hoàn về và được kiểm tra | Hệ thống bán món hàng vẫn đang nằm ở đơn vị vận chuyển | **Cao** |
| Hủy đơn đã xác nhận thì **không trả voucher**. Đơn COD được xác nhận ngay khi đặt, nên **hủy đơn COD luôn mất voucher** | Hủy trước khi giao thì trả voucher (nếu còn hạn) | Khách COD hủy sau 1 phút vẫn mất voucher, dễ khiếu nại | **Cao** |
| Không có **lý do hủy** | Bắt chọn lý do (đổi ý, đặt nhầm, muốn đổi địa chỉ, tìm được giá rẻ hơn…) | Không thống kê được nguyên nhân hủy, khó phát hiện gian lận | Trung bình |
| Giới hạn hủy trong 2 giờ chỉ kiểm tra ở giao diện; gọi thẳng API vẫn hủy được | Quy tắc hủy kiểm tra ở backend, thường theo **trạng thái** (đã đóng gói hay đã giao cho vận chuyển chưa) chứ không theo mốc giờ cố định | Quy tắc dễ bị vượt qua; mốc 2 giờ không phản ánh tiến độ kho | Trung bình |
| Đơn đã xác nhận được hủy ngay, không cần ai duyệt | Khi người bán đã chuẩn bị hàng, khách gửi **yêu cầu hủy** và chờ người bán chấp nhận | Kho đóng gói xong mới biết đơn đã bị hủy | Trung bình |
| Khách không thấy tiến trình hoàn tiền, và không có email biên lai hoàn tiền | Hiển thị trạng thái hoàn tiền kèm thời gian dự kiến, gửi email xác nhận | Khách liên tục hỏi CSKH "bao giờ nhận lại tiền" | Trung bình |
| Không hủy được **từng sản phẩm** trong một đơn | Cho hủy một phần đơn | Muốn bỏ 1 món phải hủy cả đơn rồi đặt lại | Thấp |

## 5. Thanh toán

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| Thanh toán VNPay thất bại hoặc khách bấm hủy ở VNPay thì **đơn bị hủy ngay** | Giữ đơn chờ thanh toán thêm một thời gian, cho **thanh toán lại** hoặc **đổi sang COD** | Khách nhập sai OTP một lần là mất đơn, phải đặt lại từ đầu | **Cao** |
| Khách hủy ở trang VNPay vẫn được chuyển về trang báo **"thành công… liên hệ hoàn tiền"** (`UI_PH5_FR02_007`; giả mạo tham số: `UI_PH5_FR02_004`). Trang kết quả hiển thị hoàn toàn dựa vào tham số trên URL | Hiển thị kết quả theo trạng thái thanh toán thật lấy từ server | Khách tưởng đã bị trừ tiền, gọi CSKH đòi hoàn | **Cao** |
| Admin bấm hoàn tiền thì được báo thành công ngay, dù VNPay chưa xác nhận (`UI_PH5_FR03_008`) | Báo "đã gửi yêu cầu hoàn tiền" và cập nhật khi cổng thanh toán xác nhận | Admin tưởng đã hoàn, khách chưa nhận tiền | Cao |
| Phương thức thanh toán lạ (ví dụ `MOMO`) vẫn được chấp nhận và đi qua VNPay; khi hoàn tiền, đơn này bị coi như COD và đánh dấu đã hoàn mà không chuyển tiền (`TC_PH5_INIT_08`) | Chỉ chấp nhận các phương thức được hỗ trợ | Sai lệch sổ sách hoàn tiền | Trung bình |
| Đơn COD đã giao rồi khách trả hàng: không có quy trình hoàn tiền mặt hoặc chuyển khoản | Có quy trình hoàn tiền cho đơn COD (chuyển khoản, ví) | Không xử lý được hoàn tiền COD | Thấp |
| **COD không giới hạn giá trị đơn**: đơn 52 triệu vẫn được chọn thanh toán khi nhận hàng. Code không có ngưỡng COD nào | Đơn giá trị cao phải trả trước hoặc đặt cọc; COD thường chỉ áp dụng dưới một ngưỡng | Rủi ro "bom hàng": khách không nhận, hàng giá trị lớn bị giữ ở kho và trên đường vận chuyển, mất phí ship hai chiều | **Cao** |
| **Không có trả góp**, chỉ có COD và VNPay. Tài liệu chính sách dùng cho chatbot (`FE/src/assets/policies_source/`) lại có nhắc "phí chuyển đổi trả góp" | Trả góp 0% qua thẻ tín dụng hoặc công ty tài chính là hình thức rất phổ biến với điện thoại, laptop; thường có thêm ví điện tử | Hạn chế khả năng mua đồ giá trị cao; chatbot có thể trả lời về một hình thức thanh toán không tồn tại | Trung bình |

## 6. Tồn kho và nhập hàng

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| Để trống ô "Chỉnh tồn" rồi lưu thì tồn kho về **0**, vẫn báo thành công (`UI_PH4_FR02_007`) | Bắt buộc nhập số, và hỏi xác nhận khi điều chỉnh lớn | Một cú bấm nhầm làm "hết hàng" toàn bộ biến thể | **Cao** |
| Nhập kho số lẻ (2.5) vẫn báo thành công, tồn chỉ tăng 2 (`UI_PH4_FR02_004`) | Chỉ cho nhập số nguyên dương | Sổ kho lệch so với hàng thực nhận | Trung bình |
| Nhập kho cộng ngay, không có **phiếu nhập**, không có bước duyệt; nhà cung cấp chỉ là một ô chữ tự do; không lưu giá nhập theo lô | Phiếu nhập có nhà cung cấp, giá nhập, người lập, người duyệt | Không tính được giá vốn và lợi nhuận thực, không truy được nguồn hàng | Trung bình |
| Điều chỉnh tồn kho không bắt buộc ghi lý do | Mọi điều chỉnh phải có lý do (kiểm kê, hư hỏng, mất mát) | Không truy vết được chênh lệch kho | Trung bình |
| Ngưỡng "sắp hết hàng" là một số chung cho mọi sản phẩm; backend lọc `<` trong khi giao diện ghi `≤` (`UI_PH4_FR01_002`) | Định mức tối thiểu riêng cho từng sản phẩm | Cảnh báo không chính xác | Thấp |
| Chỉ có một kho; không có kiểm kê, xuất hủy, chuyển kho | Nhiều kho hoặc nhiều cửa hàng, có kiểm kê định kỳ | Không mở rộng được ra nhiều chi nhánh | Thấp |

## 7. Vận chuyển, bảo hành và sau bán hàng

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| Admin có thể chuyển đơn **PENDING hoặc chưa thanh toán thẳng sang "Đã giao"**, bỏ qua thanh toán và bước giao hàng (`TC_PH3_DELIV_03`) | Trạng thái chỉ đi theo đúng trình tự | Đơn chưa trả tiền vẫn thành "đã giao", được tính bảo hành và được đánh giá | **Cao** |
| **Không có đổi trả hoặc hoàn hàng** sau khi nhận | Đổi trả trong 7–15 ngày là gần như bắt buộc với đồ công nghệ | Không xử lý được hàng lỗi hay giao nhầm | Trung bình |
| Tab Bảo hành chỉ để **xem hạn bảo hành**, không gửi được yêu cầu bảo hành | Tạo phiếu bảo hành, theo dõi tiến độ sửa chữa | Khách phải liên hệ ngoài hệ thống | Trung bình |
| Vận chuyển giả lập; không có theo dõi hành trình thật | Kết nối API hãng vận chuyển, hiện hành trình cho khách | Khách không biết hàng đang ở đâu | Thấp |
| Web có mục **Thu cũ đổi mới** và **Hệ thống cửa hàng** nhưng không có backend | Không hiện tính năng chưa có | Khách bấm vào tính năng "chết" | Thấp |
| **Tài liệu chính sách hứa nhiều hơn hệ thống có**: chính sách giao hàng nhắc tới "sản phẩm được miễn phí vận chuyển", chính sách đổi trả nhắc tới trả góp, trong khi hệ thống không có miễn phí ship, trả góp hay đổi trả | Chính sách công bố và tính năng thực tế phải khớp nhau | Chatbot trả lời khách theo tài liệu chính sách (RAG), nên có thể hứa điều hệ thống không làm được | Thấp |

## 8. Khuyến mãi, voucher và điểm thưởng

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| Voucher **chỉ phát qua chiến dịch** cho từng khách; không có mã khuyến mãi chung để khách nhập tay (ví dụ `SALE10`) | Có cả mã công khai (giới hạn lượt dùng) lẫn voucher cá nhân | Không chạy được khuyến mãi đại trà, không hợp tác KOL bằng mã giảm giá | Trung bình |
| Điểm thưởng **chỉ được cộng khi có chiến dịch**; nhưng trang hạng thành viên vẫn ghi "10.000đ = 1 điểm" | Mua hàng là tự tích điểm theo tỉ lệ cố định | Khách tưởng mua là có điểm, rồi thấy không có | Trung bình |
| Điểm thưởng **không bao giờ hết hạn** | Điểm hết hạn sau 12–24 tháng | Nợ điểm tích lũy vô hạn | Thấp |
| Tắt chiến dịch không dừng các tiến trình đang chạy trên Camunda; xóa chiến dịch hẹn giờ thì nó **vẫn tiếp tục chạy** (`TC_PH6_CAMP_06`) | Tắt hoặc xóa là dừng hẳn | Vẫn phát thưởng sau khi đã tắt, vượt ngân sách | Cao |
| Sửa chiến dịch có thể ghi đè ngân sách còn lại; một sự kiện có thể kích hoạt chiến dịch hai lần | Ngân sách được khóa chặt, mỗi sự kiện chỉ kích hoạt một lần | Phát vượt ngân sách | Trung bình |
| Điều kiện "Địa chỉ" của chiến dịch gần như không bao giờ khớp: giao diện gửi tên tỉnh đầy đủ, backend chỉ nhận vài giá trị cố định | Lọc theo tỉnh/thành hoạt động đúng | Không chạy được khuyến mãi theo vùng | Thấp |
| Lỗi tạm thời khi phát voucher hay cộng điểm bị bỏ qua, không thử lại (`TC_PH6_DELEGATE_02`) | Thử lại tự động | Khách đủ điều kiện mà không nhận được thưởng | Trung bình |

## 9. Thông báo

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| **Không có trung tâm thông báo** trên web; chuông thông báo của admin chỉ để trang trí; không có thông báo đẩy | Có danh sách thông báo trên web/app, thông báo đẩy khi đơn đổi trạng thái | Khách chỉ biết tin qua email | Trung bình |
| Email "Đang giao" gửi tới địa chỉ **giả** `<userId>@ecommerce.com`, vì sự kiện không mang email (`UI_PH7_FR01_003`, `TC_PH7_NOTI_07`) | Gửi đúng email của khách | Khách không nhận được tin "đang giao", còn email thì gửi tới một tên miền của bên thứ ba | Cao |
| Email xác nhận đơn thiếu danh sách sản phẩm và tổng tiền | Email xác nhận có đủ chi tiết đơn | Khách khó đối chiếu | Trung bình |
| Gửi email lỗi thì không thử lại | Thử lại, hoặc chuyển sang kênh khác | Khách bỏ lỡ thông báo quan trọng | Trung bình |
| Không có email khi hoàn tiền | Gửi email xác nhận hoàn tiền | Khách không biết đã được hoàn | Trung bình |

## 10. Gợi ý sản phẩm và thu thập hành vi

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| "Gợi ý mua kèm" trong giỏ là **cùng một danh sách phổ biến cho mọi giỏ** | Gợi ý phụ kiện liên quan tới sản phẩm trong giỏ (ốp lưng, sạc cho điện thoại) | Bỏ lỡ cơ hội bán kèm, phần mang lại lợi nhuận cao nhất | Trung bình |
| Tab "Xem gần đây" **không cập nhật** sau khi xem sản phẩm. Phần lớn sự kiện xem và thêm giỏ bị bỏ do lệch định dạng thời gian giữa Java và Python | Cập nhật tức thì | Gợi ý cá nhân hóa thiếu dữ liệu, model học trên dữ liệu không đủ | Cao |
| "Thêm nhanh vào giỏ" báo thành công rồi lại báo hết hàng | Kiểm tra tồn kho trước khi báo | Khách bối rối | Thấp |
| **Gợi ý không quan tâm tầm giá.** Ví dụ ngày 18/10: khách xem máy 4–18 triệu (HONOR 600, Redmi A7) nhưng được gợi ý Galaxy Z Fold7 và Xiaomi 17 Ultra (trên 30 triệu). SASRec chỉ học thứ tự sản phẩm, không dùng giá | Sau model có bước sắp xếp lại (re-ranking) theo tầng giá khách thường mua | Gợi ý lệch khả năng chi trả, khách ít bấm vào | Trung bình |
| **Model chưa phân biệt rõ mức độ phù hợp.** 10 gợi ý có điểm gần như bằng nhau (4,15–4,38), và đều dồn vào một cụm sản phẩm (ID 10–33, nhóm điện thoại đầu catalog) | Điểm số phân tán rõ; danh sách gợi ý đa dạng (xen danh mục, thương hiệu) | Gợi ý na ná nhau, thiếu khám phá | Trung bình |
| **Không lọc sản phẩm không còn bán khỏi lịch sử và kết quả gợi ý.** Lịch sử của khách vẫn chứa sản phẩm #2 đã không còn tra cứu được; gợi ý không kiểm tra tồn kho hay trạng thái ngừng bán | Lọc sản phẩm đã xóa, ngừng bán hoặc hết hàng trước khi gợi ý | Gợi ý món không mua được; lịch sử bị nhiễu | Trung bình |
| **Độ chính xác của model thấp, và model được huấn luyện trên dữ liệu tổng hợp.** HR@10 khoảng 0,050, so với 0,034 của baseline Category-Pop; khoảng tin cậy của chênh lệch vẫn chứa 0 nên chưa có ý nghĩa thống kê | Huấn luyện và đánh giá định kỳ trên hành vi thật; A/B test với khách thật | Chất lượng gợi ý chỉ ở mức chứng minh phương pháp | Trung bình (cần nói rõ khi báo cáo) |

## 11. Phân tích AI và dashboard quản trị

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| **Dự báo nhu cầu** và **phát hiện bất thường** là dữ liệu minh họa (sinh ngẫu nhiên hoặc viết cứng) | Dashboard chỉ hiển thị số thật, hoặc ghi rõ "chưa có dữ liệu" | Quản lý ra quyết định dựa trên số giả | Trung bình |
| Khuyến nghị nhập hàng viết cứng: "S26 Ultra còn 12 chiếc, nhập khẩn cấp" trong khi tồn thực tế là 189 (`UI_PH9_FR02_006`) | Khuyến nghị tính từ tồn kho và tốc độ bán thật | Nhập thừa hàng, đọng vốn | Trung bình |
| Nút "Kích Hoạt Chiến Dịch Ngay" báo đã gửi 220 email nhưng không gửi gì; nút khóa hay đánh dấu an toàn chỉ hiện thông báo | Nút thực hiện đúng hành động, hoặc bị ẩn đi | Quản lý tưởng đã hành động | Trung bình |
| Tab AI Analytics hiển thị số minh họa thay cho kết quả của model đã huấn luyện, do trình duyệt chặn response vì header CORS bị trùng | Hiển thị kết quả thật | Model churn đã huấn luyện không tới được người quản lý | Cao |
| **Khách hàng thường** cũng gọi được API huấn luyện model và quét rủi ro (thao tác phát voucher) | Chỉ quản trị viên được làm | Khách có thể kích hoạt phát voucher hàng loạt | Cao |
| Model dự đoán rời bỏ được huấn luyện trên **dữ liệu tổng hợp** | Huấn luyện trên dữ liệu thật, đánh giá định kỳ | Kết quả chỉ mang tính minh họa phương pháp | Thấp (cần ghi rõ khi báo cáo) |

## 12. Chatbot và hỗ trợ khách hàng

| Hiện tại | Thực tế thường làm | Hệ quả | Mức độ |
|---|---|---|---|
| Hỏi theo khoảng giá ("tai nghe dưới 500 nghìn") thì ra laptop 10–25 triệu; nút gợi ý có sẵn "Gợi ý quà tặng dưới 500 nghìn" bị từ chối là lạc đề | Hiểu và lọc đúng theo giá | Chatbot tư vấn sai ngay ở câu mẫu do chính hệ thống đưa ra | Trung bình |
| Khách đã đăng nhập hỏi về đơn hàng thì bị **hỏi lại mã đơn** thay vì tự liệt kê đơn gần nhất | Tự nhận diện khách và trả lời ngay | Trải nghiệm kém, mất lợi thế của việc đăng nhập | Trung bình |
| Lịch sử chat với AI **mất khi tải lại trang**, và không được chuyển sang cho nhân viên khi khách yêu cầu gặp người | Nhân viên thấy toàn bộ hội thoại trước đó | Khách phải kể lại từ đầu | Trung bình |
| Không có nhân viên online thì widget báo "đã chuyển tiếp email hỗ trợ" nhưng **không gửi gì** | Gửi phiếu hỗ trợ thật, hoặc báo giờ làm việc | Khách chờ phản hồi không bao giờ đến | Cao |
| Chỉ chuyển sang nhân viên khi chatbot nhận ra ý định "khiếu nại"; cảm xúc tiêu cực chỉ được ghi log | Tự chuyển sang người khi khách bực bội hoặc hỏi lặp lại | Khách giận vẫn bị chatbot trả lời tự động | Thấp |
| Không có đánh giá sau phiên hỗ trợ, không có hàng chờ ưu tiên hay giờ làm việc | Có đánh giá chất lượng (CSAT) và quản lý hàng chờ | Không đo được chất lượng CSKH | Thấp |
| Khách vãng lai giả định danh là đọc được, đóng được phòng chat của người khác | Phòng chat gắn với danh tính đã xác thực | Lộ nội dung trao đổi riêng của khách | Cao |

---

## Đề xuất lộ trình xử lý

**Đợt 1: sửa ngay vì ảnh hưởng tiền và hàng**
1. Bỏ cộng thêm VAT: coi giá niêm yết là giá đã gồm VAT, chỉ tách VAT để hiển thị trên hóa đơn.
2. Hủy đơn đang giao chuyển thành luồng "chờ hoàn hàng"; kho chỉ cộng lại khi xác nhận nhận hàng hoàn.
3. Trả voucher khi hủy trước lúc giao (nếu còn hạn), kể cả đơn COD.
4. Thanh toán VNPay thất bại thì giữ đơn để khách thanh toán lại hoặc đổi sang COD; trang kết quả lấy trạng thái từ server.
5. Khóa trình tự chuyển trạng thái đơn; chặn chỉnh tồn kho khi ô trống hoặc số không hợp lệ.
6. Chặn khách hàng thường khỏi các API quản trị AI.
7. Đặt ngưỡng giá trị cho COD; đơn vượt ngưỡng phải trả trước hoặc đặt cọc.

**Đợt 2: hoàn thiện trải nghiệm**
- Lý do hủy, quy tắc hủy theo trạng thái (kiểm tra ở backend), hiển thị tiến trình hoàn tiền.
- Phí ship theo vùng và khối lượng, miễn phí ship theo ngưỡng; ở bước giỏ hàng ghi "Tính ở bước sau".
- Lưu tên người nhận theo đơn; chọn từng món khi thanh toán (hoặc sửa chữ "đang chọn" thành "trong giỏ").
- Giới hạn số lượng mỗi sản phẩm trên một đơn; tùy chọn xuất hóa đơn VAT công ty.
- Hiển thị số lượng còn lại và cảnh báo khi giá thay đổi trong giỏ.
- Rà lại tài liệu chính sách (dùng cho chatbot) cho khớp với tính năng thực tế.
- Mã khuyến mãi công khai; tự tích điểm theo đơn.
- Sửa email "Đang giao" và bổ sung chi tiết cho email xác nhận; thêm email hoàn tiền.
- Gợi ý mua kèm theo sản phẩm trong giỏ; sửa lỗi định dạng thời gian để "Xem gần đây" hoạt động (đây cũng là nguồn dữ liệu đầu vào của model).
- Thêm bước sắp xếp lại sau SASRec: ưu tiên cùng tầng giá, loại sản phẩm hết hàng hoặc ngừng bán, tăng độ đa dạng; lọc sản phẩm đã xóa khỏi lịch sử.
- Sửa thẻ sản phẩm: bỏ ★5 giả cho sản phẩm chưa có đánh giá; ẩn "Ship 2 ngày" và "Hà Nội" khi chưa tính được thật.

**Đợt 3: đưa vào mục Hướng phát triển của đồ án**
- Đổi trả và yêu cầu bảo hành; trạng thái đóng gói; hủy một phần đơn.
- Phiếu nhập kho có duyệt và giá nhập theo lô; nhiều kho; kiểm kê.
- Tích hợp hãng vận chuyển thật; thêm phương thức thanh toán (ví điện tử, trả góp 0%).
- Dashboard AI dùng dữ liệu thật (dự báo nhu cầu, phát hiện bất thường); trung tâm thông báo và thông báo đẩy.
- Chatbot: chuyển lịch sử hội thoại sang nhân viên, đánh giá sau phiên, quản lý hàng chờ.
