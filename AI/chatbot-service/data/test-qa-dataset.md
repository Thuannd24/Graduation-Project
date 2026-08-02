# Tập Câu Hỏi Kiểm Thử (Test Q&A Dataset) — Dùng cho RAGAS Evaluation

> **Mục đích:** Dùng để đánh giá chất lượng chatbot bằng RAGAS
> **Số lượng:** 60 câu hỏi bao phủ đầy đủ 6 intent
> **Định dạng:** question | ground_truth (câu trả lời đúng mẫu)

---

## INTENT 1: policy_faq (Hỏi chính sách) — 20 câu

| # | Câu hỏi | Câu trả lời đúng mẫu |
|---|---|---|
| 1 | Phí vận chuyển bao nhiêu? | 30.000 đ cho mọi đơn hàng. Thành viên SILVER, GOLD, VIP được miễn phí. |
| 2 | Thuế VAT là bao nhiêu %? | 10% tính trên giá trị hàng hoá sau khi trừ giảm giá. |
| 3 | Tôi có thể thanh toán bằng cách nào? | COD (tiền mặt khi nhận) hoặc VNPAY (thẻ ATM, thẻ tín dụng, ví điện tử). |
| 4 | Mã voucher dùng được mấy lần trong 1 đơn? | Mỗi đơn hàng chỉ dùng được 1 mã voucher. |
| 5 | Đơn hàng tự huỷ sau bao lâu nếu không thanh toán? | Sau 30 phút nếu không có hoạt động, hệ thống tự động huỷ đơn. |
| 6 | Link VNPAY có hết hạn không? | Có, link thanh toán VNPAY có hiệu lực 1 giờ. |
| 7 | Điểm thưởng hết hạn sau bao lâu? | 12 tháng kể từ ngày tích lũy. |
| 8 | 1 điểm thưởng bằng bao nhiêu tiền? | 1 điểm = 1.000 đ giảm trực tiếp vào đơn hàng. |
| 9 | Chi tiêu bao nhiêu để lên hạng SILVER? | Tổng chi tiêu tích lũy đạt 15.000.000 đ. |
| 10 | Hạng VIP cần chi tiêu bao nhiêu? | Từ 100.000.000 đ tổng chi tiêu tích lũy. |
| 11 | Điều kiện đổi trả hàng là gì? | Còn trong thời hạn đổi trả, còn nguyên hộp/phụ kiện, có hoá đơn AuraTech, lỗi từ nhà sản xuất. |
| 12 | Hàng bị lỗi giao sai thì phải làm gì? | Liên hệ tổng đài 1800.2097 trong vòng 48 giờ kèm ảnh chụp để được đổi hàng miễn phí. |
| 13 | Bảo hành iPhone bao lâu? | 12 tháng bảo hành chính hãng từ ngày mua. |
| 14 | Laptop ASUS bảo hành bao lâu? | 24 tháng bảo hành chính hãng. |
| 15 | Điều kiện nào không được bảo hành? | Vỡ màn hình do va đập, ngấm nước, sửa ngoài, tem bị bóc, hết hạn bảo hành. |
| 16 | Thành viên SILVER được ưu đãi gì khi thăng hạng? | Voucher 100.000 đ vào tài khoản và miễn phí giao hàng tiêu chuẩn toàn quốc. |
| 17 | Hạng GOLD có hệ số nhân điểm bao nhiêu? | ×1.5 (mỗi 10.000 đ chi tiêu = 1,5 điểm). |
| 18 | Giao hàng nội thành mất bao lâu? | 1–2 ngày làm việc. |
| 19 | Tỉnh xa giao hàng mất bao nhiêu ngày? | 2–5 ngày làm việc. Vùng xa / hải đảo có thể 5–7 ngày. |
| 20 | Hotline AuraTech là số mấy? | 1800.2097 (miễn phí), hoạt động 8:00–22:00 hàng ngày. |

---

