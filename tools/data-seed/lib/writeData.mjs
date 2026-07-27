import { getPool, bulkInsert, DB } from "./db.mjs";

const PLACEHOLDER_ADDRESS = "Địa chỉ demo (dữ liệu tổng hợp) - Quận 1, TP. Hồ Chí Minh";

function placeholderPhone(rng) {
  return "09" + String(rng.int(10000000, 99999999));
}

function toSqlDatetime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Insert orders theo batch, dùng `result.insertId` (id của dòng ĐẦU trong batch multi-row
 * insert — đúng với InnoDB single-connection, không có ghi đồng thời nào khác trong lúc seed)
 * để suy ra order_id cho từng order_item tương ứng mà không cần query lại. */
export async function writeOrders(rng, orders, { batchSize = 200 } = {}) {
  const pool = getPool();
  const orderColumns = [
    "user_id",
    "status",
    "total_amount",
    "discount_amount",
    "final_amount",
    "point_discount_amount",
    "shipping_fee",
    "shipping_discount_amount",
    "vat_amount",
    "coupon_code",
    "shipping_address",
    "phone_number",
    "created_at",
    "updated_at",
  ];

  let totalItemsWritten = 0;

  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    const rows = batch.map((o) => [
      o.userId,
      o.status,
      o.totalAmount,
      o.discountAmount,
      o.finalAmount,
      0, // point_discount_amount
      0, // shipping_fee
      0, // shipping_discount_amount
      0, // vat_amount
      o.couponCode,
      PLACEHOLDER_ADDRESS,
      placeholderPhone(rng),
      toSqlDatetime(o.createdAt),
      toSqlDatetime(o.createdAt),
    ]);

    const placeholder = `(${orderColumns.map(() => "?").join(",")})`;
    const sql = `INSERT INTO ${DB.ORDER}.orders (${orderColumns.join(",")}) VALUES ${rows
      .map(() => placeholder)
      .join(",")}`;
    const [result] = await pool.execute(sql, rows.flat());

    const firstOrderId = result.insertId;
    const itemRows = [];
    batch.forEach((order, idx) => {
      const orderId = firstOrderId + idx;
      for (const item of order.items) {
        itemRows.push([
          orderId,
          item.productId,
          item.productName,
          item.unitPrice,
          item.quantity,
          item.subtotal,
        ]);
      }
    });

    if (itemRows.length > 0) {
      await bulkInsert(
        `${DB.ORDER}.order_items`,
        ["order_id", "product_id", "product_name", "unit_price", "quantity", "subtotal"],
        itemRows
      );
      totalItemsWritten += itemRows.length;
    }
  }

  return { ordersWritten: orders.length, itemsWritten: totalItemsWritten };
}

export async function writeEvents(events, { batchSize = 1000 } = {}) {
  const rows = events.map((e) => [
    e.userId,
    e.itemId,
    e.categoryId,
    e.actionType,
    toSqlDatetime(e.createdAt),
  ]);
  await bulkInsert(
    `${DB.ORDER}.user_events`,
    ["user_id", "item_id", "category_id", "action_type", "created_at"],
    rows,
    batchSize
  );
  return { eventsWritten: rows.length };
}
