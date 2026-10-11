"""TRANSFORM dữ liệu hành vi THẬT (REES46 đa ngành) thành dữ liệu khớp hệ thống — KHÔNG tự sinh hành vi.

Khác `seed.mjs` (mô phỏng từ phân bố đo được): mỗi user, phiên, lượt xem / thêm giỏ / mua ở đây là của người dùng THẬT
REES46. Chỉ đổi "nhãn" để khớp schema + catalog hệ thống; thứ tự, khoảng cách thời gian, phiên, việc bỏ giỏ… giữ NGUYÊN.
Chủ dự án chốt 2026-10-02: transform thay mô phỏng; nguồn đa ngành; giá đơn = giá thật USD × tỉ giá.
Đối chiếu schema từng cột: docs/canvas/rees46-transform-mapping.md.

NGUỒN: 12/2019 → 4/2020 (data.rees46.com/datasets/marketplace). KHÔNG dùng 10–11/2019: đo được ghi log giỏ bị lỗi
(61,5% phiên có mua không có lượt thêm giỏ nào; từ 12/2019 chỉ còn 1,0% — check_cart_logging.py). Lưu ý: 3–4/2020 trùng
giai đoạn COVID (thị trường Nga) → hành vi có thể dịch chuyển; ghi trong manifest.

Ánh xạ (TẤT ĐỊNH — cùng đầu vào ra cùng kết quả):
  - user: lấy mẫu theo hash(user_id) với tỉ lệ --frac (giữ TRỌN lịch sử của user được chọn); keycloak_user_id = uuid5.
  - ngành gốc: từ 12/2019 mã ngành của REES46 bị SAI cho các category_id mới (build_product_ref.py, rees46-transform-
    mapping.md §6.2) → KHÔNG dùng mã của file nguồn. Mã của mỗi category_id = (1) mã 10–11/2019 nếu id cũ; (2) ĐA SỐ mã
    10–11 của các SP cũ nằm trong id đó (bỏ phiếu theo số sự kiện, trên TOÀN BỘ dòng nguồn); (3) đa số theo brand (bảng
    brand → mã ở 10–11); (4) không suy được → hash. Tỉ lệ từng đường ghi trong manifest.
  - danh mục: mỗi category_id REES46 → 1 danh mục lá Tiki trong ngành đó (hash) → giữ quan hệ "cùng danh mục".
  - sản phẩm: trong danh mục lá, SP Tiki có giá GẦN NHẤT với giá thật × fx (để tên ≈ giá; giá đơn vẫn là giá thật).
    SP có biến thể → chọn 1 biến thể active theo hash(product_id REES46) (hệ thống thật luôn ghi biến thể khi đặt).
  - sự kiện: view → VIEW_PRODUCT (category_id = danh mục Tiki), cart → ADD_TO_CART (category_id = NULL — giống hệ thống
    thật: CartUpdatedEvent không mang danh mục). Nguồn không có remove_from_cart.
  - đơn: gộp `purchase` theo (user, phiên); số lượng = số dòng purchase của SP trong phiên; đơn giá = giá THẬT trung vị của
    SP trong phiên × --fx (VND); DELIVERED; không voucher.
  - thời gian: dịch NGUYÊN TUẦN để sự kiện cuối ≤ --now (giữ thứ trong tuần + giờ thật). users.created_at = sự kiện đầu.
  - khử dòng trùng hoàn toàn.
KHÔNG có trong nguồn → không bịa: remove_from_cart, 14 vi hành vi FE, review, voucher, huỷ đơn, phễu checkout.
Đầu ra: data/transformed/<tên>/{users,user_events,orders,order_items}.csv + manifest.json → nạp bằng load-transformed.mjs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pymysql

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
REF = f"{ROOT}/data/transformed/_ref"
SRC_DIR = f"{ROOT}/data/external/rees46-multi-full"
DEFAULT_FILES = ["2019-Dec.csv.gz", "2020-Jan.csv.gz", "2020-Feb.csv.gz", "2020-Mar.csv.gz", "2020-Apr.csv.gz"]
NS = uuid.UUID("6f1c9a8e-3b2d-4e55-9a77-2b5f0c1d4e66")

ROOT_MAP_L2 = {
    "electronics.smartphone": "dien-thoai-may-tinh-bang",
    "electronics.telephone": "dien-thoai-may-tinh-bang",
    "electronics.tablet": "dien-thoai-may-tinh-bang",
}
ROOT_MAP_L1 = {
    "electronics": "thiet-bi-kts-phu-kien-so",
    "auto": "thiet-bi-kts-phu-kien-so",
    "computers": "laptop-may-vi-tinh-linh-kien",
    "appliances": "dien-gia-dung",
    "furniture": "nha-cua-doi-song",
    "construction": "nha-cua-doi-song",
    "country_yard": "nha-cua-doi-song",
    "kids": "do-choi-me-be",
    "sport": "the-thao-da-ngoai",
    "medicine": "lam-dep-suc-khoe",
    "stationery": "nha-sach-tiki",
    "apparel": "_fashion",
    "accessories": "_fashion",
}
FASHION = ["thoi-trang-nam", "thoi-trang-nu"]

# Ngày bị LỖI GHI LOG purchase (view/cart vẫn bình thường trong ngày đó -> không phải nghỉ lễ thật, loại ra khỏi
# nguồn mua hàng; daily_profile.py, 2026-10-05): 01-02/01/2020 (3.574 rồi 0 lượt mua, bình thường ~29.000/ngày),
# 20-21/04/2020 (22, 29 lượt mua). Chỉ 4/152 ngày (2,6%).
BROKEN_PURCHASE_DAYS = {"2020-01-01", "2020-01-02", "2020-04-20", "2020-04-21"}


def h(x) -> int:
    return int.from_bytes(hashlib.blake2b(str(x).encode(), digest_size=8).digest(), "big")


def root_from_code(code, category_id):
    parts = code.split(".")
    r = ROOT_MAP_L2.get(".".join(parts[:2])) or ROOT_MAP_L1.get(parts[0])
    if r == "_fashion":
        return FASHION[h(category_id) % 2]
    return r


def load_catalog():
    conn = pymysql.connect(host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", 3308)),
                           user="root", password="root", cursorclass=pymysql.cursors.DictCursor)
    cur = conn.cursor()
    cur.execute("SELECT id, parent_id, slug FROM ecommerce_product_db.categories")
    cats = {r["id"]: r for r in cur.fetchall()}
    cur.execute("SELECT id, category_id, name, price, image_url FROM ecommerce_product_db.products WHERE active = 1")
    prods = cur.fetchall()
    cur.execute("SELECT id, product_id, variant_attr, image_url FROM ecommerce_product_db.product_variants "
                "WHERE active IS NULL OR active = 1 ORDER BY id")
    variants = defaultdict(list)
    for v in cur.fetchall():
        variants[v["product_id"]].append(v)
    conn.close()

    def root_slug(cid):
        c = cats.get(cid)
        for _ in range(10):
            if c is None or c["parent_id"] is None or c["parent_id"] not in cats:
                break
            c = cats[c["parent_id"]]
        return c["slug"] if c else None

    leaves, by_leaf = defaultdict(list), defaultdict(list)
    for p in prods:
        by_leaf[p["category_id"]].append(p)
    for cid, ps in by_leaf.items():
        ps.sort(key=lambda p: (float(p["price"]), p["id"]))
        r = root_slug(cid)
        if r:
            leaves[r].append(cid)
    for r in leaves:
        leaves[r].sort()
    return dict(leaves), dict(by_leaf), dict(variants)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frac", type=float, default=0.02)
    ap.add_argument("--files", nargs="*", default=DEFAULT_FILES)
    ap.add_argument("--fx", type=float, default=25_000, help="tỉ giá USD → VND cho đơn giá")
    ap.add_argument("--now", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    ap.add_argument("--name", default=None)
    ap.add_argument("--chunk", type=int, default=2_000_000)
    ap.add_argument("--max-chunks", type=int, default=0, help="chỉ để chạy thử: dừng sau N khúc mỗi file")
    args = ap.parse_args()
    name = args.name or f"rees46_multi_dec_apr_f{args.frac:g}"
    out = f"{ROOT}/data/transformed/{name}"
    os.makedirs(out, exist_ok=True)
    t0 = time.time()

    leaves, by_leaf, variants = load_catalog()
    print(f"catalog: {sum(len(v) for v in by_leaf.values())} SP / {len(by_leaf)} lá / {len(leaves)} ngành gốc / "
          f"{sum(len(v) for v in variants.values())} biến thể", flush=True)

    # bảng tham chiếu 10–11/2019 (mã ngành đúng)
    pref = pd.read_csv(f"{REF}/product_ref.csv", dtype={"category_code": "string", "brand": "string"})
    ref_code_of_prod = {k: v for k, v in zip(pref["product_id"], pref["category_code"]) if isinstance(v, str)}
    cref = pd.read_csv(f"{REF}/category_ref.csv", dtype={"category_code": "string"})
    ref_code_of_cat = dict(zip(cref["category_id"], cref["category_code"]))
    bref = pd.read_csv(f"{REF}/brand_root.csv", dtype={"brand": "string", "category_code": "string"})
    ref_code_of_brand = dict(zip(bref["brand"], bref["category_code"]))
    print(f"tham chiếu 10–11: {len(pref):,} SP, {len(cref)} danh mục, {len(bref):,} brand", flush=True)

    # --- 1. đọc toàn bộ nguồn: lấy mẫu user + bỏ phiếu mã ngành cho mỗi category_id trên MỌI dòng ---
    thr = int(args.frac * 2**32)
    cat_votes = defaultdict(Counter)       # category_id → Counter(mã 10–11 của SP cũ trong nó), theo số sự kiện
    brand_votes = defaultdict(Counter)     # category_id → Counter(mã suy từ brand), theo số sự kiện
    parts, n_rows, n_dup = [], 0, 0
    dtype = {"event_type": "category", "product_id": "int64", "category_id": "int64", "category_code": "string",
             "brand": "string", "price": "float64", "user_id": "int64", "user_session": "string"}
    for f in args.files:
        k = 0
        for ch in pd.read_csv(f"{SRC_DIR}/{f}", chunksize=args.chunk, dtype=dtype):
            n_rows += len(ch)
            pairs = ch.groupby(["category_id", "product_id"], observed=True).size()
            for (cid, pid), n in pairs.items():
                code = ref_code_of_prod.get(pid)
                if code is not None:
                    cat_votes[cid][code] += int(n)
            bp = ch[ch["brand"].notna()].groupby(["category_id", "brand"], observed=True).size()
            for (cid, b), n in bp.items():
                code = ref_code_of_brand.get(b)
                if isinstance(code, str):
                    brand_votes[cid][code] += int(n)
            keep = ((ch["user_id"].to_numpy(np.uint64) * np.uint64(2654435761)) % np.uint64(2**32)) < thr
            s = ch[keep]
            before = len(s)
            s = s.drop_duplicates()
            n_dup += before - len(s)
            parts.append(s)
            k += 1
            if args.max_chunks and k >= args.max_chunks:
                break
        print(f"{f}: xong ({n_rows:,} dòng nguồn, {time.time() - t0:.0f}s)", flush=True)
    ev = pd.concat(parts, ignore_index=True)
    ev = ev[ev["user_session"].notna()]
    ev["ts"] = pd.to_datetime(ev["event_time"].str.slice(0, 19), format="%Y-%m-%d %H:%M:%S").dt.tz_localize("UTC")
    ev = ev.drop(columns=["event_time"]).sort_values(["user_id", "ts"], kind="stable").reset_index(drop=True)
    print(f"mẫu: {len(ev):,} sự kiện / {ev['user_id'].nunique():,} user ({time.time() - t0:.0f}s)", flush=True)

    # --- 2. mã ngành cho từng category_id: id cũ → mã 10–11; id mới → đa số SP cũ; → đa số brand; → hash ---
    all_roots = sorted(leaves)
    cat_root, cat_code_resolved, how = {}, {}, Counter()
    for cid, n in ev.groupby("category_id").size().items():
        code, path = ref_code_of_cat.get(cid), "old_category_id"
        if not isinstance(code, str):
            code, path = None, None
            if cat_votes.get(cid):
                code, path = cat_votes[cid].most_common(1)[0][0], "vote_old_products"
            elif brand_votes.get(cid):
                code, path = brand_votes[cid].most_common(1)[0][0], "vote_brand"
        if code:
            cat_root[cid], cat_code_resolved[cid] = root_from_code(code, cid), code
        else:
            cat_root[cid], path = all_roots[h(f"root:{cid}") % len(all_roots)], "unresolved_hash"
        how[path] += int(n)
    missing = sorted({r for r in cat_root.values() if r not in leaves})
    if missing:
        raise SystemExit(f"Catalog thiếu ngành gốc: {missing}")
    cat_leaf = {cid: leaves[r][h(f"leaf:{cid}") % len(leaves[r])] for cid, r in cat_root.items()}

    # --- 3. sản phẩm (giá gần nhất với giá thật × fx trong danh mục lá) + biến thể ---
    prod = ev.groupby(["category_id", "product_id"], as_index=False)["price"].median()
    leaf_prices = {lf: np.array([float(p["price"]) for p in ps]) for lf, ps in by_leaf.items()}
    tiki, rel_gap = {}, []
    for cid, pid, usd in zip(prod["category_id"], prod["product_id"], prod["price"]):
        lf = cat_leaf[cid]
        ps, pr = by_leaf[lf], leaf_prices[lf]
        target = usd * args.fx
        i = int(np.clip(np.searchsorted(pr, target), 0, len(pr) - 1))
        if i > 0 and abs(pr[i - 1] - target) <= abs(pr[i] - target):
            i -= 1
        if target > 0:
            rel_gap.append(abs(np.log((pr[i] + 1) / (target + 1))))
        p = ps[i]
        vs = variants.get(p["id"], [])
        v = vs[h(f"var:{pid}") % len(vs)] if vs else None
        tiki[pid] = {"id": p["id"], "cat": cat_leaf[cid], "name": p["name"][:200],
                     "variant_id": v["id"] if v else None, "variant_attr": v["variant_attr"] if v else None,
                     "image": (v and v.get("image_url")) or p.get("image_url")}
    ev["item_id"] = ev["product_id"].map(lambda x: tiki[x]["id"])

    # --- 4. thời gian ---
    now = pd.Timestamp(args.now, tz="UTC") + pd.Timedelta(hours=23, minutes=59)
    weeks = int((now - ev["ts"].max()) / pd.Timedelta(days=7))
    ev["ts"] = ev["ts"] + pd.Timedelta(days=7 * weeks)
    uid = {u: str(uuid.uuid5(NS, f"rees46:{u}")) for u in ev["user_id"].unique()}
    ev["uid"] = ev["user_id"].map(uid)
    fmt = lambda s: s.dt.strftime("%Y-%m-%d %H:%M:%S")

    # --- 5. user_events ---
    beh = ev[ev["event_type"].isin(["view", "cart"])]
    is_view = beh["event_type"] == "view"
    ue = pd.DataFrame({
        "user_id": beh["uid"], "session_id": beh["user_session"], "item_id": beh["item_id"],
        "category_id": np.where(is_view, beh["product_id"].map(lambda x: tiki[x]["cat"]), None),
        "action_type": np.where(is_view, "VIEW_PRODUCT", "ADD_TO_CART"),
        "created_at": fmt(beh["ts"]), "weight": "",
    })
    ue.to_csv(f"{out}/user_events.csv", index=False)

    # --- 6. đơn hàng ---
    pur = ev[(ev["event_type"] == "purchase") & (~ev["ts"].dt.strftime("%Y-%m-%d").isin(BROKEN_PURCHASE_DAYS))]
    orders, items = [], []
    for oid, ((u, sess), g) in enumerate(pur.groupby(["uid", "user_session"], sort=False), start=1):
        total = 0.0
        for pid, gp in g.groupby("product_id"):
            t = tiki[pid]
            price = round(float(gp["price"].median()) * args.fx, -2)
            qty = len(gp)
            sub = price * qty
            total += sub
            items.append({"order_ref": oid, "product_id": t["id"], "variant_id": t["variant_id"] or "",
                          "variant_attr": t["variant_attr"] or "", "product_image": t["image"] or "",
                          "product_name": t["name"], "unit_price": price, "quantity": qty, "subtotal": sub})
        orders.append({"order_ref": oid, "user_id": u, "status": "DELIVERED", "total_amount": total, "discount_amount": 0,
                       "final_amount": total, "coupon_code": "", "created_at": g["ts"].max().strftime("%Y-%m-%d %H:%M:%S"),
                       "session_id": sess})
    od = pd.DataFrame(orders)
    od.to_csv(f"{out}/orders.csv", index=False)
    pd.DataFrame(items).to_csv(f"{out}/order_items.csv", index=False)

    first_seen = ev.groupby("uid")["ts"].min()
    pd.DataFrame({"keycloak_user_id": list(uid.values()), "rees46_user_id": list(uid.keys()),
                  "created_at": [first_seen[x].strftime("%Y-%m-%d %H:%M:%S") for x in uid.values()]}
                 ).to_csv(f"{out}/users.csv", index=False)

    per_user = od.groupby("user_id").size() if len(od) else pd.Series(dtype=int)
    n_ev = sum(how.values())
    manifest = {
        "kind": "transformed-real-behavior",
        "source": "REES46 eCommerce behavior data, multi-category store (data.rees46.com/datasets/marketplace) — "
                  + ", ".join(f.split(".")[0] for f in args.files),
        "note": "Hành vi THẬT, chỉ ánh xạ sang schema/catalog hệ thống. Đối chiếu: docs/canvas/rees46-transform-mapping.md",
        "params": {"frac": args.frac, "fx_usd_vnd": args.fx, "now": args.now, "week_shift": weeks},
        "excluded": "10–11/2019: ghi log giỏ lỗi (61,5% phiên có mua không có lượt thêm giỏ; 12/2019: 1,0%); "
                   "01-02/01/2020 và 20-21/04/2020: lượt mua gần như mất (view/cart vẫn bình thường) -> loại khỏi orders",
        "assumptions": [
            "mã ngành của nguồn 12–4 bị sai → suy lại từ tham chiếu 10–11 (id cũ / đa số SP cũ / đa số brand); không suy được → hash",
            "apparel/accessories tách nam/nữ theo hash(category_id); auto → Thiết bị số",
            "SP REES46 → SP Tiki cùng danh mục lá, giá gần nhất với giá thật × fx; biến thể chọn theo hash",
            "đơn giá = giá thật USD × fx; mọi đơn DELIVERED; không voucher/review/huỷ đơn",
            "3–4/2020 trùng COVID — hành vi có thể dịch chuyển",
        ],
        "missing_in_source": ["remove_from_cart", "14 vi hành vi FE", "review", "voucher", "huỷ/hoàn đơn", "phễu checkout"],
        "stats": {
            "source_rows_read": int(n_rows), "duplicates_removed_in_sample": int(n_dup),
            "users": int(len(uid)), "events": int(len(ue)), "views": int(is_view.sum()), "carts": int((~is_view).sum()),
            "sessions": int(ev["user_session"].nunique()), "orders": int(len(orders)), "order_items": int(len(items)),
            "cart_per_order": round(float((~is_view).sum() / max(len(orders), 1)), 3),
            "buyers": int(per_user.size), "buyers_2plus_orders": int((per_user >= 2).sum()),
            "time_range": [ue["created_at"].min(), ue["created_at"].max()],
            "category_resolution_share_of_events": {k: round(v / n_ev, 4) for k, v in how.items()},
            "price_match_median_abs_log_ratio": round(float(np.median(rel_gap)), 3) if rel_gap else None,
            "events_by_code_top": {c: int(n) for c, n in ev["category_id"].map(cat_code_resolved).value_counts().head(12).items()},
            "items_with_variant_share": round(float(np.mean([bool(i["variant_id"]) for i in items])) if items else 0.0, 4),
            "events_by_root": {r: int(n) for r, n in ev["category_id"].map(cat_root).value_counts().items()},
        },
        "seconds": round(time.time() - t0, 1),
    }
    with open(f"{out}/manifest.json", "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    print(json.dumps(manifest["stats"], ensure_ascii=False, indent=1))
    print(f"xong → {out} ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
