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
//   - Độ tập trung độ phổ biến SP: REES46 (mỹ phẩm 5 tháng + đa ngành 10/2019) và Taobao 20 triệu
//     dòng — recsys_measure_item_popularity.py.
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
  // Làm rõ 2026-10-01: Taobao đã lọc trùng sự kiện liền nhau nên số của nó là trên cặp KHÁC SP; REES46 trên
  // cặp khác SP = 0,5739 (mọi cặp 0,6193). Bộ sinh tạo lượt xem lặp RIÊNG (revisit bên dưới) nên tham số này
  // chỉ áp cho lượt chọn SP MỚI, và fidelity đo trên cặp KHÁC SP (cùng định nghĩa Taobao). Giữ 0,4921
  // (kết hợp 2 nguồn trên cặp khác SP cho ~0,48–0,49; sàn đa ngành gần Taobao hơn shop mỹ phẩm 1 ngành).
  pSameCategory: 0.4921,

  // % item được xem nhưng KHÔNG được thêm giỏ trong cùng phiên. 2 nguồn LỆCH NHAU vì khác NGÀNH HÀNG,
  // không phải lỗi đo: REES46 (mỹ phẩm giá rẻ, mua lặp — ~1 cart/1,4 view) = 0,8779; Taobao (sàn tổng
  // hợp — ~1 cart/12 view, pv 89,5%/cart 5,6%/buy 2,0%) = 0,9859 (mẫu 8 triệu sự kiện, 2026-09-30).
  // Chỉ số này do tỉ lệ cart/view TOÀN CỤC quyết định, không phụ thuộc cắt phiên → không áp quy tắc
  // "ưu tiên phiên thật" như các số khác. Chọn Taobao: platform là SÀN ĐA NGÀNH (chốt 2026-10-01) —
  // cùng loại với Taobao, khác shop mỹ phẩm 1 ngành. Xem recsys-execution-plan.md §5.9.
  abandonRate: 0.9859,

  // Độ TẬP TRUNG lượt xem theo sản phẩm (đuôi dài): tỉ lệ lượt xem rơi vào top 10% SP, và Gini của số
  // lượt/SP — script recsys_measure_item_popularity.py (2026-10-01), đo cả trên mẫu ngẫu nhiên 7.000 SP
  // (≈ cỡ catalog web) → kết quả gần như y hệt toàn catalog, nên so được với catalog nhỏ:
  //   REES46 mỹ phẩm 0,645 (Gini 0,757) · Taobao 0,657 (Gini 0,735) · REES46 đa ngành 0,826 (Gini 0,880).
  // Hai nguồn độc lập khớp nhau ~0,65 → chọn Taobao (sàn tổng hợp, nhất quán với abandonRate);
  // REES46 đa ngành (1 tháng, rất tập trung) ghi làm cận trên.
  itemPopularity: { viewTop10Share: 0.657, viewGini: 0.735, upperBoundTop10Share: 0.826 },

  // XEM LẠI — đo trên REES46 mỹ phẩm (phiên thật, 962K lượt xem, 160K user; recsys_measure_revisit_patterns.py).
  // Chỉ lấy REES46: web ghi log GIỐNG REES46 (mỗi lần mở trang chi tiết = 1 VIEW_PRODUCT, không lọc trùng —
  // product-service → product-viewed-events → behavior_consumer.py), còn Taobao đã LỌC TRÙNG sự kiện liền
  // nhau (lặp liên tiếp 0,3%) nên không so được ở phần này. Dùng làm THAM SỐ SINH:
  //   repeatPrev     : P(lượt xem kế tiếp = đúng SP vừa xem)
  //   revisitSession : P(quay lại SP đã xem trước đó trong phiên, không phải ngay trước)
  //   revisitHistory : P(SP xem lần đầu trong phiên là SP đã xem ở phiên cũ)
  revisit: { repeatPrev: 0.1064, revisitSession: 0.1442, revisitHistory: 0.1672 },

  // Kết quả ở cấp USER (chuỗi view+cart theo thời gian, giao thức của fidelity.mjs —
  // recsys_measure_recency_baseline.py). Trước 2026-10-01 đây là "ngưỡng chống tái phát" ≤ 0,20 / ≤ 6% đặt
  // theo lỗi cũ, CHƯA TỪNG đo trên dữ liệu thật — và đẩy dữ liệu sinh ra xa thực tế:
  //   REES46 mỹ phẩm 0,508 / 19,2% · REES46 đa ngành 0,488 / 31,3% · Taobao (đã lọc trùng) 0,169 / 0,3%.
  userSequence: { recencyRecallAt10: 0.5081, consecutiveRepeatRate: 0.1921 },
};

