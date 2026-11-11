# CHƯƠNG I: ĐẶC TẢ HỆ THỐNG

## 1. Lập bảng từ khoá theo mẫu

| TT | Tên tiếng Việt | Tiếng Anh | Giải thích |
|:--:|---|---|---|
| **I** | **Nhóm các khái niệm liên quan đến con người** | | |
| 1 | Thành viên | Member | Người đã đăng ký tài khoản trên hệ thống, có thông tin định danh và quyền hạn đăng nhập để sử dụng các dịch vụ theo vai trò. |
| 2 | Khách vãng lai | Guest | Người dùng chưa đăng nhập, chỉ có thể xem danh mục, tìm kiếm sản phẩm và sử dụng giỏ hàng tạm thời. |
| 3 | Khách hàng | Customer | Người dùng đã đăng nhập vào hệ thống, có thể quản lý giỏ hàng, đặt hàng, thanh toán, tích điểm, đánh giá và nhận hỗ trợ từ trợ lý ảo hoặc nhân viên. |
| 4 | Nhân viên vận hành | Operations Staff | Người chịu trách nhiệm quản lý danh mục sản phẩm, theo dõi tình trạng kho, xử lý đóng gói, cập nhật tiến trình đơn hàng và trực tiếp hỗ trợ khách hàng. |
| 5 | Nhân viên kho | Warehouse Staff | Người phụ trách các nghiệp vụ tại kho hàng như lập phiếu nhập kho, kiểm kê số lượng thực tế và điều chỉnh chênh lệch tồn kho. |
| 6 | Quản trị viên hệ thống | System Administrator | Người có quyền hạn cao nhất trong hệ thống, quản lý tài khoản người dùng, phân quyền nhân viên, thiết lập chiến dịch khuyến mãi, đối soát tài chính và theo dõi báo cáo doanh thu. |
| 7 | Cổng thanh toán | Payment Gateway | Đơn vị trung gian tài chính tiếp nhận yêu cầu thanh toán trực tuyến và phản hồi kết quả giao dịch về hệ thống. |
| 8 | Đơn vị vận chuyển | Logistics Partner | Đơn vị đối tác tiếp nhận kiện hàng từ kho và thực hiện giao hàng đến địa chỉ của khách hàng. |
| **II** | **Nhóm các khái niệm liên quan đến vật, đối tượng xử lý** | | |
| 9 | Danh mục sản phẩm | Category | Nhóm phân loại các mặt hàng theo từng ngành hàng phục vụ tìm kiếm và duyệt sản phẩm. |
| 10 | Thương hiệu | Brand | Hãng sản xuất của sản phẩm. |
| 11 | Sản phẩm | Product | Mặt hàng chính được bày bán trên hệ thống với các thông tin chung như tên, mô tả, thông số và hình ảnh. |
| 12 | Biến thể sản phẩm | Product Variant | Phiên bản cụ thể của một sản phẩm được phân biệt theo màu sắc, cấu hình, dung lượng, có mã định danh, giá bán và tồn kho riêng. |
| 13 | Thuộc tính sản phẩm | Product Attribute | Các đặc tính kỹ thuật của sản phẩm như vi xử lý, bộ nhớ trong, kích thước màn hình dùng để lọc và so sánh. |
| 14 | Kho hàng | Inventory | Nơi lưu giữ và quản lý số lượng tồn thực tế cùng số lượng có thể bán của từng biến thể sản phẩm. |
| 15 | Lịch sử biến động kho | Inventory Transaction | Bản ghi chi tiết về các lần tăng hoặc giảm số lượng trong kho do nhập hàng, bán hàng, hủy đơn hoặc điều chỉnh. |
| 16 | Giỏ hàng | Cart | Nơi lưu giữ tạm thời danh sách các sản phẩm và số lượng mà khách hàng dự định mua trước khi tiến hành đặt hàng. |
| 17 | Mục giỏ hàng | Cart Item | Từng dòng sản phẩm cụ thể nằm trong giỏ hàng. |
| 18 | Đơn hàng | Order | Yêu cầu mua hàng chính thức được tạo sau khi khách hàng xác nhận giỏ hàng, chọn địa chỉ nhận hàng và hình thức thanh toán. |
| 19 | Chi tiết đơn hàng | Order Item | Từng mặt hàng kèm số lượng và đơn giá tại thời điểm đặt hàng. |
| 20 | Địa chỉ nhận hàng | Shipping Address | Thông tin địa điểm giao hàng của khách hàng bao gồm họ tên người nhận, số điện thoại, tỉnh/thành phố, quận/huyện, phường/xã và địa chỉ cụ thể. |
| 21 | Giao dịch thanh toán | Payment Transaction | Chứng từ kỹ thuật xác nhận giao dịch chuyển tiền cho đơn hàng qua hình thức trực tuyến hoặc thanh toán khi nhận hàng. |
| 22 | Giao dịch hoàn tiền | Refund Transaction | Chứng từ ghi nhận việc hoàn trả lại tiền cho khách hàng khi đơn hàng bị hủy hoặc phát sinh sự cố giao dịch. |
| 23 | Mã giảm giá | Voucher / Coupon | Mã ưu đãi giúp khấu trừ một khoản tiền hoặc tỷ lệ phần trăm trên tổng giá trị đơn hàng khi thỏa mãn điều kiện quy định. |
| 24 | Chiến dịch khuyến mãi | Promotion Campaign | Chương trình tiếp thị tổng thể do quản trị viên thiết lập quy tắc tự động cấp phát voucher hoặc điểm thưởng cho khách hàng. |
| 25 | Điểm thưởng | Loyalty Point | Đơn vị điểm tích lũy của khách hàng thân thiết được cộng sau mỗi đơn hàng thành công và có thể dùng để giảm trừ tiền mua hàng. |
| 26 | Đánh giá sản phẩm | Product Review | Ý kiến nhận xét, số sao bình chọn và hình ảnh phản hồi của khách hàng sau khi đã mua và trải nghiệm sản phẩm. |
| 27 | Danh sách yêu thích | Wishlist | Tập hợp các sản phẩm mà khách hàng quan tâm và lưu lại để tiện theo dõi. |
| 28 | Thông báo | Notification | Tin nhắn tự động được gửi tới người dùng để cập nhật trạng thái đơn hàng, thông tin giao dịch hoặc ưu đãi khuyến mãi. |
| 29 | Phiếu nhập kho | Stock In Receipt | Chứng từ xác nhận số lượng và danh mục hàng hóa mới được nhập từ nhà cung cấp vào kho. |
| 30 | Hồ sơ thu cũ đổi mới | Trade-In Assessment | Bản yêu cầu thẩm định và định giá thiết bị cũ của khách hàng gửi lên để nhận trợ giá đổi sang thiết bị mới. |
| 31 | Phiên hỗ trợ trực tuyến | Support Session | Cuộc trao đổi giữa khách hàng với trợ lý ảo hoặc nhân viên tư vấn để giải đáp thắc mắc về sản phẩm và đơn hàng. |
| **III** | **Nhóm các khái niệm liên quan đến hoạt động của người và hệ thống** | | |
| 32 | Đăng ký | Register | Hoạt động người dùng tạo mới tài khoản thành viên trong hệ thống. |
| 33 | Đăng nhập | Login | Hoạt động người dùng cung cấp thông tin tài khoản để xác thực danh tính vào hệ thống. |
| 34 | Quản lý thông tin cá nhân | Manage Profile | Hoạt động cập nhật thông tin cá nhân, mật khẩu và quản lý sổ địa chỉ nhận hàng. |
| 35 | Duyệt sản phẩm theo danh mục | Browse Products | Hoạt động xem danh sách sản phẩm theo cây danh mục, thương hiệu và sử dụng các bộ lọc đặc tính. |
| 36 | Tìm kiếm toàn văn | Full-text Search | Hoạt động nhập từ khóa để tra cứu sản phẩm dựa trên tên gọi, thương hiệu và mô tả. |
| 37 | Tìm kiếm ngữ nghĩa | Semantic Search | Hoạt động tìm kiếm hiểu theo ý nghĩa câu hỏi hoặc mô tả tự nhiên của người dùng để trả về sản phẩm phù hợp. |
| 38 | Tìm kiếm bằng hình ảnh | Image / Visual Search | Hoạt động người dùng tải lên hình ảnh sản phẩm (có thể cắt chọn vùng ảnh) để hệ thống nhận diện và gợi ý các sản phẩm có đặc điểm tương tự. |
| 39 | Tìm sản phẩm tương tự | Similar Product Search | Hệ thống tự động so khớp đặc trưng hình ảnh và thông số để đề xuất các sản phẩm có cùng kiểu dáng hoặc phân khúc. |
| 40 | Thêm vào giỏ hàng | Add to Cart | Hoạt động đưa biến thể sản phẩm và số lượng mong muốn vào giỏ hàng. |
| 41 | Cập nhật giỏ hàng | Update Cart | Hoạt động thay đổi số lượng, xóa sản phẩm hoặc chọn các sản phẩm cần tiến hành đặt hàng. |
| 42 | Xem trước đơn hàng | Preview Order | Hệ thống tự động tính toán tạm tính, tiền thuế, phí giao hàng, mức giảm giá voucher và điểm thưởng trước khi đặt hàng. |
| 43 | Đặt hàng | Place Order | Hoạt động khách hàng xác nhận mua các sản phẩm trong giỏ hàng. |
| 44 | Giữ chỗ tồn kho | Reserve Stock | Hệ thống tự động giữ tạm thời số lượng sản phẩm trong kho khi đơn hàng được tạo để đảm bảo không bị người khác mua mất. |
| 45 | Trừ tồn kho | Deduct Stock | Hệ thống cập nhật giảm chính thức số lượng hàng trong kho sau khi đơn hàng được thanh toán hoặc xác nhận hợp lệ. |
| 46 | Hoàn trả tồn kho | Restock / Release Stock | Hệ thống hoàn lại số lượng hàng vào kho khi đơn hàng bị hủy hoặc giao dịch thất bại. |
| 47 | Thanh toán trực tuyến | Online Payment | Hoạt động khách hàng thực hiện chuyển tiền thông qua cổng thanh toán điện tử. |
| 48 | Xác nhận thanh toán | Verify Payment | Hệ thống tiếp nhận và xác thực kết quả thanh toán từ cổng thanh toán để cập nhật trạng thái đơn hàng. |
| 49 | Hủy đơn hàng | Cancel Order | Hoạt động người dùng hoặc nhân viên yêu cầu hủy đơn hàng khi đơn chưa được chuyển đi giao. |
| 50 | Cập nhật trạng thái đơn hàng | Update Order Status | Hoạt động nhân viên cập nhật tiến trình đơn hàng từ lúc tiếp nhận, đóng gói, bàn giao vận chuyển cho đến khi giao thành công. |
| 51 | Áp dụng mã giảm giá | Apply Voucher | Hoạt động nhập mã voucher để hệ thống kiểm tra tính hợp lệ và chiết khấu tiền đơn hàng. |
| 52 | Tích lũy và sử dụng điểm | Earn / Redeem Points | Hoạt động hệ thống cộng điểm thưởng sau khi đơn hàng hoàn tất hoặc trừ điểm khi khách hàng sử dụng để thanh toán. |
| 53 | Nhập kho sản phẩm | Stock In | Hoạt động nhân viên kho cập nhật tăng số lượng tồn của sản phẩm theo phiếu nhập hàng. |
| 54 | Điều chỉnh tồn kho | Adjust Stock | Hoạt động nhân viên kho chỉnh sửa lại số lượng tồn thực tế của sản phẩm sau đợt kiểm kê. |
| 55 | Quản lý sản phẩm | Manage Product | Hoạt động nhân viên thêm mới, chỉnh sửa thông tin, giá bán, hình ảnh và trạng thái của sản phẩm và biến thể. |
| 56 | Quản lý danh mục | Manage Category | Hoạt động nhân viên tạo mới, cập nhật hoặc thay đổi cấp bậc của danh mục ngành hàng. |
| 57 | Thiết lập chiến dịch khuyến mãi | Configure Campaign | Hoạt động quản trị viên tạo mới quy trình ưu đãi, quy định hạn mức ngân sách và điều kiện tặng mã giảm giá. |
| 58 | Đánh giá sản phẩm | Review Product | Hoạt động khách hàng viết nhận xét, chấm điểm sao và tải ảnh phản hồi cho sản phẩm đã mua. |
| 59 | Gợi ý sản phẩm cá nhân hóa | Personalized Recommendation | Hệ thống tự động gợi ý danh sách sản phẩm phù hợp dựa trên lịch sử xem, tìm kiếm và thói quen mua sắm của người dùng. |
| 60 | Gợi ý sản phẩm mua kèm | Cross-sell Recommendation | Hệ thống tự động gợi ý các phụ kiện hoặc sản phẩm bổ trợ phù hợp với các món hàng đang có trong giỏ. |
| 61 | Tư vấn qua trợ lý ảo | Chat with Virtual Assistant | Hoạt động khách hàng đặt câu hỏi bằng ngôn ngữ tự nhiên để trợ lý ảo tự động tra cứu chính sách, thông số và tư vấn sản phẩm. |
| 62 | Chuyển tiếp nhân viên hỗ trợ | Escalate to Human Agent | Hoạt động trợ lý ảo nhận diện nhu cầu hoặc sự không hài lòng của khách hàng để chuyển cuộc trò chuyện sang nhân viên tư vấn trực tiếp. |
| 63 | Đăng ký thu cũ đổi mới | Request Trade-In | Hoạt động khách hàng khai báo tình trạng thiết bị cũ và hình ảnh để yêu cầu hệ thống định giá đổi máy mới. |
| 64 | Thẩm định thu cũ đổi mới | Assess Trade-In | Hoạt động nhân viên kiểm tra máy cũ và cấp mã voucher giảm giá tương ứng cho khách hàng. |
| 65 | Thống kê doanh thu | Revenue Statistic | Hoạt động tổng hợp dữ liệu doanh số bán hàng, đơn hàng thành công, giá trị trung bình đơn theo các mốc thời gian. |
| 66 | Thống kê kho hàng | Inventory Statistic | Hoạt động tổng hợp dữ liệu số lượng tồn, danh sách hàng sắp hết và tỷ lệ luân chuyển hàng hóa. |
| 67 | Thống kê khách hàng và rủi ro | Customer & Churn Statistic | Hoạt động theo dõi biến động người dùng, phân khúc khách hàng và cảnh báo danh sách khách hàng có nguy cơ rời bỏ hệ thống. |

