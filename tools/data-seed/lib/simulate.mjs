import { lambdaDecayAt, restlessnessMultiplierAt } from "./profiles.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS; // đơn giản hoá: "tháng" = 30 ngày, đủ dùng cho dữ liệu tổng hợp

const ORDER_STATUS_DELIVERED = "DELIVERED";
const ORDER_STATUS_CANCELLED = "CANCELLED";

const ACTION_VIEW = "VIEW_PRODUCT";
const ACTION_ADD_TO_CART = "ADD_TO_CART";

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
// ═══════════════════════════════════════════════════════════════════════════════════════════

const PCT_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

// Đuôi cực đoan (1 phiên 3749 sự kiện, 1 phiên xem 188 item phân biệt trước khi cart) là user
// cực kỳ hiếm gặp trong 4,5 triệu phiên thật — cắt về giá trị hợp lý để tránh 1 phiên tổng hợp
// "nuốt" quá nhiều bộ nhớ/thời gian sinh dữ liệu một cách vô ích.
const SESSION_LENGTH_PCTS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 5, 8, 15, 50];
const VIEWS_BEFORE_CART_PCTS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 4, 10];

const P_SAME_CATEGORY = 0.6343;
const CART_TARGET_PROBS = {
  sameAsLastView: 0.1748,
  differentSeenItem: 0.0385,
  // phan con lai (0.7867) = noPriorView, khong can luu rieng vi la phan bu
};

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

/** Id phiên tổng hợp, sinh từ RNG có seed (KHÔNG dùng crypto.randomUUID) để giữ toàn bộ dataset
 * reproducible theo --seed, giống mọi giá trị khác trong bộ sinh dữ liệu này. */
function randomSessionId(rng) {
  let hex = "";
  for (let i = 0; i < 16; i++) hex += rng.int(0, 15).toString(16);
  return `seed-${hex}`;
}

function pickFromCategory(rng, catalog, categoryId) {
  const list = catalog.byCategory.get(categoryId);
  if (list && list.length > 0) return rng.choice(list);
  return rng.choice(catalog.products);
}

function pickPreferredOrRandom(rng, catalog, profile) {
  const usePreferred = profile.preferredCategories.length > 0 && rng.bool(PREFERRED_CATEGORY_WEIGHT);
  if (usePreferred) return pickFromCategory(rng, catalog, rng.choice(profile.preferredCategories));
  return rng.choice(catalog.products);
}

/** Chọn sản phẩm kế tiếp trong 1 phiên: ưu tiên CÙNG category với sản phẩm vừa xem (đo được
 * 63,4% trên dữ liệu thật) — đây là điểm khác biệt cốt lõi so với bản cũ (mỗi lượt pick độc lập
 * hoàn toàn, không có "quán tính" category trong phiên). */
function pickNextProduct(rng, catalog, profile, lastCategoryId) {
  if (lastCategoryId != null && rng.bool(P_SAME_CATEGORY)) {
    return pickFromCategory(rng, catalog, lastCategoryId);
  }
  return pickPreferredOrRandom(rng, catalog, profile);
}

/** Sinh 1 PHIÊN hoàn chỉnh: độ dài + nội dung lấy mẫu theo ĐÚNG phân phối đo được từ REES46,
 * thay cho luật cứng "xem X thì chắc chắn cart X liền" trước đây.
 *
 * `forceCart`: phiên này CÓ dẫn tới 1 lượt thêm giỏ (dùng cho luồng đơn hàng thật/bỏ giỏ hàng —
 * 2 khái niệm nghiệp vụ này giữ nguyên tần suất tương đối như bản cũ, chỉ đổi NỘI DUNG bên trong
 * mỗi phiên; xem `simulateUser`). Trả về `cartTargetProduct` — sản phẩm THỰC SỰ được thêm giỏ,
 * có thể KHÁC với sản phẩm vừa xem (78,7% trường hợp thật không có view liền trước trong phiên).
 */
