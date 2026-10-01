import { TARGETS, PCT_LEVELS, GENERATION } from "./behaviorTargets.mjs";
import { pickWeighted } from "./catalogIndex.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
// Phân phối số ngày phiên "hành trình" đi trước lần mua (TARGETS.purchaseCoupling.leadPmf, d = 1..28).
const LEAD_CDF = (() => { let c = 0; return TARGETS.purchaseCoupling.leadPmf.map((p) => (c += p)); })();
function sampleLeadDays(rng) {
  const u = rng.next() * LEAD_CDF[LEAD_CDF.length - 1];
  let i = 0;
  while (i < LEAD_CDF.length - 1 && LEAD_CDF[i] < u) i++;
  return i + 1;
}
const MONTH_MS = 30 * DAY_MS; // đơn giản hoá: "tháng" = 30 ngày, đủ dùng cho dữ liệu tổng hợp

const ORDER_STATUS_DELIVERED = "DELIVERED";
const ORDER_STATUS_CANCELLED = "CANCELLED";

// --- 5 action "nghiệp vụ" (khớp shared_common/contracts.py) ---
const ACTION_VIEW = "VIEW_PRODUCT";
const ACTION_ADD_TO_CART = "ADD_TO_CART";
const ACTION_UPDATE_CART_QTY = "UPDATE_CART_QTY";
const ACTION_REMOVE_FROM_CART = "REMOVE_FROM_CART";
const ACTION_CLEAR_CART = "CLEAR_CART";
// --- 14 vi hành vi (khớp FE_BEHAVIOR_ACTIONS) ---
const ACTION_VIEW_CART = "VIEW_CART";
const ACTION_BEGIN_CHECKOUT = "BEGIN_CHECKOUT";
const ACTION_VIEW_SHIPPING_FEE = "VIEW_SHIPPING_FEE";
const ACTION_COUPON_FAILED = "COUPON_FAILED";
const ACTION_COUPON_APPLIED = "COUPON_APPLIED";
const ACTION_TAB_HIDDEN = "TAB_HIDDEN";
const ACTION_TAB_VISIBLE = "TAB_VISIBLE";
const ACTION_SCROLL_DEPTH = "SCROLL_DEPTH";
const ACTION_PAGE_DWELL = "PAGE_DWELL";
const ACTION_PRODUCT_ZOOM = "PRODUCT_ZOOM";
const ACTION_SEARCH = "SEARCH";
const ACTION_FILTER_APPLIED = "FILTER_APPLIED";
const ACTION_SORT_APPLIED = "SORT_APPLIED";
const ACTION_IMPRESSION = "IMPRESSION";

const PREFERRED_CATEGORY_WEIGHT = 0.7; // 70% hành vi rơi vào category ưa thích, 30% ngẫu nhiên

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THAM SỐ ĐO ĐƯỢC TỪ HÀNH VI NGƯỜI THẬT (2026-09-22)
//
// Trước đây: mỗi lượt "xem" LUÔN dẫn thẳng tới "thêm giỏ" ĐÚNG sản phẩm vừa xem (ghép cứng
// 100%, xem simulate.mjs bản cũ dòng 108-109/138-139). Kết quả: model SASRec train trên dữ liệu
// này thua một quy tắc không cần học gì cả ("gợi ý lại item vừa xem" — recall@10=0,2754 so với
// SASRec 0,1976, xem docs/canvas/recsys-execution-plan.md §5.7) — vì bản thân dữ liệu ĐÃ mã hoá
// sẵn quy tắc đó, không phải hành vi có cấu trúc thật để học.
//
// Sửa lại bằng cách ĐO trực tiếp cấu trúc phiên duyệt web trên REES46 Cosmetics (dữ liệu người
// dùng THẬT, 5 tháng, 4.513.080 phiên — xem
// `AI/forecast-service/app/training/experiments/recsys_measure_behavior_patterns.py`) rồi dùng
// CHÍNH các con số đo được để lái bộ mô phỏng, thay vì luật tay đoán mò. Chỉ lấy thống kê KHÔNG
// PHỤ THUỘC catalog cụ thể (không lấy ma trận category→category vì catalog mỹ phẩm của REES46
// khác hẳn catalog điện thoại/laptop của platform) — xem docstring đầy đủ trong script đo.
//
// Kết quả đo (script trên, `behavior_patterns_5months.json`):
//   - 78,7% lượt thêm giỏ KHÔNG có lượt xem nào trước đó trong CÙNG phiên (đi thẳng từ danh sách)
//   - 17,5% thêm giỏ đúng item VỪA xem gần nhất trong phiên
//   - 3,9% thêm giỏ 1 item KHÁC đã xem trước đó trong phiên (so sánh rồi chọn)
//   - 63,4% khả năng sự kiện kế tiếp trong phiên cùng category với sự kiện trước
//   - Độ dài phiên và số item phân biệt xem trước khi quyết định thêm giỏ: xem 2 mảng percentile
//     dưới đây (lấy mẫu theo đúng phân phối thực, không fit họ phân phối tham số áp đặt)
//
// REES46 KHÔNG có nhãn cho 14 vi hành vi (SEARCH/FILTER_APPLIED/IMPRESSION/...) — những action
// này CHỈ tồn tại trong tracker của chính đồ án (xem contracts.py), nên KHÔNG có số đo thật để
// lấy. Tần suất các action này (bên dưới, đánh dấu "ước lượng hợp lý") là giả định có LÝ DO rõ
// ràng (gắn với vị trí trong phễu mua hàng đã biết), không phải số đo — khác hẳn 5 con số ở trên.
//
// ⚠️ CROSS-VALIDATE bằng Taobao UserBehavior (2026-09-23) — 100.150.807 sự kiện, 16.574.600 PHIÊN
// SUY LUẬN (Taobao không có session_id thật, phải suy luận bằng ngắt quãng 30 phút — xem
// `recsys_measure_behavior_patterns_taobao.py`). Không kết luận quy luật hành vi chỉ từ 1 nguồn:
//
//   | Chỉ số | REES46 (phiên THẬT) | Taobao (phiên SUY LUẬN) | Quyết định |
//   |---|---|---|---|
//   | % cart không có view trước cùng phiên | 78,7% | 84,5% | Lệch <10 điểm % → giữ REES46 |
//   | % cart = item vừa xem | 17,5% | 1,6% | Lệch nhiều, nhưng phụ thuộc RANH GIỚI phiên (Taobao
//   |   |   |   | suy luận phiên dài hơn hẳn — median 3 vs 1 sự kiện — pha loãng số này một cách
//   |   |   |   | máy móc) → ưu tiên REES46 (phiên thật, không lỗi suy luận)
//   | % cùng category với sự kiện trước | 63,4% | 47,1% | Lệch nhiều, NHƯNG chỉ số này không phụ
//   |   |   |   | thuộc ranh giới phiên (chỉ cần đúng THỨ TỰ sự kiện, vốn có thật cả 2 nguồn) → lấy
//   |   |   |   | TRUNG BÌNH có trọng số theo số quan sát (Taobao ~7 lần REES46) = 49,2%
//
// Độ dài phiên và số view trước cart CŨNG lệch nhiều (Taobao dài hơn) nhưng cùng lý do suy luận
// phiên ở trên — giữ nguyên theo REES46 vì đó là phiên THẬT, không phải vì REES46 "đúng hơn" một
// cách chủ quan.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Số đo thật nằm ở 1 chỗ duy nhất (behaviorTargets.mjs) — dùng chung với fidelity.mjs để KIỂM
// TRA dữ liệu sinh ra thực sự đạt đúng các con số này, không chỉ "đặt tham số rồi hy vọng".
const {
  sessionLengthPcts: SESSION_LENGTH_PCTS,
  sessionLengthNoCartPcts: SESSION_LENGTH_NOCART_PCTS,
  viewsBeforeFirstCartPcts: VIEWS_BEFORE_CART_PCTS,
  cartTarget: CART_TARGET_PROBS,
} = TARGETS;

