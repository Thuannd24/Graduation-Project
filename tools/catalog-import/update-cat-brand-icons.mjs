/**
 * Cập nhật icon danh mục và logo brand trong DB thông qua API import
 * node update-cat-brand-icons.mjs --token <ADMIN_TOKEN>
 */

const BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/api/v1";
const TOKEN = process.argv[process.argv.indexOf("--token") + 1] || process.env.ADMIN_TOKEN;

if (!TOKEN) { console.error("Thiếu --token"); process.exit(1); }

// SVG icons thực từ cellphones.com.vn sidebar navigation
const NAV_ICON = "https://dashboard.cellphones.com.vn/storage";

// Logo brand dùng direct URL (PNG, không qua CDN resize)
const BRAND_LOGO = "https://cellphones.com.vn/media/wysiwyg/Web/Brand";

const manifest = {
  attributes: [],
  categories: [
    // ── Root categories ────────────────────────────────────────────────────────
    { slug: "dien-thoai",      name: "Điện thoại, Tablet",   imageUrl: `${NAV_ICON}/icon-homepage-mobile.svg`,       sortOrder: 1, active: true },
    { slug: "laptop",          name: "Laptop",               imageUrl: `${NAV_ICON}/icon-homepage-laptop.svg`,       sortOrder: 2, active: true },
    { slug: "tai-nghe",        name: "Âm thanh, Mic thu âm", imageUrl: `${NAV_ICON}/icon-homepage-audio-2.svg`,      sortOrder: 3, active: true },
    { slug: "dong-ho",         name: "Đồng hồ, Camera",      imageUrl: `${NAV_ICON}/icon-homepage-watch.svg`,        sortOrder: 4, active: true },
    { slug: "phu-kien",        name: "Phụ kiện",             imageUrl: `${NAV_ICON}/icon-homepage-accessories.svg`,  sortOrder: 5, active: true },
    { slug: "man-hinh",        name: "PC, Màn hình, Máy in", imageUrl: `${NAV_ICON}/icon-homepage-pc.svg`,           sortOrder: 6, active: true },
    // ── Điện thoại sub ────────────────────────────────────────────────────────
    { slug: "iphone",          name: "iPhone",               imageUrl: `${NAV_ICON}/icon-homepage-mobile.svg`,       sortOrder: 1, parentSlug: "dien-thoai", active: true },
    { slug: "samsung-phone",   name: "Samsung",              imageUrl: `${NAV_ICON}/icon-homepage-mobile.svg`,       sortOrder: 2, parentSlug: "dien-thoai", active: true },
    { slug: "xiaomi-phone",    name: "Xiaomi",               imageUrl: `${NAV_ICON}/icon-homepage-mobile.svg`,       sortOrder: 3, parentSlug: "dien-thoai", active: true },
    { slug: "oppo-phone",      name: "OPPO",                 imageUrl: `${NAV_ICON}/icon-homepage-mobile.svg`,       sortOrder: 4, parentSlug: "dien-thoai", active: true },
    { slug: "tablet",          name: "Máy tính bảng",        imageUrl: `${NAV_ICON}/icon-homepage-mobile.svg`,       sortOrder: 5, parentSlug: "dien-thoai", active: true },
    // ── Âm thanh sub ──────────────────────────────────────────────────────────
    { slug: "tai-nghe-bt",     name: "Tai nghe",             imageUrl: `${NAV_ICON}/icon-homepage-audio-2.svg`,      sortOrder: 1, parentSlug: "tai-nghe",   active: true },
    { slug: "loa",             name: "Loa",                  imageUrl: `${NAV_ICON}/icon-homepage-audio-2.svg`,      sortOrder: 2, parentSlug: "tai-nghe",   active: true },
    // ── Đồng hồ sub ───────────────────────────────────────────────────────────
    { slug: "may-anh",         name: "Máy ảnh, Máy quay",   imageUrl: `${NAV_ICON}/icon-homepage-watch.svg`,        sortOrder: 1, parentSlug: "dong-ho",    active: true },
    // ── Phụ kiện sub ──────────────────────────────────────────────────────────
    { slug: "op-lung",         name: "Ốp lưng",              imageUrl: `${NAV_ICON}/icon-homepage-accessories.svg`,  sortOrder: 1, parentSlug: "phu-kien",   active: true },
    { slug: "sac-cap",         name: "Sạc & Cáp",            imageUrl: `${NAV_ICON}/icon-homepage-accessories.svg`,  sortOrder: 2, parentSlug: "phu-kien",   active: true },
    { slug: "pin-du-phong",    name: "Pin dự phòng",         imageUrl: `${NAV_ICON}/icon-homepage-accessories.svg`,  sortOrder: 3, parentSlug: "phu-kien",   active: true },
    // ── PC, Màn hình sub ──────────────────────────────────────────────────────
    { slug: "may-tinh-de-ban", name: "PC, Máy tính để bàn", imageUrl: `${NAV_ICON}/icon-homepage-pc.svg`,           sortOrder: 1, parentSlug: "man-hinh",   active: true },
    { slug: "tivi",            name: "Tivi",                imageUrl: `${NAV_ICON}/icon-homepage-pc.svg`,           sortOrder: 7, active: true },
  ],
  categoryAttributes: [],
  brands: [
    { slug: "apple",   name: "Apple",   logoUrl: `${BRAND_LOGO}/iPhone-240x50.png`,   active: true, categorySlugs: ["iphone","dien-thoai","tablet","laptop"] },
    { slug: "samsung", name: "Samsung", logoUrl: `${BRAND_LOGO}/Samsung-240x50.png`,  active: true, categorySlugs: ["samsung-phone","dien-thoai","tablet","man-hinh","tivi"] },
    { slug: "xiaomi",  name: "Xiaomi",  logoUrl: `${BRAND_LOGO}/XIAOMI-240x50.png`,   active: true, categorySlugs: ["xiaomi-phone","dien-thoai","tablet","laptop","tivi"] },
    { slug: "oppo",    name: "OPPO",    logoUrl: `${BRAND_LOGO}/Oppo-240x50.png`,     active: true, categorySlugs: ["dien-thoai"] },
    { slug: "vivo",    name: "vivo",    logoUrl: `${BRAND_LOGO}/Vivo-240x50.png`,     active: true, categorySlugs: ["dien-thoai"] },
    { slug: "realme",  name: "realme",  logoUrl: `${BRAND_LOGO}/Realme-240x50.png`,   active: true, categorySlugs: ["dien-thoai"] },
    { slug: "honor",   name: "HONOR",   logoUrl: `${BRAND_LOGO}/Honor-240x50.png`,    active: true, categorySlugs: ["dien-thoai"] },
    { slug: "huawei",  name: "Huawei",  logoUrl: `${BRAND_LOGO}/HUAWEI-240x50.png`,   active: true, categorySlugs: ["dien-thoai"] },
    { slug: "nokia",   name: "Nokia",   logoUrl: `${BRAND_LOGO}/Nokia-240x50.png`,    active: true, categorySlugs: ["dien-thoai"] },
    { slug: "sony",    name: "Sony",    logoUrl: `${BRAND_LOGO}/SONY-240x50.png`,     active: true, categorySlugs: ["dien-thoai","tai-nghe","tivi"] },
    { slug: "asus",    name: "ASUS",    logoUrl: `${BRAND_LOGO}/ASUS-240x50.png`,     active: true, categorySlugs: ["dien-thoai","laptop"] },
    { slug: "oneplus", name: "OnePlus", logoUrl: `${BRAND_LOGO}/ONEPLUS-240x50.png`,  active: true, categorySlugs: ["dien-thoai"] },
    { slug: "tecno",   name: "Tecno",   logoUrl: `${BRAND_LOGO}/TECNO-240x50.png`,    active: true, categorySlugs: ["dien-thoai"] },
    { slug: "infinix", name: "Infinix", logoUrl: `${BRAND_LOGO}/Infinix-240x50.png`,  active: true, categorySlugs: ["dien-thoai"] },
    { slug: "nubia",   name: "Nubia",   logoUrl: `${BRAND_LOGO}/Nubia-240x50.png`,    active: true, categorySlugs: ["dien-thoai"] },
    { slug: "nothing", name: "Nothing", logoUrl: `${BRAND_LOGO}/Nothing-240x50.png`,  active: true, categorySlugs: ["dien-thoai"] },
    { slug: "masstel", name: "Masstel", logoUrl: `${BRAND_LOGO}/Mastel-240x50.png`,   active: true, categorySlugs: ["dien-thoai"] },
    { slug: "itel",    name: "Itel",    logoUrl: `${BRAND_LOGO}/Itel-240x50.png`,     active: true, categorySlugs: ["dien-thoai"] },
    { slug: "meizu",   name: "Meizu",   logoUrl: `${BRAND_LOGO}/MEIZU-240x50.png`,    active: true, categorySlugs: ["dien-thoai"] },
    { slug: "dell",    name: "Dell",    logoUrl: `${BRAND_LOGO}/Dell-240x50.png`,     active: true, categorySlugs: ["laptop"] },
    { slug: "hp",      name: "HP",      logoUrl: `${BRAND_LOGO}/HP-240x50.png`,       active: true, categorySlugs: ["laptop"] },
    { slug: "lenovo",  name: "Lenovo",  logoUrl: `${BRAND_LOGO}/lenovo-240x50.png`,   active: true, categorySlugs: ["laptop","tablet"] },
    { slug: "acer",    name: "Acer",    logoUrl: `${BRAND_LOGO}/acer-240x50.png`,     active: true, categorySlugs: ["laptop","man-hinh"] },
    { slug: "msi",     name: "MSI",     logoUrl: `${BRAND_LOGO}/MSI-240x50.png`,      active: true, categorySlugs: ["laptop"] },
    { slug: "lg",       name: "LG",       logoUrl: `${BRAND_LOGO}/LG-240x50.png`,         active: true, categorySlugs: ["man-hinh","tai-nghe","loa","tivi"] },
    { slug: "jbl",      name: "JBL",      logoUrl: `${BRAND_LOGO}/JBL-240x50.png`,        active: true, categorySlugs: ["tai-nghe","tai-nghe-bt","loa"] },
    { slug: "anker",    name: "Anker",    logoUrl: `${BRAND_LOGO}/Anker-240x50.png`,       active: true, categorySlugs: ["phu-kien","sac-cap","pin-du-phong"] },
    { slug: "baseus",   name: "Baseus",   logoUrl: `${BRAND_LOGO}/Baseus-240x50.png`,      active: true, categorySlugs: ["phu-kien","sac-cap","pin-du-phong"] },
    { slug: "ugreen",   name: "UGREEN",   logoUrl: `${BRAND_LOGO}/UGREEN-240x50.png`,      active: true, categorySlugs: ["phu-kien","sac-cap"] },
    { slug: "energizer",name: "Energizer",logoUrl: `${BRAND_LOGO}/Energizer-240x50.png`,   active: true, categorySlugs: ["phu-kien","pin-du-phong"] },
    { slug: "zagg",     name: "ZAGG",     logoUrl: `${BRAND_LOGO}/ZAGG-240x50.png`,        active: true, categorySlugs: ["phu-kien","op-lung"] },
    { slug: "esr",      name: "ESR",      logoUrl: `${BRAND_LOGO}/ESR-240x50.png`,         active: true, categorySlugs: ["phu-kien","op-lung"] },
    { slug: "uag",      name: "UAG",      logoUrl: `${BRAND_LOGO}/UAG-240x50.png`,         active: true, categorySlugs: ["phu-kien","op-lung"] },
  ],
  products: [],
};

console.log("Cập nhật icon danh mục và logo brand...");
const res = await fetch(`${BASE_URL}/admin/import/catalog?dryRun=false`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TOKEN}` },
  body: JSON.stringify(manifest),
});

const json = await res.json();
if (!res.ok || json.code !== "SUCCESS") {
  console.error("Lỗi:", JSON.stringify(json, null, 2));
  process.exit(1);
}
console.log("Thành công! Danh mục + brands đã cập nhật icon/logo mới.");
