#!/usr/bin/env node
/**
 * Generate large synthetic catalog manifest for load testing import pipeline.
 * Usage: node generate-manifest.mjs --count 500 --out data/generated-manifest.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_CATEGORIES = [
  { slug: "dien-thoai", name: "Điện thoại", sortOrder: 1 },
  { slug: "iphone", name: "iPhone", parentSlug: "dien-thoai", sortOrder: 1 },
  { slug: "samsung-phone", name: "Samsung", parentSlug: "dien-thoai", sortOrder: 2 },
  { slug: "laptop", name: "Laptop", sortOrder: 2 },
  { slug: "laptop-gaming", name: "Laptop gaming", parentSlug: "laptop", sortOrder: 1 },
  { slug: "laptop-van-phong", name: "Laptop văn phòng", parentSlug: "laptop", sortOrder: 2 },
  { slug: "tablet", name: "Máy tính bảng", sortOrder: 3 },
  { slug: "phu-kien", name: "Phụ kiện", sortOrder: 4 },
  { slug: "am-thanh", name: "Âm thanh", sortOrder: 5 },
  { slug: "dong-ho", name: "Đồng hồ", sortOrder: 6 },
];

const BASE_BRANDS = [
  { slug: "apple", name: "Apple", categorySlugs: ["dien-thoai", "iphone", "laptop", "tablet", "dong-ho"] },
  { slug: "samsung", name: "Samsung", categorySlugs: ["dien-thoai", "samsung-phone", "tablet", "dong-ho"] },
  { slug: "xiaomi", name: "Xiaomi", categorySlugs: ["dien-thoai", "tablet", "phu-kien"] },
  { slug: "dell", name: "Dell", categorySlugs: ["laptop", "laptop-van-phong"] },
  { slug: "asus", name: "ASUS", categorySlugs: ["laptop", "laptop-gaming"] },
  { slug: "lenovo", name: "Lenovo", categorySlugs: ["laptop", "laptop-van-phong"] },
  { slug: "hp", name: "HP", categorySlugs: ["laptop"] },
  { slug: "sony", name: "Sony", categorySlugs: ["am-thanh"] },
  { slug: "anker", name: "Anker", categorySlugs: ["phu-kien"] },
  { slug: "baseus", name: "Baseus", categorySlugs: ["phu-kien"] },
];

const ATTRIBUTES = [
  { code: "ram", name: "RAM", valueType: "select", allowedValues: "[\"8GB\",\"16GB\",\"32GB\"]" },
  { code: "storage", name: "Bộ nhớ", valueType: "select", allowedValues: "[\"128GB\",\"256GB\",\"512GB\",\"1TB\"]", isVariant: true },
  { code: "color", name: "Màu sắc", valueType: "select", allowedValues: "[\"Đen\",\"Trắng\",\"Xanh\",\"Tím\"]", isColor: true, isVariant: true },
  { code: "cpu", name: "CPU", valueType: "text" },
  { code: "screen", name: "Màn hình", valueType: "text" },
  { code: "battery", name: "Pin", valueType: "text" },
  { code: "os", name: "Hệ điều hành", valueType: "text" },
  { code: "connectivity", name: "Kết nối", valueType: "text" },
];

const CATEGORY_ATTRS = [
  { categorySlug: "laptop", attributeCode: "ram", isVariant: false, isRequired: true },
  { categorySlug: "laptop", attributeCode: "storage", isVariant: true, isRequired: true },
  { categorySlug: "laptop", attributeCode: "color", isVariant: true, isRequired: false },
  { categorySlug: "laptop", attributeCode: "cpu", isVariant: false, isRequired: true },
  { categorySlug: "laptop", attributeCode: "screen", isVariant: false, isRequired: false },
  { categorySlug: "dien-thoai", attributeCode: "storage", isVariant: true, isRequired: true },
  { categorySlug: "dien-thoai", attributeCode: "color", isVariant: true, isRequired: true },
  { categorySlug: "dien-thoai", attributeCode: "battery", isVariant: false, isRequired: false },
  { categorySlug: "iphone", attributeCode: "storage", isVariant: true, isRequired: true },
  { categorySlug: "iphone", attributeCode: "color", isVariant: true, isRequired: true },
];

const PRODUCT_TEMPLATES = [
  { prefix: "phone", categorySlug: "dien-thoai", brandSlug: "samsung", basePrice: 8990000 },
  { prefix: "phone", categorySlug: "iphone", brandSlug: "apple", basePrice: 21990000 },
  { prefix: "laptop", categorySlug: "laptop-gaming", brandSlug: "asus", basePrice: 25990000 },
  { prefix: "laptop", categorySlug: "laptop-van-phong", brandSlug: "dell", basePrice: 17990000 },
  { prefix: "tablet", categorySlug: "tablet", brandSlug: "apple", basePrice: 12990000 },
  { prefix: "accessory", categorySlug: "phu-kien", brandSlug: "anker", basePrice: 490000 },
  { prefix: "audio", categorySlug: "am-thanh", brandSlug: "sony", basePrice: 2990000 },
  { prefix: "watch", categorySlug: "dong-ho", brandSlug: "apple", basePrice: 9990000 },
];

const COLORS = ["den", "trang", "xanh", "tim"];
const STORAGES = ["128gb", "256gb", "512gb"];
const RAMS = ["8gb", "16gb"];

function parseArgs(argv) {
  const args = { count: 200, out: "data/generated-manifest.json" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) args.count = Number(argv[++i]);
    else if (argv[i] === "--out" && argv[i + 1]) args.out = argv[++i];
  }
  return args;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildProducts(count) {
  const products = [];
  for (let i = 1; i <= count; i++) {
    const tpl = PRODUCT_TEMPLATES[i % PRODUCT_TEMPLATES.length];
    const slug = `${tpl.prefix}-demo-${String(i).padStart(4, "0")}`;
    const price = tpl.basePrice + (i % 7) * 500000;
    const salePrice = i % 3 === 0 ? price - 1000000 : null;
    const hasVariants = tpl.prefix === "phone" || tpl.prefix === "laptop";

    const specs = tpl.prefix === "laptop"
      ? { cpu: "Intel Core i5", ram: "16GB", screen: "15.6 inch FHD" }
      : tpl.prefix === "phone"
        ? { battery: "4500mAh", os: "Android 15" }
        : {};

    const variants = [];
    if (hasVariants) {
      let vi = 0;
      for (const color of COLORS.slice(0, 2)) {
        for (const storage of STORAGES.slice(0, 2)) {
          vi++;
          const sku = `${slug.toUpperCase()}-${color.toUpperCase()}-${storage.toUpperCase()}`;
          const options = { color: color === "den" ? "Đen" : "Trắng", storage: storage.toUpperCase() };
          if (tpl.prefix === "laptop") options.ram = "16GB";
          variants.push({
            sku,
            price: salePrice || price,
            options,
          });
        }
      }
    }

    products.push({
      slug,
      name: `${tpl.brandSlug.toUpperCase()} ${tpl.prefix} Demo ${i}`,
      categorySlug: tpl.categorySlug,
      brandSlug: tpl.brandSlug,
      description: `Sản phẩm demo số ${i} — dữ liệu synthetic cho test import.`,
      price,
      salePrice,
      costPrice: Math.round(price * 0.75),
      imageUrl: `https://picsum.photos/seed/${slug}/600/600`,
      images: [
        `https://picsum.photos/seed/${slug}-1/600/600`,
        `https://picsum.photos/seed/${slug}-2/600/600`,
      ],
      status: "PUBLISHED",
      active: true,
      warrantyPeriod: 12,
      warrantyPolicy: "Bảo hành chính hãng 12 tháng",
      specs,
      tags: i % 5 === 0 ? ["hot", "new"] : i % 2 === 0 ? ["sale"] : [],
      variants,
    });
  }
  return products;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: "Synthetic demo data — safe for graduation project import testing",
    attributes: ATTRIBUTES.map(({ isVariant, isColor, ...rest }) => rest),
    categories: BASE_CATEGORIES.map((c) => ({ ...c, active: true })),
    categoryAttributes: CATEGORY_ATTRS,
    brands: BASE_BRANDS.map((b) => ({ ...b, active: true, logoUrl: `https://picsum.photos/seed/brand-${b.slug}/120/60` })),
    products: buildProducts(args.count),
  };

  const outPath = path.resolve(__dirname, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  console.log(`✅ Generated manifest with ${manifest.products.length} products`);
  console.log(`   Categories: ${manifest.categories.length}`);
  console.log(`   Brands:     ${manifest.brands.length}`);
  console.log(`   Output:     ${outPath}`);
}

main();
