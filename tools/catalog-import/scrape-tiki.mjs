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

// Bảng màu chuẩn (tên → hex): backend bắt buộc mỗi giá trị của thuộc tính màu có mã màu. Màu Tiki là chữ tự do
// do người bán nhập ("01 ĐEN", "Xanh Navy Cổ Tròn") → quy về tên chuẩn theo từ khoá; thứ tự quan trọng (cụ thể
// trước chung: "xanh lá" trước "xanh"). Giá trị không chứa từ khoá màu nào thì KHÔNG phải màu → chuyển sang
// "Phân loại", không gán màu bừa.
const COLOR_PALETTE = [
  [/xanh\s*(lá|la|rêu|reu|olive|mint|bạc hà|bac ha)/i, "Xanh lá", "#16a34a"],
  [/xanh\s*(navy|đen|đậm|dam)|navy/i, "Xanh navy", "#1e3a5f"],
  [/xanh\s*(ngọc|ngoc|cổ vịt|co vit|teal)/i, "Xanh ngọc", "#0d9488"],
  [/xanh\s*(da trời|nhạt|nhat|sky|baby)/i, "Xanh da trời", "#38bdf8"],
  [/xanh|blue/i, "Xanh dương", "#2563eb"],
  [/đen|black/i, "Đen", "#1a1a1a"],
  [/trắng|trang\b|white/i, "Trắng", "#f8fafc"],
  [/xám|xam\b|gr[ae]y|ghi/i, "Xám", "#6b7280"],
  [/bạc|silver/i, "Bạc", "#94a3b8"],
  [/đỏ|đô|red|burgundy/i, "Đỏ", "#dc2626"],
  [/hồng|hong\b|pink/i, "Hồng", "#ec4899"],
  [/tím|purple|violet|lavender/i, "Tím", "#7c3aed"],
  [/vàng|yellow|gold/i, "Vàng", "#f59e0b"],
  [/cam\b|orange/i, "Cam", "#f97316"],
  [/nâu|brown|cà phê|coffee|chocolate/i, "Nâu", "#92400e"],
  [/kem|cream|beige|\bbe\b|nude/i, "Kem", "#f5f0e1"],
  [/rêu|olive/i, "Xanh lá", "#16a34a"],
];
function canonicalColor(value) {
  const v = String(value || "").normalize("NFC");
  for (const [re, name] of COLOR_PALETTE) if (re.test(v)) return name;
  return null;
}
const CANONICAL_AXES = new Set(["color", "size", "storage"]);
const AXIS_NAMES = { color: "Màu sắc", size: "Kích thước", storage: "Dung lượng", phan_loai: "Phân loại" };

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
          const val = htmlToText(at.value).slice(0, 250); // product_attribute_values.value là varchar(255)
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

      // biến thể: chỉ giữ 3 trục CHUẨN (color/size/storage); mọi trục khác (người bán tự đặt: "Dòng iPhone",
      // "Áo nam lẻ"...— >300 kiểu) gộp vào 1 thuộc tính "Phân loại". Màu quy về bảng màu chuẩn có hex; trục màu
      // chứa giá trị không phải màu, hoặc quy chuẩn làm 2 biến thể trùng nhau → giữ chữ gốc ở "Phân loại".
      const rawVariants = (d.configurable_products || [])
        .filter((v) => v.inventory_status !== "discontinued" && Number(v.price) > 0)
        .slice(0, MAX_VARIANTS);
      const usedCanon = new Set();
      const axes = (d.configurable_options || []).map((o) => {
        const c = axisCode(o.name);
        const canon = CANONICAL_AXES.has(c) && !usedCanon.has(c);
        if (canon) usedCanon.add(c);
        return { key: o.code, code: canon ? c : "phan_loai" };
      });
      const colorAx = axes.find((a) => a.code === "color");
      if (colorAx && !rawVariants.every((v) => !clean(v[colorAx.key], 100) || canonicalColor(clean(v[colorAx.key], 100)))) {
        colorAx.code = "phan_loai";
      }
      const buildOptions = () => rawVariants.map((v) => {
        const options = {};
        const extra = [];
        for (const ax of axes) {
          const val = clean(v[ax.key], 100);
          if (!val) continue;
          if (ax.code === "phan_loai") extra.push(val);
          else options[ax.code] = ax.code === "color" ? canonicalColor(val) : val;
        }
        if (extra.length) options.phan_loai = extra.join(" / ").slice(0, 100);
        return options;
      });
      let optionList = buildOptions();
      const sig = (o) => JSON.stringify(Object.entries(o).sort());
      if (colorAx?.code === "color" && new Set(optionList.map(sig)).size < optionList.length) {
        colorAx.code = "phan_loai"; // quy chuẩn màu làm trùng tổ hợp → giữ chữ gốc
        optionList = buildOptions();
      }
      for (const code of new Set(optionList.flatMap((o) => Object.keys(o)))) {
        if (!attributes.has(code)) {
          // allowedValues điền ở bước cuối (finalizeSelectAttributes): HỢP giá trị của MỌI file — import ghi đè
          // danh sách theo từng file, mỗi file chỉ mang danh sách riêng thì mất giá trị của file khác.
          // "phan_loai": kiểu text — hợp giá trị ~5.700 mục (163KB) vượt cột TEXT 64KB của attributes.allowed_values;
          // FE dựng lựa chọn biến thể từ chính variantAttr nên không phụ thuộc kiểu thuộc tính.
          attributes.set(code, { code, name: AXIS_NAMES[code], valueType: code === "phan_loai" ? "text" : "select", isColor: code === "color", allowedValues: null });
        }
        const s = variantAxes.get(childSlug) || new Set();
        s.add(code);
        variantAxes.set(childSlug, s);
      }
      const variants = rawVariants.map((v, idx) => {
        const pr = prices(v.price, v.original_price);
        return {
          sku: `TK${v.id}`,
          price: pr.price, salePrice: pr.salePrice, costPrice: Math.round(Number(v.price) * 0.7),
          imageUrl: v.images?.[0]?.large_url || v.images?.[0]?.medium_url || v.thumbnail_url || "",
          active: true, options: optionList[idx],
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
  finalizeSelectAttributes();
  console.log("\n=== Tổng kết");
  console.table(summary);
  console.log(`Request mạng thực tế: ${netRequests} (phần còn lại lấy từ cache ${CACHE})`);
}

/** Thuộc tính dạng chọn (select): backend (AttributeServiceImpl.validateAttribute) BẮT BUỘC allowedValues là JSON
 * [{name}] không rỗng, thuộc tính màu thì mỗi phần tử có `hex` — luật này KHÔNG có trong dry-run nên lần import
 * đầu (2026-10-01) hỏng ở bước tạo thuộc tính. Gom HỢP giá trị của mọi manifest trong thư mục (import ghi đè danh
 * sách theo từng file) rồi ghi cùng 1 danh sách vào mọi file. */
function finalizeSelectAttributes() {
  const files = fs.readdirSync(OUT).filter((f) => f.startsWith("tiki-") && f.endsWith(".json"));
  const manifests = files.map((f) => [f, JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"))]);
  const values = new Map(); // code → Set
  for (const [, m] of manifests) {
    const selectCodes = new Set(m.attributes.filter((a) => a.valueType === "select").map((a) => a.code));
    for (const p of m.products) for (const v of p.variants) for (const [k, x] of Object.entries(v.options)) {
      if (!selectCodes.has(k)) continue;
      if (!values.has(k)) values.set(k, new Set());
      values.get(k).add(x);
    }
  }
  const hexOf = new Map(COLOR_PALETTE.map(([, name, hex]) => [name, hex]));
  const allowed = new Map([...values].map(([code, set]) => [code, JSON.stringify(
    [...set].sort((a, b) => a.localeCompare(b, "vi")).map((name) => (code === "color" ? { name, hex: hexOf.get(name) } : { name })),
  )]));
  const problems = [];
  for (const [f, m] of manifests) {
    for (const a of m.attributes) {
      if (a.valueType !== "select") continue;
      a.allowedValues = allowed.get(a.code) || null;
      const opts = a.allowedValues ? JSON.parse(a.allowedValues) : [];
      if (!opts.length) problems.push(`${f}: ${a.code} rỗng`);
      if (a.isColor && opts.some((o) => !o.hex)) problems.push(`${f}: màu thiếu hex`);
      const bytes = Buffer.byteLength(a.allowedValues || "", "utf8");
      if (bytes > MAX_ALLOWED_VALUES_BYTES) problems.push(`${f}: ${a.code} allowedValues ${bytes} byte > cột TEXT ${MAX_ALLOWED_VALUES_BYTES}`);
    }
    fs.writeFileSync(path.join(OUT, f), JSON.stringify(m, null, 2));
  }
  console.log(`Thuộc tính chọn (hợp ${files.length} file): ` + [...values].map(([c, s]) => `${c}=${s.size}`).join(", "));
  if (problems.length) { console.error("✗ Thuộc tính chọn sai luật backend:", problems.slice(0, 10)); process.exitCode = 1; }
}

// Giới hạn cột DB mà backend KHÔNG kiểm trước — vượt là cả giao dịch import (~5 phút/file) rollback ở cuối.
const MAX_ATTR_VALUE = 255;          // product_attribute_values.value varchar(255)
const MAX_ALLOWED_VALUES_BYTES = 65535; // attributes.allowed_values TEXT

/** Đúng các luật của CatalogImportServiceImpl.validateManifest — bắt lỗi trước khi gửi backend — cộng giới hạn
 * cột DB đã làm hỏng lần import đầu (2026-10-01). Luật allowedValues của thuộc tính chọn kiểm ở
 * finalizeSelectAttributes (cần hợp mọi file). */
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
    for (const v of p.variants) {
      if (!v.sku) errs.push(`SKU trống ở ${p.slug}`); if (skus.has(norm(v.sku))) errs.push(`Trùng SKU ${v.sku}`); skus.add(norm(v.sku));
      for (const [k, x] of Object.entries(v.options || {})) if (String(x).length > MAX_ATTR_VALUE) errs.push(`${p.slug} biến thể ${k} dài ${String(x).length} > ${MAX_ATTR_VALUE}`);
    }
    for (const [k, x] of Object.entries(p.specs || {})) if (String(x).length > MAX_ATTR_VALUE) errs.push(`${p.slug} thông số ${k} dài ${String(x).length} > ${MAX_ATTR_VALUE}`);
  }
  return errs;
}

main().catch((e) => { console.error("Lỗi:", e); process.exitCode = 1; });
