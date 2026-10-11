"""Thí nghiệm "liên kết dữ liệu > thông tin đơn lẻ" (người dùng, 2026-10-02): "việc đợi đến khi
ngưỡng này thì đã muộn — dấu hiệu rời bỏ đã diễn ra ngay trước đó... bài toán này bản chất là sự
liên kết dữ liệu sẽ thể hiện nhiều hơn là các thông tin đơn lẻ". Ablation 2026-10-05 trên dữ liệu
REES46 thật đã xác nhận: 11 feature RFM/behavior hiện tại (đếm/tỉ lệ GỘP theo cửa sổ 7/30 ngày,
không có thứ tự) là đủ cho nhãn 60 ngày — nhưng đó không chứng minh được cấu trúc TRÌNH TỰ vô dụng,
vì nhãn 60 ngày quá xa để đo tín hiệu sớm. Thí nghiệm này đổi hẳn đơn vị quan sát và đích dự đoán để
kiểm giả thuyết đúng phạm vi của nó.

Đơn vị quan sát: "episode giỏ" = lần ADD_TO_CART/UPDATE_CART_QTY ĐẦU TIÊN của 1 cặp (user, item),
trên CHÍNH dữ liệu REES46 thật đã nạp vào DB (không dùng lại CSV nguồn rời — giữ đúng nguyên tắc
"mỗi lớp một nguồn thật": đây là số liệu production schema đã transform, không phải mô phỏng).

Điểm quyết định: cart_time + OBS_HOURS (24h) — mô phỏng "nếu hệ thống phải cảnh báo ngay trong ngày
đầu thay vì chờ nhãn 60 ngày, nó nhìn thấy gì". Đích: có mua lại ĐÚNG item đó trong (decision, cart+7
ngày] hay không — mốc 7 ngày lấy từ `churn_measure_cart_recovery.py` (91,3% lượt quay lại mua xảy ra
trong 7 ngày đầu, nên đây là cửa sổ "còn cứu được" thực tế, không phải số chọn tuỳ ý).

Set A — đơn lẻ/gộp (đúng kiểu feature production hiện tại, chỉ đổi cửa sổ): đếm sự kiện trong
[cart, cart+24h], không có thứ tự.
Set B (thêm vào A) — liên kết/trình tự: có quay lại xem CHÍNH item đó không (do dự), sự kiện cuối
cùng trong cửa sổ là gì (im lặng hẳn / xem SP khác / cart lại), có bao nhiêu lượt "cart→xem SP
khác→cart lại", độ phân tán khoảng cách giữa các sự kiện. Đối chứng âm: 1 feature ngẫu nhiên xác
định (hash), giữ đúng tinh thần "luôn có đối chứng âm" của `candidates.py`.

Đánh giá: GroupKFold theo user_id (không rò rỉ), cùng pipeline MinMaxScaler + LogisticRegression
(class_weight='balanced') như `train.py`/`ablation.py`. Sàn nhiễu = std AUC của Set A. Kết quả:
data/experiment-results/behavior_patterns/cart_sequence_early_warning.json
"""
from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "ecommerce_order_db")

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
sys.path.insert(0, f"{ROOT}/AI/forecast-service")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from shared_common.config import shared_settings  # noqa: E402
from shared_common.pool import get_engine  # noqa: E402
from sklearn.inspection import permutation_importance  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402
from sklearn.preprocessing import MinMaxScaler  # noqa: E402
from sqlalchemy import text  # noqa: E402

OUT = f"{ROOT}/data/experiment-results/behavior_patterns/cart_sequence_early_warning.json"
OBS_HOURS = 24
LABEL_DAYS = 7
N_SPLITS = 5
RANDOM_STATE = 42
CART_TYPES = ("ADD_TO_CART", "UPDATE_CART_QTY")

SET_A = ["n_cart_events_obs", "n_view_events_obs", "n_distinct_items_viewed_obs", "n_distinct_categories_viewed_obs"]
SET_B = [
    "viewed_same_item_again", "silence_full_window", "last_event_is_recart", "last_event_is_other_view",
    "time_to_first_event_hours", "n_alternations", "gap_dispersion_hours",
]
NOISE_COL = "noise_control_hash"


def load_events_orders(engine) -> tuple[pd.DataFrame, pd.DataFrame]:
    with engine.connect() as conn:
        events = pd.read_sql(
            "SELECT user_id, action_type, created_at, category_id, item_id FROM user_events "
            "WHERE user_id IS NOT NULL AND item_id IS NOT NULL", conn, parse_dates=["created_at"],
        )
        purchases = pd.read_sql(
            "SELECT o.user_id, o.created_at, oi.product_id AS item_id FROM order_items oi "
            "JOIN orders o ON o.id = oi.order_id", conn, parse_dates=["created_at"],
        )
    events["user_id"] = events["user_id"].astype("string")
    purchases["user_id"] = purchases["user_id"].astype("string")
    events = events.sort_values(["user_id", "item_id", "created_at"]).reset_index(drop=True)
    return events, purchases


