"""Dataset có bao phủ đủ feature space không? — đo ĐỘ PHỦ, không phải tương quan.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

Tương quan (script trước) trả lời "candidate có trùng feature khác không". Script này trả lời câu
hỏi khác, đứng trước cả tương quan: MỖI CHIỀU trong feature space có đủ user MANG GIÁ TRỊ THẬT
(khác mặc định/hằng số) để một model có cơ hội học được gì từ nó không?

  % user có giá trị THẬT thấp -> phần lớn panel là default/sentinel -> feature đó gần như HẰNG SỐ
  trên đa số dữ liệu, bất kể tương quan với gì. Đây là giới hạn DỮ LIỆU, không sửa được bằng
  feature engineering hay bằng thống kê đúng hơn.
"""
import json

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.features.candidates import CANDIDATE_COLUMNS, CANDIDATE_DEFAULTS
from shared_common.pool import get_engine

from app.training.train import _build_training_panel

engine = get_engine(shared_settings.DB_NAME)
panel = _build_training_panel(engine, include_candidates=True)
n_users = panel.index.nunique()
print(f"Panel: {len(panel)} dong / {n_users} user\n")

print("--- Do phu 11 feature PRODUCTION (mac dinh: 9999 hoac 0) ---")
prod_defaults = {"recency": 9999, "days_since_last_activity": 9999}
for col in FEATURE_COLUMNS:
    default = prod_defaults.get(col, 0.0)
    pct_nondefault = float((panel[col] != default).mean())
    print(f"  {col:32s} {pct_nondefault:6.1%} khac mac dinh ({default})")

print("\n--- Do phu 15 feature CANDIDATE ---")
rows = []
for col in CANDIDATE_COLUMNS:
    default = CANDIDATE_DEFAULTS[col]
    pct_nondefault = float((panel[col] != default).mean())
    rows.append({"feature": col, "pct_non_default": round(pct_nondefault, 4), "default_value": default})
    flag = "  <-- QUA MONG" if pct_nondefault < 0.30 else ""
    print(f"  {col:32s} {pct_nondefault:6.1%} khac mac dinh ({default}){flag}")

print("\n--- Bao phu bang phu tro theo USER (khong theo dong panel) ---")
import pandas as pd
with engine.connect() as conn:
    n_review_users = pd.read_sql(
        "SELECT COUNT(DISTINCT user_id) n FROM ecommerce_product_db.product_reviews", conn
    ).iloc[0, 0]
    n_voucher_users = pd.read_sql(
        "SELECT COUNT(DISTINCT u.keycloak_user_id) n FROM ecommerce_promotion_db.issued_vouchers v "
        "JOIN ecommerce_user_db.users u ON u.id = v.user_id", conn
    ).iloc[0, 0]
    n_session_users = pd.read_sql(
        "SELECT COUNT(DISTINCT user_id) n FROM user_events WHERE session_id IS NOT NULL", conn
    ).iloc[0, 0]
    n_total_users = pd.read_sql("SELECT COUNT(*) n FROM ecommerce_user_db.users", conn).iloc[0, 0]

print(f"  Tong so user he thong: {n_total_users}")
print(f"  User co >=1 review    : {n_review_users} ({n_review_users/n_total_users:.1%})")
print(f"  User co >=1 voucher   : {n_voucher_users} ({n_voucher_users/n_total_users:.1%})")
print(f"  User co event co session_id: {n_session_users} ({n_session_users/n_total_users:.1%})")

with open("/tmp/coverage_audit.json", "w", encoding="utf-8") as f:
    json.dump(
        {
            "panel_rows": len(panel), "panel_users": n_users,
            "candidate_coverage": rows,
            "aux_table_user_coverage": {
                "total_users": int(n_total_users),
                "review": int(n_review_users),
                "voucher": int(n_voucher_users),
                "session": int(n_session_users),
            },
        },
        f, ensure_ascii=False, indent=2,
    )
