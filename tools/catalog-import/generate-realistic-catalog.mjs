#!/usr/bin/env node
/**
 * Sinh catalog manifest realistic (100 SP) — dữ liệu synthetic demo,
 * cấu trúc giống ecommerce VN (CellphoneS-style), không scrape website.
 *
 * Usage: node generate-realistic-catalog.mjs
 *        node generate-realistic-catalog.mjs --count 100 --out data/catalog-100.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRAND_LOGOS = {
  apple: "https://logo.clearbit.com/apple.com",
  samsung: "https://logo.clearbit.com/samsung.com",
  xiaomi: "https://logo.clearbit.com/mi.com",
  oppo: "https://logo.clearbit.com/oppo.com",
  vivo: "https://logo.clearbit.com/vivo.com",
  realme: "https://logo.clearbit.com/realme.com",
  dell: "https://logo.clearbit.com/dell.com",
  asus: "https://logo.clearbit.com/asus.com",
  lenovo: "https://logo.clearbit.com/lenovo.com",
  hp: "https://logo.clearbit.com/hp.com",
  acer: "https://logo.clearbit.com/acer.com",
  msi: "https://logo.clearbit.com/msi.com",
  lg: "https://logo.clearbit.com/lg.com",
  sony: "https://logo.clearbit.com/sony.com",
  anker: "https://logo.clearbit.com/anker.com",
  jbl: "https://logo.clearbit.com/jbl.com",
  garmin: "https://logo.clearbit.com/garmin.com",
  huawei: "https://logo.clearbit.com/huawei.com",
  nokia: "https://logo.clearbit.com/nokia.com",
  honor: "https://logo.clearbit.com/hihonor.com",
};

const CATEGORIES = [
  { slug: "dien-thoai", name: "Điện thoại", sortOrder: 1 },
  { slug: "iphone", name: "iPhone", parentSlug: "dien-thoai", sortOrder: 1 },
  { slug: "samsung-phone", name: "Samsung", parentSlug: "dien-thoai", sortOrder: 2 },
  { slug: "xiaomi-phone", name: "Xiaomi", parentSlug: "dien-thoai", sortOrder: 3 },
  { slug: "laptop", name: "Laptop", sortOrder: 2 },
  { slug: "laptop-gaming", name: "Laptop Gaming", parentSlug: "laptop", sortOrder: 1 },
  { slug: "laptop-macbook", name: "MacBook", parentSlug: "laptop", sortOrder: 2 },
  { slug: "laptop-van-phong", name: "Laptop văn phòng", parentSlug: "laptop", sortOrder: 3 },
  { slug: "tablet", name: "Máy tính bảng", sortOrder: 3 },
  { slug: "am-thanh", name: "Âm thanh", sortOrder: 4 },
  { slug: "tai-nghe", name: "Tai nghe", parentSlug: "am-thanh", sortOrder: 1 },
  { slug: "loa", name: "Loa", parentSlug: "am-thanh", sortOrder: 2 },
  { slug: "dong-ho", name: "Đồng hồ thông minh", sortOrder: 5 },
  { slug: "phu-kien", name: "Phụ kiện", sortOrder: 6 },
  { slug: "sac-cap", name: "Sạc & Cáp", parentSlug: "phu-kien", sortOrder: 1 },
  { slug: "op-lung", name: "Ốp lưng", parentSlug: "phu-kien", sortOrder: 2 },
  { slug: "man-hinh", name: "Màn hình", sortOrder: 7 },
  { slug: "tivi", name: "Tivi", sortOrder: 8 },
];

const ATTRIBUTES = [
  { code: "ram", name: "RAM", valueType: "select", allowedValues: "[\"4GB\",\"6GB\",\"8GB\",\"12GB\",\"16GB\",\"32GB\"]" },
  { code: "storage", name: "Bộ nhớ trong", valueType: "select", allowedValues: "[\"64GB\",\"128GB\",\"256GB\",\"512GB\",\"1TB\",\"2TB\"]" },
  { code: "color", name: "Màu sắc", valueType: "select", allowedValues: "[\"Đen\",\"Trắng\",\"Xanh\",\"Tím\",\"Vàng\",\"Bạc\",\"Xám\"]", isColor: true },
  { code: "cpu", name: "Vi xử lý", valueType: "text" },
  { code: "gpu", name: "Card đồ họa", valueType: "text" },
  { code: "screen", name: "Màn hình", valueType: "text" },
  { code: "battery", name: "Pin", valueType: "text" },
  { code: "camera", name: "Camera", valueType: "text" },
  { code: "os", name: "Hệ điều hành", valueType: "text" },
  { code: "connectivity", name: "Kết nối", valueType: "text" },
  { code: "weight", name: "Trọng lượng", valueType: "text" },
  { code: "refresh_rate", name: "Tần số quét", valueType: "text" },
];

const CATEGORY_ATTRIBUTES = [
  { categorySlug: "dien-thoai", attributeCode: "storage", isVariant: true, isRequired: true },
  { categorySlug: "dien-thoai", attributeCode: "color", isVariant: true, isRequired: true },
  { categorySlug: "dien-thoai", attributeCode: "battery", isVariant: false, isRequired: false },
  { categorySlug: "dien-thoai", attributeCode: "camera", isVariant: false, isRequired: false },
  { categorySlug: "dien-thoai", attributeCode: "os", isVariant: false, isRequired: false },
  { categorySlug: "iphone", attributeCode: "storage", isVariant: true, isRequired: true },
  { categorySlug: "iphone", attributeCode: "color", isVariant: true, isRequired: true },
  { categorySlug: "laptop", attributeCode: "ram", isVariant: false, isRequired: true },
  { categorySlug: "laptop", attributeCode: "storage", isVariant: true, isRequired: true },
  { categorySlug: "laptop", attributeCode: "color", isVariant: true, isRequired: false },
  { categorySlug: "laptop", attributeCode: "cpu", isVariant: false, isRequired: true },
  { categorySlug: "laptop", attributeCode: "gpu", isVariant: false, isRequired: false },
  { categorySlug: "laptop", attributeCode: "screen", isVariant: false, isRequired: true },
  { categorySlug: "laptop-gaming", attributeCode: "gpu", isVariant: false, isRequired: true },
  { categorySlug: "laptop-gaming", attributeCode: "refresh_rate", isVariant: false, isRequired: false },
  { categorySlug: "tablet", attributeCode: "storage", isVariant: true, isRequired: true },
  { categorySlug: "tablet", attributeCode: "color", isVariant: true, isRequired: true },
  { categorySlug: "tai-nghe", attributeCode: "color", isVariant: true, isRequired: false },
  { categorySlug: "tai-nghe", attributeCode: "connectivity", isVariant: false, isRequired: true },
  { categorySlug: "dong-ho", attributeCode: "color", isVariant: true, isRequired: true },
  { categorySlug: "man-hinh", attributeCode: "screen", isVariant: false, isRequired: true },
  { categorySlug: "man-hinh", attributeCode: "refresh_rate", isVariant: false, isRequired: true },
  { categorySlug: "tivi", attributeCode: "screen", isVariant: false, isRequired: true },
];

const BRANDS = [
  { slug: "apple", name: "Apple", categorySlugs: ["iphone", "laptop-macbook", "tablet", "dong-ho", "tai-nghe"] },
  { slug: "samsung", name: "Samsung", categorySlugs: ["samsung-phone", "tablet", "dong-ho", "tivi", "tai-nghe"] },
  { slug: "xiaomi", name: "Xiaomi", categorySlugs: ["xiaomi-phone", "tablet", "phu-kien", "sac-cap", "dong-ho"] },
  { slug: "oppo", name: "OPPO", categorySlugs: ["dien-thoai", "tai-nghe", "sac-cap"] },
  { slug: "vivo", name: "vivo", categorySlugs: ["dien-thoai", "tai-nghe"] },
  { slug: "realme", name: "realme", categorySlugs: ["dien-thoai", "tai-nghe", "sac-cap"] },
  { slug: "dell", name: "Dell", categorySlugs: ["laptop-van-phong", "laptop", "man-hinh"] },
  { slug: "asus", name: "ASUS", categorySlugs: ["laptop-gaming", "laptop", "man-hinh"] },
  { slug: "lenovo", name: "Lenovo", categorySlugs: ["laptop-van-phong", "laptop", "laptop-gaming"] },
  { slug: "hp", name: "HP", categorySlugs: ["laptop-van-phong", "laptop"] },
  { slug: "acer", name: "Acer", categorySlugs: ["laptop-gaming", "laptop-van-phong", "man-hinh"] },
  { slug: "msi", name: "MSI", categorySlugs: ["laptop-gaming"] },
  { slug: "lg", name: "LG", categorySlugs: ["tivi", "man-hinh"] },
  { slug: "sony", name: "Sony", categorySlugs: ["tai-nghe", "loa"] },
  { slug: "anker", name: "Anker", categorySlugs: ["sac-cap", "phu-kien"] },
  { slug: "jbl", name: "JBL", categorySlugs: ["loa", "tai-nghe"] },
  { slug: "garmin", name: "Garmin", categorySlugs: ["dong-ho"] },
  { slug: "huawei", name: "Huawei", categorySlugs: ["dong-ho", "tablet", "sac-cap"] },
  { slug: "nokia", name: "Nokia", categorySlugs: ["dien-thoai"] },
  { slug: "honor", name: "HONOR", categorySlugs: ["dien-thoai", "dong-ho"] },
];

/** Pool sản phẩm mẫu realistic — tên model phổ biến, mô tả/spec synthetic */
const PRODUCT_POOL = [
  // iPhone
  { slug: "iphone-15-pro-max", name: "iPhone 15 Pro Max", categorySlug: "iphone", brandSlug: "apple", price: 34990000, salePrice: 32990000, specs: { os: "iOS 17", camera: "48MP + 12MP + 12MP", battery: "4422 mAh", screen: "6.7\" Super Retina XDR" }, colors: ["Titan Đen", "Titan Trắng", "Titan Xanh"], storages: ["256GB", "512GB", "1TB"], tags: ["hot", "chinh-hang"] },
  { slug: "iphone-15", name: "iPhone 15", categorySlug: "iphone", brandSlug: "apple", price: 22990000, salePrice: 21490000, specs: { os: "iOS 17", camera: "48MP + 12MP", battery: "3349 mAh", screen: "6.1\" Super Retina XDR" }, colors: ["Đen", "Xanh", "Hồng", "Vàng"], storages: ["128GB", "256GB"], tags: ["new"] },
  { slug: "iphone-14", name: "iPhone 14", categorySlug: "iphone", brandSlug: "apple", price: 17990000, specs: { os: "iOS 16", camera: "12MP kép", battery: "3279 mAh", screen: "6.1\" OLED" }, colors: ["Đen", "Trắng", "Xanh"], storages: ["128GB", "256GB"], tags: ["sale"] },
  // Samsung phone
  { slug: "galaxy-s24-ultra", name: "Samsung Galaxy S24 Ultra 5G", categorySlug: "samsung-phone", brandSlug: "samsung", price: 33990000, salePrice: 31990000, specs: { os: "Android 14", camera: "200MP + 50MP + 12MP", battery: "5000 mAh", screen: "6.8\" Dynamic AMOLED 2X" }, colors: ["Đen", "Tím", "Vàng"], storages: ["256GB", "512GB", "1TB"], tags: ["hot", "5g"] },
  { slug: "galaxy-s24", name: "Samsung Galaxy S24 5G", categorySlug: "samsung-phone", brandSlug: "samsung", price: 22990000, salePrice: 20990000, specs: { os: "Android 14", camera: "50MP + 12MP + 10MP", battery: "4000 mAh", screen: "6.2\" Dynamic AMOLED" }, colors: ["Đen", "Tím", "Vàng"], storages: ["256GB", "512GB"], tags: ["5g"] },
  { slug: "galaxy-z-flip5", name: "Samsung Galaxy Z Flip5", categorySlug: "samsung-phone", brandSlug: "samsung", price: 25990000, specs: { os: "Android 13", camera: "12MP kép", battery: "3700 mAh", screen: "6.7\" Foldable AMOLED" }, colors: ["Tím", "Xanh", "Đen"], storages: ["256GB", "512GB"], tags: ["fold"] },
  { slug: "galaxy-a55", name: "Samsung Galaxy A55 5G", categorySlug: "samsung-phone", brandSlug: "samsung", price: 10990000, salePrice: 9990000, specs: { os: "Android 14", camera: "50MP OIS", battery: "5000 mAh", screen: "6.6\" Super AMOLED 120Hz" }, colors: ["Xanh", "Tím", "Đen"], storages: ["128GB", "256GB"], tags: ["ban-chay"] },
  // Xiaomi
  { slug: "xiaomi-14", name: "Xiaomi 14 5G", categorySlug: "xiaomi-phone", brandSlug: "xiaomi", price: 17990000, salePrice: 16990000, specs: { os: "Android 14 / HyperOS", camera: "Leica 50MP", battery: "4610 mAh", screen: "6.36\" AMOLED 120Hz" }, colors: ["Đen", "Trắng", "Xanh"], storages: ["256GB", "512GB"], tags: ["5g"] },
  { slug: "redmi-note-13-pro", name: "Redmi Note 13 Pro 5G", categorySlug: "xiaomi-phone", brandSlug: "xiaomi", price: 7990000, salePrice: 7490000, specs: { os: "Android 13", camera: "200MP", battery: "5100 mAh", screen: "6.67\" AMOLED 120Hz" }, colors: ["Đen", "Tím", "Xanh"], storages: ["128GB", "256GB"], tags: ["sale", "ban-chay"] },
  { slug: "poco-x6-pro", name: "POCO X6 Pro 5G", categorySlug: "xiaomi-phone", brandSlug: "xiaomi", price: 9990000, specs: { os: "Android 14", camera: "64MP OIS", battery: "5000 mAh", screen: "6.67\" AMOLED 120Hz" }, colors: ["Đen", "Vàng"], storages: ["256GB", "512GB"], tags: ["5g"] },
  // OPPO / vivo / realme
  { slug: "oppo-reno12-pro", name: "OPPO Reno12 Pro 5G", categorySlug: "dien-thoai", brandSlug: "oppo", price: 14990000, salePrice: 13990000, specs: { os: "Android 14", camera: "50MP OIS", battery: "5000 mAh", screen: "6.7\" AMOLED 120Hz" }, colors: ["Bạc", "Xanh"], storages: ["256GB", "512GB"], tags: ["5g"] },
  { slug: "vivo-v30", name: "vivo V30 5G", categorySlug: "dien-thoai", brandSlug: "vivo", price: 12990000, specs: { os: "Android 14", camera: "50MP OIS", battery: "5000 mAh", screen: "6.78\" AMOLED 120Hz" }, colors: ["Xanh", "Đen"], storages: ["256GB"], tags: ["5g"] },
  { slug: "realme-12-pro-plus", name: "realme 12 Pro+ 5G", categorySlug: "dien-thoai", brandSlug: "realme", price: 11990000, salePrice: 10990000, specs: { os: "Android 14", camera: "50MP Sony IMX890", battery: "5000 mAh", screen: "6.7\" AMOLED 120Hz" }, colors: ["Xanh", "Đen"], storages: ["256GB", "512GB"], tags: ["sale"] },
  // Laptop gaming
  { slug: "asus-rog-strix-g16", name: "ASUS ROG Strix G16 G614JIR", categorySlug: "laptop-gaming", brandSlug: "asus", price: 52990000, salePrice: 49990000, specs: { cpu: "Intel Core i9-14900HX", gpu: "NVIDIA RTX 4070 8GB", ram: "16GB DDR5", screen: "16\" QHD 240Hz", storage: "512GB SSD", weight: "2.5 kg" }, colors: ["Đen"], storages: ["512GB", "1TB"], tags: ["hot", "gaming"] },
  { slug: "msi-katana-15", name: "MSI Katana 15 B13VFK", categorySlug: "laptop-gaming", brandSlug: "msi", price: 32990000, salePrice: 30990000, specs: { cpu: "Intel Core i7-13620H", gpu: "NVIDIA RTX 4060 8GB", ram: "16GB DDR5", screen: "15.6\" FHD 144Hz", storage: "512GB SSD" }, colors: ["Đen"], storages: ["512GB", "1TB"], tags: ["gaming"] },
  { slug: "acer-nitro-v15", name: "Acer Nitro V 15 ANV15-51", categorySlug: "laptop-gaming", brandSlug: "acer", price: 24990000, specs: { cpu: "Intel Core i5-13420H", gpu: "NVIDIA RTX 4050 6GB", ram: "16GB DDR5", screen: "15.6\" FHD 144Hz", storage: "512GB SSD" }, colors: ["Đen"], storages: ["512GB"], tags: ["gaming", "sale"] },
  // Laptop văn phòng / MacBook
  { slug: "macbook-air-m3", name: "MacBook Air 13 inch M3", categorySlug: "laptop-macbook", brandSlug: "apple", price: 28990000, salePrice: 27490000, specs: { cpu: "Apple M3 8-core", gpu: "GPU 10-core", ram: "16GB", screen: "13.6\" Liquid Retina", storage: "256GB SSD", weight: "1.24 kg", os: "macOS Sonoma" }, colors: ["Midnight", "Starlight", "Space Gray", "Silver"], storages: ["256GB", "512GB"], tags: ["hot", "chinh-hang"] },
  { slug: "macbook-pro-14-m3-pro", name: "MacBook Pro 14 inch M3 Pro", categorySlug: "laptop-macbook", brandSlug: "apple", price: 49990000, specs: { cpu: "Apple M3 Pro 11-core", gpu: "GPU 14-core", ram: "18GB", screen: "14.2\" Liquid Retina XDR", storage: "512GB SSD", os: "macOS Sonoma" }, colors: ["Space Black", "Silver"], storages: ["512GB", "1TB"], tags: ["pro"] },
  { slug: "dell-inspiron-15", name: "Dell Inspiron 15 3530", categorySlug: "laptop-van-phong", brandSlug: "dell", price: 16990000, salePrice: 15990000, specs: { cpu: "Intel Core i5-1334U", ram: "16GB DDR4", screen: "15.6\" FHD", storage: "512GB SSD", weight: "1.65 kg", os: "Windows 11" }, colors: ["Bạc", "Đen"], storages: ["512GB"], tags: ["van-phong"] },
  { slug: "lenovo-ideapad-slim-5", name: "Lenovo IdeaPad Slim 5 14IMH9", categorySlug: "laptop-van-phong", brandSlug: "lenovo", price: 19990000, specs: { cpu: "Intel Core Ultra 5 125H", ram: "16GB LPDDR5x", screen: "14\" OLED 2.8K", storage: "512GB SSD", os: "Windows 11" }, colors: ["Xám"], storages: ["512GB", "1TB"], tags: ["oled"] },
  { slug: "hp-pavilion-plus-14", name: "HP Pavilion Plus 14-ew1008TU", categorySlug: "laptop-van-phong", brandSlug: "hp", price: 22990000, salePrice: 21490000, specs: { cpu: "Intel Core i5-1335U", ram: "16GB", screen: "14\" 2.2K IPS", storage: "512GB SSD", os: "Windows 11" }, colors: ["Bạc"], storages: ["512GB"], tags: ["sale"] },
  // Tablet
  { slug: "ipad-pro-m4", name: "iPad Pro M4 11 inch WiFi", categorySlug: "tablet", brandSlug: "apple", price: 29990000, specs: { cpu: "Apple M4", screen: "11\" Ultra Retina XDR", storage: "256GB", os: "iPadOS 17", battery: "Cả ngày" }, colors: ["Space Black", "Silver"], storages: ["256GB", "512GB", "1TB"], tags: ["hot"] },
  { slug: "ipad-air-m2", name: "iPad Air M2 11 inch", categorySlug: "tablet", brandSlug: "apple", price: 18990000, salePrice: 17990000, specs: { cpu: "Apple M2", screen: "11\" Liquid Retina", os: "iPadOS 17" }, colors: ["Xanh", "Tím", "Starlight", "Space Gray"], storages: ["128GB", "256GB"], tags: ["new"] },
  { slug: "galaxy-tab-s9", name: "Samsung Galaxy Tab S9 WiFi", categorySlug: "tablet", brandSlug: "samsung", price: 19990000, specs: { screen: "11\" Dynamic AMOLED 2X 120Hz", battery: "8400 mAh", os: "Android 13", connectivity: "WiFi 6E" }, colors: ["Be", "Graphite"], storages: ["128GB", "256GB"], tags: ["tablet"] },
  { slug: "xiaomi-pad-6", name: "Xiaomi Pad 6", categorySlug: "tablet", brandSlug: "xiaomi", price: 8990000, salePrice: 8490000, specs: { screen: "11\" 2.8K 144Hz", battery: "8840 mAh", os: "Android 13" }, colors: ["Xám", "Vàng", "Xanh"], storages: ["128GB", "256GB"], tags: ["sale"] },
  // Tai nghe / Loa
  { slug: "airpods-pro-2", name: "Apple AirPods Pro 2 USB-C", categorySlug: "tai-nghe", brandSlug: "apple", price: 6490000, salePrice: 5990000, specs: { connectivity: "Bluetooth 5.3, USB-C", battery: "6h + case 30h", weight: "50.8g" }, colors: ["Trắng"], storages: [], tags: ["hot", "chinh-hang"] },
  { slug: "galaxy-buds3-pro", name: "Samsung Galaxy Buds3 Pro", categorySlug: "tai-nghe", brandSlug: "samsung", price: 5490000, salePrice: 4990000, specs: { connectivity: "Bluetooth 5.4", battery: "6h + case 26h" }, colors: ["Trắng", "Xám"], storages: [], tags: ["new"] },
  { slug: "sony-wh1000xm5", name: "Sony WH-1000XM5", categorySlug: "tai-nghe", brandSlug: "sony", price: 8990000, salePrice: 7990000, specs: { connectivity: "Bluetooth 5.2, LDAC", battery: "30 giờ", weight: "250g" }, colors: ["Đen", "Bạc"], storages: [], tags: ["anc", "hot"] },
  { slug: "jbl-flip-6", name: "Loa Bluetooth JBL Flip 6", categorySlug: "loa", brandSlug: "jbl", price: 3490000, salePrice: 2990000, specs: { connectivity: "Bluetooth 5.1", battery: "12 giờ", weight: "550g" }, colors: ["Đen", "Xanh", "Hồng"], storages: [], tags: ["sale"] },
  // Đồng hồ
  { slug: "apple-watch-ultra-2", name: "Apple Watch Ultra 2 GPS", categorySlug: "dong-ho", brandSlug: "apple", price: 21990000, specs: { screen: "49mm Titanium", battery: "36 giờ", connectivity: "GPS, LTE optional" }, colors: ["Titanium"], storages: [], tags: ["hot"] },
  { slug: "apple-watch-series-9", name: "Apple Watch Series 9 GPS 45mm", categorySlug: "dong-ho", brandSlug: "apple", price: 10990000, salePrice: 9990000, specs: { screen: "45mm Always-On Retina", battery: "18 giờ" }, colors: ["Midnight", "Starlight", "Hồng", "Đỏ"], storages: [], tags: ["new"] },
  { slug: "galaxy-watch7", name: "Samsung Galaxy Watch7 44mm LTE", categorySlug: "dong-ho", brandSlug: "samsung", price: 9990000, salePrice: 8990000, specs: { screen: "44mm Super AMOLED", battery: "425 mAh", connectivity: "LTE, Bluetooth 5.3" }, colors: ["Xanh", "Bạc"], storages: [], tags: ["lte"] },
  { slug: "garmin-forerunner-965", name: "Garmin Forerunner 965", categorySlug: "dong-ho", brandSlug: "garmin", price: 15990000, specs: { screen: "1.4\" AMOLED", battery: "23 ngày smartwatch", connectivity: "GPS đa băng tần" }, colors: ["Đen", "Trắng"], storages: [], tags: ["sport"] },
  // Phụ kiện
  { slug: "anker-737-gan", name: "Sạc Anker 737 GaNPrime 120W", categorySlug: "sac-cap", brandSlug: "anker", price: 1890000, salePrice: 1690000, specs: { connectivity: "2x USB-C + 1x USB-A", weight: "180g" }, colors: ["Đen"], storages: [], tags: ["sale"] },
  { slug: "anker-powercore-20k", name: "Pin sạc dự phòng Anker PowerCore 20K", categorySlug: "sac-cap", brandSlug: "anker", price: 990000, specs: { battery: "20000 mAh", connectivity: "USB-C 22.5W" }, colors: ["Đen"], storages: [], tags: ["ban-chay"] },
  { slug: "apple-magsafe-charger", name: "Sạc Apple MagSafe", categorySlug: "sac-cap", brandSlug: "apple", price: 1290000, specs: { connectivity: "MagSafe 15W", weight: "50g" }, colors: ["Trắng"], storages: [], tags: ["chinh-hang"] },
  { slug: "cap-usb-c-2m-anker", name: "Cáp Anker USB-C to USB-C 2m 100W", categorySlug: "sac-cap", brandSlug: "anker", price: 290000, specs: { connectivity: "USB-C 100W PD" }, colors: ["Đen", "Trắng"], storages: [], tags: [] },
  // Màn hình / Tivi
  { slug: "lg-27gp850", name: "Màn hình LG UltraGear 27GP850-B 27 inch", categorySlug: "man-hinh", brandSlug: "lg", price: 8990000, salePrice: 8490000, specs: { screen: "27\" QHD IPS", refresh_rate: "165Hz (OC 180Hz)", connectivity: "HDMI 2.0, DP 1.4" }, colors: ["Đen"], storages: [], tags: ["gaming"] },
  { slug: "asus-proart-27", name: "Màn hình ASUS ProArt PA278QV 27 inch", categorySlug: "man-hinh", brandSlug: "asus", price: 9990000, specs: { screen: "27\" WQHD IPS", refresh_rate: "75Hz", connectivity: "HDMI, DP, USB Hub" }, colors: ["Đen"], storages: [], tags: ["creator"] },
  { slug: "lg-oled-c3-55", name: "Tivi LG OLED55C3PSA 55 inch", categorySlug: "tivi", brandSlug: "lg", price: 29990000, salePrice: 27990000, specs: { screen: "55\" OLED 4K 120Hz", connectivity: "HDMI 2.1 x4, WiFi, webOS 23" }, colors: ["Đen"], storages: [], tags: ["hot", "oled"] },
  { slug: "samsung-qled-q80c", name: "Tivi Samsung QA55Q80CAKXXV 55 inch", categorySlug: "tivi", brandSlug: "samsung", price: 24990000, salePrice: 22990000, specs: { screen: "55\" QLED 4K 120Hz", connectivity: "HDMI 2.1, Tizen OS" }, colors: ["Đen"], storages: [], tags: ["qled"] },
];