---

## 2. Mô tả hệ thống bằng ngôn ngữ tự nhiên

### Bước 1: Mục đích của hệ thống
Hệ thống Thương mại Điện tử Phân tán được xây dựng nhằm cung cấp giải pháp bán lẻ trực tuyến toàn diện cho các sản phẩm công nghệ, giúp khách hàng mua sắm thuận tiện, nhanh chóng và hỗ trợ doanh nghiệp tự động hóa các quy trình bán hàng, kiểm soát kho hàng chặt chẽ, tối ưu hóa các chiến dịch tiếp thị và nâng cao chất lượng chăm sóc khách hàng thông qua việc ứng dụng công nghệ trí tuệ nhân tạo.

### Bước 2: Phạm vi hệ thống
Hệ thống phục vụ các nhóm người dùng với các phạm vi chức năng rõ rệt:

* **Thành viên hệ thống:** Đăng nhập, đăng xuất, đổi mật khẩu, xem và cập nhật thông tin cá nhân.
* **Khách vãng lai:** Xem danh mục, xem chi tiết sản phẩm, tìm kiếm sản phẩm theo từ khóa, tìm kiếm theo hình ảnh, tra cứu hệ thống cửa hàng, lưu sản phẩm quan tâm vào danh sách yêu thích và sử dụng giỏ hàng trên trình duyệt.
* **Khách hàng:** Sử dụng đầy đủ chức năng của khách vãng lai, quản lý sổ địa chỉ giao hàng, lưu giỏ hàng trực tuyến, áp dụng mã giảm giá và điểm tích lũy, thực hiện đặt hàng, thanh toán qua cổng điện tử hoặc khi nhận hàng, theo dõi lịch sử đơn hàng, gửi đánh giá sản phẩm sau khi mua, yêu cầu thẩm định thu cũ đổi mới, trò chuyện với trợ lý ảo và yêu cầu nhân viên hỗ trợ.
* **Nhân viên vận hành:** Quản lý danh mục, thương hiệu, thông tin sản phẩm và các biến thể; duyệt và xử lý các trạng thái của đơn hàng; tiếp nhận và trực tiếp trả lời các phiên hỗ trợ khi được chuyển tiếp từ trợ lý ảo; thẩm định và phê duyệt các yêu cầu thu cũ đổi mới của khách hàng.
* **Nhân viên kho:** Quản lý số lượng tồn kho của các biến thể sản phẩm, lập phiếu nhập hàng mới từ nhà cung cấp, kiểm kê và điều chỉnh chênh lệch số lượng thực tế trong kho.
* **Quản trị viên:** Quản lý danh sách tài khoản, khóa hoặc mở tài khoản người dùng, thiết lập các chiến dịch khuyến mãi tự động, quản lý ngân sách và mã giảm giá, đối soát và phê duyệt các yêu cầu hoàn tiền, xem các báo cáo thống kê doanh thu, kho hàng và rủi ro khách hàng rời bỏ.

