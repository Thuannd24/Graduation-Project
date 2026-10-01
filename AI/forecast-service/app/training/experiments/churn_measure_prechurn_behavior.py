"""Đo HÀNH VI TRƯỚC CHURN trên REES46 Cosmetics (5 tháng thật, 10/2019–02/2020) — kiểm chứng các cơ chế churn
mà bộ sinh dataset (tools/data-seed/lib/profiles.mjs) đang ĐẶT TAY, chưa từng đo:
  (1) "phân vân" 2 tháng trước churn: bỏ giỏ ×2,5, lượt xem ×1,3
  (2) sau churn lượt xem tụt còn 5% (CHURN_DECAY_FACTOR, dùng chung cho đơn/xem/bỏ giỏ)
Nguyên tắc (đã duyệt 2026-10-01): cơ chế nào không đo được trên dữ liệu thật thì không giữ.

A. Nghiên cứu sự kiện (event study) trên khách MUA LẶP (≥ 2 ngày mua tính tới mốc neo — khớp tập nhãn churn của
   platform "≥ 2 đơn"):
   - nhóm CHURN: neo ở NGÀY MUA CUỐI, sau đó ≥ 60 ngày quan sát không mua lại;
   - nhóm ĐỐI CHỨNG: neo ở 1 ngày mua mà lần mua kế tiếp đến trong ≤ 60 ngày (chọn ngẫu nhiên 1 mốc/user);
   - mốc neo ∈ [ngày 42, ngày 91] (cần 6 tuần lịch sử trước + 60 ngày sau trong 152 ngày dữ liệu).
   Đo mỗi user (tỉ lệ / ngày): SỚM = ngày −42..−15, MUỘN = ngày −14..−1, SAU = ngày +1..+56.
   Chỉ số: lượt xem, số phiên, lượt thêm giỏ, ngày bỏ giỏ (có cart, không purchase), lượt xoá khỏi giỏ.
   So sánh: tỉ số MUỘN/SỚM của nhóm churn chia cho của nhóm đối chứng (bootstrap 95% theo user).
B. Dự đoán: 2 mốc cắt (01/12, 31/12), tập = user ≥ 2 ngày mua trước mốc và có hoạt động trong 56 ngày trước mốc;
   nhãn = không mua trong 60 ngày sau mốc. LR với nền RFM so với nền + tín hiệu thay đổi gần đây; GroupKFold theo user.

TIÊU CHÍ QUYẾT ĐỊNH (đặt TRƯỚC khi xem số):
  - "phân vân" (1) chỉ giữ nếu tỉ số bỏ giỏ MUỘN/SỚM churn ÷ đối chứng > 1 với CI 95% không chứa 1; nếu CI chứa 1
    hoặc < 1 → bỏ cơ chế, hoặc thay bằng đúng chiều/độ lớn đo được.
  - suy giảm trước churn: nếu tỉ số lượt xem MUỘN/SỚM churn ÷ đối chứng < 1 (CI không chứa 1) → thêm suy giảm dần với
    đúng độ lớn đo được.
  - lượt xem còn lại sau churn: thay 5% bằng tỉ số SAU/TRƯỚC đo được của nhóm churn.
  - tín hiệu dự đoán có nghĩa nếu ΔAUC trung bình > 2 × độ lệch chuẩn ΔAUC giữa các fold.
GIỚI HẠN: 1 shop mỹ phẩm; 5 tháng nên "churn" = 60 ngày không mua (platform dùng 120 ngày); mỗi chunk đếm phiên
riêng nên phiên vắt qua ranh giới chunk bị đếm 2 lần (sai số nhỏ, như nhau giữa 2 nhóm).
Kết quả: data/experiment-results/behavior_patterns/prechurn_behavior.json
"""
from __future__ import annotations

import json
import os
import time
from datetime import date, timedelta

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
SRC = f"{ROOT}/data/kaggle-cache/datasets/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6"
MONTHS = ["2019-Oct.csv", "2019-Nov.csv", "2019-Dec.csv", "2020-Jan.csv", "2020-Feb.csv"]
OUT_DIR = f"{ROOT}/data/experiment-results/behavior_patterns"
CACHE = f"{OUT_DIR}/cosmetics_user_day.pkl"
OUT = f"{OUT_DIR}/prechurn_behavior.json"
CHUNK = int(os.environ.get("CHUNK", 1_000_000))

