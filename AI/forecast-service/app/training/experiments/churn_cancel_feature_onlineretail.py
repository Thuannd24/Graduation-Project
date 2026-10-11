"""Feature HUỶ ĐƠN có giúp dự đoán churn không? — kiểm chứng trên dữ liệu THẬT có huỷ đơn của CÙNG khách (Online Retail II).

Vì sao thí nghiệm riêng (kiến trúc "mỗi lớp một nguồn", chốt 2026-10-02): nguồn hành vi trong DB (REES46) không ghi huỷ đơn,
nên `cancel_rate` là hằng số ở đó. Không ghép huỷ đơn của người khác vào; thay vào đó trả lời câu hỏi nghiên cứu trên nguồn
có sẵn biến này cho cùng khách: Online Retail II (UCI, CC BY 4.0) — hoá đơn mã 'C…' = huỷ/trả, 12/2009–12/2011.

Nhãn (giống production `churn_label_v2_orders_120d_min2`): khách có ≥ 2 ngày mua tới mốc cắt; churn = không có hoá đơn MUA
nào trong 120 ngày sau mốc. Mốc cắt mỗi 30 ngày, đủ 120 ngày tương lai. CV 5 fold GroupKFold theo khách.
So sánh: (A) RFM: recency, frequency, monetary, avg_order_value, tenure
          (B) A + huỷ đơn: cancel_rate (hoá đơn huỷ / mọi hoá đơn), cancel_value_share, cancels_last_90d,
              days_since_last_cancel (999 nếu chưa huỷ), has_cancel
TIÊU CHÍ (đặt trước): huỷ đơn "giúp" nếu ΔAUC trung bình > 2 × độ lệch chuẩn ΔAUC giữa các fold. Báo cả PR-AUC.
GIỚI HẠN: bán lẻ quà tặng UK, nhiều khách sỉ; 'C…' gộp cả huỷ lẫn trả hàng.
Kết quả: data/experiment-results/behavior_patterns/cancel_feature_onlineretail.json
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
XLSX = f"{ROOT}/data/external/online-retail-ii/online_retail_II.xlsx"
CACHE = f"{ROOT}/data/external/online-retail-ii/transactions.pkl"
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/cancel_feature_onlineretail.json"
H = 120


def load() -> pd.DataFrame:
    if os.path.exists(CACHE):
        return pd.read_pickle(CACHE)
    sheets = pd.read_excel(XLSX, sheet_name=None, usecols=["Invoice", "Quantity", "InvoiceDate", "Price", "Customer ID"])
    tx = pd.concat(sheets.values())
    tx = tx[tx["Customer ID"].notna()].copy()
    tx["customer"] = tx["Customer ID"].astype(int)
    tx["invoice"] = tx["Invoice"].astype(str)
    tx["is_cancel"] = tx["invoice"].str.startswith("C")
    tx["value"] = (tx["Quantity"] * tx["Price"]).abs()
    tx = tx[["customer", "invoice", "InvoiceDate", "is_cancel", "value", "Quantity"]].rename(columns={"InvoiceDate": "ts"})
    tx.to_pickle(CACHE)
    return tx


def build_panel(tx: pd.DataFrame) -> pd.DataFrame:
    inv = tx.groupby(["customer", "invoice"], as_index=False).agg(ts=("ts", "min"), is_cancel=("is_cancel", "first"),
                                                                  value=("value", "sum"))
    inv["day"] = inv["ts"].dt.normalize()
    buys = inv[~inv["is_cancel"] & (inv["value"] > 0)]
    canc = inv[inv["is_cancel"]]
    start, end = inv["ts"].min().normalize(), inv["ts"].max().normalize()
    cutoffs = pd.date_range(start + pd.Timedelta(days=180), end - pd.Timedelta(days=H), freq="30D")
    rows = []
    for c in cutoffs:
        b = buys[buys["day"] <= c]
        g = b.groupby("customer").agg(frequency=("day", "nunique"), last=("day", "max"), first=("day", "min"), monetary=("value", "sum"))
        g = g[g["frequency"] >= 2]
        if g.empty:
            continue
        cc = canc[canc["day"] <= c].groupby("customer").agg(n_cancel=("invoice", "nunique"), cancel_value=("value", "sum"),
                                                            last_cancel=("day", "max"))
        c90 = canc[(canc["day"] <= c) & (canc["day"] > c - pd.Timedelta(days=90))].groupby("customer")["invoice"].nunique()
        n_inv = inv[inv["day"] <= c].groupby("customer")["invoice"].nunique()
        f = g.join(cc, how="left")
        f["n_cancel"] = f["n_cancel"].fillna(0)
        f["cancel_value"] = f["cancel_value"].fillna(0)
        f["recency"] = (c - f["last"]).dt.days
        f["tenure"] = (c - f["first"]).dt.days
        f["avg_order_value"] = f["monetary"] / f["frequency"]
        f["cancel_rate"] = f["n_cancel"] / n_inv.reindex(f.index).clip(lower=1)
        f["cancel_value_share"] = f["cancel_value"] / (f["monetary"] + f["cancel_value"]).clip(lower=1e-9)
        f["cancels_last_90d"] = c90.reindex(f.index).fillna(0)
        f["days_since_last_cancel"] = np.where(f["last_cancel"].notna(), (c - f["last_cancel"]).dt.days, 999)
        f["has_cancel"] = (f["n_cancel"] > 0).astype(int)
        fut = set(buys[(buys["day"] > c) & (buys["day"] <= c + pd.Timedelta(days=H))]["customer"])
        f["churn"] = (~f.index.isin(fut)).astype(int)
        f["cutoff"] = c
        rows.append(f.reset_index())
    return pd.concat(rows, ignore_index=True)


def cv(model_fn, X: pd.DataFrame, y: np.ndarray, g: np.ndarray):
    auc, ap = [], []
    for tr, te in GroupKFold(5).split(X, y, g):
        m = model_fn().fit(X.iloc[tr], y[tr])
        p = m.predict_proba(X.iloc[te])[:, 1]
        auc.append(roc_auc_score(y[te], p))
        ap.append(average_precision_score(y[te], p))
    return np.array(auc), np.array(ap)


def main() -> None:
    tx = load()
    d = build_panel(tx)
    y, g = d["churn"].to_numpy(), d["customer"].to_numpy()
    A = ["recency", "frequency", "monetary", "avg_order_value", "tenure"]
    C = ["cancel_rate", "cancel_value_share", "cancels_last_90d", "days_since_last_cancel", "has_cancel"]
    logit = lambda cols: (lambda: make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=2000)))
    X = d[A + C].copy()
    for col in ("frequency", "monetary", "avg_order_value"):
        X[col] = np.log1p(X[col])
    res = {"n_rows": int(len(d)), "n_customers": int(d["customer"].nunique()), "n_cutoffs": int(d["cutoff"].nunique()),
           "churn_rate": round(float(y.mean()), 4), "share_rows_with_any_cancel": round(float(d["has_cancel"].mean()), 4),
           "churn_rate_with_cancel": round(float(y[d["has_cancel"] == 1].mean()), 4),
           "churn_rate_without_cancel": round(float(y[d["has_cancel"] == 0].mean()), 4)}
    for name, fn in (("logistic", logit(None)),
                     ("gradient_boosting", lambda: HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_depth=4, random_state=0))):
        aA, pA = cv(fn, X[A], y, g)
        aB, pB = cv(fn, X[A + C], y, g)
        diff = aB - aA
        res[name] = {"auc_rfm": [round(aA.mean(), 4), round(aA.std(), 4)], "auc_rfm_cancel": [round(aB.mean(), 4), round(aB.std(), 4)],
                     "delta_auc": [round(diff.mean(), 4), round(diff.std(), 4)],
                     "pr_auc_rfm": round(pA.mean(), 4), "pr_auc_rfm_cancel": round(pB.mean(), 4),
                     "helps_by_preset_criterion": bool(diff.mean() > 2 * diff.std())}
    res["single_feature_auc"] = {c: round(float(max(roc_auc_score(y, d[c]), 1 - roc_auc_score(y, d[c]))), 4) for c in C}
    print(json.dumps(res, ensure_ascii=False, indent=1))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