function simulateSession(rng, catalog, profile, userId, anchorTime, sessionSpreadMinutes, { forceCart = false } = {}) {
  const events = [];
  const sessionId = randomSessionId(rng);
  const rawLength = Math.round(sampleFromPercentiles(rng, SESSION_LENGTH_PCTS));
  const length = Math.max(1, Math.min(rawLength, 50));

  const viewedThisSession = []; // theo đúng thứ tự đã xem trong phiên
  let lastCategoryId = null;
  let cartPlacedAtIndex = length - 1; // mặc định: quyết định thêm giỏ ở CUỐI phiên (sau khi xem xong)
  if (forceCart) {
    const viewsBeforeCart = Math.round(sampleFromPercentiles(rng, VIEWS_BEFORE_CART_PCTS));
    cartPlacedAtIndex = Math.min(viewsBeforeCart, length - 1);
  }

  let cartTargetProduct = null;
  // ⚠️ Bug đã sửa: `t = anchor + i * rng.int(...)` (vẽ lại bước nhảy MỚI mỗi vòng lặp rồi NHÂN
  // với chỉ số i) KHÔNG đảm bảo tăng dần theo thời gian — vd bước nhảy lớn ở i=1 rồi bước nhỏ ở
  // i=2 có thể làm t2 < t1. Khi đọc lại dữ liệu (luôn sort theo created_at, xem behavior_consumer.py)
  // thứ tự bị xáo trộn so với thứ tự SINH RA (nơi category-stickiness được áp đúng theo lastCategoryId)
  // — làm loãng số đo category-stickiness từ ~63% xuống còn ~53% (phát hiện qua test độc lập, xem
  // `_test_simulate_tmp.mjs`). Sửa bằng cách CỘNG DỒN thời gian, đảm bảo tăng dần tuyệt đối.
  let cursorTime = anchorTime.getTime();

  for (let i = 0; i < length; i++) {
    const product = pickNextProduct(rng, catalog, profile, lastCategoryId);
    lastCategoryId = product.categoryId;
    if (i > 0) cursorTime += rng.int(5, sessionSpreadMinutes * 60 || 180) * 1000;
    const t = new Date(cursorTime);
    events.push({
      userId, itemId: product.id, categoryId: product.categoryId,
      actionType: ACTION_VIEW, createdAt: t, sessionId,
    });
    viewedThisSession.push(product);

    if (forceCart && i === cartPlacedAtIndex) {
      // Sản phẩm được thêm giỏ THEO ĐÚNG tỉ lệ đo được — phần lớn KHÔNG phải sản phẩm vừa xem.
      const roll = rng.float(0, 1);
      if (roll < CART_TARGET_PROBS.sameAsLastView) {
        cartTargetProduct = product;
      } else if (roll < CART_TARGET_PROBS.sameAsLastView + CART_TARGET_PROBS.differentSeenItem
                 && viewedThisSession.length > 1) {
        cartTargetProduct = rng.choice(viewedThisSession.slice(0, -1));
      } else {
        // Không liên quan tới lượt xem TRONG phiên này — đi thẳng từ danh sách/tìm kiếm, hoặc đã
        // xem ở một phiên KHÁC từ trước (dữ liệu thật cho thấy đây là trường hợp PHỔ BIẾN NHẤT).
        // Vẫn dùng `pickNextProduct` (có quán tính category theo `lastCategoryId`) chứ không phải
        // độc lập hoàn toàn — vì số đo 63,4% category-stickiness trên REES46 tính trên TOÀN BỘ
        // chuỗi sự kiện (gồm cả cart), không riêng cặp view-view; bỏ qua điều này làm stickiness
        // đo lại trên dữ liệu sinh ra thấp hơn hẳn mục tiêu (kiểm chứng bằng test độc lập).
        cartTargetProduct = pickNextProduct(rng, catalog, profile, lastCategoryId);
      }
      const cartAt = new Date(t.getTime() + rng.int(1, 30) * 60 * 1000);
      events.push({
        userId, itemId: cartTargetProduct.id, categoryId: cartTargetProduct.categoryId,
        actionType: ACTION_ADD_TO_CART, createdAt: cartAt, sessionId,
      });
    }
  }

  return { events, cartTargetProduct };
}

