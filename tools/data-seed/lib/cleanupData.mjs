import { query, getPool, DB } from "./db.mjs";
import { SYNTHETIC_EMAIL_DOMAIN } from "./users.mjs";

/** Xoá toàn bộ dữ liệu do seed.mjs sinh ra trước đó (nhận diện qua email pattern), để hỗ trợ
 * chạy lại idempotent (`--force`). KHÔNG đụng tới user/order thật của hệ thống vì luôn lọc theo
 * đúng 2 email pattern seed dùng (`seed_user_*@seed.internal`, `demo_user_*@demo.local`). */
export async function cleanupSeedData() {
  const seedUsers = await query(
    `SELECT id AS internalId, keycloak_user_id AS userId, email FROM ${DB.USER}.users
     WHERE email LIKE ? OR email LIKE 'demo_user_%@demo.local'`,
    [`%@${SYNTHETIC_EMAIL_DOMAIN}`]
  );

  if (seedUsers.length === 0) {
    return { usersDeleted: 0, ordersDeleted: 0, eventsDeleted: 0, reviewsDeleted: 0, vouchersDeleted: 0 };
  }

  const userIds = seedUsers.map((u) => u.userId);
  const internalUserIds = seedUsers.map((u) => u.internalId);
  const pool = getPool();
  const placeholders = userIds.map(() => "?").join(",");

  const [orderRows] = await pool.query(
    `SELECT id FROM ${DB.ORDER}.orders WHERE user_id IN (${placeholders})`,
    userIds
  );
  const orderIds = orderRows.map((r) => r.id);

  let ordersDeleted = 0;
  if (orderIds.length > 0) {
    const orderPlaceholders = orderIds.map(() => "?").join(",");
    await pool.query(`DELETE FROM ${DB.ORDER}.order_items WHERE order_id IN (${orderPlaceholders})`, orderIds);
    const [delResult] = await pool.query(`DELETE FROM ${DB.ORDER}.orders WHERE id IN (${orderPlaceholders})`, orderIds);
    ordersDeleted = delResult.affectedRows;
  }

  const [eventsResult] = await pool.query(
    `DELETE FROM ${DB.ORDER}.user_events WHERE user_id IN (${placeholders})`,
    userIds
  );

  const [reviewsResult] = await pool.query(
    `DELETE FROM ${DB.PRODUCT}.product_reviews WHERE user_id IN (${placeholders})`,
    userIds
  );

  const internalPlaceholders = internalUserIds.map(() => "?").join(",");
  const [vouchersResult] = await pool.query(
    `DELETE FROM ${DB.PROMOTION}.issued_vouchers WHERE user_id IN (${internalPlaceholders})`,
    internalUserIds
  );

  // Chỉ xoá user KHÔNG phải demo (demo_user_* giữ lại để không phải tạo lại account Keycloak
  // mỗi lần --force; email seed_user_*@seed.internal thì xoá sạch để tái sinh profile mới).
  const [usersResult] = await pool.query(
    `DELETE FROM ${DB.USER}.users WHERE email LIKE ?`,
    [`%@${SYNTHETIC_EMAIL_DOMAIN}`]
  );

  return {
    usersDeleted: usersResult.affectedRows,
    ordersDeleted,
    eventsDeleted: eventsResult.affectedRows,
    reviewsDeleted: reviewsResult.affectedRows,
    vouchersDeleted: vouchersResult.affectedRows,
  };
}
