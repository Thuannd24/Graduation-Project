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
import { FidelityStats } from "./lib/fidelity.mjs";
import { closePool } from "./lib/db.mjs";
import { CsvExporter } from "./lib/exportCsv.mjs";
import { TARGETS, TOLERANCE, REGRESSION_GUARDS, GENERATION, POPULARITY } from "./lib/behaviorTargets.mjs";
import { execSync } from "node:child_process";
import path from "node:path";

function gitRevision() {
  try {
    const rev = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- .", { encoding: "utf8" }).trim() !== "";
    return { commit: rev, toolDirty: dirty };
  } catch {
    return null;
  }
}

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
    chunk: 250,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--seed" && argv[i + 1]) args.seed = Number(argv[++i]);
    else if (a === "--users" && argv[i + 1]) args.users = Number(argv[++i]);
    else if (a === "--demo-users" && argv[i + 1]) args.demoUsers = Number(argv[++i]);
    else if (a === "--months" && argv[i + 1]) args.months = Number(argv[++i]);
    else if (a === "--chunk" && argv[i + 1]) args.chunk = Math.max(1, Number(argv[++i]));
    else if (a === "--out" && argv[i + 1]) args.out = argv[++i];
    else if (a === "--now" && argv[i + 1]) args.now = argv[++i];
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
  node seed.mjs --chunk 250                 Số user xử lý mỗi lô (bộ nhớ tỉ lệ theo lô, không theo tổng)
  node seed.mjs --out ../../data/training-sets/v1 --users 20000
                                            KHÔNG ghi DB: xuất CSV (user_events/orders/order_items)
                                            + manifest.json — dữ liệu train quy mô lớn mang lên GPU.
                                            Chỉ đọc catalog thật từ DB. user_id tất định (seedu-000001).
  node seed.mjs --now 2026-09-30T00:00:00Z  Mốc "hiện tại" cố định → cùng seed + cùng catalog ra
                                            đúng cùng file (mặc định: thời điểm chạy).

Mọi lần chạy (kể cả --dry-run) in "báo cáo độ trung thực" so với số đo từ dữ liệu người dùng thật
(lib/behaviorTargets.mjs). --dry-run trả exit code 2 nếu có mục KHÔNG ĐẠT — dùng làm cổng kiểm tra.
Test không cần DB: npm test

Env (.env, xem .env.example):
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
  KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD
