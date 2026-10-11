"""Kiểm tra toàn vẹn 1 tập dữ liệu do `node seed.mjs --out <dir>` xuất ra.

Chạy TRƯỚC khi train (cả ở máy local lẫn máy GPU thuê, sau khi upload) — bắt lỗi file hỏng/thiếu
khi copy, và các lỗi logic của bộ sinh mà báo cáo fidelity không nhìn thấy (sự kiện ở tương lai,
đơn lặp sản phẩm, review trỏ tới đơn không tồn tại...).

    python validate_training_set.py ../../data/training-sets/v1

Đọc user_events.csv theo chunk → RAM cố định dù file hàng chục triệu dòng. Exit code 1 nếu có lỗi.
"""
import json
import sys
from pathlib import Path

import pandas as pd

ALL_ACTIONS = {
    "VIEW_PRODUCT", "ADD_TO_CART", "REMOVE_FROM_CART", "UPDATE_CART_QTY", "CLEAR_CART", "VIEW_CART",
    "BEGIN_CHECKOUT", "VIEW_SHIPPING_FEE", "COUPON_APPLIED", "COUPON_FAILED", "SEARCH",
    "FILTER_APPLIED", "SORT_APPLIED", "IMPRESSION", "PRODUCT_ZOOM", "SCROLL_DEPTH", "PAGE_DWELL",
    "TAB_HIDDEN", "TAB_VISIBLE",
}
ITEM_ACTIONS = {"VIEW_PRODUCT", "ADD_TO_CART", "IMPRESSION", "PRODUCT_ZOOM"}


