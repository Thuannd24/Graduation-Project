// NGUỒN SỰ THẬT DUY NHẤT cho các con số hành vi đo từ dữ liệu người dùng THẬT — dùng chung cho
// (1) simulate.mjs (tham số sinh dữ liệu) và (2) fidelity.mjs (kiểm tra dữ liệu sinh ra có khớp số
// thật không). Trước đây hằng số nằm rải trong simulate.mjs, không có gì kiểm tra dữ liệu sinh ra
// thực sự đạt các con số đó — đã có ít nhất 1 lần tham số đúng nhưng dữ liệu sinh ra vẫn lệch
// (category-stickiness bị pha loãng bởi timestamp không tăng dần, xem git log 2026-09-22).
//
// Nguồn đo:
//   - REES46 Cosmetics, 5 tháng, 4.513.080 phiên THẬT (có session_id) — script
//     AI/forecast-service/app/training/experiments/recsys_measure_behavior_patterns.py; kiểm chứng
//     chéo độc lập bằng recsys_behavior_stats.py (cùng kết quả, chỉ khác định nghĩa gộp/tách).
//   - Taobao UserBehavior, 100.150.807 sự kiện, phiên SUY LUẬN (ngắt 30 phút) — script
//     recsys_measure_behavior_patterns_taobao.py. Quy tắc đối chiếu 2 nguồn: xem
//     docs/canvas/recsys-execution-plan.md §5.9.
//
// Định nghĩa đo (fidelity.mjs PHẢI dùng đúng định nghĩa này, nếu không so sánh vô nghĩa): chỉ xét
// sự kiện VIEW_PRODUCT/ADD_TO_CART trong CÙNG 1 phiên, theo thứ tự thời gian (REES46 xét
// view/cart/purchase — platform không có purchase dạng sự kiện, đơn hàng là bảng riêng).

export const PCT_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

export const TARGETS = {
  // Số sự kiện view/cart trong 1 phiên (REES46). Đuôi p100 thật = 3749 (1 user cực hiếm) — cắt về
  // 50 để 1 phiên tổng hợp không nuốt bộ nhớ vô ích; không ảnh hưởng median/mean đáng kể.
  sessionLengthPcts: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 5, 8, 15, 50],
  sessionLength: { median: 1, mean: 3.7 },

  // Số item PHÂN BIỆT đã xem trước lượt thêm giỏ ĐẦU TIÊN của phiên (REES46). p40 = 0: ~40% phiên
  // có thêm giỏ mà KHÔNG xem sản phẩm nào trước đó trong phiên (thêm thẳng từ danh sách).
  viewsBeforeFirstCartPcts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 4, 10],
  viewsBeforeFirstCart: { median: 1, mean: 1.1, pctZero: 0.42 },

  // Mỗi lượt thêm giỏ: item đó so với lịch sử xem TRONG phiên (REES46).
  cartTarget: { sameAsLastView: 0.1748, differentSeenItem: 0.0385, noPriorView: 0.7867 },

  // P(sự kiện kế tiếp trong phiên cùng category với sự kiện trước). REES46 0,6343 / Taobao 0,4714
  // → trung bình có trọng số theo số quan sát (§5.9) = 0,4921.
  pSameCategory: 0.4921,

  // % item được xem nhưng KHÔNG được thêm giỏ trong cùng phiên. 2 nguồn LỆCH NHAU vì khác NGÀNH HÀNG,
  // không phải lỗi đo: REES46 (mỹ phẩm giá rẻ, mua lặp — ~1 cart/1,4 view) = 0,8779; Taobao (sàn tổng
  // hợp — ~1 cart/12 view, pv 89,5%/cart 5,6%/buy 2,0%) = 0,9859 (mẫu 8 triệu sự kiện, 2026-09-30).
  // Chỉ số này do tỉ lệ cart/view TOÀN CỤC quyết định, không phụ thuộc cắt phiên → không áp quy tắc
  // "ưu tiên phiên thật" như các số khác. Chọn Taobao: platform bán điện thoại/laptop (giá cao, cân
  // nhắc lâu) gần sàn tổng hợp hơn shop mỹ phẩm. Xem recsys-execution-plan.md §5.9.
  abandonRate: 0.9859,
};

// Dung sai chấp nhận khi so dữ liệu sinh ra với TARGETS (điểm tỉ lệ tuyệt đối cho các tỉ lệ; tương
// đối cho giá trị trung bình). Chọn đủ chặt để bắt được lỗi cấu trúc cỡ lỗi view→cart 100% cũ,
// đủ lỏng để không fail vì nhiễu lấy mẫu ở quy mô vài trăm user.
export const TOLERANCE = {
  rateAbs: 0.05,
  meanRel: 0.25,
};

// Chẩn đoán "học vẹt": dữ liệu KHÔNG được mã hoá sẵn 1 quy tắc tầm thường mà model nào cũng khai
// thác được. Không có số đo thật tương ứng — đây là ngưỡng bảo vệ chống TÁI PHÁT lỗi cũ: bản lỗi
// (view→cart cứng) cho recency recall@10 = 0,2754 và 8,82% item lặp liên tiếp.
export const REGRESSION_GUARDS = {
  maxRecencyRecallAt10: 0.2,
  maxConsecutiveRepeatRate: 0.06,
};
