// Sinh tham số ẩn cho từng user — KHÔNG dán nhãn "at-risk"/"churn" trực tiếp lên user nào cả.
// Trạng thái rời bỏ phải TỰ XUẤT HIỆN từ việc lambda (tần suất mua) suy giảm theo thời gian đối
// với 1 nhóm user, để việc đánh giá model ở Phase 5 có ý nghĩa (không suy luận vòng tròn — xem
// ghi chú "tránh suy luận vòng tròn" trong docs/canvas/churn-risk-implementation-plan.md Phase 3).

import { GENERATION, PURCHASE_PROCESS } from "./behaviorTargets.mjs";


export function generateUserProfiles(rng, count, categoryIds) {
  const profiles = [];

  for (let i = 0; i < count; i++) {
    // Quá trình mua BG/NBD (PURCHASE_PROCESS, ước lượng trên giao dịch thật): tốc độ mua λ (đơn / 30 ngày) dị biệt
    // Gamma; xác suất rời bỏ sau mỗi lần mua LẶP dị biệt Beta. Việc rời bỏ (willChurn/dropoutAt) KHÔNG đặt trước — nó tự
    // xảy ra trong mô phỏng (simulate.mjs) rồi ghi ngược vào profile làm ground truth.
    const lambdaBase = 30 * rng.gamma(PURCHASE_PROCESS.r, 1 / PURCHASE_PROCESS.alpha);
    const dropoutP = rng.beta(PURCHASE_PROCESS.a, PURCHASE_PROCESS.b);
    const birthFrac = rng.next(); // thời điểm gia nhập (lần mua đầu) ∈ cửa sổ mô phỏng, đều — platform có `months` tháng dữ liệu

    const priceSensitivity = rng.next(); // 0 = không quan tâm giá, 1 = rất nhạy cảm giá
    const cancelProb = rng.float(0.02, 0.1);

    const preferredCategoryCount = rng.int(1, 3);
    const preferredCategories = rng.pickN(categoryIds, Math.min(preferredCategoryCount, categoryIds.length));

    // cường độ duyệt nền tỉ lệ thuận với lambda (user mua nhiều cũng xem nhiều); phần hằng số = GENERATION.backgroundConst
    // (dữ liệu thật: ngừng mua đi kèm ngừng duyệt — duyệt là hệ quả của ý định mua, xem TARGETS.preChurn)
    const baselineViewsPerMonth = GENERATION.backgroundConst + lambdaBase * 8;

    // --- Nhịp giờ/ngày (Tầng 1.2) — tham số ẩn SINH ĐỘC LẬP với willChurn/churnMonth, chỉ chi
    // phối THỜI ĐIỂM trong ngày/tuần, không chi phối TẦN SUẤT hành vi -> không mang tín hiệu
    // churn, tránh lặp lại lỗi "Herfindahl tập trung category" đã bị loại ở candidates.py.
    const preferredHourCenter = rng.float(0, 24); // giờ hoạt động ưa thích (vòng 0-24h)
    const hourConcentration = rng.float(1.5, 4.5); // độ lệch quanh giờ ưa thích (giờ, càng nhỏ càng đều đặn)
    const weekendBias = rng.float(0.6, 1.8); // >1: hoạt động nhiều hơn cuối tuần, <1: ít hơn

    // --- Cụm phiên (session) — độ dài/tần suất phiên độc lập với churn, chỉ nhóm lại các event
    // đã có sẵn thành "1 lượt ghé thăm" thay vì rải đều toàn tháng.
    const sessionBrowseSpreadMinutes = rng.int(3, 40); // độ trải các event trong CÙNG 1 phiên
    const sessionPureViewBatch = rng.int(1, 4); // số sản phẩm xem thuần tuý/phiên (trung bình)

    // --- Review sau khi mua (Tầng 1.2) — xu hướng review ĐỘC LẬP với willChurn/churnMonth, chỉ
    // là tính cách "có hay để lại đánh giá không" và "khó tính hay dễ tính", không liên quan rời bỏ.
    const reviewProbability = rng.float(0.05, 0.6); // xác suất để lại review sau 1 đơn DELIVERED
    const reviewRatingBias = rng.float(-1.2, 0.8); // lệch quanh mốc trung tính ~4 sao (khó tính/dễ tính)

    // --- Lịch sử voucher (Tầng 1.2) — tần suất được phát/dùng voucher gắn với `priceSensitivity`
    // ĐÃ CÓ (không phải churn) — user nhạy giá thật thì hay xin/dùng voucher hơn, đây là quan hệ
    // hợp lý cần có (khác với gán thẳng theo willChurn, vốn sẽ là suy luận vòng tròn).
    const voucherIssueRateBase = 0.4 + priceSensitivity * 1.6; // số voucher được phát/12 tháng (kỳ vọng Poisson)
    const voucherRedeemProbability = 0.25 + priceSensitivity * 0.5; // xác suất 1 voucher được dùng trước khi hết hạn

    profiles.push({
      index: i,
      lambdaBase,
      dropoutP,
      birthFrac,
      willChurn: false,   // ghi bởi simulate.mjs: true nếu rời bỏ trong cửa sổ mô phỏng
      dropoutAt: null,    // ghi bởi simulate.mjs: thời điểm lần mua lặp cuối mà sau đó rời bỏ
      priceSensitivity,
      cancelProb,
      preferredCategories,
      baselineViewsPerMonth,
      preferredHourCenter,
      hourConcentration,
      weekendBias,
      sessionBrowseSpreadMinutes,
      sessionPureViewBatch,
      reviewProbability,
      reviewRatingBias,
      voucherIssueRateBase,
      voucherRedeemProbability,
      // Có duyệt NGOÀI các lần mua không (TARGETS.purchaseCoupling: 39% khách mua lặp không có lượt xem nền nào) —
      // độc lập với willChurn; rút CUỐI vòng để không xê dịch các tham số rút trước.
      backgroundBrowser: rng.bool(1 - GENERATION.zeroBackgroundProb),
    });
  }

  return profiles;
}

// Đã GỠ (2026-10-01): (1) churn đặt tay — 35% user, tháng 3–10, đơn/xem/bỏ giỏ tụt còn 5% → thay bằng BG/NBD;
// (2) "phân vân" 2 tháng trước churn (bỏ giỏ ×2,5, xem ×1,3) — dữ liệu thật không ủng hộ: bỏ giỏ không tăng riêng trước lần
// mua cuối, có điều kiện theo mức hoạt động bỏ giỏ còn đi kèm ÍT churn hơn (churn_measure_prechurn_behavior.py).
