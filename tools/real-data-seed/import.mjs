#!/usr/bin/env node
/**
 * Nạp dữ liệu ĐƠN HÀNG + REVIEW THẬT (Olist Brazilian E-Commerce, Kaggle, giấy phép CC BY-NC-SA
 * 4.0 — chỉ dùng phi thương mại) vào DB, thay cho phần orders/reviews TỔNG HỢP của
 * tools/data-seed. Hành vi xem/bỏ giỏ vẫn phải sinh tổng hợp (neo theo mốc thời gian đơn hàng
 * THẬT — xem lib/behaviorFromOrders.mjs) vì Olist không có dữ liệu clickstream.
 *
 * Usage:
 *   node download.mjs                         # tải + giải nén dataset (1 lần, xem README.md)
 *   node import.mjs --dry-run                  # chỉ in thống kê, không ghi DB
 *   node import.mjs --customers 500            # import mẫu 500 khách hàng thật (mặc định: tất cả)
 *   node import.mjs --force                    # xoá dữ liệu Olist cũ (nếu có) rồi nạp lại
 *
 * Xem README.md để biết đầy đủ giả định/giới hạn (trạng thái đơn bị lược bớt, tên SP tổng hợp từ
 * category vì Olist không có tên SP thật, quy đổi BRL->VND...).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./lib/env.mjs";
import { loadOlistDataset } from "./lib/parseOlist.mjs";
import { buildImportPlan } from "./lib/mapOlist.mjs";
import { generateBehaviorFromOrders } from "./lib/behaviorFromOrders.mjs";
import { ensureCategories, ensureProducts, ensureUsers, writeOrders, writeReviews, writeEvents } from "./lib/writeReal.mjs";
import { countExistingOlistData, cleanupOlistData } from "./lib/cleanup.mjs";
import { closePool } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

function parseArgs(argv) {
  const args = { dryRun: false, force: false, maxCustomers: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--customers" && argv[i + 1]) args.maxCustomers = Number(argv[++i]);
  }
  return args;
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  const brlToVndRate = Number(process.env.BRL_TO_VND_RATE || 6000);

  if (!args.dryRun) {
    const existing = await countExistingOlistData();
    if (existing.users > 0 && !args.force) {
      console.error(
        `Đã có ${existing.users} user Olist trong DB. Dùng --force để xoá và nạp lại, hoặc --dry-run để chỉ xem thống kê.`
      );
      process.exit(1);
    }
    if (existing.users > 0 && args.force) {
      console.log(`Xoá dữ liệu Olist cũ (${existing.users} user)...`);
      const deleted = await cleanupOlistData();
      console.log(`Đã xoá: ${deleted.usersDeleted} user, ${deleted.ordersDeleted} order, ${deleted.eventsDeleted} event, ${deleted.reviewsDeleted} review.`);
    }
  }

  console.log(`Đọc CSV từ ${DATA_DIR} ...`);
  const dataset = loadOlistDataset(DATA_DIR);
  console.log(
    `Nạp thô: ${dataset.customers.length} customers, ${dataset.orders.length} orders, ` +
      `${dataset.orderItems.length} order_items, ${dataset.reviews.length} reviews, ${dataset.products.length} products.`
  );

  const plan = buildImportPlan(dataset, { brlToVndRate, maxCustomers: args.maxCustomers });

  const deliveredCount = plan.ordersToInsert.filter((o) => o.status === "DELIVERED").length;
  const cancelledCount = plan.ordersToInsert.length - deliveredCount;
  console.log("\n=== Thống kê dữ liệu THẬT sẽ nạp (Olist) ===");
  console.log(`Users (khách hàng thật, không login được — không có tài khoản Keycloak): ${plan.usersToInsert.length}`);
  console.log(`Orders: ${plan.ordersToInsert.length} (DELIVERED: ${deliveredCount}, CANCELLED: ${cancelledCount})`);
  console.log(`Products (import mới, tên tổng hợp từ category vì Olist không có tên SP thật): ${plan.productsToInsert.length}`);
  console.log(`Categories: ${plan.categories.length}`);
  console.log(`Reviews thật: ${plan.reviewsToInsert.length}`);
  console.log(`Quy đổi: 1 BRL = ${brlToVndRate} VND (chỉ để hiển thị, xem .env.example)`);
  console.log("=============================================\n");

  if (args.dryRun) {
    console.log("(--dry-run) Không ghi gì vào DB.");
    return;
  }

  console.log("Ghi categories...");
  const categorySlugToId = await ensureCategories(plan.categories);

  console.log("Ghi products...");
  const productSlugToRow = await ensureProducts(plan.productsToInsert, categorySlugToId);

  console.log("Ghi users...");
  await ensureUsers(plan.usersToInsert);

  console.log("Ghi orders + order_items...");
  const orderDbIdByOlistId = await writeOrders(plan.ordersToInsert, productSlugToRow);
  console.log(`Đã ghi ${orderDbIdByOlistId.size} orders.`);

  const userIdByOlistOrderId = new Map(plan.ordersToInsert.map((o) => [o.olistOrderId, o.userId]));

  console.log("Ghi reviews...");
  const reviewResult = await writeReviews(plan.reviewsToInsert, productSlugToRow, orderDbIdByOlistId, userIdByOlistOrderId);
  console.log(`Đã ghi ${reviewResult.reviewsWritten} reviews.`);

  console.log("Sinh + ghi hành vi xem/bỏ giỏ (tổng hợp, neo theo mốc đơn hàng THẬT)...");
  const ordersForBehavior = plan.ordersToInsert.map((o) => ({
    userId: o.userId,
    dbId: orderDbIdByOlistId.get(o.olistOrderId),
    createdAt: new Date(o.createdAt),
    items: o.items
      .map((item) => {
        const row = productSlugToRow.get(item.productSlug);
        return row ? { productId: row.id, categoryId: row.categoryId } : null;
      })
      .filter(Boolean),
  }));
  const events = generateBehaviorFromOrders(ordersForBehavior);
  const eventResult = await writeEvents(events);
  console.log(`Đã ghi ${eventResult.eventsWritten} events.`);

  console.log("\nXong. Đơn hàng/review là dữ liệu THẬT (Olist); hành vi xem/bỏ giỏ vẫn là tổng hợp");
  console.log("(neo theo mốc thời gian đơn hàng thật). Xem README.md mục 'Giới hạn' trước khi báo cáo.");
}

main()
  .catch((err) => {
    console.error("Import thất bại:", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