function parseArgs(argv) {
  const args = { count: 100, out: "data/catalog-100.json" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) args.count = Number(argv[++i]);
    else if (argv[i] === "--out" && argv[i + 1]) args.out = argv[++i];
  }
  return args;
}

function slugify(text) {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function img(seed, w = 800, h = 800) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

function buildDescription(item) {
  const lines = [
    `${item.name} — hàng chính hãng, nguyên seal, bảo hành đầy đủ.`,
    "✓ Giao hàng nhanh toàn quốc | ✓ Đổi trả 7 ngày | ✓ Hỗ trợ trả góp 0%",
  ];
  if (item.specs?.screen) lines.push(`Màn hình: ${item.specs.screen}`);
  if (item.specs?.cpu) lines.push(`CPU: ${item.specs.cpu}`);
  if (item.specs?.camera) lines.push(`Camera: ${item.specs.camera}`);
  if (item.specs?.battery) lines.push(`Pin: ${item.specs.battery}`);
  return lines.join("\n");
}

function buildVariants(item, productSlug) {
  const colors = item.colors?.length ? item.colors : ["Đen"];
  const storages = item.storages?.length ? item.storages : [];
  const variants = [];

  if (storages.length === 0) {
    colors.forEach((color, ci) => {
      const sku = `${productSlug.toUpperCase().replace(/-/g, "")}-${slugify(color).toUpperCase().slice(0, 6)}`;
      variants.push({
        sku,
        price: item.salePrice || item.price,
        costPrice: Math.round(item.price * 0.72),
        imageUrl: img(`${productSlug}-${ci}`, 600, 600),
        active: true,
        options: { color },
      });
    });
    return variants;
  }

  colors.forEach((color) => {
    storages.forEach((storage, si) => {
      const storagePremium = si * 2000000;
      const base = item.salePrice || item.price;
      const sku = `${productSlug.toUpperCase().replace(/-/g, "").slice(0, 12)}-${slugify(color).slice(0, 4).toUpperCase()}-${storage.replace(/\s/g, "")}`;
      const opts = { color, storage };
      if (item.specs?.ram) opts.ram = item.specs.ram;
      variants.push({
        sku,
        price: base + storagePremium,
        costPrice: Math.round((base + storagePremium) * 0.72),
        imageUrl: img(`${productSlug}-${color}-${storage}`, 600, 600),
        active: true,
        options: opts,
      });
    });
  });
  return variants;
}

function expandPoolToCount(count) {
  const products = [];
  const usedSlugs = new Set();

  for (let i = 0; i < count; i++) {
    const base = PRODUCT_POOL[i % PRODUCT_POOL.length];
    const suffix = i >= PRODUCT_POOL.length ? `-v${Math.floor(i / PRODUCT_POOL.length) + 1}` : "";
    let slug = `${base.slug}${suffix}`;
    let n = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base.slug}-${n++}`;
    }
    usedSlugs.add(slug);

    const name = suffix ? `${base.name} (Bản ${Math.floor(i / PRODUCT_POOL.length) + 1})` : base.name;
    const priceAdjust = (i % 5) * 200000;

    products.push({
      slug,
      name,
      categorySlug: base.categorySlug,
      brandSlug: base.brandSlug,
      description: buildDescription(base),
      price: base.price + priceAdjust,
      salePrice: base.salePrice ? base.salePrice + priceAdjust : null,
      costPrice: Math.round((base.salePrice || base.price) * 0.72),
      imageUrl: img(slug, 800, 800),
      images: [
        img(`${slug}-g1`, 800, 800),
        img(`${slug}-g2`, 800, 800),
        img(`${slug}-g3`, 800, 600),
      ],
      status: "PUBLISHED",
      active: true,
      warrantyPeriod: base.categorySlug.includes("phone") || base.categorySlug.includes("laptop") ? 12 : 6,
      warrantyPolicy: "Bảo hành chính hãng. 1 đổi 1 lỗi NSX trong 30 ngày.",
      specs: { ...base.specs },
      tags: [...(base.tags || []), ...(i % 7 === 0 ? ["flash-sale"] : [])],
      variants: buildVariants(base, slug),
    });
  }
  return products;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const brands = BRANDS.map((b) => ({
    ...b,
    active: true,
    logoUrl: BRAND_LOGOS[b.slug] || `https://picsum.photos/seed/logo-${b.slug}/160/80`,
    description: `${b.name} — thương hiệu chính hãng phân phối tại AuraTech.`,
  }));

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: "100 sản phẩm demo synthetic — cấu trúc ecommerce VN, không scrape website bên thứ ba.",
    attributes: ATTRIBUTES,
    categories: CATEGORIES.map((c) => ({ ...c, active: true })),
    categoryAttributes: CATEGORY_ATTRIBUTES,
    brands,
    products: expandPoolToCount(args.count),
  };

  const outPath = path.resolve(__dirname, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  console.log(`✅ catalog-100 manifest generated`);
  console.log(`   Products:   ${manifest.products.length}`);
  console.log(`   Categories: ${manifest.categories.length}`);
  console.log(`   Brands:     ${manifest.brands.length}`);
  console.log(`   Variants:   ${manifest.products.reduce((s, p) => s + p.variants.length, 0)}`);
  console.log(`   Output:     ${outPath}`);
}

main();