### Bước 3: Hoạt động nghiệp vụ của các chức năng chính

Hệ thống tập trung vào 7 nghiệp vụ chức năng cốt lõi thể hiện toàn diện năng lực quản lý bán hàng, kiến trúc xử lý phân tán và ứng dụng trí tuệ nhân tạo:

* **Chức năng 1: Quản lý sản phẩm:**
  Nhân viên quản lý đăng nhập vào hệ thống $\rightarrow$ Truy cập module quản lý sản phẩm $\rightarrow$ Hệ thống hiển thị danh sách sản phẩm và công cụ tìm kiếm $\rightarrow$ Nhân viên tìm kiếm và lựa chọn sản phẩm cần chỉnh sửa (hoặc chọn thêm mới sản phẩm) $\rightarrow$ Nhập và cập nhật thông tin chi tiết (tên sản phẩm, thương hiệu, danh mục, giá bán cơ bản, mô tả kỹ thuật, thông số cấu hình, danh sách biến thể và hình ảnh đại diện) $\rightarrow$ Hệ thống kiểm tra tính hợp lệ của dữ liệu $\rightarrow$ Lưu thông tin vào CSDL và đồng bộ chỉ mục tìm kiếm.

* **Chức năng 2: Tìm kiếm sản phẩm đa phương thức (Văn bản & Hình ảnh):**
  Khách hàng tra cứu sản phẩm bằng từ khóa (kết hợp so khớp toàn văn và tìm kiếm ngữ nghĩa theo ý định) hoặc tải ảnh chụp thiết bị (kèm công cụ cắt chọn vùng ảnh mong muốn) $\rightarrow$ Hệ thống trích xuất đặc trưng đa phương thức $\rightarrow$ So khớp với kho vector và chỉ mục dữ liệu $\rightarrow$ Trả về danh sách sản phẩm tương đồng nhất kèm bộ lọc cấu hình.

