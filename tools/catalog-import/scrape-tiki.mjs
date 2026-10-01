#!/usr/bin/env node
/**
 * Lấy catalog ĐA NGÀNH từ API công khai của Tiki → manifest cùng định dạng `manifests/*.json`
 * (attributes, categories, categoryAttributes, brands, products) để `setup.mjs --dir manifests-tiki` import.
 *
 * Điều khoản (đã rà 2026-10-01, xem docs/canvas/multi-category-audit.md): robots.txt của Tiki KHÔNG cấm
 * các API dùng ở đây; Điều khoản sử dụng mục 5 cấm phân phối/khai thác thương mại hình ảnh, văn bản khi
 * chưa có văn bản cho phép — chủ dự án chấp nhận rủi ro, dùng phi thương mại cho đồ án, ghi nguồn
 * "Nguồn: Tiki.vn" ở mọi mô tả. Vì vậy:
 *   - chỉ gọi tuần tự, chậm (mặc định ~1 request/giây), lùi lại khi bị 429/5xx;
 *   - cache MỌI phản hồi vào data/tiki-cache (chạy lại không gọi lại Tiki);
 *   - KHÔNG commit dữ liệu Tiki (manifests-tiki/ và data/ đều gitignore).
 *
 *   node scrape-tiki.mjs                              # 12 ngành gốc × 600 SP (mặc định)
 *   node scrape-tiki.mjs --per-root 20 --roots 1789,931   # chạy thử nhỏ
 *   node scrape-tiki.mjs --offline                    # chỉ dựng lại manifest từ cache, không gọi mạng
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mạng đi qua proxy (vd proxy công ty): curl tự dùng HTTPS_PROXY nhưng fetch của Node thì không
// (UND_ERR_CONNECT_TIMEOUT) — Node ≥ 24 dùng proxy khi có NODE_USE_ENV_PROXY=1 → tự chạy lại với cờ đó.
if ((process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}

// 12 ngành gốc (id Tiki → icon Material Symbols cho FE). Bỏ: Hàng quốc tế, Voucher, NGON (giao đồ ăn).
const ROOTS = [
  { id: 1883, icon: "chair" },              // Nhà Cửa - Đời Sống
  { id: 1789, icon: "smartphone" },         // Điện Thoại - Máy Tính Bảng
  { id: 2549, icon: "child_care" },         // Đồ Chơi - Mẹ & Bé
  { id: 1815, icon: "headphones" },         // Thiết Bị Số - Phụ Kiện Số
  { id: 1882, icon: "kitchen" },            // Điện Gia Dụng
  { id: 1520, icon: "spa" },                // Làm Đẹp - Sức Khỏe
  { id: 931, icon: "checkroom" },           // Thời trang nữ
  { id: 915, icon: "checkroom" },           // Thời trang nam
  { id: 4384, icon: "restaurant" },         // Bách Hóa Online
  { id: 1975, icon: "sports_soccer" },      // Thể Thao - Dã Ngoại
  { id: 1846, icon: "laptop" },             // Laptop - Máy Vi Tính - Linh kiện
  { id: 8322, icon: "menu_book" },          // Nhà Sách Tiki
];

// Mã spec Tiki không đưa vào thuộc tính (đã có trường riêng / vô nghĩa với người mua).
const SKIP_SPEC_CODES = new Set([
  "brand", "sku", "is_warranty_applied", "vat_taxable", "warranty_form", "warranty_time_period",
  "warranty_location", "item_model_number", "product_top_brand", "is_fresh", "inventory_type",
]);
const NO_BRAND = new Set(["oem", "no-brand", "nobrand", "none", "khong-thuong-hieu", "chua-co-thuong-hieu"]);
const MAX_SPEC_ATTRS_PER_CATEGORY = 10;
const MAX_VARIANTS = 30;
const MAX_IMAGES = 5;
const ATTRIBUTION = "Nguồn: Tiki.vn";

function parseArgs(argv) {
  const a = { perRoot: 600, children: 8, delay: 900, out: "manifests-tiki", cache: "../../data/tiki-cache", offline: false, roots: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--per-root") a.perRoot = Number(argv[++i]);
    else if (k === "--children") a.children = Number(argv[++i]);
    else if (k === "--delay") a.delay = Number(argv[++i]);
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--cache") a.cache = argv[++i];
    else if (k === "--roots") a.roots = argv[++i].split(",").map(Number);
    else if (k === "--offline") a.offline = true;
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const CACHE = path.resolve(__dirname, args.cache);
const OUT = path.resolve(__dirname, args.out);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36";
let netRequests = 0;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON có cache trên đĩa + giãn cách + lùi lại khi 429/5xx/lỗi mạng. */
async function getJson(url, cacheKey) {
  const file = path.join(CACHE, `${cacheKey}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  if (args.offline) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = lastRequestAt + args.delay + Math.random() * 300 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    netRequests++;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        const backoff = 5000 * 2 ** attempt;
        console.warn(`  HTTP ${res.status} → chờ ${backoff / 1000}s rồi thử lại: ${url}`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + ".tmp", JSON.stringify(data));
      fs.renameSync(file + ".tmp", file); // ghi nguyên tử: bị ngắt không để lại cache hỏng
      return data;
    } catch (e) {
      const backoff = 3000 * 2 ** attempt;
      console.warn(`  lỗi ${e.message} → chờ ${backoff / 1000}s: ${url}`);
      await sleep(backoff);
    }
  }
  throw new Error(`Thất bại sau 5 lần: ${url}`);
}

function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Đoạn chữ mẫu Tiki tự chèn cuối mọi mô tả (thuế, phí ship) — không phải mô tả sản phẩm.
const TIKI_BOILERPLATE = /Giá sản phẩm trên Tiki đã bao gồm thuế[\s\S]*$/i;

function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/ /g, " ")                 // dấu cách không ngắt (Tiki dùng tràn lan)
    .replace(TIKI_BOILERPLATE, "")
    .replace(/[ \t]+/g, " ").replace(/•\s*\n\s*/g, "• ").replace(/\n\s*\n+/g, "\n").trim();
}

const clean = (s, max) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Tên trục biến thể Tiki ("Màu sắc", "Chọn màu:", "Bảng size", "Dung lượng"...) → mã thuộc tính dùng chung.
 * So trên chữ CÓ DẤU: "màu" (color) khác "mẫu" (kiểu dáng) — bỏ dấu thì cả hai thành "mau". */
function axisCode(name) {
  const n = String(name || "").normalize("NFC").toLowerCase(); // Tiki có tên trục dạng NFD (dấu tách rời)
  if (/màu|colou?r/.test(n)) return "color";
  if (/kích thước|kích cỡ|size|\bcỡ\b/.test(n)) return "size";
  if (/dung lượng|bộ nhớ|storage/.test(n)) return "storage";
  return `opt_${slugify(name).replace(/-/g, "_")}`.slice(0, 40);
}

function prices(price, original) {
  const p = Number(price) || 0;
  const o = Number(original) || 0;
  if (o > p && p > 0) return { price: o, salePrice: p };
  return { price: p, salePrice: null };
}

function warrantyMonths(detail) {
  const row = (detail.warranty_info || []).find((w) => /thời gian bảo hành/i.test(w.name || ""));
  if (!row) return 0;
  const m = String(row.value || "").match(/(\d+)\s*(tháng|năm)/i);
  if (!m) return 0;
  return /năm/i.test(m[2]) ? Number(m[1]) * 12 : Number(m[1]);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const menu = await getJson("https://api.tiki.vn/raiden/v2/menu-config?platform=desktop", "menu/menu-config");
  const menuById = new Map((menu?.menu_block?.items || []).map((it) => {
    const m = String(it.link || "").match(/\/([^/]+)\/c(\d+)/);
    return m ? [Number(m[2]), { slug: m[1], name: it.text, iconUrl: it.icon_url }] : [null, null];
  }));

  const roots = args.roots ? ROOTS.filter((r) => args.roots.includes(r.id)) : ROOTS;
  const seenProductIds = new Set();
  const popularity = {};
  const summary = [];

  for (const root of roots) {
    const meta = menuById.get(root.id);
    if (!meta) { console.warn(`Bỏ qua root ${root.id}: không có trong menu Tiki`); continue; }
    console.log(`\n=== ${meta.name} (c${root.id})`);
    const cats = await getJson(`https://tiki.vn/api/v2/categories?parent_id=${root.id}`, `categories/parent-${root.id}`);
    const children = (cats?.data || [])
      .filter((c) => c.status === "active" && c.include_in_menu !== false && c.product_count > 0)
      .sort((a, b) => b.product_count - a.product_count)
      .slice(0, args.children);
    const quota = Math.ceil(args.perRoot / Math.max(children.length, 1));

    // 1) Danh sách SP bán chạy theo từng danh mục con
    const picks = [];
    for (const child of children) {
      let got = 0;
      for (let page = 1; got < quota && page <= 10; page++) {
        const list = await getJson(
          `https://tiki.vn/api/personalish/v1/blocks/listings?limit=40&category=${child.id}&page=${page}&sort=top_seller`,
          `listings/c${child.id}-p${page}`,
        );
        const items = list?.data || [];
        if (items.length === 0) break;
        for (const it of items) {
          if (got >= quota) break;
          if (seenProductIds.has(it.id) || !(it.price > 0)) continue;
          seenProductIds.add(it.id);
          picks.push({ id: it.id, child });
          got++;
        }
      }
      console.log(`  ${child.name}: ${got} SP`);
    }

    // 2) Chi tiết từng SP → manifest
    const rootSlug = meta.slug;
    const categories = [{ slug: rootSlug, name: meta.name, parentSlug: null, sortOrder: ROOTS.indexOf(root) + 1, active: true, imageUrl: meta.iconUrl || "", icon: root.icon }];
    children.forEach((c, i) => categories.push({ slug: c.url_key, name: c.name, parentSlug: rootSlug, sortOrder: i + 1, active: true, imageUrl: "", icon: root.icon }));

    const attributes = new Map();      // code → {code,name,valueType,isColor,allowedValues}
    const specFreq = new Map();        // childSlug → Map(code → count)
    const variantAxes = new Map();     // childSlug → Set(code)
    const brands = new Map();
    const products = [];
    const usedSlugs = new Set();
    let done = 0;

    for (const { id, child } of picks) {
      const d = await getJson(`https://tiki.vn/api/v2/products/${id}`, `products/${id}`);
      done++;
      if (done % 50 === 0) console.log(`  chi tiết ${done}/${picks.length} (request mạng: ${netRequests})`);
      if (!d || !(d.price > 0) || !d.name) continue;
      const childSlug = child.url_key;

      // thương hiệu
      let brandSlug = null;
      const bslug = slugify(d.brand?.slug || d.brand?.name);
      if (bslug && !NO_BRAND.has(bslug)) {
        brandSlug = bslug;
        const b = brands.get(bslug) || { slug: bslug, name: d.brand.name, logoUrl: "", description: `${d.brand.name} — ${ATTRIBUTION}`, active: true, categorySlugs: [rootSlug] };
        if (!b.categorySlugs.includes(childSlug)) b.categorySlugs.push(childSlug);
        brands.set(bslug, b);
      }

      // thông số (EAV)
      const specs = {};
      const specsRaw = {};
      for (const g of d.specifications || []) {
        for (const at of g.attributes || []) {
          if (!at.code || SKIP_SPEC_CODES.has(at.code)) continue;
          const val = htmlToText(at.value).slice(0, 300);
          if (!val) continue;
          const code = slugify(at.code).replace(/-/g, "_").slice(0, 50);
          specs[code] = val;
          specsRaw[clean(at.name, 100) || code] = val;
          if (!attributes.has(code)) attributes.set(code, { code, name: clean(at.name, 100) || code, valueType: "text", isColor: false, allowedValues: null });
          const f = specFreq.get(childSlug) || new Map();
          f.set(code, (f.get(code) || 0) + 1);
          specFreq.set(childSlug, f);
        }
      }

      // biến thể
      const axes = (d.configurable_options || []).map((o) => ({ key: o.code, code: axisCode(o.name), name: o.name }));
      const seenCodes = new Set();
      for (const ax of axes) { while (seenCodes.has(ax.code)) ax.code += "_2"; seenCodes.add(ax.code); }
      for (const ax of axes) {
        if (!attributes.has(ax.code)) {
          attributes.set(ax.code, {
            code: ax.code,
            name: ax.code === "color" ? "Màu sắc" : ax.code === "size" ? "Kích thước" : ax.code === "storage" ? "Dung lượng" : ax.name,
            valueType: "select", isColor: ax.code === "color",
            allowedValues: null, // null = giữ danh sách sẵn có (vd bảng màu+hex của "color"), không ghi đè
          });
        }
        const s = variantAxes.get(childSlug) || new Set();
        s.add(ax.code);
        variantAxes.set(childSlug, s);
      }
      const variants = (d.configurable_products || [])
        .filter((v) => v.inventory_status !== "discontinued" && Number(v.price) > 0)
        .slice(0, MAX_VARIANTS)
        .map((v) => {
          const options = {};
          for (const ax of axes) if (clean(v[ax.key], 100)) options[ax.code] = clean(v[ax.key], 100);
          const pr = prices(v.price, v.original_price);
          return {
            sku: `TK${v.id}`,
            price: pr.price, salePrice: pr.salePrice, costPrice: Math.round(Number(v.price) * 0.7),
            imageUrl: v.images?.[0]?.large_url || v.images?.[0]?.medium_url || v.thumbnail_url || "",
            active: true, options,
          };
        });

      // slug duy nhất, gọn
      let slug = slugify(d.url_key || d.name).replace(/-p\d+$/, "").slice(0, 150) + `-tk${d.id}`;
      while (usedSlugs.has(slug)) slug += "-x";
      usedSlugs.add(slug);

      const pr = prices(d.price, d.original_price);
      // large_url (~1200px) — medium_url chỉ ~300px, trang chi tiết bị mờ
      const imgs = (d.images || []).map((im) => im.large_url || im.base_url || im.medium_url).filter(Boolean).slice(0, MAX_IMAGES);
      const months = warrantyMonths(d);
      const desc = htmlToText(d.description || d.short_description).slice(0, 4000);
      products.push({
        slug, name: clean(d.name, 250), categorySlug: childSlug, brandSlug,
        description: `${desc}${desc ? "\n\n" : ""}${ATTRIBUTION}`,
        price: pr.price, salePrice: pr.salePrice, costPrice: Math.round(Number(d.price) * 0.7),
        imageUrl: imgs[0] || d.thumbnail_url || "", images: imgs,
        status: "PUBLISHED", active: true,
        warrantyPeriod: months,
        warrantyPolicy: months > 0 ? `Bảo hành ${months} tháng (theo thông tin trên Tiki.vn).` : "",
        specs, specsRaw, tags: [], variants,
      });
      popularity[slug] = {
        tikiId: d.id, root: rootSlug, category: childSlug,
        quantitySold: d.quantity_sold?.value ?? d.all_time_quantity_sold ?? 0,
        rating: d.rating_average ?? 0, reviewCount: d.review_count ?? 0,
      };
    }

    // thuộc tính theo danh mục: trục biến thể (isVariant) + tối đa N thông số phổ biến nhất
    const categoryAttributes = [];
    const usedCodes = new Set();
    for (const c of children) {
      const axesSet = variantAxes.get(c.url_key) || new Set();
      for (const code of axesSet) { categoryAttributes.push({ categorySlug: c.url_key, attributeCode: code, isVariant: true, isRequired: false }); usedCodes.add(code); }
      const top = [...(specFreq.get(c.url_key) || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SPEC_ATTRS_PER_CATEGORY);
      for (const [code] of top) if (!axesSet.has(code)) { categoryAttributes.push({ categorySlug: c.url_key, attributeCode: code, isVariant: false, isRequired: false }); usedCodes.add(code); }
    }
    // giữ mọi thuộc tính SP đang dùng (specs ngoài top-N vẫn hiện ở bảng thông số qua specsRaw)
    for (const p of products) { Object.keys(p.specs).forEach((c) => usedCodes.add(c)); p.variants.forEach((v) => Object.keys(v.options).forEach((c) => usedCodes.add(c))); }

    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      note: `Catalog đa ngành từ API công khai Tiki.vn (root c${root.id}: ${meta.name}). Dùng phi thương mại cho đồ án. ${ATTRIBUTION}`,
      attributes: [...attributes.values()].filter((a) => usedCodes.has(a.code)),
      categories,
      categoryAttributes,
      brands: [...brands.values()],
      products,
    };
    const errors = validateManifest(manifest);
    if (errors.length) {
      console.error(`  ✗ ${errors.length} lỗi kiểm tra (theo đúng luật backend):`, errors.slice(0, 10));
      process.exitCode = 1;
    }
    const file = path.join(OUT, `tiki-${rootSlug}.json`);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    summary.push({ root: meta.name, file: path.basename(file), categories: categories.length, products: products.length, brands: brands.size, attributes: manifest.attributes.length, errors: errors.length });
    console.log(`  → ${path.basename(file)}: ${products.length} SP, ${brands.size} thương hiệu, ${manifest.attributes.length} thuộc tính, lỗi kiểm tra: ${errors.length}`);
  }

  fs.writeFileSync(path.join(OUT, "_popularity.json"), JSON.stringify(popularity, null, 1));
  console.log("\n=== Tổng kết");
  console.table(summary);
  console.log(`Request mạng thực tế: ${netRequests} (phần còn lại lấy từ cache ${CACHE})`);
}

