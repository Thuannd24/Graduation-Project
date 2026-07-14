#!/usr/bin/env node
/**
 * Setup toàn bộ catalog bằng 1 lệnh — import hết manifests/*.json (attributes, categories,
 * brands, products, variants, ảnh) rồi flush Redis cache.
 *
 * Usage:
 *   node setup.mjs                 # import + flush cache
 *   node setup.mjs --dry-run       # chỉ validate, không ghi DB, không flush cache
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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

async function importFile(baseUrl, token, dryRun, filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}/admin/import/catalog?dryRun=${dryRun}`, {
    method: "POST",
    headers,
    body: JSON.stringify(manifest),
  });
  const payload = await res.json().catch(() => ({}));
  const result = payload.data || payload;

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${payload.message || res.statusText}` };
  }
  if (result.errors?.length) {
    return { ok: false, error: result.errors.join("; ") };
  }
  return { ok: true, counts: result.counts || {} };
}

async function main() {
  loadEnvFile();
  const dryRun = process.argv.includes("--dry-run");
  const baseUrl = process.env.API_BASE_URL || "http://localhost:8080/api/v1";
  const token = process.env.ADMIN_TOKEN || "";

  if (!dryRun && !token) {
    console.error("❌ Thiếu ADMIN_TOKEN trong .env — không thể import thật.");
    console.error("   Đăng nhập admin tại localhost:3000 → F12 → Application → Local Storage → access_token.");
    process.exit(1);
  }

  const manifestsDir = path.join(__dirname, "manifests");
  const files = fs.readdirSync(manifestsDir).filter((f) => f.endsWith(".json")).sort();

  console.log(`\n📦 Import ${files.length} file manifest (${dryRun ? "DRY-RUN" : "APPLY"}) → ${baseUrl}\n`);

  let okCount = 0;
  for (const file of files) {
    const filePath = path.join(manifestsDir, file);
    process.stdout.write(`  ${file.padEnd(28)} `);
    const result = await importFile(baseUrl, token, dryRun, filePath);
    if (result.ok) {
      const c = result.counts;
      console.log(`✅  products +${c.productsCreated || 0}/~${c.productsUpdated || 0}  brands +${c.brandsCreated || 0}/~${c.brandsUpdated || 0}`);
      okCount++;
    } else {
      console.log(`❌  ${result.error}`);
    }
  }

  console.log(`\n${okCount === files.length ? "✅" : "⚠️ "} Hoàn tất — ${okCount}/${files.length} file import thành công.`);

  if (dryRun) {
    console.log("\n(Dry-run — không ghi DB, không flush cache.)");
    return;
  }

  if (okCount < files.length) {
    console.log("\n⚠️  Có file lỗi (thường do ADMIN_TOKEN hết hạn giữa lúc chạy — token sống 15 phút).");
    console.log("   Lấy token mới rồi chạy lại `node setup.mjs` — các file đã import trước đó chỉ bị update, không tạo trùng.");
  }

  try {
    execSync("docker exec -i infra-redis redis-cli FLUSHDB", { stdio: "pipe" });
    console.log("✅ Đã flush Redis cache.");
  } catch (e) {
    console.log("⚠️  Không flush được Redis cache (container infra-redis không chạy?) — bỏ qua.");
  }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
