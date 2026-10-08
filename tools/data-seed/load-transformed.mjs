// Nạp dữ liệu hành vi THẬT đã transform (transform/rees46_transform.py) vào DB của hệ thống.
// Không sinh gì thêm: user / phiên / lượt xem / thêm giỏ / đơn hàng đều là của người dùng thật REES46, chỉ ánh xạ sang
// schema + catalog. User nhận diện qua email `rees_<id>@rees46.internal` → dọn/nạp lại độc lập với seed tổng hợp.
//   DB_HOST=127.0.0.1 node load-transformed.mjs --dir ../../data/transformed/rees46_multi_f0.02 --force
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { query, bulkInsert, getPool, closePool, DB } from "./lib/db.mjs";
import { writeOrders, writeEvents } from "./lib/writeData.mjs";
import { Rng } from "./lib/random.mjs";

const EMAIL_DOMAIN = "rees46.internal";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg("dir");
const FORCE = process.argv.includes("--force");
const EVENT_BATCH = Number(arg("event-batch", 20000));

/** Tách 1 dòng CSV (RFC 4180: trường có dấu phẩy/ngoặc kép được bọc "…", "" là 1 dấu ngoặc kép). */
function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function* readCsv(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const f = parseCsvLine(line);
    if (!header) { header = f; continue; }
    yield Object.fromEntries(header.map((h, i) => [h, f[i]]));
  }
}

const toDate = (s) => new Date(s.replace(" ", "T") + "Z");

async function deleteInBatches(sql, ids, size) {
  let n = 0;
  for (let i = 0; i < ids.length; i += size) {
    const b = ids.slice(i, i + size);
    const [r] = await getPool().query(sql.replace("(?)", `(${b.map(() => "?").join(",")})`), b);
    n += r.affectedRows;
  }
  return n;
}

async function cleanup() {
  const users = await query(`SELECT keycloak_user_id AS id FROM ${DB.USER}.users WHERE email LIKE ?`, [`%@${EMAIL_DOMAIN}`]);
  if (!users.length) return 0;
  const ids = users.map((u) => u.id);
  const orderIds = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const b = ids.slice(i, i + 1000);
    const rows = await query(`SELECT id FROM ${DB.ORDER}.orders WHERE user_id IN (${b.map(() => "?").join(",")})`, b);
    orderIds.push(...rows.map((r) => r.id));
  }
  await deleteInBatches(`DELETE FROM ${DB.ORDER}.order_items WHERE order_id IN (?)`, orderIds, 1000);
  await deleteInBatches(`DELETE FROM ${DB.ORDER}.orders WHERE id IN (?)`, orderIds, 1000);
  const ev = await deleteInBatches(`DELETE FROM ${DB.ORDER}.user_events WHERE user_id IN (?)`, ids, 500);
  await getPool().query(`DELETE FROM ${DB.USER}.users WHERE email LIKE ?`, [`%@${EMAIL_DOMAIN}`]);
  console.log(`Đã dọn ${ids.length} user REES46 cũ, ${orderIds.length} đơn, ${ev} sự kiện`);
  return ids.length;
}

async function main() {
  if (!DIR) throw new Error("Thiếu --dir <thư mục transform>");
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
  console.log(`Nạp: ${manifest.source}\n  ${JSON.stringify(manifest.stats)}`);
  const existing = (await query(`SELECT COUNT(*) AS c FROM ${DB.USER}.users WHERE email LIKE ?`, [`%@${EMAIL_DOMAIN}`]))[0].c;
  if (existing > 0) {
    if (!FORCE) throw new Error(`Đã có ${existing} user REES46 trong DB. Dùng --force để dọn và nạp lại.`);
    await cleanup();
  }
  const t0 = Date.now();

  // 1. users
  const now = new Date();
  const userRows = [];
  for await (const u of readCsv(path.join(DIR, "users.csv"))) {
    const created = u.created_at ? u.created_at : now;  // = sự kiện đầu tiên của user (transform), không phải lúc nạp
    userRows.push([u.keycloak_user_id, `rees_${u.rees46_user_id}`, `rees_${u.rees46_user_id}@${EMAIL_DOMAIN}`,
      `REES46 User ${u.rees46_user_id}`, "MEMBER", false, 0, true, created, created]);
  }
  await bulkInsert(`${DB.USER}.users`,
    ["keycloak_user_id", "username", "email", "full_name", "customer_tier", "is_blacklisted", "loyalty_points", "active", "created_at", "updated_at"],
    userRows, 1000);
  console.log(`users: ${userRows.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // 2. orders + order_items
  const items = new Map();
  for await (const it of readCsv(path.join(DIR, "order_items.csv"))) {
    const ref = it.order_ref;
    if (!items.has(ref)) items.set(ref, []);
    items.get(ref).push({ productId: Number(it.product_id), productName: it.product_name, unitPrice: Number(it.unit_price),
      quantity: Number(it.quantity), subtotal: Number(it.subtotal),
      variantId: it.variant_id ? Number(it.variant_id) : null, variantAttr: it.variant_attr || null, productImage: it.product_image || null });
  }
  const orders = [];
  for await (const o of readCsv(path.join(DIR, "orders.csv"))) {
    orders.push({ userId: o.user_id, status: o.status, totalAmount: Number(o.total_amount), discountAmount: Number(o.discount_amount),
      finalAmount: Number(o.final_amount), couponCode: o.coupon_code || null, createdAt: toDate(o.created_at), items: items.get(o.order_ref) || [] });
  }
  orders.sort((a, b) => a.createdAt - b.createdAt);
  const { ordersWritten, itemsWritten } = await writeOrders(new Rng(1), orders);
  console.log(`orders: ${ordersWritten}, order_items: ${itemsWritten} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // 3. user_events (theo lô, không giữ hết trong RAM)
  let batch = [], total = 0;
  for await (const e of readCsv(path.join(DIR, "user_events.csv"))) {
    batch.push({ userId: e.user_id, sessionId: e.session_id || null, itemId: e.item_id ? Number(e.item_id) : null,
      categoryId: e.category_id ? Number(e.category_id) : null, actionType: e.action_type, createdAt: toDate(e.created_at),
      weight: e.weight ? Number(e.weight) : null });
    if (batch.length >= EVENT_BATCH) {
      await writeEvents(batch);
      total += batch.length;
      batch = [];
      if (total % 200000 === 0) console.log(`  events: ${total.toLocaleString("vi-VN")} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  }
  if (batch.length) { await writeEvents(batch); total += batch.length; }
  console.log(`user_events: ${total.toLocaleString("vi-VN")} — XONG (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

main()
  .catch((e) => { console.error("Nạp thất bại:", e); process.exitCode = 1; })
  .finally(() => closePool());
