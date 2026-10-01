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
  // Độ dài phiên TÁCH theo loại (churn_measure_session_split.py, REES46 Cosmetics 5 tháng, 4,48 triệu phiên, 2026-10-01):
  // phiên KHÔNG có giỏ ngắn hơn hẳn — phiên xem thuần của bộ sinh phải lấy mẫu từ phân phối này, không từ phân phối
  // chung (vốn gồm cả phiên có giỏ, TB 10,3 sự kiện).
  sessionLengthNoCartPcts: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 4, 427],
  sessionLenOneShare: 0.6514,     // P(phiên dài đúng 1 sự kiện view/cart), mọi phiên
  sessionWithCartShare: 0.2201,   // tỉ lệ phiên có ≥ 1 lượt thêm giỏ

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

  // CHU KỲ MUA LẠI THEO NGÀNH (churn-risk-roadmap 1.2) — khoảng cách TRUNG VỊ giữa 2 lần mua cùng ngành, CHIA cho
  // của Bách hoá. Nguồn: Amazon Reviews 2023 (McAuley-Lab), bản 5-core, ~63 triệu khoảng cách
  // (churn_measure_amazon_repurchase.py, 2026-10-01). CHỈ dùng tỉ lệ: review ≠ lần mua (khoảng cách tuyệt đối bị
  // kéo dài). REES46 đa ngành (không có bách hoá, 2 tháng) và Olist (2,2% khách mua lại) không neo được.
  // Ghép ngành Tiki ↔ Amazon: Đồ chơi–Mẹ&bé = TB(Baby 0,784, Toys 1,063); Làm đẹp–Sức khoẻ = TB(Beauty 0,982,
  // Health 1,171); Điện gia dụng = Home_and_Kitchen làm ĐẠI DIỆN (Amazon không có 5-core Appliances).
  categoryRepurchase: {
    relativeToGrocery: {
      "bach-hoa-online": 1.0,
      "nha-sach-tiki": 0.586,
      "do-choi-me-be": 0.924,
      "lam-dep-suc-khoe": 1.077,
      "thoi-trang-nu": 1.126,
      "thoi-trang-nam": 1.126,
      "nha-cua-doi-song": 1.171,
      "dien-gia-dung": 1.171,
      "the-thao-da-ngoai": 1.234,
      "thiet-bi-kts-phu-kien-so": 1.505,
      "laptop-may-vi-tinh-linh-kien": 1.505,
      "dien-thoai-may-tinh-bang": 1.721,
    },
    proxies: { "dien-gia-dung": "Home_and_Kitchen" },
  },
  // HÀNH VI QUANH LẦN MUA CUỐI (churn) — REES46 Cosmetics 5 tháng (churn_measure_prechurn_behavior.py, 2026-10-01).
  // Khách mua lặp; nhóm churn neo ở lần mua cuối (sau đó ≥ 60 ngày không mua), nhóm đối chứng neo ở 1 lần mua có lần
  // kế tiếp trong ≤ 60 ngày. TRƯỚC = ngày −42..−1, SAU = ngày +1..+56 (tỉ lệ / ngày).
  //  - churn VẪN DUYỆT sau lần mua cuối: lượt xem SAU/TRƯỚC 0,186, thêm giỏ 0,136; 41,2% im lặng hẳn.
  //  - KHÔNG có "phân vân" trước churn: (bỏ giỏ / thêm giỏ) MUỘN/SỚM của churn ÷ đối chứng = 0,983, CI95 [0,925; 1,062];
  //    có điều kiện theo mức hoạt động, bỏ giỏ gần đây đi kèm ÍT churn hơn (hệ số chuẩn hoá −0,34).
  preChurn: {
    churnPostOverPreViews: 0.186,
    churnPostOverPreCarts: 0.136,
    churnZeroActivityPost: 0.412,
    abandonPerCartSpecificity: 0.983,
    abandonPerCartSpecificityCI: [0.925, 1.062],
  },
  // DUYỆT DỒN QUANH LẦN MUA — cùng nguồn/script (purchase_coupling). Khách mua lặp (≥ 2 ngày mua trong 152 ngày); tỉ
  // trọng lượt xem theo khoảng cách tới lần mua gần nhất. "Nền" = cách mọi lần mua > 14 ngày. Lượt xem/ngày trước 1 lần
  // mua: −28 ngày 0,29 · −14 0,40 · −7 0,64 · −3 1,06 · −1 3,16 · ngày mua 11,3.
  // leadPmf[d−1] = tỉ trọng lượt xem "hành trình" (vượt mức nền) đi trước lần mua d ngày, d = 1..28 (khối CHÍNH NGÀY mua
  // do phiên đặt đơn + phiên cùng ngày đảm nhận, hiệu chỉnh theo viewSharePurchaseDay — tránh đếm ngày mua 2 lần).
  // Thêm giỏ dồn quanh lần mua y như lượt xem (cart*). Duyệt SAU lần mua chỉ ~1 lượt xem vượt nền (so với ~8 trước) →
  // không mô phỏng riêng.
  purchaseCoupling: {
    viewSharePurchaseDay: 0.3528,
    viewShare1to14Before: 0.3705,
    viewShareBackground: 0.1597,
    zeroBackground: 0.3911,
    leadPmf: [0.3526, 0.1569, 0.0959, 0.0726, 0.0585, 0.0417, 0.0444, 0.0352, 0.0208, 0.0166, 0.0181, 0.017, 0.0121, 0.0144, 0.0119, 0.0085, 0.0029, 0.0043, 0.0014, 0.0045, 0.0031, 0.0009, 0.0047, 0.0001, 0.0, 0.0, 0.0, 0.0009],
    cartSharePurchaseDay: 0.4355,
    cartShare1to14Before: 0.3371,
    cartShareBackground: 0.1365,
  },
};

