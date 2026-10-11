"""CỬA SỔ CAN THIỆP sau khi thêm giỏ: đo trên REES46 Cosmetics (5 tháng, dữ liệu thật) xem khả năng quay lại mua suy giảm nhanh cỡ nào.

Lý do (người dùng, 2026-10-02): "đợi hết chu kỳ churn thì quá muộn — thêm giỏ rồi không mua, vài ngày sau không vào lại → đã mua chỗ khác".
Nhãn churn 120 ngày chỉ biết SAU KHI khách đã đi; muốn cảnh báo SỚM phải neo vào SỰ KIỆN (giỏ bị bỏ dở).

Đơn vị: "episode giỏ" = lần thêm giỏ ĐẦU TIÊN của 1 cặp (user, sản phẩm). Mua lại = có `purchase` cùng (user, sản phẩm) sau đó.
Đo:
  - phân phối thời gian từ giỏ → mua cùng sản phẩm (tích luỹ theo 1h, 6h, 24h, 3d, 7d, 30d);
  - "còn cứu được không": trong số episode CHƯA mua sau T0 (1h, 6h, 24h, 72h, 7d), bao nhiêu % vẫn mua trong 30 ngày (cùng SP; hoặc user mua BẤT KỲ sản phẩm nào);
Chỉ lấy episode xảy ra ≥ 30 ngày trước cuối dữ liệu (tránh bị cắt cụt). Giới hạn: 1 shop mỹ phẩm; "mua chỗ khác" không quan sát được —
chỉ đo "không mua lại ở chính shop này"; sản phẩm cùng id có thể được mua ở lần giỏ khác của cùng cặp (đã gộp bằng lần giỏ đầu tiên).
Kết quả: data/experiment-results/behavior_patterns/cart_recovery.json
"""
from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
SRC = f"{ROOT}/data/kaggle-cache/datasets/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6"
MONTHS = ["2019-Oct.csv", "2019-Nov.csv", "2019-Dec.csv", "2020-Jan.csv", "2020-Feb.csv"]
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/cart_recovery.json"
H = 3600
THRESH = {"1h": H, "6h": 6 * H, "24h": 24 * H, "3d": 72 * H, "7d": 168 * H, "30d": 720 * H}


def main() -> None:
    t0 = time.time()
    carts, purch = [], []
    for f in MONTHS:
        for ch in pd.read_csv(f"{SRC}/{f}", usecols=["event_time", "event_type", "product_id", "user_id"],
                              dtype={"event_type": "category", "product_id": "int64", "user_id": "int64"}, chunksize=2_000_000):
            ch = ch[ch["event_type"].isin(["cart", "purchase"])]
            # as_unit("s"): pandas mới mặc định độ phân giải µs → ép về giây trước khi đổi sang int64
            t = pd.to_datetime(ch["event_time"].str.slice(0, 19), format="%Y-%m-%d %H:%M:%S").dt.as_unit("s").astype("int64")
            part = pd.DataFrame({"user_id": ch["user_id"].to_numpy(), "product_id": ch["product_id"].to_numpy(), "t": t.to_numpy()})
            carts.append(part[ch["event_type"].to_numpy() == "cart"])
            purch.append(part[ch["event_type"].to_numpy() == "purchase"])
        print(f"{f} ({time.time() - t0:.0f}s)", flush=True)
    carts = pd.concat(carts)
    purch = pd.concat(purch)
    tmax = int(max(carts["t"].max(), purch["t"].max()))
    ep = carts.groupby(["user_id", "product_id"], as_index=False)["t"].min().sort_values("t")
    ep = ep[ep["t"] <= tmax - 30 * 24 * H].reset_index(drop=True)
    assert len(ep) > 0, f"không có episode nào sau khi cắt 30 ngày (tmax={tmax}) — kiểm tra đơn vị thời gian"
    p_sorted = purch.sort_values("t").rename(columns={"t": "tp"})
    same = pd.merge_asof(ep, p_sorted, left_on="t", right_on="tp", by=["user_id", "product_id"], direction="forward")
    dt_same = (same["tp"] - same["t"]).to_numpy(float)  # NaN nếu không mua cùng SP
    pu = p_sorted[["user_id", "tp"]].sort_values("tp")
    anyp = pd.merge_asof(ep, pu, left_on="t", right_on="tp", by="user_id", direction="forward")
    dt_any = (anyp["tp"] - anyp["t"]).to_numpy(float)  # user mua BẤT KỲ SP nào sau đó (kể cả đúng SP này)
    n = len(ep)
    res = {"n_episodes": int(n), "seconds": round(time.time() - t0, 1)}
    res["cumulative_same_product"] = {k: round(float(np.nansum(dt_same <= v) / n), 4) for k, v in THRESH.items()}
    res["never_within_30d_same_product"] = round(float(1 - np.nansum(dt_same <= THRESH["30d"]) / n), 4)
    res["cumulative_any_purchase"] = {k: round(float(np.nansum(dt_any <= v) / n), 4) for k, v in THRESH.items()}
    rec = {}
    for name in ("1h", "6h", "24h", "3d", "7d"):
        T0 = THRESH[name]
        for tag, dt in (("same_product", dt_same), ("any_purchase", dt_any)):
            pending = ~(dt <= T0)  # chưa mua tới T0 (NaN → chưa)
            n_pend = int(pending.sum())
            later = np.nansum(dt[pending] <= THRESH["30d"])
            rec.setdefault(name, {})[tag] = {"n_still_pending": n_pend, "share_of_all": round(n_pend / n, 4),
                                             "convert_later_within_30d": round(float(later / max(n_pend, 1)), 4)}
    res["recoverable_after_waiting"] = rec
    print(json.dumps(res, ensure_ascii=False, indent=1))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
