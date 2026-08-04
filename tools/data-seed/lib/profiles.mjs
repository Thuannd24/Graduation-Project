// Sinh tham số ẩn cho từng user — KHÔNG dán nhãn "at-risk"/"churn" trực tiếp lên user nào cả.
// Trạng thái rời bỏ phải TỰ XUẤT HIỆN từ việc lambda (tần suất mua) suy giảm theo thời gian đối
// với 1 nhóm user, để việc đánh giá model ở Phase 5 có ý nghĩa (không suy luận vòng tròn — xem
// ghi chú "tránh suy luận vòng tròn" trong docs/canvas/churn-risk-implementation-plan.md Phase 3).

const CHURN_PROBABILITY = 0.35; // tỉ lệ user có xu hướng rời bỏ trong 12 tháng mô phỏng
const CHURN_MONTH_MIN = 3;
const CHURN_MONTH_MAX = 10; // để lại >= 2 tháng "im lặng" sau churn_month cho temporal label ở Phase 5
const CHURN_DECAY_FACTOR = 0.05; // lambda sau khi rời bỏ chỉ còn 5% so với trước
const PRE_CHURN_RESTLESS_MONTHS = 2; // số tháng "phân vân" ngay trước khi rời bỏ hẳn

export function generateUserProfiles(rng, count, categoryIds) {
  const profiles = [];

  for (let i = 0; i < count; i++) {
    // lambda_base: đa số user mua thưa (~0.3-1 đơn/tháng), số ít là khách VIP mua thường xuyên.
    const lambdaBase = rng.lognormal(Math.log(0.5), 0.9);

    const willChurn = rng.bool(CHURN_PROBABILITY);
    const churnMonth = willChurn ? rng.int(CHURN_MONTH_MIN, CHURN_MONTH_MAX) : null;

    const priceSensitivity = rng.next(); // 0 = không quan tâm giá, 1 = rất nhạy cảm giá
    const cancelProb = rng.float(0.02, 0.1);

    const preferredCategoryCount = rng.int(1, 3);
    const preferredCategories = rng.pickN(categoryIds, Math.min(preferredCategoryCount, categoryIds.length));

    // baseline browsing intensity tỉ lệ thuận với lambda (user mua nhiều cũng xem nhiều)
    const baselineViewsPerMonth = 3 + lambdaBase * 8;

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
      willChurn,
      churnMonth,
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
    });
  }

  return profiles;
}

/** Hệ số nhân lambda tại 1 tháng cụ thể (1..totalMonths, totalMonths = tháng gần nhất/hiện tại). */
export function lambdaDecayAt(profile, month) {
  if (!profile.willChurn || month < profile.churnMonth) return 1.0;
  return CHURN_DECAY_FACTOR;
}

/** Hệ số "phân vân" (bỏ giỏ hàng nhiều hơn bình thường) trong vài tháng ngay trước churn_month —
 * đây là tín hiệu hành vi mà feature `cart_abandon_count`/`days_since_last_activity` (thấp, vì
 * vẫn đang hoạt động) cần bắt được, khác với user đã rời bỏ hẳn từ lâu (days_since_last_activity cao). */
export function restlessnessMultiplierAt(profile, month) {
  if (!profile.willChurn) return 1.0;
  const monthsBeforeChurn = profile.churnMonth - month;
  if (monthsBeforeChurn >= 0 && monthsBeforeChurn < PRE_CHURN_RESTLESS_MONTHS) {
    return 2.5; // tăng gấp 2.5x số lần bỏ giỏ hàng trong giai đoạn "phân vân"
  }
  return 1.0;
}
