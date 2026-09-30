import { Rng } from "../lib/random.mjs";

/** Catalog giả CÙNG HÌNH DẠNG catalog thật (80 category, kích thước lệch nhau — catalog thật:
 * 32.593 SP, category nhỏ nhất 1 SP, lớn nhất 2.999 SP) nhưng nhỏ hơn để test chạy nhanh, không cần DB.
 * `sizes` cho phép test edge-case (vd category chỉ 1 sản phẩm). */
export function makeCatalog({ nCategories = 80, seed = 7, sizes = null } = {}) {
  const rng = new Rng(seed);
  const products = [];
  let id = 1;
  for (let c = 1; c <= nCategories; c++) {
    const size = sizes ? sizes[(c - 1) % sizes.length] : Math.max(1, Math.round(rng.lognormal(Math.log(60), 1.0)));
    for (let i = 0; i < size; i++) {
      products.push({ id: id, name: `P${id}`, categoryId: c, price: 100000 + (id % 50) * 37000 });
      id++;
    }
  }
  const byCategory = new Map();
  const byId = new Map();
  for (const p of products) {
    if (!byCategory.has(p.categoryId)) byCategory.set(p.categoryId, []);
    byCategory.get(p.categoryId).push(p);
    byId.set(p.id, p);
  }
  return { products, byCategory, byId, categoryIds: [...byCategory.keys()] };
}
