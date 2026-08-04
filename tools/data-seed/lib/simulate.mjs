import { lambdaDecayAt, restlessnessMultiplierAt } from "./profiles.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS; // đơn giản hoá: "tháng" = 30 ngày, đủ dùng cho dữ liệu tổng hợp

const ORDER_STATUS_DELIVERED = "DELIVERED";
const ORDER_STATUS_CANCELLED = "CANCELLED";

const ACTION_VIEW = "VIEW_PRODUCT";
const ACTION_ADD_TO_CART = "ADD_TO_CART";

const PREFERRED_CATEGORY_WEIGHT = 0.7; // 70% hành vi rơi vào category ưa thích, 30% ngẫu nhiên

function monthWindow(now, totalMonths, month) {
  const end = new Date(now.getTime() - (totalMonths - month) * MONTH_MS);
  const start = new Date(end.getTime() - MONTH_MS);
  return { start, end };
}

/** Timestamp "neo" (mốc bắt đầu 1 phiên) có nhịp giờ/ngày theo tham số ẩn của user, thay vì đều
 * tuyệt đối trong tháng — xem `preferredHourCenter`/`weekendBias` ở profiles.mjs. */
function rhythmicTimestamp(rng, start, end, profile) {
  const totalDays = Math.max(Math.floor((end.getTime() - start.getTime()) / DAY_MS) - 1, 0);

  let dayStart;
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = new Date(start.getTime() + rng.int(0, totalDays) * DAY_MS);
    const isWeekend = candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6;
    // weekendBias > 1 -> chấp nhận ngày cuối tuần dễ hơn; < 1 -> khó hơn. Ngày thường luôn chấp nhận.
    const acceptProb = isWeekend ? Math.min(profile.weekendBias / 2, 1) : 1;
    if (!isWeekend || rng.bool(acceptProb)) {
      dayStart = candidate;
      break;
    }
    dayStart = candidate; // hết lượt thử vẫn dùng ngày cuối cùng, tránh vòng lặp vô hạn kết quả rỗng
  }

  let hour = profile.preferredHourCenter + rng.normal(0, profile.hourConcentration);
  hour = ((hour % 24) + 24) % 24;
  const t = new Date(dayStart.getTime() + Math.floor(hour * 60 * 60 * 1000) + rng.int(0, 59) * 60 * 1000);

  if (t < start) return new Date(start.getTime());
  if (t >= end) return new Date(end.getTime() - 1000);
  return t;
}

/** Id phiên tổng hợp, sinh từ RNG có seed (KHÔNG dùng crypto.randomUUID) để giữ toàn bộ dataset
 * reproducible theo --seed, giống mọi giá trị khác trong bộ sinh dữ liệu này. */
function randomSessionId(rng) {
  let hex = "";
  for (let i = 0; i < 16; i++) hex += rng.int(0, 15).toString(16);
  return `seed-${hex}`;
}

function pickProduct(rng, catalog, profile) {
  const useePreferred =
    profile.preferredCategories.length > 0 && rng.bool(PREFERRED_CATEGORY_WEIGHT);
  if (useePreferred) {
    const categoryId = rng.choice(profile.preferredCategories);
    const list = catalog.byCategory.get(categoryId);
    if (list && list.length > 0) return rng.choice(list);
  }
  return rng.choice(catalog.products);
}