// --- Tần suất vi hành vi KHÔNG có số đo thật (xem cảnh báo trên) — ước lượng hợp lý, gắn với
// đúng ý nghĩa hành vi (vd tần suất SEARCH thấp hơn browse thuần vì là hành động chủ động hơn) ---
const P_SESSION_STARTS_WITH_SEARCH = 0.12;
const P_SESSION_HAS_FILTER = 0.18;
const P_SESSION_HAS_SORT = 0.15;
const P_VIEW_GETS_ZOOM = 0.15; // tăng thêm nếu item này là item sẽ được thêm giỏ (xem bên dưới)
const P_VIEW_GETS_ZOOM_IF_CART_TARGET = 0.45;
const P_SESSION_HAS_TAB_AWAY = 0.08;
const IMPRESSIONS_PER_VIEW = [2, 4]; // so san pham KHAC hien thi cung danh sach truoc khi click 1 cai
const P_VIEW_CART_AFTER_ADD = 0.55; // mo trang gio hang sau khi them (khong phai luc nao cung mo)
const P_UPDATE_QTY = 0.12;
const P_ABANDON_EXPLICIT_REMOVE = 0.55; // trong phien BO GIO: bao nhieu % thao tac RO RANG remove
                                          // (con lai la "im lang bo di", gio hang van con item)
const P_ORDER_RECONSIDER_REMOVE = 0.07; // trong phien DAT HANG: doi y bo 1 item truoc khi chot don
const P_CLEAR_CART_ON_ABANDON_MULTI = 0.2;
const P_COUPON_TRY_FAILED_FIRST = 0.25; // % user thu ma sai truoc khi (co the) thanh cong

/** Lấy mẫu theo ĐÚNG phân phối thực đo được (nội suy tuyến tính giữa 2 mốc phân vị gần nhất),
 * thay vì fit một họ phân phối tham số (chuẩn/Poisson/...) áp đặt lên dữ liệu không nhất thiết
 * theo họ đó. */
function sampleFromPercentiles(rng, percentiles, levels = PCT_LEVELS) {
  const u = rng.float(0, 100);
  for (let i = 0; i < levels.length - 1; i++) {
    if (u <= levels[i + 1]) {
      const t = (u - levels[i]) / (levels[i + 1] - levels[i]);
      return percentiles[i] + t * (percentiles[i + 1] - percentiles[i]);
    }
  }
  return percentiles[percentiles.length - 1];
}

function monthWindow(now, totalMonths, month) {
  const end = new Date(now.getTime() - (totalMonths - month) * MONTH_MS);
  const start = new Date(end.getTime() - MONTH_MS);
  return { start, end };
}

/** Timestamp "neo" (mốc bắt đầu 1 phiên) có nhịp giờ/ngày theo tham số ẩn của user, thay vì đều
 * tuyệt đối trong tháng — xem `preferredHourCenter`/`weekendBias` ở profiles.mjs. */
function rhythmicTimestamp(rng, start, end, profile) {
  const totalDays = Math.max(Math.floor((end.getTime() - start.getTime()) / DAY_MS) - 1, 0);

  let dayStart;
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = new Date(start.getTime() + rng.int(0, totalDays) * DAY_MS);
    const isWeekend = candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6;
    // weekendBias > 1 -> chấp nhận ngày cuối tuần dễ hơn; < 1 -> khó hơn. Ngày thường luôn chấp nhận.
    const acceptProb = isWeekend ? Math.min(profile.weekendBias / 2, 1) : 1;
    if (!isWeekend || rng.bool(acceptProb)) {
      dayStart = candidate;
      break;
    }
    dayStart = candidate; // hết lượt thử vẫn dùng ngày cuối cùng, tránh vòng lặp vô hạn kết quả rỗng
  }

  let hour = profile.preferredHourCenter + rng.normal(0, profile.hourConcentration);
  hour = ((hour % 24) + 24) % 24;
  const t = new Date(dayStart.getTime() + Math.floor(hour * 60 * 60 * 1000) + rng.int(0, 59) * 60 * 1000);

  if (t < start) return new Date(start.getTime());
  if (t >= end) return new Date(end.getTime() - 1000);
  return t;
}

