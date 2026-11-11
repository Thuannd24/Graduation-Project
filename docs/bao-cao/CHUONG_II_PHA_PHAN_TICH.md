# CHƯƠNG II: PHA PHÂN TÍCH

## 1. Viết kịch bản

---

### 1.1 Kịch bản cho module Quản lý sản phẩm (Sửa thông tin sản phẩm)

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
  <tr>
    <td style="width: 20%; font-weight: bold; background-color: #f2f2f2;">Use case</td>
    <td><b>Edit Product (Sửa thông tin sản phẩm)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Actor</td>
    <td><b>Manager Staff (Nhân viên quản lý)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Tiền điều kiện</td>
    <td>Nhân viên quản lý đăng nhập thành công vào hệ thống quản trị AuraTech Admin Portal với quyền quản trị viên hoặc nhân viên vận hành (<code>ROLE_ADMIN</code> / <code>ROLE_STAFF</code>).</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Hậu điều kiện</td>
    <td>Nhân viên quản lý sửa thông tin sản phẩm thành công; dữ liệu sản phẩm và các biến thể cấu hình được cập nhật vào cơ sở dữ liệu <code>product_db</code> và đồng bộ tức thời sang Elasticsearch.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Kịch bản chính</td>
    <td>
      <p><b>1.</b> Sau khi đăng nhập thành công, tại thanh điều hướng bên trái (Admin Sidebar), nhân viên quản lý nhấn chọn mục "Quản lý sản phẩm".</p>
      <p><b>2.</b> Giao diện quản lý thông tin sản phẩm hiện lên gồm thanh công cụ tra cứu, các bộ lọc danh mục/thương hiệu, bảng danh sách sản phẩm và nút chức năng:</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Quản lý sản phẩm</span>
      </div>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Sửa thông tin sản phẩm</span>
      </div>
      <p><b>3.</b> Tại thanh công cụ lọc của trang sản phẩm, hệ thống hiển thị ô tìm kiếm từ khóa, danh sách thả xuống (dropdown) chọn danh mục và nút "Tìm kiếm":</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Tìm kiếm sản phẩm</span>
      </div>
      <p><b>4.</b> Nhân viên quản lý nhấn vào danh mục và chọn: "Laptop Gaming".</p>
      <p><b>5.</b> Nhân viên quản lý nhập tên sản phẩm cần sửa vào ô tìm kiếm: <i>"Asus ROG Strix G16"</i> và nhấn nút "Tìm kiếm".</p>
      <p><b>6.</b> Hệ thống thực hiện truy vấn và hiển thị giao diện danh sách sản phẩm theo kết quả tìm kiếm gồm: "STT", "Mã sản phẩm", "Ảnh", "Tên sản phẩm", "Danh mục", "Thương hiệu", "Giá bán", "Số biến thể (SKU)", "Trạng thái", "Hành động":</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th style="width: 5%;">STT</th>
          <th style="width: 9%;">Mã SP</th>
          <th style="width: 8%;">Ảnh</th>
          <th style="width: 22%;">Tên sản phẩm</th>
          <th style="width: 14%;">Danh mục</th>
          <th style="width: 11%;">Thương hiệu</th>
          <th style="width: 11%;">Giá bán</th>
          <th style="width: 6%;">SKU</th>
          <th style="width: 9%;">Trạng thái</th>
          <th style="width: 11%;">Hành động</th>
        </tr>
        <tr>
          <td align="center">1</td>
          <td align="center">P001</td>
          <td align="center">[Ảnh SP]</td>
          <td><b>Laptop Asus ROG Strix G16</b><br><span style="font-size: 11px; color: #666;">asus-rog-strix-g16</span></td>
          <td>Laptop Gaming</td>
          <td align="center">ASUS</td>
          <td align="center">29.990.000đ</td>
          <td align="center">2</td>
          <td align="center" style="color: green; font-weight: bold;">Đang bán</td>
          <td align="center"><span style="border: 1px solid #333; padding: 2px 8px; background-color: #eee;">Chỉnh sửa</span></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td align="center">P002</td>
          <td align="center">[Ảnh SP]</td>
          <td><b>Chuột Logitech G Pro X</b><br><span style="font-size: 11px; color: #666;">logitech-g-pro-x</span></td>
          <td>Phụ kiện Gaming</td>
          <td align="center">Logitech</td>
          <td align="center">2.490.000đ</td>
          <td align="center">2</td>
          <td align="center" style="color: green; font-weight: bold;">Đang bán</td>
          <td align="center"><span style="border: 1px solid #333; padding: 2px 8px; background-color: #eee;">Chỉnh sửa</span></td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td align="center">P004</td>
          <td align="center">[Ảnh SP]</td>
          <td><b>Bàn phím cơ Asus ROG Azoth</b><br><span style="font-size: 11px; color: #666;">asus-rog-azoth</span></td>
          <td>Bàn phím cơ</td>
          <td align="center">ASUS</td>
          <td align="center">5.490.000đ</td>
          <td align="center">1</td>
          <td align="center" style="color: red; font-weight: bold;">Ngừng bán</td>
          <td align="center"><span style="border: 1px solid #333; padding: 2px 8px; background-color: #eee;">Chỉnh sửa</span></td>
        </tr>
      </table>
      <p><b>7.</b> Nhân viên quản lý tìm đến dòng sản phẩm cần chỉnh sửa: "Laptop Asus ROG Strix G16" (Mã sản phẩm: <code>P001</code>).</p>
      <p><b>8.</b> Nhân viên nhấn nút "Chỉnh sửa" tại dòng sản phẩm <code>P001</code>.</p>
      <p><b>9.</b> Hệ thống chuyển hướng sang giao diện form "Chi tiết sản phẩm cần sửa" (Tab <code>add-product</code> ở chế độ chỉnh sửa) và hiển thị toàn bộ thông tin hiện tại của sản phẩm:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr>
          <td style="width: 25%; font-weight: bold; background-color: #f9f9f9;">Mã sản phẩm (ID)</td>
          <td><code>P001</code> (Định danh hệ thống)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Tên sản phẩm</td>
          <td>Laptop Asus ROG Strix G16 (2024)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Đường dẫn tĩnh (Slug)</td>
          <td><code>laptop-asus-rog-strix-g16-2024</code></td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Danh mục sản phẩm</td>
          <td>Laptop Gaming › Asus ROG</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Thương hiệu</td>
          <td>ASUS</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Mô tả sản phẩm</td>
          <td>Màn hình 16 inch FHD+ 165Hz, vi xử lý Core i7-13650HX, đồ họa RTX 4060, tản nhiệt ROG Intelligent Cooling</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Giá niêm yết cơ bản</td>
          <td>29.990.000đ</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Trạng thái kinh doanh</td>
          <td>Đang bán (Active)</td>
        </tr>
      </table>
      <div style="text-align: center; margin: 10px 0;">
        <span style="border: 1px solid #333; padding: 4px 14px; margin-right: 12px; background-color: #eee;">Quay lại</span>
        <span style="border: 1px solid #333; padding: 4px 14px; background-color: #eee; font-weight: bold;">Xác nhận</span>
      </div>
      <p><b>10.</b> Phía dưới phần thông tin chung, hệ thống hiển thị bảng chi tiết các biến thể cấu hình (Variants) đi kèm sản phẩm:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th style="width: 18%;">Mã biến thể (SKU)</th>
          <th style="width: 32%;">Tên biến thể cấu hình</th>
          <th style="width: 16%;">Đơn giá niêm yết</th>
          <th style="width: 16%;">Giá vốn</th>
          <th style="width: 10%;">Tồn kho</th>
          <th style="width: 12%;">Trạng thái</th>
        </tr>
        <tr>
          <td align="center">SKU-ROG-G16-01</td>
          <td>Màu Xám Eclipse / RAM 16GB / SSD 512GB</td>
          <td align="center">29.990.000đ</td>
          <td align="center">25.000.000đ</td>
          <td align="center">15</td>
          <td align="center" style="color: green; font-weight: bold;">Có sẵn</td>
        </tr>
        <tr>
          <td align="center">SKU-ROG-G16-02</td>
          <td>Màu Xám Eclipse / RAM 32GB / SSD 1TB</td>
          <td align="center">33.490.000đ</td>
          <td align="center">28.500.000đ</td>
          <td align="center">8</td>
          <td align="center" style="color: green; font-weight: bold;">Có sẵn</td>
        </tr>
      </table>
      <p><b>11.</b> Giao diện mở khóa các ô nhập liệu cho phép nhân viên quản lý chỉnh sửa giá bán, mô tả chi tiết, chính sách bảo hành và giá biến thể cấu hình.</p>
      <p><b>12.</b> Nhân viên quản lý nhấn vào ô "Giá bán cơ bản" và nhập giá mới: <i>"28990000"</i>.</p>
      <p><b>13.</b> Nhân viên quản lý nhấn vào ô "Mô tả sản phẩm" và bổ sung quà tặng: <i>"Màn hình 16 inch FHD+ 165Hz, Core i7-13650HX, RTX 4060, tặng kèm balo ROG Ranger và chuột gaming chính hãng"</i>.</p>
      <p><b>14.</b> Nhân viên quản lý nhấn vào ô đơn giá biến thể <code>SKU-ROG-G16-01</code> và sửa thành: <i>"28990000"</i>.</p>
      <p><b>15.</b> Nhân viên quản lý kiểm tra lại tính chính xác của toàn bộ dữ liệu vừa chỉnh sửa trên form.</p>
      <p><b>16.</b> Nhân viên quản lý nhấn nút "Xác nhận" (hoặc "Cập nhật sản phẩm").</p>
      <p><b>17.</b> Hệ thống hiển thị hộp thoại xác nhận (Popup Modal): <i>"Bạn có chắc chắn muốn cập nhật thay đổi cho sản phẩm này không?"</i> kèm hai nút [Hủy bỏ] và [Đồng ý].</p>
      <p><b>18.</b> Nhân viên quản lý nhấn nút [Đồng ý].</p>
      <p><b>19.</b> Hệ thống kiểm tra dữ liệu, thực hiện cập nhật bản ghi vào cơ sở dữ liệu <code>product_db</code>, đồng bộ chỉ mục văn bản sang Elasticsearch và phát sự kiện <code>ProductUpdatedEvent</code> qua Kafka.</p>
      <p><b>20.</b> Hệ thống hiển thị thông báo "Cập nhật sản phẩm thành công!" và tự động quay về giao diện bảng danh sách quản lý sản phẩm với dữ liệu đã được cập nhật mới nhất.</p>
    </td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Ngoại lệ</td>
    <td>
      <p><b>5.1:</b> Không tìm thấy sản phẩm nào phù hợp với từ khóa tìm kiếm $\rightarrow$ Hệ thống hiển thị thông báo: <i>"Không tìm thấy sản phẩm nào phù hợp"</i>.</p>
      <p><b>16.1:</b> Không điền đủ thông tin sản phẩm bắt buộc (để trống tên sản phẩm hoặc mô tả) $\rightarrow$ Hệ thống đánh dấu đỏ và thông báo: <i>"Vui lòng nhập đủ thông tin sản phẩm"</i>.</p>
      <p><b>16.2:</b> Nhập giá bán không hợp lệ (số âm hoặc bằng 0) $\rightarrow$ Hệ thống cảnh báo: <i>"Giá bán sản phẩm phải là số nguyên dương hợp lệ"</i>.</p>
      <p><b>18.1:</b> Nhân viên nhấn nút [Hủy bỏ] tại hộp thoại xác nhận $\rightarrow$ Hệ thống đóng hộp thoại và giữ nguyên nội dung trên form để tiếp tục chỉnh sửa.</p>
    </td>
  </tr>
</table>

---

