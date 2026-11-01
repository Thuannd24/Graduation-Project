# Đặc tả các Use Case trọng tâm

Ngày đối chiếu: 01/11/2026. Các UC dưới đây dùng cùng mã với sơ đồ và bảng truy vết. Các tình huống kiểm chứng là tiêu chí để chạy kiểm thử, không phải tuyên bố đã thực thi thành công trong lần biên tập này.

## UC14 — Tìm kiếm sản phẩm

**Actor:** Người truy cập (Guest/Customer). **Mục tiêu:** tìm các sản phẩm phù hợp truy vấn và điều kiện mua sắm.

**Tiền điều kiện:** truy cập giao diện tìm kiếm; không bắt buộc đăng nhập. **Hậu điều kiện:** hiển thị kết quả hoặc trạng thái không có kết quả/lỗi có kiểm soát, không thay đổi dữ liệu giao dịch.

**Luồng chính:** (1) Người dùng nhập truy vấn; (2) hệ thống tiếp nhận truy vấn và giới hạn số kết quả; (3) truy hồi ứng viên, hợp nhất và lấy thông tin sản phẩm; (4) giao diện hiển thị sản phẩm; (5) người dùng có thể mở trang chi tiết độc lập.

**Mở rộng:** UC16 tại bước hiển thị khi có tiêu chí lọc; UC17 khi đổi thứ tự. Gợi ý từ khóa UC15 có thể chạy trong khi nhập, không bắt buộc trong mọi truy vấn.

**Thay thế/ngoại lệ:** chỉ mục vector chưa sẵn sàng thì nhánh dense có thể rỗng; keyword có phương án dự phòng. Frontend có fallback tìm từ khóa khi AI tìm kiếm lỗi. Không có kết quả phải hiển thị rõ. API kiểm soát `top_k`, giá âm và lỗi dịch vụ.

**Kiểm chứng:** truy vấn chính xác, truy vấn nhu cầu, không có kết quả, lọc/sắp xếp, mất nhánh semantic, mở URL chi tiết trực tiếp. Thiết kế BM25/E5/RRF thuộc Activity/Sequence, không phải quan hệ kế thừa giữa các mục tiêu người dùng.

## UC22 — Đặt hàng

**Actor:** Customer. **Mục tiêu:** tạo đơn hàng hợp lệ từ giỏ hàng hiện tại.

**Tiền điều kiện:** đã đăng nhập; giỏ có mặt hàng hợp lệ; có địa chỉ giao và số điện thoại nhận hàng. **Thành công:** đơn và chi tiết được ghi nhận với số tiền phía server, thông tin ưu đãi/điểm theo yêu cầu và sự kiện giao dịch tương ứng. **Thất bại:** không báo tạo thành công; thao tác dở dang phải tuân theo cơ chế giao dịch/bù trừ của hệ thống.

**Luồng chính:** (1) Customer mở checkout, có thể xem trước chi phí UC21; (2) cung cấp thông tin người nhận và kiểm tra giỏ; (3) hệ thống kiểm tra dữ liệu sản phẩm, giá và tồn khả dụng; (4) xác định phí và tổng thanh toán; (5) tạo đơn, ghi nhận sự kiện theo thiết kế; (6) trả thông tin đơn để người dùng tiếp tục lựa chọn thanh toán.

**Điểm mở rộng — xác định ưu đãi:** UC23 khi có voucher; UC24 khi người dùng yêu cầu đổi điểm. Nếu không chọn, tiếp tục bằng đơn không sử dụng ưu đãi tương ứng. Hệ thống phải xác định lại điều kiện và số tiền, không tin tổng tiền từ trình duyệt.

**Ngoại lệ:** giỏ rỗng; thiếu địa chỉ/số điện thoại; hết hàng hoặc cạnh tranh tồn; sản phẩm không còn bán; voucher hết hạn/không đủ điều kiện; thiếu điểm; dữ liệu thay đổi giữa preview và tạo đơn; yêu cầu gửi lặp. Các trường hợp thất bại không được suy diễn là đã trừ tiền thành công.

**Kiểm chứng:** đặt không voucher/không điểm; chỉ voucher; chỉ điểm; hết hàng; dữ liệu giá thay đổi; gửi lặp cùng yêu cầu theo chính sách chống xử lý trùng. Giữ tồn kho/Outbox là xử lý nội bộ, không phải actor ngoài.

## UC25–UC30 — Thanh toán và thử lại