/** Bộ sinh id phiên cho 1 user: `seed-<userId>-s00001`, `-s00002`... — TĂNG DẦN trong mỗi user.
 * Bản cũ dùng 16 ký tự hex ngẫu nhiên: mỗi phiên rơi vào 1 vị trí NGẪU NHIÊN của index
 * `idx_user_events_session`, nên khi bảng + index lớn hơn buffer pool MariaDB (mặc định 128MB) mỗi
 * insert thành 1 lần đọc/ghi đĩa ngẫu nhiên — đo được ~7-8K dòng/phút, tức ~15 giờ cho 5.000 user.
 * Id tăng dần theo user → insert gần như tuần tự (cùng kiểu index theo user_id đang có). Vẫn
 * reproducible (không dùng crypto.randomUUID), vẫn duy nhất toàn cục vì chứa userId. */
function makeSessionIdGenerator(userId) {
  let seq = 0;
  return () => `seed-${userId}-s${String(++seq).padStart(5, "0")}`;
}

/** Lịch sử xem của 1 user qua các phiên — cho hành vi "xem lại SP đã xem ở phiên cũ" (REES46 đo được).
 * Phiên không được sinh theo thứ tự thời gian (theo tháng → đơn → bỏ giỏ → xem thuần) nên chỉ lấy SP
 * xem ở phiên có mốc SỚM HƠN phiên hiện tại (không "xem lại" thứ chưa từng xem); ưu tiên gần đây. */
function makeViewHistory(maxKeep = 300, candidates = 20) {
  const items = [];
  return {
    add(time, product) {
      items.push({ t: time.getTime(), product });
      if (items.length > maxKeep) items.shift();
    },
    pickBefore(rng, time, excludeIds, mostRecent = false) {
      const t = time.getTime();
      const cand = [];
      for (let i = items.length - 1; i >= 0 && cand.length < candidates; i--) {
        const it = items[i];
        if (it.t < t && !(excludeIds && excludeIds.has(it.product.id))) cand.push(it);
      }
      if (!cand.length) return null;
      if (mostRecent) return cand.reduce((a, b) => (b.t > a.t ? b : a)).product;
      // gần đây hơn → dễ được xem lại hơn: trọng số decay^hạng (theo thời điểm)
      cand.sort((a, b) => b.t - a.t);
      const d = GENERATION.historyRecencyDecay;
      let total = 0;
      const w = cand.map((_, r) => (total += Math.pow(d, r)));
      const x = rng.next() * total;
      return cand[w.findIndex((c) => c > x)].product;
    },
  };
}

/** Chọn SP toàn catalog THEO ĐỘ PHỔ BIẾN (trọng số `weight`, xem catalogIndex.mjs). Bản cũ chọn đều
 * (`rng.choice`) → không có đuôi dài: top 10% SP chỉ chiếm ~13% lượt xem, trong khi dữ liệu thật
 * ~66% (Taobao) — baseline Popularity trên dữ liệu sinh vì thế gần 0, phi thực tế. */
function pickAny(rng, catalog) {
  return catalog.cum ? pickWeighted(rng, catalog.products, catalog.cum) : rng.choice(catalog.products);
}

function pickFromCategory(rng, catalog, categoryId) {
  const list = catalog.byCategory.get(categoryId);
  if (list && list.length > 0) {
    const cum = catalog.cumByCategory?.get(categoryId);
    return cum ? pickWeighted(rng, list, cum) : rng.choice(list);
  }
  return pickAny(rng, catalog);
}

function pickFromCategoryExcluding(rng, catalog, categoryId, excludeIds) {
  let p = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    p = pickFromCategory(rng, catalog, categoryId);
    if (!excludeIds || !excludeIds.has(p.id)) return p;
  }
  return p;
}

function pickPreferredOrRandom(rng, catalog, profile) {
  const usePreferred = profile.preferredCategories.length > 0 && rng.bool(PREFERRED_CATEGORY_WEIGHT);
  if (usePreferred) return pickFromCategory(rng, catalog, rng.choice(profile.preferredCategories));
  return pickAny(rng, catalog);
}

/** Nhánh "ĐỔI category": sản phẩm KHÁC category `excludeCategoryId`. Không loại trừ thì 1 lượt
 * "đổi" vẫn có thể bốc trúng lại đúng category cũ một cách ngẫu nhiên (nhất là khi category đó nằm
 * trong nhóm ưa thích) → category-stickiness THỰC TẾ cao hơn tham số (đo được 0,647 trong khi tham
 * số 0,492 — fidelity.mjs phát hiện 2026-09-30). */
function pickSwitchProduct(rng, catalog, profile, excludeCategoryId) {
  if (excludeCategoryId == null || catalog.categoryIds.length < 2) return pickPreferredOrRandom(rng, catalog, profile);
  for (let attempt = 0; attempt < 8; attempt++) {
    const p = pickPreferredOrRandom(rng, catalog, profile);
    if (p.categoryId !== excludeCategoryId) return p;
  }
  // user chỉ ưa đúng 1 category trùng category cũ: lấy toàn catalog cho tới khi khác category
  for (let attempt = 0; attempt < 50; attempt++) {
    const p = pickAny(rng, catalog);
    if (p.categoryId !== excludeCategoryId) return p;
  }
  return pickAny(rng, catalog);
}

/** Chọn sản phẩm kế tiếp trong phiên: GIỮ category với xác suất đúng bằng số đo thật
 * (`GENERATION.pSameCategoryNew`, hiệu chỉnh để stickiness cặp khác SP khớp số đo), còn lại ĐỔI hẳn sang category khác. `excludeIds`: không chọn lại item đã
 * có (dùng cho lượt thêm giỏ "không có view trước" — nếu bốc trúng item đã xem thì số đo sẽ tính
 * nhầm thành "cart item đã xem"). Quyết định giữ/đổi chỉ lấy 1 lần, không làm lệch tỉ lệ khi thử lại. */
