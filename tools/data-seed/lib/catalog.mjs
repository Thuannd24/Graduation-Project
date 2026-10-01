import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, DB } from "./db.mjs";
import { POPULARITY } from "./behaviorTargets.mjs";
import { indexCatalog, fallbackWeight } from "./catalogIndex.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_POPULARITY_FILE = path.resolve(__dirname, "../../catalog-import/manifests-tiki/_popularity.json");

/** Đọc `_popularity.json` (scrape-tiki.mjs): slug → {quantitySold, rating, reviewCount}. */
function loadPopularity(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Nạp catalog sản phẩm thật (đã import qua tools/catalog-import) để gắn order/event vào đúng
 * sản phẩm/category có thật, thay vì bịa product_id không tồn tại.
 *
 * Độ phổ biến: nếu có `_popularity.json` của catalog Tiki thì trọng số = (số đã bán thật + 1)^α
 * (α hiệu chỉnh để độ tập trung lượt xem khớp dữ liệu người dùng thật — POPULARITY trong
 * behaviorTargets.mjs); SP không có trong file → trọng số dự phòng log-normal. */
export async function loadCatalog({ popularityFile = process.env.POPULARITY_FILE || DEFAULT_POPULARITY_FILE } = {}) {
  const products = await query(
    `SELECT id, slug, name, category_id AS categoryId, price
     FROM ${DB.PRODUCT}.products
     WHERE active = 1`
  );
  if (products.length === 0) {
    throw new Error(
      `Không tìm thấy sản phẩm active nào trong ${DB.PRODUCT}.products. ` +
        `Chạy tools/catalog-import trước khi seed dữ liệu hành vi/đơn hàng.`
    );
  }

  const pop = loadPopularity(popularityFile);
  let withSales = 0;
  for (const p of products) {
    const rec = pop?.[p.slug];
    if (rec) {
      p.weight = Math.pow(Number(rec.quantitySold || 0) + 1, POPULARITY.salesAlpha);
      withSales++;
    } else {
      p.weight = fallbackWeight(p.id);
    }
  }
  const catalog = indexCatalog(products);
  catalog.popularitySource = pop
    ? `${withSales}/${products.length} SP có số đã bán thật (Tiki), còn lại log-normal dự phòng`
    : `log-normal dự phòng (không thấy ${popularityFile})`;
  return catalog;
}
