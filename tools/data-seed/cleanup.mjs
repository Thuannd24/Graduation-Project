#!/usr/bin/env node
/** Xoá toàn bộ dữ liệu seed (user/order/event tổng hợp) mà không sinh lại — dùng khi muốn dọn
 * sạch trước khi demo bằng dữ liệu khác, hoặc trước khi nộp đồ án. */
import { loadEnvFile } from "./lib/env.mjs";
import { cleanupSeedData } from "./lib/cleanupData.mjs";
import { closePool } from "./lib/db.mjs";

loadEnvFile();

cleanupSeedData()
  .then((result) => {
    console.log(
      `Đã xoá: ${result.usersDeleted} user, ${result.ordersDeleted} order, ${result.eventsDeleted} event.`
    );
  })
  .catch((err) => {
    console.error("Cleanup thất bại:", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