DAY0 = date(2019, 10, 1)
N_DAYS = (date(2020, 2, 29) - DAY0).days + 1  # 152
DAYMAP = {(DAY0 + timedelta(d)).isoformat(): d for d in range(N_DAYS)}
H = 60     # ngày không mua để coi là churn
PRE = 42   # ngày lịch sử trước mốc
POST = 56
COLS = ["view", "cart", "remove_from_cart", "purchase"]


def build_user_day() -> pd.DataFrame:
    if os.path.exists(CACHE):
        return pd.read_pickle(CACHE)
    parts = []
    for f in MONTHS:
        t0 = time.time()
        month_parts = []
        for ch in pd.read_csv(f"{SRC}/{f}", usecols=["event_time", "event_type", "user_id", "user_session"],
                              dtype={"event_type": "category", "user_id": "int64", "user_session": "string"},
                              chunksize=CHUNK):
            ch["day"] = ch["event_time"].str.slice(0, 10).map(DAYMAP).astype("int16")
            cnt = ch.groupby(["user_id", "day", "event_type"], observed=True).size().unstack(fill_value=0)
            ses = ch.drop_duplicates("user_session").groupby(["user_id", "day"]).size().rename("sessions")
            month_parts.append(cnt.join(ses, how="outer").fillna(0))
        m = pd.concat(month_parts).groupby(level=[0, 1]).sum()
        parts.append(m)
        print(f"{f}: {len(m):,} user-ngày ({time.time() - t0:.0f}s)", flush=True)
    ud = pd.concat(parts).groupby(level=[0, 1]).sum().reset_index()
    for c in COLS + ["sessions"]:
        if c not in ud:
            ud[c] = 0
        ud[c] = ud[c].astype("int32")
    ud["abandon_day"] = ((ud["cart"] > 0) & (ud["purchase"] == 0)).astype("int32")
    ud.to_pickle(CACHE)
    return ud


METRICS = {"view": "lượt xem", "sessions": "số phiên", "cart": "lượt thêm giỏ",
           "abandon_day": "ngày bỏ giỏ", "remove_from_cart": "lượt xoá khỏi giỏ"}