**Actor chính:** Customer. **Actor hỗ trợ:** VNPay Sandbox đối với UC26 và UC28. **Tiền điều kiện:** người thao tác có quyền với đơn; đơn còn được phép thanh toán.

**Luồng VNPay (UC26):** (1) chọn VNPay; (2) hệ thống khởi tạo hoặc tái sử dụng thanh toán phù hợp, trả URL; (3) khách thực hiện giao dịch trên cổng; (4) UC28 tiếp nhận kết quả, kiểm tra chữ ký, số tiền và giao dịch, xử lý cập nhật hợp lệ; (5) UC29 đọc trạng thái thanh toán thật để hiển thị kết quả.

**Luồng COD (UC27):** (1) khách chọn COD; (2) hệ thống kiểm tra hạn mức và trạng thái đơn; (3) xác nhận phương án COD theo nghiệp vụ. Không đồng nhất chọn COD với đã thu tiền mặt ngay khi đặt hàng.

**Thử lại (UC30):** khi lần VNPay thất bại/bị khách hủy, đơn có thể còn chờ trả tiền và giữ hàng trong thời hạn. Khách thử VNPay lại hoặc đổi sang COD nếu đủ điều kiện. Không mặc định tạo đơn mới. Endpoint thử lại kiểm tra danh tính, trạng thái và thời hạn như khởi tạo thanh toán.

**Ngoại lệ:** callback chữ ký sai/số tiền sai; callback lặp hoặc đến muộn; người dùng sửa tham số kết quả trên URL; cổng lỗi; COD vượt hạn mức; đơn đã trả tiền/hết hạn/bị hủy. Kết quả giao diện phải dựa trên trạng thái được server xác nhận. Các trường hợp cần hoàn tiền tự động/thủ công không được trình bày là đã hoàn thành khi mới gửi yêu cầu.

**Hậu điều kiện:** thanh toán/đơn phản ánh kết quả hợp lệ hoặc trạng thái chờ/thất bại rõ ràng. Không có quan hệ include ép mọi đơn qua VNPay; UC26 và UC27 chuyên biệt hóa UC25.

## UC31 — Hủy đơn hàng

**Actor:** Customer đối với đơn của mình; Staff/Admin theo quyền vận hành. **Tiền điều kiện:** xác thực, quyền thao tác và trạng thái đơn cho phép.

**Luồng chính trước giao vận:** (1) chọn đơn, xem điều kiện hủy; (2) gửi lý do; (3) kiểm tra quyền và trạng thái mới nhất; (4) chuyển trạng thái hủy, lưu sự kiện; (5) xử lý hoàn kho, voucher, điểm và tiền theo điều kiện và luồng sự kiện.

**Thay thế:** đơn chưa trả tiền không phát sinh hoàn tiền. Đơn đã trả tiền cần xử lý hoàn theo kết quả thanh toán. Đơn đang giao có thể được Staff/Admin đưa về RETURNING; chưa hoàn kho ngay lúc báo chờ hoàn. Customer không được sử dụng quyền vận hành này để vượt chính sách hủy.

**Ngoại lệ:** sai chủ đơn; trạng thái thay đổi đồng thời; đơn không còn hủy được; lý do OTHER thiếu mô tả theo quy định. Không báo thành công khi không ghi được trạng thái/sự kiện cần thiết.

**Hậu điều kiện:** trạng thái và lý do được lưu hoặc yêu cầu bị từ chối rõ ràng. Trạng thái hủy không đồng nghĩa tiền đã về tài khoản khách ngay.

## UC32 — Thực hiện hoàn tiền thủ công

**Actor:** Admin; hỗ trợ bởi VNPay Sandbox. Staff không có quyền gọi API này.

**Tiền điều kiện:** tài khoản Admin, giao dịch trả tiền hợp lệ, số tiền và điều kiện hoàn được backend chấp nhận. **Luồng chính:** (1) tra giao dịch; (2) cung cấp yêu cầu hoàn; (3) hệ thống kiểm tra và gọi cổng; (4) ghi nhận kết quả/thông tin hoàn; (5) trả trạng thái tương ứng.

**Thay thế/ngoại lệ:** hoàn đang chờ (`REFUND_PENDING`), cần xử lý thủ công (`PENDING_MANUAL`), cổng từ chối/lỗi hoặc giao dịch không còn đủ điều kiện. Không ghi “đã hoàn tiền thành công” khi mới gửi yêu cầu hoặc đang chờ xử lý.

