#!/usr/bin/env node
/**
 * Sinh dữ liệu user/order/behavior TỔNG HỢP (synthetic) để mở khóa phần ML của churn-risk
 * detection (xem docs/canvas/churn-risk-implementation-plan.md Phase 3).
 *
 * QUAN TRỌNG: đây là dữ liệu tổng hợp, không phải hành vi người dùng thật. Metric đo được từ
 * model train trên dữ liệu này phản ánh "model có phục hồi được cấu trúc sinh dữ liệu hay
 * không", KHÔNG phải "model dự đoán đúng hành vi người thật" — nói rõ điều này khi báo cáo/bảo
 * vệ đồ án.
 *
 * Usage:
 *   node seed.mjs --dry-run                 # chỉ in thống kê, không ghi DB
 *   node seed.mjs                            # ghi DB thật (từ chối nếu đã seed trước đó)
 *   node seed.mjs --force                    # xoá seed cũ rồi sinh lại
 *   node seed.mjs --users 500 --demo-users 10 --months 12 --seed 42
 *
 * Yêu cầu trước khi chạy:
 *   - Đã `node ../catalog-import/setup.mjs` (cần có sản phẩm active trong ecommerce_product_db)
 *   - infra-mariadb đang chạy (docker compose -f BE/docker-compose-infra.yml up -d mariadb)
 *   - Muốn có user login thật (--demo-users > 0) thì Keycloak (infra-keycloak) cũng phải chạy
 */
import { loadEnvFile } from "./lib/env.mjs";
import { Rng } from "./lib/random.mjs";
import { loadCatalog } from "./lib/catalog.mjs";
import { generateUserProfiles } from "./lib/profiles.mjs";
import { simulateAllUsers } from "./lib/simulate.mjs";
import { ensureSeedUsers, countExistingSeedUsers } from "./lib/users.mjs";
import { generateReviews } from "./lib/reviews.mjs";
import { generateIssuedVouchers } from "./lib/vouchers.mjs";
import {
  writeOrders,
  writeEvents,
  writeReviews,
  writeVouchers,
  fetchInternalUserIdMap,
} from "./lib/writeData.mjs";
import { cleanupSeedData } from "./lib/cleanupData.mjs";
import { closePool } from "./lib/db.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Map<userId, Array<order>> chỉ đơn DELIVERED, sắp theo `createdAt` tăng dần — dùng để tìm đơn
 * "dùng voucher này" (voucher chỉ redeem được vào 1 đơn đã giao thành công, không phải đơn huỷ). */
