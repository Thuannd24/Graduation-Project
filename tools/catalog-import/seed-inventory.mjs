#!/usr/bin/env node
/**
 * Seed tồn kho cho toàn bộ variant sản phẩm đã import (mặc định mỗi variant = 10).
 * Chạy SAU khi đã `node setup.mjs` (cần có product/variant thật trong DB trước).
 *
 * Usage:
 *   node seed-inventory.mjs              # set 10 cho mọi variant
 *   node seed-inventory.mjs --qty 20     # đổi số lượng
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

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchAllProducts(baseUrl, headers) {
  const all = [];
  let page = 0;
  const size = 100;
  while (true) {
    const res = await fetch(`${baseUrl}/public/products?page=${page}&size=${size}`, { headers });
    const payload = await res.json();
    const data = payload.data || {};
    const content = data.content || [];
    all.push(...content);
    if (content.length < size) break;
    page++;
  }
  return all;
}

async function setInventory(baseUrl, headers, productId, variantId, qty, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${baseUrl}/admin/inventories/${productId}?variantId=${variantId}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: qty }),
    });
    if (res.ok) return { ok: true };
    if (attempt === retries) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 150)}` };
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
}

async function main() {
  loadEnvFile();
  const productUrl = process.env.PRODUCT_SERVICE_URL || process.env.API_BASE_URL || "http://localhost:8080/api/v1";
  const inventoryUrl = process.env.INVENTORY_SERVICE_URL || process.env.API_BASE_URL || "http://localhost:8080/api/v1";
  const token = process.env.ADMIN_TOKEN || "";
  const qtyArgIdx = process.argv.indexOf("--qty");
  const qty = qtyArgIdx !== -1 ? Number(process.argv[qtyArgIdx + 1]) : 10;

  if (!token) {
    console.error("❌ Thiếu ADMIN_TOKEN trong .env");
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${token}` };

  console.log(`\n📦 Lấy danh sách sản phẩm...`);
  const products = await fetchAllProducts(productUrl, headers);
  console.log(`  → ${products.length} sản phẩm`);

  const tasks = [];
  for (const p of products) {
    const variants = p.variants && p.variants.length ? p.variants : [{ id: 0 }];
    for (const v of variants) {
      tasks.push({ productId: p.id, variantId: v.id ?? 0, name: p.name });
    }
  }
  console.log(`  → ${tasks.length} variant cần set tồn kho = ${qty}\n`);
  let ok = 0;
  let failed = 0;
  await mapPool(tasks, 1, async (t) => {
    await new Promise((r) => setTimeout(r, 60)); // Sleep 60ms to prevent API Gateway Rate Limiting (429)
    const result = await setInventory(inventoryUrl, headers, t.productId, t.variantId, qty);
    if (result.ok) {
      ok++;
    } else {
      failed++;
      console.warn(`  ⚠️  ${t.name} (product ${t.productId}, variant ${t.variantId}): ${result.error}`);
    }
  });

  console.log(`\n✅ Hoàn tất — ${ok}/${tasks.length} variant đã set tồn kho = ${qty}${failed ? `, ${failed} lỗi` : ""}.`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
