// Mốc "không giới hạn" cho bộ lọc giá — sàn đa ngành có SP từ vài chục nghìn tới hàng chục triệu.
export const PRICE_MAX = 1000000000;

export const PRICE_PRESETS = [
  { label: "Tất cả", min: 0, max: PRICE_MAX },
  { label: "Dưới 200 nghìn", min: 0, max: 200000 },
  { label: "200 – 500 nghìn", min: 200000, max: 500000 },
  { label: "500 nghìn – 2 triệu", min: 500000, max: 2000000 },
  { label: "2 – 10 triệu", min: 2000000, max: 10000000 },
  { label: "Trên 10 triệu", min: 10000000, max: PRICE_MAX },
];

export function flattenCategories(tree) {
  const flat = [];
  const traverse = (nodes) => {
    (nodes || []).forEach((node) => {
      flat.push(node);
      if (node.children?.length) traverse(node.children);
    });
  };
  traverse(tree);
  return flat;
}

export function getRootCategories(tree) {
  return (tree || [])
    .filter((c) => c.active !== false)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function formatCategoryName(name) {
  if (!name) return "";
  const cleaned = name.trim();
  const isMixedCase = /[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned);
  if (isMixedCase) return cleaned;
  if (cleaned !== cleaned.toUpperCase()) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function matchesSlugOrName(category, slug) {
  const s = slug.toLowerCase();
  return (
    category.slug?.toLowerCase() === s ||
    category.name?.toLowerCase() === s ||
    category.slug?.toLowerCase().includes(s) ||
    category.name?.toLowerCase().includes(s)
  );
}

export function resolveCategory(flatCategories, slug, subSlug) {
  if (!slug) return null;

  const cat = flatCategories.find((c) => matchesSlugOrName(c, slug));

  if (subSlug && cat?.children?.length) {
    const sub = cat.children.find((s) => matchesSlugOrName(s, subSlug));
    if (sub) return { parent: cat, category: sub };
  }

  return cat ? { parent: cat.parentId ? null : cat, category: cat } : null;
}

export function productMatchesSpec(product, keyword) {
  const name = String(product.name || "").toLowerCase();
  const kw = keyword.toLowerCase();
  if (name.includes(kw)) return true;
  if (Array.isArray(product.specs)) {
    return product.specs.some((s) => String(s).toLowerCase().includes(kw));
  }
  return false;
}

export async function fetchAllCategoryProducts(productApi, categoryId) {
  const all = [];
  let page = 0;
  let hasNext = true;

  while (hasNext) {
    const result = await productApi.listProductsPaged({
      categoryId: String(categoryId),
      page: String(page),
      size: "50",
    });
    all.push(...result.items);
    hasNext = result.hasNext;
    page += 1;
    if (page > 20) break;
  }

  return all;
}
