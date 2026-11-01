# Use Case tổng quan — sửa trên bản gốc

Bản chính là **[uc_tong_quan.vpp](uc_tong_quan.vpp)**, hiệu chỉnh từ file `C:/Users/dongo/Downloads/uc_tong_quan.vpp`. Giữ cấu trúc, tên tiếng Anh và bố cục của sơ đồ gốc; không thay bằng mô hình gom nhóm G01–G22.

- [Ảnh tổng quan](00-use-case-tong-quan.png), [SVG](00-use-case-tong-quan.svg), [PlantUML](00-use-case-tong-quan.puml).
- [XML mô hình gốc đã sửa](uc-tong-quan-sua-tren-ban-goc.xml), chứa ID và tọa độ để nhập vào Visual Paradigm.
- **[Đối chiếu từng sửa đổi với bản gốc](DOI_CHIEU_BAN_GOC.md)**: các phần giữ nguyên, các sửa quan hệ/quyền và UC bổ sung.
- Ảnh đã có bố cục dọc như hình gốc; các file `00-use-case-tong-quan-doc.*` là cùng bản dọc dùng để chèn báo cáo, không xoay chữ ngang.

## Những gì được giữ

Giữ 5 actor `Member`, `Guest`, `Customer`, `Staff`, `Admin` cùng ID và vị trí ban đầu. Giữ ID của cả 22 UC tổng quan. 21 tên UC không đổi; `Cancel Order & Refund` được đổi thành `Cancel Order` vì đã có `Process Refund Requests` riêng. 19 UC giữ nguyên cả vị trí và kích thước. Chỉ nới `Chat with AI Assistant` và `Place Online Order` để chứa điểm mở rộng; đặt `Cancel Order` xuống cuối như ảnh tham chiếu. Khung xanh giữ nguyên tọa độ đầu và chiều rộng, chỉ tăng chiều cao để có chỗ bổ sung.

Project vẫn chứa các diagram gốc. Trong sơ đồ tìm kiếm, các actor trùng tên được dùng chung model với 5 actor tổng quan, tránh Visual Paradigm tự đổi thành `Member2`, `Customer2`, `Guest2` khi import. Không tạo vai trò mới thay thế các actor gốc.

## Các chỉnh sửa nghiệp vụ

- `Apply Voucher` mở rộng `Place Online Order` theo điều kiện có voucher; bổ sung nhánh dùng điểm. Không bắt khách dùng ưu đãi trong mọi đơn.
- `Pay for Order` là UC thanh toán chung; `VNPay Payment` và `COD Payment` chuyên biệt hóa nó. Đơn hàng vẫn giữ hành vi chọn/khởi tạo phương án thanh toán; không khẳng định mọi đơn đều thanh toán trực tuyến ngay lập tức.
- `RAG Context Retrieval` mở rộng chat theo câu hỏi sản phẩm/chính sách, không chạy bắt buộc khi tra cứu API tài khoản.
- Giữ `Live Handover to Staff` và hướng extend về chat. Customer được chat AI; Guest/Customer có liên kết tham gia hỗ trợ trực tiếp.
- Hoàn tiền thủ công chuyển sang Admin; Staff được cập nhật catalog, vận hành chiến dịch, xem thống kê, quản lý kho và trả lời đánh giá theo code. Admin kế thừa nghiệp vụ Staff.
- Thêm actor ngoài `VNPay`; giữ riêng tiếp nhận kết quả thanh toán và thanh toán lại.
- Sơ đồ tìm kiếm gốc giữ tên và vị trí UC; bỏ hai đường kế thừa trùng giữa UC tìm kiếm chung và các thuật toán. Keyword/semantic là các xử lý phối hợp; fallback và hợp nhất RRF thuộc đặc tả thiết kế.

`Manage Inventory` bao gồm nhập bổ sung, điều chỉnh, xem lịch sử và hàng sắp hết. `Manage Products & Categories` giữ tên ban đầu; trong đặc tả phân biệt quyền tạo/sửa của Staff với quyền xóa, thuộc tính và nhập catalog hàng loạt của Admin. `Business Statistics` bao gồm tra cứu thống kê có trong hệ thống; phần dự báo nhu cầu/cảnh báo bất thường có dữ liệu demo phải được ghi rõ khi viết báo cáo.

## Tài liệu bổ trợ

Các file 01–06, bảng `truy-vet-use-case.md` và `dac-ta-use-case.md` là tài liệu phân rã/bằng chứng bổ trợ. Mã UC01–UC65 trong các file đó không thay tên/ID của 22 UC trong VPP gốc. Các VPP có tên `uc-tong-quat-hoan-thien` và `uc-tong-quat-theo-mau` là bản phụ trước đó; không dùng chúng thay cho `uc_tong_quan.vpp`. Chúng được giữ để tránh xóa hoặc ghi đè công việc đang mở trong Visual Paradigm.

Không sửa file VPP trong Downloads hoặc project đang mở có thay đổi chưa lưu. Khi mở bản chính mới, dùng Project → Open → `uc_tong_quan.vpp`.

## Tái tạo ảnh và kiểm tra

`render-original-overview.ps1` đọc XML hiệu chỉnh, xuất ảnh/SVG và file PUML đi kèm. `render-overview.ps1` chuyển tiếp tới renderer này. XML/VPP giữ tọa độ gốc; PlantUML có thể tự bố trí khác khi render trực tiếp nhưng giữ topology.

Đã kiểm tra bằng Visual Paradigm 18.1: nhập, mở lại và xuất sơ đồ; đối chiếu ID/tọa độ với bản gốc; kiểm tra cú pháp PUML, SVG/XML và liên kết tài liệu. Đây là kiểm tra tài liệu, không phải kết quả chạy kiểm thử hệ thống. Agent-check tại gốc workspace không phát hiện lệnh build/test. Ngày 01/11/2026, workspace được thiết lập Git và toàn bộ tài liệu được đưa vào nhánh riêng `docs/bao-cao-uml-20261101`, dựa trên commit `6b1e1c4ad018af21b03f36bec51816062da151fa` của `feat/final-integration`.
