#!/usr/bin/env node
/**
 * Tải dataset "Brazilian E-Commerce Public Dataset by Olist" từ Kaggle
 * (https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce), giấy phép CC BY-NC-SA 4.0 —
 * CHỈ dùng phi thương mại (đúng mục đích đồ án tốt nghiệp). Dùng thẳng Kaggle public API qua
 * HTTP Basic Auth (username/key từ kaggle.json) — KHÔNG cần cài Kaggle CLI/Python.
 *
 * Usage: node download.mjs
 * Yêu cầu: KAGGLE_USERNAME, KAGGLE_KEY trong .env (xem .env.example — cách lấy 2 giá trị này).
 */
import { loadEnvFile } from "./lib/env.mjs";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const OWNER = "olistbr";
const DATASET = "brazilian-ecommerce";
const DATA_DIR = new URL("./data/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ZIP_PATH = path.join(DATA_DIR, "olist.zip");

async function main() {
  loadEnvFile();
  const username = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY;
  if (!username || !key) {
    console.error(
      "Thiếu KAGGLE_USERNAME/KAGGLE_KEY trong .env. Lấy 2 giá trị này từ kaggle.json " +
        "(https://www.kaggle.com/settings -> API -> Create New Token)."
    );
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const url = `https://www.kaggle.com/api/v1/datasets/download/${OWNER}/${DATASET}`;
  console.log(`Đang tải ${url} ...`);
  const auth = Buffer.from(`${username}:${key}`).toString("base64");
  const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Tải thất bại: HTTP ${response.status}. ${body.slice(0, 500)}`);
    console.error(
      "Kiểm tra lại: (1) username/key đúng chưa, (2) đã bấm 'I Understand and Accept' điều khoản " +
        "dataset trên trang Kaggle chưa (Kaggle yêu cầu chấp nhận thủ công lần đầu qua UI trước khi " +
        "API cho tải)."
    );
    process.exit(1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(ZIP_PATH, buffer);
  console.log(`Đã tải ${(buffer.length / 1024 / 1024).toFixed(1)} MB -> ${ZIP_PATH}`);

  console.log("Giải nén...");
  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(DATA_DIR, true);
  const csvFiles = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  console.log(`Đã giải nén ${csvFiles.length} file CSV vào ${DATA_DIR}:`);
  csvFiles.forEach((f) => console.log(`  - ${f}`));
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exitCode = 1;
});
