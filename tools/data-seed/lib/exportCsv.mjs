// Xuất dữ liệu sinh ra ra FILE thay vì DB — cho tập train quy mô lớn mang lên máy GPU thuê.
// Lý do tồn tại (2026-09-30): MariaDB dev chạy trong Docker trên máy local (buffer pool mặc định
// 128MB, đĩa ảo ~85 lần đọc/giây) không chịu nổi 7,4 triệu sự kiện của 5.000 user — ghi/xoá mất hàng
// giờ. Chia vai trò như production: DB phục vụ app/demo (quy mô vừa), file phục vụ train.
//
// Ghi nối tiếp theo từng lô user (seed.mjs gọi appendChunk mỗi lô) → bộ nhớ không phình theo tổng.
import fs from "node:fs";
import path from "node:path";

const esc = (v) => {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (cols) => cols.map(esc).join(",") + "\n";

const FILES = {
  events: ["user_id", "session_id", "item_id", "category_id", "action_type", "created_at", "weight"],
  orders: ["order_id", "user_id", "status", "total_amount", "discount_amount", "final_amount", "coupon_code", "created_at"],
  orderItems: ["order_id", "product_id", "unit_price", "quantity", "subtotal"],
  reviews: ["order_id", "product_id", "user_id", "rating", "created_at"],
  // NHÃN SINH (ground truth của simulator) — chỉ dùng để ĐÁNH GIÁ model churn, KHÔNG được đưa
  // vào làm feature (sẽ là rò rỉ nhãn). churn_month: tháng (1..months) bắt đầu rời bỏ.
  profiles: ["user_id", "will_churn", "churn_month", "price_sensitivity", "preferred_categories"],
};

export class CsvExporter {
  constructor(outDir) {
    this.outDir = outDir;
    this.paths = {
      events: path.join(outDir, "user_events.csv"),
      orders: path.join(outDir, "orders.csv"),
      orderItems: path.join(outDir, "order_items.csv"),
      reviews: path.join(outDir, "reviews.csv"),
      profiles: path.join(outDir, "user_profiles_ground_truth.csv"),
    };
    this.nextOrderId = 1;
    this.rows = { events: 0, orders: 0, orderItems: 0, reviews: 0, profiles: 0 };
  }

  init() {
    fs.mkdirSync(this.outDir, { recursive: true });
    for (const [k, p] of Object.entries(this.paths)) {
      if (fs.existsSync(p)) {
        throw new Error(`${p} đã tồn tại — chọn thư mục --out khác (không ghi đè tập dữ liệu cũ).`);
      }
      fs.writeFileSync(p, line(FILES[k]));
    }
  }

  /** Gán order_id tuần tự (thay auto-increment của DB) — phải gọi TRƯỚC khi sinh review. */
  assignOrderIds(orders) {
    for (const o of orders) o.dbId = this.nextOrderId++;
  }

  appendChunk({ orders, events, reviews, userIds, profiles }) {
    let buf = "";
    for (const e of events) {
      buf += line([e.userId, e.sessionId, e.itemId, e.categoryId, e.actionType, e.createdAt, e.weight]);
    }
    fs.appendFileSync(this.paths.events, buf);
    this.rows.events += events.length;

    let ob = "";
    let ib = "";
    for (const o of orders) {
      ob += line([o.dbId, o.userId, o.status, o.totalAmount, o.discountAmount, o.finalAmount, o.couponCode, o.createdAt]);
      for (const it of o.items) {
        ib += line([o.dbId, it.productId, it.unitPrice, it.quantity, it.subtotal]);
        this.rows.orderItems++;
      }
    }
    fs.appendFileSync(this.paths.orders, ob);
    fs.appendFileSync(this.paths.orderItems, ib);
    this.rows.orders += orders.length;

    fs.appendFileSync(this.paths.reviews, reviews.map((r) => line([r.orderId, r.productId, r.userId, r.rating, r.createdAt])).join(""));
    this.rows.reviews += reviews.length;

    fs.appendFileSync(this.paths.profiles, userIds.map((uid, i) => {
      const p = profiles[i];
      return line([uid, p.willChurn ? 1 : 0, p.willChurn ? p.churnMonth : "", p.priceSensitivity.toFixed(4), p.preferredCategories.join("|")]);
    }).join(""));
    this.rows.profiles += userIds.length;
  }

  finalize(manifest) {
    const full = { ...manifest, files: Object.fromEntries(Object.entries(this.paths).map(([k, p]) => [path.basename(p), this.rows[k]])) };
    fs.writeFileSync(path.join(this.outDir, "manifest.json"), JSON.stringify(full, null, 2));
    return full;
  }
}
