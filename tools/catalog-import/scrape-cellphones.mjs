#!/usr/bin/env node
/**
 * Scraper cellphones.com.vn → catalog manifest JSON (per-category)
 *
 * Usage:
 *   # Scrape tất cả danh mục vào file riêng
 *   node scrape-cellphones.mjs --per-category --out-dir data/categories
 *
 *   # Scrape 1 danh mục cụ thể
 *   node scrape-cellphones.mjs --category dien-thoai --limit 150 --out data/dien-thoai.json
 *
 *   # Scrape tất cả vào 1 file (chế độ cũ)
 *   node scrape-cellphones.mjs --limit 100 --out data/cellphones-catalog.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://cellphones.com.vn";
const CDN  = "https://cdn2.cellphones.com.vn";
const DELAY_MS = 700;

// ─── Danh mục & giới hạn sản phẩm ────────────────────────────────────────────
// urls[] lets a category scrape multiple source pages (merged into one slug)
const CATEGORIES = [
  // ── Điện thoại ──────────────────────────────────────────────────────────────
  { url: "/mobile/apple.html",                slug: "iphone",          name: "iPhone",               parentSlug: "dien-thoai", sortOrder: 1, limit: 50,  urlPrefixes: ["dien-thoai-apple-"] },
  { url: "/mobile/samsung.html",              slug: "samsung-phone",   name: "Samsung",              parentSlug: "dien-thoai", sortOrder: 2, limit: 150, urlPrefixes: ["dien-thoai-samsung-"] },
  { url: "/mobile/xiaomi.html",               slug: "xiaomi-phone",    name: "Xiaomi",               parentSlug: "dien-thoai", sortOrder: 3, limit: 150, urlPrefixes: ["dien-thoai-xiaomi-","dien-thoai-poco-"] },
  { url: "/mobile/oppo.html",                 slug: "oppo-phone",      name: "OPPO",                 parentSlug: "dien-thoai", sortOrder: 4, limit: 50,  urlPrefixes: ["dien-thoai-oppo-"] },
  { url: "/mobile.html",                      slug: "dien-thoai",      name: "Điện thoại, Tablet",   sortOrder: 1,             limit: 150 },
  { url: "/tablet.html",                      slug: "tablet",          name: "Máy tính bảng",        parentSlug: "dien-thoai", sortOrder: 5, limit: 50,  urlPrefixes: ["may-tinh-bang-"] },
  // ── Laptop ──────────────────────────────────────────────────────────────────
  { url: "/laptop.html",                      slug: "laptop",          name: "Laptop",               sortOrder: 2,             limit: 150, urlPrefixes: ["laptop-","may-tinh-xach-tay-"] },
  // ── Âm thanh ────────────────────────────────────────────────────────────────
  { url: "/thiet-bi-am-thanh/tai-nghe.html",  slug: "tai-nghe-bt",     name: "Tai nghe",             parentSlug: "tai-nghe",   sortOrder: 1, limit: 50,  urlPrefixes: ["tai-nghe-"] },
  { url: "/thiet-bi-am-thanh/loa.html",       slug: "loa",             name: "Loa",                  parentSlug: "tai-nghe",   sortOrder: 2, limit: 50,  urlPrefixes: ["loa-"] },
  { url: "/thiet-bi-am-thanh.html",           slug: "tai-nghe",        name: "Âm thanh, Mic thu âm", sortOrder: 3,             limit: 50 },
  // ── Đồng hồ, Camera ─────────────────────────────────────────────────────────
  { url: "/may-anh.html",                     slug: "may-anh",         name: "Máy ảnh, Máy quay",    parentSlug: "dong-ho",    sortOrder: 1, limit: 50,  urlPrefixes: ["may-anh-","may-quay-","camera-hanh-trinh-"] },
  { url: "/do-choi-cong-nghe.html",            slug: "dong-ho",         name: "Đồng hồ, Camera",      sortOrder: 4,             limit: 50,  urlPrefixes: ["dong-ho-","vong-deo-tay-","dong-ho-thong-minh-"] },
  // ── Phụ kiện ────────────────────────────────────────────────────────────────
  { url: "/phu-kien/bao-da-op-lung.html",     slug: "op-lung",         name: "Ốp lưng",              parentSlug: "phu-kien",   sortOrder: 1, limit: 50,  urlPrefixes: ["op-lung-","bao-da-"] },
  { urls: ["/phu-kien/sac-dien-thoai.html","/phu-kien/sac-du-khong-day.html","/phu-kien/cac-loai-cap.html"],
                                              slug: "sac-cap",         name: "Sạc & Cáp",            parentSlug: "phu-kien",   sortOrder: 2, limit: 50,  urlPrefixes: ["cap-sac-","sac-","coc-sac-","cu-sac-","day-sac-"] },
  { url: "/phu-kien/pin-du-phong.html",       slug: "pin-du-phong",    name: "Pin dự phòng",         parentSlug: "phu-kien",   sortOrder: 3, limit: 50,  urlPrefixes: ["pin-du-phong-","pin-sac-du-phong-"] },
  { url: "/phu-kien/bao-da-op-lung.html",     slug: "phu-kien",        name: "Phụ kiện",             sortOrder: 5,             limit: 50,  urlPrefixes: ["op-lung-","bao-da-"] },
  // ── PC, Màn hình ────────────────────────────────────────────────────────────
  { url: "/may-tinh-de-ban.html",             slug: "may-tinh-de-ban", name: "PC, Máy tính để bàn",  parentSlug: "man-hinh",   sortOrder: 1, limit: 50,  urlPrefixes: ["may-tinh-de-ban-","pc-"] },
  { urls: ["/man-hinh.html","/may-in-may-scan.html"],
                                              slug: "man-hinh",        name: "PC, Màn hình, Máy in", sortOrder: 6,             limit: 80,  urlPrefixes: ["man-hinh-","may-in-","may-scan-","monitor-"] },
  // ── Tivi ────────────────────────────────────────────────────────────────────
  { url: "/tivi.html",                        slug: "tivi",            name: "Tivi",                 sortOrder: 7,             limit: 50,  urlPrefixes: ["tivi-","smart-tivi-"] },
];

// ─── Ảnh danh mục (icon thực từ cellphones.com.vn) ───────────────────────────
const CDN_CAT = "https://cdn2.cellphones.com.vn/x";
const CAT_IMAGES = {
  "dien-thoai":       `${CDN_CAT}/media/tmp/catalog/product/i/p/iphone-15-menu-0001.png`,
  "iphone":           `${CDN_CAT}/media/tmp/catalog/product/i/p/iphone-15-menu-0001.png`,
  "samsung-phone":    `${CDN_CAT}/media/catalog/product/s/a/samsung-galaxy-s24-menu-thumbnail-0001.png`,
  "xiaomi-phone":     `${CDN_CAT}/media/catalog/product/x/i/xiaomi-14-ultra-menu-thumbnail-0001.png`,
  "oppo-phone":       `${CDN_CAT}/media/catalog/product/o/p/oppo-find-x8-menu-thumbnail-0001.png`,
  "laptop":           `${CDN_CAT}/media/catalog/product/m/b/mb-laptop.png`,
  "tablet":           `${CDN_CAT}/media/tmp/catalog/product/t/_/t_i_xu_ng_9__3.png`,
  "tai-nghe":         `${CDN_CAT}/media/wysiwyg/icon-am-thanh.png`,
  "tai-nghe-bt":      `${CDN_CAT}/media/wysiwyg/icon-am-thanh.png`,
  "loa":              `${CDN_CAT}/media/catalog/product/l/o/loa-samsung-menu-thumbnail-0001.png`,
  "dong-ho":          `${CDN_CAT}/media/catalog/product/d/o/dong-ho.png`,
  "may-anh":          `${CDN_CAT}/media/catalog/product/m/b/mb-camera.png`,
  "phu-kien":         `${CDN_CAT}/media/catalog/product/m/b/mb-accessories.png`,
  "op-lung":          `${CDN_CAT}/media/catalog/product/m/b/mb-accessories.png`,
  "sac-cap":          `${CDN_CAT}/media/catalog/product/m/b/mb-accessories.png`,
  "pin-du-phong":     `${CDN_CAT}/media/catalog/product/m/b/mb-accessories.png`,
  "man-hinh":         `${CDN_CAT}/media/catalog/product/m/b/mb-monitor-pc.png`,
  "may-tinh-de-ban":  `${CDN_CAT}/media/catalog/product/m/b/mb-monitor-pc.png`,
  "tivi":             `${CDN_CAT}/media/catalog/product/t/i/tivi.png`,
};

// ─── Brand logo lookup (logo thực từ cellphones.com.vn) ──────────────────────
const CDN_BRAND = "https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand";
const BRAND_LOGOS = {
  apple:       `${CDN_BRAND}/iPhone-240x50.png`,
  samsung:     `${CDN_BRAND}/Samsung-240x50.png`,
  xiaomi:      `${CDN_BRAND}/XIAOMI-240x50.png`,
  oppo:        `${CDN_BRAND}/Oppo-240x50.png`,
  vivo:        `${CDN_BRAND}/Vivo-240x50.png`,
  realme:      `${CDN_BRAND}/Realme-240x50.png`,
  honor:       `${CDN_BRAND}/Honor-240x50.png`,
  huawei:      `${CDN_BRAND}/HUAWEI-240x50.png`,
  nokia:       `${CDN_BRAND}/Nokia-240x50.png`,
  sony:        `${CDN_BRAND}/SONY-240x50.png`,
  asus:        `${CDN_BRAND}/ASUS-240x50.png`,
  oneplus:     `${CDN_BRAND}/ONEPLUS-240x50.png`,
  tecno:       `${CDN_BRAND}/TECNO-240x50.png`,
  infinix:     `${CDN_BRAND}/Infinix-240x50.png`,
  nubia:       `${CDN_BRAND}/Nubia-240x50.png`,
  nothing:     `${CDN_BRAND}/Nothing-240x50.png`,
  masstel:     `${CDN_BRAND}/Mastel-240x50.png`,
  itel:        `${CDN_BRAND}/Itel-240x50.png`,
  meizu:       `${CDN_BRAND}/MEIZU-240x50.png`,
  benco:       `${CDN_BRAND}/benco-240x50.png`,
  dell:        `${CDN_BRAND}/Dell-240x50.png`,
  hp:          `${CDN_BRAND}/HP-240x50.png`,
  lenovo:      `${CDN_BRAND}/lenovo-240x50.png`,
  acer:        `${CDN_BRAND}/acer-240x50.png`,
  msi:         `${CDN_BRAND}/MSI-240x50.png`,
  lg:          `${CDN_BRAND}/LG-240x50.png`,
  jbl:         `${CDN_BRAND}/JBL-240x50.png`,
  anker:       `${CDN_BRAND}/Anker-240x50.png`,
  garmin:      `${CDN_BRAND}/Garmin-240x50.png`,
  baseus:      `${CDN_BRAND}/Baseus-240x50.png`,
  ugreen:      `${CDN_BRAND}/UGREEN-240x50.png`,
  energizer:   `${CDN_BRAND}/Energizer-240x50.png`,
  zagg:        `${CDN_BRAND}/ZAGG-240x50.png`,
  esr:         `${CDN_BRAND}/ESR-240x50.png`,
  uag:         `${CDN_BRAND}/UAG-240x50.png`,
  tcl:         `${CDN_BRAND}/TCL-240x50.png`,
  panasonic:   `${CDN_BRAND}/Panasonic-240x50.png`,
  sharp:       `${CDN_BRAND}/Sharp-240x50.png`,
  hisense:     `${CDN_BRAND}/Hisense-240x50.png`,
};

const KNOWN_BRANDS = [
  "Apple","Samsung","Xiaomi","OPPO","vivo","realme","Dell","ASUS","Lenovo","HP",
  "Acer","MSI","LG","Sony","Anker","JBL","Garmin","Huawei","Nokia","HONOR",
  "Motorola","OnePlus","Tecno","Infinix","TCL","POCO","Nothing","Nubia","Itel",
  "Baseus","UGREEN","Energizer","ZAGG","ESR","UAG","Spigen","Mipow","Switcheasy",
  "Canon","Nikon","Fujifilm","GoPro","DJI","Insta360","Casio","Slimcase","Uniq",
  "TCL","Panasonic","Sharp","Hisense","Philips","Toshiba","Skyworth",
];

// ─── Định nghĩa attributes chuẩn ─────────────────────────────────────────────
const MANIFEST_ATTRIBUTES = [
  { code:"color",       name:"Màu sắc",        valueType:"select", isColor:true,
    allowedValues: JSON.stringify([
      {name:"Đen",hex:"#1a1a1a"},{name:"Trắng",hex:"#f8fafc"},{name:"Bạc",hex:"#94a3b8"},
      {name:"Xám",hex:"#6b7280"},{name:"Xanh",hex:"#2563eb"},{name:"Tím",hex:"#7c3aed"},
      {name:"Hồng",hex:"#ec4899"},{name:"Đỏ",hex:"#dc2626"},{name:"Vàng",hex:"#f59e0b"},
      {name:"Cam",hex:"#f97316"},{name:"Nâu",hex:"#92400e"},{name:"Xanh lá",hex:"#16a34a"},
      {name:"Xanh navy",hex:"#1e3a5f"},{name:"Xanh da trời",hex:"#38bdf8"},
      {name:"Titan Đen",hex:"#1c1917"},{name:"Titan Trắng",hex:"#fafaf9"},
      {name:"Titan Bạc",hex:"#e2e8f0"},{name:"Titan Tự nhiên",hex:"#d6cfc4"},
      {name:"Tím Cobalt",hex:"#5b4b8a"},{name:"Đen Classic",hex:"#1a1a1a"},
      {name:"Xanh Sky Blue",hex:"#38bdf8"},{name:"Trắng Classic",hex:"#f8fafc"},
      {name:"Xanh lam",hex:"#1d4ed8"},{name:"Cam nhạt",hex:"#fed7aa"},
      {name:"Xanh bạc hà",hex:"#6ee7b7"},{name:"Chính hãng",hex:"#64748b"},
    ]),
  },
  { code:"storage",     name:"Bộ nhớ trong",   valueType:"select",
    allowedValues: JSON.stringify([
      {name:"32GB"},{name:"64GB"},{name:"128GB"},{name:"256GB"},
      {name:"512GB"},{name:"1TB"},{name:"2TB"},
    ]),
  },
  { code:"ram",         name:"RAM",             valueType:"select",
    allowedValues: JSON.stringify([
      {name:"4GB"},{name:"6GB"},{name:"8GB"},{name:"12GB"},{name:"16GB"},{name:"32GB"},{name:"64GB"},
    ]),
  },
  { code:"cpu",         name:"Vi xử lý",        valueType:"text" },
  { code:"gpu",         name:"Card đồ họa",     valueType:"text" },
  { code:"screen",      name:"Màn hình",        valueType:"text" },
  { code:"battery",     name:"Pin",             valueType:"text" },
  { code:"camera",      name:"Camera sau",      valueType:"text" },
  { code:"camera_front",name:"Camera trước",    valueType:"text" },
  { code:"os",          name:"Hệ điều hành",    valueType:"text" },
  { code:"connectivity",name:"Kết nối",         valueType:"text" },
  { code:"weight",      name:"Trọng lượng",     valueType:"text" },
  { code:"refresh_rate",name:"Tần số quét",     valueType:"text" },
  { code:"sim",         name:"SIM",             valueType:"text" },
  { code:"nfc",         name:"NFC",             valueType:"text" },
  { code:"charging",    name:"Sạc",             valueType:"text" },
  { code:"material",    name:"Chất liệu",       valueType:"text" },
  { code:"dimensions",  name:"Kích thước",      valueType:"text" },
  { code:"resolution",  name:"Độ phân giải màn hình", valueType:"text" },
  { code:"display_tech",name:"Công nghệ màn hình", valueType:"text" },
  { code:"network",     name:"Hỗ trợ mạng",     valueType:"text" },
];

const CATEGORY_ATTRIBUTES = [
  { categorySlug:"dien-thoai",   attributeCode:"storage", isVariant:true,  isRequired:true  },
  { categorySlug:"dien-thoai",   attributeCode:"color",   isVariant:true,  isRequired:true  },
  { categorySlug:"dien-thoai",   attributeCode:"ram",     isVariant:false, isRequired:false },
  { categorySlug:"dien-thoai",   attributeCode:"cpu",     isVariant:false, isRequired:false },
  { categorySlug:"dien-thoai",   attributeCode:"screen",  isVariant:false, isRequired:false },
  { categorySlug:"dien-thoai",   attributeCode:"battery", isVariant:false, isRequired:false },
  { categorySlug:"dien-thoai",   attributeCode:"camera",  isVariant:false, isRequired:false },
  { categorySlug:"dien-thoai",   attributeCode:"os",      isVariant:false, isRequired:false },
  { categorySlug:"iphone",       attributeCode:"storage", isVariant:true,  isRequired:true  },
  { categorySlug:"iphone",       attributeCode:"color",   isVariant:true,  isRequired:true  },
  { categorySlug:"samsung-phone",attributeCode:"storage", isVariant:true,  isRequired:true  },
  { categorySlug:"samsung-phone",attributeCode:"color",   isVariant:true,  isRequired:true  },
  { categorySlug:"xiaomi-phone", attributeCode:"storage", isVariant:true,  isRequired:true  },
  { categorySlug:"xiaomi-phone", attributeCode:"color",   isVariant:true,  isRequired:true  },
  { categorySlug:"laptop",       attributeCode:"ram",     isVariant:false, isRequired:true  },
  { categorySlug:"laptop",       attributeCode:"storage", isVariant:true,  isRequired:true  },
  { categorySlug:"laptop",       attributeCode:"cpu",     isVariant:false, isRequired:true  },
  { categorySlug:"laptop",       attributeCode:"gpu",     isVariant:false, isRequired:false },
  { categorySlug:"laptop",       attributeCode:"screen",  isVariant:false, isRequired:false },
  { categorySlug:"tablet",       attributeCode:"storage", isVariant:true,  isRequired:true  },
  { categorySlug:"tablet",       attributeCode:"color",   isVariant:true,  isRequired:true  },
  { categorySlug:"tablet",       attributeCode:"ram",     isVariant:false, isRequired:false },
  { categorySlug:"tai-nghe",     attributeCode:"color",   isVariant:true,  isRequired:false },
  { categorySlug:"dong-ho",      attributeCode:"color",   isVariant:true,  isRequired:true  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
  "Referer": "https://cellphones.com.vn/",
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function slugify(text) {
  return (text || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// CDN thumbnail → full quality
// "https://cdn2.cellphones.com.vn/358x/media/..." → "https://cdn2.cellphones.com.vn/x/media/..."
// "https://cdn2.cellphones.com.vn/insecure/rs:fill.../plain/https://cellphones.com.vn/media/..." → full
function toFullImg(url) {
  if (!url || url.includes("placeholder") || url.includes("placehoder")) return "";
  const m1 = url.match(/plain\/https?:\/\/cellphones\.com\.vn(\/media\/.+)/);
  if (m1) return `${CDN}/x${m1[1]}`;
  const m2 = url.match(/cdn2\.cellphones\.com\.vn\/\d+x\/(media\/.+)/);
  if (m2) return `${CDN}/x/${m2[1]}`;
  if (url.includes(`${CDN}/x/`)) return url; // already full
  if (url.startsWith("http")) return url;
  return "";
}

async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

// Product URL prefixes (positive detection)
const PRODUCT_PREFIXES = [
  "dien-thoai-","laptop-","may-tinh-bang-","may-tinh-xach-tay-",
  "tai-nghe-","loa-","dong-ho-","vong-deo-tay-","dong-ho-thong-minh-",
  "man-hinh-","monitor-","op-lung-","bao-da-","cap-sac-","sac-","coc-sac-","cu-sac-","day-sac-",
  "pin-du-phong-","pin-sac-du-phong-","chuot-","ban-phim-","webcam-","microphone-","micro-",
  "may-anh-","may-quay-","camera-hanh-trinh-","may-tinh-de-ban-","pc-","may-in-","may-scan-",
  "tivi-","smart-tivi-",
];

function parseProductLinks(html, urlPrefixes = null) {
  const $ = cheerio.load(html);
  const links = new Set();
  const prefixes = urlPrefixes || PRODUCT_PREFIXES;

  function tryAdd(full) {
    if (!full || !full.startsWith(BASE + "/") || !full.endsWith(".html")) return;
    if (full.includes("?") || full.includes("#")) return;
    const p = full.slice(BASE.length + 1);
    if (p.includes("/")) return;
    const slug = p.slice(0, -5);
    if (prefixes.some(px => slug.startsWith(px))) links.add(full);
  }

  // 1. Standard <a href> links
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    tryAdd(href.startsWith("http") ? href : href.startsWith("/") ? BASE + href : null);
  });

  // 2. URLs embedded in JSON/script data (e.g. banner JSON in Next.js pages)
  const urlRe = /https?:\/\/cellphones\.com\.vn\/([a-z0-9][a-z0-9-]+\.html)/g;
  let m;
  while ((m = urlRe.exec(html)) !== null) tryAdd(`${BASE}/${m[1]}`);

  return [...links];
}

// ─── Parse product detail page ────────────────────────────────────────────────
function parseProductDetail(html, productUrl, categorySlug) {
  const $ = cheerio.load(html);

  // Tên sản phẩm
  const name = $("h1").first().text().trim() || "";
  if (!name) return null;

  // Giá
  function parsePrice(str) {
    return parseInt((str || "").replace(/[^\d]/g, ""), 10) || 0;
  }
  // currentSellingPrice = giá hiển thị to (giá bán hiện tại / đã giảm)
  // originalPrice       = giá gạch ngang (giá niêm yết gốc)
  let currentSellingPrice = 0, originalPrice = 0;
  for (const sel of [".sale-price",".product__price--show",".tpt--product-price .tpt--final-price","[class*='final-price']",".price-box .price",".product-price"]) {
    const p = parsePrice($(sel).first().text());
    if (p > 100000) { currentSellingPrice = p; break; }
  }
  for (const sel of [".original-price","[class*='old-price']","[class*='regular-price']","del","s"]) {
    const p = parsePrice($(sel).first().text());
    if (p > 100000) { originalPrice = p; break; }
  }
  if (!currentSellingPrice) {
    $("span, p, div").each((_, el) => {
      if (currentSellingPrice) return false;
      if ($(el).children().length > 0) return;
      const txt = $(el).text().trim();
      if (/^\d{1,3}(\.\d{3})+đ?$/.test(txt)) {
        const p = parsePrice(txt);
        if (p > 500000 && p < 200000000) currentSellingPrice = p;
      }
    });
  }
  if (!currentSellingPrice) currentSellingPrice = 1000000;

  // Ánh xạ sang chuẩn DB:
  //   price     = giá niêm yết (gốc, cao hơn)
  //   salePrice = giá khuyến mãi (thấp hơn, null nếu không có KM)
  let price, salePrice;
  if (originalPrice > currentSellingPrice) {
    price     = originalPrice;       // giá gốc (cao hơn)
    salePrice = currentSellingPrice; // giá KM (thấp hơn)
  } else {
    price     = currentSellingPrice; // không có KM
    salePrice = 0;
  }

  // ─── Ảnh sản phẩm — lấy tất cả unique, tối đa 15 ───────────────────────────
  const imageSet = new Set();
  // Ảnh chính từ slider/gallery
  $("img[src], img[data-src], img[data-zoom-image], img[data-full]").each((_, el) => {
    const srcs = [
      $(el).attr("src"), $(el).attr("data-src"),
      $(el).attr("data-zoom-image"), $(el).attr("data-full"),
      $(el).attr("data-original"),
    ];
    for (const src of srcs) {
      if (!src) continue;
      const full = toFullImg(src);
      if (full && (full.includes("media/catalog/product") || full.includes("wysiwyg/slider"))) {
        imageSet.add(full);
      }
    }
  });
  // Ảnh từ thẻ a[href] chứa link ảnh
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("cdn2.cellphones.com.vn") && href.includes("media/catalog/product")) {
      const full = toFullImg(href);
      if (full) imageSet.add(full);
    }
  });
  const allImages = [...imageSet].filter(Boolean).slice(0, 15);
  const imageUrl = allImages[0] || "";
  const gallery  = allImages.slice(1);

  // ─── Thương hiệu ─────────────────────────────────────────────────────────────
  let brand = "";
  for (const sel of [".product-brand a","[class*='brand'] a","[class*='manufacturer'] a"]) {
    const txt = $(sel).first().text().trim();
    if (txt) { brand = txt; break; }
  }
  if (brand) {
    const normalized = KNOWN_BRANDS.find(b => brand.toLowerCase().includes(b.toLowerCase()));
    brand = normalized || "";
  }
  if (!brand) {
    brand = KNOWN_BRANDS
      .filter(b => b !== "iPhone")
      .find(b => name.toLowerCase().includes(b.toLowerCase())) || "";
    if (!brand && name.toLowerCase().includes("iphone")) brand = "Apple";
  }

  // ─── Thông số kỹ thuật — lấy TẤT CẢ hàng trong bảng ────────────────────────
  // Map label chuẩn hóa → attribute code
  const SPEC_MAP = {
    "hệ điều hành": "os", "hệ điều hành khi ra mắt": "os", "os": "os",
    "chip": "cpu", "chipset": "cpu", "cpu": "cpu", "vi xử lý": "cpu",
    "bộ vi xử lý": "cpu", "loại cpu": "cpu",
    "ram": "ram", "dung lượng ram": "ram",
    "bộ nhớ trong": "storage", "dung lượng": "storage", "dung lượng lưu trữ": "storage",
    "màn hình": "screen", "kích thước màn hình": "screen", "công nghệ màn hình": "display_tech",
    "độ phân giải": "resolution", "tần số quét": "refresh_rate", "tốc độ làm mới": "refresh_rate",
    "camera sau": "camera", "camera chính": "camera", "độ phân giải camera sau": "camera",
    "camera trước": "camera_front", "camera selfie": "camera_front",
    "pin": "battery", "dung lượng pin": "battery", "công suất pin": "battery",
    "cổng kết nối": "connectivity", "kết nối": "connectivity",
    "nfc": "nfc", "công nghệ nfc": "nfc",
    "trọng lượng": "weight", "khối lượng": "weight",
    "card đồ họa": "gpu", "gpu": "gpu", "card màn hình": "gpu",
    "sim": "sim", "loại sim": "sim", "số sim": "sim",
    "sạc": "charging", "công nghệ sạc": "charging", "sạc nhanh": "charging",
    "chất liệu": "material", "mặt lưng": "material",
    "kích thước": "dimensions", "kích thước (d x r x c)": "dimensions",
    "hỗ trợ mạng": "network", "chuẩn mạng": "network",
  };

  const specs = {};
  const specsRaw = {}; // lưu tất cả thông số gốc kể cả không map được

  function addSpec(labelRaw, value) {
    if (!labelRaw || !value) return;
    const label = labelRaw.trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d");
    const val = value.trim().replace(/\s+/g, " ");
    // Lưu raw
    if (!specsRaw[labelRaw.trim()]) specsRaw[labelRaw.trim()] = val;
    // Map sang code chuẩn
    const code = SPEC_MAP[labelRaw.trim().toLowerCase()] || SPEC_MAP[label];
    if (code && !specs[code]) specs[code] = val;
  }

  // Parse tất cả bảng <table>
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td, th");
    if (cells.length >= 2) addSpec(cells.eq(0).text(), cells.eq(1).text());
  });
  // Parse dl/dt/dd
  $("dl").each((_, dl) => {
    $(dl).find("dt").each((_, dt) => {
      addSpec($(dt).text(), $(dt).next("dd").text());
    });
  });
  // Parse .specs-row, li với label:value
  $("[class*='spec'] li, [class*='technical'] li").each((_, li) => {
    const txt = $(li).text();
    const sep = txt.indexOf(":");
    if (sep > 0) addSpec(txt.slice(0, sep), txt.slice(sep + 1));
  });
  // Parse div với 2 span (label / value pattern)
  $("[class*='spec'] div, [class*='technical'] div").each((_, div) => {
    const spans = $(div).find("span");
    if (spans.length === 2) addSpec(spans.eq(0).text(), spans.eq(1).text());
  });

  // ─── Mô tả từ "Đặc điểm nổi bật" ────────────────────────────────────────────
  let description = "";
  // Tìm heading chứa "nổi bật" hoặc "đặc điểm"
  $("h2, h3, h4, strong, b").each((_, el) => {
    if (description) return false;
    const txt = $(el).text().toLowerCase();
    if (txt.includes("nổi bật") || txt.includes("đặc điểm") || txt.includes("tính năng")) {
      // Lấy nội dung từ sibling hoặc parent kế tiếp
      let content = "";
      // Thử lấy danh sách ul/li sau heading
      const nextUl = $(el).nextAll("ul").first();
      if (nextUl.length) {
        nextUl.find("li").each((_, li) => {
          const t = $(li).text().trim();
          if (t) content += "• " + t + "\n";
        });
      }
      // Nếu không có ul, lấy text của parent section
      if (!content) {
        const parentSection = $(el).closest("section, div, article");
        content = parentSection.text().trim()
          .replace($(el).text(), "").trim();
      }
      if (content && content.length > 50) description = content.trim();
    }
  });
  // Fallback: meta description
  if (!description || description.length < 50) {
    description = $("meta[name='description']").attr("content")
      || $(".product-description, [class*='short-desc']").first().text().trim()
      || `${name} — hàng chính hãng tại CellphoneS. Giao hàng nhanh toàn quốc, bảo hành 12 tháng.`;
  }
  // Chỉ lấy đoạn đầu tiên (trước dấu xuống dòng kép hoặc câu hỏi tiếp theo)
  description = description.trim()
    .split(/\n{2,}|\r\n{2,}/)[0]          // cắt tại đoạn trống đầu tiên
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500);

  // ─── Màu sắc & ảnh theo màu ──────────────────────────────────────────────────
  const COLOR_KEYWORDS = [
    "Đen","Trắng","Xám","Bạc","Xanh","Tím","Hồng","Đỏ","Vàng","Cam","Nâu",
    "Titan","Classic","Cobalt","Gold","Silver","Black","White","Blue","Green",
    "Purple","Pink","Red","Sky","Nhạt","Tối","Sáng","lam","lá","navy","bạc hà",
  ];
  function cleanColor(raw) {
    if (!raw) return "";
    const m1 = raw.match(/ [-–] (.+)$/);
    if (m1) return m1[1].trim();
    const lastDash = raw.lastIndexOf("-");
    if (lastDash > 0 && lastDash > raw.length / 2) {
      const c = raw.slice(lastDash + 1).trim();
      if (c.length > 1 && c.length < 30) return c;
    }
    for (const kw of COLOR_KEYWORDS) {
      const idx = raw.indexOf(kw);
      if (idx >= 0) return raw.slice(idx).trim();
    }
    return raw.trim();
  }

  const colors = [];
  const colorImageMap  = {}; // color → ảnh riêng của màu
  const colorPriceMap  = {}; // color → giá bán của màu (nếu có)
  const colorSalePriceMap = {}; // color → giá gốc (gạch ngang) của màu

  $(".color-options a[title], [class*='color'] a[title], [class*='swatch'] a[title]").each((_, el) => {
    const raw = $(el).attr("title") || "";
    const c = cleanColor(raw);
    if (!c || c.length >= 40 || colors.includes(c)) return;
    colors.push(c);

    // Ảnh màu
    const imgEl = $(el).find("img").first();
    const imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || "";
    const fullImg = toFullImg(imgSrc);
    if (fullImg) colorImageMap[c] = fullImg;

    // Giá từ swatch: cellphones.com.vn hiển thị giá sale và giá gốc bên cạnh màu
    const swatchText = $(el).text();
    // Tìm tất cả số tiền trong swatch text
    const allPrices = [...swatchText.matchAll(/(\d{1,3}(?:\.\d{3})+)đ?/g)]
      .map(m => parseInt(m[1].replace(/\./g, ""), 10))
      .filter(p => p > 100000 && p < 200000000);

    if (allPrices.length === 1) {
      // Chỉ 1 giá → không có KM, đây là giá bán (= giá gốc)
      colorPriceMap[c] = allPrices[0];
    } else if (allPrices.length >= 2) {
      // 2 giá: nhỏ = giá KM (hiện tại), lớn = giá gốc (niêm yết)
      const sorted = allPrices.slice().sort((a, b) => a - b);
      colorPriceMap[c]     = sorted[sorted.length - 1]; // price  = giá gốc (cao)
      colorSalePriceMap[c] = sorted[0];                  // salePrice = giá KM (thấp)
    }
  });

  if (!colors.length) {
    $(".color-options img[alt], [class*='color'] img[alt]").each((_, el) => {
      const raw = $(el).attr("alt") || "";
      const c = cleanColor(raw);
      if (!c || c.length >= 40 || colors.includes(c)) return;
      colors.push(c);
      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      const full = toFullImg(src);
      if (full) colorImageMap[c] = full;
    });
  }

  // ─── Bộ nhớ (storage) ────────────────────────────────────────────────────────
  const storages = [];
  if (specs.storage) {
    const m = specs.storage.match(/\d+(GB|TB)/i);
    if (m) storages.push(m[0]);
  }
  if (!storages.length) {
    const m = name.match(/\b(\d+GB|\d+TB)\b/gi);
    if (m) {
      const sorted = m.map(s => ({ label: s, n: parseInt(s) })).sort((a, b) => b.n - a.n);
      if (sorted.length) storages.push(sorted[0].label);
    }
  }

  // ─── Build variants ───────────────────────────────────────────────────────────
  const variants = [];
  const usedSkus = new Set();
  const slug = productUrl.split("/").pop().replace(".html", "");

  function fnv1a(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36).toUpperCase().slice(-6).padStart(6, "0");
  }
  const skuBase = fnv1a(slug);

  const effectiveColors   = colors.length   ? colors   : ["Chính hãng"];
  const effectiveStorages = storages.length  ? storages : [];

  // Helper: lấy giá gốc và giá KM cho 1 màu
  // Nếu màu có 2 giá riêng → dùng giá riêng; ngược lại → kế thừa từ sản phẩm
  function resolveVariantPrices(color, storagePremium = 0) {
    const hasOwnPricing = colorPriceMap[color] && colorSalePriceMap[color];
    const vPrice    = (hasOwnPricing ? colorPriceMap[color]     : price)     + storagePremium;
    const vSale     = (hasOwnPricing ? colorSalePriceMap[color] : salePrice) + storagePremium;
    return {
      varPrice:     vPrice,
      varSalePrice: vSale > 0 && vSale < vPrice ? vSale : null,
    };
  }

  if (!effectiveStorages.length) {
    effectiveColors.forEach((color, ci) => {
      const sku = `${skuBase}-${slugify(color).replace(/-/g,"").toUpperCase().slice(-5)}-${ci}`;
      const varImg = colorImageMap[color] || imageUrl;
      const { varPrice, varSalePrice } = resolveVariantPrices(color);
      if (!usedSkus.has(sku)) {
        usedSkus.add(sku);
        const v = { sku, price: varPrice, costPrice: Math.round((varSalePrice || varPrice) * 0.76), imageUrl: varImg, active: true, options: { color } };
        if (varSalePrice) v.salePrice = varSalePrice;
        variants.push(v);
      }
    });
  } else {
    effectiveColors.forEach((color) => {
      effectiveStorages.forEach((storage, si) => {
        const sku = `${skuBase}-${slugify(color).replace(/-/g,"").toUpperCase().slice(-4)}-${storage.replace(/\s/g,"")}`;
        const varImg = colorImageMap[color] || imageUrl;
        const { varPrice, varSalePrice } = resolveVariantPrices(color, si * 2000000);
        if (!usedSkus.has(sku)) {
          usedSkus.add(sku);
          const v = { sku, price: varPrice, costPrice: Math.round((varSalePrice || varPrice) * 0.76), imageUrl: varImg, active: true, options: { color, storage } };
          if (varSalePrice) v.salePrice = varSalePrice;
          variants.push(v);
        }
      });
    });
  }
  if (!variants.length) variants.push({ sku: `${skuBase}-DEFAULT`, price, costPrice: Math.round((salePrice || price) * 0.76), imageUrl, active: true, options: {} });

  return {
    slug,
    name,
    categorySlug,
    brandSlug: slugify(brand),
    brandName: brand,
    description,
    price,
    salePrice: salePrice > 0 && salePrice < price ? salePrice : null,
    costPrice: Math.round((salePrice > 0 ? salePrice : price) * 0.76),
    imageUrl,
    images: gallery,
    status: "PUBLISHED",
    active: true,
    warrantyPeriod: 12,
    warrantyPolicy: "Bảo hành chính hãng 12 tháng. Đổi mới trong 30 ngày nếu lỗi nhà sản xuất.",
    specs,
    specsRaw,
    tags: [],
    variants,
  };
}

// ─── Scrape 1 category ────────────────────────────────────────────────────────
async function scrapeCategory(cat, limit, visitedUrls, brands) {
  const products = [];
  const usedSlugs = new Set();
  const sourceUrls = cat.urls ? cat.urls : [cat.url];
  console.log(`\n📂  ${cat.name}  (${sourceUrls.join(", ")})  — giới hạn ${limit} sp`);

  outer:
  for (const catUrl of sourceUrls) {
  for (let page = 1; page <= 10; page++) {
    if (products.length >= limit) break outer;
    const pageUrl = page === 1 ? `${BASE}${catUrl}` : `${BASE}${catUrl}?p=${page}`;

    let html;
    try { html = await fetchHtml(pageUrl); }
    catch (e) { console.warn(`  ⚠️  ${pageUrl}: ${e.message}`); break; }

    const links = parseProductLinks(html, cat.urlPrefixes || null).filter(u => !visitedUrls.has(u));
    if (!links.length) { if (page > 1) break; continue; }
    console.log(`  ${catUrl} trang ${page}: ${links.length} sản phẩm`);

    for (const productUrl of links) {
      if (products.length >= limit) break outer;
      visitedUrls.add(productUrl);
      await sleep(DELAY_MS);

      let detail;
      try {
        const html2 = await fetchHtml(productUrl);
        detail = parseProductDetail(html2, productUrl, cat.slug);
      } catch (e) {
        process.stdout.write(`  ❌ ${productUrl.split("/").pop()} — ${e.message}\n`);
        continue;
      }
      if (!detail || !detail.name) continue;

      // Deduplicate slug
      let finalSlug = detail.slug;
      let n = 2;
      while (usedSlugs.has(finalSlug)) finalSlug = `${detail.slug}-${n++}`;
      usedSlugs.add(finalSlug);
      detail.slug = finalSlug;

      // Accumulate brands
      if (detail.brandName && detail.brandSlug && !brands.has(detail.brandSlug)) {
        brands.set(detail.brandSlug, {
          slug: detail.brandSlug,
          name: detail.brandName,
          logoUrl: BRAND_LOGOS[detail.brandSlug] || `https://cdn2.cellphones.com.vn/insecure/rs:fill:0:50/q:100/plain/https://cellphones.com.vn/media/wysiwyg/Web/Brand/${detail.brandName}-240x50.png`,
          description: `${detail.brandName} — phân phối chính hãng tại CellphoneS.`,
          active: true,
          categorySlugs: [],
        });
      }
      if (detail.brandSlug && brands.has(detail.brandSlug)) {
        const b = brands.get(detail.brandSlug);
        if (!b.categorySlugs.includes(cat.slug)) b.categorySlugs.push(cat.slug);
      }
      delete detail.brandName;

      products.push(detail);
      process.stdout.write(`  ✅ [${products.length}/${limit}] ${detail.name.slice(0, 55)}\n`);
    }
  }
  } // end sourceUrls loop
  return products;
}

// ─── Build manifest từ danh sách sản phẩm ────────────────────────────────────
function buildManifest(products, brands, categoryDefs, note) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    note,
    attributes: MANIFEST_ATTRIBUTES,
    categories: categoryDefs,
    categoryAttributes: CATEGORY_ATTRIBUTES,
    brands: [...brands.values()],
    products,
  };
}

// ─── Parse args ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    perCategory: false,
    category: null,
    limit: 100,
    out: "data/cellphones-catalog.json",
    outDir: "manifests",
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--per-category") args.perCategory = true;
    if (argv[i] === "--category"  && argv[i+1]) args.category  = argv[++i];
    if (argv[i] === "--limit"     && argv[i+1]) args.limit     = Number(argv[++i]);
    if (argv[i] === "--out"       && argv[i+1]) args.out       = argv[++i];
    if (argv[i] === "--out-dir"   && argv[i+1]) args.outDir    = argv[++i];
  }
  return args;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const categoryDefs = CATEGORIES.map((c, i) => ({
    slug: c.slug, name: c.name,
    parentSlug: c.parentSlug || null,
    sortOrder: c.sortOrder, active: true,
    imageUrl: CAT_IMAGES[c.slug] || catImg(c.slug.replace(/-/g, ","), 200 + i),
  }));

  if (args.perCategory) {
    // ── Chế độ tách file riêng từng danh mục ──────────────────────────────────
    console.log(`\n🕷️  Scraping per-category → ${args.outDir}/`);
    const outDir = path.resolve(__dirname, args.outDir);
    fs.mkdirSync(outDir, { recursive: true });

    const globalVisited = new Set();
    const globalBrands  = new Map();

    for (const cat of CATEGORIES) {
      const brands = new Map(globalBrands);
      const products = await scrapeCategory(cat, cat.limit, globalVisited, brands);
      // Merge brands back
      for (const [k, v] of brands) globalBrands.set(k, v);

      const manifest = buildManifest(
        products, brands, categoryDefs,
        `Scraped ${products.length} sản phẩm — danh mục "${cat.name}" từ cellphones.com.vn`
      );
      const outFile = path.join(outDir, `${cat.slug}.json`);
      fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2));
      console.log(`\n  💾  ${outFile}  (${products.length} sp)`);
    }

    console.log("\n✅  Hoàn tất tất cả danh mục!");
    console.log(`\n👉  Import từng file:`);
    for (const cat of CATEGORIES) {
      console.log(`   node import.mjs --file ${args.outDir}/${cat.slug}.json --apply`);
    }

  } else if (args.category) {
    // ── Chế độ 1 danh mục cụ thể ─────────────────────────────────────────────
    const cat = CATEGORIES.find(c => c.slug === args.category);
    if (!cat) { console.error(`❌ Không tìm thấy danh mục: ${args.category}`); process.exit(1); }
    const limit = args.limit || cat.limit;
    console.log(`\n🕷️  Scraping "${cat.name}" — ${limit} sản phẩm → ${args.out}`);
    const brands = new Map();
    const products = await scrapeCategory(cat, limit, new Set(), brands);
    const manifest = buildManifest(products, brands, categoryDefs,
      `Scraped ${products.length} sản phẩm — danh mục "${cat.name}" từ cellphones.com.vn`);
    const outPath = path.resolve(__dirname, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
    console.log(`\n✅  ${outPath}  (${products.length} sp, ${brands.size} brands)`);
    console.log(`\n👉  node import.mjs --file ${args.out} --apply`);

  } else {
    // ── Chế độ gộp tất cả vào 1 file (tương thích cũ) ────────────────────────
    const limit = args.limit;
    console.log(`\n🕷️  Scraping cellphones.com.vn — ${limit} sản phẩm → ${args.out}`);
    const brands = new Map();
    const allProducts = [];
    const visited = new Set();

    for (const cat of CATEGORIES) {
      if (allProducts.length >= limit) break;
      const catLimit = Math.min(cat.limit, limit - allProducts.length);
      const products = await scrapeCategory(cat, catLimit, visited, brands);
      allProducts.push(...products);
    }

    const manifest = buildManifest(allProducts, brands, categoryDefs,
      `Scraped ${allProducts.length} sản phẩm từ cellphones.com.vn`);
    const outPath = path.resolve(__dirname, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
    console.log(`\n✅  Hoàn tất!`);
    console.log(`   Sản phẩm  : ${allProducts.length}`);
    console.log(`   Thương hiệu: ${brands.size}`);
    console.log(`   Output     : ${outPath}`);
    console.log(`\n👉  node import.mjs --file ${args.out} --apply`);
  }
}

main().catch(e => { console.error("\n❌", e.message); process.exit(1); });