### 1.2 Kịch bản cho module Tìm kiếm sản phẩm đa phương thức

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
  <tr>
    <td style="width: 20%; font-weight: bold; background-color: #f2f2f2;">Use case</td>
    <td><b>Search Products (Tìm kiếm sản phẩm bằng văn bản và hình ảnh)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Actor</td>
    <td><b>Customer (Khách hàng) / Guest (Khách vãng lai)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Tiền điều kiện</td>
    <td>Người dùng truy cập vào trang chủ hoặc trang danh mục sản phẩm của hệ thống AuraTech.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Hậu điều kiện</td>
    <td>Hệ thống hiển thị danh sách sản phẩm khớp với câu hỏi ngữ nghĩa văn bản hoặc hình ảnh mẫu tải lên.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Kịch bản chính</td>
    <td>
      <p><b>1.</b> Người dùng truy cập vào trang chủ website AuraTech.</p>
      <p><b>2.</b> Tại thanh điều hướng chính, hệ thống hiển thị thanh tìm kiếm thông minh tích hợp ô nhập văn bản và biểu tượng máy ảnh tìm kiếm thị giác.</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Thanh tìm kiếm sản phẩm</span>
      </div>
      <p><b>3.</b> Người dùng nhấn chuột vào ô nhập liệu của thanh tìm kiếm.</p>
      <p><b>4.</b> Người dùng nhập câu truy vấn ngữ nghĩa tự nhiên vd: <i>"laptop gaming đồ họa mỏng nhẹ dưới 30 triệu"</i>.</p>
      <p><b>5.</b> Người dùng nhấn phím Enter hoặc bấm nút "Tìm kiếm".</p>
      <p><b>6.</b> Hệ thống tiếp nhận truy vấn, kích hoạt đồng thời tìm kiếm từ khóa toàn văn BM25 trên Elasticsearch và tìm kiếm vector ngữ nghĩa qua mô hình <code>multilingual-e5-base</code>.</p>
      <p><b>7.</b> Hệ thống xếp hạng kết quả theo thuật toán Reciprocal Rank Fusion (RRF).</p>
      <p><b>8.</b> Hệ thống hiển thị giao diện danh sách kết quả tìm kiếm gồm: "TT", "Hình ảnh", "Tên sản phẩm", "Cấu hình chính", "Giá bán", "Độ trùng khớp", "Trạng thái", "Hành động":</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th style="width: 5%;">TT</th>
          <th style="width: 10%;">Hình ảnh</th>
          <th style="width: 25%;">Tên sản phẩm</th>
          <th style="width: 24%;">Cấu hình chính</th>
          <th style="width: 12%;">Giá bán</th>
          <th style="width: 10%;">Độ trùng khớp</th>
          <th style="width: 9%;">Trạng thái</th>
          <th style="width: 10%;">Hành động</th>
        </tr>
        <tr>
          <td align="center">1</td>
          <td align="center">[Ảnh SP]</td>
          <td>Laptop Asus ROG Strix G16</td>
          <td>Core i7-13650HX, 16GB, RTX 4060</td>
          <td align="center">28.990.000đ</td>
          <td align="center">96% Match</td>
          <td align="center">Có sẵn</td>
          <td align="center">Xem chi tiết</td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td align="center">[Ảnh SP]</td>
          <td>Laptop Lenovo Legion Slim 5</td>
          <td>Ryzen 7 7840HS, 16GB, RTX 4060</td>
          <td align="center">29.490.000đ</td>
          <td align="center">92% Match</td>
          <td align="center">Có sẵn</td>
          <td align="center">Xem chi tiết</td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td align="center">[Ảnh SP]</td>
          <td>Laptop Acer Predator Helios Neo 16</td>
          <td>Core i7-13700HX, 16GB, RTX 4050</td>
          <td align="center">27.890.000đ</td>
          <td align="center">88% Match</td>
          <td align="center">Có sẵn</td>
          <td align="center">Xem chi tiết</td>
        </tr>
      </table>
      <p><b>9.</b> Người dùng muốn tìm kiếm sản phẩm cụ thể hơn theo một mẫu máy thực tế đang có sẵn ảnh chụp trong thiết bị.</p>
      <p><b>10.</b> Người dùng nhấn vào biểu tượng máy ảnh "Tìm kiếm bằng hình ảnh" trên thanh tìm kiếm.</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Tìm kiếm bằng hình ảnh</span>
      </div>
      <p><b>11.</b> Hệ thống hiển thị hộp thoại pop-up "Tải ảnh sản phẩm để tìm kiếm" có khu vực kéo thả tệp và nút "Chọn tệp từ thiết bị".</p>
      <p><b>12.</b> Người dùng nhấn nút "Chọn tệp từ thiết bị" và chọn tệp ảnh chụp laptop từ máy tính (<code>anh_laptop_gaming.jpg</code>).</p>
      <p><b>13.</b> Hệ thống tải ảnh lên và hiển thị giao diện xem trước ảnh kèm công cụ cắt ảnh tương tác (Interactive Image Cropper).</p>
      <p><b>14.</b> Người dùng dùng chuột điều chỉnh khung chữ nhật để đóng khung chính xác vùng thân máy laptop cần tìm.</p>
      <p><b>15.</b> Người dùng nhấn nút "Xác nhận tìm kiếm hình ảnh".</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Xác nhận tìm kiếm hình ảnh</span>
      </div>
      <p><b>16.</b> Dịch vụ AI trích xuất vector đặc trưng hình ảnh bằng mô hình CLIP (<code>OpenAI CLIP-ViT-B/32</code>) và so khớp khoảng cách Cosine trên cơ sở dữ liệu vector.</p>
      <p><b>17.</b> Hệ thống cập nhật bảng danh sách sản phẩm tương đồng về kiểu dáng và thiết kế:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th style="width: 5%;">TT</th>
          <th style="width: 12%;">Hình ảnh</th>
          <th style="width: 28%;">Tên sản phẩm tương đồng</th>
          <th style="width: 25%;">Màu sắc / Phân khúc</th>
          <th style="width: 15%;">Giá tham khảo</th>
          <th style="width: 15%;">Độ tương đồng thị giác</th>
          <th style="width: 10%;">Hành động</th>
        </tr>
        <tr>
          <td align="center">1</td>
          <td align="center">[Ảnh SP]</td>
          <td>Laptop Asus ROG Strix G16 (2024)</td>
          <td>Xám Eclipse / Gaming cao cấp</td>
          <td align="center">28.990.000đ</td>
          <td align="center">95.8% Visual Match</td>
          <td align="center">Xem chi tiết</td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td align="center">[Ảnh SP]</td>
          <td>Laptop Asus TUF Gaming F15</td>
          <td>Xám Mecha / Gaming tầm trung</td>
          <td align="center">21.490.000đ</td>
          <td align="center">89.2% Visual Match</td>
          <td align="center">Xem chi tiết</td>
        </tr>
      </table>
      <p><b>18.</b> Người dùng nhấn nút "Xem chi tiết" tại dòng sản phẩm có độ trùng khớp cao nhất (Laptop Asus ROG Strix G16).</p>
      <p><b>19.</b> Hệ thống chuyển hướng người dùng sang giao diện "Chi tiết sản phẩm" để xem thông số kỹ thuật đầy đủ và tiến hành đặt mua.</p>
    </td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Ngoại lệ</td>
    <td>
      <p><b>8.1:</b> Không tìm thấy sản phẩm nào phù hợp với từ khóa văn bản $\rightarrow$ Hệ thống thông báo: <i>"Không tìm thấy sản phẩm phù hợp với từ khóa tìm kiếm"</i>.</p>
      <p><b>12.1:</b> Tệp ảnh tải lên có định dạng không hỗ trợ hoặc dung lượng vượt quá 5MB $\rightarrow$ Hệ thống cảnh báo: <i>"Tệp ảnh không hợp lệ. Vui lòng tải lên ảnh JPG/PNG dung lượng dưới 5MB"</i>.</p>
      <p><b>16.1:</b> Không nhận diện được vật thể công nghệ trong ảnh tải lên $\rightarrow$ Hệ thống thông báo: <i>"Không nhận diện được sản phẩm trong ảnh. Vui lòng thử lại với ảnh chụp rõ nét hơn"</i>.</p>
    </td>
  </tr>
</table>

---

### 1.3 Kịch bản cho module Gợi ý sản phẩm cá nhân hóa thời gian thực

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
  <tr>
    <td style="width: 20%; font-weight: bold; background-color: #f2f2f2;">Use case</td>
    <td><b>Personalized Recommendation (Gợi ý sản phẩm AI SASRec & Bán chéo combo)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Actor</td>
    <td><b>Customer (Khách hàng) / Guest (Khách vãng lai)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Tiền điều kiện</td>
    <td>Người dùng truy cập website AuraTech và thực hiện các tương tác duyệt hàng, xem chi tiết sản phẩm.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Hậu điều kiện</td>
    <td>Hệ thống hiển thị danh sách sản phẩm gợi ý cá nhân hóa thời gian thực và bảng phụ kiện combo bán chéo ưu đãi.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Kịch bản chính</td>
    <td>
      <p><b>1.</b> Người dùng truy cập hệ thống AuraTech và xem danh mục sản phẩm trên trang chủ.</p>
      <p><b>2.</b> Người dùng nhấn xem chi tiết sản phẩm: "Laptop Asus ROG Strix G16".</p>
      <p><b>3.</b> Hệ thống hiển thị trang thông tin chi tiết và ngầm gửi sự kiện clickstream <code>VIEW_PRODUCT</code> về hàng đợi Kafka topic <code>user-clickstream-events</code>.</p>
      <p><b>4.</b> Người dùng cuộn chuột xem các thông số kỹ thuật, đánh giá của cộng đồng và xem phụ kiện liên quan.</p>
      <p><b>5.</b> Người dùng nhấn xem chi tiết món phụ kiện: "Chuột không dây Logitech G Pro X".</p>
      <p><b>6.</b> Người dùng bấm nút "Thêm vào danh sách yêu thích" đối với bàn di chuột SteelSeries QcK Prism.</p>
      <p><b>7.</b> Trình duyệt tự động thu thập chuỗi sự kiện tương tác và đẩy về dịch vụ gợi ý <code>recs-service</code>.</p>
      <p><b>8.</b> Dịch vụ AI trích xuất vector chuỗi 10 tương tác gần nhất và đưa vào mô hình mạng nơ-ron Transformer (SASRec).</p>
      <p><b>9.</b> Mô hình tính toán phân phối xác suất và suy luận dự đoán sản phẩm tiếp theo người dùng có nhu cầu cao nhất.</p>
      <p><b>10.</b> Người dùng nhấn vào logo AuraTech để quay trở lại Trang chủ.</p>
      <p><b>11.</b> Trang chủ tự động kích hoạt API gọi dịch vụ gợi ý thời gian thực.</p>
      <p><b>12.</b> Hệ thống hiển thị khối giao diện "Gợi ý dành riêng cho bạn" tại vị trí trung tâm Trang chủ:</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Gợi ý dành riêng cho bạn</span>
      </div>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th style="width: 5%;">TT</th>
          <th style="width: 10%;">Hình ảnh</th>
          <th style="width: 25%;">Tên sản phẩm gợi ý</th>
          <th style="width: 18%;">Thể loại</th>
          <th style="width: 14%;">Đơn giá</th>
          <th style="width: 13%;">Độ phù hợp AI</th>
          <th style="width: 15%;">Hành động</th>
        </tr>
        <tr>
          <td align="center">1</td>
          <td align="center">[Ảnh]</td>
          <td>Tai nghe Gaming HyperX Cloud III</td>
          <td>Phụ kiện âm thanh</td>
          <td align="center">2.190.000đ</td>
          <td align="center">98.4% Match</td>
          <td align="center">Xem chi tiết / Thêm giỏ</td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td align="center">[Ảnh]</td>
          <td>Bàn di chuột SteelSeries QcK Prism</td>
          <td>Phụ kiện Gear</td>
          <td align="center">890.000đ</td>
          <td align="center">95.1% Match</td>
          <td align="center">Xem chi tiết / Thêm giỏ</td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td align="center">[Ảnh]</td>
          <td>Giá đỡ tản nhiệt Cooler Master</td>
          <td>Phụ kiện Laptop</td>
          <td align="center">650.000đ</td>
          <td align="center">91.7% Match</td>
          <td align="center">Xem chi tiết / Thêm giỏ</td>
        </tr>
      </table>
      <p><b>13.</b> Người dùng mở trang "Giỏ hàng của bạn" để kiểm tra các sản phẩm đã thêm.</p>
      <p><b>14.</b> Tại giao diện Giỏ hàng, hệ thống tự động kích hoạt thuật toán bán chéo (Cross-sell Rule Engine) và hiển thị bảng "Phụ kiện gợi ý mua kèm ưu đãi":</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Phụ kiện gợi ý mua kèm ưu đãi</span>
      </div>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th>Món hàng trong giỏ</th>
          <th>Phụ kiện mua kèm gợi ý</th>
          <th>Đơn giá lẻ</th>
          <th>Giá Combo ưu đãi</th>
          <th>Tiết kiệm</th>
          <th>Hành động</th>
        </tr>
        <tr>
          <td>Laptop Asus ROG Strix G16</td>
          <td>Chuột Logitech G Pro X Superlight</td>
          <td align="center">2.490.000đ</td>
          <td align="center">1.990.000đ</td>
          <td align="center" style="color: green; font-weight: bold;">-500.000đ</td>
          <td align="center"><span style="border: 1px solid #333; padding: 2px 8px; background-color: #eee;">Mua kèm ngay</span></td>
        </tr>
        <tr>
          <td>Laptop Asus ROG Strix G16</td>
          <td>Balo chống sốc ROG Ranger BP2701</td>
          <td align="center">1.590.000đ</td>
          <td align="center">1.190.000đ</td>
          <td align="center" style="color: green; font-weight: bold;">-400.000đ</td>
          <td align="center"><span style="border: 1px solid #333; padding: 2px 8px; background-color: #eee;">Mua kèm ngay</span></td>
        </tr>
      </table>
      <p><b>15.</b> Người dùng xem xét mức giá ưu đãi và nhấn nút "Mua kèm ngay" tại dòng phụ kiện Chuột Logitech.</p>
      <p><b>16.</b> Hệ thống tự động thêm món phụ kiện vào giỏ hàng với giá combo đã chiết khấu và tính toán lại tổng tiền.</p>
      <p><b>17.</b> Hệ thống hiển thị thông báo phản hồi: <i>"Đã thêm phụ kiện ưu đãi vào giỏ hàng thành công!"</i>.</p>
      <p><b>18.</b> Người dùng tiếp tục các bước thanh toán đơn hàng.</p>
    </td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Ngoại lệ</td>
    <td>
      <p><b>8.1:</b> Người dùng mới truy cập lần đầu, chưa có dữ liệu lịch sử tương tác (Cold Start) $\rightarrow$ Hệ thống tự động chuyển sang cơ chế dự phòng (Fallback): Hiển thị danh sách sản phẩm bán chạy nhất toàn sàn (Trending Top Sellers) và sản phẩm được đánh giá 5 sao nhiều nhất.</p>
    </td>
  </tr>