## INTENT 2: order_tracking (Tra cứu đơn hàng) — 10 câu

| # | Câu hỏi | Câu trả lời đúng mẫu |
|---|---|---|
| 21 | Đơn hàng của tôi đang ở trạng thái nào? | [Tool: get_order_status] → Trả về trạng thái thực tế từ hệ thống. |
| 22 | Đơn #123 khi nào giao tới? | [Tool: get_order_status] → Trả về thông tin giao hàng và tracking code. |
| 23 | Tracking code đơn của tôi là gì? | [Tool: get_order_status] → Trả về mã vận đơn khi đơn ở SHIPPED. |
| 24 | Tại sao đơn tôi chưa thấy xác nhận? | Kiểm tra lịch sử đơn hàng trong tài khoản. Nếu sau 15 phút vẫn chưa thấy, liên hệ 1800.2097 kèm mã giao dịch. |
| 25 | Đơn hàng CONFIRMED nghĩa là gì? | Đơn đã được xác nhận và đang được chuẩn bị hàng, sắp chuyển cho đơn vị vận chuyển. |
| 26 | Đơn SHIPPED nghĩa là gì? | Đơn đã được giao cho đơn vị vận chuyển, đang trên đường đến địa chỉ của bạn. |
| 27 | Tôi có thể xem lịch sử tất cả đơn hàng ở đâu? | Đăng nhập vào tài khoản → vào mục Lịch sử đơn hàng / Quản lý đơn hàng. |
| 28 | Đơn hàng bị CANCELLED do đâu? | Có thể do: khách huỷ, hệ thống tự huỷ sau 30 phút không thanh toán, hoặc hết hàng. |
| 29 | Tôi đặt hàng xong quên thanh toán thì sao? | Đơn tự động huỷ sau 30 phút. Bạn cần đặt lại đơn mới. |
| 30 | Có thể thay đổi địa chỉ giao hàng sau khi đặt không? | Được nếu đơn còn PENDING hoặc CONFIRMED. Liên hệ 1800.2097. |

---

## INTENT 3: order_action (Thực hiện hành động với đơn) — 10 câu

| # | Câu hỏi | Câu trả lời đúng mẫu |
|---|---|---|
| 31 | Tôi muốn huỷ đơn hàng | [Hỏi xác nhận] → [Tool: cancel_order nếu còn trong trạng thái được huỷ]. |
| 32 | Huỷ đơn thì tiền hoàn lại bao lâu? | VNPAY: 3–8 ngày làm việc. Thẻ tín dụng: 7–15 ngày. COD: không mất tiền. |
| 33 | Huỷ đơn rồi voucher có được hoàn không? | Có, voucher được hoàn tự động vào tài khoản để dùng lần sau. |
| 34 | Đơn đang SHIPPED có huỷ được không? | Không thể huỷ khi đơn đã SHIPPED. Liên hệ 1800.2097 để được hỗ trợ. |
| 35 | Tôi có bao nhiêu điểm thưởng? | [Tool: get_loyalty_points] → Trả về số điểm thực tế (yêu cầu đăng nhập). |
| 36 | Voucher của tôi còn hiệu lực không? | [Tool: get_user_vouchers] → Trả về danh sách voucher còn hạn (yêu cầu đăng nhập). |
| 37 | Sản phẩm bảo hành mở rộng của tôi còn hiệu lực không? | [Tool: get_warranty_info] → Trả về thông tin bảo hành của đơn hàng. |
| 38 | Tôi muốn dùng điểm thưởng để trả | Điểm thưởng được dùng tại bước thanh toán (checkout). 1 điểm = 1.000 đ. |
| 39 | Tôi chưa đăng nhập, tra đơn hàng được không? | Để tra cứu đơn hàng cần đăng nhập vào tài khoản AuraTech trước nhé. |
| 40 | Điểm thưởng bị mất khi huỷ đơn không? | Không, điểm đã dùng được hoàn lại tự động khi đơn bị huỷ. |

---

