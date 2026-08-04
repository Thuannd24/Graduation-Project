import { getPool, bulkInsert, DB } from "./db.mjs";

function toSqlDatetime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Insert category nếu slug chưa tồn tại, trả Map<slug, categoryId> cho TOÀN BỘ slug truyền vào
 * (cũ lẫn mới) — idempotent, chạy lại nhiều lần không tạo trùng. */
export async function ensureCategories(categories) {
  const pool = getPool();
  for (const c of categories) {
    await pool.execute(
      `INSERT INTO ${DB.PRODUCT}.categories (name, slug, active) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE name = name`,
      [c.name, c.slug]
    );
  }
  const slugs = categories.map((c) => c.slug);
  if (slugs.length === 0) return new Map();
  const [rows] = await pool.query(
    `SELECT id, slug FROM ${DB.PRODUCT}.categories WHERE slug IN (${slugs.map(() => "?").join(",")})`,
    slugs
  );
  return new Map(rows.map((r) => [r.slug, r.id]));
}

/** Insert product nếu slug chưa tồn tại (slug = `olist-<product_id>` nên chống trùng tự nhiên khi
 * chạy lại). Trả Map<slug, {id, categoryId}>. */
export async function ensureProducts(products, categorySlugToId) {
  const pool = getPool();
  for (const p of products) {
    const categoryId = categorySlugToId.get(p.categorySlug);
    if (!categoryId) continue; // không nên xảy ra, phòng vệ nếu thiếu ánh xạ category
    await pool.execute(
      `INSERT INTO ${DB.PRODUCT}.products
         (name, slug, description, price, cost_price, category_id, weight, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE name = name`,
      [p.name, p.slug, "Sản phẩm nhập từ Olist Brazilian E-Commerce (dữ liệu thật, xem README).",
        Math.max(p.price, 1000), categoryId, p.weight]
    );
  }
  const slugs = products.map((p) => p.slug);
  if (slugs.length === 0) return new Map();
  const [rows] = await pool.query(
    `SELECT id, slug, name, category_id AS categoryId FROM ${DB.PRODUCT}.products WHERE slug IN (${slugs.map(() => "?").join(",")})`,
    slugs
  );
  return new Map(rows.map((r) => [r.slug, r]));
}

/** Insert user nếu email chưa tồn tại. Trả không gì — orders/reviews chỉ cần `keycloakUserId` đã
 * biết trước (không cần tra lại như id nội bộ ở tools/data-seed vì ở đây không đụng issued_vouchers). */
export async function ensureUsers(users) {
  if (users.length === 0) return;
  const now = new Date();
  const rows = users.map((u) => [
    u.keycloakUserId, u.username, u.email, u.fullName, "MEMBER", false, 0, true, now, now,
  ]);
  const pool = getPool();
  for (const row of rows) {
    await pool.execute(
      `INSERT INTO ${DB.USER}.users
         (keycloak_user_id, username, email, full_name, customer_tier, is_blacklisted, loyalty_points, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = username`,
      row
    );
  }
}

/** Ghi orders + order_items. Trả Map<olistOrderId, dbOrderId> (order.dbId thật) — cần cho
 * reviews.mjs và behaviorFromOrders.mjs (review/behavior phải trỏ đúng order_id thật). */
export async function writeOrders(orders, productSlugToRow) {
  const pool = getPool();
  const dbIdByOlistOrderId = new Map();

  for (const o of orders) {
    const [result] = await pool.execute(
      `INSERT INTO ${DB.ORDER}.orders
         (user_id, status, total_amount, discount_amount, final_amount, point_discount_amount,
          shipping_fee, shipping_discount_amount, vat_amount, shipping_address, phone_number, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, 0, 0, 0, 0, ?, ?, ?, ?)`,
      [
        o.userId, o.status, o.totalAmount, o.totalAmount,
        "Địa chỉ nhập từ Olist (dữ liệu thật, ẩn danh theo giấy phép dataset)",
        "0900000000",
        toSqlDatetime(o.createdAt), toSqlDatetime(o.createdAt),
      ]
    );
    const dbOrderId = result.insertId;
    dbIdByOlistOrderId.set(o.olistOrderId, dbOrderId);

    const itemRows = o.items
      .map((item) => {
        const productRow = productSlugToRow.get(item.productSlug);
        if (!productRow) return null;
        return [dbOrderId, productRow.id, productRow.name, item.unitPrice, item.quantity, item.unitPrice * item.quantity];
      })
      .filter(Boolean);

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
