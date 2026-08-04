import { getPool, bulkInsert, bulkUpsert, DB } from "./db.mjs";

function toSqlDatetime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Upsert category theo batch (slug unique) — idempotent, chạy lại nhiều lần không tạo trùng.
 * Trả Map<slug, categoryId> cho TOÀN BỘ slug truyền vào (cũ lẫn mới). */
export async function ensureCategories(categories) {
  const rows = categories.map((c) => [c.name, c.slug, 1]);
  await bulkUpsert(`${DB.PRODUCT}.categories`, ["name", "slug", "active"], rows, { updateColumn: "name" });

  const slugs = categories.map((c) => c.slug);
  if (slugs.length === 0) return new Map();
  const [result] = await getPool().query(
    `SELECT id, slug FROM ${DB.PRODUCT}.categories WHERE slug IN (${slugs.map(() => "?").join(",")})`,
    slugs
  );
  return new Map(result.map((r) => [r.slug, r.id]));
}

/** Upsert product theo batch (slug = `olist-<product_id>` nên chống trùng tự nhiên khi chạy lại).
 * Trả Map<slug, {id, name, categoryId}>. */
export async function ensureProducts(products, categorySlugToId) {
  const description = "Sản phẩm nhập từ Olist Brazilian E-Commerce (dữ liệu thật, xem README).";
  const rows = products
    .map((p) => {
      const categoryId = categorySlugToId.get(p.categorySlug);
      if (!categoryId) return null; // không nên xảy ra, phòng vệ nếu thiếu ánh xạ category
      return [p.name, p.slug, description, Math.max(p.price, 1000), 0, categoryId, p.weight, 1];
    })
    .filter(Boolean);
  await bulkUpsert(
    `${DB.PRODUCT}.products`,
    ["name", "slug", "description", "price", "cost_price", "category_id", "weight", "active"],
    rows,
    { updateColumn: "name" }
  );

  const slugs = products.map((p) => p.slug);
  if (slugs.length === 0) return new Map();
  const [result] = await getPool().query(
    `SELECT id, slug, name, category_id AS categoryId FROM ${DB.PRODUCT}.products WHERE slug IN (${slugs.map(() => "?").join(",")})`,
    slugs
  );
  return new Map(result.map((r) => [r.slug, r]));
}

/** Upsert user theo batch (email unique). Trả không gì — orders/reviews chỉ cần `keycloakUserId`
 * đã biết trước (không cần tra lại như id nội bộ ở tools/data-seed vì ở đây không đụng issued_vouchers). */
export async function ensureUsers(users) {
  if (users.length === 0) return;
  const now = new Date();
  const rows = users.map((u) => [
    u.keycloakUserId, u.username, u.email, u.fullName, "MEMBER", false, 0, true, now, now,
  ]);
  await bulkUpsert(
    `${DB.USER}.users`,
    ["keycloak_user_id", "username", "email", "full_name", "customer_tier", "is_blacklisted", "loyalty_points", "active", "created_at", "updated_at"],
    rows,
    { updateColumn: "username" }
  );
}

/** Ghi orders + order_items theo batch (giống hệt tools/data-seed/lib/writeData.mjs::writeOrders):
 * dùng `result.insertId` (id dòng ĐẦU trong batch) để suy ra order_id cho từng order tương ứng mà
 * không cần query lại — đúng với InnoDB single-connection, không có ghi đồng thời nào khác trong
 * lúc import. Trả Map<olistOrderId, dbOrderId> — cần cho reviews.mjs/behaviorFromOrders.mjs. */
export async function writeOrders(orders, productSlugToRow, { batchSize = 200 } = {}) {
  const pool = getPool();
  const dbIdByOlistOrderId = new Map();
  const orderColumns = [
    "user_id", "status", "total_amount", "discount_amount", "final_amount", "point_discount_amount",
    "shipping_fee", "shipping_discount_amount", "vat_amount", "shipping_address", "phone_number",
    "created_at", "updated_at",
  ];
  const placeholderAddress = "Địa chỉ nhập từ Olist (dữ liệu thật, ẩn danh theo giấy phép dataset)";

  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    const rows = batch.map((o) => [
      o.userId, o.status, o.totalAmount, 0, o.totalAmount, 0, 0, 0, 0,
      placeholderAddress, "0900000000", toSqlDatetime(o.createdAt), toSqlDatetime(o.createdAt),
    ]);

    const placeholder = `(${orderColumns.map(() => "?").join(",")})`;
    const sql = `INSERT INTO ${DB.ORDER}.orders (${orderColumns.join(",")}) VALUES ${rows.map(() => placeholder).join(",")}`;
    const [result] = await pool.execute(sql, rows.flat());

    const firstOrderId = result.insertId;
    const itemRows = [];
    batch.forEach((o, idx) => {
      const dbOrderId = firstOrderId + idx;
      dbIdByOlistOrderId.set(o.olistOrderId, dbOrderId);
      for (const item of o.items) {
        const productRow = productSlugToRow.get(item.productSlug);
        if (!productRow) continue;
        itemRows.push([dbOrderId, productRow.id, productRow.name, item.unitPrice, item.quantity, item.unitPrice * item.quantity]);
      }
    });

    if (itemRows.length > 0) {
      await bulkInsert(
        `${DB.ORDER}.order_items`,
        ["order_id", "product_id", "product_name", "unit_price", "quantity", "subtotal"],
        itemRows
      );
    }
  }

  return dbIdByOlistOrderId;
}

export async function writeReviews(reviews, productSlugToRow, orderDbIdByOlistId, userIdByOlistOrderId) {
  const rows = reviews
    .map((r) => {
      const productRow = productSlugToRow.get(r.productSlug);
      const orderDbId = orderDbIdByOlistId.get(r.olistOrderId);
      const userId = userIdByOlistOrderId.get(r.olistOrderId);
      if (!productRow || !orderDbId || !userId) return null;
      return [productRow.id, userId, orderDbId, r.rating, r.comment, toSqlDatetime(r.createdAt)];
    })
    .filter(Boolean);

  await bulkInsert(
    `${DB.PRODUCT}.product_reviews`,
    ["product_id", "user_id", "order_id", "rating", "comment", "created_at"],
    rows
  );
  return { reviewsWritten: rows.length };
}

export async function writeEvents(events) {
  const rows = events.map((e) => [
    e.userId, e.sessionId, e.itemId, e.categoryId, e.actionType, toSqlDatetime(e.createdAt),
  ]);
  await bulkInsert(
    `${DB.ORDER}.user_events`,
    ["user_id", "session_id", "item_id", "category_id", "action_type", "created_at"],
    rows
  );
  return { eventsWritten: rows.length };
}
