# Chương 2 — Đặt hàng và thanh toán trực tuyến

Bộ sơ đồ cho Chức năng 4, dựa trên source trong workspace ngày 01/11/2026. Hai UC chính: **UC04.1 — Đặt hàng trực tuyến** và **UC04.2 — Thanh toán đơn hàng qua VNPay**. Mỗi UC có Use Case, Activity, Sequence và trạng thái.

## Mở xem

- [Toàn bộ hình và thuyết minh](HINH_VE.md).
- [Use Case tổng quát và phạm vi hai UC](UC_TONG_QUAT.md).

| Sơ đồ | UC04.1 — Đặt hàng | UC04.2 — Thanh toán VNPay |
|---|---|---|
| Use Case | [SVG](diagrams/dat-hang/01-use-case.svg) · [Nguồn](diagrams/dat-hang/01-use-case.puml) | [SVG](diagrams/thanh-toan/01-use-case.svg) · [Nguồn](diagrams/thanh-toan/01-use-case.puml) |
| Activity | [SVG](diagrams/dat-hang/02-activity.svg) · [Nguồn](diagrams/dat-hang/02-activity.puml) | [SVG](diagrams/thanh-toan/02-activity.svg) · [Nguồn](diagrams/thanh-toan/02-activity.puml) |
| Sequence | [SVG](diagrams/dat-hang/03-sequence.svg) · [Nguồn](diagrams/dat-hang/03-sequence.puml) | [SVG](diagrams/thanh-toan/03-sequence.svg) · [Nguồn](diagrams/thanh-toan/03-sequence.puml) |
| Trạng thái | [SVG](diagrams/dat-hang/04-state.svg) · [Nguồn](diagrams/dat-hang/04-state.puml) | [SVG](diagrams/thanh-toan/04-state.svg) · [Nguồn](diagrams/thanh-toan/04-state.puml) |

Có **8 sơ đồ chi tiết + 1 Use Case tổng quát**. Mỗi hình có file PlantUML, SVG và PNG cùng tên. Các UC con là thành phần của hai UC chính, không phải yêu cầu làm thêm bộ 4 sơ đồ cho từng hình elip.

## Hình thức theo ảnh mẫu

- Use Case: khung hệ thống xanh nhạt, actor bên ngoài, quan hệ include/extend đúng phạm vi.
- Activity: các làn Khách hàng – Hệ thống; thêm VNPay khi cần, nút hành động xanh và điểm bắt đầu/kết thúc.
- Sequence: actor/boundary/control/entity, lifeline nét đứt, thanh kích hoạt xanh; yêu cầu đường liền, trả về nét đứt, nhánh alt/opt.
- State: trạng thái xanh, nhãn chuyển ngắn; theo dõi Order và Payment riêng.
- [HINH_VE.md](HINH_VE.md) đặt đoạn mô tả trước hình, chú thích dưới hình và bảng đặc tả cho mỗi UC. Giải thích kỹ thuật dài chuyển xuống thuyết minh.
- Nội dung lấy từ code AuraTech. Ảnh mẫu chỉ quyết định hình thức trình bày.

## Quy ước báo cáo

- State của UC04.1 theo dõi **Order.status**; state của UC04.2 theo dõi **Payment.status**.
- Mã hình TQ, DH-1…DH-4, TT-1…TT-4 là mã tạm; đổi theo mục lục hình của nhóm.
- Dùng SVG để phóng to, PNG để chèn Docs. Giữ tỷ lệ ảnh và cỡ chữ đủ đọc khi đưa vào báo cáo.
- Hai thẻ cuối của Google Docs, Backup và Báo cáo mẫu, chỉ tham khảo cách trình bày. Tên trạng thái, phương thức và hành vi lấy từ code.
- [BAO_CAO.md](BAO_CAO.md) là bản nội dung trước khi chốt tách hai UC, còn cách chia 3 đặc tả và liên kết hình cũ. Phạm vi và bộ hình hiện tại nằm trong UC_TONG_QUAT.md và HINH_VE.md.
- [DOI_CHIEU_MA_NGUON.md](DOI_CHIEU_MA_NGUON.md) là tài liệu tra cứu bổ sung; nguồn trực tiếp của bộ hình mới nằm cuối HINH_VE.md.

## Điểm cần giữ khi trình bày

1. Giá đã gồm VAT; VAT là phần tách ra để hiển thị, không cộng thêm vào tổng tiền.
2. Giữ tồn Redis nguyên tử theo từng khóa sản phẩm/biến thể; cả giỏ cần bù trừ nếu có lỗi.
3. OrderCreatedEvent kích hoạt trừ tồn vật lý; không đợi thanh toán thành công. Kho và thanh toán xử lý bất đồng bộ.
4. Payment SUCCESS khác Order CONFIRMED. Thanh toán đến trước kho có thể đưa Order từ PENDING thẳng tới CONFIRMED.
5. Lượt VNPay thất bại/hết hạn không tự hủy đơn. Hạn đơn 30 phút khác hạn lượt mặc định 15 phút; các tác vụ quét chạy theo lịch.
6. Retry dùng lại đơn và bản ghi Payment, thay txnRef và attemptAt.
7. Callback trùng không phát lại sự kiện thành công; tiền đến muộn được xử lý theo trạng thái và txnRef của lượt tương ứng.

## Xuất lại hình

Từ thư mục tài liệu này, với Java và PlantUML đã có trên máy:

```powershell
$diagramFiles = @(Get-ChildItem -LiteralPath diagrams -Recurse -Filter *.puml | ForEach-Object FullName)
java -Djava.awt.headless=true -jar <duong-dan-plantuml.jar> -charset UTF-8 -tsvg @diagramFiles
java -Djava.awt.headless=true -jar <duong-dan-plantuml.jar> -charset UTF-8 -tpng @diagramFiles
```

Dựng hình cục bộ; Use Case/state dùng Smetana, Activity/Sequence dùng bộ bố trí của PlantUML.

## Kiểm chứng

Đối chiếu tĩnh với source và dựng hình bằng PlantUML; chưa chạy giao dịch VNPay thực. Script agent-check ở thư mục gốc không phát hiện lệnh build/test. Ngày 01/11/2026, workspace được thiết lập Git trên nhánh `docs/bao-cao-uml-20261101`, dựa trên commit `6b1e1c4ad018af21b03f36bec51816062da151fa` của `feat/final-integration`; mã nguồn ứng dụng khớp commit gốc. Thay đổi của nhánh này là tài liệu báo cáo.