def main(out_dir: Path) -> int:
    errors: list[str] = []
    check = lambda ok, msg: ok or errors.append(msg)

    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    now = pd.Timestamp(manifest["params"]["now"])
    expected_rows = manifest["files"]

    orders = pd.read_csv(out_dir / "orders.csv", parse_dates=["created_at"])
    items = pd.read_csv(out_dir / "order_items.csv")
    reviews = pd.read_csv(out_dir / "reviews.csv", parse_dates=["created_at"])
    profiles = pd.read_csv(out_dir / "user_profiles_ground_truth.csv")
    users = set(profiles.user_id)

    for name, df in [("orders.csv", orders), ("order_items.csv", items), ("reviews.csv", reviews),
                     ("user_profiles_ground_truth.csv", profiles)]:
        check(len(df) == expected_rows[name], f"{name}: {len(df)} dòng, manifest ghi {expected_rows[name]} (file cụt khi copy?)")

    check(profiles.user_id.is_unique, "user_profiles: user_id trùng")
    check(len(profiles) == manifest["params"]["users"], "số user khác params.users")
    check(orders.order_id.is_unique, "orders: order_id trùng")
    check(orders.user_id.isin(users).all(), "orders: user_id không có trong user_profiles")
    check((orders.created_at <= now).all(), "orders: có đơn sau mốc now")
    check(orders.status.isin(["DELIVERED", "CANCELLED"]).all(), "orders: status lạ")
    check(items.order_id.isin(orders.order_id).all(), "order_items: order_id không tồn tại")
    check(orders.order_id.isin(items.order_id).all(), "orders: có đơn rỗng (không item)")
    check(not items.duplicated(["order_id", "product_id"]).any(), "order_items: sản phẩm lặp trong 1 đơn")
    check((items.unit_price * items.quantity == items.subtotal).all(), "order_items: subtotal ≠ giá × số lượng")
    totals = items.groupby("order_id").subtotal.sum().reindex(orders.order_id).to_numpy()
    check((totals == orders.total_amount.to_numpy()).all(), "orders: total_amount ≠ tổng các dòng")
    check((orders.final_amount == orders.total_amount - orders.discount_amount).all(), "orders: final ≠ total − discount")

    pairs = set(zip(items.order_id, items.product_id))
    check(all(p in pairs for p in zip(reviews.order_id, reviews.product_id)), "reviews: (order, product) không có trong order_items")
    status = orders.set_index("order_id")
    check(status.loc[reviews.order_id, "status"].eq("DELIVERED").all(), "reviews: review cho đơn không DELIVERED")
    check((status.loc[reviews.order_id, "user_id"].to_numpy() == reviews.user_id.to_numpy()).all(), "reviews: user ≠ người đặt đơn")
    check((reviews.created_at <= now).all(), "reviews: có review sau mốc now")
    check(reviews.rating.between(1, 5).all(), "reviews: rating ngoài 1..5")

    # --- user_events theo chunk. Bộ sinh ghi mỗi phiên thành 1 khối dòng LIỀN NHAU → kiểm tra theo
    # "đoạn chạy": thời gian không lùi giữa 2 dòng kề nhau cùng phiên, và 1 phiên không xuất hiện
    # lại sau khi đã kết thúc (nếu có, file bị xáo/ghép sai). Chỉ giữ tập session_id đã đóng.
    n_events = 0
    closed_sessions: set[str] = set()
    n_sessions = 0
    carry_sid, carry_uid, carry_ts = None, None, None
    actions_seen: set[str] = set()
    non_monotonic = future = no_session = unknown_user = bad_item = reopened = two_owner = 0
    for chunk in pd.read_csv(out_dir / "user_events.csv", chunksize=1_000_000,
                             dtype={"user_id": str, "session_id": str, "action_type": str}):
        ts = pd.to_datetime(chunk.created_at, utc=True)
        n_events += len(chunk)
        actions_seen.update(chunk.action_type.unique())
        future += int((ts > now).sum())
        no_session += int(chunk.session_id.isna().sum())
        unknown_user += int((~chunk.user_id.isin(users)).sum())
        bad_item += int((chunk.action_type.isin(ITEM_ACTIONS) & chunk.item_id.isna()).sum())

        sid = pd.concat([pd.Series([carry_sid]), chunk.session_id], ignore_index=True)
        uid = pd.concat([pd.Series([carry_uid]), chunk.user_id], ignore_index=True)
        t = pd.concat([pd.Series([carry_ts], dtype=ts.dtype), ts], ignore_index=True)
        same = sid.eq(sid.shift()).iloc[1:]  # dòng i cùng phiên với dòng i−1
        non_monotonic += int((same & (t.diff().iloc[1:] < pd.Timedelta(0))).sum())
        two_owner += int((same & uid.ne(uid.shift()).iloc[1:]).sum())
        starts = chunk.session_id[~same.to_numpy()]  # phiên bắt đầu trong chunk này
        reopened += int(starts.isin(closed_sessions).sum()) + int(starts.duplicated().sum())
        n_sessions += len(starts)
        if carry_sid is not None and not same.iloc[0]:
            closed_sessions.add(carry_sid)
        closed_sessions.update(starts.iloc[:-1])  # mọi phiên trừ phiên cuối (có thể vắt sang chunk sau)
        carry_sid, carry_uid, carry_ts = chunk.session_id.iloc[-1], chunk.user_id.iloc[-1], ts.iloc[-1]
    check(reopened == 0, f"user_events: {reopened} phiên bị tách thành nhiều khối (file xáo/ghép sai?)")
    check(two_owner == 0, f"user_events: {two_owner} dòng — 1 phiên thuộc 2 user")

    check(n_events == expected_rows["user_events.csv"], f"user_events.csv: {n_events} dòng, manifest ghi {expected_rows['user_events.csv']}")
    check(future == 0, f"user_events: {future} sự kiện sau mốc now")
    check(no_session == 0, f"user_events: {no_session} sự kiện thiếu session_id")
    check(unknown_user == 0, f"user_events: {unknown_user} sự kiện của user lạ")
    check(bad_item == 0, f"user_events: {bad_item} sự kiện gắn sản phẩm nhưng item_id trống")
    check(non_monotonic == 0, f"user_events: {non_monotonic} lần thời gian lùi trong 1 phiên")
    check(actions_seen <= ALL_ACTIONS, f"user_events: action lạ {sorted(actions_seen - ALL_ACTIONS)}")
    check(ALL_ACTIONS <= actions_seen, f"user_events: thiếu action {sorted(ALL_ACTIONS - actions_seen)}")
    check(manifest["fidelity"]["allPass"], "manifest: báo cáo fidelity có mục KHÔNG ĐẠT")

    print(f"{out_dir}: {len(users):,} user | {n_events:,} sự kiện | {n_sessions:,} phiên | "
          f"{len(orders):,} đơn | {len(reviews):,} review")
    if errors:
        print(f"KHÔNG ĐẠT — {len(errors)} lỗi:")
        for e in errors[:50]:
            print("  -", e)
        return 1
    print("ĐẠT — toàn vẹn tham chiếu, thời gian, số dòng khớp manifest.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(Path(sys.argv[1])))
