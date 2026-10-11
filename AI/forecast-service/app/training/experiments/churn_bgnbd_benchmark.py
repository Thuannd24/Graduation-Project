"""So nghiệm ĐÚNG của BG/NBD (`p_alive`, tính thẳng từ tham số đã fit trên Online Retail II —
churn_fit_bgnbd.py) với NHÃN THẬT của production (`churn_label_v2_orders_120d_min2`, labels.py) trên cùng
panel cutoff mà train.py dùng. Đây là benchmark mạnh hơn "rule vs AI" cũ: so AI với nghiệm toán học của
chính quá trình đã dùng để sinh dữ liệu, không phải một rule tự nghĩ ra. Xem churn-risk-log.md 2026-10-01.

QUAN TRỌNG — không được nhầm với 1 lỗi suýt mắc: KHÔNG được dùng chính (T − t_x) làm nhãn rồi so với
p_alive (cũng là hàm của T, t_x) — đó là vòng tròn vì cả 2 đều chỉ là recency đo lại. Nhãn ở đây PHẢI là
quan sát TƯƠNG LAI thật (có/không đơn trong 120 ngày SAU cutoff), độc lập với (x, t_x, T) tính TRƯỚC cutoff.

GIỚI HẠN (ghi rõ khi dùng):
  - p_alive dùng (r, alpha) QUẦN THỂ, giả định λ ~ Gamma thuần; bộ sinh nhân thêm hệ số ưa thích ngành hàng
    (trung bình 1, có phương sai riêng) vào λ mỗi user → benchmark RẤT MẠNH và gần đúng, KHÔNG phải oracle
    tuyệt đối 100%.
  - Nhãn `orders` (labels.py) không lọc theo status đơn (kể cả đơn CANCELLED cũng tính là "còn hoạt động").
Kết quả: data/experiment-results/behavior_patterns/bgnbd_benchmark.json
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pymysql
from sklearn.metrics import roc_auc_score

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
FIT = json.load(open(f"{ROOT}/data/experiment-results/behavior_patterns/bgnbd_fit.json", encoding="utf-8"))["orii"]["params"]
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/bgnbd_benchmark.json"

# Đúng production (train.py): 5 mốc cắt, cửa sổ nhãn 120 ngày, dân số >= 2 đơn DELIVERED tính tới mốc cắt.
CUTOFF_DAYS_AGO = [270, 240, 210, 180, 150]
LABEL_WINDOW_DAYS = 120
MIN_DELIVERED = 2


def p_alive(p: dict, x: np.ndarray, tx: np.ndarray, T: np.ndarray) -> np.ndarray:
    r, alpha, a, b = p["r"], p["alpha"], p["a"], p["b"]
    with np.errstate(divide="ignore", invalid="ignore"):
        odds = np.where(x > 0, a / np.maximum(b + x - 1, 1e-12) * ((alpha + T) / (alpha + tx)) ** (r + x), 0.0)
    return 1 / (1 + odds)


def main() -> None:
    conn = pymysql.connect(host="localhost", port=int(os.environ.get("DB_PORT", 3308)),
                           user="root", password="root", cursorclass=pymysql.cursors.DictCursor)
    cur = conn.cursor()
    cur.execute("SELECT user_id, status, created_at FROM ecommerce_order_db.orders")
    all_orders = pd.DataFrame(cur.fetchall())
    conn.close()
    if all_orders.empty:
        raise SystemExit("Không có đơn nào trong DB — seed trước khi chạy script này.")
    all_orders["created_at"] = pd.to_datetime(all_orders["created_at"])
    delivered = all_orders[all_orders["status"] == "DELIVERED"]

    now = pd.Timestamp(datetime.now())
    rows = []
    for days_ago in CUTOFF_DAYS_AGO:
        cutoff = now - timedelta(days=days_ago)
        hist = delivered[delivered["created_at"] <= cutoff]
        g = hist.groupby("user_id")["created_at"].agg(["count", "min", "max"]).rename(columns={"count": "frequency"})
        g = g[g["frequency"] >= MIN_DELIVERED]
        if g.empty:
            continue
        g["x"] = g["frequency"] - 1
        g["t_x"] = (g["max"] - g["min"]).dt.total_seconds() / 86400
        g["T"] = (cutoff - g["min"]).dt.total_seconds() / 86400
        # Nhãn THẬT (labels.py, source="orders"): có đơn BẤT KỲ status trong (cutoff, cutoff+120] => còn hoạt động.
        window_end = cutoff + timedelta(days=LABEL_WINDOW_DAYS)
        active_future = set(all_orders.loc[
            (all_orders["created_at"] > cutoff) & (all_orders["created_at"] <= window_end), "user_id"
        ])
        g["churn_label"] = (~g.index.isin(active_future)).astype(int)
        g["cutoff"] = cutoff
        rows.append(g.reset_index())
    if not rows:
        raise SystemExit("Không panel nào đủ dân số >= 2 đơn DELIVERED ở bất kỳ mốc cắt nào.")
    panel = pd.concat(rows, ignore_index=True)
    panel["p_alive"] = p_alive(FIT, panel["x"].to_numpy(), panel["t_x"].to_numpy(), panel["T"].to_numpy())

    auc = roc_auc_score(panel["churn_label"], 1 - panel["p_alive"])
    by_cutoff = panel.groupby("cutoff").apply(
        lambda d: roc_auc_score(d["churn_label"], 1 - d["p_alive"]) if d["churn_label"].nunique() > 1 else None,
        include_groups=False,
    )
    res = {
        "n_rows": int(len(panel)), "n_users": int(panel["user_id"].nunique()),
        "churn_rate": round(float(panel["churn_label"].mean()), 4),
        "bgnbd_params": FIT,
        "auc_pooled": round(float(auc), 4),
        "auc_by_cutoff": {str(k.date()): (round(float(v), 4) if v is not None else None) for k, v in by_cutoff.items()},
        "p_alive_mean_churn0": round(float(panel.loc[panel["churn_label"] == 0, "p_alive"].mean()), 4),
        "p_alive_mean_churn1": round(float(panel.loc[panel["churn_label"] == 1, "p_alive"].mean()), 4),
    }
    print(json.dumps(res, ensure_ascii=False, indent=1))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)
    print(f"\nĐã ghi {OUT}")


if __name__ == "__main__":
    main()