function pickNextProduct(rng, catalog, profile, lastCategoryId, excludeIds = null) {
  const stay = lastCategoryId != null && rng.bool(GENERATION.pSameCategoryNew);
  let p = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    p = stay ? pickFromCategory(rng, catalog, lastCategoryId) : pickSwitchProduct(rng, catalog, profile, lastCategoryId);
    if (!excludeIds || !excludeIds.has(p.id)) return p;
  }
  return p; // category quá nhỏ, mọi SP đã xem hết — chấp nhận trùng (rất hiếm)
}

/** Bộ đếm thời gian dùng chung cho 1 phiên — CỘNG DỒN từng bước bằng `rng` có seed (giữ dataset
 * reproducible), KHÔNG vẽ lại timestamp độc lập rồi nhân với chỉ số như bản cũ (bug đã sửa
 * 2026-09-22: làm timestamp không đảm bảo tăng dần, xem thảo luận trong git log). */
function makeSeededClock(rng, anchorTime) {
  let cursor = anchorTime.getTime();
  return {
    now: () => new Date(cursor),
    advance: (minSec, maxSec) => {
      cursor += rng.int(minSec, Math.max(minSec, maxSec)) * 1000;
      return new Date(cursor);
    },
  };
}

/** P(round(mẫu) >= ngưỡng) khi lấy mẫu từ đường phân vị bằng `sampleFromPercentiles` — tính số
 * (tích phân đều trên u), để xác suất có điều kiện bên dưới khớp ĐÚNG cái sampler sinh ra. */
function probRoundedAtLeast(percentiles, threshold, steps = 20000) {
  let hit = 0;
  for (let s = 0; s < steps; s++) {
    const u = ((s + 0.5) / steps) * 100;
    let v = percentiles[percentiles.length - 1];
    for (let i = 0; i < PCT_LEVELS.length - 1; i++) {
      if (u <= PCT_LEVELS[i + 1]) {
        const t = (u - PCT_LEVELS[i]) / (PCT_LEVELS[i + 1] - PCT_LEVELS[i]);
        v = percentiles[i] + t * (percentiles[i + 1] - percentiles[i]);
        break;
      }
    }
    if (Math.round(v) >= threshold) hit++;
  }
  return hit / steps;
}

// Tỉ lệ cart-target đo trên MỌI lượt thêm giỏ — kể cả ~42% lượt không có view nào trước (khi đó
// chỉ có thể là "không có view trước"), và "item KHÁC đã xem" chỉ xảy ra được khi đã xem ≥ 2 item.
// Dùng xác suất có ĐIỀU KIỆN theo số item đã xem để TỔNG THỂ khớp đúng số đo thật (bản đầu chia
// chung 1 mẫu số → "item khác đã xem" chỉ đạt 1,1% so với 3,85% thật — fidelity.mjs phát hiện).
const P_AT_LEAST_1_VIEW = probRoundedAtLeast(VIEWS_BEFORE_CART_PCTS, 1);
const P_AT_LEAST_2_VIEWS = probRoundedAtLeast(VIEWS_BEFORE_CART_PCTS, 2);
const P_SAME_GIVEN_VIEWS = Math.min(1, CART_TARGET_PROBS.sameAsLastView / P_AT_LEAST_1_VIEW);
const P_DIFF_GIVEN_2VIEWS = Math.min(1 - P_SAME_GIVEN_VIEWS, CART_TARGET_PROBS.differentSeenItem / P_AT_LEAST_2_VIEWS);

/** Sinh 1 PHIÊN hoàn chỉnh: cấu trúc view/cart lấy mẫu theo ĐÚNG phân phối đo được từ dữ liệu thật
 * (behaviorTargets.mjs), CỘNG THÊM 17 loại vi hành vi còn lại để phiên đủ 19 loại hành vi như
 * tracker thật.
 *
 * Cấu trúc (sửa 2026-09-30 theo báo cáo fidelity):
 *   - `T` = tổng số sự kiện view/cart của phiên, lấy mẫu từ phân phối độ dài phiên thật.
 *   - Phiên có thêm giỏ: lấy `k` = số item xem TRƯỚC lượt thêm giỏ (có thể = 0 — ~42% lượt thêm giỏ
 *     thật không có lượt xem nào trước trong phiên; bản cũ LUÔN đặt ≥1 view trước nên số này = 0%).
 *     Phiên có cart thật dài hơn trung bình (cần chỗ cho k view + 1 cart) nên T = max(T, k+1).
 *
 * `sessionKind`: 'order' | 'abandon' | 'pureview' — quyết định phễu sau khi thêm giỏ:
 *   - 'order': có funnel (VIEW_CART, đôi khi đổi ý REMOVE_FROM_CART 1 item khác)
 *   - 'abandon': có thể REMOVE_FROM_CART rõ ràng (tín hiệu "đổi ý" — chính bigram đã chứng minh
 *     mang thông tin trên REES46 Cosmetics, xem §5.3) hoặc im lặng bỏ đi
 *   - 'pureview': không có hành vi giỏ hàng nào
 *
 * Trả về `cartTargetProduct` — sản phẩm THỰC SỰ được thêm giỏ.
 */
