/**
 * Ghi nhận VI HÀNH VI (micro-behavior) để phục vụ bài toán dự đoán bỏ giỏ hàng.
 *
 * Vì sao cần: thí nghiệm trên clickstream thật (RetailRocket — xem
 * docs/canvas/churn-risk-log.md mục 2026-08-04) đo được rằng với chỉ 3 loại event
 * (xem/thêm giỏ/mua) thì THỨ TỰ hành vi không mang thêm thông tin nào (ΔAUC −0,0009), vì bigram
 * gần như trùng với số đếm. Bảng chữ cái hành vi phải phong phú hơn thì thứ tự mới có gì để mang —
 * module này bắn thêm 14 loại event, gồm cả IMPRESSION (xem shared_common/contracts.py::FE_BEHAVIOR_ACTIONS).
 *
 * 3 nguyên tắc bất di bất dịch ở đây:
 *  1. KHÔNG BAO GIỜ làm hỏng UX. Mọi thứ bọc try/catch, listener `passive`, gửi fire-and-forget,
 *     lỗi mạng bị nuốt im lặng. Ghi nhận hành vi là việc phụ trợ.
 *  2. Gom lô rồi gửi, không gửi từng event (vi hành vi tần suất cao hơn hẳn event nghiệp vụ).
 *  3. Gửi timestamp XẢY RA THẬT, không dùng giờ server nhận — vì lô được gom rồi mới gửi, dùng giờ
 *     server sẽ dồn cả lô vào một mốc và PHÁ VỠ THỨ TỰ, mà thứ tự chính là thứ cần đo.
 *
 * Chỉ chạy trên mobile-safe API (`visibilitychange`, scroll, thời gian dừng) — cố ý KHÔNG dùng gia
 * tốc chuột/hover thuần desktop, vì TMĐT Việt Nam đa số truy cập bằng mobile.
 */

import { getAuthToken } from "./apiClient.ts";

const ENDPOINT = "/public/behavior/events";
const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE = 200; // khớp MAX_BATCH_SIZE ở app/models/behavior.py
const SESSION_ID_KEY = "techstore_session_id";

export type BehaviorAction =
  | "VIEW_CART"
  | "BEGIN_CHECKOUT"
  | "VIEW_SHIPPING_FEE"
  | "COUPON_FAILED"
  | "COUPON_APPLIED"
  | "TAB_HIDDEN"
  | "TAB_VISIBLE"
  | "SCROLL_DEPTH"
  | "PAGE_DWELL"
  | "PRODUCT_ZOOM"
  | "SEARCH"
  | "FILTER_APPLIED"
  | "SORT_APPLIED"
  | "IMPRESSION";

/** Nơi IMPRESSION xảy ra -> cột `user_events.source`. Phải khớp IMPRESSION_SOURCES ở
 * shared_common/contracts.py (backend từ chối giá trị lạ). 3 giá trị đầu = 3 tab khối gợi ý trang chủ. */
export type ImpressionSource = "for_you" | "recent" | "trending" | "search" | "category";

interface QueuedEvent {
  actionType: BehaviorAction;
  itemId?: number | null;
  categoryId?: number | null;
  weight?: number | null;
  source?: ImpressionSource | null;
  timestamp: string;
  sessionId: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialised = false;
// Trạng thái của "trang" hiện tại — reset mỗi lần đổi route (xem `notifyRouteChange`)
let pageEnteredAt = Date.now();
const scrollMilestonesSent = new Set<number>();

/** Dùng CHUNG session id với apiClient (cùng khoá sessionStorage) để event vi hành vi và event
 * nghiệp vụ (xem SP/giỏ hàng) ghép được vào cùng một phiên khi phân tích chuỗi. */
function getSessionId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    let id = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return null; // sessionStorage bị chặn (chế độ riêng tư) -> vẫn chạy, chỉ mất session id
  }
}

function postBatch(url: string, body: string, token: string | null): Promise<Response> {
  // `keepalive` cho phép request sống sót qua điều hướng/đóng tab — giống sendBeacon nhưng
  // set được header Authorization (sendBeacon thì không).
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    keepalive: true,
  });
}

function sendBatch(events: QueuedEvent[], useBeacon: boolean): void {
  if (events.length === 0) return;
  const url = `${API_BASE_URL}${ENDPOINT}`;
  const body = JSON.stringify({ events });

  try {
    // Gửi kèm token để gateway inject X-User-Id — trước đây không gửi nên MỌI vi hành vi lưu với
    // user_id = NULL, không ghép được với VIEW/CART của cùng người dùng (docs/canvas/
    // recsys-behavior-flow-review.md lỗi #7).
    const token = getAuthToken();
    if (!token && useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      // Khách chưa đăng nhập, đang rời trang: beacon là cách chắc chắn nhất còn kịp gửi.
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void postBatch(url, body, token)
      .then((res) => {
        // Token hết hạn -> gateway trả 401 cho cả route public. Gửi lại không kèm token để không mất
        // lô event (vẫn ghép được theo session_id).
        if (res.status === 401 && token) return postBatch(url, body, null);
        return res;
      })
      .catch(() => {
        /* nuốt im lặng: ghi nhận hành vi không được làm người dùng thấy lỗi */
      });
  } catch {
    /* nuốt im lặng */
  }
}

export function flushBehavior(useBeacon = false): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  sendBatch(batch, useBeacon);
}

