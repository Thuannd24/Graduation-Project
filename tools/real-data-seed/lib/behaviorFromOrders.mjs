// Olist không có dữ liệu clickstream (xem/bỏ giỏ) — chỉ có đơn hàng đã hoàn tất. Sinh TỔNG HỢP
// view/cart nhưng NEO vào mốc thời gian đơn hàng THẬT (order_purchase_timestamp), khác hẳn
// tools/data-seed (nơi cả timestamp lẫn đơn hàng đều tổng hợp): ở đây nhịp giờ/ngày lan truyền
// từ dữ liệu THẬT (nếu đơn thật xảy ra nhiều vào buổi tối, view/cart neo theo cũng vào buổi tối
// theo đúng nhịp đó) — không cần dựng lại cơ chế rhythmicTimestamp() như data-seed.
import crypto from "node:crypto";

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** `ordersWithDbIds`: mỗi order phải có `dbId` (order_id thật đã ghi DB), `createdAt` (Date),
 * `items: [{ productId (id thật trong DB, khớp categoryId), categoryId }]`. */
export function generateBehaviorFromOrders(ordersWithDbIds, { userIdField = "userId" } = {}) {
  const events = [];

  for (const order of ordersWithDbIds) {
    const orderDate = order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt);
    if (Number.isNaN(orderDate.getTime())) continue;

    const checkoutSessionId = crypto.randomUUID();

    for (const item of order.items) {
      const viewAt = new Date(orderDate.getTime() - randInt(1, 72) * HOUR_MS);
      const cartAt = new Date(orderDate.getTime() - randInt(10, 360) * MIN_MS);
      const viewSessionId = crypto.randomUUID();

      events.push({
        userId: order[userIdField],
        sessionId: viewSessionId,
        itemId: item.productId,
        categoryId: item.categoryId,
        actionType: "VIEW_PRODUCT",
        createdAt: viewAt,
      });
      events.push({
        userId: order[userIdField],
        sessionId: checkoutSessionId,
        itemId: item.productId,
        categoryId: item.categoryId,
        actionType: "ADD_TO_CART",
        createdAt: cartAt,
      });
    }
  }

  return events;
}
