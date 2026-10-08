import { Rng } from "../lib/random.mjs";
import { indexCatalog } from "../lib/catalogIndex.mjs";
import { TARGETS, POPULARITY } from "../lib/behaviorTargets.mjs";

/** Catalog giả CÙNG HÌNH DẠNG catalog Tiki thật (đo trên manifests-tiki, 2026-10-01: 6.526 SP, 79 danh mục
 * lá cỡ 2–300, trung vị 75) nhưng không cần DB. Số đã bán giả lập 2 phần theo đúng số đo thật: tỉ lệ SP chưa
 * bán theo danh mục (TB 0,23, lệch 0,25); SP đã bán có log(số_bán + 1) TB 3,75, lệch giữa danh mục 1,41, lệch
 * trong danh mục 1,74. Trọng số đi cùng đường (số_bán + 1)^α như catalog thật. Quan trọng vì phiên duyệt bám danh mục → độ dồn lượt xem TRONG
 * danh mục quyết định recency; bản cũ dùng log-normal dự phòng σ=2 dồn quá mức (top 10% trong danh mục 0,70
 * so với thật 0,565) nên recency của test cao hơn catalog thật ~5 điểm.
 * `sizes` cho phép test edge-case (vd category chỉ 1 sản phẩm). */
export function makeCatalog({ nCategories = 80, seed = 7, sizes = null } = {}) {
  const rng = new Rng(seed);
  const products = [];
  let id = 1;
  for (let c = 1; c <= nCategories; c++) {
    const size = sizes
      ? sizes[(c - 1) % sizes.length]
      : Math.min(300, Math.max(2, Math.round(rng.lognormal(Math.log(75), 0.6))));
    const zeroP = Math.min(0.95, Math.max(0, rng.normal(0.23, 0.25)));
    const catMean = rng.normal(3.75, 1.41);
    for (let i = 0; i < size; i++) {
      // log(số_bán + 1): 0 = chưa bán; đã bán thì ≥ log 2 (bán ≥ 1)
      const logSold = rng.bool(zeroP) ? 0 : Math.max(Math.log(2), rng.normal(catMean, 1.74));
      products.push({
        id: id, name: `P${id}`, categoryId: c, price: 100000 + (id % 50) * 37000,
        weight: Math.exp(POPULARITY.salesAlpha * logSold),
      });
      id++;
    }
  }
  const catalog = indexCatalog(products);
  // Ngành gốc: gán vòng tròn 12 ngành Tiki thật (đủ để kiểm chu kỳ mua lại theo ngành).
  const roots = Object.keys(TARGETS.categoryRepurchase.relativeToGrocery);
  catalog.rootOf = new Map(catalog.categoryIds.map((c) => [c, roots[(c - 1) % roots.length]]));
  return catalog;
}
