import mysql from "mysql2/promise";

// 3 database (user/product/order) sống trên CÙNG 1 MariaDB server (xem
// BE/docker-compose-infra.yml: 1 container `infra-mariadb` duy nhất, phân biệt bằng tên DB) —
// nên chỉ cần 1 connection pool, không set `database` mặc định, luôn tham chiếu đầy đủ
// `<db>.<table>` để không nhầm lẫn và không cần 3 pool riêng.
export const DB = {
  USER: process.env.DB_USER_NAME || "ecommerce_user_db",
  PRODUCT: process.env.DB_PRODUCT_NAME || "ecommerce_product_db",
  ORDER: process.env.DB_ORDER_NAME || "ecommerce_order_db",
  PROMOTION: process.env.DB_PROMOTION_NAME || "ecommerce_promotion_db",
};

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3308),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "root",
      waitForConnections: true,
      connectionLimit: 10,
      // Cho phép chạy nhiều statement INSERT gộp trong 1 lần execute() khi cần bulk insert.
      multipleStatements: false,
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/** Bulk insert hiệu quả hơn nhiều so với execute() từng dòng — dùng cho hàng nghìn order/event.
 * Tự chia batch (mặc định 500 dòng/lần) để tránh vượt giới hạn placeholder/packet size của
 * prepared statement khi insert hàng chục nghìn user_events cùng lúc. */
export async function bulkInsert(table, columns, rows, batchSize = 500) {
  if (rows.length === 0) return;
  const placeholder = `(${columns.map(() => "?").join(",")})`;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${batch.map(() => placeholder).join(",")}`;
    await getPool().execute(sql, batch.flat());
  }
}

export async function closePool() {
  if (pool) await pool.end();
}
