#!/usr/bin/env node
/**
 * Loại bỏ khỏi manifests/*.json những sản phẩm không có ảnh thật (mirror thất bại hoặc
 * chưa từng có ảnh từ lúc scrape — thường là trang "đăng ký nhận tin"/sắp ra mắt bị
 * nhận nhầm là sản phẩm thật). Tiêu chí: imageUrl chính phải là URL đã mirror lên R2.
 *
 * Usage: node clean-broken-products.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();
const R2_BASE = process.env.R2_PUBLIC_URL_BASE;
if (!R2_BASE) {
  console.error("❌ Thiếu R2_PUBLIC_URL_BASE trong .env");
  process.exit(1);
}

const manifestsDir = path.join(__dirname, "manifests");
const files = fs.readdirSync(manifestsDir).filter((f) => f.endsWith(".json"));

let totalRemoved = 0;
let totalKept = 0;

for (const file of files) {
  const filePath = path.join(manifestsDir, file);
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const before = manifest.products.length;

  const removed = [];
  manifest.products = manifest.products.filter((p) => {
    const hasRealImage = typeof p.imageUrl === "string" && p.imageUrl.startsWith(R2_BASE);
    if (!hasRealImage) removed.push(p.name);
    return hasRealImage;
  });

  const after = manifest.products.length;
  if (before !== after) {
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
    console.log(`  ${file}: xóa ${before - after} sp`);
    removed.forEach((n) => console.log(`      - ${n}`));
  }
  totalRemoved += before - after;
  totalKept += after;
}

console.log(`\n✅ Hoàn tất — đã xóa ${totalRemoved} sản phẩm không có ảnh thật, giữ lại ${totalKept} sản phẩm.`);
