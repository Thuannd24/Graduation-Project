// Sinh review sau khi mua (Tầng 1.2) — tham số ẩn `reviewProbability`/`reviewRatingBias` (xem
// profiles.mjs) ĐỘC LẬP với willChurn/churnMonth, chỉ là tính cách "có hay review" và "khó/dễ
// tính", tránh lặp lại lỗi suy luận vòng tròn (sinh feature tương quan trực tiếp với nhãn).

const MIN_DAYS_AFTER_DELIVERY = 1;
const MAX_DAYS_AFTER_DELIVERY = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function clampRating(x) {
  return Math.max(1, Math.min(5, Math.round(x)));
}

/** `orders` phải đã được `writeOrders()` gán `dbId` thật (order_id) trước khi gọi hàm này — review
 * cần tham chiếu 1 order_id có thật trong DB, không phải id tự bịa. */
export function generateReviews(rng, profileByUserId, orders) {
  const reviews = [];

  for (const order of orders) {
    if (order.status !== "DELIVERED" || !order.dbId) continue;
    const profile = profileByUserId.get(order.userId);
    if (!profile) continue;
    if (!rng.bool(profile.reviewProbability)) continue;

    const item = rng.choice(order.items);
    const rating = clampRating(4 + profile.reviewRatingBias + rng.normal(0, 0.7));
    const createdAt = new Date(
      order.createdAt.getTime() + rng.int(MIN_DAYS_AFTER_DELIVERY, MAX_DAYS_AFTER_DELIVERY) * DAY_MS
    );

    reviews.push({
      productId: item.productId,
      userId: order.userId,
      orderId: order.dbId,
      rating,
      comment: null,
      createdAt,
    });
  }

  return reviews;
}
