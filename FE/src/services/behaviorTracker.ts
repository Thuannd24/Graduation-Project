/**
 * Ghi nhận VI HÀNH VI (micro-behavior) để phục vụ bài toán dự đoán bỏ giỏ hàng.
 *
 * Vì sao cần: thí nghiệm trên clickstream thật (RetailRocket — xem
 * docs/canvas/churn-risk-log.md mục 2026-08-04) đo được rằng với chỉ 3 loại event
 * (xem/thêm giỏ/mua) thì THỨ TỰ hành vi không mang thêm thông tin nào (ΔAUC −0,0009), vì bigram
 * gần như trùng với số đếm. Bảng chữ cái hành vi phải phong phú hơn thì thứ tự mới có gì để mang —
 * module này bắn thêm 13 loại event (xem shared_common/contracts.py::FE_BEHAVIOR_ACTIONS).
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
  | "SORT_APPLIED";

interface QueuedEvent {
  actionType: BehaviorAction;
  itemId?: number | null;
  categoryId?: number | null;
  weight?: number | null;
  timestamp: string;
  sessionId: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialised = false;

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

function sendBatch(events: QueuedEvent[], useBeacon: boolean): void {
  if (events.length === 0) return;
  const url = `${API_BASE_URL}${ENDPOINT}`;
  const body = JSON.stringify({ events });

  try {
    // Lúc rời trang, fetch thường bị hủy giữa đường -> sendBeacon là cách duy nhất còn kịp gửi.
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    // `keepalive` cho phép request sống sót qua điều hướng trang.
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
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
  opts: { itemId?: number | null; categoryId?: number | null; weight?: number | null } = {}
): void {
  try {
    queue.push({
      actionType,
      itemId: opts.itemId ?? null,
      categoryId: opts.categoryId ?? null,
      weight: opts.weight ?? null,
      timestamp: new Date().toISOString().slice(0, 19), // LocalDateTime-compatible, khớp BE Java
      sessionId: getSessionId(),
    });
    // Đầy hàng đợi thì gửi ngay, không chờ hết chu kỳ — tránh mất event khi người dùng hoạt động dày.
    if (queue.length >= MAX_QUEUE) flushBehavior();
  } catch {
    /* nuốt im lặng */
  }
}

/** Gắn các listener tự động (rời tab, cuộn trang, thời gian dừng). Gọi 1 lần lúc app khởi động. */
export function initBehaviorTracker(): void {
  if (initialised || typeof window === "undefined") return;
  initialised = true;

  try {
    let pageEnteredAt = Date.now();
    const scrollMilestonesSent = new Set<number>();

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

    // SPA đổi route: reset mốc cuộn + mốc thời gian dừng cho "trang" mới.
    window.addEventListener("popstate", () => {
      trackBehavior("PAGE_DWELL", { weight: Math.round((Date.now() - pageEnteredAt) / 1000) });
      pageEnteredAt = Date.now();
      scrollMilestonesSent.clear();
    });

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