/** Sinh toàn bộ order + user_events cho MỘT user qua `totalMonths` tháng gần nhất tính đến `now`. */
function simulateUser(rng, profile, catalog, userId, totalMonths, now) {
  const orders = [];
  const events = [];

  for (let month = 1; month <= totalMonths; month++) {
    const { start, end } = monthWindow(now, totalMonths, month);
    const decay = lambdaDecayAt(profile, month);
    const restless = restlessnessMultiplierAt(profile, month);

    // --- Đơn hàng thật (view -> add-to-cart -> order, cùng sản phẩm) ---
    const numOrders = rng.poisson(profile.lambdaBase * decay);
    for (let o = 0; o < numOrders; o++) {
      const orderDate = rhythmicTimestamp(rng, start, end, profile);
      const numItems = rng.int(1, 3);
      const items = [];
      let totalAmount = 0;

      // 1 phiên "chốt đơn" dùng chung cho toàn bộ add-to-cart của đơn này (thêm nhiều sản phẩm
      // vào giỏ thường xảy ra trong CÙNG 1 lượt ghé thăm ngay trước khi đặt hàng).
      const checkoutSessionId = randomSessionId(rng);

      for (let it = 0; it < numItems; it++) {
        const product = pickProduct(rng, catalog, profile);
        const quantity = rng.int(1, 2);
        const unitPrice = Number(product.price);
        const subtotal = unitPrice * quantity;
        totalAmount += subtotal;

        items.push({
          productId: product.id,
          productName: product.name,
          unitPrice,
          quantity,
          subtotal,
        });

        // Hành vi dẫn tới đơn: xem sản phẩm 1-72h trước (phiên riêng, browse sớm hơn), thêm giỏ
        // 10 phút - 6h trước khi đặt (thuộc phiên chốt đơn, gần thời điểm mua).
        const viewAt = new Date(orderDate.getTime() - rng.int(1, 72) * 60 * 60 * 1000);
        const cartAt = new Date(orderDate.getTime() - rng.int(10, 360) * 60 * 1000);
        const viewSessionId = randomSessionId(rng);
        events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_VIEW, createdAt: viewAt, sessionId: viewSessionId });
        events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_ADD_TO_CART, createdAt: cartAt, sessionId: checkoutSessionId });
      }

      const isCancelled = rng.bool(profile.cancelProb);
      const hasCoupon = rng.bool(profile.priceSensitivity * 0.5);
      const discountAmount = hasCoupon ? Math.round(totalAmount * 0.1) : 0;
      const finalAmount = totalAmount - discountAmount;

      orders.push({
        userId,
        status: isCancelled ? ORDER_STATUS_CANCELLED : ORDER_STATUS_DELIVERED,
        totalAmount,
        discountAmount,
        finalAmount,
        couponCode: hasCoupon ? "SEED-DISCOUNT10" : null,
        createdAt: orderDate,
        items,
      });
    }

    // --- Bỏ giỏ hàng KHÔNG dẫn tới đơn (tín hiệu rủi ro rời bỏ) ---
    // Tần suất tỉ lệ theo lambda*decay, tăng vọt trong giai đoạn "phân vân" trước churn_month.
    // View + cart-abandon xảy ra trong CÙNG 1 phiên ngắn (xem xong bỏ giỏ, rời đi trong vài giờ).
    const numAbandon = rng.poisson(profile.lambdaBase * decay * restless * 0.8);
    for (let a = 0; a < numAbandon; a++) {
      const product = pickProduct(rng, catalog, profile);
      const cartAt = rhythmicTimestamp(rng, start, end, profile);
      const viewAt = new Date(cartAt.getTime() - rng.int(5, 120) * 60 * 1000);
      const abandonSessionId = randomSessionId(rng);
      events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_VIEW, createdAt: viewAt, sessionId: abandonSessionId });
      events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_ADD_TO_CART, createdAt: cartAt, sessionId: abandonSessionId });
    }

    // --- Xem thuần tuý, không thêm giỏ (nhiễu nền, tăng nhẹ khi "phân vân") ---
    // Gộp thành từng CỤM (1 phiên = xem vài sản phẩm liên tiếp) thay vì rải từng cái độc lập —
    // để events_per_session > 1 và session length có phân bố thật, không phải hằng số.
    const avgViewsPerSession = (profile.sessionPureViewBatch + 1) / 2;
    const numPureViewSessions = rng.poisson(
      (profile.baselineViewsPerMonth * decay * (restless > 1 ? 1.3 : 1)) / avgViewsPerSession
    );
    for (let s = 0; s < numPureViewSessions; s++) {
      const sessionId = randomSessionId(rng);
      const anchor = rhythmicTimestamp(rng, start, end, profile);
      const batchSize = rng.int(1, profile.sessionPureViewBatch);
      for (let v = 0; v < batchSize; v++) {
        const product = pickProduct(rng, catalog, profile);
        const viewAt = new Date(anchor.getTime() + rng.int(0, profile.sessionBrowseSpreadMinutes) * 60 * 1000);
        events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_VIEW, createdAt: viewAt, sessionId });
      }
    }
  }

  return { orders, events };
}

/** Sinh dữ liệu cho toàn bộ user, trả về mảng gộp orders/events kèm userId tương ứng. */
export function simulateAllUsers(rng, profiles, userIds, catalog, { totalMonths = 12, now = new Date() } = {}) {
  const allOrders = [];
  const allEvents = [];

  profiles.forEach((profile, idx) => {
    const userId = userIds[idx];
    const { orders, events } = simulateUser(rng, profile, catalog, userId, totalMonths, now);
    allOrders.push(...orders);
    allEvents.push(...events);
  });

  return { orders: allOrders, events: allEvents };
}