def build_episodes(events: pd.DataFrame, purchases: pd.DataFrame) -> pd.DataFrame:
    cart = events[events["action_type"].isin(CART_TYPES)]
    ep = cart.groupby(["user_id", "item_id"], as_index=False)["created_at"].min().rename(columns={"created_at": "cart_time"})
    data_end = events["created_at"].max()
    cutoff = data_end - pd.Timedelta(hours=OBS_HOURS) - pd.Timedelta(days=LABEL_DAYS)
    ep = ep[ep["cart_time"] <= cutoff].reset_index(drop=True)
    ep["decision_time"] = ep["cart_time"] + pd.Timedelta(hours=OBS_HOURS)
    ep["label_end"] = ep["cart_time"] + pd.Timedelta(days=LABEL_DAYS)

    # nhãn: mua ĐÚNG item này trong (decision_time, label_end]
    p_sorted = purchases.sort_values("created_at")
    merged = pd.merge_asof(
        ep.sort_values("decision_time"), p_sorted.rename(columns={"created_at": "purchase_time"}),
        left_on="decision_time", right_on="purchase_time", by=["user_id", "item_id"], direction="forward",
    )
    in_window = (merged["purchase_time"] > merged["decision_time"]) & (merged["purchase_time"] <= merged["label_end"])
    ep = merged.sort_index()
    ep["label"] = in_window.sort_index().astype(int)
    return ep.drop(columns=["purchase_time"]).reset_index(drop=True)


