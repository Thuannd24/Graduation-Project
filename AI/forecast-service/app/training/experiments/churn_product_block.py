"""Ngày 4 — port NHÓM C (thực thể sản phẩm) sang panel CHURN.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

## Câu hỏi

Trên RetailRocket (hành vi THẬT), nhóm C cho +0,01113 AUC và **rule không dùng được gì** (cây
depth-1/2 hưởng lợi đúng 0,00000). Câu hỏi của ngày 4: **cùng nguồn thông tin đó có giá trị trên
panel churn (dữ liệu TỔNG HỢP) không?**

## Dự đoán ĐĂNG KÝ TRƯỚC KHI CHẠY: NULL

Bộ sinh dữ liệu có **đúng 2 cơ chế** gắn với churn (λ tụt bậc từ `churnMonth`; bỏ giỏ ×2,5 trong 2
tháng "phân vân"). Thuộc tính sản phẩm **độc lập với cả hai theo thiết kế** — `preferredCategories`
sinh độc lập `willChurn`, và giá đến từ catalog thật import vào, không do generator gắn với churn.

Nếu dự đoán đúng thì đó chính là giá trị của phép đo này: **cùng một nguồn thông tin, DƯƠNG trên dữ
liệu thật và NULL trên dữ liệu tự sinh** ⇒ bằng chứng trực tiếp rằng trần nằm ở **dữ liệu**, không ở
kỹ thuật làm feature.

## ⚠️ Phát hiện về schema: một lớp feature KHÔNG dùng được

`products` có `sales_count` và `rating_avg` — nhìn thì rất hấp dẫn. Nhưng bảng **không lưu version
theo thời gian**: chỉ có giá trị HIỆN TẠI. Dùng chúng tại một mốc cắt trong quá khứ là **rò rỉ
tương lai** (giá trị đó phản ánh cả những lần bán/đánh giá xảy ra SAU mốc). Không có cách sửa ở
tầng feature — phải sửa ở tầng schema. Đã loại, ghi lại lý do.

Đối chiếu: RetailRocket `item_properties` CÓ version theo thời gian, nên ở đó làm được `merge_asof`
backward. Đây là khác biệt kiến trúc thật giữa hai nguồn dữ liệu, đáng nêu trong báo cáo.

Loại vì lý do khác: `sale_price` (0 dòng), `brand_id` (0 giá trị phân biệt), category (đã có
`category_diversity_viewed` trong baseline).

## Ghi chú trung thực về `cart_over_view_price_ratio`

Nó là tỉ số của 2 cột cũng nằm trong block. Về **lượng thông tin** thì bằng 0. Nhưng LR và cây đều
**không biểu diễn được phép chia**, nên với các lớp model này nó vẫn có thể giúp. Giữ lại, và nói rõ
điều này để hiệu chỉnh phát biểu "tỉ số = thông tin mới bằng 0" ở plan — phát biểu đó đúng về thông
tin, không đúng về khả năng biểu diễn của model.

Thuần phân tích: không lưu model, không đụng production, KHÔNG sửa `candidates.py` (chỉ promote nếu
block này qua cổng).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import MinMaxScaler

try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.pool import get_engine

from app.training.train import _build_training_panel, _evaluate_grouped_cv

WINDOW_DAYS = 30
MIN_POSITIVE_SHARE = 0.80
RANDOM_STATE = 42

BLOCK_PRODUCT = [
    "avg_price_viewed_30d",
    "max_price_viewed_30d",
    "price_std_viewed_30d",
    "avg_price_carted_30d",
    "cart_over_view_price_ratio",
    "avg_item_age_days_viewed",
]
DEFAULTS = {c: 0.0 for c in BLOCK_PRODUCT}

_PRODUCTS = "ecommerce_product_db.products"


def fetch_product_features(engine, as_of: pd.Timestamp) -> pd.DataFrame:
    """Thống kê GIÁ của những sản phẩm user đã xem / thêm giỏ trong cửa sổ, tính tới `as_of`.

    Chỉ dùng `price` và `created_at` — 2 cột duy nhất của `products` vừa tồn tại vừa hợp lệ về
    nhân quả thời gian (xem docstring module).
    """
    sql = f"""
        SELECT ue.user_id,
               AVG(CASE WHEN ue.action_type = 'VIEW_PRODUCT' THEN p.price END) AS avg_price_viewed_30d,
               MAX(CASE WHEN ue.action_type = 'VIEW_PRODUCT' THEN p.price END) AS max_price_viewed_30d,
               STDDEV_SAMP(CASE WHEN ue.action_type = 'VIEW_PRODUCT' THEN p.price END) AS price_std_viewed_30d,
               AVG(CASE WHEN ue.action_type = 'ADD_TO_CART' THEN p.price END) AS avg_price_carted_30d,
               AVG(CASE WHEN ue.action_type = 'VIEW_PRODUCT'
                        THEN DATEDIFF(%(as_of)s, p.created_at) END) AS avg_item_age_days_viewed
        FROM user_events ue
        JOIN {_PRODUCTS} p ON p.id = ue.item_id
        WHERE ue.created_at <= %(as_of)s
          AND ue.created_at > DATE_SUB(%(as_of)s, INTERVAL {WINDOW_DAYS} DAY)
        GROUP BY ue.user_id
    """
    with engine.connect() as conn:
        df = pd.read_sql(sql, conn, params={"as_of": as_of.to_pydatetime()})
    if df.empty:
        return pd.DataFrame(columns=["user_id", *BLOCK_PRODUCT]).set_index("user_id")
    df = df.set_index("user_id").astype(float)
    df["cart_over_view_price_ratio"] = df["avg_price_carted_30d"] / df[
        "avg_price_viewed_30d"
    ].replace(0, np.nan)
    return df[BLOCK_PRODUCT]


def paired(delta: np.ndarray) -> dict:
    mean, std = float(delta.mean()), float(delta.std())
    share = float((delta > 0).mean())
    return {
        "delta_mean": round(mean, 5),
        "delta_std": round(std, 5),
        "share_positive": round(share, 3),
        "significant": bool(mean > std and share >= MIN_POSITIVE_SHARE),
    }


def fit_lr(train, test, cols):
    scaler = MinMaxScaler().fit(train[cols])
    model = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=RANDOM_STATE)
    model.fit(scaler.transform(train[cols]), train["churn_label"])
    proba = model.predict_proba(scaler.transform(test[cols]))[:, 1]
    return roc_auc_score(test["churn_label"], proba)


def fit_lgbm(train, test, cols):
    model = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.05, num_leaves=31,
        random_state=RANDOM_STATE, verbose=-1,
    )
    model.fit(train[cols], train["churn_label"])
    return roc_auc_score(test["churn_label"], model.predict_proba(test[cols])[:, 1])


if __name__ == "__main__":
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine)

    # ghép block sản phẩm theo TỪNG mốc cắt (mỗi mốc một lần truy vấn, đúng as_of)
    frames = []
    for cutoff, group in panel.groupby("cutoff"):
        extra = fetch_product_features(engine, cutoff)
        frames.append(group.join(extra, how="left"))
    panel = pd.concat(frames).fillna(DEFAULTS)

    print(f"Panel: {len(panel)} dong / {panel.index.nunique()} user | churn {panel['churn_label'].mean():.4f}")
    covered = float((panel["avg_price_viewed_30d"] > 0).mean())
    print(f"Do phu block san pham: {covered:.1%}\n")

    cv = _evaluate_grouped_cv(panel, panel["cutoff"].max())
    if "error" in cv:
        raise RuntimeError(cv["error"])
    folds = cv["_folds"]
    print(f"So fold: {len(folds)}\n")

    base_cols = list(FEATURE_COLUMNS)
    ext_cols = base_cols + BLOCK_PRODUCT
    results: dict[str, dict] = {}

    for label, fn in [("LogisticRegression", fit_lr)] + (
        [("LightGBM", fit_lgbm)] if HAS_LGB else []
    ):
        auc_base, auc_ext = [], []
        for fold in folds:
            train, test = fold["train_df"], fold["test_df"]
            auc_base.append(fn(train, test, base_cols))
            auc_ext.append(fn(train, test, ext_cols))
        auc_base, auc_ext = np.array(auc_base), np.array(auc_ext)
        stat = paired(auc_ext - auc_base)
        results[label] = {
            "auc_baseline": {"mean": round(float(auc_base.mean()), 4),
                             "std": round(float(auc_base.std()), 4)},
            "auc_with_product": {"mean": round(float(auc_ext.mean()), 4),
                                 "std": round(float(auc_ext.std()), 4)},
            "paired": stat,
        }
        print(
            f"  {label:20s} {auc_base.mean():.4f}+-{auc_base.std():.4f} -> "
            f"{auc_ext.mean():.4f}+-{auc_ext.std():.4f} | "
            f"delta={stat['delta_mean']:+.5f}+-{stat['delta_std']:.5f} | "
            f"{stat['share_positive']:.0%} fold duong | nhan={stat['significant']}"
        )

    out = {
        "prediction_registered_before_run": "NULL (generator khong gan thuoc tinh san pham voi churn)",
        "block": BLOCK_PRODUCT,
        "panel_rows": int(len(panel)),
        "panel_users": int(panel.index.nunique()),
        "coverage": round(covered, 4),
        "results": results,
        "excluded_features": {
            "sales_count / rating_avg": "khong co version theo thoi gian -> ro ri tuong lai",
            "sale_price": "0 dong trong DB",
            "brand_id": "0 gia tri phan biet",
        },
    }
    print("\n" + json.dumps(out, ensure_ascii=False, indent=2))
    with open("/tmp/churn_product_block.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
