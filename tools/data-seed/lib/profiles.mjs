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

    profiles.push({
      index: i,
      lambdaBase,
      willChurn,
      churnMonth,
      priceSensitivity,
      cancelProb,
      preferredCategories,
      baselineViewsPerMonth,
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