// THAM SỐ SINH hành vi chuyển tiếp/xem lại — KHÔNG phải số đo: hiệu chỉnh (calibrate) để các chỉ số ĐẦU RA
// đo bằng fidelity.mjs khớp TARGETS (stickiness cặp khác SP, lặp liền nhau trong phiên, recency + lặp liên
// tiếp cấp user). Tách khỏi TARGETS vì tham số cấp phiên ≠ chỉ số cấp user (vd lượt quay lại SP cũ thường
// đổi category → phải bù ở pSameCategoryNew; người dùng hay mở phiên mới bằng đúng SP đang xem dở).
// Object có thể ghi đè khi chạy hiệu chỉnh (simulate.mjs đọc trực tiếp từ đây). Giá trị: xem lịch sử
// hiệu chỉnh ở docs/canvas/recsys-execution-plan.md.
// Hiệu chỉnh 2026-10-01 (lưới 36 + 24 tổ hợp, 800 user × 12 tháng, catalog Tiki thật 1.868 SP, chấm theo tổng
// độ lệch chuẩn hoá): chọn tổ hợp mọi mục đều cách ngưỡng đạt an toàn (không lấy tổ hợp điểm thấp nhất vì
// lặp cấp user chỉ dư 0,005), rồi hạ sessionResume 0,65→0,58 để recency giữa mục tiêu trên cả catalog giả.
// Đầu ra (catalog Tiki): stickiness 0,520 · lặp trong phiên 0,111 · recency 0,529 · lặp cấp user
// 0,159 · top10 0,633 (mục tiêu 0,492 / 0,106 / 0,508 / 0,192 / 0,657). repeatPrev < số đo 0,1064 vì SP hot
// đôi khi bị bốc trúng lại tình cờ (đuôi dài) — cộng lại đúng số đo.
export const GENERATION = {
  pSameCategoryNew: 0.66,     // P(giữ category) khi chọn SP MỚI (bù cho lượt quay lại SP cũ hay đổi category)
  repeatPrev: 0.08,           // P(xem lại ngay SP vừa xem)
  revisitSession: 0.1442,     // P(quay lại SP đã xem trước đó trong phiên) — giữ số đo
  revisitHistory: 0.25,       // P(SP mới trong phiên lấy từ lịch sử phiên cũ)
  sessionResume: 0.58,        // P(phiên mở đầu bằng SP xem gần nhất của phiên trước) — 0,65 làm recency trên catalog giả 0,56 (> 0,558)
  historyRecencyDecay: 1,     // trọng số chọn từ lịch sử ∝ decay^hạng-gần-đây (1 = đều trong 20 SP gần nhất)
};

// Tham số SINH độ phổ biến (catalogIndex.mjs / catalog.mjs) — hiệu chỉnh để dữ liệu sinh đạt
// TARGETS.itemPopularity (kiểm bằng fidelity.mjs), KHÔNG phải số đo:
//   salesAlpha    : trọng số = (số đã bán thật trên Tiki + 1)^salesAlpha
//   fallbackSigma : SP không có số bán → trọng số log-normal(0, fallbackSigma), tất định theo id
export const POPULARITY = {
  // Hiệu chỉnh 2026-10-01 trên catalog Tiki thật (số đã bán: trung vị 24, p90 1.480, max 155.350):
  // α=0,5 → top10 0,514 · α=0,7 → 0,652 · α=0,85 → 0,723 · α=1,0 → 0,767 (mục tiêu 0,657).
  salesAlpha: 0.7,
  // Hiệu chỉnh trên catalog giả ~10K SP, SAU khi có hành vi xem lại (xem lại trải lượt xem ra nhiều SP):
  // σ=1,8 → 0,618 · σ=2,0 → 0,655 · σ=2,2 → 0,680.
  fallbackSigma: 2.0,
};

// Dung sai chấp nhận khi so dữ liệu sinh ra với TARGETS (điểm tỉ lệ tuyệt đối cho các tỉ lệ; tương
// đối cho giá trị trung bình). Chọn đủ chặt để bắt được lỗi cấu trúc cỡ lỗi view→cart 100% cũ,
// đủ lỏng để không fail vì nhiễu lấy mẫu ở quy mô vài trăm user.
export const TOLERANCE = {
  rateAbs: 0.05,
  meanRel: 0.25,
};

// Chống TÁI PHÁT lỗi cũ "view → thêm giỏ đúng SP vừa xem 100%": dấu hiệu thật của lỗi đó là tỉ lệ cart =
// SP vừa xem (lỗi: 1,0; thật 0,1748 — đã kiểm ở cartTarget). Hai ngưỡng recency ≤ 0,20 / lặp ≤ 6% trước đây
// bị BỎ (2026-10-01) vì đo trên dữ liệu thật cho thấy chúng sai hướng — thay bằng TARGETS.userSequence.
export const REGRESSION_GUARDS = {
  maxCartSameAsLastView: 0.3,
};
