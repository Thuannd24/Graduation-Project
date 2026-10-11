import { getPool, DB } from "./db.mjs";
import { SYNTHETIC_EMAIL_DOMAIN } from "./mapOlist.mjs";

export async function countExistingOlistData() {
  const [rows] = await getPool().query(
    `SELECT COUNT(*) AS cnt FROM ${DB.USER}.users WHERE email LIKE ?`,
    [`%@${SYNTHETIC_EMAIL_DOMAIN}`]
  );
  return { users: rows[0].cnt };
}

/** Xoá toàn bộ dữ liệu Olist đã import trước đó (nhận diện qua email pattern `@olist.import`),
 * hỗ trợ chạy lại idempotent (`--force`). KHÔNG đụng user/order thật của hệ thống hay dữ liệu
 * synthetic của tools/data-seed (domain khác hẳn: `seed.internal`/`demo.local`). Sản phẩm/category
 * import (slug `olist-*`) được GIỮ LẠI có chủ đích — xoá lại rồi nạp lại vẫn dùng chung, không tạo
 * trùng do `ON DUPLICATE KEY UPDATE` ở writeReal.mjs. */
export async function cleanupOlistData() {
  const pool = getPool();
  const [users] = await pool.query(
    `SELECT keycloak_user_id AS userId FROM ${DB.USER}.users WHERE email LIKE ?`,
    [`%@${SYNTHETIC_EMAIL_DOMAIN}`]
  );
  if (users.length === 0) {
    return { usersDeleted: 0, ordersDeleted: 0, eventsDeleted: 0, reviewsDeleted: 0 };
  }

  const userIds = users.map((u) => u.userId);
  const placeholders = userIds.map(() => "?").join(",");

  const [orderRows] = await pool.query(
    `SELECT id FROM ${DB.ORDER}.orders WHERE user_id IN (${placeholders})`,
    userIds
  );
  const orderIds = orderRows.map((r) => r.id);

  let ordersDeleted = 0;
  let reviewsDeleted = 0;
  if (orderIds.length > 0) {
    const orderPlaceholders = orderIds.map(() => "?").join(",");
    await pool.query(`DELETE FROM ${DB.ORDER}.order_items WHERE order_id IN (${orderPlaceholders})`, orderIds);
    const [reviewDel] = await pool.query(`DELETE FROM ${DB.PRODUCT}.product_reviews WHERE order_id IN (${orderPlaceholders})`, orderIds);
    reviewsDeleted = reviewDel.affectedRows;
    const [orderDel] = await pool.query(`DELETE FROM ${DB.ORDER}.orders WHERE id IN (${orderPlaceholders})`, orderIds);
    ordersDeleted = orderDel.affectedRows;
  }

  const [eventsResult] = await pool.query(
    `DELETE FROM ${DB.ORDER}.user_events WHERE user_id IN (${placeholders})`,
    userIds
  );

  const [usersResult] = await pool.query(
    `DELETE FROM ${DB.USER}.users WHERE email LIKE ?`,
    [`%@${SYNTHETIC_EMAIL_DOMAIN}`]
  );

  return {
    usersDeleted: usersResult.affectedRows,
    ordersDeleted,
    eventsDeleted: eventsResult.affectedRows,
    reviewsDeleted,
  };
}
