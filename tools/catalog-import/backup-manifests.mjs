#!/usr/bin/env node
/**
 * Backup toàn bộ file JSON trong manifests/ (dữ liệu text: giá, tên, specs, specsRaw...) lên Cloudflare R2.
 * Mục đích: dữ liệu đã crawl không chỉ tồn tại 1 bản duy nhất trên máy local — nếu máy hỏng/mất,
 * vẫn phục hồi được từ R2 (không cần crawl lại, không cần git).
 *
 * Usage:
 *   node backup-manifests.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

async function main() {
  loadEnvFile();

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error("❌ Thiếu cấu hình R2 trong .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).");
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const manifestsDir = path.resolve(__dirname, "manifests");
  const files = fs.readdirSync(manifestsDir).filter((f) => f.endsWith(".json"));

  console.log(`📦 Backup ${files.length} file manifest lên R2 (bucket: ${bucket}, prefix: manifests-backup/)\n`);

  let ok = 0;
  for (const file of files) {
    const filePath = path.join(manifestsDir, file);
    const body = fs.readFileSync(filePath);
    const key = `manifests-backup/${file}`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
      }));
      console.log(`  ✅ ${file} (${(body.length / 1024).toFixed(1)} KB)`);
      ok++;
    } catch (e) {
      console.warn(`  ⚠️  Lỗi backup ${file}: ${e.message}`);
    }
  }

  console.log(`\n✅ Hoàn tất — ${ok}/${files.length} file đã backup lên R2.`);
  console.log(`   Mỗi lần chạy lại lệnh này sẽ ghi đè bản backup cũ bằng dữ liệu manifests/ hiện tại (luôn giữ bản mới nhất).`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