function groupDeliveredOrdersByUser(orders) {
  const map = new Map();
  for (const o of orders) {
    if (o.status !== "DELIVERED") continue;
    if (!map.has(o.userId)) map.set(o.userId, []);
    map.get(o.userId).push(o);
  }
  for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
  return map;
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    seed: 42,
    users: 500,
    demoUsers: 10,
    months: 12,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--seed" && argv[i + 1]) args.seed = Number(argv[++i]);
    else if (a === "--users" && argv[i + 1]) args.users = Number(argv[++i]);
    else if (a === "--demo-users" && argv[i + 1]) args.demoUsers = Number(argv[++i]);
    else if (a === "--months" && argv[i + 1]) args.months = Number(argv[++i]);
    else if (a === "--help") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Data seed tool cho churn-risk detection (xem docs/canvas/churn-risk-implementation-plan.md)

  node seed.mjs --dry-run                  Chỉ in thống kê, không ghi DB
  node seed.mjs                             Ghi DB thật
  node seed.mjs --force                     Xoá seed cũ (nếu có) rồi sinh lại
  node seed.mjs --users 500 --demo-users 10 --months 12 --seed 42

Env (.env, xem .env.example):
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
  KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD
`);
}

function summarize(profiles, orders, events, users, now, reviews, vouchers) {
  const churners = profiles.filter((p) => p.willChurn).length;
  const amounts = orders.map((o) => o.totalAmount).sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const p95 = amounts.length ? amounts[Math.floor(amounts.length * 0.95)] : 0;
  const cancelled = orders.filter((o) => o.status === "CANCELLED").length;

  console.log("\n=== Thống kê dữ liệu sẽ sinh ===");
  console.log(`Users: ${users.length} (${users.filter((u) => u.isDemo).length} demo login được, ${users.length - users.filter((u) => u.isDemo).length} chỉ để train)`);
  console.log(`Users có xu hướng rời bỏ (churn) trong giai đoạn mô phỏng: ${churners} (~${((100 * churners) / profiles.length).toFixed(1)}%)`);
  console.log(`Orders: ${orders.length} (DELIVERED: ${orders.length - cancelled}, CANCELLED: ${cancelled} = ${((100 * cancelled) / orders.length).toFixed(1)}%)`);
  console.log(`Order value: median=${median.toLocaleString("vi-VN")}đ, p95=${p95.toLocaleString("vi-VN")}đ`);
  console.log(`Behavior events (view/cart): ${events.length}`);

  const usersWithOrders = new Set(orders.map((o) => o.userId)).size;
  console.log(`Users có ít nhất 1 đơn: ${usersWithOrders} / ${users.length}`);

  // Tiêu chí thành công Tầng 1.1/1.2 (docs/canvas/churn-risk-roadmap.md): tỉ lệ session_id NULL
  // < 5%, events_per_session > 1 — in ra ngay lúc seed để phát hiện sớm nếu cụm phiên bị lỗi.
  const withSession = events.filter((e) => e.sessionId).length;
  const sessionIds = new Set(events.map((e) => e.sessionId).filter(Boolean));
  const nullSessionRatio = events.length ? (100 * (events.length - withSession)) / events.length : 0;
  console.log(`Session: ${sessionIds.size} phiên, ${(events.length / Math.max(sessionIds.size, 1)).toFixed(2)} event/phiên trung bình, ${nullSessionRatio.toFixed(1)}% event không có session_id`);

  // Tiêu chí thành công Tầng 1.2 (review/voucher): phân bố lệch thật (không hằng số) — in rating
  // trung bình + độ lệch chuẩn (không phải mọi user rating giống nhau) và tỉ lệ dùng voucher.
  const deliveredCount = orders.length - orders.filter((o) => o.status === "CANCELLED").length;
  const ratings = reviews.map((r) => r.rating);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const ratingVariance = ratings.length
    ? ratings.reduce((a, r) => a + (r - avgRating) ** 2, 0) / ratings.length
    : 0;
  console.log(
    `Reviews: ${reviews.length} (${((100 * reviews.length) / Math.max(deliveredCount, 1)).toFixed(1)}% đơn DELIVERED có review), rating trung bình ${avgRating.toFixed(2)} ± ${Math.sqrt(ratingVariance).toFixed(2)}`
  );
  const usedVouchers = vouchers.filter((v) => v.status === "USED").length;
  console.log(
    `Vouchers: ${vouchers.length} phát ra, ${usedVouchers} đã dùng (${((100 * usedVouchers) / Math.max(vouchers.length, 1)).toFixed(1)}%)`
  );
  console.log("================================\n");
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  if (!args.dryRun) {
    const existing = await countExistingSeedUsers();
    if (existing > 0 && !args.force) {
      console.error(
        `Đã có ${existing} seed user trong DB. Dùng --force để xoá và sinh lại, hoặc --dry-run để chỉ xem thống kê.`
      );
      process.exit(1);
    }
    if (existing > 0 && args.force) {
      console.log(`Xoá ${existing} seed user cũ (và order/event liên quan)...`);
      const deleted = await cleanupSeedData();
      console.log(`Đã xoá: ${deleted.usersDeleted} user, ${deleted.ordersDeleted} order, ${deleted.eventsDeleted} event.`);
    }
  }

  console.log("Nạp catalog sản phẩm thật...");
  const catalog = await loadCatalog();
  console.log(`Catalog: ${catalog.products.length} sản phẩm, ${catalog.categoryIds.length} category.`);

  const rng = new Rng(args.seed);
  const profiles = generateUserProfiles(rng, args.users, catalog.categoryIds);

  console.log(`Tạo ${args.users} user (${args.demoUsers} qua Keycloak để demo login)...`);
  const users = await ensureSeedUsers(args.users, args.demoUsers, { dryRun: args.dryRun });
  const userIds = users.map((u) => u.keycloakUserId);

  const now = new Date();
  console.log(`Mô phỏng hành vi/đơn hàng qua ${args.months} tháng gần nhất (tính đến ${now.toISOString()})...`);
  const { orders, events } = simulateAllUsers(rng, profiles, userIds, catalog, {
    totalMonths: args.months,
    now,
  });

  const profileByUserId = new Map(userIds.map((uid, i) => [uid, profiles[i]]));
  const windowStart = new Date(now.getTime() - args.months * 30 * DAY_MS);

  if (args.dryRun) {
    // Dry-run không ghi DB nên không có order_id thật — gán id giả TUẦN TỰ chỉ để review/voucher
    // có chỗ tham chiếu lúc tính thống kê xem trước (KHÔNG dùng để ghi bất cứ đâu).
    orders.forEach((o, i) => { o.dbId = i + 1; });
    const fakeInternalUserIdMap = new Map(userIds.map((uid, i) => [uid, i + 1]));
    const deliveredOrdersByUser = groupDeliveredOrdersByUser(orders);
    const reviews = generateReviews(rng, profileByUserId, orders);
    const vouchers = generateIssuedVouchers(rng, profileByUserId, fakeInternalUserIdMap, deliveredOrdersByUser, {
      windowStart,
      windowEnd: now,
      now,
    });
    summarize(profiles, orders, events, users, now, reviews, vouchers);
    console.log("(--dry-run) Không ghi gì vào DB.");
    return;
  }

  console.log("Ghi orders + order_items...");
  const orderResult = await writeOrders(rng, orders);
  console.log(`Đã ghi ${orderResult.ordersWritten} orders, ${orderResult.itemsWritten} order_items.`);

  console.log("Ghi user_events...");
  const eventResult = await writeEvents(events);
  console.log(`Đã ghi ${eventResult.eventsWritten} events.`);

  // Review/voucher sinh SAU writeOrders() vì cần order_id THẬT (order.dbId đã được writeOrders
  // gán lại đúng giá trị auto-increment thật, không phải id giả).
  console.log("Ghi reviews...");
  const internalUserIdMap = await fetchInternalUserIdMap(userIds);
  const deliveredOrdersByUser = groupDeliveredOrdersByUser(orders);
  const reviews = generateReviews(rng, profileByUserId, orders);
  const reviewResult = await writeReviews(reviews);
  console.log(`Đã ghi ${reviewResult.reviewsWritten} reviews.`);

  console.log("Ghi vouchers...");
  const vouchers = generateIssuedVouchers(rng, profileByUserId, internalUserIdMap, deliveredOrdersByUser, {
    windowStart,
    windowEnd: now,
    now,
  });
  const voucherResult = await writeVouchers(vouchers);
  console.log(`Đã ghi ${voucherResult.vouchersWritten} vouchers.`);

  summarize(profiles, orders, events, users, now, reviews, vouchers);

  const demoUsers = users.filter((u) => u.isDemo);
  if (demoUsers.length > 0) {
    console.log("\n=== Tài khoản demo (đăng nhập được qua UI thật) ===");
    for (const u of demoUsers) {
      console.log(`  username=${u.username}  password=Demo@12345  (keycloak_user_id=${u.keycloakUserId})`);
    }
    console.log("====================================================\n");
  }

  console.log("Xong. Nhắc lại: đây là dữ liệu tổng hợp (synthetic), không phải hành vi người dùng thật.");
}

main()
  .catch((err) => {
    console.error("Seed thất bại:", err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
