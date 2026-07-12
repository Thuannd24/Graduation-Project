#!/usr/bin/env node
/**
 * Catalog import CLI — mặc định DRY-RUN (chỉ validate, không ghi DB).
 *
 * Usage:
 *   node import.mjs --file data/sample-manifest.json
 *   node import.mjs --file data/generated-manifest.json --apply
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

function parseArgs(argv) {
  const args = { file: "data/sample-manifest.json", apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) args.file = argv[++i];
    else if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--help") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Catalog Import Tool (dry-run mặc định)

Commands:
  node import.mjs --file data/sample-manifest.json          Validate only
  node import.mjs --file data/generated-manifest.json --apply  Import thật

Env (.env):
  API_BASE_URL=http://localhost:8080/api/v1
  ADMIN_TOKEN=<keycloak_admin_jwt>   (bắt buộc khi --apply)

Generate large manifest:
  node generate-manifest.mjs --count 500 --out data/generated-manifest.json
`);
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const filePath = path.resolve(__dirname, args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Không tìm thấy file: ${filePath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const dryRun = !args.apply;
  const baseUrl = process.env.API_BASE_URL || "http://localhost:8080/api/v1";
  const token = process.env.ADMIN_TOKEN || "";

  console.log(`\n📦 File: ${args.file}`);
  console.log(`🔍 Mode: ${dryRun ? "DRY-RUN (validate only)" : "APPLY (ghi DB)"}`);
  console.log(`🌐 API:  ${baseUrl}/admin/import/catalog?dryRun=${dryRun}\n`);

  if (!dryRun && !token) {
    console.error("❌ Thiếu ADMIN_TOKEN trong .env — không thể import thật.");
    console.error("   Copy .env.example → .env và điền token admin Keycloak.");
    process.exit(1);
  }

  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${baseUrl}/admin/import/catalog?dryRun=${dryRun}`, {
      method: "POST",
      headers,
      body: JSON.stringify(manifest),
    });
  } catch (err) {
    console.error("❌ Không kết nối được API. BE đang chạy chưa?");
    console.error(`   ${err.message}`);
    process.exit(1);
  }

  const payload = await response.json().catch(() => ({}));
  const result = payload.data || payload;

  if (!response.ok) {
    console.error(`❌ HTTP ${response.status}: ${payload.message || response.statusText}`);
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  printResult(result, dryRun);

  const reportDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportName = dryRun ? "last-validate-report.json" : "last-import-report.json";
  fs.writeFileSync(path.join(reportDir, reportName), JSON.stringify(result, null, 2));
  console.log(`\n📄 Report saved: tools/catalog-import/reports/${reportName}`);

  if (result.errors?.length) process.exit(1);
}

function printResult(result, dryRun) {
  const c = result.counts || {};
  console.log(dryRun ? "✅ Validation passed" : result.success ? "✅ Import success" : "⚠️ Import finished with issues");
  console.log("\nCounts:");
  console.log(`  Attributes:  +${c.attributesCreated || 0} created, ~${c.attributesUpdated || 0} updated`);
  console.log(`  Categories:  +${c.categoriesCreated || 0} created, ~${c.categoriesUpdated || 0} updated`);
  console.log(`  Cat↔Attr:    ${c.categoryAttributesLinked || 0} links`);
  console.log(`  Brands:      +${c.brandsCreated || 0} created, ~${c.brandsUpdated || 0} updated`);
  console.log(`  Products:    +${c.productsCreated || 0} created, ~${c.productsUpdated || 0} updated`);

  if (result.errors?.length) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.slice(0, 20).forEach((e) => console.log(`   - ${e}`));
    if (result.errors.length > 20) console.log(`   ... và ${result.errors.length - 20} lỗi nữa`);
  }
  if (result.warnings?.length) {
    console.log(`\n⚠️ Warnings:`);
    result.warnings.forEach((w) => console.log(`   - ${w}`));
  }
}

main();