## INTENT 4: product_search (Hỏi về sản phẩm) — 10 câu

| # | Câu hỏi | Câu trả lời đúng mẫu |
|---|---|---|
| 41 | AuraTech có bán iPhone 15 không? | [RAG: tìm trong catalog] → Trả lời có/không và thông tin sản phẩm. |
| 42 | Cho tôi xem các dòng laptop dưới 20 triệu | [RAG: tìm catalog theo giá] → Gợi ý các sản phẩm phù hợp. |
| 43 | Samsung Galaxy S25 giá bao nhiêu? | [RAG: tìm catalog] → Giá sản phẩm + lưu ý giá có thể thay đổi. |
| 44 | Điện thoại nào pin trâu nhất hiện tại? | [RAG: tìm catalog theo thông số pin] → Gợi ý sản phẩm. |
| 45 | MacBook Air M3 có màu nào? | [RAG: tìm catalog] → Trả lời các màu sắc có sẵn. |
| 46 | Tôi cần laptop cho sinh viên, tầm 15 triệu | [RAG: tìm catalog theo nhu cầu + giá] → Tư vấn phù hợp. |
| 47 | Tai nghe AirPods Pro 2 còn hàng không? | [RAG: kiểm tra tồn kho] → Trả lời tình trạng + lưu ý có thể thay đổi. |
| 48 | So sánh iPhone 15 và Samsung S25 | [RAG: tìm cả 2 sản phẩm] → So sánh thông số chính. |
| 49 | Sản phẩm nào đang khuyến mãi? | [RAG: tìm chương trình khuyến mãi] → Gợi ý sản phẩm đang giảm giá. |
| 50 | Có bán ốp lưng iPhone 15 không? | [RAG: tìm catalog phụ kiện] → Trả lời và gợi ý. |

---

## INTENT 5: complaint (Khiếu nại) — 5 câu

| # | Câu hỏi | Câu trả lời đúng mẫu |
|---|---|---|
| 51 | Hàng giao bị vỡ màn hình, tôi yêu cầu đổi ngay | Xin lỗi bạn vì sự cố này. Vui lòng liên hệ ngay 1800.2097 kèm ảnh chụp sản phẩm. AuraTech sẽ xử lý đổi hàng trong vòng 24–48 giờ. |
| 52 | Giao hàng chậm quá, tôi đặt 5 ngày rồi chưa thấy | Xin lỗi bạn. Cho Aura xem mã đơn hàng để tra cứu tình trạng ngay nhé. |
| 53 | Sản phẩm không giống mô tả trên web | Aura xin lỗi vì trải nghiệm không tốt. Bạn vui lòng liên hệ 1800.2097 kèm ảnh để được hỗ trợ đổi trả. |
| 54 | Tôi rất thất vọng với dịch vụ của AuraTech | Aura rất tiếc về điều này. Cho Aura biết cụ thể vấn đề để Aura hỗ trợ ngay hoặc kết nối bạn với nhân viên chuyên trách nhé. |
| 55 | Bị tính tiền sai, tôi bị trừ nhiều hơn | Aura xin lỗi. Vui lòng cung cấp mã đơn hàng và số tiền thực tế, Aura sẽ kiểm tra và xử lý ngay. Hotline: 1800.2097. |

---

## INTENT 6: general_chat & off-topic — 5 câu