function simulateSession(rng, catalog, profile, userId, anchorTime, sessionSpreadMinutes, opts = {}) {
  const { forceCart = false, sessionKind = "pureview", nextSessionId } = opts;
  const events = [];
  const sessionId = nextSessionId();
  const clock = makeSeededClock(rng, anchorTime);
  const push = (actionType, { itemId = null, categoryId = null, weight = null } = {}) => {
    events.push({ userId, itemId, categoryId, actionType, createdAt: clock.now(), sessionId, weight });
  };

  // --- Mở đầu phiên: đôi khi có ý định rõ ràng (tìm kiếm) hoặc so sánh (lọc/sắp xếp) trước khi
  // duyệt — KHÔNG có số đo thật cho các action này (REES46 không ghi nhãn), tần suất là ước
  // lượng hợp lý gắn với vị trí trong phễu, xem cảnh báo ở đầu file. ---
  if (rng.bool(P_SESSION_STARTS_WITH_SEARCH)) {
    push(ACTION_SEARCH);
    clock.advance(2, 15);
  }
  if (rng.bool(P_SESSION_HAS_FILTER)) {
    push(ACTION_FILTER_APPLIED);
    clock.advance(1, 10);
  }
  if (rng.bool(P_SESSION_HAS_SORT)) {
    push(ACTION_SORT_APPLIED);
    clock.advance(1, 5);
  }

  // Phiên xem thuần lấy độ dài từ phân phối phiên KHÔNG có giỏ (thật: 81,5% dài 1 sự kiện); phiên có giỏ giữ phân phối chung.
  let total = Math.max(1, Math.min(Math.round(sampleFromPercentiles(rng, forceCart ? SESSION_LENGTH_PCTS : SESSION_LENGTH_NOCART_PCTS)), 50));
  let viewsBeforeCart = 0;
  if (forceCart) {
    viewsBeforeCart = Math.max(0, Math.round(sampleFromPercentiles(rng, VIEWS_BEFORE_CART_PCTS)));
    total = Math.max(total, viewsBeforeCart + 1);
  }
  const nViews = forceCart ? total - 1 : total;

  const viewedThisSession = []; // theo đúng thứ tự đã xem trong phiên
  const viewedIds = new Set();
  let lastCategoryId = opts.intentCategoryId ?? null; // phiên mua theo "ý định" ngành (chu kỳ mua lại)
  let cartTargetProduct = null;
  const tabAwayAtIndex = rng.bool(P_SESSION_HAS_TAB_AWAY) && nViews > 1 ? rng.int(0, nViews - 2) : -1;

  const placeCart = () => {
    const nSeen = viewedThisSession.length;
    const roll = rng.float(0, 1);
    if (nSeen >= 1 && roll < P_SAME_GIVEN_VIEWS) {
      cartTargetProduct = viewedThisSession[nSeen - 1];
    } else if (nSeen >= 2 && roll < P_SAME_GIVEN_VIEWS + P_DIFF_GIVEN_2VIEWS) {
      const earlier = viewedThisSession.slice(0, -1).filter((p) => p.id !== viewedThisSession[nSeen - 1].id);
      cartTargetProduct = earlier.length ? rng.choice(earlier) : viewedThisSession[nSeen - 1];
    } else {
      // Không liên quan tới lượt xem TRONG phiên — đi thẳng từ danh sách/tìm kiếm, hoặc đã xem ở
      // phiên KHÁC từ trước (trường hợp PHỔ BIẾN NHẤT trong dữ liệu thật). Vẫn có quán tính
      // category (số đo stickiness tính trên cả cặp view→cart), loại trừ item đã xem trong phiên.
      // Đơn có "ý định" mua lại 1 ngành (chu kỳ mua lại) → SP thêm giỏ lấy TRONG ngành đó (vẫn theo độ phổ biến);
      // không có ý định thì giữ quán tính category như cũ.
      cartTargetProduct = opts.intentCategoryId != null
        ? pickFromCategoryExcluding(rng, catalog, opts.intentCategoryId, viewedIds)
        : pickNextProduct(rng, catalog, profile, lastCategoryId, viewedIds);
    }
    clock.advance(20, 1800);
    push(ACTION_ADD_TO_CART, { itemId: cartTargetProduct.id, categoryId: cartTargetProduct.categoryId });
    lastCategoryId = cartTargetProduct.categoryId;

    if (rng.bool(P_UPDATE_QTY)) {
      clock.advance(2, 30);
      push(ACTION_UPDATE_CART_QTY, { itemId: cartTargetProduct.id, categoryId: cartTargetProduct.categoryId });
    }

    // --- Phễu SAU khi thêm giỏ, khác nhau theo sessionKind ---
    if (sessionKind === "order") {
      if (rng.bool(P_VIEW_CART_AFTER_ADD)) {
        clock.advance(10, 120);
        push(ACTION_VIEW_CART);
      }
      if (rng.bool(P_ORDER_RECONSIDER_REMOVE) && viewedThisSession.length > 0) {
        // Đổi ý bỏ 1 item KHÁC (đã xem) ra khỏi giỏ trước khi chốt đơn — chính bigram
        // "cart -> remove_from_cart" đã chứng minh mang thông tin trên REES46 Cosmetics (§5.3).
        const reconsidered = rng.choice(viewedThisSession);
        clock.advance(5, 60);
        push(ACTION_REMOVE_FROM_CART, { itemId: reconsidered.id, categoryId: reconsidered.categoryId });
      }
    } else if (sessionKind === "abandon") {
      if (rng.bool(P_ABANDON_EXPLICIT_REMOVE)) {
        // Bỏ giỏ CÓ chủ đích, ghi nhận rõ ràng (khác "im lặng rời đi" — cùng tín hiệu REES46).
        clock.advance(30, 900);
        push(ACTION_REMOVE_FROM_CART, { itemId: cartTargetProduct.id, categoryId: cartTargetProduct.categoryId });
        if (rng.bool(P_CLEAR_CART_ON_ABANDON_MULTI)) {
          clock.advance(1, 10);
          push(ACTION_CLEAR_CART);
        }
      }
      // Còn lại: "im lặng bỏ đi" — không sự kiện thêm, cart vẫn còn item (đúng ý nghĩa
      // cart-abandonment cho feature churn đã dùng trước đây, không đổi).
    }
  };

  // XEM LẠI (đo trên REES46 — web ghi log giống REES46: mỗi lần mở trang chi tiết = 1 VIEW_PRODUCT, không
  // lọc trùng; Taobao đã lọc trùng nên không dùng được cho phần này). Lượt thêm giỏ đặt theo số item
  // PHÂN BIỆT đã xem (đúng định nghĩa đo viewsBeforeFirstCart), lượt xem lặp không tính.
  const history = opts.history || null;
  let cartPlaced = false;
  for (let i = 0; i < nViews; i++) {
    if (forceCart && !cartPlaced && viewedIds.size === viewsBeforeCart) { placeCart(); cartPlaced = true; }
    // còn vừa đủ lượt để đạt k item phân biệt trước cart → bắt buộc xem item mới
    const mustBeNew = forceCart && !cartPlaced && nViews - i <= viewsBeforeCart - viewedIds.size;

    let product = null;
    const roll = rng.next();
    if (i === 0 && history && opts.intentCategoryId == null && rng.bool(GENERATION.sessionResume)) {
      product = history.pickBefore(rng, anchorTime, null, true); // mở phiên bằng SP đang xem dở
    } else if (!mustBeNew && viewedThisSession.length >= 1 && roll < GENERATION.repeatPrev) {
      product = viewedThisSession[viewedThisSession.length - 1];
    } else if (!mustBeNew && viewedIds.size >= 2 && roll < GENERATION.repeatPrev + GENERATION.revisitSession) {
      const last = viewedThisSession[viewedThisSession.length - 1];
      const earlier = viewedThisSession.filter((p) => p.id !== last.id);
      product = earlier[rng.int(0, earlier.length - 1)];
    } else if (history && rng.bool(GENERATION.revisitHistory)) {
      product = history.pickBefore(rng, anchorTime, viewedIds);
    }
    if (!product) product = pickNextProduct(rng, catalog, profile, lastCategoryId, mustBeNew ? viewedIds : null);
    lastCategoryId = product.categoryId;
    if (i > 0 || (forceCart && viewsBeforeCart === 0)) clock.advance(5, sessionSpreadMinutes * 60 || 180);

    // IMPRESSION: danh sách sản phẩm THỰC SỰ hiển thị cùng lúc, chỉ 1 cái được click (VIEW) —
    // mô phỏng đúng cơ chế FE thật (trackImpressions bắn cho cả danh sách, VIEW chỉ bắn cho SP
    // được mở chi tiết). Lấy từ CÙNG category để giống 1 trang danh mục/kết quả tìm kiếm thật.
    const [minImp, maxImp] = IMPRESSIONS_PER_VIEW;
    const nImpressions = rng.int(minImp, maxImp);
    for (let k = 0; k < nImpressions; k++) {
      const shown = pickFromCategory(rng, catalog, product.categoryId);
      push(ACTION_IMPRESSION, { itemId: shown.id, categoryId: shown.categoryId });
    }

    push(ACTION_VIEW, { itemId: product.id, categoryId: product.categoryId });
    viewedThisSession.push(product);
    viewedIds.add(product.id);

    // PRODUCT_ZOOM: xác suất cao hơn với lượt xem NGAY TRƯỚC lượt thêm giỏ (quan tâm thật sự).
    const isRightBeforeCart = forceCart && !cartPlaced && viewedIds.size === viewsBeforeCart;
    if (rng.bool(isRightBeforeCart ? P_VIEW_GETS_ZOOM_IF_CART_TARGET : P_VIEW_GETS_ZOOM)) {
      clock.advance(2, 20);
      push(ACTION_PRODUCT_ZOOM, { itemId: product.id, categoryId: product.categoryId });
    }

    if (i === tabAwayAtIndex) {
      clock.advance(5, 60);
      push(ACTION_TAB_HIDDEN);
      clock.advance(30, 600); // rời tab 0,5-10 phút (so giá nơi khác?)
      push(ACTION_TAB_VISIBLE);
    }
  }
  if (forceCart && !cartPlaced) placeCart(); // k = số item phân biệt == tổng lượt xem (hoặc phiên chỉ có cart)
  if (history) for (const p of viewedThisSession) history.add(anchorTime, p);

  // --- Trang trí cuối phiên: mức độ cuộn trang + thời gian dừng lại, tỉ lệ thuận với độ dài
  // phiên (phiên dài hơn = engagement cao hơn = cuộn sâu hơn/dừng lâu hơn) ---
  const scrollMilestones = [25, 50, 75, 100].filter(() => rng.bool(Math.min(0.3 + total * 0.05, 0.9)));
  for (const milestone of scrollMilestones) {
    clock.advance(2, 30);
    push(ACTION_SCROLL_DEPTH, { weight: milestone });
  }
  const dwellSeconds = Math.round((clock.now().getTime() - anchorTime.getTime()) / 1000) + rng.int(5, 120);
  push(ACTION_PAGE_DWELL, { weight: dwellSeconds });

  return { events, cartTargetProduct };
}