**Phân biệt:** tự động bù trừ do sự kiện hủy đơn là xử lý hệ thống; không phải bằng chứng Staff có quyền hoàn tiền thủ công. Không suy diễn tồn tại “khách gửi yêu cầu hoàn tiền độc lập” nếu chưa có giao diện/API tương ứng.

## UC35–UC41 — Kho và hàng hoàn

**Actor:** Staff/Admin. **Tiền điều kiện:** xác thực, đúng quyền; sản phẩm/biến thể và thao tác hợp lệ.

**Nhập/điều chỉnh (UC35/UC36):** chọn hàng/biến thể → nhập số lượng và thông tin nghiệp vụ/lý do → hệ thống kiểm tra → cập nhật tồn và ghi nhận biến động. UC37 tra lịch sử; UC38 xem mặt hàng dưới ngưỡng. Không mô tả là quy trình nhà cung cấp ký/phê duyệt phiếu nhập khi chưa có bằng chứng triển khai.

**Nhận hàng hoàn (UC41):** (1) Staff/Admin kiểm tra kiện hàng thực nhận; (2) xác nhận đơn RETURNING; (3) hệ thống chuyển RETURNED; (4) phát sự kiện để hoàn kho và bù trừ theo dữ liệu đơn. Không cộng tồn chỉ vì hãng báo giao thất bại khi hàng chưa về kho.

**Ngoại lệ:** biến thể không tồn tại, số lượng sai, sai trạng thái đơn, xác nhận lặp, lỗi ghi nhận nghiệp vụ. Kiểm chứng cần đối chiếu tồn và lịch sử biến động, không chỉ thông báo giao diện.

## UC46–UC49 — Vận hành chiến dịch

**Actor:** Staff/Admin. **Tiền điều kiện:** xác thực đúng quyền. **Luồng chính:** (1) thiết kế đồ thị và cấu hình chiến dịch; (2) có thể gọi UC47 kiểm tra; (3) lưu/triển khai, backend xác thực lại dữ liệu; (4) bật/tắt theo UC48; (5) xem thống kê và voucher phát hành theo UC49.

**Ngoại lệ:** đồ thị/quy tắc không hợp lệ, thiếu cấu hình hoặc lỗi triển khai; không tuyên bố chiến dịch đã vận hành khi kiểm tra thất bại. Việc xóa chiến dịch UC55 chỉ Admin.

**Hậu điều kiện:** chiến dịch được lưu/triển khai theo kết quả thật hoặc lỗi được trả rõ ràng. Kiểm tra là hành vi có thể gọi riêng; BPMN/Camunda là cách hiện thực bên trong ranh giới AuraTech.

## UC58–UC65 — Trợ lý AI và chuyển tiếp hỗ trợ

**Actor:** Guest/Customer; Staff/Admin ở phía hỗ trợ trực tiếp. **Tiền điều kiện:** có định danh phiên hợp lệ; tra cứu cá nhân UC61 cần xác thực và quyền với dữ liệu.

**Luồng chính:** (1) gửi tin nhắn; (2) hệ thống đọc lịch sử và xác định ý định; (3) nhánh sản phẩm/chính sách có thể truy xuất tri thức; nhánh dữ liệu cá nhân gọi API nghiệp vụ có kiểm tra quyền; (4) trả câu trả lời và thẻ dữ liệu phù hợp; (5) lưu lịch sử phiên.

**Điểm mở rộng — tiếp tục hội thoại:** UC62 khi khách yêu cầu người thật hoặc thỏa điều kiện chuyển tiếp như khiếu nại, hỏi lặp hay tín hiệu cảm xúc phù hợp. Hệ thống chuyển phiên sang hàng chờ; Staff/Admin nhận phiên UC65 và trò chuyện UC63. UC63 có cả actor người truy cập và nhân viên; không chỉ nối phía Staff.

**Ngoại lệ:** khách chưa xác thực hỏi dữ liệu cá nhân; yêu cầu truy cập đơn không thuộc mình; nguồn tri thức không đủ; dịch vụ phụ thuộc lỗi; chưa có nhân viên nhận; phiên đã đóng. Phải thể hiện tình trạng rõ ràng, không bịa dữ liệu đơn/voucher/điểm hoặc coi đang chờ là nhân viên đã phản hồi.

**Hậu điều kiện:** có phản hồi theo nhánh hợp lệ hoặc phiên hỗ trợ được ghi nhận theo trạng thái thật. Không include RAG vào mọi hội thoại. Không mô tả cơ chế SSE nếu chưa đối chiếu được endpoint tương ứng.
