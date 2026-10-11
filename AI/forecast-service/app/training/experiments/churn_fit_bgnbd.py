"""Ước lượng BG/NBD (Fader, Hardie & Lee 2005) trên dữ liệu giao dịch THẬT — để neo lõi động lực mua/churn của bộ sinh
dataset (tools/data-seed) thay cho giả định đặt tay (λ log-normal, 35% churn, tụt còn 5%). Xem churn-risk-log.md
2026-10-01 mục C: bộ sinh cho tỉ lệ "60 ngày không mua lại" 0,24 trong khi REES46 thật 0,54.

BG/NBD là mô hình SINH: mỗi khách mua theo Poisson với tốc độ λ ~ Gamma(r, α); sau MỖI lần mua LẶP rời bỏ vĩnh viễn với
xác suất p ~ Beta(a, b) (không rời bỏ sau lần mua đầu — đặc điểm đã biết của BG/NBD, MBG/NBD mới cho phép). Đơn vị: 1 giao dịch = 1 NGÀY có mua (gộp nhiều đơn cùng ngày), thời gian = ngày.

Nguồn:
  - rees46 : REES46 Cosmetics (B2C, cùng nguồn với các chỉ số hành vi). Học 3 tháng (10–12/2019), giữ lại 60 ngày (01–02/2020).
  - orii   : Online Retail II (UCI, CC BY 4.0; bán lẻ quà tặng UK, có cả khách sỉ). Học 18 tháng (12/2009–05/2011), giữ lại tới
             09/12/2011. Bỏ hoá đơn huỷ (mã 'C...'), số lượng ≤ 0, thiếu Customer ID.
Khách đưa vào: lần mua ĐẦU nằm trong giai đoạn học (REES46 bị cắt trái: có thể đã mua trước 10/2019 — ghi rõ khi dùng).

TIÊU CHÍ (đặt TRƯỚC khi chạy):
  - mô hình ĐẠT kiểm định nếu tổng số giao dịch giữ lại dự báo lệch ≤ 15% so với thực tế, và với các nhóm tần suất học
    x = 0, 1, 2, 3 trung bình dự báo lệch ≤ 25%.
  - chọn nguồn cho bộ sinh: REES46 nếu ĐẠT (B2C, cùng nguồn hành vi); Online Retail II để đối chiếu hình dạng dị biệt.
Kết quả: data/experiment-results/behavior_patterns/bgnbd_fit.json
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln, hyp2f1

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/bgnbd_fit.json"
REES_CACHE = f"{ROOT}/data/experiment-results/behavior_patterns/cosmetics_user_day.pkl"
ORII_DIR = f"{ROOT}/data/external/online-retail-ii"


def rfm(days: pd.DataFrame, cal_end: float, hold_end: float) -> pd.DataFrame:
    """days: cột customer, day (ngày có mua, số thực tính theo ngày). Trả x, t_x, T (giai đoạn học) + số giao dịch giữ lại."""
    d = days.drop_duplicates()
    first = d.groupby("customer")["day"].min()
    cohort = first[first < cal_end].index
    d = d[d["customer"].isin(cohort)]
    cal = d[d["day"] < cal_end].groupby("customer")["day"].agg(["count", "min", "max"])
    hold = d[(d["day"] >= cal_end) & (d["day"] < hold_end)].groupby("customer").size()
    out = pd.DataFrame({
        "x": cal["count"] - 1,
        "t_x": cal["max"] - cal["min"],
        "T": cal_end - cal["min"],
    })
    out["holdout"] = hold.reindex(out.index, fill_value=0)
    return out


def neg_ll(logp: np.ndarray, x: np.ndarray, tx: np.ndarray, T: np.ndarray) -> float:
    r, alpha, a, b = np.exp(logp)
    ln_a1 = gammaln(r + x) - gammaln(r) + r * np.log(alpha)
    ln_a2 = gammaln(a + b) + gammaln(b + x) - gammaln(b) - gammaln(a + b + x)
    ln_a3 = -(r + x) * np.log(alpha + T)
    with np.errstate(divide="ignore", invalid="ignore"):
        ln_a4 = np.where(x > 0, np.log(a) - np.log(np.maximum(b + x - 1, 1e-12)) - (r + x) * np.log(alpha + tx), -np.inf)
    ll = ln_a1 + ln_a2 + np.logaddexp(ln_a3, ln_a4)
    return -float(ll.sum())


def fit(df: pd.DataFrame) -> dict:
    x, tx, T = df["x"].to_numpy(float), df["t_x"].to_numpy(float), df["T"].to_numpy(float)
    best = None
    for init in ([0.5, 30.0, 1.0, 3.0], [0.2, 10.0, 0.5, 1.0], [1.0, 100.0, 2.0, 8.0]):
        res = minimize(neg_ll, np.log(init), args=(x, tx, T), method="L-BFGS-B",
                       bounds=[(-8, 6), (-6, 9), (-8, 6), (-8, 7)])
        if best is None or res.fun < best.fun:
            best = res
    r, alpha, a, b = np.exp(best.x)
    return {"r": float(r), "alpha": float(alpha), "a": float(a), "b": float(b), "neg_ll": float(best.fun), "converged": bool(best.success)}


def cond_expected(p: dict, x, tx, T, t: float) -> np.ndarray:
    """E[số giao dịch trong (T, T+t] | x, t_x, T] — Fader et al. (2005) công thức (10); hợp lệ cả khi a < 1 (đã kiểm chéo
    bằng Monte Carlo trong mc_check)."""
    r, alpha, a, b = p["r"], p["alpha"], p["a"], p["b"]
    z = t / (alpha + T + t)
    num = (a + b + x - 1) / (a - 1) * (1 - ((alpha + T) / (alpha + T + t)) ** (r + x) * hyp2f1(r + x, b + x, a + b + x - 1, z))
    with np.errstate(divide="ignore", invalid="ignore"):
        den = 1 + np.where(x > 0, a / np.maximum(b + x - 1, 1e-12) * ((alpha + T) / (alpha + tx)) ** (r + x), 0.0)
    return num / den


def p_alive(p: dict, x, tx, T) -> np.ndarray:
    r, alpha, a, b = p["r"], p["alpha"], p["a"], p["b"]
    with np.errstate(divide="ignore", invalid="ignore"):
        odds = np.where(x > 0, a / np.maximum(b + x - 1, 1e-12) * ((alpha + T) / (alpha + tx)) ** (r + x), 0.0)
    return 1 / (1 + odds)


def evaluate(name: str, df: pd.DataFrame, hold_days: float) -> dict:
    t0 = time.time()
    p = fit(df)
    x, tx, T = df["x"].to_numpy(float), df["t_x"].to_numpy(float), df["T"].to_numpy(float)
    res = {"source": name, "n_customers": int(len(df)), "holdout_days": hold_days, "params": p}
    if True:
        pred = cond_expected(p, x, tx, T, hold_days)
        act = df["holdout"].to_numpy(float)
        res["holdout_total_pred"] = round(float(pred.sum()), 1)
        res["holdout_total_actual"] = int(act.sum())
        res["holdout_total_ratio"] = round(float(pred.sum() / act.sum()), 3)
        groups = {}
        for g in range(0, 8):
            m = (x == g) if g < 7 else (x >= 7)
            if m.sum() >= 30:
                groups[f"x={g}" if g < 7 else "x>=7"] = {"n": int(m.sum()), "pred": round(float(pred[m].mean()), 4),
                                                     "actual": round(float(act[m].mean()), 4),
                                                     "ratio": round(float(pred[m].mean() / max(act[m].mean(), 1e-9)), 3)}
        res["by_calibration_frequency"] = groups
        ok_total = abs(res["holdout_total_ratio"] - 1) <= 0.15
        ok_groups = all(abs(groups[k]["ratio"] - 1) <= 0.25 for k in ("x=0", "x=1", "x=2", "x=3") if k in groups)
        res["passes_validation"] = bool(ok_total and ok_groups)
    r, alpha, a, b = p["r"], p["alpha"], p["a"], p["b"]
    res["implied"] = {
        "mean_rate_per_30d": round(float(r / alpha * 30), 4),
        "cv_rate": round(float(1 / np.sqrt(r)), 3),
        "mean_dropout_p": round(float(a / (a + b)), 4),
        "share_x0_in_calibration": round(float((x == 0).mean()), 3),
        "mean_p_alive_end_calibration": round(float(p_alive(p, x, tx, T).mean()), 3),
    }
    res["seconds"] = round(time.time() - t0, 1)
    return res


def mc_check(p: dict, x: int, tx: float, T: float, t: float, n: int = 6_000_000, seed: int = 1) -> tuple[float, float, float]:
    """Kiểm chéo công thức (10) bằng mô phỏng vector hoá: rút (λ, p) từ tiên nghiệm, sinh x lần mua lặp, giữ mẫu có đúng x
    lần trong (0, T] với lần cuối ≈ t_x (± 0,5 ngày), đếm giao dịch trong (T, T + t]. Trả (công thức, MC, sai số chuẩn MC).
    Chỉ rời bỏ sau lần mua LẶP."""
    rng = np.random.default_rng(seed)
    lam = rng.gamma(p["r"], 1 / p["alpha"], n)
    q = rng.beta(p["a"], p["b"], n)
    cur = np.zeros(n)
    alive = np.ones(n, bool)
    keep = np.ones(n, bool)
    for _ in range(x):
        cur = cur + rng.exponential(1 / lam)
        keep &= alive & (cur <= T)
        alive &= rng.random(n) >= q
    if x > 0:
        keep &= np.abs(cur - tx) < 0.5
    nxt = cur + rng.exponential(1 / lam)
    keep &= ~alive | (nxt > T)
    lam, q, alive, cur = lam[keep], q[keep], alive[keep], nxt[keep]
    cnt = np.zeros(len(q))
    for _ in range(500):
        inwin = alive & (cur <= T + t)
        if not inwin.any():
            break
        cnt += inwin
        alive = inwin & (rng.random(len(q)) >= q)
        cur = np.where(alive, cur + rng.exponential(1 / lam), cur)
    form = float(cond_expected(p, np.array([float(x)]), np.array([tx]), np.array([T]), t)[0])
    return form, float(cnt.mean()), float(cnt.std() / np.sqrt(max(len(cnt), 1)))


def load_rees46() -> tuple[pd.DataFrame, float]:
    ud = pd.read_pickle(REES_CACHE)
    days = ud.loc[ud["purchase"] > 0, ["user_id", "day"]].rename(columns={"user_id": "customer"})
    days["day"] = days["day"].astype(float)
    return rfm(days, cal_end=92.0, hold_end=152.0), 60.0


def load_orii() -> tuple[pd.DataFrame, float]:
    files = [f for f in os.listdir(ORII_DIR) if f.lower().endswith(".xlsx")]
    if not files:
        raise FileNotFoundError(f"không thấy file .xlsx trong {ORII_DIR}")
    cache = f"{ORII_DIR}/purchase_days.pkl"
    if os.path.exists(cache):
        days = pd.read_pickle(cache)
    else:
        sheets = pd.read_excel(f"{ORII_DIR}/{files[0]}", sheet_name=None,
                               usecols=["Invoice", "Quantity", "InvoiceDate", "Customer ID"])
        tx = pd.concat(sheets.values())
        tx = tx[tx["Customer ID"].notna() & (tx["Quantity"] > 0) & ~tx["Invoice"].astype(str).str.startswith("C")]
        d0 = pd.Timestamp("2009-12-01")
        days = pd.DataFrame({"customer": tx["Customer ID"].astype(int),
                             "day": (tx["InvoiceDate"].dt.normalize() - d0).dt.days.astype(float)}).drop_duplicates()
        days.to_pickle(cache)
    cal_end = float((pd.Timestamp("2011-06-01") - pd.Timestamp("2009-12-01")).days)
    hold_end = float((pd.Timestamp("2011-12-10") - pd.Timestamp("2009-12-01")).days)
    return rfm(days, cal_end, hold_end), hold_end - cal_end


def main() -> None:
    which = sys.argv[1:] or ["rees46", "orii"]
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    for name in which:
        df, hold = load_rees46() if name == "rees46" else load_orii()
        res = evaluate(name, df, hold)
        out[name] = res
        print(json.dumps(res, ensure_ascii=False, indent=1), flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