* **Chức năng 3: Gợi ý sản phẩm cá nhân hóa thời gian thực (Mô hình AI SASRec):**
  Người dùng tương tác trên hệ thống (lướt xem sản phẩm, thêm vào giỏ, tìm kiếm) $\rightarrow$ Hệ thống thu thập luồng sự kiện hành vi đẩy qua hàng đợi thông điệp $\rightarrow$ Mô hình mạng nơ-ron tuần tự (SASRec) phân tích chuỗi tương tác gần nhất $\rightarrow$ Tự động đề xuất danh sách sản phẩm cá nhân hóa phù hợp với thị hiếu tại Trang chủ và gợi ý sản phẩm mua kèm (Cross-sell) trong Giỏ hàng.

* **Chức năng 4: Đặt hàng và thanh toán trực tuyến:**
  Khách hàng vào trang thanh toán $\rightarrow$ Hệ thống hiển thị bảng xem trước đơn hàng (tự động tính tạm tính, thuế VAT, phí giao hàng, khấu trừ mã giảm giá và điểm thưởng) $\rightarrow$ Khách hàng xác nhận đặt hàng $\rightarrow$ Hệ thống kiểm tra và giữ chỗ số lượng tồn kho nguyên tử $\rightarrow$ Chuyển sang cổng thanh toán VNPay $\rightarrow$ Cổng thanh toán phản hồi kết quả thành công $\rightarrow$ Hệ thống chính thức trừ tồn kho vật lý, cập nhật trạng thái đơn hàng và gửi email xác nhận.

* **Chức năng 5: Hủy đơn hàng và hoàn tiền (Bù trừ giao dịch phân tán):**
  Khách hàng yêu cầu hủy đơn hàng (khi đơn chưa chuyển sang giao) $\rightarrow$ Hệ thống kiểm tra điều kiện hủy $\rightarrow$ Cập nhật trạng thái đơn sang đã hủy $\rightarrow$ Tự động hoàn lại số lượng tồn kho khả dụng $\rightarrow$ Hoàn trả mã giảm giá và điểm thưởng về ví khách hàng $\rightarrow$ Kích hoạt quy trình hoàn tiền tự động qua cổng thanh toán VNPay nếu đơn đã trả trước $\rightarrow$ Gửi thông báo hoàn tất hủy đơn.

* **Chức năng 6: Thiết lập và vận hành chiến dịch khuyến mãi tự động (Camunda BPMN):**
  Quản trị viên thiết kế quy trình khuyến mãi tự động bằng sơ đồ kéo-thả BPMN $\rightarrow$ Cấu hình điều kiện kích hoạt (đơn hàng mới, sinh nhật, khách hàng có nguy cơ rời bỏ) kèm hạn mức ngân sách và quy tắc giảm giá $\rightarrow$ Triển khai chiến dịch $\rightarrow$ Động cơ Camunda tự động lắng nghe sự kiện từ hệ thống để phê duyệt và cấp phát voucher cá nhân hóa cho khách hàng.

* **Chức năng 7: Tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng:**
  Khách hàng gửi câu hỏi tư vấn $\rightarrow$ Hệ thống phân tích ý định và cảm xúc $\rightarrow$ Trích xuất tài liệu chính sách và thông số sản phẩm liên quan (RAG) $\rightarrow$ Trợ lý ảo sinh câu trả lời tự động dạng luồng dữ liệu (Stream) $\rightarrow$ Khi khách hàng có yêu cầu gặp người tư vấn hoặc phát hiện sự cố, hệ thống tự động chuyển tiếp phiên chat sang nhân viên vận hành $\rightarrow$ Nhân viên trực tiếp hỗ trợ giải quyết vấn đề.

### Bước 4: Thông tin các đối tượng cần xử lý, quản lý

