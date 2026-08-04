// Đọc các file CSV gốc của Olist (đã tải + giải nén bằng download.mjs) — dùng csv-parse với
// `columns: true` (đọc theo TÊN cột ở header, không theo vị trí) để lỗi sai tên cột (vd Kaggle đổi
// định dạng) báo rõ ràng (undefined) thay vì lặng lẽ lệch cột.
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const REQUIRED_FILES = [
  "olist_customers_dataset.csv",
  "olist_orders_dataset.csv",
  "olist_order_items_dataset.csv",
  "olist_order_reviews_dataset.csv",
  "olist_products_dataset.csv",
  "product_category_name_translation.csv",
];

export function assertDatasetPresent(dataDir) {
  const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(dataDir, f)));
  if (missing.length > 0) {
    throw new Error(
      `Thiếu file trong ${dataDir}: ${missing.join(", ")}. Chạy \`node download.mjs\` trước.`
    );
  }
}

function readCsv(dataDir, filename, requiredColumns) {
  const raw = fs.readFileSync(path.join(dataDir, filename), "utf8");
  // `bom: true`: product_category_name_translation.csv (Kaggle) có BOM UTF-8 ở đầu file — thiếu cờ
  // này thì tên cột đầu tiên sẽ là "﻿product_category_name" thay vì "product_category_name",
  // làm mọi lookup theo tên cột đó thất bại âm thầm. Phát hiện khi soát thật header file tải về.
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true });
  if (rows.length > 0 && requiredColumns) {
    const actualColumns = new Set(Object.keys(rows[0]));
    const missing = requiredColumns.filter((c) => !actualColumns.has(c));
    if (missing.length > 0) {
      throw new Error(
        `${filename}: thiếu cột ${missing.join(", ")} (header thật: ${[...actualColumns].join(", ")}). ` +
          `Kaggle có thể đã đổi tên cột — kiểm tra lại trước khi tin số liệu import.`
      );
    }
  }
  return rows;
}

// Cột BẮT BUỘC phải khớp đúng tên — nếu Kaggle đổi schema, báo lỗi rõ ràng ngay khi đọc thay vì
// để `undefined` âm thầm lan xuống các bước sau (vd customer_unique_id undefined -> mọi user gộp
// làm 1, hoặc order_purchase_timestamp undefined -> Invalid Date bị lọc bỏ âm thầm).
export function loadOlistDataset(dataDir) {
  assertDatasetPresent(dataDir);
  return {
    customers: readCsv(dataDir, "olist_customers_dataset.csv", ["customer_id", "customer_unique_id"]),
    orders: readCsv(dataDir, "olist_orders_dataset.csv", ["order_id", "customer_id", "order_status", "order_purchase_timestamp"]),
    orderItems: readCsv(dataDir, "olist_order_items_dataset.csv", ["order_id", "product_id", "price", "freight_value"]),
    reviews: readCsv(dataDir, "olist_order_reviews_dataset.csv", ["order_id", "review_score", "review_creation_date"]),
    products: readCsv(dataDir, "olist_products_dataset.csv", ["product_id", "product_category_name"]),
    categoryTranslation: readCsv(dataDir, "product_category_name_translation.csv", ["product_category_name", "product_category_name_english"]),
  };
}