// QUÁ TRÌNH MUA + RỜI BỎ — BG/NBD (Fader, Hardie & Lee 2005) ước lượng trên giao dịch THẬT (churn_fit_bgnbd.py,
// 2026-10-01). Mỗi khách: tốc độ mua λ/ngày ~ Gamma(r, α); sau MỖI lần mua LẶP rời bỏ vĩnh viễn với xác suất p ~ Beta(a, b).
// Nguồn: Online Retail II (UCI, CC BY 4.0) — học 18 tháng, kiểm định 192 ngày giữ lại: tổng giao dịch dự báo/thực 0,978,
// mọi nhóm tần suất trong ±9% (ĐẠT tiêu chí đặt trước ±15% / ±25%). REES46 Cosmetics TRƯỢT (1,17; nhóm mua 1 lần
// dự báo ×1,46 — điểm yếu đã biết của BG/NBD + 82% khách mua 1 lần trong 3 tháng + cắt trái) nên theo quy tắc đặt trước
// dùng Online Retail II. Thay giả định đặt tay cũ (λ log-normal(log 0,5; 0,9)/tháng, 35% churn ở tháng 3–10, tụt còn 5%).
// Giới hạn: bán lẻ quà tặng UK (có khách sỉ) — tốc độ/rời bỏ là của 1 nhà bán lẻ thật, không phải sàn đa ngành VN.
export const PURCHASE_PROCESS = {
  r: 0.6791,
  alpha: 66.007,
  a: 0.1566,
  b: 3.3216,
  source: "Online Retail II (UCI) — churn_fit_bgnbd.py",
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
// HIỆU CHỈNH LẠI 2026-10-01 (sau khi thay lõi mua bằng BG/NBD + thêm hành trình mua + độ dài phiên tách loại): mọi
// tham số dưới đây là bộ cuối của tìm kiếm ngẫu nhiên trên 2–3 seed; số đầu ra & lịch sử: docs/canvas/churn-risk-log.md.
export const GENERATION = {
  pSameCategoryNew: 0.66,     // P(giữ category) khi chọn SP MỚI (bù cho lượt quay lại SP cũ hay đổi category)
  repeatPrev: 0.08,           // P(xem lại ngay SP vừa xem)
  revisitSession: 0.1442,     // P(quay lại SP đã xem trước đó trong phiên) — giữ số đo
  revisitHistory: 0.3,       // P(SP mới trong phiên lấy từ lịch sử phiên cũ)
  sessionResume: 0.75,        // P(phiên mở đầu bằng SP xem gần nhất của phiên trước) — hiệu chỉnh lại 2026-10-01 sau khi đổi cơ cấu phiên (hành trình mua)
  historyRecencyDecay: 1,     // trọng số chọn từ lịch sử ∝ decay^hạng-gần-đây (1 = đều trong 20 SP gần nhất)
  // Chu kỳ mua lại theo ngành (TARGETS.categoryRepurchase): mỗi danh mục ưa thích là 1 luồng mua, tốc độ ∝
  // (1 / tỉ_lệ_chu_kỳ_ngành)^categoryRateExponent; tần suất đặt đơn của user nhân hệ số theo ngành họ thích, CHUẨN
  // HOÁ để trung bình toàn bộ user không đổi (mặt bằng tần suất gắn với churn giữ nguyên). Thay mô hình "độ tới
  // hạn" (thử trước, 2026-10-01): khi tần suất không phụ thuộc ngành, khoảng cách sinh ra ngược chiều số đo.
  categoryRateExponent: 2,   // hiệu chỉnh: 1 (lý thuyết) không ổn định giữa các seed vì bị pha loãng bởi explore + trộn nhiều ngành ưa thích
  intentExploreProb: 0.15,    // P(SP trong đơn không theo ngành ưa thích — mua thử ngành khác)
  // Sau tháng churn (TARGETS.preChurn): đơn hàng vẫn ×0,05 (CHURN_DECAY_FACTOR — churn = ngừng mua), nhưng DUYỆT thì
  // không tụt theo: hệ số riêng cho phiên xem thuần và phiên bỏ giỏ, hiệu chỉnh để SAU/TRƯỚC đo được khớp số thật.
  churnViewDecay: 0.15,
  churnCartDecay: 0.05,
  // Duyệt dồn quanh lần mua (TARGETS.purchaseCoupling): mỗi đơn kéo theo Poisson(journeySessionsPerOrder) phiên xem
  // thuần + Poisson(journeyAbandonPerOrder) phiên bỏ giỏ, đi trước d ngày, d ~ leadPmf (phân phối THỰC NGHIỆM, không
  // giả định dạng hàm). Duyệt nền: user có xác suất zeroBackgroundProb không duyệt ngoài lúc mua; còn lại xem nền =
  // (backgroundConst + 8 × lambdaBase) × backgroundScale lượt/tháng, bỏ giỏ nền = lambdaBase × 0,8 × backgroundAbandonScale.
  // backgroundConst: phần duyệt KHÔNG gắn với tần suất mua (bản cũ đặt tay 3).
  journeySessionsPerOrder: 2.4,
  journeyAbandonPerOrder: 1.08,
  sameDaySessionsPerOrder: 2.47,  // phiên xem thuần CÙNG NGÀY trước giờ đặt đơn (ngày mua thật ~11 lượt xem)
  zeroBackgroundProb: 0.39,
  backgroundScale: 1.16,
  backgroundAbandonScale: 3.07,
  backgroundConst: 0,
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

// LỆCH ĐÃ BIẾT — mục fidelity lệch số thật vì GIỚI HẠN CẤU TRÚC đã phân tích, chưa sửa (có lý do + phạm vi ảnh hưởng).
// Báo cáo vẫn in rõ "LỆCH ĐÃ BIẾT" kèm số sinh/thật; KHÔNG chặn cổng kiểm tra. Chỉ thêm mục vào đây khi đã ghi lý do
// trong docs/canvas/churn-risk-log.md — không dùng để giấu mục trượt chưa hiểu.
export const KNOWN_GAPS = {
  "% phiên có thêm giỏ":
    "bộ sinh tách mỗi SP trong đơn thành 1 phiên 1 lượt thêm giỏ (thật: phiên có giỏ TB 10,3 sự kiện, nhiều lượt thêm giỏ) → " +
    "quá nhiều phiên có giỏ (~35% so với 22%). Sửa = viết lại bộ mô phỏng phiên (đơn nhiều SP trong 1 phiên) + hiệu chỉnh " +
    "lại chỉ số cấp phiên của recsys (đã bàn giao). Feature churn đếm lượt thêm giỏ, không đếm phiên — 2026-10-01.",
};
