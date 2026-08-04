// Sinh lịch sử voucher (Tầng 1.2) — tần suất phát/dùng gắn với `priceSensitivity` ĐÃ CÓ (không
// phải willChurn): user nhạy giá thật thì hay được phát và hay dùng voucher hơn, đây là quan hệ
// hợp lý cần có, khác với gán thẳng theo churn (sẽ là suy luận vòng tròn). Mục tiêu mở khoá
// `voucher_usage_rate` làm candidate feature (xem candidates.py).

const VOUCHER_TYPES = ["PERCENT", "FIXED", "FREESHIP"];
const VOUCHER_TYPE_WEIGHTS = [0.5, 0.3, 0.2];
const EXPIRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function randomVoucherCode(rng) {
  let hex = "";
  for (let i = 0; i < 10; i++) hex += rng.int(0, 15).toString(16);
  return `SEED-${hex}`.toUpperCase();
}

function buildDiscount(rng, voucherType) {
  if (voucherType === "PERCENT") return { discountPercent: rng.int(5, 20), discountAmount: null };
  if (voucherType === "FIXED") return { discountPercent: null, discountAmount: rng.int(1, 10) * 10000 };
  return { discountPercent: null, discountAmount: null }; // FREESHIP
}

/**
 * `deliveredOrdersByUser`: Map<keycloakUserId, Array<order>> — CHỈ đơn DELIVERED, đã có `dbId` thật
 * (từ `writeOrders()`), sắp xếp theo `createdAt` tăng dần, dùng để tìm đơn "dùng voucher này".
 * `internalUserIdMap`: Map<keycloakUserId, number> — id nội bộ (Long) của `issued_vouchers.user_id`.
 */
export function generateIssuedVouchers(rng, profileByUserId, internalUserIdMap, deliveredOrdersByUser, {
  windowStart,
  windowEnd,
  now,
}) {
  const vouchers = [];

  for (const [userId, profile] of profileByUserId) {
    const internalId = internalUserIdMap.get(userId);
    if (!internalId) continue; // user chưa tồn tại trong ecommerce_user_db (không nên xảy ra, phòng vệ)

    const numVouchers = rng.poisson(profile.voucherIssueRateBase);
    const userOrders = deliveredOrdersByUser.get(userId) || [];

    for (let i = 0; i < numVouchers; i++) {
      const issuedAt = new Date(windowStart.getTime() + rng.next() * (windowEnd.getTime() - windowStart.getTime()));
      const expiresAt = new Date(issuedAt.getTime() + EXPIRY_DAYS * DAY_MS);
      const voucherType = rng.weightedChoice(VOUCHER_TYPES, VOUCHER_TYPE_WEIGHTS);
      const { discountPercent, discountAmount } = buildDiscount(rng, voucherType);

      let status = "UNUSED";
      let usedAt = null;
      let usedOrderId = null;

      if (rng.bool(profile.voucherRedeemProbability)) {
        const redeemableOrder = userOrders.find(
          (o) => o.createdAt > issuedAt && o.createdAt <= expiresAt
        );
        if (redeemableOrder) {
          status = "USED";
          usedAt = redeemableOrder.createdAt;
          usedOrderId = redeemableOrder.dbId;
        }
      }
      if (status === "UNUSED" && expiresAt <= now) {
        status = "EXPIRED";
      }

      vouchers.push({
        code: randomVoucherCode(rng),
        userId: internalId,
        voucherType,
        status,
        discountPercent,
        discountAmount,
        expiresAt,
        usedAt,
        usedOrderId,
        createdAt: issuedAt,
      });
    }
  }

  return vouchers;
}
