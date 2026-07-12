const SLUG_ALIASES = {
  mobile: ["dien-thoai", "phone", "mobile", "điện thoại"],
  laptop: ["laptop", "macbook"],
  tablet: ["tablet", "ipad"],
  audio: ["audio", "am-thanh", "tai-nghe", "âm thanh"],
  wearable: ["wearable", "dong-ho", "smartwatch", "đồng hồ"],
  camera: ["camera"],
  gaming: ["gaming"],
  network: ["network", "wifi", "router"],
  accessories: ["phu-kien", "accessory", "phụ kiện"],
};

export const PRICE_PRESETS = [
  { label: "Tất cả", min: 0, max: 50000000 },
  { label: "Dưới 10 triệu", min: 0, max: 10000000 },
  { label: "10 – 20 triệu", min: 10000000, max: 20000000 },
  { label: "20 – 30 triệu", min: 20000000, max: 30000000 },
  { label: "Trên 30 triệu", min: 30000000, max: 50000000 },
];

export const LAPTOP_SPEC_FILTERS = {
  ram: { label: "Dung lượng RAM", options: ["8 GB", "12 GB", "16 GB", "32 GB"] },
  processor: { label: "Vi xử lý", options: ["Intel Core i5", "Intel Core i7", "Intel Core i9", "AMD Ryzen 9"] },
  cpuBrand: { label: "Thương hiệu CPU", options: ["Intel", "AMD", "Apple", "NVIDIA"] },
  drive: { label: "Dung lượng ổ cứng", options: ["128GB", "256GB", "512GB", "1TB"] },
};

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

  let cat = flatCategories.find((c) => matchesSlugOrName(c, slug));

  if (!cat) {
    const key = slug.toLowerCase();
    const aliases = SLUG_ALIASES[key] || [];
    cat = flatCategories.find((c) =>
      aliases.some(
        (a) =>
          c.slug?.toLowerCase().includes(a) ||
          c.name?.toLowerCase().includes(a)
      )
    );
  }

  if (subSlug && cat?.children?.length) {
    const sub = cat.children.find((s) => matchesSlugOrName(s, subSlug));
    if (sub) return { parent: cat, category: sub };
  }

  return cat ? { parent: cat.parentId ? null : cat, category: cat } : null;
}

export function isLaptopCategory(category) {
  const slug = (category?.slug || category?.name || "").toLowerCase();
  return slug.includes("laptop") || slug.includes("macbook");
}

export function matchesLegacyCategory(product, slug) {
  const cat = String(product.category || "").toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const key = (slug || "").toLowerCase();

  const rules = {
    mobile: () =>
      cat.includes("phone") ||
      cat.includes("điện thoại") ||
      name.includes("iphone") ||
      name.includes("samsung"),
    laptop: () =>
      cat.includes("laptop") ||
      cat.includes("macbook") ||
      name.includes("laptop") ||
      name.includes("macbook"),
    tablet: () =>
      cat.includes("tablet") ||
      cat.includes("ipad") ||
      name.includes("ipad") ||
      name.includes("tab"),
    audio: () =>
      cat.includes("audio") ||
      cat.includes("âm thanh") ||
      cat.includes("tai nghe") ||
      cat.includes("loa"),
    wearable: () =>
      cat.includes("wearable") ||
      cat.includes("đồng hồ") ||
      name.includes("watch"),
    camera: () =>
      cat.includes("camera") || name.includes("camera") || name.includes("webcam"),
    gaming: () =>
      cat.includes("gaming") || name.includes("gaming") || name.includes("chuột gaming"),
    network: () =>
      cat.includes("network") || cat.includes("wifi") || name.includes("router"),
    accessories: () =>
      cat.includes("accessory") ||
      cat.includes("phụ kiện") ||
      cat.includes("cáp") ||
      cat.includes("sạc"),
  };

  const fn = rules[key];
  return fn ? fn() : true;
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
