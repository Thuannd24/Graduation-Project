// Test tự động cho bộ sinh dữ liệu — KHÔNG cần DB/Keycloak (catalog giả cùng hình dạng catalog thật).
// Chạy: npm test   (node --test test/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../lib/random.mjs";
import { generateUserProfiles } from "../lib/profiles.mjs";
import { simulateAllUsers } from "../lib/simulate.mjs";
import { FidelityStats } from "../lib/fidelity.mjs";
import { makeCatalog } from "./helpers.mjs";

const NOW = new Date("2026-09-30T00:00:00Z");

function generate({ users = 300, months = 12, seed = 42, catalog = makeCatalog() } = {}) {
  const rng = new Rng(seed);
  const profiles = generateUserProfiles(rng, users, catalog.categoryIds);
  const ids = Array.from({ length: users }, (_, i) => `u${i}`);
  return { catalog, ...simulateAllUsers(rng, profiles, ids, catalog, { totalMonths: months, now: NOW }) };
}

test("dữ liệu sinh ra khớp số đo từ dữ liệu người dùng thật (mọi mục fidelity đạt)", () => {
  const { events } = generate();
  const f = new FidelityStats();
  f.addEvents(events);
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

test("chống tái phát lỗi view→cart cứng: đa số lượt thêm giỏ KHÔNG phải item vừa xem", () => {
  const { events } = generate();
  const f = new FidelityStats();
  f.addEvents(events);
  const s = f.summary();
  assert.ok(s.cartTarget.sameAsLastView < 0.3, `sameAsLastView=${s.cartTarget.sameAsLastView} — lỗi cũ là 1.0`);
  assert.ok(s.recencyRecallAt10 < 0.2, `recency recall@10=${s.recencyRecallAt10} — lỗi cũ là 0.2754`);
});