/** Đúng các luật của CatalogImportServiceImpl.validateManifest — bắt lỗi trước khi gửi backend. */
function validateManifest(m) {
  const errs = [];
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  const attrCodes = new Set();
  for (const a of m.attributes) { if (!a.code) errs.push("attribute.code trống"); if (attrCodes.has(norm(a.code))) errs.push(`Trùng attribute ${a.code}`); attrCodes.add(norm(a.code)); }
  const catSlugs = new Set();
  for (const c of m.categories) { if (!c.slug) errs.push("category.slug trống"); if (catSlugs.has(norm(c.slug))) errs.push(`Trùng category ${c.slug}`); catSlugs.add(norm(c.slug)); }
  for (const c of m.categories) if (c.parentSlug && !catSlugs.has(norm(c.parentSlug))) errs.push(`Category ${c.slug} trỏ parent lạ ${c.parentSlug}`);
  const brandSlugs = new Set();
  for (const b of m.brands) { if (brandSlugs.has(norm(b.slug))) errs.push(`Trùng brand ${b.slug}`); brandSlugs.add(norm(b.slug)); for (const cs of b.categorySlugs) if (!catSlugs.has(norm(cs))) errs.push(`Brand ${b.slug} trỏ category lạ ${cs}`); }
  for (const ca of m.categoryAttributes) { if (!catSlugs.has(norm(ca.categorySlug))) errs.push(`CategoryAttribute category lạ ${ca.categorySlug}`); if (!attrCodes.has(norm(ca.attributeCode))) errs.push(`CategoryAttribute attribute lạ ${ca.attributeCode}`); }
  const pSlugs = new Set();
  const skus = new Set();
  for (const p of m.products) {
    if (pSlugs.has(norm(p.slug))) errs.push(`Trùng product ${p.slug}`); pSlugs.add(norm(p.slug));
    if (!catSlugs.has(norm(p.categorySlug))) errs.push(`Product ${p.slug} category lạ`);
    if (p.brandSlug && !brandSlugs.has(norm(p.brandSlug))) errs.push(`Product ${p.slug} brand lạ`);
    if (!(p.price > 0)) errs.push(`Product ${p.slug} price <= 0`);
    if (p.salePrice != null && p.salePrice >= p.price) errs.push(`Product ${p.slug} salePrice >= price`);
    for (const v of p.variants) { if (!v.sku) errs.push(`SKU trống ở ${p.slug}`); if (skus.has(norm(v.sku))) errs.push(`Trùng SKU ${v.sku}`); skus.add(norm(v.sku)); }
  }
  return errs;
}

main().catch((e) => { console.error("Lỗi:", e); process.exitCode = 1; });