`);
}

/** Thống kê cộng dồn qua từng lô user — không giữ toàn bộ order/event trong RAM (bản cũ gom hết
 * vào 1 mảng: 5.000 user × 19 hành vi ≈ 6,6 triệu object, tiến trình node >2GB, từng làm RAM máy
 * tụt xuống mức nguy hiểm). Phiên/đơn/user không bao giờ vắt qua 2 lô (mỗi user nằm trọn 1 lô),
 * nên đếm "phân biệt" theo lô rồi cộng lại vẫn chính xác. */
class SeedStats {
  constructor() {
    this.orderAmounts = [];
    this.orders = 0;
    this.cancelled = 0;
    this.events = 0;
    this.eventsWithSession = 0;
    this.sessions = 0;
    this.usersWithOrders = 0;
    this.reviews = 0;
    this.ratingSum = 0;
    this.ratingSqSum = 0;
    this.vouchers = 0;
    this.usedVouchers = 0;
  }

  addChunk({ orders, events, reviews, vouchers }) {
    for (const o of orders) {
      this.orderAmounts.push(o.totalAmount);
      if (o.status === "CANCELLED") this.cancelled++;
    }
    this.orders += orders.length;
    this.usersWithOrders += new Set(orders.map((o) => o.userId)).size;
    this.events += events.length;
    this.eventsWithSession += events.filter((e) => e.sessionId).length;
    this.sessions += new Set(events.map((e) => e.sessionId).filter(Boolean)).size;
    this.reviews += reviews.length;
    for (const r of reviews) { this.ratingSum += r.rating; this.ratingSqSum += r.rating * r.rating; }
    this.vouchers += vouchers.length;
    this.usedVouchers += vouchers.filter((v) => v.status === "USED").length;
  }
}

function summarize(profiles, users, st) {
  const churners = profiles.filter((p) => p.willChurn).length;
  const amounts = [...st.orderAmounts].sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const p95 = amounts.length ? amounts[Math.floor(amounts.length * 0.95)] : 0;
  const demo = users.filter((u) => u.isDemo).length;

  console.log("\n=== Thống kê dữ liệu sẽ sinh ===");
  console.log(`Users: ${users.length} (${demo} demo login được, ${users.length - demo} chỉ để train)`);
  console.log(`Users có xu hướng rời bỏ (churn) trong giai đoạn mô phỏng: ${churners} (~${((100 * churners) / profiles.length).toFixed(1)}%)`);
  console.log(`Orders: ${st.orders} (DELIVERED: ${st.orders - st.cancelled}, CANCELLED: ${st.cancelled} = ${((100 * st.cancelled) / Math.max(st.orders, 1)).toFixed(1)}%)`);
  console.log(`Order value: median=${median.toLocaleString("vi-VN")}đ, p95=${p95.toLocaleString("vi-VN")}đ`);
  console.log(`Behavior events (19 loại hành vi): ${st.events}`);
  console.log(`Users có ít nhất 1 đơn: ${st.usersWithOrders} / ${users.length}`);

  // Tiêu chí thành công Tầng 1.1/1.2 (docs/canvas/churn-risk-roadmap.md): tỉ lệ session_id NULL
  // < 5%, events_per_session > 1 — in ra ngay lúc seed để phát hiện sớm nếu cụm phiên bị lỗi.
  const nullSessionRatio = st.events ? (100 * (st.events - st.eventsWithSession)) / st.events : 0;
  console.log(`Session: ${st.sessions} phiên, ${(st.events / Math.max(st.sessions, 1)).toFixed(2)} event/phiên trung bình, ${nullSessionRatio.toFixed(1)}% event không có session_id`);

  // Tiêu chí thành công Tầng 1.2 (review/voucher): phân bố lệch thật (không hằng số).
  const delivered = st.orders - st.cancelled;
  const avgRating = st.reviews ? st.ratingSum / st.reviews : 0;
  const ratingSd = st.reviews ? Math.sqrt(Math.max(0, st.ratingSqSum / st.reviews - avgRating ** 2)) : 0;
  console.log(
    `Reviews: ${st.reviews} (${((100 * st.reviews) / Math.max(delivered, 1)).toFixed(1)}% đơn DELIVERED có review), rating trung bình ${avgRating.toFixed(2)} ± ${ratingSd.toFixed(2)}`
  );
  console.log(
    `Vouchers: ${st.vouchers} phát ra, ${st.usedVouchers} đã dùng (${((100 * st.usedVouchers) / Math.max(st.vouchers, 1)).toFixed(1)}%)`
  );
  console.log("================================");
}

async function main() {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (args.out && args.dryRun) {
    console.error("--out và --dry-run loại trừ nhau (--out đã không ghi DB).");
    process.exit(1);
  }
  // Chế độ file: không đụng bảng user/order/event nào trong DB, chỉ đọc catalog.
  const writesDb = !args.dryRun && !args.out;
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error(`--now không hợp lệ: ${args.now}`);
    process.exit(1);
  }

  if (writesDb) {
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
  console.log(`Độ phổ biến SP: ${catalog.popularitySource}`);

  let exporter = null;
  if (args.out) {
    exporter = new CsvExporter(path.resolve(args.out));
    exporter.init(); // từ chối nếu thư mục đã có tập dữ liệu — không ghi đè
    console.log(`Chế độ xuất file → ${exporter.outDir}`);
  }

  const rng = new Rng(args.seed);
  const profiles = generateUserProfiles(rng, args.users, catalog.categoryIds);

  let users;
  if (args.out) {
    // id tất định (không phải UUID ngẫu nhiên như bản ghi DB) → file tái lập được theo seed.
    users = Array.from({ length: args.users }, (_, i) => ({
      keycloakUserId: `seedu-${String(i + 1).padStart(6, "0")}`,
      isDemo: false,
    }));
  } else {
    console.log(`Tạo ${args.users} user (${args.demoUsers} qua Keycloak để demo login)...`);
    users = await ensureSeedUsers(args.users, args.demoUsers, { dryRun: args.dryRun });
  }
  const userIds = users.map((u) => u.keycloakUserId);

  const windowStart = new Date(now.getTime() - args.months * 30 * DAY_MS);
  const profileByUserId = new Map(userIds.map((uid, i) => [uid, profiles[i]]));
  // Dry-run không có user_id nội bộ/order_id thật — dùng id giả TUẦN TỰ chỉ để review/voucher có chỗ
  // tham chiếu lúc tính thống kê xem trước (KHÔNG ghi đi đâu).
  const internalUserIdMap = writesDb
    ? await fetchInternalUserIdMap(userIds)
    : new Map(userIds.map((uid, i) => [uid, i + 1]));

  const stats = new SeedStats();
  const fidelity = new FidelityStats();
  let fakeOrderId = 0;

  console.log(
    `Mô phỏng + ${args.out ? "xuất CSV" : args.dryRun ? "tính thống kê" : "ghi DB"} theo lô ${args.chunk} user, ${args.months} tháng gần nhất (tính đến ${now.toISOString()})...`
  );
  for (let start = 0; start < userIds.length; start += args.chunk) {
    const chunkIds = userIds.slice(start, start + args.chunk);
    const chunkProfiles = profiles.slice(start, start + args.chunk);
    const { orders, events } = simulateAllUsers(rng, chunkProfiles, chunkIds, catalog, {
      totalMonths: args.months,
      now,
    });
    fidelity.addEvents(events);
    fidelity.addOrders(orders, (pid) => catalog.rootOf?.get(catalog.byId.get(pid)?.categoryId));

    if (exporter) {
      exporter.assignOrderIds(orders);
    } else if (args.dryRun) {
      orders.forEach((o) => { o.dbId = ++fakeOrderId; });
    } else {
      await writeOrders(rng, orders); // gán order.dbId = auto-increment THẬT (review/voucher cần)
      await writeEvents(events);
    }

    // Review/voucher sinh SAU khi có order_id. Voucher duyệt theo map user → PHẢI truyền đúng map
    // của lô hiện tại, truyền map toàn bộ user sẽ sinh voucher trùng ở mỗi lô.
    const chunkProfileMap = new Map(chunkIds.map((uid, i) => [uid, chunkProfiles[i]]));
    const reviews = generateReviews(rng, profileByUserId, orders, { now });
    const vouchers = generateIssuedVouchers(rng, chunkProfileMap, internalUserIdMap, groupDeliveredOrdersByUser(orders), {
      windowStart,
      windowEnd: now,
      now,
    });
    if (writesDb) {
      await writeReviews(reviews);
      await writeVouchers(vouchers);
    } else if (exporter) {
      // Voucher không xuất: tham chiếu user_id NỘI BỘ của bảng users (không tồn tại ở chế độ file)
      // và không dùng cho train recsys. Vẫn sinh để dòng số ngẫu nhiên giống hệt chế độ DB.
      exporter.appendChunk({ orders, events, reviews, userIds: chunkIds, profiles: chunkProfiles });
    }
    stats.addChunk({ orders, events, reviews, vouchers });
    const done = Math.min(start + args.chunk, userIds.length);
    console.log(`  ${done}/${userIds.length} user | ${stats.orders} đơn | ${stats.events.toLocaleString("vi-VN")} sự kiện`);
  }

  summarize(profiles, users, stats);
  const fidelityOk = fidelity.printReport();
  if (exporter) {
    const { actionCounts, ...fidelitySummary } = fidelity.summary();
    const manifest = exporter.finalize({
      kind: "synthetic-behavior-dataset",
      note: "Dữ liệu TỔNG HỢP, thống kê hành vi neo theo REES46 + Taobao (lib/behaviorTargets.mjs). Không phải người dùng thật.",
      generatedAt: new Date().toISOString(),
      params: { seed: args.seed, users: args.users, months: args.months, chunk: args.chunk, now: now.toISOString() },
      catalog: { products: catalog.products.length, categories: catalog.categoryIds.length },
      git: gitRevision(),
      fidelity: { allPass: fidelityOk, summary: fidelitySummary, actionCounts, checks: fidelity.checks() },
      targets: { TARGETS, TOLERANCE, REGRESSION_GUARDS },
      generation: { GENERATION, POPULARITY, popularitySource: catalog.popularitySource },
      stats: {
        orders: stats.orders, cancelled: stats.cancelled, events: stats.events,
        sessions: stats.sessions, reviews: stats.reviews, churners: profiles.filter((p) => p.willChurn).length,
      },
    });
    console.log(`Đã ghi: ${Object.entries(manifest.files).map(([f, n]) => `${f} (${n.toLocaleString("vi-VN")} dòng)`).join(", ")} + manifest.json`);
    if (!fidelityOk) {
      console.error("CẢNH BÁO: có mục độ trung thực KHÔNG ĐẠT — xem manifest.json trước khi dùng tập này để train.");
      process.exitCode = 2;
    }
    return;
  }
  if (args.dryRun) {
    console.log("(--dry-run) Không ghi gì vào DB.");
    if (!fidelityOk) process.exitCode = 2; // dùng được như cổng kiểm tra trước khi seed thật
    return;
  }

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
