# Chương 2 — Đặt hàng và thanh toán

Bộ 8 sơ đồ chi tiết được cập nhật theo source local ngày 06/11/2026, hoàn tất ngày 07/11/2026. Sequence tạo đơn được duyệt trước và dùng làm mẫu về mức chi tiết cho cả bộ.

## Mở xem

- [Mục lục có ảnh xem trước](diagrams/index.html).
- [Toàn bộ hình và thuyết minh](HINH_VE.md).
- [Bảng đối chiếu mã nguồn và phạm vi rút gọn](diagrams/DOI_CHIEU_2026-11-06.md).

| Sơ đồ | UC04.1 — Đặt hàng | UC04.2 — Thanh toán |
| --- | --- | --- |
| Use case | [SVG](diagrams/dat-hang/01-use-case.svg) · [PNG](diagrams/dat-hang/01-use-case.png) · [PlantUML](diagrams/dat-hang/01-use-case.puml) | [SVG](diagrams/thanh-toan/01-use-case.svg) · [PNG](diagrams/thanh-toan/01-use-case.png) · [PlantUML](diagrams/thanh-toan/01-use-case.puml) |
| Activity | [SVG](diagrams/dat-hang/02-activity.svg) · [PNG](diagrams/dat-hang/02-activity.png) · [PlantUML](diagrams/dat-hang/02-activity.puml) | [SVG](diagrams/thanh-toan/02-activity.svg) · [PNG](diagrams/thanh-toan/02-activity.png) · [PlantUML](diagrams/thanh-toan/02-activity.puml) |
| Sequence | [SVG](diagrams/dat-hang/03-sequence.svg) · [PNG](diagrams/dat-hang/03-sequence.png) · [PlantUML](diagrams/dat-hang/03-sequence.puml) | [SVG](diagrams/thanh-toan/03-sequence.svg) · [PNG](diagrams/thanh-toan/03-sequence.png) · [PlantUML](diagrams/thanh-toan/03-sequence.puml) |
| Trạng thái | [SVG](diagrams/dat-hang/04-state.svg) · [PNG](diagrams/dat-hang/04-state.png) · [PlantUML](diagrams/dat-hang/04-state.puml) | [SVG](diagrams/thanh-toan/04-state.svg) · [PNG](diagrams/thanh-toan/04-state.png) · [PlantUML](diagrams/thanh-toan/04-state.puml) |

## Phạm vi

- Đặt hàng: preview, tạo đơn từ giỏ, voucher/điểm, giữ tồn Redis, transaction và bù trừ. State theo dõi thêm vòng đời giao/hoàn hàng.
- Thanh toán: VNPay và COD, initiate/retry, callback/IPN, đọc trạng thái chính thức, đối soát, sự kiện và hoàn tiền.
- Use case thể hiện ranh giới và actor; activity phân làn thành phần; sequence ghi lớp/hàm, transaction, nhánh và sự kiện; state phân biệt Order với Payment.
- Mỗi hình có nguồn PlantUML và hai bản render SVG/PNG cùng tên. SVG phù hợp để đọc các hình lớn; PNG dùng chèn báo cáo.

## Kiểm chứng

Đã kiểm tra cú pháp PlantUML, render và rà bố cục. Nội dung là đối chiếu tĩnh source/config local, chưa kiểm chứng bằng giao dịch VNPay thực. Script agent-check ở repository root không phát hiện lệnh build/test của các module con; không coi đó là đã chạy unit test ứng dụng.

Lệnh render và danh sách nguồn nằm trong [tài liệu đối chiếu](diagrams/DOI_CHIEU_2026-11-06.md). Khi code đổi, cập nhật nguồn PlantUML trước rồi render lại cả SVG và PNG.

Các bản BAO_CAO.md, UC_TONG_QUAT.md và DOI_CHIEU_MA_NGUON.md cũ là tài liệu nền; phạm vi và chi tiết bộ hình hiện tại nằm trong các liên kết trên.
