// Đo ĐỘ TRUNG THỰC của dữ liệu hành vi sinh ra so với số đo từ dữ liệu người dùng THẬT
// (lib/behaviorTargets.mjs). Đây là cách kiểm chứng đúng cho 1 bộ sinh dữ liệu: đo chính dữ liệu
// bằng CÙNG định nghĩa đã đo trên REES46/Taobao — chạy vài giây, không cần train model nào.
//
// Nhận sự kiện theo từng lô user (mọi sự kiện của 1 user phải nằm trọn trong 1 lần gọi addEvents)
// để dùng được cả khi seed.mjs sinh dữ liệu theo lô, không phải giữ toàn bộ sự kiện trong RAM.

import { TARGETS, TOLERANCE, REGRESSION_GUARDS, KNOWN_GAPS } from "./behaviorTargets.mjs";

const VIEW = "VIEW_PRODUCT";
const CART = "ADD_TO_CART";
const REMOVE = "REMOVE_FROM_CART";

export const ALL_ACTIONS = [
  "VIEW_PRODUCT", "ADD_TO_CART", "UPDATE_CART_QTY", "REMOVE_FROM_CART", "CLEAR_CART",
  "VIEW_CART", "BEGIN_CHECKOUT", "VIEW_SHIPPING_FEE", "COUPON_FAILED", "COUPON_APPLIED",
  "TAB_HIDDEN", "TAB_VISIBLE", "SCROLL_DEPTH", "PAGE_DWELL", "PRODUCT_ZOOM",
  "SEARCH", "FILTER_APPLIED", "SORT_APPLIED", "IMPRESSION",
];

function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null) continue;
    let list = m.get(k);
    if (!list) m.set(k, (list = []));
    list.push(it);
  }
  return m;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/** Tỉ lệ lượt rơi vào top `frac` SP + Gini — ĐÚNG định nghĩa recsys_measure_item_popularity.py. */
export function itemConcentration(countsMap, frac = 0.1) {
  const c = [...countsMap.values()].sort((a, b) => b - a);
  const total = c.reduce((a, b) => a + b, 0);
  if (!c.length || !total) return { nItems: 0, topShare: null, gini: null };
  const k = Math.max(1, Math.round(c.length * frac));
  let top = 0;
  for (let i = 0; i < k; i++) top += c[i];
  const asc = [...c].reverse();
  let g = 0;
  asc.forEach((x, i) => { g += (2 * (i + 1) - asc.length - 1) * x; });
  return { nItems: c.length, topShare: top / total, gini: g / (asc.length * total) };
}

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 152; // độ dài REES46 Cosmetics (10/2019–02/2020) — các chỉ số quanh lần mua đo trong cửa sổ này
const MIN_GAPS_PER_ROOT = 30; // ngành có ít khoảng cách hơn thì bỏ khỏi so sánh (quá ít để ước lượng trung vị)

