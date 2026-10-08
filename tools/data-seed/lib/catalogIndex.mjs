// Phần THUẦN của catalog (không đụng DB) — dùng chung cho loadCatalog (DB thật) và catalog giả trong test.
import { POPULARITY } from "./behaviorTargets.mjs";

/** Số ngẫu nhiên tất định theo id (không phụ thuộc thứ tự duyệt) — dùng cho trọng số dự phòng. */
function hashUnit(id) {
  let h = (Number(id) * 2654435761) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Trọng số dự phòng khi không có dữ liệu bán thật: log-normal tất định theo id (đuôi dài, tái lập được). */
export function fallbackWeight(id, sigma = POPULARITY.fallbackSigma) {
  const u1 = Math.max(hashUnit(id), 1e-12);
  const u2 = hashUnit(Number(id) + 0x9e3779b9);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(sigma * z);
}

/** Dựng chỉ mục catalog + mảng trọng số TÍCH LUỸ (toàn catalog và theo category) để chọn sản phẩm
 * theo độ phổ biến bằng tìm kiếm nhị phân — O(log n) mỗi lượt chọn. Mỗi product cần `weight` > 0
 * (thiếu thì coi là 1 = chọn đều như bản cũ). Dùng chung cho catalog thật (DB) và catalog giả (test). */
export function indexCatalog(products) {
  const byCategory = new Map();
  const byId = new Map();
  for (const p of products) {
    if (!(p.weight > 0)) p.weight = 1;
    const list = byCategory.get(p.categoryId) || [];
    list.push(p);
    byCategory.set(p.categoryId, list);
    byId.set(p.id, p);
  }
  const cumOf = (list) => {
    const cum = new Float64Array(list.length);
    let s = 0;
    list.forEach((p, i) => { s += p.weight; cum[i] = s; });
    return cum;
  };
  const cumByCategory = new Map([...byCategory].map(([c, list]) => [c, cumOf(list)]));
  return { products, byCategory, byId, categoryIds: [...byCategory.keys()], cum: cumOf(products), cumByCategory };
}

/** Chọn 1 phần tử của `list` theo trọng số tích luỹ `cum` (cùng thứ tự). */
export function pickWeighted(rng, list, cum) {
  const r = rng.next() * cum[cum.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] > r) hi = mid; else lo = mid + 1;
  }
  return list[lo];
}