/** Đưa 1 vi hành vi vào hàng đợi. An toàn khi gọi ở bất kỳ đâu, kể cả trước khi `initBehaviorTracker`. */
export function trackBehavior(
  actionType: BehaviorAction,
  opts: { itemId?: number | null; categoryId?: number | null; weight?: number | null; source?: ImpressionSource | null } = {}
): void {
  try {
    queue.push({
      actionType,
      itemId: opts.itemId ?? null,
      categoryId: opts.categoryId ?? null,
      weight: opts.weight ?? null,
      source: opts.source ?? null,
      // UTC, không hậu tố Z — cùng quy ước với BE Java (LocalDateTime.now(ZoneOffset.UTC)) và NOW() của DB
      timestamp: new Date().toISOString().slice(0, 19),
      sessionId: getSessionId(),
    });
    // Đầy hàng đợi thì gửi ngay, không chờ hết chu kỳ — tránh mất event khi người dùng hoạt động dày.
    if (queue.length >= MAX_QUEUE) flushBehavior();
  } catch {
    /* nuốt im lặng */
  }
}

const MAX_IMPRESSIONS_PER_LIST = 20; // tran an toan hang doi, danh sach dai (vd 100 SP tim kiem)
                                       // chi can top-N thuc su hien thi cho user, khong can toan bo

/** Ghi nhận danh sách sản phẩm vừa HIỂN THỊ cho user (chưa chắc được click) — lấp khoảng trống
 * "gợi ý đưa ra mà bị bỏ qua" mà tracker trước đây không phân biệt được với "chưa từng đưa ra".
 * Bắn 1 event/sản phẩm (fan-out), tái dùng `itemId` số ít sẵn có — không đổi shape event. Gọi
 * trong `useEffect` sau khi 1 danh sách sản phẩm được render xong (trang chủ/tìm kiếm/danh mục).
 *
 * `weight` = VỊ TRÍ hiển thị (1 = đầu danh sách): không có vị trí thì không tách được "không bấm vì
 * không thích" khỏi "không bấm vì nằm cuối, không ai kéo tới" (position bias).
 * `source` = danh sách nằm ở đâu (tab gợi ý nào / search / category) — để tính CTR theo từng khối. */
export function trackImpressions(
  productIds: Array<number | string>,
  source: ImpressionSource,
  categoryId?: number | null
): void {
  try {
    const capped = productIds.slice(0, MAX_IMPRESSIONS_PER_LIST);
    capped.forEach((id, index) => {
      const numericId = typeof id === "string" ? Number(id) : id;
      if (!Number.isFinite(numericId)) return;
      trackBehavior("IMPRESSION", { itemId: numericId, categoryId: categoryId ?? null, weight: index + 1, source });
    });
  } catch {
    /* nuốt im lặng */
  }
}

/** Gọi mỗi khi SPA đổi route (xem `BehaviorRouteTracker` trong App.jsx): ghi thời gian dừng của trang
 * vừa rời và reset mốc cuộn cho trang mới.
 *
 * Trước đây chỉ nghe `popstate` — nhưng React Router (`BrowserRouter`) đổi trang bằng `pushState`, và
 * `popstate` CHỈ bắn khi bấm Back/Forward. Hệ quả: bấm link bình thường thì PAGE_DWELL không bao giờ
 * được ghi, còn mốc SCROLL_DEPTH đã bắn ở trang đầu thì không bắn lại ở mọi trang sau trong phiên. */
export function notifyRouteChange(): void {
  try {
    trackBehavior("PAGE_DWELL", { weight: Math.round((Date.now() - pageEnteredAt) / 1000) });
    pageEnteredAt = Date.now();
    scrollMilestonesSent.clear();
  } catch {
    /* nuốt im lặng */
  }
}

/** Gắn các listener tự động (rời tab, cuộn trang, thời gian dừng). Gọi 1 lần lúc app khởi động. */
export function initBehaviorTracker(): void {
  if (initialised || typeof window === "undefined") return;
  initialised = true;

  try {
    pageEnteredAt = Date.now();

    // --- Rời tab / quay lại: tín hiệu "đi so giá ở nơi khác", có trên cả mobile ---
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        trackBehavior("TAB_HIDDEN");
        trackBehavior("PAGE_DWELL", { weight: Math.round((Date.now() - pageEnteredAt) / 1000) });
        flushBehavior(true); // dùng beacon: có thể người dùng đang đóng tab
      } else {
        pageEnteredAt = Date.now();
        trackBehavior("TAB_VISIBLE");
      }
    });

    // --- Độ sâu cuộn: chỉ bắn ở 4 mốc, mỗi mốc 1 lần/trang (không spam mỗi pixel) ---
    const onScroll = () => {
      try {
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        const pct = Math.round((window.scrollY / scrollable) * 100);
        for (const milestone of [25, 50, 75, 100]) {
          if (pct >= milestone && !scrollMilestonesSent.has(milestone)) {
            scrollMilestonesSent.add(milestone);
            trackBehavior("SCROLL_DEPTH", { weight: milestone });
          }
        }
      } catch {
        /* nuốt im lặng */
      }
    };
    // `passive: true` — bắt buộc, nếu không sẽ làm chậm cuộn trang trên mobile.
    window.addEventListener("scroll", onScroll, { passive: true });

    // Đổi route trong SPA (kể cả Back/Forward) do `notifyRouteChange` xử lý — không nghe `popstate`
    // ở đây nữa để khỏi ghi PAGE_DWELL 2 lần khi bấm Back.

    window.addEventListener("pagehide", () => flushBehavior(true));

    flushTimer = setInterval(() => flushBehavior(), FLUSH_INTERVAL_MS);
  } catch {
    /* nuốt im lặng: tracker lỗi không được làm app không chạy được */
  }
}

export function stopBehaviorTracker(): void {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  flushBehavior(true);
}