/** Sinh toàn bộ order + user_events cho MỘT user qua `totalMonths` tháng gần nhất tính đến `now`. */
function simulateUser(rng, profile, catalog, userId, totalMonths, now) {
  const orders = [];
  const events = [];

  for (let month = 1; month <= totalMonths; month++) {
    const { start, end } = monthWindow(now, totalMonths, month);
    const decay = lambdaDecayAt(profile, month);
    const restless = restlessnessMultiplierAt(profile, month);

    // --- Đơn hàng thật: mỗi item trong đơn = 1 phiên có thêm giỏ (nội dung phiên thật, không
    // còn ghép cứng view-cart cùng item — xem simulateSession). Tần suất/tháng giữ NGUYÊN như
    // bản cũ (gắn với động lực churn đã được validate ở feature engineering, không đụng vào).
    const numOrders = rng.poisson(profile.lambdaBase * decay);
    for (let o = 0; o < numOrders; o++) {
      const orderDate = rhythmicTimestamp(rng, start, end, profile);
      const numItems = rng.int(1, 3);
      const items = [];
      let totalAmount = 0;

      for (let it = 0; it < numItems; it++) {
        // Phiên dẫn tới item này trong đơn: neo 10 phút - 6h trước khi đặt (gần thời điểm mua).
        const anchor = new Date(orderDate.getTime() - rng.int(10, 360) * 60 * 1000);
        const { events: sessionEvents, cartTargetProduct } = simulateSession(
          rng, catalog, profile, userId, anchor, profile.sessionBrowseSpreadMinutes, { forceCart: true }
        );
        events.push(...sessionEvents);

        const product = cartTargetProduct;
        const quantity = rng.int(1, 2);
        const unitPrice = Number(product.price);
        const subtotal = unitPrice * quantity;
        totalAmount += subtotal;
        items.push({ productId: product.id, productName: product.name, unitPrice, quantity, subtotal });
      }

      const isCancelled = rng.bool(profile.cancelProb);
      const hasCoupon = rng.bool(profile.priceSensitivity * 0.5);
      const discountAmount = hasCoupon ? Math.round(totalAmount * 0.1) : 0;
      const finalAmount = totalAmount - discountAmount;

      orders.push({
        userId,
        status: isCancelled ? ORDER_STATUS_CANCELLED : ORDER_STATUS_DELIVERED,
        totalAmount, discountAmount, finalAmount,
        couponCode: hasCoupon ? "SEED-DISCOUNT10" : null,
        createdAt: orderDate,
        items,
      });
    }

    // --- Bỏ giỏ hàng KHÔNG dẫn tới đơn (tín hiệu rủi ro rời bỏ) — tần suất/tháng giữ NGUYÊN
    // như bản cũ (gắn với churn), chỉ đổi nội dung phiên bên trong.
    const numAbandon = rng.poisson(profile.lambdaBase * decay * restless * 0.8);
    for (let a = 0; a < numAbandon; a++) {
      const anchor = rhythmicTimestamp(rng, start, end, profile);
      const { events: sessionEvents } = simulateSession(
        rng, catalog, profile, userId, anchor, profile.sessionBrowseSpreadMinutes, { forceCart: true }
      );
      events.push(...sessionEvents);
    }

    // --- Xem thuần tuý, không thêm giỏ (nhiễu nền + tín hiệu "bỏ dở", đo được 87,8% lượt xem
    // không dẫn tới thêm giỏ trong cùng phiên trên dữ liệu thật) — tần suất/tháng giữ NGUYÊN.
    const avgViewsPerSession = (profile.sessionPureViewBatch + 1) / 2;
    const numPureViewSessions = rng.poisson(
      (profile.baselineViewsPerMonth * decay * (restless > 1 ? 1.3 : 1)) / avgViewsPerSession
    );
    for (let s = 0; s < numPureViewSessions; s++) {
      const anchor = rhythmicTimestamp(rng, start, end, profile);
      const { events: sessionEvents } = simulateSession(
        rng, catalog, profile, userId, anchor, profile.sessionBrowseSpreadMinutes, { forceCart: false }
      );
      events.push(...sessionEvents);
    }
  }

  return { orders, events };
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
