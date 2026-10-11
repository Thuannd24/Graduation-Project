import { query, getPool, DB } from "./db.mjs";
import { SYNTHETIC_EMAIL_DOMAIN } from "./users.mjs";

/** DELETE theo LÔ id, mỗi lô 1 transaction riêng. Bản cũ xoá 1 câu `WHERE user_id IN (<mọi user>)`
 * — với 19 hành vi (~1.500 sự kiện/user), 2.000 user = ~3,1 triệu dòng trong 1 transaction duy nhất:
 * đo được ~44K dòng/phút trên MariaDB dev (Docker), tức hơn 1 giờ chỉ để dọn, và kill giữa chừng thì
 * rollback lâu tương đương. Lô nhỏ giữ mỗi transaction vài chục nghìn dòng. */
async function deleteInBatches(pool, sqlWithInPlaceholder, ids, batchSize) {
  let affected = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const sql = sqlWithInPlaceholder.replace("(?)", `(${batch.map(() => "?").join(",")})`);
    const [res] = await pool.query(sql, batch);
    affected += res.affectedRows;
  }
  return affected;
}

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
    await deleteInBatches(pool, `DELETE FROM ${DB.ORDER}.order_items WHERE order_id IN (?)`, orderIds, 1000);
    ordersDeleted = await deleteInBatches(pool, `DELETE FROM ${DB.ORDER}.orders WHERE id IN (?)`, orderIds, 1000);
  }

  // ~1.500 sự kiện/user → lô 20 user ≈ 30K dòng/transaction
  const eventsDeleted = await deleteInBatches(
    pool, `DELETE FROM ${DB.ORDER}.user_events WHERE user_id IN (?)`, userIds, 20
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
    eventsDeleted,
    reviewsDeleted: reviewsResult.affectedRows,
    vouchersDeleted: vouchersResult.affectedRows,
  };
}