* **Thành viên:** Mã thành viên, tên đăng nhập, mật khẩu, họ và tên, ngày sinh, giới tính, thư điện tử, số điện thoại, địa chỉ, ảnh đại diện, hạng thành viên, ngày tham gia, trạng thái hoạt động.
* **Địa chỉ nhận hàng:** Mã địa chỉ, mã thành viên, tên người nhận, số điện thoại, tỉnh hoặc thành phố, quận hoặc huyện, phường hoặc xã, địa chỉ chi tiết, ghi chú chỉ đường, trạng thái địa chỉ mặc định.
* **Danh mục sản phẩm:** Mã danh mục, tên danh mục, đường dẫn thân thiện, mã danh mục cha, mô tả danh mục, hình ảnh minh họa, thứ tự hiển thị, trạng thái hoạt động.
* **Thương hiệu:** Mã thương hiệu, tên thương hiệu, xuất xứ, logo thương hiệu, mô tả thương hiệu, trạng thái.
* **Sản phẩm:** Mã sản phẩm, tên sản phẩm, đường dẫn thân thiện, mã danh mục, mã thương hiệu, giá cơ bản, mô tả tóm tắt, bài viết chi tiết, danh sách thông số kỹ thuật, hình ảnh đại diện, album ảnh chi tiết, trạng thái kinh doanh, số lượt xem.
* **Biến thể sản phẩm:** Mã biến thể, mã sản phẩm, mã quản lý kho (SKU), tên biến thể, tên thuộc tính, giá trị thuộc tính (màu sắc, cấu hình, kích cỡ), đơn giá bán, giá khuyến mãi, hình ảnh riêng của biến thể, trạng thái kinh doanh.
* **Kho hàng:** Mã bản ghi kho, mã sản phẩm, mã biến thể, số lượng tồn thực tế, số lượng đã giữ chỗ, số lượng có thể bán, định mức tồn kho tối thiểu, ngày cập nhật gần nhất.
* **Lịch sử biến động kho:** Mã giao dịch kho, mã bản ghi kho, loại biến động (nhập kho, bán hàng, hủy đơn, kiểm kê), số lượng thay đổi, số lượng tồn sau thay đổi, mã chứng từ liên quan, ngày thực hiện, mã nhân viên thực hiện.
* **Phiếu nhập kho:** Mã phiếu nhập, mã nhà cung cấp, ngày lập phiếu, tổng giá trị hàng nhập, ghi chú, mã nhân viên lập phiếu, trạng thái phê duyệt.
* **Giỏ hàng:** Mã giỏ hàng, mã khách hàng, ngày tạo, ngày cập nhật cuối cùng, tổng số lượng mặt hàng.
* **Mục giỏ hàng:** Mã mục giỏ, mã giỏ hàng, mã biến thể sản phẩm, số lượng chọn mua, đơn giá tại thời điểm thêm, trạng thái chọn để thanh toán.
* **Đơn hàng:** Mã đơn hàng, mã hiển thị đơn hàng, mã khách hàng, ngày đặt hàng, tổng tiền hàng, tiền thuế, phí vận chuyển, số tiền được giảm giá, số tiền giảm từ điểm thưởng, tổng tiền thanh toán cuối cùng, hình thức thanh toán, tình trạng thanh toán, trạng thái đơn hàng (chờ xử lý, đã xác nhận, đang đóng gói, đang giao, đã giao, đã hủy), mã địa chỉ giao hàng, họ tên người nhận, số điện thoại người nhận, địa chỉ giao hàng chi tiết, ghi chú của khách hàng.
* **Chi tiết đơn hàng:** Mã dòng chi tiết, mã đơn hàng, mã biến thể, tên sản phẩm, tên biến thể, đơn giá tại thời điểm mua, số lượng đặt mua, thành tiền, trạng thái bảo hành.
* **Giao dịch thanh toán:** Mã giao dịch, mã đơn hàng, phương thức thanh toán (cổng trực tuyến hoặc thanh toán tiền mặt), số tiền giao dịch, mã tham chiếu tại cổng thanh toán, mã ngân hàng thanh toán, ngày giao dịch, trạng thái giao dịch (chờ xử lý, thành công, thất bại).
* **Giao dịch hoàn tiền:** Mã yêu cầu hoàn tiền, mã giao dịch thanh toán gốc, số tiền hoàn trả, lý do hoàn tiền, ngày khởi tạo, ngày hoàn tất, mã nhân viên phê duyệt, trạng thái hoàn tiền.
* **Mã giảm giá:** Mã voucher, mã chữ số quy định, tiêu đề ưu đãi, hình thức giảm (theo phần trăm hoặc số tiền cố định), giá trị giảm, mức giảm tối đa, giá trị đơn hàng tối thiểu áp dụng, số lượt sử dụng tối đa, số lượt đã sử dụng, ngày bắt đầu hiệu lực, ngày hết hạn, trạng thái áp dụng.
* **Chiến dịch khuyến mãi:** Mã chiến dịch, tên chiến dịch, mô tả mục tiêu, tổng ngân sách chiến dịch, ngân sách đã chi tiêu, ngày bắt đầu, ngày kết thúc, trạng thái chiến dịch (dự thảo, đang chạy, tạm dừng, kết thúc).
* **Điểm thưởng và lịch sử điểm:** Mã bản ghi điểm, mã khách hàng, loại giao dịch (tích điểm khi mua hàng, tiêu điểm khi thanh toán, hết hạn điểm), số điểm thay đổi, số dư điểm khả dụng sau thay đổi, mã đơn hàng liên quan, ngày phát sinh giao dịch.
* **Đánh giá sản phẩm:** Mã đánh giá, mã sản phẩm, mã đơn hàng, mã khách hàng, số sao chấm (từ 1 đến 5), tiêu đề nhận xét, nội dung đánh giá chi tiết, danh sách hình ảnh gửi kèm, ngày đánh giá, trạng thái hiển thị.
* **Danh sách yêu thích:** Mã bản ghi yêu thích, mã khách hàng, mã sản phẩm, ngày thêm vào danh sách.
* **Thông báo:** Mã thông báo, mã người nhận, tiêu đề thông báo, nội dung thông báo, loại thông báo (đơn hàng, khuyến mãi, hệ thống), đường dẫn liên kết, trạng thái đã đọc, ngày gửi.
* **Hồ sơ thu cũ đổi mới:** Mã hồ sơ, mã khách hàng, tên thiết bị cũ, tình trạng thiết bị, ảnh chụp máy, giá dự kiến thẩm định, mã voucher cấp bù, mã nhân viên thẩm định, trạng thái thẩm định.
* **Phiên hỗ trợ trực tuyến:** Mã phiên hỗ trợ, mã khách hàng, mã nhân viên tiếp nhận, thời gian bắt đầu, thời gian kết thúc, trạng thái phiên (trợ lý ảo trả lời, đã chuyển nhân viên, đã đóng), đánh giá chất lượng phiên chat.

