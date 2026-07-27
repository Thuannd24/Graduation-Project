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

function randomTimestamp(rng, start, end) {
  const t = start.getTime() + rng.next() * (end.getTime() - start.getTime());
  return new Date(t);
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
      const orderDate = randomTimestamp(rng, start, end);
      const numItems = rng.int(1, 3);
      const items = [];
      let totalAmount = 0;

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

        // Hành vi dẫn tới đơn: xem sản phẩm 1-72h trước, thêm giỏ 10 phút - 6h trước khi đặt.
        const viewAt = new Date(orderDate.getTime() - rng.int(1, 72) * 60 * 60 * 1000);
        const cartAt = new Date(orderDate.getTime() - rng.int(10, 360) * 60 * 1000);
        events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_VIEW, createdAt: viewAt });
        events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_ADD_TO_CART, createdAt: cartAt });
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
    const numAbandon = rng.poisson(profile.lambdaBase * decay * restless * 0.8);
    for (let a = 0; a < numAbandon; a++) {
      const product = pickProduct(rng, catalog, profile);
      const cartAt = randomTimestamp(rng, start, end);
      const viewAt = new Date(cartAt.getTime() - rng.int(5, 120) * 60 * 1000);
      events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_VIEW, createdAt: viewAt });
      events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_ADD_TO_CART, createdAt: cartAt });
    }

    // --- Xem thuần tuý, không thêm giỏ (nhiễu nền, tăng nhẹ khi "phân vân") ---
    const numPureViews = rng.poisson(profile.baselineViewsPerMonth * decay * (restless > 1 ? 1.3 : 1));
    for (let v = 0; v < numPureViews; v++) {
      const product = pickProduct(rng, catalog, profile);
      const viewAt = randomTimestamp(rng, start, end);
      events.push({ userId, itemId: product.id, categoryId: product.categoryId, actionType: ACTION_VIEW, createdAt: viewAt });
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
