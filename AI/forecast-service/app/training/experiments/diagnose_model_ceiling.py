"""Chẩn đoán: TẠI SAO model churn vẫn chưa ổn? Tìm nguyên nhân gốc bằng số, không đoán.

## Triệu chứng đã quan sát được (từ churn-risk-log.md)

- AUC dao động **0,7438 – 0,8415** giữa các lần reseed (biên độ ~0,10), trong khi std NỘI BỘ 1 lần
  chạy chỉ ±0,03–0,06. **Phương sai giữa các lần seed LỚN HƠN phương sai giữa các fold** — dấu hiệu
  điển hình của mẫu quá nhỏ, không phải của model sai.
- 6/6 khối feature thêm vào đều ΔAUC ≈ 0.
- 6/11 feature hiện tại có permutation importance ≈ 0.
- L1 path đạt đỉnh ở ~6 feature; thêm nữa thì AUC giảm.
- Rule 1 ngưỡng bắt kịp model.

## 4 nghi phạm, và cách phân biệt chúng bằng số

1. **Cỡ mẫu hiệu dụng nhỏ hơn nhiều so với số dòng** (nghi phạm chính).
   Panel có ~1.447 dòng nhưng chỉ từ ~340 user × 5 mốc cắt. Nếu feature của CÙNG một user gần như
   không đổi giữa các mốc cách nhau 30 ngày, thì 5 dòng đó gần như trùng nhau ⇒ cỡ mẫu hiệu dụng chỉ
   ~340. Đo bằng **tỉ lệ phương sai trong-user / tổng phương sai**: càng nhỏ càng chứng tỏ các dòng
   của một user là bản sao.
2. **Trần thông tin của bộ sinh dữ liệu.** Nếu đúng, tăng dữ liệu sẽ KHÔNG cải thiện AUC (chỉ giảm
   std). Đo bằng **learning curve**: lấy mẫu 25/50/75/100% số user, xem AUC có xu hướng tăng không.
3. **Nhãn quá ít tín hiệu / mất cân bằng theo mốc cắt.** Đo tỉ lệ churn từng mốc.
4. **Model tuyến tính không học được tương tác.** So LogisticRegression với LightGBM trên CÙNG feature.

Phân biệt 1 vs 2 là quan trọng nhất, vì hướng khắc phục **ngược nhau**:
- Nếu (1): tăng số USER (không phải số mốc cắt) sẽ giúp — vấn đề kỹ thuật, sửa được.
- Nếu (2): tăng dữ liệu vô ích, phải đổi NGUỒN thông tin (feature mới từ event mới) — vấn đề bản chất.

Chạy: `docker exec ai-forecast-service python /tmp/diagnose_model_ceiling.py`
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

RANDOM_STATE = 42


def effective_sample_size(panel: pd.DataFrame) -> dict:
    """Tỉ lệ phương sai TRONG-user so với tổng phương sai, tính trên feature đã chuẩn hoá.

    Gần 0  => các dòng của cùng 1 user gần như trùng nhau => cỡ mẫu hiệu dụng ≈ số USER.
    Gần 1  => mỗi mốc cắt cho một quan sát thật sự mới => cỡ mẫu hiệu dụng ≈ số DÒNG.
    """
    scaled = pd.DataFrame(
        MinMaxScaler().fit_transform(panel[FEATURE_COLUMNS]),
        columns=FEATURE_COLUMNS,
        index=panel.index,
    )
    out = {}
    for col in FEATURE_COLUMNS:
        total_var = float(scaled[col].var())
        if total_var <= 1e-12:
            out[col] = 0.0
            continue
        within = float(scaled.groupby(level=0)[col].var().mean())  # index = user_id
        out[col] = round(within / total_var, 4)

    ratios = [v for v in out.values() if v is not None]
    n_rows, n_users = len(panel), panel.index.nunique()
    mean_ratio = float(np.mean(ratios))
    return {
        "n_rows": n_rows,
        "n_users": n_users,
        "rows_per_user": round(n_rows / n_users, 2),
        "within_user_variance_ratio_per_feature": out,
        "mean_within_user_variance_ratio": round(mean_ratio, 4),
        # Cỡ mẫu hiệu dụng xấp xỉ: nội suy giữa n_users (bản sao hoàn toàn) và n_rows (độc lập hoàn toàn)
        "effective_n_estimate": int(round(n_users + mean_ratio * (n_rows - n_users))),
    }


def learning_curve(panel: pd.DataFrame, test_cutoff) -> list[dict]:
    """Lấy mẫu theo USER (không theo dòng) để giữ nguyên cấu trúc panel. Nếu AUC tăng theo số user
    => thiếu dữ liệu. Nếu phẳng mà std giảm => đã chạm trần thông tin."""
    rng = np.random.default_rng(RANDOM_STATE)
    all_users = panel.index.unique().to_numpy()
    rows = []
    for frac in (0.25, 0.5, 0.75, 1.0):
        k = max(int(len(all_users) * frac), 10)
        chosen = set(rng.choice(all_users, size=k, replace=False).tolist()) if frac < 1.0 else set(all_users.tolist())
        sub = panel[panel.index.isin(chosen)]
        cv = _evaluate_grouped_cv(sub, test_cutoff)
        rows.append(
            {
                "frac_users": frac,
                "n_users": int(sub.index.nunique()),
                "n_rows": int(len(sub)),
                "auc_mean": cv.get("auc_mean"),
                "auc_std": cv.get("auc_std"),
                "error": cv.get("error"),
            }
        )
    return rows


def churn_rate_per_cutoff(panel: pd.DataFrame) -> list[dict]:
    rows = []
    for cutoff, grp in panel.groupby("cutoff"):
        rows.append(
            {
                "cutoff": str(pd.Timestamp(cutoff).date()),
                "n_rows": int(len(grp)),
                "churn_rate": round(float(grp["churn_label"].mean()), 4),
            }
        )
    return sorted(rows, key=lambda r: r["cutoff"])


def linear_vs_tree(panel: pd.DataFrame, test_cutoff) -> dict:
    """Cùng feature, cùng fold: model tuyến tính vs model học được tương tác."""
    cv = _evaluate_grouped_cv(panel, test_cutoff)
    folds = cv.get("_folds", [])
    lr_aucs, lgb_aucs = [], []
    for fold in folds:
        tr, te = fold["train_df"], fold["test_df"]
        if tr["churn_label"].nunique() < 2 or te["churn_label"].nunique() < 2:
            continue
        scaler = MinMaxScaler().fit(tr[FEATURE_COLUMNS])
        lr = LogisticRegression(class_weight="balanced", max_iter=1000)
        lr.fit(scaler.transform(tr[FEATURE_COLUMNS]), tr["churn_label"])
        lr_aucs.append(
            roc_auc_score(te["churn_label"], lr.predict_proba(scaler.transform(te[FEATURE_COLUMNS]))[:, 1])
        )
        if HAS_LGB:
            m = lgb.LGBMClassifier(
                n_estimators=300, learning_rate=0.05, num_leaves=31,
                random_state=RANDOM_STATE, verbose=-1,
            )
            m.fit(tr[FEATURE_COLUMNS], tr["churn_label"])
            lgb_aucs.append(roc_auc_score(te["churn_label"], m.predict_proba(te[FEATURE_COLUMNS])[:, 1]))

    def ms(v):
        return (round(float(np.mean(v)), 4), round(float(np.std(v)), 4)) if v else (None, None)

    lr_m, lr_s = ms(lr_aucs)
    lgb_m, lgb_s = ms(lgb_aucs)
    gain = round(lgb_m - lr_m, 4) if (lr_m is not None and lgb_m is not None) else None
    return {
        "logreg_auc_mean": lr_m, "logreg_auc_std": lr_s,
        "lightgbm_auc_mean": lgb_m, "lightgbm_auc_std": lgb_s,
        "gain_from_nonlinear": gain,
        "nonlinear_beats_noise": bool(gain is not None and lr_s is not None and gain > lr_s),
    }


def main() -> None:
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine)
    test_cutoff = panel["cutoff"].max()

    result = {
        "suspect_1_effective_sample_size": effective_sample_size(panel),
        "suspect_2_learning_curve": learning_curve(panel, test_cutoff),
        "suspect_3_churn_rate_per_cutoff": churn_rate_per_cutoff(panel),
        "suspect_4_linear_vs_nonlinear": linear_vs_tree(panel, test_cutoff),
    }

    lc = [r for r in result["suspect_2_learning_curve"] if r.get("auc_mean")]
    eff = result["suspect_1_effective_sample_size"]
    slope = round(lc[-1]["auc_mean"] - lc[0]["auc_mean"], 4) if len(lc) >= 2 else None
    std_shrink = round(lc[0]["auc_std"] - lc[-1]["auc_std"], 4) if len(lc) >= 2 else None

    result["diagnosis"] = {
        "effective_n_vs_nominal_rows": f"{eff['effective_n_estimate']} / {eff['n_rows']}",
        "rows_are_mostly_duplicates": bool(eff["mean_within_user_variance_ratio"] < 0.25),
        "auc_gain_from_25pct_to_100pct_users": slope,
        "auc_std_shrink_with_more_users": std_shrink,
        "data_hungry (AUC tang theo so user)": bool(slope is not None and slope > 0.02),
        "at_information_ceiling (AUC phang, std giam)": bool(
            slope is not None and slope <= 0.02 and (std_shrink or 0) > 0
        ),
        "nonlinear_helps": result["suspect_4_linear_vs_nonlinear"]["nonlinear_beats_noise"],
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))
    with open("/tmp/diagnose_result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