def build_features(ep: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    ev = events.sort_values("created_at")
    by_user: dict[str, pd.DataFrame] = {u: g for u, g in ev.groupby("user_id", observed=True)}
    rows = []
    for row in ep.itertuples(index=False):
        g = by_user.get(row.user_id)
        feat = {col: 0.0 for col in SET_A + SET_B}
        feat["user_id"] = row.user_id
        feat["item_id"] = row.item_id
        feat["label"] = row.label
        if g is None:
            rows.append(feat)
            continue
        win = g[(g["created_at"] >= row.cart_time) & (g["created_at"] <= row.decision_time)]
        after = win[win["created_at"] > row.cart_time]

        cart_mask = win["action_type"].isin(CART_TYPES) & (win["item_id"] == row.item_id)
        view_mask = win["action_type"] == "VIEW_PRODUCT"
        feat["n_cart_events_obs"] = float(cart_mask.sum())
        feat["n_view_events_obs"] = float(view_mask.sum())
        feat["n_distinct_items_viewed_obs"] = float(win.loc[view_mask, "item_id"].nunique())
        feat["n_distinct_categories_viewed_obs"] = float(win.loc[view_mask, "category_id"].nunique())

        same_view_after = after[(after["action_type"] == "VIEW_PRODUCT") & (after["item_id"] == row.item_id)]
        feat["viewed_same_item_again"] = float(len(same_view_after) > 0)
        feat["silence_full_window"] = float(len(after) == 0)

        if len(after) > 0:
            first_gap = (after["created_at"].iloc[0] - row.cart_time).total_seconds() / 3600.0
            feat["time_to_first_event_hours"] = first_gap
            last = after.iloc[-1]
            feat["last_event_is_recart"] = float(last["action_type"] in CART_TYPES and last["item_id"] == row.item_id)
            feat["last_event_is_other_view"] = float(last["action_type"] == "VIEW_PRODUCT" and last["item_id"] != row.item_id)
            # chuỗi vai trò: cart-lại (0) / xem-SP-khác (1) / xem-lại-chính-SP (2) để đếm phiên "do dự"
            role = np.where(
                (after["action_type"].isin(CART_TYPES)) & (after["item_id"] == row.item_id), 0,
                np.where((after["action_type"] == "VIEW_PRODUCT") & (after["item_id"] != row.item_id), 1, 2),
            )
            feat["n_alternations"] = float(np.sum(np.diff(role) != 0)) if len(role) > 1 else 0.0
            all_t = pd.concat([pd.Series([row.cart_time]), after["created_at"]]).to_numpy()
            if len(all_t) > 2:
                gaps_h = np.diff(all_t).astype("timedelta64[s]").astype(float) / 3600.0
                feat["gap_dispersion_hours"] = float(np.std(gaps_h, ddof=1)) if len(gaps_h) > 1 else 0.0
            else:
                feat["gap_dispersion_hours"] = 0.0
        else:
            feat["time_to_first_event_hours"] = float(OBS_HOURS)
            feat["last_event_is_recart"] = 0.0
            feat["last_event_is_other_view"] = 0.0
            feat["n_alternations"] = 0.0
            feat["gap_dispersion_hours"] = 0.0
        rows.append(feat)
    df = pd.DataFrame(rows)
    df[NOISE_COL] = ((pd.util.hash_pandas_object(df["user_id"].astype(str) + "_" + df["item_id"].astype(str), index=False) % 1000) / 1000.0)
    return df


def _fit_eval(df: pd.DataFrame, columns: list[str]) -> dict:
    gkf = GroupKFold(n_splits=N_SPLITS)
    aucs, folds_data = [], []
    for train_idx, test_idx in gkf.split(df, df["label"], groups=df["user_id"]):
        train_df, test_df = df.iloc[train_idx], df.iloc[test_idx]
        if train_df["label"].nunique() < 2 or test_df["label"].nunique() < 2:
            continue
        scaler = MinMaxScaler()
        X_train = scaler.fit_transform(train_df[columns])
        clf = LogisticRegression(class_weight="balanced", max_iter=1000)
        clf.fit(X_train, train_df["label"])
        X_test = scaler.transform(test_df[columns])
        pred = clf.predict_proba(X_test)[:, 1]
        auc = roc_auc_score(test_df["label"], pred)
        aucs.append(auc)
        folds_data.append({"scaler": scaler, "clf": clf, "test_df": test_df})
    return {"auc_mean": round(float(np.mean(aucs)), 4), "auc_std": round(float(np.std(aucs, ddof=1)), 4),
            "n_folds": len(aucs), "n_features": len(columns), "_folds": folds_data}


def _permutation_table(folds_data: list[dict], columns: list[str]) -> list[dict]:
    per_feature: dict[str, list[float]] = {c: [] for c in columns}
    for fold in folds_data:
        X = fold["scaler"].transform(fold["test_df"][columns])
        y = fold["test_df"]["label"].to_numpy()
        res = permutation_importance(fold["clf"], X, y, scoring="roc_auc", n_repeats=10, random_state=RANDOM_STATE)
        for i, c in enumerate(columns):
            per_feature[c].append(float(res.importances_mean[i]))
    return sorted(
        [{"feature": c, "auc_drop_mean": round(float(np.mean(v)), 4), "auc_drop_std": round(float(np.std(v, ddof=1)), 4) if len(v) > 1 else 0.0}
         for c, v in per_feature.items()],
        key=lambda r: -r["auc_drop_mean"],
    )


def main() -> None:
    engine = get_engine(shared_settings.DB_NAME)
    events, purchases = load_events_orders(engine)
    print(f"đã đọc: {len(events):,} events, {len(purchases):,} order_items", flush=True)

    ep = build_episodes(events, purchases)
    print(f"episode giỏ (sau khi cắt {OBS_HOURS}h+{LABEL_DAYS}d khỏi cuối dữ liệu): {len(ep):,}", flush=True)
    print(f"tỉ lệ dương (mua lại đúng SP trong {LABEL_DAYS}d sau quan sát {OBS_HOURS}h): {ep['label'].mean():.4f}", flush=True)

    df = build_features(ep, events)
    print("đã tính feature xong", flush=True)

    res_a = _fit_eval(df, SET_A)
    res_ab = _fit_eval(df, SET_A + SET_B)
    res_a_noise = _fit_eval(df, SET_A + [NOISE_COL])

    noise_floor = res_a["auc_std"]
    delta_ab = round(res_ab["auc_mean"] - res_a["auc_mean"], 4)
    delta_noise = round(res_a_noise["auc_mean"] - res_a["auc_mean"], 4)
    verdict_ab = "GIỮ (vượt sàn nhiễu)" if delta_ab > noise_floor else "LOẠI (trong nhiễu)"

    perm_table = _permutation_table(res_ab["_folds"], SET_A + SET_B)

    out = {
        "obs_hours": OBS_HOURS, "label_days": LABEL_DAYS, "n_episodes": len(df), "positive_rate": round(float(df["label"].mean()), 4),
        "set_a_single_aggregate": {k: v for k, v in res_a.items() if k != "_folds"},
        "set_ab_sequence_added": {k: v for k, v in res_ab.items() if k != "_folds"},
        "set_a_plus_noise_control": {k: v for k, v in res_a_noise.items() if k != "_folds"},
        "noise_floor_auc_std": noise_floor,
        "delta_auc_sequence_vs_single": delta_ab,
        "delta_auc_random_noise_control": delta_noise,
        "verdict_sequence_block": verdict_ab,
        "permutation_importance_set_ab": perm_table,
    }
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, default=str)
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