| # | Câu hỏi | Câu trả lời đúng mẫu |
|---|---|---|
| 56 | Xin chào | Chào bạn! Aura là trợ lý AI của AuraTech. Aura có thể giúp bạn tìm sản phẩm, tra đơn hàng hoặc giải đáp chính sách. Bạn cần hỗ trợ gì hôm nay? 😊 |
| 57 | Bạn là ai? | Aura là trợ lý AI của hệ thống bán lẻ công nghệ AuraTech. Aura có thể tư vấn sản phẩm và hỗ trợ các vấn đề về đơn hàng cho bạn. |
| 58 | Giải bài toán tích phân này giúp tôi | Xin lỗi bạn, Aura chỉ hỗ trợ các vấn đề liên quan đến mua sắm tại AuraTech thôi nhé. Aura có thể tìm sản phẩm hoặc giải đáp chính sách cho bạn không? 😊 |
| 59 | Thời tiết hôm nay thế nào? | Aura chỉ có thể hỗ trợ về sản phẩm và dịch vụ AuraTech. Bạn có cần tư vấn gì về công nghệ không? 😊 |
| 60 | Cảm ơn bạn đã hỗ trợ | Không có gì! Aura rất vui được giúp bạn. Nếu cần thêm hỗ trợ, cứ hỏi Aura bất cứ lúc nào nhé! 😊 |

---

## BỔ SUNG CÂU HỎI THỰC TẾ & EDGE CASES — 40 CÂU

