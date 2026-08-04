import mysql from "mysql2/promise";

// Cùng 1 server MariaDB, nhiều DB phân biệt bằng tên — giống tools/data-seed/lib/db.mjs.
export const DB = {
  USER: process.env.DB_USER_NAME || "ecommerce_user_db",
  PRODUCT: process.env.DB_PRODUCT_NAME || "ecommerce_product_db",
  ORDER: process.env.DB_ORDER_NAME || "ecommerce_order_db",
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
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/** Bulk insert theo batch — xem ghi chú đầy đủ ở tools/data-seed/lib/db.mjs (nguồn gốc pattern này). */
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