function ranks(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(a, b) {
  const ra = ranks(a), rb = ranks(b);
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

export class FidelityStats {
  constructor() {
    this.sessionLengths = [];
    this.sessionsWithCart = 0;
    this.viewsBeforeFirstCart = [];
    this.cartSameAsLast = 0;
    this.cartDiffSeen = 0;
    this.cartNoPrior = 0;
    this.sameCat = 0;
    this.diffCat = 0;
    this.viewedItems = 0;
    this.viewedNeverCarted = 0;
    this.actionCounts = new Map(ALL_ACTIONS.map((a) => [a, 0]));
    this.unknownActions = new Map();
    this.badEvents = 0;
    this.nonMonotonicSessions = 0;
    this.userPairs = 0;
    this.userRepeatPairs = 0;
    this.recencyEvalUsers = 0;
    this.recencyHits10 = 0;
    this.viewsPerItem = new Map(); // độ tập trung lượt xem theo SP (đuôi dài)
    this.sessViewPairs = 0;
    this.repurchaseGaps = new Map(); // ngành gốc → [khoảng cách ngày giữa 2 lần mua cùng ngành]
    this.sessViewRepeats = 0;
    // Hành vi quanh lần mua cuối (TARGETS.preChurn): hoạt động theo NGÀY của từng user + ngày có đơn.
    this.userDayActivity = new Map(); // userId → Map(ngày → [xem, thêm giỏ, xoá khỏi giỏ])
    this.userOrderDays = new Map();   // userId → Set(ngày có đơn)
    this.minDay = Infinity;
    this.maxDay = -Infinity;
  }

  addEvents(events) {
    for (const e of events) {
      if (!e.actionType || !(e.createdAt instanceof Date) || Number.isNaN(e.createdAt.getTime())) this.badEvents++;
      if (e.itemId != null && typeof e.itemId !== "number") this.badEvents++;
      if (e.actionType === VIEW && e.itemId != null) this.viewsPerItem.set(e.itemId, (this.viewsPerItem.get(e.itemId) || 0) + 1);
      if (this.actionCounts.has(e.actionType)) this.actionCounts.set(e.actionType, this.actionCounts.get(e.actionType) + 1);
      else this.unknownActions.set(e.actionType, (this.unknownActions.get(e.actionType) || 0) + 1);
      const slot = e.actionType === VIEW ? 0 : e.actionType === CART ? 1 : e.actionType === REMOVE ? 2 : -1;
      if (e.createdAt instanceof Date && e.userId != null) {
        const day = Math.floor(e.createdAt.getTime() / DAY_MS);
        if (day < this.minDay) this.minDay = day;
        if (day > this.maxDay) this.maxDay = day;
        if (slot >= 0) {
          let m = this.userDayActivity.get(e.userId);
          if (!m) this.userDayActivity.set(e.userId, (m = new Map()));
          let a = m.get(day);
          if (!a) m.set(day, (a = [0, 0, 0]));
          a[slot]++;
        }
      }
    }

    // --- Cấp PHIÊN: đúng định nghĩa đo REES46 ---
    for (const list of groupBy(events, (e) => e.sessionId).values()) {
      // thứ tự SINH ra phải trùng thứ tự thời gian (bug cũ: timestamp không tăng dần làm sai số đo)
      for (let i = 1; i < list.length; i++) {
        if (list[i].createdAt < list[i - 1].createdAt) { this.nonMonotonicSessions++; break; }
      }
      const vc = list
        .filter((e) => e.actionType === VIEW || e.actionType === CART)
        .sort((a, b) => a.createdAt - b.createdAt);
      if (vc.length === 0) continue; // vd phiên chỉ có funnel checkout — REES46 không có tương đương
      this.sessionLengths.push(vc.length);
      if (vc.some((e) => e.actionType === CART)) this.sessionsWithCart++;
      // lặp liền nhau trong phiên trên chuỗi CHỈ lượt xem (đúng recsys_measure_revisit_patterns.py)
      const vOnly = vc.filter((e) => e.actionType === VIEW);
      for (let j = 1; j < vOnly.length; j++) { this.sessViewPairs++; if (vOnly[j].itemId === vOnly[j - 1].itemId) this.sessViewRepeats++; }

      const viewedOrder = [];
      const viewedSet = new Set();
      const cartedSet = new Set();
      let firstCartSeen = false;
      for (let i = 0; i < vc.length; i++) {
        const e = vc[i];
        // Stickiness trên cặp KHÁC SP (cùng định nghĩa Taobao — bộ dữ liệu đã lọc trùng); cặp cùng SP luôn
        // cùng category và do tham số xem lại riêng quyết định (TARGETS.revisit).
        if (i > 0 && e.itemId !== vc[i - 1].itemId) {
          if (e.categoryId === vc[i - 1].categoryId) this.sameCat++;
          else this.diffCat++;
        }
        if (e.actionType === VIEW) {
          if (!viewedSet.has(e.itemId)) { viewedSet.add(e.itemId); viewedOrder.push(e.itemId); }
          else { viewedOrder.push(e.itemId); }
        } else {
          if (!firstCartSeen) { this.viewsBeforeFirstCart.push(viewedSet.size); firstCartSeen = true; }
          const lastView = viewedOrder.length ? viewedOrder[viewedOrder.length - 1] : null;
          if (lastView === e.itemId) this.cartSameAsLast++;
          else if (viewedSet.has(e.itemId)) this.cartDiffSeen++;
          else this.cartNoPrior++;
          cartedSet.add(e.itemId);
        }
      }
      for (const it of viewedSet) {
        this.viewedItems++;
        if (!cartedSet.has(it)) this.viewedNeverCarted++;
      }
    }

    // --- Cấp USER: chẩn đoán "học vẹt" (đúng cách phát hiện lỗi view→cart cứng ở §5.7) ---
    for (const list of groupBy(events, (e) => e.userId).values()) {
      const seq = list
        .filter((e) => (e.actionType === VIEW || e.actionType === CART) && e.itemId != null)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => e.itemId);
      for (let i = 1; i < seq.length; i++) {
        this.userPairs++;
        if (seq[i] === seq[i - 1]) this.userRepeatPairs++;
      }
      if (seq.length >= 2) {
        const target = seq[seq.length - 1];
        const ranked = [];
        const seen = new Set();
        for (let i = seq.length - 2; i >= 0 && ranked.length < 10; i--) {
          if (!seen.has(seq[i])) { seen.add(seq[i]); ranked.push(seq[i]); }
        }
        this.recencyEvalUsers++;
        if (ranked.includes(target)) this.recencyHits10++;
      }
    }
  }

  /** Chu kỳ mua lại theo ngành — mọi đơn của 1 user phải nằm trọn trong 1 lần gọi (như addEvents).
   * `rootOfProduct(productId)` → slug ngành gốc. Đơn vị: NGÀY có mua trong ngành (gộp nhiều SP cùng ngày). */
  addOrders(orders, rootOfProduct) {
    const daysByUserRoot = new Map();
    for (const o of orders) {
      const day = Math.floor(o.createdAt.getTime() / DAY_MS);
      if (!this.userOrderDays.has(o.userId)) this.userOrderDays.set(o.userId, new Set());
      this.userOrderDays.get(o.userId).add(day);
      if (day < this.minDay) this.minDay = day;
      if (day > this.maxDay) this.maxDay = day;
      for (const it of o.items) {
        const root = rootOfProduct(it.productId);
        if (!root) continue;
        const key = `${o.userId}|${root}`;
        if (!daysByUserRoot.has(key)) daysByUserRoot.set(key, new Set());
        daysByUserRoot.get(key).add(day);
      }
    }
    for (const [key, set] of daysByUserRoot) {
      const root = key.slice(key.indexOf("|") + 1);
      const d = [...set].sort((a, b) => a - b);
      if (!this.repurchaseGaps.has(root)) this.repurchaseGaps.set(root, []);
      for (let i = 1; i < d.length; i++) this.repurchaseGaps.get(root).push(d[i] - d[i - 1]);
    }
  }

  categoryRepurchaseSummary() {
    const target = TARGETS.categoryRepurchase.relativeToGrocery;
    const med = new Map();
    for (const [root, gaps] of this.repurchaseGaps) {
      if (gaps.length >= MIN_GAPS_PER_ROOT) med.set(root, percentile([...gaps].sort((a, b) => a - b), 50));
    }
    const base = med.get("bach-hoa-online");
    if (!base) return null;
    const roots = [...med.keys()].filter((r) => target[r] != null);
    const gen = roots.map((r) => med.get(r) / base);
    const tgt = roots.map((r) => target[r]);
    const male = roots.length ? mean(roots.map((_, i) => Math.abs(Math.log(gen[i] / tgt[i])))) : null;
    return {
      roots: Object.fromEntries(roots.map((r, i) => [r, { generatedRatio: +gen[i].toFixed(3), target: tgt[i], medianGapDays: med.get(r), gaps: this.repurchaseGaps.get(r).length }])),
      spearman: roots.length >= 4 ? spearman(gen, tgt) : null,
      meanAbsLogError: male,
    };
  }

  /** Nghiên cứu sự kiện quanh lần mua — ĐÚNG định nghĩa churn_measure_prechurn_behavior.py: khách mua lặp (mốc neo là
   * ngày mua thứ ≥ 2), mốc ∈ [đầu dữ liệu + 42, cuối − 60]; churn = mốc là ngày mua cuối, đối chứng = lần mua kế tiếp
   * trong ≤ 60 ngày (lấy mốc GIỮA cho tất định; Python chọn ngẫu nhiên). SỚM −42..−15, MUỘN −14..−1, SAU +1..+56. */
  preChurnSummary() {
    const H = 60, PRE = 42, POST = 56;
    const w0 = this.maxDay - (WINDOW_DAYS - 1);
    const lo = Math.max(this.minDay, w0) + PRE, hi = this.maxDay - H;
    // mỗi mốc neo = 1 dòng [sớm×3, muộn×3, sau×3, im lặng] → tính chỉ số + sai số chuẩn bootstrap theo mốc neo
    const g = { churn: [], control: [] };
    const addAnchor = (grp, act, orderDays, a) => {
      const sum = (from, to) => {
        const s = [0, 0, 0]; // xem/ngày, thêm giỏ/ngày, ngày bỏ giỏ/ngày — chia độ dài cửa sổ
        for (let d = from; d <= to; d++) {
          const x = act.get(d);
          if (!x) continue;
          s[0] += x[0]; s[1] += x[1];
          if (x[1] > 0 && !orderDays.has(d)) s[2]++;
        }
        return s.map((v) => v / (to - from + 1));
      };
      const e = sum(a - PRE, a - 15), l = sum(a - 14, a - 1), p = sum(a + 1, a + POST);
      let any = false;
      for (let d = a + 1; d <= a + POST && !any; d++) any = act.has(d);
      grp.push([...e, ...l, ...p, any ? 0 : 1]);
    };
    for (const [u, set] of this.userOrderDays) {
      const ds = [...set].filter((d) => d >= w0).sort((a, b) => a - b);
      const act = this.userDayActivity.get(u) || new Map();
      const ctrl = [];
      for (let k = 1; k < ds.length; k++) {
        const a = ds[k];
        if (a < lo || a > hi) continue;
        if (k === ds.length - 1) addAnchor(g.churn, act, set, a);
        else if (ds[k + 1] - a <= H) ctrl.push(a);
      }
      if (ctrl.length) addAnchor(g.control, act, set, ctrl[ctrl.length >> 1]);
    }
    const ch = g.churn, ct = g.control;
    if (ch.length < 30 || ct.length < 30) return { nChurn: ch.length, nControl: ct.length };
    const colSums = (rows, idx) => {
      const s = new Array(10).fill(0);
      for (const i of idx) for (let k = 0; k < 10; k++) s[k] += rows[i][k];
      return s;
    };
    const metrics = (ci, ti) => {
      const c = colSums(ch, ci), t = colSums(ct, ti);
      const pre = (s, i) => (s[i] * 28 + s[3 + i] * 14) / 42;
      const apc = (s, late) => (late ? s[5] / s[4] : s[2] / s[1]);
      return {
        churnPostOverPreViews: c[6] / pre(c, 0),
        churnPostOverPreCarts: c[7] / pre(c, 1),
        churnZeroActivityPost: c[9] / ci.length,
        abandonPerCartSpecificity: (apc(c, true) / apc(c, false)) / (apc(t, true) / apc(t, false)),
      };
    };
    const all = (n) => Array.from({ length: n }, (_, i) => i);
    const point = metrics(all(ch.length), all(ct.length));
    // Bootstrap (200 lần, LCG tất định) theo mốc neo: các chỉ số là TỈ SỐ trên vài trăm mốc → nhiễu mẫu đáng kể.
    let state = 12345;
    const rnd = (n) => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
    const boots = Object.fromEntries(Object.keys(point).map((k) => [k, []]));
    for (let b = 0; b < 200; b++) {
      const m = metrics(ch.map(() => rnd(ch.length)), ct.map(() => rnd(ct.length)));
      for (const k of Object.keys(m)) if (Number.isFinite(m[k])) boots[k].push(m[k]);
    }
    const se = Object.fromEntries(Object.entries(boots).map(([k, v]) => {
      const mu = mean(v);
      return [k, v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - mu) ** 2, 0) / (v.length - 1)) : null];
    }));
    return { nChurn: ch.length, nControl: ct.length, ...point, se };
  }

  /** Duyệt dồn quanh lần mua — ĐÚNG định nghĩa purchase_coupling (Python), trong cửa sổ WINDOW_DAYS cuối (bằng độ dài
   * dữ liệu thật: tỉ trọng "nền" phụ thuộc độ dài quan sát). */
  purchaseCouplingSummary() {
    const w0 = this.maxDay - (WINDOW_DAYS - 1);
    let users = 0, zeroBg = 0, tot = 0, day0 = 0, before = 0, bg = 0;
    let cTot = 0, cDay0 = 0, cBefore = 0, cBg = 0; // cùng định nghĩa, theo lượt thêm giỏ
    for (const [u, set] of this.userOrderDays) {
      const ds = [...set].filter((d) => d >= w0).sort((a, b) => a - b);
      if (ds.length < 2) continue;
      users++;
      let ubg = 0;
      for (const [d, x] of this.userDayActivity.get(u) || []) {
        if (d < w0 || (x[0] === 0 && x[1] === 0)) continue;
        let i = 0;
        while (i < ds.length && ds[i] < d) i++; // ds[i] = lần mua kế tiếp (≥ d)
        const lead = i < ds.length ? ds[i] - d : null;
        const lag = lead === 0 ? 0 : i > 0 ? d - ds[i - 1] : null;
        const far = (lead == null || lead > 14) && (lag == null || lag > 14);
        tot += x[0]; cTot += x[1];
        if (lead === 0) { day0 += x[0]; cDay0 += x[1]; }
        else if (lead != null && lead <= 14) { before += x[0]; cBefore += x[1]; }
        if (far) { bg += x[0]; ubg += x[0]; cBg += x[1]; }
      }
      if (ubg === 0) zeroBg++;
    }
    if (!users || !tot) return null;
    return {
      nRepeatBuyers: users, viewSharePurchaseDay: day0 / tot, viewShare1to14Before: before / tot, viewShareBackground: bg / tot,
      zeroBackground: zeroBg / users,
      cartSharePurchaseDay: cTot ? cDay0 / cTot : null, cartShare1to14Before: cTot ? cBefore / cTot : null, cartShareBackground: cTot ? cBg / cTot : null,
    };
  }

  summary() {
    const sl = [...this.sessionLengths].sort((a, b) => a - b);
    const vb = [...this.viewsBeforeFirstCart].sort((a, b) => a - b);
    const carts = this.cartSameAsLast + this.cartDiffSeen + this.cartNoPrior;
    return {
      nSessions: sl.length,
      sessionLength: { median: percentile(sl, 50), mean: mean(sl), p90: percentile(sl, 90) },
      sessionLenOneShare: sl.length ? sl.filter((v) => v === 1).length / sl.length : null,
      sessionWithCartShare: sl.length ? this.sessionsWithCart / sl.length : null,
      viewsBeforeFirstCart: {
        median: percentile(vb, 50), mean: mean(vb),
        pctZero: vb.length ? vb.filter((v) => v === 0).length / vb.length : null,
      },
      cartTarget: {
        n: carts,
        sameAsLastView: carts ? this.cartSameAsLast / carts : null,
        differentSeenItem: carts ? this.cartDiffSeen / carts : null,
        noPriorView: carts ? this.cartNoPrior / carts : null,
      },
      pSameCategory: this.sameCat + this.diffCat ? this.sameCat / (this.sameCat + this.diffCat) : null,
      abandonRate: this.viewedItems ? this.viewedNeverCarted / this.viewedItems : null,
      consecutiveRepeatRate: this.userPairs ? this.userRepeatPairs / this.userPairs : null,
      recencyRecallAt10: this.recencyEvalUsers ? this.recencyHits10 / this.recencyEvalUsers : null,
      itemPopularity: itemConcentration(this.viewsPerItem),
      sessionViewRepeatRate: this.sessViewPairs ? this.sessViewRepeats / this.sessViewPairs : null,
      categoryRepurchase: this.categoryRepurchaseSummary(),
      preChurn: this.preChurnSummary(),
      purchaseCoupling: this.purchaseCouplingSummary(),
      actionCounts: Object.fromEntries(this.actionCounts),
      missingActions: ALL_ACTIONS.filter((a) => this.actionCounts.get(a) === 0),
      unknownActions: Object.fromEntries(this.unknownActions),
      badEvents: this.badEvents,
      nonMonotonicSessions: this.nonMonotonicSessions,
    };
  }

  /** Danh sách kiểm tra đạt/không đạt — dùng cho cả báo cáo in ra lẫn test tự động. */
  checks() {
    const s = this.summary();
    const rows = [];
    // Dung sai tỉ lệ: ±5 điểm % với tỉ lệ lớn, nhưng thu hẹp theo tỉ lệ với tỉ lệ nhỏ (±30% tương
    // đối, tối thiểu ±1 điểm %) — ±5 điểm % cố định từng để lọt 1,1% so với mục tiêu 3,85%.
    const rate = (name, got, want) => {
      const tol = Math.min(TOLERANCE.rateAbs, Math.max(0.01, 0.3 * want));
      rows.push({
        name, got, want, pass: got != null && Math.abs(got - want) <= tol,
        rule: `±${(tol * 100).toFixed(1)} điểm %`,
      });
    };
    const rel = (name, got, want) => rows.push({
      name, got, want, pass: got != null && Math.abs(got - want) <= TOLERANCE.meanRel * want,
      rule: `±${TOLERANCE.meanRel * 100}%`,
    });
    const exact = (name, got, want) => rows.push({ name, got, want, pass: got === want, rule: "bằng đúng" });
    const max = (name, got, limit) => rows.push({ name, got, want: limit, pass: got != null && got <= limit, rule: `≤ ngưỡng` });

    exact("Độ dài phiên — median", s.sessionLength.median, TARGETS.sessionLength.median);
    rel("Độ dài phiên — mean", s.sessionLength.mean, TARGETS.sessionLength.mean);
    rate("% phiên dài đúng 1 sự kiện", s.sessionLenOneShare, TARGETS.sessionLenOneShare);
    rate("% phiên có thêm giỏ", s.sessionWithCartShare, TARGETS.sessionWithCartShare);
    exact("Số item xem trước cart đầu — median", s.viewsBeforeFirstCart.median, TARGETS.viewsBeforeFirstCart.median);
    rel("Số item xem trước cart đầu — mean", s.viewsBeforeFirstCart.mean, TARGETS.viewsBeforeFirstCart.mean);
    rate("% cart không xem gì trước trong phiên (phiên có cart)", s.viewsBeforeFirstCart.pctZero, TARGETS.viewsBeforeFirstCart.pctZero);
    rate("% cart = item VỪA xem", s.cartTarget.sameAsLastView, TARGETS.cartTarget.sameAsLastView);
    rate("% cart = item KHÁC đã xem", s.cartTarget.differentSeenItem, TARGETS.cartTarget.differentSeenItem);
    rate("% cart không có view trước", s.cartTarget.noPriorView, TARGETS.cartTarget.noPriorView);
    rate("Category-stickiness (cặp khác SP)", s.pSameCategory, TARGETS.pSameCategory);
    rate("Tỉ lệ xem mà không thêm giỏ", s.abandonRate, TARGETS.abandonRate);
    rate("Độ tập trung lượt xem — top 10% SP", s.itemPopularity.topShare, TARGETS.itemPopularity.viewTop10Share);
    rate("Độ tập trung lượt xem — Gini", s.itemPopularity.gini, TARGETS.itemPopularity.viewGini);
    rate("% xem lặp liền nhau trong phiên", s.sessionViewRepeatRate, TARGETS.revisit.repeatPrev);
    rate("Recency recall@10 (cấp user)", s.recencyRecallAt10, TARGETS.userSequence.recencyRecallAt10);
    rate("% xem lặp liên tiếp (cấp user)", s.consecutiveRepeatRate, TARGETS.userSequence.consecutiveRepeatRate);
    max("[chống tái phát] % cart = item VỪA xem", s.cartTarget.sameAsLastView, REGRESSION_GUARDS.maxCartSameAsLastView);
    if (s.categoryRepurchase) {
      // Ngưỡng đặt TRƯỚC khi xem kết quả (2026-10-01): thứ hạng chu kỳ giữa các ngành phải khớp (Spearman ≥ 0,5)
      // và tỉ lệ so với Bách hoá lệch trung bình ≤ ~28% (|log| ≤ 0,25). Chỉ so TỈ LỆ (Amazon: review ≠ lần mua).
      const cr = s.categoryRepurchase;
      rows.push({ name: "Chu kỳ mua lại theo ngành — tương quan hạng", got: cr.spearman, want: 0.5, pass: cr.spearman != null && cr.spearman >= 0.5, rule: "Spearman ≥ 0,5" });
      rows.push({ name: "Chu kỳ mua lại theo ngành — sai số tỉ lệ", got: cr.meanAbsLogError, want: 0.25, pass: cr.meanAbsLogError != null && cr.meanAbsLogError <= 0.25, rule: "TB |log tỉ lệ| ≤ 0,25" });
    }
    if (s.purchaseCoupling) {
      const T = TARGETS.purchaseCoupling, g = s.purchaseCoupling;
      rate("Duyệt quanh lần mua — % lượt xem trong ngày mua", g.viewSharePurchaseDay, T.viewSharePurchaseDay);
      rate("Duyệt quanh lần mua — % lượt xem 1–14 ngày trước mua", g.viewShare1to14Before, T.viewShare1to14Before);
      rate("Duyệt quanh lần mua — % lượt xem nền (cách mua > 14 ngày)", g.viewShareBackground, T.viewShareBackground);
      rate("Duyệt quanh lần mua — % khách mua lặp không duyệt nền", g.zeroBackground, T.zeroBackground);
      rate("Thêm giỏ quanh lần mua — % trong ngày mua", g.cartSharePurchaseDay, T.cartSharePurchaseDay);
      rate("Thêm giỏ quanh lần mua — % 1–14 ngày trước mua", g.cartShare1to14Before, T.cartShare1to14Before);
      rate("Thêm giỏ quanh lần mua — % nền (cách mua > 14 ngày)", g.cartShareBackground, T.cartShareBackground);
    }
    const pc = s.preChurn;
    if (pc.churnPostOverPreViews != null) {
      const T = TARGETS.preChurn;
      // Các chỉ số quanh lần mua cuối là TỈ SỐ trên vài trăm mốc neo: ĐẠT nếu trong dung sai HOẶC lệch ≤ 2 sai số chuẩn
      // bootstrap của chính mẫu sinh (mẫu không đủ để phân biệt mức lệch nhỏ hơn nhiễu của nó). Quy tắc in trong báo cáo.
      const rateSe = (name, got, want, se) => {
        const tol = Math.min(TOLERANCE.rateAbs, Math.max(0.01, 0.3 * want));
        const lim = Math.max(tol, 2 * (se || 0));
        rows.push({ name, got, want, pass: got != null && Math.abs(got - want) <= lim,
          rule: `±${(tol * 100).toFixed(1)} điểm % hoặc 2·SE=${((2 * (se || 0)) * 100).toFixed(1)}` });
      };
      rateSe("Sau lần mua cuối (churn) — lượt xem SAU/TRƯỚC", pc.churnPostOverPreViews, T.churnPostOverPreViews, pc.se.churnPostOverPreViews);
      rateSe("Sau lần mua cuối (churn) — thêm giỏ SAU/TRƯỚC", pc.churnPostOverPreCarts, T.churnPostOverPreCarts, pc.se.churnPostOverPreCarts);
      rateSe("Sau lần mua cuối (churn) — % im lặng hẳn 56 ngày", pc.churnZeroActivityPost, T.churnZeroActivityPost, pc.se.churnZeroActivityPost);
      // Chống tái phát "phân vân": bỏ giỏ không được tăng RIÊNG trước churn. Dải = CI95 thật nới ±0,1, mở thêm 2·SE mẫu sinh.
      const [cLo, cHi] = T.abandonPerCartSpecificityCI;
      const m2 = 2 * (pc.se.abandonPerCartSpecificity || 0);
      const v = pc.abandonPerCartSpecificity;
      rows.push({ name: "[chống tái phát] bỏ giỏ/thêm giỏ trước churn ÷ đối chứng", got: v, want: T.abandonPerCartSpecificity,
        pass: v + m2 >= cLo - 0.1 && v - m2 <= cHi + 0.1, rule: `[${(cLo - 0.1).toFixed(2)}; ${(cHi + 0.1).toFixed(2)}] ± 2·SE=${m2.toFixed(2)}` });
    } else {
      rows.push({ name: "Hành vi quanh lần mua cuối — đủ mẫu", got: `${pc.nChurn}/${pc.nControl}`, want: "≥30/≥30", pass: false, rule: "đủ mốc neo" });
    }
    rows.push({ name: "Đủ 19 loại hành vi", got: 19 - s.missingActions.length, want: 19, pass: s.missingActions.length === 0, rule: "bằng đúng" });
    rows.push({ name: "Action lạ ngoài 19 loại", got: Object.keys(s.unknownActions).length, want: 0, pass: Object.keys(s.unknownActions).length === 0, rule: "bằng đúng" });
    rows.push({ name: "Sự kiện sai kiểu dữ liệu", got: s.badEvents, want: 0, pass: s.badEvents === 0, rule: "bằng đúng" });
    rows.push({ name: "Phiên có timestamp không tăng dần", got: s.nonMonotonicSessions, want: 0, pass: s.nonMonotonicSessions === 0, rule: "bằng đúng" });
    for (const r of rows) {
      if (!r.pass && KNOWN_GAPS[r.name]) { r.knownGap = KNOWN_GAPS[r.name]; r.pass = true; }
    }
    return rows;
  }

  printReport() {
    const s = this.summary();
    const rows = this.checks();
    const fmt = (v) => (v == null ? "—" : typeof v === "number" && !Number.isInteger(v) ? v.toFixed(4) : String(v));
    console.log("\n=== Độ trung thực so với dữ liệu người dùng THẬT (REES46/Taobao) ===");
    console.log(`(${s.nSessions.toLocaleString("vi-VN")} phiên có view/cart, ${s.cartTarget.n.toLocaleString("vi-VN")} lượt thêm giỏ)`);
    for (const r of rows) {
      console.log(`  ${r.knownGap ? "LỆCH ĐÃ BIẾT" : r.pass ? "ĐẠT     " : "KHÔNG ĐẠT"}  ${r.name.padEnd(52)} sinh=${fmt(r.got).padStart(8)}  thật=${fmt(r.want).padStart(8)}  (${r.rule})`);
    }
    for (const r of rows.filter((x) => x.knownGap)) console.log(`  (lệch đã biết) ${r.name}: ${r.knownGap}`);
    if (s.missingActions.length) console.log(`  Thiếu hành vi: ${s.missingActions.join(", ")}`);
    const failed = rows.filter((r) => !r.pass).length;
    console.log(failed === 0 ? "  => TẤT CẢ ĐẠT" : `  => ${failed}/${rows.length} mục KHÔNG ĐẠT`);
    console.log("======================================================================\n");
    return failed === 0;
  }
}