| # | Câu hỏi | Câu trả lời đúng mẫu |
|---|---|---|
| 61 | bh may asus bn thang | 24 tháng bảo hành chính hãng. |
| 62 | doi tra do loi trong bao lau | Thời hạn đổi trả thông thường từ 7 đến 30 ngày tùy theo loại sản phẩm và điều kiện cụ thể. |
| 63 | toi mua laptop asus 18 thang truoc bi loi man hinh, co duoc bao hanh free khong | Có, laptop ASUS được bảo hành chính hãng 24 tháng, vì vậy máy mua 18 tháng trước vẫn nằm trong thời hạn bảo hành miễn phí nếu đủ điều kiện phần cứng. |
| 64 | don cua toi sao chua thay giao | Aura xin lỗi vì sự bất tiện này. Bạn vui lòng cung cấp mã đơn hàng để Aura tra cứu trạng thái giao hàng chính xác giúp bạn nhé. |
| 65 | t muon huy don da shipped | Rất tiếc, đơn hàng đã giao cho đơn vị vận chuyển (SHIPPED) thì không thể hủy qua website. Bạn vui lòng liên hệ tổng đài 1800.2097 để được hỗ trợ xử lý. |
| 66 | point cua toi dung het de thanh toan luon duoc ko | Có thể sử dụng điểm thưởng để giảm giá trực tiếp cho đơn hàng, tối đa không vượt quá giá trị đơn hàng sau khi trừ các khoản giảm giá khác. |
| 67 | ip 16 voi samsung s25 cai nao ngon hon | Cả hai đều là dòng flagship xuất sắc. iPhone 16 nổi bật với hệ điều hành iOS mượt mà, camera sắc nét và giữ giá tốt. Samsung S25 có màn hình AMOLED tuyệt đẹp, nhiều tính năng AI thông minh và thiết kế thời thượng. Bạn có thể chọn tùy theo nhu cầu hệ điều hành ưa thích. |
| 68 | tim lap duoi 15tr de choi game muot | Với ngân sách dưới 15 triệu, bạn có thể tham khảo các dòng laptop ASUS Vivobook hoặc Acer Aspire Lite cấu hình tốt, hoặc dòng máy cũ như ASUS TUF Gaming, Acer Nitro V cũ tại AuraTech để có hiệu năng chơi game mượt mà nhất. |
| 69 | shop lam an kieu gi the giao cham qua | Aura vô cùng xin lỗi bạn vì sự chậm trễ này. Bạn cho Aura xin mã đơn hàng để kiểm tra lộ trình giao hàng và hối thúc đơn vị vận chuyển ngay lập tức nhé. |
| 70 | cho xin link | Bạn cần lấy đường dẫn hoặc link của trang nào ạ? Hãy nói rõ hơn để Aura có thể hỗ trợ gửi link chính xác cho bạn nhé. |
| 71 | admin dep trai ko | Aura là trợ lý AI nên không có ngoại hình, nhưng Aura luôn sẵn sàng phục vụ bạn một cách đẹp đẽ và chuyên nghiệp nhất! 😊 |
| 72 | mua macbook cu co duoc tra gop ko | AuraTech hỗ trợ trả góp qua thẻ tín dụng và công ty tài chính cho các đơn hàng. Tuy nhiên, vui lòng lưu ý rằng AuraTech không triển khai chương trình trả góp trực tiếp mà qua đối tác liên kết. |
| 73 | tai nghe jbl go 5 co chong nuoc ko | Loa Bluetooth JBL Go 5 có khả năng kháng nước và bụi chuẩn IP67 (màng loa 45mm, kháng bụi nước tốt). |
| 74 | tieu het point co duoc hoan lai khi huy don ko | Có, toàn bộ điểm thưởng đã dùng sẽ được hoàn lại tự động vào tài khoản khi đơn hàng bị huỷ. |
| 75 | op lung uag cho iphone 15 pro max gia bn | Giá của ốp lưng UAG cho iPhone 15 Pro Max sẽ được tra cứu thực tế từ database. Bạn vui lòng xem trực tiếp trên trang sản phẩm để cập nhật giá và tồn kho chính xác nhất. |
| 76 | mua iphone 16 pro max co duoc tang sac ko | Theo chính sách của Apple, hộp máy iPhone 16 Pro Max chỉ kèm cáp sạc, không kèm củ sạc. Bạn có thể mua thêm củ sạc nhanh chính hãng tại AuraTech với nhiều ưu đãi. |
| 77 | co ban tai nghe airpods rep 1 1 ko | AuraTech cam kết chỉ bán sản phẩm chính hãng 100%, không kinh doanh các loại hàng giả, hàng nhái hoặc hàng rep 1:1. |
| 78 | lam sao de thiet lap lai mat khau | Bạn vào trang đăng nhập, nhấn "Quên mật khẩu", nhập email/sđt đăng ký tài khoản và làm theo hướng dẫn gửi về để tạo mật khẩu mới. |
| 79 | may anh cu cua canon co con hang ko | Tình trạng tồn kho của máy ảnh Canon cũ sẽ được hệ thống tra cứu theo thời gian thực. Bạn vui lòng xem trên website hoặc nhắn dòng máy cụ thể để Aura check kho nhé. |
| 80 | neu nhan vien tu van bao sai gia thi sao | AuraTech cam kết bán đúng giá niêm yết trên website. Nếu có sai sót từ nhân viên tư vấn, bạn vui lòng liên hệ hotline khiếu nại 1800.2097 để được giải quyết quyền lợi. |
| 81 | iphone lock co ban tai day ko | AuraTech chỉ kinh doanh iPhone phiên bản quốc tế (chính hãng VN/A), không bán iPhone Lock (khóa mạng). |
| 82 | sao luu du lieu dien thoai co mat phi ko | Dịch vụ hỗ trợ sao lưu, chuyển dữ liệu tại cửa hàng là hoàn toàn miễn phí khi khách hàng mua máy mới tại AuraTech. |
| 83 | nhan vien tu sao luu mat du lieu co den ko | Theo quy định sao lưu dữ liệu, khách hàng phải ký Cam kết miễn trừ trách nhiệm trước khi nhân viên thực hiện. AuraTech khuyến khích khách hàng tự sao lưu để đảm bảo an toàn tuyệt đối. |
| 84 | co ship cod ve ca mau ko | Có, AuraTech hỗ trợ giao hàng COD toàn quốc, bao gồm cả Cà Mau. Thời gian giao hàng dự kiến từ 3–5 ngày làm việc. |
| 85 | huy don roi co tu dong back point luon ko | Có, điểm thưởng sẽ được hệ thống hoàn lại tự động và ngay lập tức khi trạng thái đơn chuyển sang CANCELLED. |
| 86 | phi ship ve ha noi bao nhieu | Phí ship tiêu chuẩn là 30.000 đ. Đơn hàng sẽ được miễn phí vận chuyển nếu bạn là thành viên hạng SILVER, GOLD, VIP hoặc áp dụng voucher freeship. |
| 87 | macbook air m3 ram 8gb co bi lag ko | MacBook Air M3 với RAM 8GB đáp ứng cực tốt và mượt mà các tác vụ văn phòng, học tập, lướt web, xem phim và đồ họa nhẹ. Chỉ khi mở quá nhiều tác vụ nặng cùng lúc mới có thể gặp giới hạn RAM. |
| 88 | co ho tro ky cam ket mien tru luon tren web ko | Cam kết miễn trừ trách nhiệm sao lưu dữ liệu chỉ áp dụng khi thực hiện trực tiếp tại cửa hàng và ký bằng giấy/mẫu của công ty. |
| 89 | vnpay loi ko thanh toan duoc thi phai lam sao | Nếu giao dịch VNPAY bị lỗi, bạn có thể chờ vài phút để link thanh toán cũ hết hạn hoặc tạo đơn hàng mới để thanh toán lại. Link thanh toán có hiệu lực trong 1 giờ. |
| 90 | tich diem s-member co ap dung khi mua phu kien ko | Có, mọi hoá đơn mua sắm thực tế tại AuraTech (bao gồm cả phụ kiện) đều được tích lũy điểm thưởng theo hạng thành viên của bạn. |
| 91 | co cua hang nao o da nang ko | Bạn vui lòng kiểm tra danh sách cửa hàng trên trang "Hệ thống cửa hàng" để xem địa chỉ cụ thể tại Đà Nẵng. |
| 92 | mua loa marshall bromley 450 co dc tang mic ko | Thông tin khuyến mãi đi kèm của loa Marshall Bromley 450 sẽ được hiển thị trên trang sản phẩm. Bạn vui lòng check chi tiết quà tặng kèm tại thời điểm mua. |
| 93 | muốn đổi máy cũ lấy máy mới thì quy trình thế nào | Quy trình Thu cũ đổi mới gồm: Mang máy cũ đến cửa hàng để nhân viên định giá (Loại A/B/C) -> Xác định số tiền được thu mua -> Chọn máy mới -> Thanh toán khoản chênh lệch (có hỗ trợ trợ giá). |
| 94 | máy loại c thu cũ đổi mới là sao | Máy loại C là máy có ngoại hình trầy xước nhiều, cấn móp nhẹ, hoặc màn hình có đốm nhẹ nhưng các tính năng cơ bản vẫn hoạt động bình thường. |
| 95 | tại sao app báo lỗi thanh toán trùng lặp | Để đảm bảo an toàn, hệ thống sử dụng cơ chế chống đặt trùng đơn (idempotency key). Nếu bạn bấm đặt hàng liên tục, hệ thống sẽ chặn và chỉ tạo 1 đơn hàng duy nhất. |
| 96 | mất hóa đơn giấy có được bảo hành không | Có. AuraTech quản lý bảo hành điện tử qua số điện thoại mua hàng, nên bạn không cần lo lắng nếu mất hóa đơn giấy. |
| 97 | có cần hẹn lịch trước khi đến bảo hành không | Không cần hẹn trước. Bạn có thể mang máy đến bất kỳ cửa hàng AuraTech nào trong giờ làm việc (8:00 - 21:30) để được hỗ trợ. |
| 98 | có ship hàng ra nước ngoài không | Hiện tại AuraTech chỉ hỗ trợ giao hàng trong phạm vi lãnh thổ Việt Nam, chưa hỗ trợ giao hàng quốc tế. |
| 99 | điểm thưởng có đổi được ra tiền mặt không | Không. Điểm thưởng chỉ có giá trị quy đổi thành tiền giảm giá trực tiếp khi mua hàng tại AuraTech, không có giá trị quy đổi thành tiền mặt. |
| 100 | hủy đơn xong bao lâu nhận lại tiền chuyển khoản | Thời gian hoàn tiền chuyển khoản ngân hàng thông thường là từ 1 đến 3 ngày làm việc. |