### Bước 5: Quan hệ giữa các đối tượng và dữ liệu

* Một Thành viên có thể có nhiều Địa chỉ nhận hàng, nhưng tại một thời điểm chỉ có duy nhất một địa chỉ là địa chỉ mặc định.
* Một Thành viên có thể tạo nhiều Đơn hàng trong suốt quá trình mua sắm, nhưng một Đơn hàng chỉ thuộc về duy nhất một Thành viên (hoặc khách hàng).
* Một Thành viên có một Giỏ hàng duy nhất trong hệ thống; một Giỏ hàng có thể chứa nhiều Mục giỏ hàng khác nhau.
* Mỗi Mục giỏ hàng liên kết trực tiếp với duy nhất một Biến thể sản phẩm.
* Một Danh mục có thể chứa nhiều Danh mục con theo quan hệ phân cấp hình cây, và một Danh mục có thể chứa nhiều Sản phẩm.
* Một Thương hiệu có thể sản xuất nhiều Sản phẩm, mỗi Sản phẩm thuộc về đúng một Thương hiệu.
* Một Sản phẩm bắt buộc thuộc về một Danh mục chính, và một Sản phẩm có thể có nhiều Biến thể sản phẩm khác nhau.
* Mỗi Biến thể sản phẩm có đúng một bản ghi Kho hàng để quản lý số lượng tồn.
* Một bản ghi Kho hàng có thể có nhiều bản ghi Lịch sử biến động kho theo thời gian.
* Một Đơn hàng bao gồm nhiều dòng Chi tiết đơn hàng; mỗi dòng Chi tiết đơn hàng gắn liền với đúng một Biến thể sản phẩm.
* Một Đơn hàng gắn liền với đúng một Giao dịch thanh toán chính (hoặc có thể có thêm các Giao dịch hoàn tiền nếu đơn hàng bị hủy hoặc phát sinh sự cố).
* Một Mã giảm giá có thể được áp dụng cho nhiều Đơn hàng khác nhau (cho đến khi hết lượt dùng), nhưng trong một Đơn hàng tại một thời điểm chỉ được áp dụng tối đa một Mã giảm giá theo quy định.
* Một Chiến dịch khuyến mãi có thể phát hành nhiều Mã giảm giá cho các đối tượng khách hàng khác nhau.
* Một Thành viên có một tài khoản Điểm thưởng và có nhiều bản ghi Lịch sử điểm tương ứng với từng lần mua hàng hoặc đổi điểm.
* Một Khách hàng có thể viết nhiều Đánh giá cho các Sản phẩm khác nhau, nhưng đối với mỗi Đơn hàng đã mua thành công, Khách hàng chỉ được gửi một Đánh giá cho từng Sản phẩm trong đơn hàng đó.
* Một Khách hàng có thể lưu nhiều Sản phẩm vào Danh sách yêu thích của mình.
* Một Khách hàng có thể tạo nhiều yêu cầu Thu cũ đổi mới và tham gia nhiều Phiên hỗ trợ trực tuyến theo từng thời điểm cần trợ giúp.

---

## 3. Mô tả hệ thống bằng ngôn ngữ UML - Use Case

### 3.1. Biểu đồ use case tổng quan

* **Tệp mã nguồn PlantUML:** [uc_tong_quan.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_tong_quan.puml)


*(Hình ảnh 1. Biểu đồ usecase tổng quan)*

#### Thuyết minh các Use Case trong biểu đồ tổng quan

