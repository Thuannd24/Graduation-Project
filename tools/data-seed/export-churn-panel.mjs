// Xuất PANEL churn từ mô phỏng (không cần DB) + ground truth ẩn, để phân tích "tín hiệu nào dự đoán được rời bỏ"
// (AI/forecast-service/app/training/experiments/churn_signal_decomposition.py). Panel đúng định nghĩa production:
// 5 mốc cắt (270..150 ngày trước), user có >= 2 đơn DELIVERED tới mốc, nhãn = không có đơn (mọi status) trong 120 ngày sau.
// Cột ground truth (dead_at_cutoff, lam_day) chỉ để tính TRẦN lý thuyết — KHÔNG phải feature.
//   node export-churn-panel.mjs --users 5000 --months 24 --out ../../data/experiment-results/churn_panel.csv
import fs from "node:fs";
import { Rng } from "./lib/random.mjs";
import { generateUserProfiles } from "./lib/profiles.mjs";
import { simulateAllUsers } from "./lib/simulate.mjs";
import { makeCatalog } from "./test/helpers.mjs";
import { TARGETS } from "./lib/behaviorTargets.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const USERS = Number(arg("users", 5000)), MONTHS = Number(arg("months", 24)), BATCH = 500;
const OUT = arg("out", "../../data/experiment-results/churn_panel.csv");
const NOW = new Date(arg("now", "2026-10-02T00:00:00Z")), DAY = 864e5, MONTH_MS = 30 * DAY;
const cat = makeCatalog();
const lines = ["user,cutoff_days_ago,frequency,recency,t_x,T,monetary,avg_order_value,cancel_rate,discount_dependency," +
  "days_since_last_activity,recent_view_count,cart_abandon_count,view_to_cart_conversion_rate,category_diversity_viewed," +
  "label,dead_at_cutoff,lam_day,rate_mult,cycle_rel,next_order_days"];
for (let b = 0; b < USERS / BATCH; b++) {
  const rng = new Rng(1000 + b);
  const prof = generateUserProfiles(rng, BATCH, cat.categoryIds);
  const ids = prof.map((_, i) => `b${b}u${i}`);
  const { orders, events } = simulateAllUsers(rng, prof, ids, cat, { totalMonths: MONTHS, now: NOW });
  // 5 feature hành vi production (behavior.py) tính lại từ events: 7 ngày / 30 ngày trước mốc cắt
  const evByUser = new Map();
  for (const e of events) {
    if (!evByUser.has(e.userId)) evByUser.set(e.userId, []);
    evByUser.get(e.userId).push({ t: e.createdAt.getTime(), a: e.actionType, c: e.categoryId });
  }
  for (const arr of evByUser.values()) arr.sort((x, y) => x.t - y.t);
  const byUser = new Map();
  for (const o of orders) { if (!byUser.has(o.userId)) byUser.set(o.userId, []); byUser.get(o.userId).push(o); }
  prof.forEach((p, i) => {
    const os = byUser.get(ids[i]); if (!os) return;
    for (const d of [270, 240, 210, 180, 150]) {
      const cut = NOW.getTime() - d * DAY;
      const hist = os.filter((o) => o.createdAt.getTime() <= cut);
      const del = hist.filter((o) => o.status === "DELIVERED");
      if (del.length < 2) continue;
      const times = del.map((o) => o.createdAt.getTime()).sort((x, y) => x - y);
      const first = times[0], last = times[times.length - 1];
      const monetary = del.reduce((a, o) => a + o.totalAmount, 0);
      const ev = evByUser.get(ids[i]) || [];
      const ots = os.map((o) => o.createdAt.getTime());
      let lastEv = -Infinity, views7 = 0, views30 = 0, carts30 = 0, ab = 0;
      const cats = new Set();
      for (const e of ev) {
        if (e.t > cut) break;
        lastEv = e.t;
        if (e.t <= cut - 30 * DAY) continue;
        if (e.a === "VIEW_PRODUCT") { views30++; cats.add(e.c); if (e.t > cut - 7 * DAY) views7++; }
        else if (e.a === "ADD_TO_CART" || e.a === "UPDATE_CART_QTY") { carts30++; if (!ots.some((t) => t >= e.t && t <= e.t + DAY)) ab++; }
      }
      const dsla = lastEv === -Infinity ? 9999 : (cut - lastEv) / DAY;
      const future = os.some((o) => o.createdAt.getTime() > cut && o.createdAt.getTime() <= cut + 120 * DAY);
      // chu kỳ mua lại TRUNG BÌNH của các ngành khách ưa thích (so với Bách hoá = 1; sách 0,59 … điện thoại 1,72)
      const rels = p.preferredCategories.map((c) => TARGETS.categoryRepurchase.relativeToGrocery[cat.rootOf.get(c)]).filter((v) => v != null);
      const cycleRel = rels.length ? rels.reduce((a, v) => a + v, 0) / rels.length : 1;
      const nextT = os.map((o) => o.createdAt.getTime()).filter((t) => t > cut).sort((x, y) => x - y)[0];
      const nextDays = nextT == null ? 99999 : (nextT - cut) / DAY;
      const dead = p.dropoutAt != null && p.dropoutAt.getTime() <= cut ? 1 : 0;
      lines.push([ids[i], d, del.length, (cut - last) / DAY, (last - first) / DAY, (cut - first) / DAY, monetary, monetary / del.length,
        hist.filter((o) => o.status === "CANCELLED").length / hist.length, hist.filter((o) => o.couponCode).length / hist.length,
        dsla, views7, ab, views30 > 0 ? carts30 / views30 : 0, cats.size,
        future ? 0 : 1, dead, (p.lambdaBase * p.rateMult) / 30, p.rateMult, cycleRel, nextDays].join(","));
    }
  });
  process.stderr.write(`batch ${b + 1}/${USERS / BATCH}\r`);
}
fs.writeFileSync(OUT, lines.join("\n"));
console.log(`\nĐã ghi ${lines.length - 1} dòng → ${OUT}`);
