import { query, DB } from "./db.mjs";

/** Nạp catalog sản phẩm thật (đã import qua tools/catalog-import) để gắn order/event vào đúng
 * sản phẩm/category có thật, thay vì bịa product_id không tồn tại. */
export async function loadCatalog() {
  const products = await query(
    `SELECT id, name, category_id AS categoryId, price
     FROM ${DB.PRODUCT}.products
     WHERE active = 1`
  );
  if (products.length === 0) {
    throw new Error(
      `Không tìm thấy sản phẩm active nào trong ${DB.PRODUCT}.products. ` +
        `Chạy tools/catalog-import trước khi seed dữ liệu hành vi/đơn hàng.`
    );
  }

  const byCategory = new Map();
  for (const p of products) {
    const list = byCategory.get(p.categoryId) || [];
    list.push(p);
    byCategory.set(p.categoryId, list);
  }

  const categoryIds = [...byCategory.keys()];

  return { products, byCategory, categoryIds };
}
