// Test tự động cho bộ sinh dữ liệu — KHÔNG cần DB/Keycloak (catalog giả cùng hình dạng catalog thật).
// Chạy: npm test   (node --test test/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../lib/random.mjs";
import { generateUserProfiles } from "../lib/profiles.mjs";
import { simulateAllUsers } from "../lib/simulate.mjs";
import { FidelityStats } from "../lib/fidelity.mjs";
import { generateReviews } from "../lib/reviews.mjs";
import { makeCatalog } from "./helpers.mjs";

const NOW = new Date("2026-09-30T00:00:00Z");

function generate({ users = 300, months = 12, seed = 42, catalog = makeCatalog() } = {}) {
  const rng = new Rng(seed);
  const profiles = generateUserProfiles(rng, users, catalog.categoryIds);
  const ids = Array.from({ length: users }, (_, i) => `u${i}`);
  return { catalog, ...simulateAllUsers(rng, profiles, ids, catalog, { totalMonths: months, now: NOW }) };
}

test("dữ liệu sinh ra khớp số đo từ dữ liệu người dùng thật (mọi mục fidelity đạt)", () => {
  // 1500 user: độ tập trung lượt xem theo SP méo thấp khi quá thưa (800 user / ~7K SP → top 10% ≈ 0,605, sát
  // ngưỡng dưới 0,607); 1500 user cho ≈ 0,62 ổn định qua 3 seed, khớp catalog Tiki thật 2000 user (0,625).
  const { events, orders, catalog } = generate({ users: 1500 });
  const f = new FidelityStats();
  f.addEvents(events);
  f.addOrders(orders, (pid) => catalog.rootOf.get(catalog.byId.get(pid)?.categoryId));
  const failed = f.checks().filter((r) => !r.pass);
  assert.deepEqual(
    failed.map((r) => `${r.name}: sinh=${r.got} thật=${r.want} (${r.rule})`),
    [],
    "các mục không đạt ở trên — xem lib/behaviorTargets.mjs"
  );
});

test("tái lập được: cùng seed ra đúng cùng dữ liệu", () => {
  const a = generate({ users: 50 });
  const b = generate({ users: 50 });
  assert.equal(a.events.length, b.events.length);
  assert.equal(a.orders.length, b.orders.length);
  const pick = (e) => [e.userId, e.sessionId, e.itemId, e.actionType, e.createdAt.getTime(), e.weight];
  for (let i = 0; i < a.events.length; i += Math.max(1, Math.floor(a.events.length / 500))) {
    assert.deepEqual(pick(a.events[i]), pick(b.events[i]));
  }
});

test("seed khác ra dữ liệu khác", () => {
  const a = generate({ users: 50, seed: 1 });
  const b = generate({ users: 50, seed: 2 });
  assert.notEqual(
    a.events.slice(0, 50).map((e) => e.itemId).join(","),
    b.events.slice(0, 50).map((e) => e.itemId).join(",")
  );
});

test("mọi item_id tham chiếu sản phẩm có thật trong catalog", () => {
  const { events, orders, catalog } = generate({ users: 100 });
  for (const e of events) {
    if (e.itemId != null) assert.ok(catalog.byId.has(e.itemId), `item ${e.itemId} không có trong catalog`);
  }
  for (const o of orders) for (const it of o.items) assert.ok(catalog.byId.has(it.productId));
});

test("edge-case: category chỉ có 1 sản phẩm không làm treo/lỗi", () => {
  const catalog = makeCatalog({ nCategories: 30, sizes: [1, 1, 2, 1, 5] });
  const { events } = generate({ users: 60, catalog });
  assert.ok(events.length > 0);
  const f = new FidelityStats();
  f.addEvents(events);
  const s = f.summary();
  assert.equal(s.badEvents, 0);
  assert.equal(s.nonMonotonicSessions, 0);
});

test("edge-case: catalog chỉ có 1 category (nhánh 'đổi category' không có chỗ để đổi)", () => {
  const catalog = makeCatalog({ nCategories: 1, sizes: [40] });
  const { events } = generate({ users: 30, catalog });
  assert.ok(events.length > 0);
  assert.ok(events.every((e) => e.categoryId == null || e.categoryId === 1));
});

test("edge-case: 1 user, 1 tháng", () => {
  const { events, orders } = generate({ users: 1, months: 1 });
  const f = new FidelityStats();
  f.addEvents(events);
  assert.equal(f.summary().badEvents, 0);
  assert.ok(Array.isArray(orders));
});

test("session id duy nhất toàn cục và tăng dần trong mỗi user (insert tuần tự vào index DB)", () => {
  const { events } = generate({ users: 40 });
  const ownerOf = new Map();
  const lastSeqOfUser = new Map();
  for (const e of events) {
    const prevOwner = ownerOf.get(e.sessionId);
    assert.ok(prevOwner === undefined || prevOwner === e.userId, `session ${e.sessionId} thuộc 2 user`);
    ownerOf.set(e.sessionId, e.userId);
    const seq = Number(e.sessionId.slice(e.sessionId.lastIndexOf("-s") + 2));
    assert.ok(seq >= (lastSeqOfUser.get(e.userId) ?? 0), `session id giảm trong user ${e.userId}`);
    lastSeqOfUser.set(e.userId, seq);
  }
});

test("không có sự kiện/đơn/review nào sau mốc `now` (dữ liệu là ảnh chụp tại now)", () => {
  // 400 user × 12 tháng: đủ để có phiên bắt đầu sát now (lỗi cũ: phiên vắt qua mốc, review +14 ngày).
  const { events, orders } = generate({ users: 400 });
  assert.equal(events.filter((e) => e.createdAt > NOW).length, 0);
  assert.equal(orders.filter((o) => o.createdAt > NOW).length, 0);
  orders.forEach((o, i) => { o.dbId = i + 1; });
  const profileByUserId = new Map(generateUserProfiles(new Rng(42), 400, makeCatalog().categoryIds).map((p, i) => [`u${i}`, p]));
  const reviews = generateReviews(new Rng(7), profileByUserId, orders, { now: NOW });
  assert.ok(reviews.length > 0);
  assert.equal(reviews.filter((r) => r.createdAt > NOW).length, 0);
});

test("mỗi đơn không lặp sản phẩm; tổng tiền = tổng dòng", () => {
  const { orders } = generate({ users: 300 });
  for (const o of orders) {
    const ids = o.items.map((it) => it.productId);
    assert.equal(new Set(ids).size, ids.length, "sản phẩm lặp trong 1 đơn — phải gộp số lượng");
    for (const it of o.items) assert.equal(it.subtotal, it.unitPrice * it.quantity);
    assert.equal(o.items.reduce((s, it) => s + it.subtotal, 0), o.totalAmount);
  }
});

test("chống tái phát lỗi view→cart cứng: đa số lượt thêm giỏ KHÔNG phải item vừa xem", () => {
  const { events } = generate();
  const f = new FidelityStats();
  f.addEvents(events);
  const s = f.summary();
  assert.ok(s.cartTarget.sameAsLastView < 0.3, `sameAsLastView=${s.cartTarget.sameAsLastView} — lỗi cũ là 1.0`);
  // Không còn chặn recency < 0,2: đo trên dữ liệu thật (REES46, cùng cách ghi log với web) recency recall@10
  // = 0,508 — người dùng thật xem lại rất nhiều; ngưỡng cũ đặt theo lỗi chứ chưa từng đo (2026-10-01).
});