/** Tốc độ mua tương đối của 1 danh mục = 1 / (chu kỳ mua lại của ngành gốc, so với Bách hoá) — đo trên Amazon
 * Reviews 2023 (TARGETS.categoryRepurchase). Danh mục không thuộc ngành đã đo → 1. */
function categoryRate(catalog, categoryId) {
  const root = catalog.rootOf?.get(categoryId);
  const rel = root != null ? TARGETS.categoryRepurchase.relativeToGrocery[root] : undefined;
  return rel ? Math.pow(1 / rel, GENERATION.categoryRateExponent) : 1;
}

/** Hệ số tần suất đặt đơn của user theo NGÀNH họ hay mua, chuẩn hoá để TRUNG BÌNH toàn bộ user = 1 (danh mục
 * ưa thích được chọn đều trong mọi danh mục, xem profiles.mjs) — mặt bằng tần suất (gắn với cơ chế churn) giữ
 * nguyên, nhưng người thích ngành chu kỳ ngắn (sách, đồ em bé) mua dày hơn, ngành lâu bền (điện thoại) thưa hơn.
 * Vì sao cần (2026-10-01): khi tần suất KHÔNG phụ thuộc ngành, người chỉ thích điện thoại vẫn mua điện thoại theo
 * nhịp đơn chung → khoảng cách mua lại sinh ra ngược chiều số đo (Spearman −0,3 ÷ −0,4). */