* **Login:** UC này cho phép thành viên đăng nhập vào hệ thống để sử dụng các chức năng tương ứng với vai trò của mình.
* **Manage Profile:** UC này cho phép thành viên xem và cập nhật thông tin cá nhân, thay đổi mật khẩu và quản lý sổ địa chỉ giao hàng.
* **Manage Category & Product:** UC này cho phép nhân viên quản lý cập nhật, thêm mới, sửa hoặc xóa danh mục ngành hàng, thông tin sản phẩm và các biến thể cấu hình trong hệ thống.
* **Configure Campaign:** UC này cho phép nhân viên quản lý thiết kế, cấu hình điều kiện và vận hành các kịch bản khuyến mãi tự động hóa dựa trên quy trình BPMN Camunda.
* **Statistic & Forecast:** UC này cho phép nhân viên quản lý theo dõi các báo cáo thống kê doanh thu, tình trạng luân chuyển tồn kho và xem các dự báo trí tuệ nhân tạo về nguy cơ khách hàng rời bỏ và nhu cầu tiêu thụ hàng hóa.
* **Manage Account:** UC này cho phép nhân viên quản lý phân quyền và quản lý trạng thái tài khoản người dùng trong toàn hệ thống.
* **Import Goods:** UC này cho phép nhân viên kho và nhà cung cấp phối hợp thực hiện lập, ký nhận và phê duyệt phiếu nhập hàng hóa mới vào kho.
* **Manage Inventory:** UC này cho phép nhân viên kho theo dõi số lượng tồn thực tế, tiến hành kiểm kê định kỳ và điều chỉnh sai lệch hàng tồn kho.
* **Search Products:** UC này cho phép khách hàng và khách vãng lai tìm kiếm sản phẩm thông qua từ khóa văn bản (kết hợp toàn văn và ngữ nghĩa) hoặc tải ảnh chụp thiết bị kèm công cụ cắt ảnh.
* **Personalized Recommendation:** UC này cho phép khách hàng và khách vãng lai nhận danh sách gợi ý sản phẩm cá nhân hóa phù hợp với thị hiếu dựa trên mô hình học sâu tuần tự SASRec.
* **Manage Cart:** UC này cho phép khách hàng quản lý danh sách sản phẩm dự định mua, cập nhật số lượng và chọn các mặt hàng cần tiến hành đặt hàng.
* **Online Order:** UC này cho phép khách hàng thực hiện toàn bộ quy trình đặt hàng trực tuyến từ giỏ hàng.
* **Online Payment:** UC này cho phép khách hàng thực hiện nghĩa vụ thanh toán đơn hàng qua cổng trực tuyến VNPay hoặc lựa chọn trả tiền mặt khi nhận hàng (COD).
* **Process Order:** UC này cho phép nhân viên bán hàng tiếp nhận các đơn hàng hợp lệ, thực hiện duyệt đơn, đóng gói và bàn giao kiện hàng cho đơn vị vận chuyển.
* **Cancel Order:** UC này cho phép khách hàng hoặc nhân viên bán hàng yêu cầu hủy bỏ đơn hàng khi đơn chưa được xuất kho giao đi.
* **Process Refund:** UC này cho phép nhân viên bán hàng và nhân viên quản lý xử lý bù trừ hoàn lại tiền cho khách hàng đối với các đơn hàng đã thanh toán trực tuyến bị hủy.
* **Review Product:** UC này cho phép khách hàng viết nhận xét, chấm điểm số sao và đăng ảnh phản hồi cho các sản phẩm đã mua thành công.
* **Request Trade-In:** UC này cho phép khách hàng đăng ký chương trình thu cũ đổi mới, gửi ảnh và tình trạng máy cũ để nhận trợ giá nâng cấp thiết bị mới.
* **Assess Trade-In:** UC này cho phép nhân viên bán hàng kiểm tra, thẩm định hồ sơ thu cũ đổi mới và cấp mã ưu đãi tương ứng cho khách hàng.
* **AI Chatbot Counseling:** UC này cho phép khách hàng trò chuyện và nhận tư vấn thông số kỹ thuật, so sánh thiết bị và chính sách cửa hàng tự động từ Trợ lý ảo AI sử dụng kiến trúc RAG.
* **Direct Support Chat:** UC này cho phép khách hàng và nhân viên bán hàng kết nối trò chuyện trực tiếp để giải quyết các vướng mắc chuyên sâu hoặc khiếu nại dịch vụ.
* **Verify Payment Webhook:** UC này cho phép cổng thanh toán VNPay gửi tín hiệu xác thực giao dịch ngầm (IPN) có ký số HMAC-SHA512 để hệ thống cập nhật trạng thái đơn hàng.
* **Update Delivery Tracking:** UC này cho phép đơn vị vận chuyển đối tác đồng bộ thông tin hành trình và tiến trình giao hàng về hệ thống theo thời gian thực.

---

### 3.2. Biểu đồ usecase Quản lý sản phẩm

* **Tệp mã nguồn PlantUML:** [uc_quan_ly_san_pham.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_quan_ly_san_pham.puml)

*(Hình ảnh 2. Biểu đồ usecase Quản lý sản phẩm)*

* **Manage Product:** UC này cho phép nhân viên quản lý điều phối thông tin sản phẩm trên hệ thống.
* **Employee Login:** UC này cho phép nhân viên đăng nhập tài khoản nội bộ có phân quyền quản trị.
* **Edit Product:** UC này cho phép nhân viên quản lý thay đổi các thông tin chi tiết của sản phẩm (tên, giá, mô tả, biến thể, hình ảnh).
* **Search Product:** UC này cho phép nhân viên quản lý nhập từ khóa hoặc bộ lọc danh mục để hệ thống hiển thị danh sách sản phẩm cần tìm.
* **Select Product:** UC này cho phép nhân viên quản lý lựa chọn một sản phẩm cụ thể từ danh sách kết quả để tiến hành chỉnh sửa.
* **Enter Product Information:** UC này cho phép nhân viên quản lý nhập và lưu các thông tin cần sửa của sản phẩm.

---

### 3.3. Biểu đồ usecase Tìm kiếm sản phẩm đa phương thức

* **Tệp mã nguồn PlantUML:** [uc_tim_kiem.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_tim_kiem.puml)

*(Hình ảnh 3. Biểu đồ usecase Tìm kiếm sản phẩm đa phương thức)*

* **Search Products:** UC này cho phép khách hàng và khách vãng lai tra cứu sản phẩm trong hệ thống.
* **Search by Text:** UC này cho phép người dùng nhập từ khóa tìm kiếm toàn văn và ngữ nghĩa.
* **Filter & Sort Products:** UC này cho phép người dùng lọc theo thương hiệu, mức giá và sắp xếp kết quả tìm kiếm.
* **View Product Details:** UC này cho phép người dùng xem thông tin chi tiết và thông số kỹ thuật của sản phẩm.
* **Search by Image:** UC này cho phép người dùng tải lên hình ảnh sản phẩm để tìm kiếm các thiết bị tương đồng về kiểu dáng.
* **Crop & Extract Features:** UC này cho phép người dùng cắt vùng ảnh thiết bị và hệ thống trích xuất vector đặc trưng CLIP.

