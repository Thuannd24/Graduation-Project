#!/usr/bin/env node
/**
 * Mirror ảnh sản phẩm từ site nguồn (cellphones.com.vn) lên Cloudflare R2 (S3-compatible).
 * Sau khi chạy, URL ảnh trong manifest được thay bằng URL public trên R2 — không còn phụ thuộc site nguồn.
 *
 * Usage:
 *   node mirror-images.mjs --file manifests/iphone.json
 *   node mirror-images.mjs --all
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

function parseArgs(argv) {
  const args = { file: null, all: false, manifestsDir: "manifests", concurrency: 6 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) args.file = argv[++i];
    else if (argv[i] === "--all") args.all = true;
    else if (argv[i] === "--manifests-dir" && argv[i + 1]) args.manifestsDir = argv[++i];
    else if (argv[i] === "--concurrency" && argv[i + 1]) args.concurrency = Number(argv[++i]);
  }
  return args;
}

function extFromUrl(url) {
  const m = url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
  if (!m) return "jpg";
  return m[1].toLowerCase().replace("jpeg", "jpg");
}

// Simple bounded-concurrency worker pool (không cần thêm dependency ngoài)
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function fetchAndUpload(client, bucket, publicBase, sourceUrl, key, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
          "Referer": "https://cellphones.com.vn/",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/jpeg";

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentType: contentType,
      }));

      const base = publicBase.endsWith("/") ? publicBase.slice(0, -1) : publicBase;
      return `${base}/${key}`;
    } catch (e) {
      if (attempt === retries) {
        console.warn(`  ⚠️  Lỗi mirror (${e.message}): ${sourceUrl}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return null;
}

async function mirrorManifest(filePath, client, bucket, publicBase, concurrency) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const products = manifest.products || [];

  // Pass 1 — thu thập toàn bộ URL ảnh unique cần mirror, gán key object ổn định theo slug
  const urlToKey = new Map(); // sourceUrl -> objectKey (chưa upload)
  let counter = 0;

  function plan(url, slug, tag) {
    if (!url || urlToKey.has(url)) return;
    counter++;
    const ext = extFromUrl(url);
    urlToKey.set(url, `products/${slug}/${tag}-${counter}.${ext}`);
  }

  for (const p of products) {
    plan(p.imageUrl, p.slug, "main");
    (p.images || []).forEach((u, i) => plan(u, p.slug, `gallery-${i}`));
    (p.variants || []).forEach((v, i) => plan(v.imageUrl, p.slug, `variant-${i}`));
  }

  const tasks = [...urlToKey.entries()]; // [sourceUrl, key][]
  console.log(`  → ${tasks.length} ảnh unique cần mirror`);

  const urlToPublic = new Map(); // sourceUrl -> publicUrl | null
  await mapPool(tasks, concurrency, async ([sourceUrl, key]) => {
    const publicUrl = await fetchAndUpload(client, bucket, publicBase, sourceUrl, key);
    urlToPublic.set(sourceUrl, publicUrl);
  });

  // Pass 2 — ghi URL mới vào lại manifest, giữ URL gốc nếu mirror thất bại
  function rewrite(url) {
    if (!url) return url;
    const mapped = urlToPublic.get(url);
    return mapped || url;
  }
  for (const p of products) {
    p.imageUrl = rewrite(p.imageUrl);
    p.images = (p.images || []).map(rewrite);
    (p.variants || []).forEach((v) => { v.imageUrl = rewrite(v.imageUrl); });
  }

  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));

  const failed = [...urlToPublic.values()].filter((v) => !v).length;
  console.log(`  ✅ Xong — ${tasks.length - failed}/${tasks.length} thành công${failed ? `, ${failed} lỗi (giữ URL gốc)` : ""}`);
  return { total: tasks.length, failed };
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL_BASE;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    console.error("❌ Thiếu cấu hình R2 trong .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL_BASE).");
    console.error("   Xem .env.example để biết cách lấy các giá trị này từ Cloudflare Dashboard.");
    process.exit(1);
  }

  if (!args.file && !args.all) {
    console.error("❌ Cần chỉ định --file manifests/xxx.json hoặc --all (mirror toàn bộ manifests/).");
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const manifestsDirAbs = path.resolve(__dirname, args.manifestsDir);
  const files = args.all
    ? fs.readdirSync(manifestsDirAbs).filter((f) => f.endsWith(".json")).map((f) => path.join(args.manifestsDir, f))
    : [args.file];

  let totalAll = 0;
  let failedAll = 0;
  for (const f of files) {
    const filePath = path.resolve(__dirname, f);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Không tìm thấy file: ${filePath}`);
      continue;
    }
    console.log(`\n📦 ${f}`);
    const { total, failed } = await mirrorManifest(filePath, client, bucket, publicBase, args.concurrency);
    totalAll += total;
    failedAll += failed;
  }

  console.log(`\n✅ Hoàn tất — ${totalAll - failedAll}/${totalAll} ảnh đã mirror lên R2 (bucket: ${bucket}).`);
  if (failedAll) console.log(`⚠️  ${failedAll} ảnh lỗi, vẫn giữ URL gốc trong manifest — chạy lại lệnh này để thử mirror tiếp phần lỗi.`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
