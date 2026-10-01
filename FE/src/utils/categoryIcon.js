// Icon Material Symbols dự phòng cho danh mục khi DB không có `category.icon` (sàn đa ngành).
// Dùng chung cho Header và FlashDealSection — trước đây mỗi nơi 1 bản sao chỉ có từ khoá điện tử.
export const getCategoryIconFallback = (name) => {
  const normalized = (name || "").toLowerCase();
  if (normalized.includes("điện thoại") || normalized.includes("phone")) return "phone_iphone";
  if (normalized.includes("laptop") || normalized.includes("notebook")) return "laptop";
  if (normalized.includes("tai nghe") || normalized.includes("earphone") || normalized.includes("headphone") || normalized.includes("headset")) return "headphones";
  if (normalized.includes("đồng hồ") || normalized.includes("watch")) return "watch";
  if (normalized.includes("tivi") || normalized.includes("ti vi") || normalized.includes("tv")) return "tv";
  if (normalized.includes("pc") || normalized.includes("màn hình") || normalized.includes("monitor") || normalized.includes("desktop")) return "desktop_windows";
  if (normalized.includes("bàn phím") || normalized.includes("chuột") || normalized.includes("keyboard") || normalized.includes("mouse")) return "keyboard";
  if (normalized.includes("cáp") || normalized.includes("sạc") || normalized.includes("cable") || normalized.includes("charger")) return "cable";
  // Ngành hàng ngoài điện tử (sàn đa ngành). Thứ tự quan trọng vì so khớp chuỗi con: thú cưng/sách
  // trước làm đẹp/thời trang ("chăm sóc thú cưng", "sách báo" chứa "áo"); thời trang trước "phụ kiện".
  if (normalized.includes("thú cưng")) return "pets";
  if (normalized.includes("sách") || normalized.includes("văn phòng phẩm")) return "menu_book";
  if (normalized.includes("thời trang") || normalized.includes("quần") || normalized.includes("áo") || normalized.includes("giày") || normalized.includes("túi")) return "checkroom";
  if (normalized.includes("làm đẹp") || normalized.includes("mỹ phẩm") || normalized.includes("chăm sóc")) return "spa";
  if (normalized.includes("nhà cửa") || normalized.includes("nội thất") || normalized.includes("đời sống")) return "chair";
  if (normalized.includes("bếp") || normalized.includes("gia dụng")) return "kitchen";
  if (normalized.includes("mẹ") || normalized.includes("bé") || normalized.includes("trẻ em")) return "child_care";
  if (normalized.includes("thể thao") || normalized.includes("du lịch") || normalized.includes("dã ngoại")) return "sports_soccer";
  if (normalized.includes("đồ chơi")) return "toys";
  if (normalized.includes("thực phẩm") || normalized.includes("đồ uống") || normalized.includes("bách hoá") || normalized.includes("bách hóa")) return "restaurant";
  if (normalized.includes("sức khỏe") || normalized.includes("sức khoẻ") || normalized.includes("y tế")) return "health_and_safety";
  if (normalized.includes("ô tô") || normalized.includes("xe máy") || normalized.includes("phụ tùng")) return "directions_car";
  if (normalized.includes("phụ kiện") || normalized.includes("accessory")) return "extension";
  return "category";
};