def anchors(ud: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    p = ud.loc[ud["purchase"] > 0, ["user_id", "day"]].sort_values(["user_id", "day"])
    p["k"] = p.groupby("user_id").cumcount() + 1
    p["next"] = p.groupby("user_id")["day"].shift(-1)
    p = p[(p["k"] >= 2) & (p["day"] >= PRE) & (p["day"] + H <= N_DAYS - 1)]
    churn = p[p["next"].isna()].assign(group="churn")
    ctrl = p[(p["next"] - p["day"]) <= H]
    ctrl = ctrl.loc[ctrl.groupby("user_id")["day"].transform(lambda s: rng.permutation(len(s)) == 0).astype(bool)]
    a = pd.concat([churn, ctrl.assign(group="control")])[["user_id", "day", "group"]].rename(columns={"day": "anchor"})
    # 1 user có thể có CẢ mốc churn (lần mua cuối) lẫn mốc đối chứng (lần mua sớm hơn) → khoá theo (user, mốc)
    return a.reset_index(drop=True).rename_axis("anchor_id").reset_index()


def window_rates(ud: pd.DataFrame, a: pd.DataFrame) -> pd.DataFrame:
    j = ud.merge(a, on="user_id")
    j["rel"] = j["day"] - j["anchor"]
    win = {"early": (-PRE, -15), "late": (-14, -1), "post": (1, POST)}
    out = a.set_index("anchor_id")[["group", "user_id"]].copy()
    for w, (lo, hi) in win.items():
        s = j[(j["rel"] >= lo) & (j["rel"] <= hi)].groupby("anchor_id")[list(METRICS)].sum() / (hi - lo + 1)
        out = out.join(s.add_prefix(f"{w}_"), how="left")
    return out.fillna({c: 0 for c in out.columns if c not in ("group", "user_id")})


def ratio_of_means(df: pd.DataFrame, num: str, den: str) -> float:
    d = df[den].mean()
    return float(df[num].mean() / d) if d > 0 else float("nan")


def event_study(r: pd.DataFrame, rng: np.random.Generator, n_boot: int = 500) -> dict:
    ch, ct = r[r["group"] == "churn"], r[r["group"] == "control"]
    res = {"n_churn": int(len(ch)), "n_control": int(len(ct)), "metrics": {}}
    for m, label in METRICS.items():
        rc = ratio_of_means(ch, f"late_{m}", f"early_{m}")
        rt = ratio_of_means(ct, f"late_{m}", f"early_{m}")
        boots = []
        chv = ch[[f"late_{m}", f"early_{m}"]].to_numpy()
        ctv = ct[[f"late_{m}", f"early_{m}"]].to_numpy()
        for _ in range(n_boot):
            bc = chv[rng.integers(0, len(chv), len(chv))].mean(0)
            bt = ctv[rng.integers(0, len(ctv), len(ctv))].mean(0)
            if bc[1] > 0 and bt[1] > 0 and bt[0] > 0:
                boots.append((bc[0] / bc[1]) / (bt[0] / bt[1]))
        lo, hi = np.percentile(boots, [2.5, 97.5])
        res["metrics"][m] = {
            "label": label,
            "churn_rate_early": round(float(ch[f"early_{m}"].mean()), 4),
            "churn_rate_late": round(float(ch[f"late_{m}"].mean()), 4),
            "control_rate_early": round(float(ct[f"early_{m}"].mean()), 4),
            "control_rate_late": round(float(ct[f"late_{m}"].mean()), 4),
            "churn_late_over_early": round(rc, 3),
            "control_late_over_early": round(rt, 3),
            "churn_vs_control": round(rc / rt, 3),
            "ci95": [round(float(lo), 3), round(float(hi), 3)],
            "churn_post_over_pre": round(float(ch[f"post_{m}"].mean() / ((ch[f"early_{m}"] * 28 + ch[f"late_{m}"] * 14).mean() / 42)), 3),
        }
    res["churn_zero_activity_post"] = round(float((ch[[f"post_{m}" for m in METRICS]].sum(axis=1) == 0).mean()), 3)
    res["n_users_both_groups"] = int(len(set(ch["user_id"]) & set(ct["user_id"])))
    # Đặc hiệu (thêm SAU khi xem lượt đầu, ghi rõ): bỏ giỏ tăng RIÊNG hay chỉ theo hoạt động chung? → chia theo lượt thêm giỏ
    apc = lambda df, w: df[f"{w}_abandon_day"].mean() / df[f"{w}_cart"].mean()
    res["abandon_per_cart_specificity"] = round(float((apc(ch, "late") / apc(ch, "early")) / (apc(ct, "late") / apc(ct, "early"))), 3)
    boots = []
    chv = ch[["late_abandon_day", "late_cart", "early_abandon_day", "early_cart"]].to_numpy()
    ctv = ct[["late_abandon_day", "late_cart", "early_abandon_day", "early_cart"]].to_numpy()
    for _ in range(n_boot):
        x = chv[rng.integers(0, len(chv), len(chv))].mean(0)
        y = ctv[rng.integers(0, len(ctv), len(ctv))].mean(0)
        boots.append(((x[0] / x[1]) / (x[2] / x[3])) / ((y[0] / y[1]) / (y[2] / y[3])))
    res["abandon_per_cart_specificity_ci95"] = [round(float(v), 3) for v in np.percentile(boots, [2.5, 97.5])]
    return res


def predictive(ud: pd.DataFrame) -> dict:
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import GroupKFold
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    rows = []
    for T in (61, 91):  # 01/12, 31/12
        hist = ud[ud["day"] < T]
        pdays = hist[hist["purchase"] > 0].groupby("user_id")["day"].agg(["count", "max"])
        pdays = pdays[pdays["count"] >= 2]
        rec = hist[hist["day"] >= T - 56]
        early = rec[rec["day"] < T - 28].groupby("user_id")[list(METRICS)].sum()
        late = rec[rec["day"] >= T - 28].groupby("user_id")[list(METRICS)].sum()
        last_ev = hist.groupby("user_id")["day"].max()
        fut = ud[(ud["day"] >= T) & (ud["day"] < T + H) & (ud["purchase"] > 0)]["user_id"].unique()
        f = pdays.join(early.add_prefix("e_"), how="inner").join(late.add_prefix("l_"), how="left").fillna(0)
        f = f[(f[[f"e_{m}" for m in METRICS]].sum(axis=1) + f[[f"l_{m}" for m in METRICS]].sum(axis=1)) > 0]
        f["recency"] = T - f["max"]
        f["days_since_event"] = T - last_ev.reindex(f.index)
        f["churn"] = (~f.index.isin(fut)).astype(int)
        f["T"] = T
        rows.append(f.reset_index())
    d = pd.concat(rows)
    base = ["recency", "count", "days_since_event", "views56"]
    d["views56"] = np.log1p(d["e_view"] + d["l_view"])
    d["count"] = np.log1p(d["count"])
    shift = []
    for m in METRICS:
        d[f"shift_{m}"] = np.log1p(d[f"l_{m}"]) - np.log1p(d[f"e_{m}"])
        shift.append(f"shift_{m}")
    d["late_abandon"] = np.log1p(d["l_abandon_day"])
    d["late_remove"] = np.log1p(d["l_remove_from_cart"])
    shift += ["late_abandon", "late_remove"]
    y, g = d["churn"].to_numpy(), d["user_id"].to_numpy()
    aucs = {"base": [], "base+shift": []}
    for tr, te in GroupKFold(5).split(d, y, g):
        for name, cols in (("base", base), ("base+shift", base + shift)):
            mdl = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
            mdl.fit(d.iloc[tr][cols], y[tr])
            aucs[name].append(roc_auc_score(y[te], mdl.predict_proba(d.iloc[te][cols])[:, 1]))
    diff = np.array(aucs["base+shift"]) - np.array(aucs["base"])
    single = {c: round(float(roc_auc_score(y, d[c])), 3) for c in shift + base}
    return {
        "n_rows": int(len(d)), "n_users": int(d["user_id"].nunique()), "churn_rate": round(float(y.mean()), 3),
        "auc_base": [round(float(np.mean(aucs["base"])), 4), round(float(np.std(aucs["base"])), 4)],
        "auc_base_shift": [round(float(np.mean(aucs["base+shift"])), 4), round(float(np.std(aucs["base+shift"])), 4)],
        "delta_auc": [round(float(diff.mean()), 4), round(float(diff.std()), 4)],
        "single_feature_auc": single,
    }


def purchase_coupling(ud: pd.DataFrame) -> dict:
    """Duyệt dồn quanh lần mua (thêm 2026-10-01 sau khi fidelity cho thấy bộ sinh rải lượt xem đều, tách rời việc mua).
    Khách mua lặp (≥ 2 ngày mua trong 152 ngày). Mỗi ngày có lượt xem: lead = số ngày tới lần mua KẾ TIẾP, lag = số
    ngày từ lần mua TRƯỚC. Tỉ trọng theo lượt xem. "Nền" = cách mọi lần mua > 14 ngày.
    lead_pmf: phân phối số ngày ĐI TRƯỚC của lượt xem "hành trình" = lượt xem/ngày ở lead d TRỪ mức nền, trên các lần
    mua có ≥ 28 ngày lịch sử và không có lần mua khác trong 28 ngày trước (để đường ramp không chồng nhau)."""
    p = ud.loc[ud["purchase"] > 0, ["user_id", "day"]]
    nb = p.groupby("user_id").size()
    rep = nb[nb >= 2].index
    u = ud[ud["user_id"].isin(rep)]
    pp = p[p["user_id"].isin(rep)].sort_values("day").rename(columns={"day": "pday"})
    v = u.loc[u["view"] > 0, ["user_id", "day", "view"]].sort_values("day")
    lead = pd.merge_asof(v, pp, left_on="day", right_on="pday", by="user_id", direction="forward")["pday"] - v["day"].to_numpy()
    lag = v["day"].to_numpy() - pd.merge_asof(v, pp, left_on="day", right_on="pday", by="user_id", direction="backward")["pday"]
    lead, lag, w = lead.to_numpy(), lag.to_numpy(), v["view"].to_numpy()
    sh = lambda mask: round(float(w[mask].sum() / w.sum()), 4)
    far = (np.isnan(lead) | (lead > 14)) & (np.isnan(lag) | (lag > 14))
    bg = pd.Series(w * far, index=v["user_id"].to_numpy()).groupby(level=0).sum().reindex(rep, fill_value=0)
    p2 = pp.rename(columns={"pday": "day"}).sort_values(["user_id", "day"])
    p2["prev"] = p2.groupby("user_id")["day"].shift(1)
    anc = p2[(p2["day"] >= 28) & (p2["prev"].isna() | (p2["day"] - p2["prev"] > 28))][["user_id", "day"]].rename(columns={"day": "a"})
    j = u.merge(anc, on="user_id")
    j["rel"] = j["day"] - j["a"]
    ramp = (j[(j["rel"] >= -28) & (j["rel"] <= 0)].groupby("rel")["view"].sum() / len(anc)).reindex(range(-28, 1), fill_value=0)
    base = float(ramp.loc[-28:-22].mean())  # mức nền: tuần xa nhất
    excess = np.clip(ramp.loc[-28:-1].to_numpy()[::-1] - base, 0, None)  # index 0 = lead 1 ngày
    excess0 = np.clip(ramp.loc[-28:0].to_numpy()[::-1] - base, 0, None)  # index 0 = NGÀY MUA (lead 0)
    # Thêm giỏ cũng dồn quanh lần mua (đo cùng định nghĩa, theo lượt thêm giỏ)
    c = u.loc[u["cart"] > 0, ["user_id", "day", "cart"]].sort_values("day")
    clead = (pd.merge_asof(c, pp, left_on="day", right_on="pday", by="user_id", direction="forward")["pday"] - c["day"].to_numpy()).to_numpy()
    clag = (c["day"].to_numpy() - pd.merge_asof(c, pp, left_on="day", right_on="pday", by="user_id", direction="backward")["pday"]).to_numpy()
    cw = c["cart"].to_numpy()
    csh = lambda mask: round(float(cw[mask].sum() / cw.sum()), 4)
    cfar = (np.isnan(clead) | (clead > 14)) & (np.isnan(clag) | (clag > 14))
    return {
        "n_repeat_buyers": int(len(rep)),
        "view_share_purchase_day": sh(lead == 0),
        "view_share_1_14d_before": sh((lead >= 1) & (lead <= 14)),
        "view_share_background": sh(far),
        "repeat_buyers_zero_background": round(float((bg == 0).mean()), 4),
        "ramp_views_per_day": {int(k): round(float(x), 4) for k, x in ramp.items()},
        "ramp_base_per_day": round(base, 4),
        "lead_pmf_1_28": [round(float(x), 4) for x in excess / excess.sum()],
        "lead_pmf_0_28": [round(float(x), 4) for x in excess0 / excess0.sum()],
        "cart_share_purchase_day": csh(clead == 0),
        "cart_share_1_14d_before": csh((clead >= 1) & (clead <= 14)),
        "cart_share_background": csh(cfar),
        # Duyệt SAU lần mua (đo riêng, 2026-10-01): chỉ ~1,07 lượt xem vượt nền / lần mua (so với 8,16 trước mua) →
        # không mô phỏng riêng.
    }


def main() -> None:
    t0 = time.time()
    rng = np.random.default_rng(42)
    ud = build_user_day()
    print(f"user-ngày: {len(ud):,}, user: {ud['user_id'].nunique():,} ({time.time() - t0:.0f}s)", flush=True)
    a = anchors(ud, rng)
    es = event_study(window_rates(ud, a), rng)
    print(json.dumps(es, ensure_ascii=False, indent=1), flush=True)
    pc = purchase_coupling(ud)
    print(json.dumps(pc, ensure_ascii=False), flush=True)
    pr = predictive(ud)
    print(json.dumps(pr, ensure_ascii=False, indent=1), flush=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"source": "REES46 Cosmetics 2019-10..2020-02", "horizon_days": H, "event_study": es, "purchase_coupling": pc,
                   "predictive": pr}, fh, ensure_ascii=False, indent=1)
    print(f"xong ({time.time() - t0:.0f}s) → {OUT}")


if __name__ == "__main__":
    main()
