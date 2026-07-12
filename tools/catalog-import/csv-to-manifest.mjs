#!/usr/bin/env node
/**
 * Convert CSV folder → catalog manifest JSON.
 * Usage: node csv-to-manifest.mjs --dir templates/csv --out data/from-csv-manifest.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { dir: "templates/csv", out: "data/from-csv-manifest.json" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) args.dir = argv[++i];
    else if (argv[i] === "--out" && argv[i + 1]) args.out = argv[++i];
  }
  return args;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || "").trim(); });
    return row;
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += ch;
  }
  result.push(current);
  return result;
}

function readCsv(dir, filename) {
  const full = path.join(dir, filename);
  if (!fs.existsSync(full)) return [];
  return parseCsv(fs.readFileSync(full, "utf8"));
}

function splitPipe(value) {
  return (value || "").split("|").map((s) => s.trim()).filter(Boolean);
}

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(__dirname, args.dir);

  const attributes = readCsv(dir, "attributes.csv").map((r) => ({
    code: r.code,
    name: r.name,
    valueType: r.value_type || "text",
    allowedValues: r.allowed_values || null,
    isColor: r.is_color === "true",
  }));

  const categories = readCsv(dir, "categories.csv").map((r) => ({
    slug: r.slug,
    name: r.name,
    parentSlug: r.parent_slug || null,
    imageUrl: r.image_url || null,
    sortOrder: r.sort_order ? Number(r.sort_order) : null,
    active: r.active !== "false",
  }));

  const categoryAttributes = readCsv(dir, "category_attributes.csv").map((r) => ({
    categorySlug: r.category_slug,
    attributeCode: r.attribute_code,
    isVariant: r.is_variant === "true",
    isRequired: r.is_required === "true",
  }));

  const brands = readCsv(dir, "brands.csv").map((r) => ({
    slug: r.slug,
    name: r.name,
    logoUrl: r.logo_url || null,
    description: r.description || null,
    active: r.active !== "false",
    categorySlugs: splitPipe(r.category_slugs),
  }));

  const variantRows = readCsv(dir, "variants.csv");
  const variantsByProduct = variantRows.reduce((acc, r) => {
    const list = acc[r.product_slug] || [];
    list.push({
      sku: r.sku,
      price: r.price ? Number(r.price) : null,
      costPrice: r.cost_price ? Number(r.cost_price) : null,
      imageUrl: r.image_url || null,
      active: r.active !== "false",
      options: parseJsonField(r.options_json, {}),
    });
    acc[r.product_slug] = list;
    return acc;
  }, {});

  const products = readCsv(dir, "products.csv").map((r) => ({
    slug: r.slug,
    name: r.name,
    categorySlug: r.category_slug,
    brandSlug: r.brand_slug || null,
    description: r.description || null,
    price: Number(r.price),
    salePrice: r.sale_price ? Number(r.sale_price) : null,
    costPrice: r.cost_price ? Number(r.cost_price) : null,
    imageUrl: r.image_url || null,
    images: splitPipe(r.images),
    status: r.status || "PUBLISHED",
    active: r.active !== "false",
    warrantyPeriod: r.warranty_period ? Number(r.warranty_period) : null,
    warrantyPolicy: r.warranty_policy || null,
    specs: parseJsonField(r.specs_json, {}),
    tags: splitPipe(r.tags),
    variants: variantsByProduct[r.slug] || [],
  }));

  const manifest = { attributes, categories, categoryAttributes, brands, products };
  const outPath = path.resolve(__dirname, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  console.log(`✅ CSV → manifest`);
  console.log(`   attributes: ${attributes.length}, categories: ${categories.length}`);
  console.log(`   brands: ${brands.length}, products: ${products.length}`);
  console.log(`   output: ${outPath}`);
}

main();