</table>

---

### 1.4 Kịch bản cho module Đặt hàng và thanh toán trực tuyến

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
  <tr>
    <td style="width: 20%; font-weight: bold; background-color: #f2f2f2;">Use case</td>
    <td><b>Online Order & Checkout (Đặt hàng & Thanh toán VNPay / COD)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Actor</td>
    <td><b>Customer (Khách hàng)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Tiền điều kiện</td>
    <td>Khách hàng đã đăng nhập tài khoản hợp lệ, giỏ hàng có ít nhất một sản phẩm còn tồn kho.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Hậu điều kiện</td>
    <td>Khách hàng đặt các sản phẩm thành công; đơn hàng được tạo với trạng thái <code>PAID</code> (VNPay) hoặc <code>CONFIRMED</code> (COD); số lượng tồn kho được khấu trừ chính xác.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Kịch bản chính</td>
    <td>
      <p><b>1.</b> Sau khi đăng nhập, từ giao diện chính khách hàng nhấn chọn biểu tượng "Giỏ hàng".</p>
      <p><b>2.</b> Giao diện "Giỏ hàng của bạn" hiện lên hiển thị danh sách các sản phẩm đã thêm:</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Giỏ hàng của bạn</span>
      </div>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th style="width: 8%;">Chọn</th>
          <th style="width: 10%;">Mã SP</th>
          <th style="width: 28%;">Tên sản phẩm</th>
          <th style="width: 18%;">Biến thể cấu hình</th>
          <th style="width: 12%;">Đơn giá</th>
          <th style="width: 8%;">Số lượng</th>
          <th style="width: 12%;">Thành tiền</th>
          <th style="width: 8%;">Thao tác</th>
        </tr>
        <tr>
          <td align="center">[x]</td>
          <td align="center">P001</td>
          <td>Laptop Asus ROG Strix G16</td>
          <td>Xám / 16GB / 512GB</td>
          <td align="center">28.990.000đ</td>
          <td align="center">1</td>
          <td align="center">28.990.000đ</td>
          <td align="center">Xóa</td>
        </tr>
        <tr>
          <td align="center">[x]</td>
          <td align="center">P002</td>
          <td>Chuột không dây Logitech G Pro X</td>
          <td>Trắng / Wireless</td>
          <td align="center">2.490.000đ</td>
          <td align="center">1</td>
          <td align="center">2.490.000đ</td>
          <td align="center">Xóa</td>
        </tr>
      </table>
      <div style="text-align: center; margin: 10px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Tiến hành Đặt hàng</span>
      </div>
      <p><b>3.</b> Khách hàng tích chọn các sản phẩm cần mua và nhấn nút "Tiến hành Đặt hàng".</p>
      <p><b>4.</b> Hệ thống điều hướng sang giao diện "Xem trước và Xác nhận Đơn hàng" (<code>CheckoutPage</code>) với tiến trình 3 bước: <i>1. Giỏ hàng › 2. Thông tin giao nhận › 3. Thanh toán</i>.</p>
      <p><b>5.</b> Giao diện hiển thị phần "Thông tin giao nhận" và có nút "Chọn địa chỉ từ sổ địa chỉ":</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th>Họ tên người nhận</th>
          <th>Số điện thoại</th>
          <th>Email</th>
          <th>Địa chỉ nhận hàng chi tiết</th>
          <th>Trạng thái</th>
        </tr>
        <tr>
          <td align="center">Nguyễn Đình Thuân</td>
          <td align="center">0987654321</td>
          <td align="center">thuannd@auratech.vn</td>
          <td>Số 122 Hoàng Quốc Việt, Phường Cổ Nhuế 1, Bắc Từ Liêm, Hà Nội</td>
          <td align="center">Mặc định</td>
        </tr>
      </table>
      <p><b>6.</b> Khách hàng lựa chọn sử dụng địa chỉ nhận hàng mặc định đã lưu.</p>
      <p><b>7.</b> Dưới phần địa chỉ, hệ thống hiển thị bảng chi tiết các mặt hàng trong đơn hàng:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th>TT</th>
          <th>Tên sản phẩm</th>
          <th>Phân loại cấu hình</th>
          <th>Đơn giá</th>
          <th>Số lượng</th>
          <th>Thành tiền</th>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>Laptop Asus ROG Strix G16</td>
          <td>Xám / 16GB / 512GB</td>
          <td align="center">28.990.000đ</td>
          <td align="center">1</td>
          <td align="center">28.990.000đ</td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Chuột không dây Logitech G Pro X</td>
          <td>Trắng / Wireless</td>
          <td align="center">2.490.000đ</td>
          <td align="center">1</td>
          <td align="center">2.490.000đ</td>
        </tr>
      </table>
      <p><b>8.</b> Hệ thống hiển thị ô nhập mã giảm giá (VoucherPicker) và tùy chọn sử dụng điểm thưởng tích lũy (LoyaltyPointsPicker).</p>
      <p><b>9.</b> Khách hàng nhập mã giảm giá: <i>"AURATECH500K"</i> và nhấn nút "Áp dụng".</p>
      <p><b>10.</b> Hệ thống kiểm tra mã hợp lệ và chiết khấu 500.000đ vào đơn hàng.</p>
      <p><b>11.</b> Khách hàng tích chọn: <code>[x] Sử dụng 100 điểm thưởng tích lũy (-100.000đ)</code>.</p>
      <p><b>12.</b> Hệ thống tự động tính toán và hiển thị bảng tổng kết chi phí đơn hàng chi tiết:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2;">
          <th style="width: 40%; text-align: left;">Khoản mục chi phí</th>
          <th style="width: 25%; text-align: center;">Số tiền</th>
          <th style="width: 35%; text-align: left;">Ghi chú diễn giải</th>
        </tr>
        <tr>
          <td><b>Tạm tính tiền hàng</b></td>
          <td align="center">31.480.000đ</td>
          <td>Tổng giá trị 2 sản phẩm</td>
        </tr>
        <tr>
          <td><b>Thuế GTGT (VAT 10%)</b></td>
          <td align="center">3.148.000đ</td>
          <td>Thuế điện tử theo quy định</td>
        </tr>
        <tr>
          <td><b>Phí vận chuyển bưu chính</b></td>
          <td align="center">50.000đ</td>
          <td>Giao hàng nhanh bưu chính toàn quốc</td>
        </tr>
        <tr>
          <td><b>Mã giảm giá (Voucher)</b></td>
          <td align="center" style="color: red;">-500.000đ</td>
          <td><i>Khấu trừ từ voucher AURATECH500K</i></td>
        </tr>
        <tr>
          <td><b>Điểm thưởng thành viên</b></td>
          <td align="center" style="color: red;">-100.000đ</td>
          <td><i>Quy đổi từ 100 điểm tích lũy</i></td>
        </tr>
        <tr style="background-color: #f9f9f9;">
          <td><b>TỔNG THANH TOÁN</b></td>
          <td align="center" style="color: #d9534f; font-weight: bold; font-size: 14px;">34.078.000đ</td>
          <td><b>Tổng số tiền khách hàng thanh toán</b></td>
        </tr>
      </table>
      <p><b>13.</b> Khách hàng lựa chọn phương thức thanh toán:</p>
      <p style="margin-left: 20px;">
        <code>(x) Cổng thanh toán trực tuyến VNPay (VNPAY-QR / Thẻ ATM nội địa / Thẻ quốc tế)</code><br>
        <code>( ) Thanh toán tiền mặt khi nhận hàng (COD)</code>
      </p>
      <p><b>14.</b> Khách hàng tích chọn phương thức: <code>(x) Cổng thanh toán trực tuyến VNPay</code>.</p>
      <p><b>15.</b> Khách hàng nhấn nút "Xác nhận Đặt hàng & Thanh toán".</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Xác nhận Đặt hàng & Thanh toán</span>
      </div>
      <p><b>16.</b> Hệ thống gửi yêu cầu tạo đơn kèm mã khóa <code>Idempotency-Key</code> sang dịch vụ <code>order-service</code>.</p>
      <p><b>17.</b> Hệ thống thực hiện kiểm tra và giữ chỗ số lượng tồn kho nguyên tử 2 lớp (Redis Atomic Decr + Khóa ghi bi quan <code>SELECT ... FOR UPDATE</code> trên CSDL <code>inventory_db</code>).</p>
      <p><b>18.</b> Đơn hàng được lưu vào CSDL với trạng thái khởi tạo <code>PENDING</code>.</p>
      <p><b>19.</b> Hệ thống sinh URL thanh toán có chữ ký bảo mật HMAC-SHA512 và chuyển hướng khách hàng sang Cổng thanh toán VNPay Sandbox.</p>
      <p><b>20.</b> Khách hàng quét mã VNPAY-QR trên ứng dụng ngân hàng và xác thực giao dịch chuyển khoản thành công.</p>
      <p><b>21.</b> Cổng VNPay gửi tín hiệu xác nhận Webhook IPN về dịch vụ <code>payment-service</code>; hệ thống kiểm tra chữ ký hợp lệ, cập nhật trạng thái đơn sang <code>PAID</code>, trừ kho vật lý, gửi email xác nhận và hiển thị màn hình kết quả <i>"ĐẶT HÀNG THÀNH CÔNG!"</i> (Mã đơn hàng <code>#ORD-8821</code>) kèm hai nút [Chi tiết đơn hàng] và [Tiếp tục mua sắm].</p>
    </td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Ngoại lệ</td>
    <td>
      <p><b>17.1:</b> Tồn kho khả dụng của sản phẩm không đủ tại thời điểm khóa giữ $\rightarrow$ Hệ thống dừng tiến trình và thông báo: <i>"Sản phẩm trong giỏ vừa hết hàng. Vui lòng chọn sản phẩm khác hoặc giảm số lượng"</i>.</p>
      <p><b>20.1:</b> Khách hàng nhấn hủy giao dịch tại cổng VNPay hoặc quá 15 phút không thanh toán $\rightarrow$ Hệ thống cập nhật trạng thái đơn sang <code>PAYMENT_FAILED</code>, tự động giải phóng tồn kho đã giữ trên Redis.</p>
    </td>
  </tr>
</table>

---

### 1.5 Kịch bản cho module Hủy đơn hàng và hoàn tiền

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
  <tr>
    <td style="width: 20%; font-weight: bold; background-color: #f2f2f2;">Use case</td>
    <td><b>Cancel Order & Refund (Hủy đơn hàng & Xử lý hoàn tiền tự động)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Actor</td>
    <td><b>Customer (Khách hàng) / Sales staff (Nhân viên bán hàng)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Tiền điều kiện</td>
    <td>Khách hàng đã đăng nhập thành công; đơn hàng ở trạng thái cho phép hủy (<code>PENDING</code>, <code>AWAITING_PAYMENT</code> hoặc <code>CONFIRMED</code>) và còn trong thời hạn 120 phút kể từ thời điểm đặt hàng (chưa chuyển sang đang vận chuyển <code>SHIPPING</code>).</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Hậu điều kiện</td>
    <td>Đơn hàng được chuyển sang trạng thái <code>CANCELLED</code>; số lượng tồn kho được hoàn trả lại kho; mã voucher và điểm thưởng được hoàn về tài khoản; số tiền đã thanh toán được hoàn trả qua VNPay.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Kịch bản chính</td>
    <td>
      <p><b>1.</b> Sau khi đăng nhập, tại menu tài khoản cá nhân, khách hàng nhấn chọn mục "Đơn hàng của tôi".</p>
      <p><b>2.</b> Giao diện "Danh sách đơn hàng của tôi" hiện lên hiển thị các đơn hàng gần nhất:</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Danh sách đơn hàng của tôi</span>
      </div>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th>Mã đơn hàng</th>
          <th>Ngày đặt hàng</th>
          <th>Tổng tiền</th>
          <th>Phương thức TT</th>
          <th>Trạng thái thanh toán</th>
          <th>Trạng thái đơn</th>
          <th>Thời hạn tự hủy</th>
          <th>Hành động</th>
        </tr>
        <tr>
          <td align="center"><code>#ORD-8821</code></td>
          <td align="center">11/10/2026</td>
          <td align="center">34.078.000đ</td>
          <td align="center">Cổng VNPay</td>
          <td align="center">Đã thanh toán (<code>PAID</code>)</td>
          <td align="center">Đã xác nhận (<code>CONFIRMED</code>)</td>
          <td align="center" style="color: green; font-weight: bold;">Còn 112 phút</td>
          <td align="center">Xem chi tiết / <b>Hủy đơn</b></td>
        </tr>
        <tr>
          <td align="center"><code>#ORD-8790</code></td>
          <td align="center">05/10/2026</td>
          <td align="center">2.490.000đ</td>
          <td align="center">Tiền mặt COD</td>
          <td align="center">Chưa thanh toán</td>
          <td align="center">Đã giao hàng (<code>DELIVERED</code>)</td>
          <td align="center" style="color: #888;">Hết hạn</td>
          <td align="center">Xem chi tiết</td>
        </tr>
      </table>
      <p><b>3.</b> Khách hàng nhấn chọn nút "Hủy đơn" tại đơn hàng <code>#ORD-8821</code>.</p>
      <p><b>4.</b> Hệ thống kiểm tra điều kiện hủy: Trạng thái đơn hàng là <code>CONFIRMED</code> và thời gian còn lại $> 0$ (chưa chuyển sang <code>SHIPPING</code>) $\rightarrow$ Thỏa mãn điều kiện cho phép hủy đơn.</p>
      <p><b>5.</b> Hệ thống hiển thị giao diện pop-up modal "Xác nhận Hủy đơn hàng và Hoàn tiền" gồm bảng thông tin đối soát chi tiết:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr>
          <td style="width: 32%; font-weight: bold; background-color: #f9f9f9;">Mã đơn hàng hủy</td>
          <td><code>#ORD-8821</code></td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Số tiền đã thanh toán</td>
          <td>34.078.000đ (Đã thanh toán thành công qua Cổng VNPay)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Mã giao dịch ngân hàng (TxnRef)</td>
          <td><code>VNPAY-TRANS-20261011-8821</code></td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Voucher hoàn trả</td>
          <td>01 mã <code>AURATECH500K</code> (Được phục hồi lượt dùng & gia hạn thêm 07 ngày)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Điểm thưởng hoàn trả</td>
          <td>100 điểm thưởng tích lũy (Hoàn về ví điểm của khách hàng)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background-color: #f9f9f9;">Phương thức hoàn tiền</td>
          <td>Hoàn tiền tự động về tài khoản ngân hàng nguồn qua VNPay Refund API</td>
        </tr>
      </table>
      <p><b>6.</b> Dưới bảng đối soát, hệ thống hiển thị danh sách lý do hủy đơn để khách hàng lựa chọn:</p>
      <p style="margin-left: 20px;">
        <code>(x) Tôi muốn thay đổi cấu hình hoặc chọn sản phẩm khác</code><br>
        <code>( ) Thời gian xử lý đơn hàng lâu hơn dự kiến</code><br>
        <code>( ) Tôi tìm thấy mức giá tốt hơn ở nơi khác</code><br>
        <code>( ) Lý do cá nhân khác</code>
      </p>
      <div style="text-align: center; margin: 10px 0;">
        <span style="border: 1px solid #333; padding: 4px 14px; margin-right: 12px; background-color: #eee;">Quay lại</span>
        <span style="border: 1px solid #333; padding: 4px 14px; background-color: #eee; font-weight: bold;">Xác nhận Hủy đơn</span>
      </div>
      <p><b>7.</b> Khách hàng tích chọn lý do: <code>(x) Tôi muốn thay đổi cấu hình hoặc chọn sản phẩm khác</code>.</p>
      <p><b>8.</b> Khách hàng nhấn nút "Xác nhận Hủy đơn".</p>
      <p><b>9.</b> Hệ thống hiển thị hộp thoại cảnh báo (Modal dialog): <i>"Bạn có chắc chắn muốn hủy đơn hàng này không? Quá trình hủy và hoàn tiền không thể hoàn tác."</i> kèm hai nút [Hủy bỏ] và [Đồng ý].</p>
      <p><b>10.</b> Khách hàng nhấn nút [Đồng ý].</p>
      <p><b>11.</b> Dịch vụ <code>order-service</code> kích hoạt giao dịch hủy đơn, sử dụng khóa ghi bi quan <code>findByIdForUpdate</code> (Pessimistic Write Lock: <code>SELECT ... FOR UPDATE</code>) trên CSDL <code>order_db</code> để khóa dòng bản ghi đơn hàng, loại trừ triệt để nguy cơ tranh chấp trạng thái đồng thời với tiến trình bàn giao vận chuyển (<code>shipOrder</code>) hoặc Webhook xử lý thanh toán.</p>
      <p><b>12.</b> Hệ thống cập nhật trạng thái đơn hàng từ <code>CONFIRMED</code> sang <code>CANCELLED</code>, đồng thời khởi tạo sự kiện <code>OrderCancelledEvent</code> và lưu vào bảng <code>outbox_events</code> trong cùng một phiên giao dịch ACID cục bộ (áp dụng mô hình <i>Transactional Outbox Pattern</i> nhằm đảm bảo tính toàn vẹn và không thất thoát sự kiện trong kiến trúc phân tán).</p>
      <p><b>13.</b> Tiến trình nền Outbox Publisher quét bản ghi sự kiện và đẩy thông điệp <code>OrderCancelledEvent</code> lên Kafka topic <code>order-events</code>.</p>
      <p><b>14.</b> Dịch vụ <code>inventory-service</code> tiêu thụ thông điệp từ Kafka, giải mã danh sách sản phẩm và thực hiện hoàn trả số lượng tồn kho nguyên tử trên bộ nhớ đệm Redis thông qua lệnh <code>INCRBY</code>, đồng thời cập nhật tăng số lượng tồn khả dụng (<code>available_quantity</code>) trong CSDL <code>inventory_db</code>.</p>
      <p><b>15.</b> Dịch vụ <code>order-service</code> gọi đồng bộ qua Feign Client sang <code>promotion-service</code> để khôi phục trạng thái hiệu lực của mã voucher <code>AURATECH500K</code>, và gọi sang <code>user-service</code> để cộng hoàn trả 100 điểm thưởng thành viên vào tài khoản ví điểm của khách hàng.</p>
      <p><b>16.</b> Dịch vụ <code>payment-service</code> tiếp nhận thông tin đơn hủy, tự động gửi yêu cầu hoàn tiền (<code>callVnPayRefundApi</code>) đến Cổng thanh toán VNPay Sandbox với mã giao dịch gốc <code>vnp_TxnRef = VNPAY-TRANS-20261011-8821</code> và số tiền hoàn 34.078.000đ.</p>
      <p><b>17.</b> Cổng thanh toán VNPay tiếp nhận, đối soát và phản hồi mã trạng thái giao dịch hoàn tiền thành công (<code>vnp_ResponseCode = 00</code>); hệ thống cập nhật bản ghi <code>Refund</code> sang trạng thái <code>SUCCESS</code> và chuyển trạng thái bản ghi <code>Payment</code> sang <code>REFUNDED</code>.</p>
      <p><b>18.</b> Dịch vụ <code>notification-service</code> tạo mẫu thông báo và gửi email biên lai hoàn tiền điện tử đến hộp thư của khách hàng.</p>
      <p><b>19.</b> Hệ thống hiển thị thông báo: <i>"Hủy đơn hàng thành công! Tiền sẽ được hoàn trả về tài khoản ngân hàng của bạn trong vòng 1-3 ngày làm việc."</i> và tự động cập nhật trạng thái đơn hàng trên giao diện tài khoản người dùng sang <code>CANCELLED</code>.</p>
    </td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Ngoại lệ</td>
    <td>
      <p><b>4.1:</b> Đơn hàng đã quá thời hạn 120 phút hoặc đã chuyển sang trạng thái đang vận chuyển (<code>SHIPPING</code>) $\rightarrow$ Hệ thống ẩn nút hủy và hiển thị cảnh báo: <i>"Đơn hàng đã quá thời hạn tự hủy (120 phút) hoặc đã được bàn giao vận chuyển. Không thể hủy đơn trực tiếp. Quý khách vui lòng từ chối nhận hàng khi shipper giao đến hoặc liên hệ CSKH"</i>.</p>
      <p><b>10.1:</b> Khách hàng nhấn nút [Hủy bỏ] tại hộp thoại cảnh báo $\rightarrow$ Hệ thống đóng hộp thoại và giữ nguyên trạng thái đơn hàng.</p>
      <p><b>16.1:</b> Cổng VNPay Refund phản hồi lỗi đường truyền gián đoạn hoặc quá tải hệ thống $\rightarrow$ Hệ thống lưu bản ghi hoàn tiền với trạng thái <code>REFUND_PENDING</code> và kích hoạt tác vụ nền thử lại tự động (Retry Job) theo cơ chế Exponential Backoff sau mỗi 10 phút.</p>
    </td>
  </tr>
</table>

---

### 1.6 Kịch bản cho module Thiết lập chiến dịch khuyến mãi tự động

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
  <tr>
    <td style="width: 20%; font-weight: bold; background-color: #f2f2f2;">Use case</td>
    <td><b>Configure Campaign (Thiết lập quy trình khuyến mãi tự động Camunda BPMN)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Actor</td>
    <td><b>Manager Staff (Quản trị viên / Nhân viên quản lý)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Tiền điều kiện</td>
    <td>Quản trị viên đăng nhập thành công vào cổng quản trị AuraTech với quyền <code>ROLE_ADMIN</code>.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Hậu điều kiện</td>
    <td>Sơ đồ quy trình khuyến mãi BPMN 2.0 được triển khai thành công lên Camunda Workflow Engine; các quy tắc tặng voucher tự động dựa trên sự kiện được kích hoạt toàn hệ thống.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Kịch bản chính</td>
    <td>
      <p><b>1.</b> Sau khi đăng nhập vào hệ thống quản trị, nhân viên quản lý chọn menu "Tiếp thị & Khuyến mãi tự động".</p>
      <p><b>2.</b> Giao diện "Quản lý chiến dịch khuyến mãi" hiện lên gồm danh sách các chiến dịch đang chạy và nút "Tạo mới chiến dịch":</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Quản lý chiến dịch khuyến mãi</span>
      </div>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th>Mã CĐ</th>
          <th>Tên chiến dịch</th>
          <th>Sự kiện kích hoạt</th>
          <th>Tổng ngân sách</th>
          <th>Đã giải ngân</th>
          <th>Số voucher phát</th>
          <th>Trạng thái</th>
          <th>Hành động</th>
        </tr>
        <tr>
          <td align="center">CMP01</td>
          <td>Chào mừng thành viên mới</td>
          <td>Đăng ký tài khoản mới</td>
          <td align="center">50.000.000đ</td>
          <td align="center">18.500.000đ</td>
          <td align="center">370</td>
          <td align="center" style="color: green; font-weight: bold;">Đang chạy</td>
          <td align="center">Xem / Sửa</td>
        </tr>
        <tr>
          <td align="center">CMP02</td>
          <td>Tri ân sinh nhật thành viên</td>
          <td>Sự kiện ngày sinh nhật</td>
          <td align="center">30.000.000đ</td>
          <td align="center">12.200.000đ</td>
          <td align="center">122</td>
          <td align="center" style="color: green; font-weight: bold;">Đang chạy</td>
          <td align="center">Xem / Sửa</td>
        </tr>
      </table>
      <div style="text-align: center; margin: 10px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Tạo mới chiến dịch</span>
      </div>
      <p><b>3.</b> Nhân viên quản lý nhấn nút "Tạo mới chiến dịch".</p>
      <p><b>4.</b> Hệ thống hiển thị giao diện "Thiết kế chiến dịch khuyến mãi tự động" tích hợp công cụ trực quan Camunda BPMN Modeler.</p>
      <p><b>5.</b> Nhân viên quản lý nhập tên chiến dịch vào ô thông tin: <i>"Giữ chân khách hàng tiềm năng Quý 4"</i>.</p>
      <p><b>6.</b> Nhân viên quản lý kéo-thả khối <code>Start Event</code> từ thanh công cụ bên trái vào vùng vẽ sơ đồ.</p>
      <p><b>7.</b> Nhân viên quản lý cấu hình thuộc tính cho Start Event: Lắng nghe sự kiện thông điệp Kafka <code>CUSTOMER_CHURN_RISK</code>.</p>
      <p><b>8.</b> Nhân viên quản lý kéo-thả khối <code>Business Rule Task</code> (DMN / Cú pháp điều kiện) và nối mũi tên tuần tự từ Start Event.</p>
      <p><b>9.</b> Nhân viên quản lý thiết lập điều kiện lọc quy tắc: Điểm rủi ro rời bỏ <code>risk_score >= 0.70</code> và ngân sách chiến dịch còn lại $> 0$.</p>
      <p><b>10.</b> Nhân viên quản lý kéo-thả khối <code>Service Task</code> thứ nhất có nhãn: "Tạo mã Voucher cá nhân hóa" và kết nối luồng tiếp theo.</p>
      <p><b>11.</b> Nhân viên quản lý kéo-thả khối <code>Service Task</code> thứ hai có nhãn: "Gửi thông báo Push FCM & Email tiếp thị" và kết nối tiếp tục.</p>
      <p><b>12.</b> Nhân viên quản lý kéo-thả khối <code>End Event</code> và kết nối mũi tên hoàn tất quy trình.</p>
      <p><b>13.</b> Phía dưới trình thiết kế sơ đồ, hệ thống hiển thị bảng nhập thông số cấu hình và ngân sách:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2;">
          <th style="width: 30%; text-align: left;">Tên thông số cấu hình</th>
          <th style="width: 35%; text-align: left;">Giá trị thiết lập</th>
          <th style="width: 35%; text-align: left;">Diễn giải quy tắc nghiệp vụ</th>
        </tr>
        <tr>
          <td><b>Tên chiến dịch</b></td>
          <td>Giữ chân khách hàng tiềm năng Quý 4</td>
          <td>Tên hiển thị nội bộ chiến dịch</td>
        </tr>
        <tr>
          <td><b>Hạn mức ngân sách tối đa</b></td>
          <td>100.000.000đ</td>
          <td>Ngân sách giới hạn tối đa của chiến dịch</td>
        </tr>
        <tr>
          <td><b>Điều kiện kích hoạt sự kiện</b></td>
          <td><code>event.type == "CHURN_RISK" && score >= 0.7</code></td>
          <td>Lắng nghe cảnh báo từ mô hình AI Churn</td>
        </tr>
        <tr>
          <td><b>Loại ưu đãi phát hành</b></td>
          <td>Voucher cá nhân hóa (Personalized Voucher)</td>
          <td>Mã giảm giá gắn trực tiếp với ID người dùng</td>
        </tr>
        <tr>
          <td><b>Giá trị chiết khấu</b></td>
          <td>Giảm 10% (Tối đa 500.000đ cho đơn từ 2 triệu)</td>
          <td>Mức ưu đãi chiết khấu trực tiếp</td>
        </tr>
        <tr>
          <td><b>Thời hạn hiệu lực voucher</b></td>
          <td>07 ngày kể từ lúc phát hành</td>
          <td>Hạn sử dụng của mã ưu đãi</td>
        </tr>
      </table>
      <div style="text-align: center; margin: 10px 0;">
        <span style="border: 1px solid #333; padding: 4px 14px; margin-right: 12px; background-color: #eee;">Kiểm tra cú pháp BPMN</span>
        <span style="border: 1px solid #333; padding: 4px 14px; background-color: #eee; font-weight: bold;">Triển khai chiến dịch</span>
      </div>
      <p><b>14.</b> Nhân viên quản lý nhấn nút "Kiểm tra cú pháp BPMN".</p>
      <p><b>15.</b> Hệ thống phân tích cú pháp tệp XML BPMN 2.0 và hiển thị thông báo: <i>"Sơ đồ quy trình đạt chuẩn hợp lệ, không có lỗi rẽ nhánh luồng."</i></p>
      <p><b>16.</b> Nhân viên quản lý nhấn nút "Triển khai chiến dịch".</p>
      <p><b>17.</b> Hệ thống hiển thị hộp thoại xác nhận: <i>"Bạn có chắc chắn muốn kích hoạt chiến dịch khuyến mãi này với ngân sách 100.000.000đ không?"</i> kèm hai nút [Hủy bỏ] và [Đồng ý].</p>
      <p><b>18.</b> Nhân viên quản lý nhấn nút [Đồng ý].</p>
      <p><b>19.</b> Dịch vụ <code>promotion-service</code> gửi định nghĩa BPMN XML lên Camunda Workflow Engine để kích hoạt quy trình tự động, lưu bản ghi chiến dịch vào CSDL <code>promotion_db</code>.</p>
      <p><b>20.</b> Hệ thống hiển thị thông báo "Triển khai chiến dịch khuyến mãi tự động thành công!" và tự động quay về giao diện danh sách chiến dịch với trạng thái <code>Đang chạy</code>.</p>
    </td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Ngoại lệ</td>
    <td>
      <p><b>15.1:</b> Sơ đồ BPMN thiếu nút kết thúc hoặc kết nối sai luồng rẽ nhánh $\rightarrow$ Hệ thống cảnh báo: <i>"Sơ đồ quy trình không hợp lệ. Vui lòng kiểm tra lại liên kết giữa các tác vụ"</i>.</p>
      <p><b>16.1:</b> Hạn mức ngân sách vượt quá định mức tài chính phê duyệt của quý $\rightarrow$ Hệ thống báo lỗi: <i>"Hạn mức ngân sách vượt quá trần cho phép (Tối đa 150.000.000đ). Vui lòng điều chỉnh lại"</i>.</p>
      <p><b>18.1:</b> Quản trị viên nhấn nút [Hủy bỏ] tại hộp thoại xác nhận $\rightarrow$ Hệ thống đóng hộp thoại và giữ nguyên nội dung trên màn hình thiết kế.</p>
    </td>
  </tr>
</table>

---

### 1.7 Kịch bản cho module Tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
  <tr>
    <td style="width: 20%; font-weight: bold; background-color: #f2f2f2;">Use case</td>
    <td><b>AI Chatbot Counseling & Support Escalation (Tư vấn AI RAG & Chuyển giao nhân viên)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Actor</td>
    <td><b>Customer (Khách hàng) và Sales staff (Nhân viên bán hàng)</b></td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Tiền điều kiện</td>
    <td>Khách hàng truy cập website và mở cửa sổ chat; nhân viên bán hàng đã đăng nhập vào cổng quản trị và sẵn sàng hỗ trợ.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2;">Hậu điều kiện</td>
    <td>Khách hàng nhận được thông tin giải đáp chính xác từ AI hoặc được nhân viên bán hàng tiếp nhận xử lý khiếu nại thỏa đáng.</td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Kịch bản chính</td>
    <td>
      <p><b>1.</b> Sau khi truy cập website AuraTech, tại góc phải phía dưới màn hình, khách hàng nhấn vào biểu tượng Trợ lý ảo AI.</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #333; padding: 4px 16px; background-color: #e9ecef; font-weight: bold;">Khung chat Trợ lý ảo AuraTech AI</span>
      </div>
      <p><b>2.</b> Cửa sổ khung chat mở ra kèm lời chào mừng tự động: <i>"Xin chào! Em là Trợ lý AI của AuraTech. Em có thể giúp gì cho quý khách hôm nay?"</i> cùng các nút câu hỏi gợi ý thường gặp.</p>
      <p><b>3.</b> Khách hàng gõ câu hỏi vào ô nhập liệu: <i>"Chính sách bảo hành laptop Asus bên mình như thế nào? Nếu máy bị lỗi màn hình trong tuần đầu tiên có được đổi mới không?"</i>.</p>
      <p><b>4.</b> Khách hàng nhấn phím Enter hoặc nút "Gửi tin nhắn".</p>
      <p><b>5.</b> Tin nhắn của khách hàng hiển thị trong khung chat với trạng thái "Đang phản hồi...".</p>
      <p><b>6.</b> Dịch vụ AI <code>chatbot-service</code> tiếp nhận câu hỏi, thực hiện nhận diện ý định và truy xuất các đoạn tài liệu liên quan từ kho tri thức vector (RAG Engine):</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th style="width: 35%;">Tài liệu nguồn trích xuất</th>
          <th style="width: 50%;">Nội dung đối soát chính sách cửa hàng</th>
          <th style="width: 15%;">Độ tương đồng</th>
        </tr>
        <tr>
          <td><code>CHINH_SACH_BAO_HANH_2026.pdf</code></td>
          <td>Đổi mới 100% trong 30 ngày đầu tiên nếu phát sinh lỗi phần cứng từ nhà sản xuất (bao gồm lỗi màn hình từ 3 điểm chết trở lên).</td>
          <td align="center">0.94</td>
        </tr>
        <tr>
          <td><code>QUY_DINH_BAO_HANH_ASUS.pdf</code></td>
          <td>Bảo hành chính hãng 24 tháng toàn diện tại tất cả trung tâm bảo hành Asus trên toàn quốc.</td>
          <td align="center">0.89</td>
        </tr>
      </table>
      <p><b>7.</b> Mô hình ngôn ngữ lớn (Gemini LLM) tổng hợp ngữ cảnh và truyền phát câu trả lời dạng luồng (Streaming SSE) về khung chat trong vòng 1.5 giây:</p>
      <p style="margin-left: 20px; font-style: italic;">
        "Dạ chào bạn! Đối với laptop Asus, AuraTech áp dụng chính sách đổi mới 100% trong vòng 30 ngày đầu tiên nếu máy phát sinh lỗi phần cứng từ nhà sản xuất (như lỗi sọc màn hoặc điểm chết màn hình). Sau 30 ngày, máy được bảo hành chính hãng 24 tháng tại toàn bộ trung tâm Asus trên toàn quốc ạ!"
      </p>
      <p><b>8.</b> Khách hàng tiếp tục gửi một phản hồi khiếu nại về việc đơn hàng giao đến bị móp méo hộp và bày tỏ thái độ không hài lòng: <i>"Tôi vừa nhận hàng mà hộp móp rách hết cả, máy đắt tiền mà giao hàng cẩu thả thế à? Cho tôi gặp trực tiếp nhân viên xử lý ngay!"</i>.</p>
      <p><b>9.</b> Thuật toán phân tích cảm xúc (Sentiment Analysis) nhận diện chỉ số tiêu cực vượt ngưỡng cảnh báo (<code>Negative Sentiment = 0.92</code>), đồng thời nhận diện ý định yêu cầu gặp người tư vấn.</p>
      <p><b>10.</b> Trợ lý ảo AI tự động hiển thị nút bấm nổi bật trên khung chat: <code>[Kết nối trực tiếp với Nhân viên hỗ trợ]</code> kèm lời xin lỗi nhẹ nhàng.</p>
      <div style="text-align: center; margin: 8px 0;">
        <span style="border: 1px solid #d9534f; padding: 4px 16px; background-color: #f2dede; font-weight: bold; color: #a94442;">Kết nối trực tiếp với Nhân viên hỗ trợ</span>
      </div>
      <p><b>11.</b> Khách hàng nhấn vào nút "Kết nối trực tiếp với Nhân viên hỗ trợ".</p>
      <p><b>12.</b> Hệ thống phát tín hiệu chuyển tiếp phiên chat (Chat Escalation) qua giao thức WebSocket tới cổng quản trị của nhân viên bán hàng.</p>
      <p><b>13.</b> Tại giao diện quản trị của nhân viên bán hàng (Tab <code>SupportChatTab</code>), hệ thống phát chuông thông báo và hiển thị phiên chat mới trong bảng chờ:</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">
        <tr style="background-color: #f2f2f2; text-align: center;">
          <th>Mã phiên</th>
          <th>Tên khách hàng</th>
          <th>Thời gian chờ</th>
          <th>Lý do chuyển tiếp</th>
          <th>Mức độ ưu tiên</th>
          <th>Thao tác</th>
        </tr>
        <tr>
          <td align="center"><code>#CHAT-102</code></td>
          <td>Nguyễn Đình Thuân</td>
          <td align="center">00:08</td>
          <td>Khách yêu cầu gặp người / Khiếu nại móp hộp hàng</td>
          <td align="center" style="color: red; font-weight: bold;">Rất cao (Khẩn cấp)</td>
          <td align="center"><b>Tiếp nhận ngay</b></td>
        </tr>
        <tr>
          <td align="center"><code>#CHAT-098</code></td>
          <td>Lê Minh Tuấn</td>
          <td align="center">03:15</td>
          <td>Hỏi thủ tục xuất hóa đơn VAT công ty</td>
          <td align="center">Bình thường</td>
          <td align="center">Xem phiên</td>
        </tr>
      </table>
      <p><b>14.</b> Nhân viên bán hàng nhấn nút "Tiếp nhận ngay" tại phiên chat <code>#CHAT-102</code>.</p>
      <p><b>15.</b> Hệ thống đồng bộ toàn bộ lịch sử trò chuyện trước đó giữa khách hàng và AI sang màn hình của nhân viên để nhân viên nắm bắt đầy đủ bối cảnh khiếu nại mà không cần hỏi lại khách.</p>
      <p><b>16.</b> Tại khung chat của khách hàng, hệ thống hiển thị thông báo: <i>"Chuyên viên tư vấn Nguyễn Văn A đã tham gia cuộc trò chuyện"</i>.</p>
      <p><b>17.</b> Nhân viên gửi tin nhắn chào hỏi, xin lỗi vì sự cố vận chuyển và hướng dẫn khách hàng gửi ảnh chụp tình trạng vỏ hộp để gửi bù kiện hàng mới ngay trong ngày.</p>
      <p><b>18.</b> Khách hàng đồng ý với phương án giải quyết và gửi ảnh chụp xác nhận qua khung chat.</p>
      <p><b>19.</b> Nhân viên bán hàng tạo phiếu đổi hàng hỗ trợ và nhấn nút "Đóng phiên hỗ trợ".</p>
      <p><b>20.</b> Hệ thống hiển thị bảng đánh giá chất lượng dịch vụ: Khách hàng đánh giá 5 sao kèm lời cảm ơn nhân viên đã hỗ trợ nhiệt tình.</p>
    </td>
  </tr>
  <tr>
    <td style="font-weight: bold; background-color: #f2f2f2; vertical-align: top;">Ngoại lệ</td>
    <td>
      <p><b>6.1:</b> Kho tri thức RAG không tìm thấy nội dung phù hợp với câu hỏi $\rightarrow$ Trợ lý ảo AI phản hồi: <i>"Xin lỗi quý khách, em chưa có thông tin chi tiết về nội dung này. Bạn có muốn kết nối với chuyên viên tư vấn để được hỗ trợ trực tiếp không?"</i>.</p>
      <p><b>13.1:</b> Toàn bộ nhân viên bán hàng đều đang bận tiếp nhận phiên chat khác $\rightarrow$ Hệ thống tự động thông báo cho khách hàng: <i>"Hiện tại các chuyên viên tư vấn đang bận hỗ trợ. Bạn đang ở vị trí số 1 trong hàng đợi. Chuyên viên sẽ kết nối với bạn trong ít phút!"</i>.</p>
    </td>
  </tr>
</table>

---

## 2. Trích và vẽ biểu đồ lớp thực thể cho module

### Bước 1: Mô tả hệ thống trong một đoạn văn

Hệ thống sàn thương mại điện tử phân tán AuraTech (AuraTech Distributed E-Commerce Platform) là một nền tảng trực tuyến tích hợp kiến trúc Microservices hướng sự kiện quy mô lớn, hỗ trợ toàn diện các tác nhân gồm thành viên (`Member`), khách hàng (`Customer`/`User`), cán bộ nhân viên nội bộ (`Employee`) gồm nhân viên quản lý (`ManagerStaff`), nhân viên bán hàng / CSKH (`SalesStaff`), nhân viên kho (`WarehouseStaff`), và đối tác nhà cung cấp (`Supplier`) trong toàn bộ chu trình kinh doanh, quản lý chuỗi cung ứng và mua sắm thiết bị công nghệ. Thành viên có thể đăng nhập tài khoản định danh để quản lý hồ sơ cá nhân và sổ địa chỉ giao hàng (`Address`), trong đó địa chỉ được đối soát phân cấp hành chính theo tỉnh/thành phố (`Province`) và phường/xã (`Ward`). Khách hàng sử dụng hệ thống để tìm kiếm sản phẩm đa phương thức, nhận gợi ý sản phẩm cá nhân hóa, lưu danh sách sản phẩm yêu thích (`WishlistItem`), duyệt cây danh mục (`Category`) và thương hiệu (`Brand`). Mỗi danh mục liên kết với tập các ràng buộc thuộc tính danh mục (`CategoryAttribute`), cấu hình các thuộc tính kỹ thuật động (`Attribute`) dùng làm bộ lọc tìm kiếm hoặc tiêu chí phân loại biến thể. Sản phẩm cha (`Product`) được mô tả chi tiết thông qua các giá trị thuộc tính tĩnh (`ProductAttributeValue`), bộ sưu tập hình ảnh trình chiếu (`ProductImage`), các nhãn thẻ tìm kiếm (`ProductTag`), và phân rã thành nhiều biến thể cấu hình SKU (`ProductVariant`) có gắn các giá trị tùy chọn cấu hình (`VariantOptionValue`). Khách hàng thêm các biến thể vào giỏ hàng, áp dụng các mã voucher giảm giá cá nhân hóa (`IssuedVoucher`) và điểm thưởng tích lũy để tiến hành đặt hàng trực tuyến.

Khách hàng xác nhận thông tin đơn hàng (`Order`), danh sách các chi tiết mặt hàng đặt mua (**`OrderItem`** lưu vết chính xác mã sản phẩm, mã biến thể, ảnh đại diện, thuộc tính snapshot, đơn giá, số lượng và thành tiền), và tiến hành thanh toán (`Payment`) qua cổng VNPay hoặc trả tiền mặt khi nhận hàng (COD). Khách hàng có thể chủ động hủy đơn hàng trong vòng 120 phút để được hệ thống tự động hoàn tiền (`Refund`) qua cổng thanh toán VNPay Refund và giải phóng tồn kho. Khách hàng cũng có thể gửi đánh giá, bình luận về sản phẩm (`ProductReview`), tham gia các phòng tư vấn trực tuyến (`ChatRoom`) trao đổi tin nhắn (`ChatMessage`) với trợ lý ảo AI hoặc yêu cầu chuyển tiếp sang nhân viên bán hàng để giải quyết khiếu nại. Nhân viên quản lý đăng nhập để thực hiện quản lý danh mục, thương hiệu, sản phẩm và biến thể; đồng thời thiết lập các chiến dịch khuyến mãi tự động (`Campaign`) tích hợp mô hình quy trình Camunda BPMN để phát hành mã voucher cho khách hàng, đồng thời hệ thống lưu vết nhật ký thực thi Idempotency của quy trình (`ExecutedAction`). Nhân viên kho chịu trách nhiệm quản lý số lượng tồn kho khả dụng (`Inventory`) của từng biến thể sản phẩm, theo dõi nhật ký các giao dịch biến động kho (`InventoryTransaction`), đối soát bản chụp tồn kho định kỳ theo ngày (`InventoryDailySnapshot`), đồng thời lập và tiếp nhận các phiếu yêu cầu nhập hàng (`RestockRequest`) từ đối tác nhà cung cấp (`Supplier`). 

Để đảm bảo tính nhất quán dữ liệu phân tán (Eventual Consistency) và độ tin cậy giao dịch qua Apache Kafka, hệ thống ghi nhận các bản ghi sự kiện Outbox (`OutboxEvent`) theo mô hình Transactional Outbox Pattern tại phân hệ đơn hàng và thanh toán, lưu vết các tác vụ bù trừ Saga thất bại (`CompensationTask`) khi hủy đơn hàng để kích hoạt cơ chế Dead Letter Queue / Retry, ghi nhận nhật ký đối soát Webhook IPN (`WebhookLog`) từ cổng thanh toán, lưu trữ hành vi người dùng thô (`UserEvent`) phục vụ mô hình máy học gợi ý AI SASRec, quản lý các mẫu thông báo (`NotificationTemplate`) và phân phối các bản ghi thông báo đa kênh (`Notification`) tới các mã định danh thiết bị di động (`FCMToken`). Định kỳ, nhân viên quản lý theo dõi các báo cáo thống kê chuyên sâu về khách hàng (`CustomerStatistics`), sản phẩm (`ProductStatistics`), đơn hàng (`OrderStatistics`) và nhà cung cấp (`SupplierStatistics`) để đưa ra các quyết định kinh doanh kịp thời.

### Bước 2: Trích các danh từ xuất hiện trong đoạn văn

Việc phân tích đoạn văn mô tả hệ thống toàn diện cho phép trích xuất các danh từ cốt lõi, được phân loại thành 3 nhóm nghiệp vụ:

* **Nhóm danh từ liên quan đến người (Actors):** Thành viên (`Member`), khách hàng (`Customer`/`User`), nhân viên (`Employee`), nhân viên quản lý (`ManagerStaff`), nhân viên bán hàng (`SalesStaff`), nhân viên kho (`WarehouseStaff`), nhà cung cấp (`Supplier`).
* **Nhóm danh từ liên quan đến vật / đối tượng nghiệp vụ (Domain Entities):** Hệ thống, danh mục (`Category`), ràng buộc thuộc tính danh mục (`CategoryAttribute`), thương hiệu (`Brand`), sản phẩm (`Product`), ảnh sản phẩm (`ProductImage`), thẻ sản phẩm (`ProductTag`), biến thể sản phẩm (`ProductVariant`), thuộc tính kỹ thuật (`Attribute`), giá trị thuộc tính tĩnh (`ProductAttributeValue`), giá trị tùy chọn biến thể (`VariantOptionValue`), đánh giá nhận xét (`ProductReview`), sản phẩm yêu thích (`WishlistItem`), đơn hàng (`Order`), chi tiết mặt hàng đặt mua (**`OrderItem`**), hóa đơn thanh toán (`Payment`), phiếu hoàn tiền (`Refund`), sổ địa chỉ (`Address`), tỉnh thành (`Province`), phường xã (`Ward`), giao dịch điểm thưởng (`LoyaltyPointTransaction`), chiến dịch khuyến mãi (`Campaign`), mã voucher phát hành (`IssuedVoucher`), nhật ký thực thi Idempotency (`ExecutedAction`), bản ghi tồn kho (`Inventory`), nhật ký biến động kho (`InventoryTransaction`), phiếu yêu cầu nhập hàng (`RestockRequest`), bản chụp tồn kho theo ngày (`InventoryDailySnapshot`), phòng tư vấn (`ChatRoom`), tin nhắn trao đổi (`ChatMessage`), mẫu thông báo (`NotificationTemplate`), thông báo đa kênh (`Notification`), token thiết bị FCM (`FCMToken`), sự kiện Outbox (`OutboxEvent`), tác vụ bù trừ Saga (`CompensationTask`), nhật ký hành vi người dùng (`UserEvent`), nhật ký Webhook IPN (`WebhookLog`).
* **Nhóm danh từ liên quan đến thông tin / hoạt động (Attributes & Analytics):** Mã định danh tài khoản, tên tài khoản, mật khẩu, họ tên, email, số điện thoại, ảnh đại diện, hạng thành viên, nhãn phân khúc khách hàng, số dư điểm thưởng, vai trò, phòng ban, mã số thuế, tên công ty, mã SKU, giá bán, giá vốn, giá khuyến mãi, kích thước, khối lượng, thời gian bảo hành, chính sách bảo hành, điểm đánh giá trung bình, số lượng bán, số lượng tồn kho khả dụng, tổng tiền đơn hàng, số tiền giảm giá, tiền thanh toán cuối cùng, mã theo dõi bưu chính, phí vận chuyển, thuế VAT, ghi chú, mã giao dịch tham chiếu, mã cổng thanh toán, lý do hoàn tiền, mã quy trình BPMN, ngân sách chiến dịch, mã Idempotency, mã định danh sự kiện, tải trọng dữ liệu payload, số lần thử lại, báo cáo thống kê khách hàng (`CustomerStatistics`), báo cáo thống kê sản phẩm (`ProductStatistics`), báo cáo thống kê đơn hàng (`OrderStatistics`), báo cáo thống kê nhà cung cấp (`SupplierStatistics`).

### Bước 3: Đánh giá và lựa chọn các danh từ làm lớp thực thể hoặc thuộc tính

#### 1. Loại bỏ các danh từ không phù hợp:
Loại bỏ các danh từ mang tính chất trừu tượng, môi trường hoạt động, thành phần kỹ thuật giao diện hoặc thao tác nghiệp vụ thuần túy: *Hệ thống, quản lý, giao diện, trang web, nền tảng, cơ chế, chức năng, nút bấm, thao tác, quy trình, chu trình, quyết định, phân phối* $\rightarrow$ loại bỏ khỏi danh sách lớp thực thể.

#### 2. Lựa chọn các lớp thực thể và thuộc tính tương ứng (Chuẩn hóa 100% khớp Backend Java Source Code):

Dưới đây là danh mục toàn bộ 47 lớp thực thể được trích xuất, đối chiếu trực tiếp với các tệp nguồn Entity Java trong thư mục `BE/`:

##### a. Nhóm tác nhân con người (Actor Entities):
* **`Member` (Thành viên - Lớp cha trừu tượng):** Khái quát hóa thông tin tài khoản chung.
  * Thuộc tính: `username`, `password`, `fullName`, `email`, `phoneNumber`, `avatarUrl`.
* **`Customer` (Khách hàng - Kế thừa `Member`, khớp `BE/user-service/.../User.java`):**
  * Thuộc tính: `id`, `keycloakUserId`, `customerTier` (MEMBER/SILVER/GOLD/VIP), `loyaltyPoints`, `segmentationLabel` (Loyal/AtRisk/New/Churned), `isBlacklisted`, `active`, `createdAt`, `updatedAt`.
* **`Employee` (Cán bộ nhân viên - Kế thừa `Member`):** Khái quát hóa nhân sự nội bộ.
  * Thuộc tính: `employeeCode`, `role`, `department`.
* **`ManagerStaff` (Nhân viên quản lý - Kế thừa `Employee`):** Quản trị danh mục, sản phẩm, chiến dịch BPMN và báo cáo thống kê.
* **`SalesStaff` (Nhân viên bán hàng / CSKH - Kế thừa `Employee`):** Tiếp nhận phiên chat tư vấn, phản hồi đánh giá và chăm sóc đơn hàng.
* **`WarehouseStaff` (Nhân viên kho - Kế thừa `Employee`):** Kiểm kê tồn kho, lập phiếu yêu cầu nhập hàng.
* **`Supplier` (Nhà cung cấp - Kế thừa `Employee` / Đối tác cung ứng):**
  * Thuộc tính: `supplierCode`, `companyName`, `taxCode`.

##### b. Nhóm danh mục, sản phẩm & thuộc tính kỹ thuật (Catalog & Product Entities - Phân hệ `product-service`):
* **`Category` (Danh mục sản phẩm - Khớp `Category.java`):**
  * Thuộc tính: `id`, `name`, `slug`, `parentId`, `imageUrl`, `icon`, `sortOrder`, `active`.
* **`CategoryAttribute` (Ràng buộc thuộc tính danh mục - Khớp `CategoryAttribute.java`):**
  * Thuộc tính: `id`, `categoryId`, `attributeId`, `isVariant` (biến thể hay tĩnh), `isRequired`, `isFilter` (cho phép lọc tìm kiếm).
* **`Brand` (Thương hiệu sản xuất - Khớp `Brand.java`):**
  * Thuộc tính: `id`, `name`, `slug`, `logoUrl`, `description`.
* **`Product` (Sản phẩm cha - Khớp `Product.java`):**
  * Thuộc tính: `id`, `name`, `slug`, `description`, `attributes`, `specsRaw`, `price`, `costPrice`, `salePrice`, `weight`, `categoryId`, `brandId`, `brand`, `imageUrl`, `length`, `width`, `height`, `warrantyPeriod`, `warrantyPolicy`, `salesCount`, `ratingAvg`, `active`, `createdAt`, `updatedAt`.
* **`ProductImage` (Hình ảnh bộ sưu tập sản phẩm - Khớp `ProductImage.java`):**
  * Thuộc tính: `id`, `productId`, `imageUrl`, `sortOrder`, `isPrimary`.
* **`ProductTag` (Thẻ phân loại sản phẩm - Khớp `ProductTag.java`):**
  * Thuộc tính: `productId`, `tag`.
* **`Attribute` (Định nghĩa thuộc tính kỹ thuật - Khớp `Attribute.java`):**
  * Thuộc tính: `id`, `code` (cpu, ram, color), `name`, `valueType`, `allowedValues`, `isColor`.
* **`ProductAttributeValue` (Giá trị thuộc tính tĩnh của SP - Khớp `ProductAttributeValue.java`):**
  * Thuộc tính: `id`, `productId`, `attributeId`, `value`.
* **`ProductVariant` (Biến thể cấu hình SKU - Khớp `ProductVariant.java`):**
  * Thuộc tính: `id`, `productId`, `sku`, `variantAttr` (JSON thông số), `price`, `costPrice`, `salePrice`, `weight`, `imageUrl`, `active`.
* **`VariantOptionValue` (Giá trị tùy chọn của biến thể - Khớp `VariantOptionValue.java`):**
  * Thuộc tính: `id`, `variantId`, `attributeId`, `value`.
* **`ProductReview` (Đánh giá nhận xét sản phẩm - Khớp `ProductReview.java`):**
  * Thuộc tính: `id`, `productId`, `userId`, `orderId`, `rating`, `comment`, `imageUrls`, `staffReplyContent`, `staffReplyAt`, `staffReplierId`, `createdAt`.
* **`WishlistItem` (Sản phẩm yêu thích - Khớp `WishlistItem.java`):**
  * Thuộc tính: `id`, `userId`, `productId`, `createdAt`.

##### c. Nhóm giao dịch mua sắm, thanh toán & địa chỉ (Order & Financial Entities - Phân hệ `order-service`, `payment-service` & `user-service`):
* **`Order` (Đơn hàng - Khớp `Order.java`):**
  * Thuộc tính: `id`, `userId`, `email`, `status` (PENDING, AWAITING_PAYMENT, CONFIRMED, SHIPPED, DELIVERED, CANCELLED), `totalAmount`, `discountAmount`, `finalAmount`, `totalWeight`, `couponCode`, `appliedCampaignId`, `pointsRedeemed`, `pointDiscountAmount`, `shippingFee`, `shippingDiscountAmount`, `vatAmount`, `trackingCode`, `shippingAddress`, `phoneNumber`, `note`, `createdAt`, `updatedAt`.
* **`OrderItem` (Chi tiết mặt hàng đặt mua - Khớp `OrderItem.java`):**
  * Thuộc tính: `id`, `orderId`, `productId`, `variantId`, `productName`, `productImage`, `variantAttr` (JSON snapshot cấu hình khi mua), `unitPrice`, `quantity`, `subtotal`.
* **`Payment` (Giao dịch thanh toán - Khớp `Payment.java`):**
  * Thuộc tính: `id`, `orderId`, `userId`, `email`, `txnRef`, `gatewayTxnId`, `paymentMethod` (VNPAY, COD), `amount`, `currency`, `status` (PENDING, SUCCESS, FAILED, REFUNDED), `failureCode`, `gatewayResponse`, `paidAt`, `createdAt`, `updatedAt`.
* **`Refund` (Bản ghi hoàn tiền giao dịch - Khớp `Refund.java`):**
  * Thuộc tính: `id`, `paymentId`, `refundAmount`, `reason`, `status` (PENDING, SUCCESS, FAILED), `gatewayRefundId`, `requestedBy`, `completedAt`, `createdAt`.
* **`Address` (Sổ địa chỉ giao hàng - Khớp `Address.java`):**
  * Thuộc tính: `id`, `userId`, `recipientName`, `phoneNumber`, `province`, `districtWard`, `detailAddress`, `isDefault`, `createdAt`, `updatedAt`.
* **`Province` (Tỉnh / Thành phố hành chính - Khớp `Province.java`):**
  * Thuộc tính: `code`, `name`.
* **`Ward` (Phường / Xã hành chính - Khớp `Ward.java`):**
  * Thuộc tính: `code`, `name`, `provinceCode`.
* **`LoyaltyPointTransaction` (Nhật ký giao dịch điểm thưởng - Khớp `LoyaltyPointTransaction.java`):**
  * Thuộc tính: `id`, `userId`, `delta`, `balanceAfter`, `calculationMode`, `sourceType`, `referenceId`, `orderId`, `campaignId`, `description`, `createdAt`.

##### d. Nhóm khuyến mãi & tự động hóa quy trình (Promotion Entities - Phân hệ `promotion-service`):
* **`Campaign` (Chiến dịch khuyến mãi Camunda - Khớp `Campaign.java`):**
  * Thuộc tính: `id`, `name`, `totalBudget`, `remainingBudget`, `startDate`, `endDate`, `bpmnProcessDefinitionKey`, `workflowJson`, `bpmnXml`, `triggerType`, `createdAt`, `updatedAt`.
* **`IssuedVoucher` (Voucher phát hành / sở hữu - Khớp `IssuedVoucher.java`):**
  * Thuộc tính: `id`, `code`, `userId`, `campaignId`, `voucherType` (PERCENTAGE, FIXED_AMOUNT, FREE_SHIPPING), `status` (UNUSED, USED, EXPIRED, CANCELLED), `discountPercent`, `maxDiscountAmount`, `discountAmount`, `minOrderValue`, `maxShippingDiscount`, `restrictedCategoryIds`, `restrictedProductIds`, `expiresAt`, `usedAt`, `usedOrderId`, `idempotencyKey`, `createdAt`.
* **`ExecutedAction` (Bản ghi Idempotency quy trình Camunda - Khớp `ExecutedAction.java`):**
  * Thuộc tính: `id`, `idempotencyKey`, `actionType`, `createdAt`.

##### e. Nhóm kho hàng & chuỗi cung ứng (Inventory Entities - Phân hệ `inventory-service`):
* **`Inventory` (Bản ghi tồn kho biến thể - Khớp `Inventory.java`):**
  * Thuộc tính: `id`, `productId`, `variantId`, `quantity`, `updatedAt`.
* **`InventoryTransaction` (Nhật ký biến động kho - Khớp `InventoryTransaction.java`):**
  * Thuộc tính: `id`, `orderId`, `productId`, `transactionType` (DEDUCT, RELEASE, RESTOCK), `quantityChanged`, `quantityBefore`, `quantityAfter`, `referenceId`, `note`, `createdAt`.
* **`RestockRequest` (Phiếu yêu cầu nhập hàng - Khớp `RestockRequest.java`):**
  * Thuộc tính: `id`, `productId`, `quantity`, `supplier`, `status` (PENDING, APPROVED, COMPLETED, CANCELLED), `requestedBy`, `completedAt`, `createdAt`.
* **`InventoryDailySnapshot` (Bản chụp tồn kho theo ngày - Khớp `InventoryDailySnapshot.java`):**
  * Thuộc tính: `id`, `productId`, `stockLevel`, `snapshotDate`, `createdAt`.

##### f. Nhóm tư vấn trực tuyến & thông báo đa kênh (Chat & Notification Entities - Phân hệ `chat-service` & `notification-service`):
* **`ChatRoom` (Phòng / Phiên tư vấn trực tuyến - Khớp `ChatRoom.java`):**
  * Thuộc tính: `id`, `customerId`, `customerName`, `staffId`, `staffName`, `status` (AI_CHAT, WAITING, ACTIVE, CLOSED), `lastMessage`, `lastMessageAt`, `lastMessageSenderId`, `createdAt`, `updatedAt`.
* **`ChatMessage` (Tin nhắn trao đổi - Khớp `ChatMessage.java`):**
  * Thuộc tính: `id`, `chatRoomId`, `senderId`, `senderName`, `senderRole` (CUSTOMER, STAFF, AI), `content`, `type` (TEXT, IMAGE, FILE), `isRead`, `createdAt`.
* **`Notification` (Bản ghi thông báo đa kênh - Khớp `Notification.java`):**
  * Thuộc tính: `id`, `userId`, `orderId`, `eventType`, `channels`, `recipient`, `subject`, `content`, `status`, `deliveryResults`, `createdAt`.
* **`NotificationTemplate` (Bản mẫu cấu hình thông báo - Khớp `NotificationTemplate.java`):**
  * Thuộc tính: `id`, `code`, `name`, `titleTemplate`, `bodyTemplate`, `channel`.
* **`FCMToken` (Mã định danh thiết bị đẩy tin FCM - Khớp `FCMToken.java`):**
  * Thuộc tính: `id`, `userId`, `token`, `platform`, `deviceId`, `lastUsedAt`.

##### g. Nhóm sự kiện phân tán & hạ tầng tin cậy (Distributed Events & Saga Entities):
* **`OutboxEvent` (Sự kiện giao dịch tin cậy - Khớp `OutboxEvent.java` trong `order-service` & `payment-service`):**
  * Thuộc tính: `id`, `aggregateId`, `aggregateType`, `eventType`, `payload`, `status` (PENDING, PROCESSED, FAILED), `retryCount`, `createdAt`, `processedAt`.
* **`CompensationTask` (Tác vụ bù trừ Saga thất bại - Khớp `CompensationTask.java` trong `order-service`):**
  * Thuộc tính: `id`, `orderId`, `taskType` (RELEASE_VOUCHER, REFUND_POINTS), `status` (PENDING, COMPLETED, FAILED_PERMANENT), `attempts`, `lastError`, `createdAt`, `updatedAt`.
* **`UserEvent` (Nhật ký hành vi người dùng thô phục vụ AI SASRec - Khớp `UserEvent.java` trong `order-service`):**
  * Thuộc tính: `id`, `userId`, `sessionId`, `itemId`, `categoryId`, `actionType`, `weight`, `source`, `createdAt`.
* **`WebhookLog` (Nhật ký đối soát IPN Webhook cổng thanh toán - Khớp `WebhookLog.java` trong `payment-service`):**
  * Thuộc tính: `id`, `gateway`, `rawPayload`, `signatureValid`, `processed`, `createdAt`.

##### h. Nhóm báo cáo thống kê kế thừa (Analytics Entities):
Theo quy chuẩn phân tích hướng đối tượng môn học PTTKHTTT, các lớp thống kê kế thừa trực tiếp từ thực thể dữ liệu nguồn tương ứng:
* **`CustomerStatistics` (Thống kê khách hàng - Kế thừa `Customer`):**
  * Thuộc tính: `totalCustomers`, `newCustomersCount`, `churnRiskCount`.
* **`ProductStatistics` (Thống kê sản phẩm - Kế thừa `Product`):**
  * Thuộc tính: `totalProducts`, `topSellingCount`, `outOfStockCount`.
* **`OrderStatistics` (Thống kê đơn hàng - Kế thừa `Order`):**
  * Thuộc tính: `totalOrders`, `totalRevenue`, `cancelledOrdersCount`.
* **`SupplierStatistics` (Thống kê nhà cung cấp - Kế thừa `Supplier`):**
  * Thuộc tính: `totalSuppliers`, `totalImportAmount`.

### Bước 4: Xác định quan hệ giữa các lớp thực thể

Dựa trên cấu trúc cơ sở dữ liệu và luồng nghiệp vụ thực tế, bản số (cardinality) giữa các cặp lớp thực thể được xác định như sau:

* **`Customer` – `Address` (Quan hệ $1 - n$):** Một khách hàng lưu nhiều địa chỉ nhận hàng (`Customer` "1" -- "0..*" `Address`).
* **`Address` – `Province` (Quan hệ $n - 1$):** Địa chỉ thuộc về một tỉnh thành phố (`Address` "0..*" -- "1" `Province`).
* **`Province` – `Ward` (Quan hệ $1 - n$):** Một tỉnh thành quản lý nhiều phường xã trực thuộc (`Province` "1" -- "1..*" `Ward`).
* **`Customer` – `Order` (Quan hệ $1 - n$):** Một khách hàng thực hiện nhiều đơn hàng qua thời gian (`Customer` "1" -- "0..*" `Order`).
* **`Customer` – `LoyaltyPointTransaction` (Quan hệ $1 - n$):** Một khách hàng tích lũy nhiều giao dịch điểm (`Customer` "1" -- "0..*" `LoyaltyPointTransaction`).
* **`Customer` – `IssuedVoucher` (Quan hệ $1 - n$):** Một khách hàng được sở hữu nhiều voucher cá nhân hóa (`Customer` "1" -- "0..*" `IssuedVoucher`).
* **`Customer` – `WishlistItem` (Quan hệ $1 - n$):** Khách hàng đánh dấu lưu nhiều sản phẩm yêu thích (`Customer` "1" -- "0..*" `WishlistItem`).
* **`Customer` – `Notification` (Quan hệ $1 - n$):** Khách hàng nhận nhiều thông báo gửi đến (`Customer` "1" -- "0..*" `Notification`).
* **`Customer` – `FCMToken` (Quan hệ $1 - n$):** Khách hàng đăng ký nhiều token thiết bị di động (`Customer` "1" -- "0..*" `FCMToken`).
* **`Customer` – `UserEvent` (Quan hệ $1 - n$):** Khách hàng phát sinh chuỗi tương tác clickstream (`Customer` "1" -- "0..*" `UserEvent`).
* **`Customer` – `ProductReview` (Quan hệ $1 - n$):** Khách hàng viết nhiều đánh giá cho các sản phẩm (`Customer` "1" -- "0..*" `ProductReview`).
* **`Category` – `Product` (Quan hệ $1 - n$):** Một danh mục chứa nhiều sản phẩm (`Category` "1" -- "0..*" `Product`).
* **`Category` – `CategoryAttribute` (Quan hệ $1 - n$):** Danh mục liên kết nhiều quy tắc thuộc tính (`Category` "1" -- "0..*" `CategoryAttribute`).
* **`Attribute` – `CategoryAttribute` (Quan hệ $1 - n$):** Thuộc tính được gắn vào các danh mục (`Attribute` "1" -- "0..*" `CategoryAttribute`).
* **`Brand` – `Product` (Quan hệ $1 - n$):** Một thương hiệu có nhiều dòng sản phẩm (`Brand` "1" -- "0..*" `Product`).
* **`Product` – `ProductImage` (Quan hệ $1 - n$):** Một sản phẩm sở hữu nhiều hình ảnh minh họa (`Product` "1" -- "1..*" `ProductImage`).
* **`Product` – `ProductTag` (Quan hệ $1 - n$):** Một sản phẩm được gắn nhiều thẻ tìm kiếm (`Product` "1" -- "0..*" `ProductTag`).
* **`Product` – `ProductVariant` (Quan hệ $1 - n$):** Một sản phẩm cha phân rã thành nhiều biến thể SKU (`Product` "1" -- "1..*" `ProductVariant`).
* **`Product` – `ProductReview` (Quan hệ $1 - n$):** Sản phẩm nhận được nhiều nhận xét đánh giá (`Product` "1" -- "0..*" `ProductReview`).
* **`Product` – `WishlistItem` (Quan hệ $1 - n$):** Sản phẩm được thêm vào danh sách yêu thích (`Product` "1" -- "0..*" `WishlistItem`).
* **`Product` – `ProductAttributeValue` (Quan hệ $1 - n$):** Sản phẩm chứa nhiều giá trị thuộc tính tĩnh (`Product` "1" -- "0..*" `ProductAttributeValue`).
* **`Attribute` – `ProductAttributeValue` (Quan hệ $1 - n$):** Thuộc tính định nghĩa cho các giá trị tĩnh (`Attribute` "1" -- "0..*" `ProductAttributeValue`).
* **`ProductVariant` – `VariantOptionValue` (Quan hệ $1 - n$):** Biến thể chứa các giá trị cấu hình tùy chọn (`ProductVariant` "1" -- "1..*" `VariantOptionValue`).
* **`Attribute` – `VariantOptionValue` (Quan hệ $1 - n$):** Thuộc tính định nghĩa cho các tùy chọn biến thể (`Attribute` "1" -- "0..*" `VariantOptionValue`).
* **`Order` – `OrderItem` (Quan hệ $1 - n$):** Một đơn hàng chứa nhiều chi tiết mặt hàng đặt mua (**`Order` "1" -- "1..*" `OrderItem`**).
* **`ProductVariant` – `OrderItem` (Quan hệ $1 - n$):** Biến thể sản phẩm được liên kết trong các chi tiết đặt mua (`ProductVariant` "1" -- "0..*" `OrderItem`).
* **`Order` – `Payment` (Quan hệ $1 - 1$):** Mỗi đơn hàng liên kết với một giao dịch thanh toán (`Order` "1" -- "1" `Payment`).
* **`Payment` – `Refund` (Quan hệ $1 - 0..1$):** Hóa đơn thanh toán phát sinh bản ghi hoàn tiền khi hủy (`Payment` "1" -- "0..1" `Refund`).
* **`Payment` – `WebhookLog` (Quan hệ $1 - n$):** Giao dịch thanh toán lưu các lượt gọi IPN Webhook (`Payment` "1" -- "0..*" `WebhookLog`).
* **`Payment` – `OutboxEvent` (Quan hệ $1 - n$):** Thanh toán phát sinh sự kiện thanh toán thành công (`Payment` "1" -- "0..*" `OutboxEvent`).
* **`Campaign` – `IssuedVoucher` (Quan hệ $1 - n$):** Chiến dịch phát hành nhiều mã voucher (`Campaign` "1" -- "0..*" `IssuedVoucher`).
* **`Campaign` – `ExecutedAction` (Quan hệ $1 - n$):** Chiến dịch lưu lịch sử thực thi Idempotency (`Campaign` "1" -- "0..*" `ExecutedAction`).
* **`ProductVariant` – `Inventory` (Quan hệ $1 - 1$):** Mỗi biến thể SKU tương ứng một bản ghi tồn kho (`ProductVariant` "1" -- "1" `Inventory`).
* **`Inventory` – `InventoryTransaction` (Quan hệ $1 - n$):** Tồn kho ghi nhận lịch sử biến động (`Inventory` "1" -- "0..*" `InventoryTransaction`).
* **`ProductVariant` – `InventoryDailySnapshot` (Quan hệ $1 - n$):** Chụp lưu vết tồn kho theo ngày (`ProductVariant` "1" -- "0..*" `InventoryDailySnapshot`).
* **`WarehouseStaff` – `RestockRequest` (Quan hệ $1 - n$):** Nhân viên kho tạo nhiều phiếu nhập hàng (`WarehouseStaff` "1" -- "0..*" `RestockRequest`).
* **`Supplier` – `RestockRequest` (Quan hệ $1 - n$):** Nhà cung cấp đáp ứng các phiếu nhập hàng (`Supplier` "1" -- "0..*" `RestockRequest`).
* **`ProductVariant` – `RestockRequest` (Quan hệ $1 - n$):** Phiếu nhập hàng chỉ định biến thể cần nhập (`ProductVariant` "1" -- "0..*" `RestockRequest`).
* **`Customer` – `ChatRoom` (Quan hệ $1 - n$):** Khách hàng khởi tạo các phiên tư vấn (`Customer` "1" -- "0..*" `ChatRoom`).
* **`SalesStaff` – `ChatRoom` (Quan hệ $1 - n$):** Nhân viên bán hàng tiếp nhận phòng chat (`SalesStaff` "1" -- "0..*" `ChatRoom`).
* **`ChatRoom` – `ChatMessage` (Quan hệ $1 - n$):** Phòng tư vấn chứa chuỗi tin nhắn trao đổi (`ChatRoom` "1" -- "1..*" `ChatMessage`).
* **`NotificationTemplate` – `Notification` (Quan hệ $1 - n$):** Mẫu thông báo sinh ra các thông báo cụ thể (`NotificationTemplate` "1" -- "0..*" `Notification`).
* **`Order` – `OutboxEvent` (Quan hệ $1 - n$):** Đơn hàng phát sinh sự kiện Outbox phân tán (`Order` "1" -- "0..*" `OutboxEvent`).
* **`Order` – `CompensationTask` (Quan hệ $1 - n$):** Đơn hàng lưu tác vụ bù trừ Saga khi gặp sự cố (`Order` "1" -- "0..*" `CompensationTask`).

### Bước 5: Xác định quan hệ đối tượng giữa các thực thể

Các mối liên kết ngữ nghĩa đối tượng được phân loại và chuẩn hóa chặt chẽ theo chuẩn UML:

* **1. Quan hệ Kế thừa / Tổng quát hóa (Generalization `<|--`):**
  * *Tác nhân con người:* Lớp `Member` khái quát hóa cao nhất. Hai lớp `Customer` và `Employee` kế thừa trực tiếp từ `Member`. Lớp `Employee` tiếp tục phân nhánh kế thừa thành `ManagerStaff`, `SalesStaff`, `WarehouseStaff`, và `Supplier`.
  * *Báo cáo thống kê:* Đáp ứng đúng chuẩn mực mô hình hóa hướng đối tượng môn học PTTKHTTT, 4 lớp thống kê kế thừa từ thực thể nguồn tương ứng:
    * `CustomerStatistics` $\triangleleft--$ `Customer`.
    * `ProductStatistics` $\triangleleft--$ `Product`.
    * `OrderStatistics` $\triangleleft--$ `Order`.
    * `SupplierStatistics` $\triangleleft--$ `Supplier`.

* **2. Quan hệ Kết hợp tập hợp (Aggregation `o--`):**
  * `Customer` sở hữu tập hợp các thông tin cá nhân và giao dịch: `Customer o-- Address`, `Customer o-- Order`, `Customer o-- LoyaltyPointTransaction`, `Customer o-- IssuedVoucher`, `Customer o-- WishlistItem`, `Customer o-- Notification`, `Customer o-- FCMToken`, `Customer o-- UserEvent`, `Customer o-- ChatRoom`.
  * `Province` sở hữu tập hợp: `Province o-- Ward`.
  * `Category` sở hữu tập hợp ràng buộc: `Category o-- CategoryAttribute`.
  * `Product` sở hữu tập hợp cấu phần: `Product o-- ProductVariant`, `Product o-- ProductImage`, `Product o-- ProductTag`, `Product o-- ProductReview`, `Product o-- ProductAttributeValue`.
  * `ProductVariant` sở hữu tập hợp tùy chọn: `ProductVariant o-- VariantOptionValue`.
  * **`Order` sở hữu tập hợp các dòng hàng chi tiết: `Order o-- OrderItem`** (Một đơn hàng bao gồm danh sách các mặt hàng `OrderItem` được đặt mua).
  * `Order` sở hữu thanh toán: `Order o-- Payment`.
  * `Payment` sở hữu: `Payment o-- Refund`, `Payment o-- WebhookLog`, `Payment o-- OutboxEvent`.
  * `Campaign` sở hữu: `Campaign o-- IssuedVoucher`, `Campaign o-- ExecutedAction`.
  * `Inventory` sở hữu: `Inventory o-- InventoryTransaction`.
  * `WarehouseStaff` sở hữu: `WarehouseStaff o-- RestockRequest`.
  * `ChatRoom` sở hữu: `ChatRoom o-- ChatMessage`.
  * `Order` sở hữu sự kiện phân tán: `Order o-- OutboxEvent`, `Order o-- CompensationTask`.

* **3. Quan hệ Kết hợp tham chiếu (Association `--`):**
  * Kết hợp tham chiếu nghiệp vụ giữa các thực thể độc lập:
    * `Address -- Province`: Địa chỉ tham chiếu đến tỉnh thành.
    * `Category -- Product`, `Brand -- Product`: Sản phẩm thuộc về danh mục và thương hiệu.
    * `Attribute -- CategoryAttribute`, `Attribute -- ProductAttributeValue`, `Attribute -- VariantOptionValue`: Thuộc tính kỹ thuật được tham chiếu bởi các quy tắc và giá trị cấu hình.
    * `Customer -- ProductReview`, `Product -- WishlistItem`: Khách hàng đánh giá sản phẩm và lưu sản phẩm thích.
    * **`ProductVariant -- OrderItem`**: Chi tiết dòng hàng tham chiếu trực tiếp đến biến thể SKU được đặt mua.
    * `ProductVariant -- Inventory`, `ProductVariant -- InventoryDailySnapshot`, `ProductVariant -- RestockRequest`, `Supplier -- RestockRequest`: Biến thể SKU liên kết với bản ghi tồn kho, ảnh chụp tồn kho và phiếu nhập hàng.
    * `SalesStaff -- ChatRoom`: Nhân viên bán hàng tiếp nhận phiên tư vấn.
    * `NotificationTemplate -- Notification`: Thông báo tham chiếu bản mẫu cấu hình.

---

### Hình ảnh 4. Biểu đồ lớp thực thể pha phân tích

Tệp mã nguồn PlantUML: [class_thuc_the_phan_tich.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thuc_the_phan_tich.puml)  
Tệp hình ảnh biểu đồ đã biên dịch: [class_thuc_the_phan_tich.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thuc_the_phan_tich.png)

Quy chuẩn biểu diễn trên biểu đồ lớp thực thể pha phân tích (Theo phong cách thiết kế Visual Paradigm của Đồ án mẫu):
* **Không chia gói bao quanh (Flat Canvas):** Toàn bộ 47 lớp thực thể được bố trí đồng nhất trên cùng một mặt phẳng vẽ, liên kết trực quan với nhau qua các đường nối chuẩn UML mà không sử dụng các khung package bao quanh nhằm giữ sự liền mạch và thoáng đãng.
* **Phong cách hiển thị đơn sắc trực quan (Monochrome Design):** Hộp lớp thực thể được kẻ viền đen sắc nét, nền trắng, gồm 2 ngăn (Ngăn tên lớp in đậm ở trên và ngăn danh sách thuộc tính ở dưới), sử dụng dấu trừ (`-`) trước tên thuộc tính.
* **Mối liên kết thực thể phản ánh đúng bản chất hướng đối tượng:**
  * **Quan hệ kế thừa (Generalization `<|--`):** Dùng mũi tên tam giác rỗng hướng về lớp cha (`Member <|-- Customer`, `Member <|-- Employee`, `Employee <|-- ManagerStaff / SalesStaff / WarehouseStaff / Supplier`; và 4 lớp thống kê `CustomerStatistics`, `SupplierStatistics`, `ProductStatistics`, `OrderStatistics` kế thừa từ thực thể nguồn tương ứng).
  * **Quan hệ kết hợp tập hợp (Aggregation `o--`):** Dùng hình thoi rỗng tại đầu đối tượng sở hữu (`Customer o-- Address`, `Customer o-- Order`, `Order o-- OrderItem`, `Order o-- Payment`, `Product o-- ProductVariant / ProductImage / ProductAttributeValue`, `Campaign o-- IssuedVoucher`, `ChatRoom o-- ChatMessage`, `Order o-- OutboxEvent / CompensationTask`).
  * **Quan hệ kết hợp tham chiếu (Association `--`):** Dùng đường nét liền liên kết các thực thể có quan hệ nghiệp vụ tương tác (`ProductVariant -- OrderItem`, `Category -- Product`, `Brand -- Product`, `ProductVariant -- Inventory`, `SalesStaff -- ChatRoom`, `NotificationTemplate -- Notification`).





