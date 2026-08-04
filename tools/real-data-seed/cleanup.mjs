#!/usr/bin/env node
/** Xoá toàn bộ dữ liệu Olist đã import (đơn/hành vi/review/user) — KHÔNG cần chạy tay bình
 * thường (import.mjs --force tự gọi), chỉ dùng khi muốn dọn sạch mà không nạp lại ngay. */
import { loadEnvFile } from "./lib/env.mjs";
import { cleanupOlistData } from "./lib/cleanup.mjs";
import { closePool } from "./lib/db.mjs";

async function main() {
  loadEnvFile();
  const deleted = await cleanupOlistData();
  console.log(
    `Đã xoá: ${deleted.usersDeleted} user, ${deleted.ordersDeleted} order, ` +
      `${deleted.eventsDeleted} event, ${deleted.reviewsDeleted} review.`
  );
}

main()
  .catch((err) => {
    console.error("Cleanup thất bại:", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