---

### 3.4. Biểu đồ usecase Gợi ý sản phẩm cá nhân hóa

* **Tệp mã nguồn PlantUML:** [uc_goi_y.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_goi_y.puml)

*(Hình ảnh 4. Biểu đồ usecase Gợi ý sản phẩm cá nhân hóa)*

* **Personalized Recommendation:** UC này cho phép hệ thống tự động gợi ý sản phẩm phù hợp cho người dùng.
* **Track User Clickstream:** UC này cho phép hệ thống thu thập chuỗi hành vi xem, bấm và thêm vào giỏ hàng của người dùng.
* **Infer Sequential Preferences:** UC này cho phép mô hình AI SASRec phân tích thói quen để dự đoán sản phẩm người dùng quan tâm tiếp theo.
* **Display Recommended List:** UC này cho phép hệ thống hiển thị danh sách sản phẩm gợi ý cá nhân hóa tại Trang chủ.
* **Cross-sell Recommendation:** UC này cho phép hệ thống đề xuất các phụ kiện đi kèm tương thích tại Giỏ hàng.

---

### 3.5. Biểu đồ usecase Đặt hàng và thanh toán trực tuyến

* **Tệp mã nguồn PlantUML:** [uc_dat_hang.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_dat_hang.puml)

*(Hình ảnh 5. Biểu đồ usecase Đặt hàng và thanh toán trực tuyến)*

* **Online Order & Checkout:** UC này cho phép khách hàng thực hiện quy trình mua sắm từ giỏ hàng.
* **Customer Login:** UC này cho phép khách hàng xác thực phiên đăng nhập trước khi tạo đơn hàng.
* **Select Cart Items:** UC này cho phép khách hàng tích chọn các mặt hàng cần mua trong giỏ hàng.
* **Enter Shipping Address:** UC này cho phép khách hàng chọn hoặc nhập địa chỉ giao hàng chi tiết.
* **Apply Discounts:** UC này cho phép khách hàng nhập mã giảm giá voucher và sử dụng điểm thưởng tích lũy.
* **Reserve Stock:** UC này cho phép hệ thống khóa giữ số lượng tồn kho khả dụng để chống bán vượt tồn kho.
* **Online Payment:** UC này cho phép khách hàng chọn thanh toán trực tuyến qua VNPay hoặc tiền mặt khi nhận hàng (COD).
* **Verify Payment Webhook:** UC này cho phép hệ thống tiếp nhận và xác thực chữ ký bảo mật từ cổng thanh toán.

---

### 3.6. Biểu đồ usecase Hủy đơn hàng và hoàn tiền

* **Tệp mã nguồn PlantUML:** [uc_huy_don.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_huy_don.puml)

*(Hình ảnh 6. Biểu đồ usecase Hủy đơn hàng và hoàn tiền)*

* **Cancel Order:** UC này cho phép khách hàng hoặc nhân viên bán hàng yêu cầu chấm dứt đơn hàng khi chưa xuất kho giao đi.
* **Select Order to Cancel:** UC này cho phép người dùng chọn đơn hàng đủ điều kiện hủy trong danh sách.
* **Enter Cancellation Reason:** UC này cho phép người dùng khai báo lý do hủy đơn hàng.
* **Release Stock:** UC này cho phép hệ thống tự động hoàn lại số lượng sản phẩm bị giữ chỗ vào kho khả dụng.
* **Process Refund:** UC này cho phép hệ thống kích hoạt chuỗi bù trừ hoàn lại tiền cho các đơn hàng đã thanh toán trực tuyến.
* **Verify Refund Webhook:** UC này cho phép đối soát và xác nhận tiền đã được hoàn trả thành công từ cổng VNPay.

---

### 3.7. Biểu đồ usecase Thiết lập chiến dịch khuyến mãi tự động

* **Tệp mã nguồn PlantUML:** [uc_khuyen_mai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_khuyen_mai.puml)

*(Hình ảnh 7. Biểu đồ usecase Thiết lập chiến dịch khuyến mãi tự động)*

* **Configure Campaign:** UC này cho phép nhân viên quản lý điều phối các chương trình ưu đãi tự động.
* **Employee Login:** UC này cho phép nhân viên quản lý xác thực phiên làm việc quản trị.
* **Design BPMN Process:** UC này cho phép thiết kế sơ đồ quy trình tự động hóa tiếp thị trên động cơ Camunda.
* **Configure Budget & Rules:** UC này cho phép cấu hình hạn mức chi tiêu ngân sách và quy tắc giảm giá voucher.
* **Deploy Campaign Workflow:** UC này cho phép triển khai tiến trình tự động lắng nghe sự kiện phân tán từ hệ thống.
* **Monitor Campaign Execution:** UC này cho phép theo dõi nhật ký thực thi quy trình và số lượng voucher đã phát hành.

---

### 3.8. Biểu đồ usecase Tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng

* **Tệp mã nguồn PlantUML:** [uc_tro_ly_ai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/uc_tro_ly_ai.puml)

*(Hình ảnh 8. Biểu đồ usecase Tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng)*

* **AI Chatbot Counseling:** UC này cho phép khách hàng trò chuyện và hỏi đáp tự động với Trợ lý ảo AI.
* **Enter Counseling Query:** UC này cho phép khách hàng gửi câu hỏi tư vấn về sản phẩm và chính sách.
* **Retrieve Knowledge Base:** UC này cho phép hệ thống truy xuất tài liệu liên quan từ kho tri thức vector (RAG).
* **Generate AI Response:** UC này cho phép mô hình ngôn ngữ lớn tổng hợp và phát luồng câu trả lời chính xác.
* **Direct Support Chat:** UC này cho phép chuyển tiếp phiên trò chuyện sang nhân viên tư vấn khi khách hàng yêu cầu.