function userCategoryRateMultiplier(catalog, profile) {
  if (!catalog.rootOf || profile.preferredCategories.length === 0) return 1;
  if (catalog._meanCategoryRate == null) {
    catalog._meanCategoryRate = catalog.categoryIds.reduce((a, c) => a + categoryRate(catalog, c), 0) / catalog.categoryIds.length;
  }
  const m = profile.preferredCategories.reduce((a, c) => a + categoryRate(catalog, c), 0) / profile.preferredCategories.length;
  return m / catalog._meanCategoryRate;
}

/** "Ý định" ngành cho 1 SP trong đơn: danh mục ưa thích, xác suất ∝ tốc độ mua của ngành (1/chu kỳ); với xác suất
 * intentExploreProb thì không có ý định (mua thử — phiên tự chọn như cũ). */
function chooseIntentCategory(rng, catalog, profile) {
  if (!catalog.rootOf || profile.preferredCategories.length === 0) return null;
  if (rng.bool(GENERATION.intentExploreProb)) return null;
  const w = profile.preferredCategories.map((c) => categoryRate(catalog, c));
  let r = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return profile.preferredCategories[i];
  }
  return profile.preferredCategories[profile.preferredCategories.length - 1];
}

/** Sinh toàn bộ order + user_events cho MỘT user qua `totalMonths` tháng gần nhất tính đến `now`. */
function simulateUser(rng, profile, catalog, userId, totalMonths, now) {
  const orders = [];
  const events = [];
  const nextSessionId = makeSessionIdGenerator(userId);
  const history = makeViewHistory();
  const rateMult = userCategoryRateMultiplier(catalog, profile);
  const winStart = monthWindow(now, totalMonths, 1).start.getTime();
  const nowMs = now.getTime();

  // --- Dòng thời gian mua theo BG/NBD (PURCHASE_PROCESS): lần mua đầu ở thời điểm gia nhập; các lần sau là quá trình
  // Poisson tốc độ λ (× hệ số ngành, trung bình 1); sau MỖI lần mua lặp rời bỏ với xác suất dropoutP → không mua nữa.
  // Thời điểm trong ngày giữ nhịp giờ/ngày của user (rhythmicTimestamp trên cửa sổ 1 ngày).
  const birth = winStart + profile.birthFrac * (nowMs - winStart);
  const ratePerMs = (profile.lambdaBase * rateMult) / MONTH_MS;
  const rawTimes = [birth];
  let dropoutAt = null;
  for (let t = birth; ratePerMs > 0;) {
    t += rng.exponential(ratePerMs);
    if (t > nowMs) break;
    rawTimes.push(t);
    if (rng.bool(profile.dropoutP)) { dropoutAt = t; break; }
  }
  profile.willChurn = dropoutAt != null;
  profile.dropoutAt = dropoutAt != null ? new Date(dropoutAt) : null;
  const orderDates = rawTimes.map((t) => {
    const dayStart = new Date(Math.floor(t / DAY_MS) * DAY_MS);
    return rhythmicTimestamp(rng, dayStart, new Date(dayStart.getTime() + DAY_MS), profile);
  }).filter((d) => d.getTime() <= nowMs);

  {
    // --- Đơn hàng thật: mỗi item trong đơn = 1 phiên có thêm giỏ (nội dung phiên thật, không còn ghép cứng view-cart
    // cùng item — xem simulateSession) + hành trình mua + phễu checkout.
    for (const orderDate of orderDates) {
      const numItems = rng.int(1, 3);
      const items = [];
      let totalAmount = 0;

      for (let it = 0; it < numItems; it++) {
        // Phiên dẫn tới item này trong đơn: neo 10 phút - 6h trước khi đặt (gần thời điểm mua).
        const anchor = new Date(orderDate.getTime() - rng.int(10, 360) * 60 * 1000);
        const { events: sessionEvents, cartTargetProduct } = simulateSession(
          rng, catalog, profile, userId, anchor, profile.sessionBrowseSpreadMinutes,
          // mỗi SP trong đơn là 1 quyết định mua riêng, rơi vào ngành ưa thích ∝ tốc độ mua của ngành
          { forceCart: true, sessionKind: "order", nextSessionId, history, intentCategoryId: chooseIntentCategory(rng, catalog, profile) }
        );
        events.push(...sessionEvents);

        const product = cartTargetProduct;
        const quantity = rng.int(1, 2);
        const unitPrice = Number(product.price);
        const subtotal = unitPrice * quantity;
        totalAmount += subtotal;
        // 2 phiên của cùng đơn có thể cùng chọn 1 sản phẩm → giỏ thật GỘP số lượng, không tách 2 dòng.
        const same = items.find((x) => x.productId === product.id);
        if (same) {
          same.quantity += quantity;
          same.subtotal += subtotal;
        } else {
          items.push({ productId: product.id, productName: product.name, unitPrice, quantity, subtotal });
        }
      }

      // --- Hành trình mua: phiên xem thuần trong những ngày TRƯỚC đơn (dữ liệu thật: lượt xem dồn quanh lần mua,
      // chỉ 16% là duyệt nền). Lệch giờ trong ngày ngẫu nhiên để không trùng giờ đặt đơn.
      const numJourney = rng.poisson(GENERATION.journeySessionsPerOrder);
      const numJourneyAbandon = rng.poisson(GENERATION.journeyAbandonPerOrder);
      const numSameDay = rng.poisson(GENERATION.sameDaySessionsPerOrder);
      for (let s = 0; s < numSameDay + numJourney + numJourneyAbandon; s++) {
        // cùng ngày: phiên trước giờ đặt đơn 30 phút–6 giờ; hành trình: đi trước d ngày (leadPmf), lệch giờ ngẫu nhiên
        const sameDay = s < numSameDay;
        const anchor = sameDay
          ? new Date(orderDate.getTime() - rng.int(30, 6 * 60) * 60 * 1000)
          : new Date(orderDate.getTime() - sampleLeadDays(rng) * DAY_MS + rng.int(-6 * 60, 6 * 60) * 60 * 1000);
        const isAbandon = s >= numSameDay + numJourney;
        const { events: sessionEvents } = simulateSession(
          rng, catalog, profile, userId, anchor, profile.sessionBrowseSpreadMinutes,
          { forceCart: isAbandon, sessionKind: isAbandon ? "abandon" : "pureview", nextSessionId, history }
        );
        events.push(...sessionEvents);
      }

      const isCancelled = rng.bool(profile.cancelProb);
      const hasCoupon = rng.bool(profile.priceSensitivity * 0.5);
      const discountAmount = hasCoupon ? Math.round(totalAmount * 0.1) : 0;
      const finalAmount = totalAmount - discountAmount;

      // --- Funnel checkout (BEGIN_CHECKOUT -> phí ship -> mã giảm giá), 1 lần/đơn ngay trước
      // thời điểm đặt hàng. Không có số đo thật (REES46 không có khái niệm coupon) — gắn vào
      // `priceSensitivity` đã có sẵn (user nhạy giá thử mã nhiều hơn) thay vì hằng số vô căn cứ. ---
      const checkoutSessionId = nextSessionId();
      const checkoutAt = new Date(orderDate.getTime() - 60 * 1000);
      events.push({ userId, itemId: null, categoryId: null, actionType: ACTION_BEGIN_CHECKOUT,
                    createdAt: new Date(checkoutAt.getTime() - 5 * 60 * 1000), sessionId: checkoutSessionId, weight: null });
      events.push({ userId, itemId: null, categoryId: null, actionType: ACTION_VIEW_SHIPPING_FEE,
                    createdAt: new Date(checkoutAt.getTime() - 3 * 60 * 1000), sessionId: checkoutSessionId, weight: null });
      if (rng.bool(profile.priceSensitivity * P_COUPON_TRY_FAILED_FIRST)) {
        events.push({ userId, itemId: null, categoryId: null, actionType: ACTION_COUPON_FAILED,
                      createdAt: new Date(checkoutAt.getTime() - 2 * 60 * 1000), sessionId: checkoutSessionId, weight: null });
      }
      if (hasCoupon) {
        events.push({ userId, itemId: null, categoryId: null, actionType: ACTION_COUPON_APPLIED,
                      createdAt: new Date(checkoutAt.getTime() - 60 * 1000), sessionId: checkoutSessionId, weight: null });
      }

      orders.push({
        userId,
        status: isCancelled ? ORDER_STATUS_CANCELLED : ORDER_STATUS_DELIVERED,
        totalAmount, discountAmount, finalAmount,
        couponCode: hasCoupon ? "SEED-DISCOUNT10" : null,
        createdAt: orderDate,
        items,
      });
    }
  }

  // --- Duyệt NỀN (ngoài hành trình mua): chỉ user backgroundBrowser, từ lúc gia nhập; sau khi rời bỏ còn ×churnViewDecay
  // (xem) / ×churnCartDecay (bỏ giỏ) — hiệu chỉnh theo TARGETS.preChurn. Mỗi tháng tách 2 đoạn trước/sau rời bỏ.
  if (profile.backgroundBrowser) {
    const avgViewsPerSession = (profile.sessionPureViewBatch + 1) / 2;
    for (let month = 1; month <= totalMonths; month++) {
      const { start, end } = monthWindow(now, totalMonths, month);
      const s0 = Math.max(start.getTime(), birth);
      if (s0 >= end.getTime()) continue;
      const cut = dropoutAt != null ? Math.min(Math.max(dropoutAt, s0), end.getTime()) : end.getTime();
      for (const [a, b, churned] of [[s0, cut, false], [cut, end.getTime(), true]]) {
        if (b <= a) continue;
        const frac = (b - a) / MONTH_MS;
        const viewRate = (profile.baselineViewsPerMonth * GENERATION.backgroundScale * (churned ? GENERATION.churnViewDecay : 1)) / avgViewsPerSession;
        const cartRate = profile.lambdaBase * 0.8 * GENERATION.backgroundAbandonScale * (churned ? GENERATION.churnCartDecay : 1);
        const numAbandon = rng.poisson(cartRate * frac);
        const numPure = rng.poisson(viewRate * frac);
        for (let s = 0; s < numAbandon + numPure; s++) {
          const anchor = rhythmicTimestamp(rng, new Date(a), new Date(b), profile);
          const isAbandon = s < numAbandon;
          const { events: sessionEvents } = simulateSession(
            rng, catalog, profile, userId, anchor, profile.sessionBrowseSpreadMinutes,
            { forceCart: isAbandon, sessionKind: isAbandon ? "abandon" : "pureview", nextSessionId, history }
          );
          events.push(...sessionEvents);
        }
      }
    }
  }

  // Dữ liệu là ảnh chụp tại `now` của platform có `totalMonths` tháng tuổi: bỏ phần sau `now` (phiên đang dở) và trước
  // ngày platform mở (phiên hành trình đi trước lần mua đầu của user gia nhập sớm). Lọc SAU khi mô phỏng.
  return { orders, events: events.filter((e) => e.createdAt.getTime() <= nowMs && e.createdAt.getTime() >= winStart) };
}

/** Sinh dữ liệu cho toàn bộ user, trả về mảng gộp orders/events kèm userId tương ứng. */
export function simulateAllUsers(rng, profiles, userIds, catalog, { totalMonths = 12, now = new Date() } = {}) {
  const allOrders = [];
  const allEvents = [];

  profiles.forEach((profile, idx) => {
    const userId = userIds[idx];
    const { orders, events } = simulateUser(rng, profile, catalog, userId, totalMonths, now);
    allOrders.push(...orders);
    allEvents.push(...events);
  });

  return { orders: allOrders, events: allEvents };
}
