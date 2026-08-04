"""Feature ỨNG VIÊN cho bước mở rộng (chưa vào production `FEATURE_COLUMNS`).

Module này CỐ Ý tách khỏi `assembler.py`: `FEATURE_COLUMNS` là hợp đồng của model đang chạy, còn
đây là các cột chỉ dùng cho thí nghiệm ablation (`app/training/ablation.py`). Feature nào vượt được
sàn nhiễu thì mới chuyển sang `assembler.py` và tăng `FEATURE_VERSION`.

## Vì sao danh sách ứng viên ban đầu NGẮN hơn nhiều so với dự kiến

Sau khi đọc bộ sinh dữ liệu (`tools/data-seed/lib/{profiles,simulate}.mjs`), phần lớn ứng viên
"nghe hợp lý" bị loại vì **chứng minh được là nhiễu** trong dữ liệu hiện có:

| Ứng viên bị loại | Lý do (bằng chứng từ generator) |
|---|---|
| Độ sâu giảm giá | `discountAmount` luôn đúng 10% (`simulate.mjs`) — hằng số, không có biến thiên |
| Lặp xem cùng sản phẩm | `pickProduct()` chọn độc lập mỗi lần → trùng lặp chỉ do tình cờ, là hàm của số event và độ tập trung category, đã có trong feature hiện tại |
| Herfindahl tập trung category | `preferredCategories` sinh ĐỘC LẬP với `willChurn`/`churnMonth` → không mang tín hiệu churn (khớp với số đo: `discount_dependency` cũng độc lập và coef của nó ≈ 0) |

Chỉ 2 cơ chế trong generator gắn với churn: (1) λ tụt bậc xuống 5% từ `churnMonth`, (2) số lần bỏ
giỏ tăng 2.5× trong 2 tháng "phân vân" ngay trước đó. Cả hai đã được 11 feature hiện tại phủ. Nên
kỳ vọng thực tế là **phần lớn block sẽ KHÔNG vượt sàn nhiễu** — và đó là kết quả cần báo cáo trung
thực, không phải thất bại.

## Tầng 1.2 (2026-08-03) — mở khoá thêm 3 block sau khi làm giàu seeder

Trước đây `product_reviews` (0 dòng), `issued_vouchers` (1 dòng), `user_events.session_id` (NULL
toàn bộ) chặn hoàn toàn 3 nhóm feature. Sau khi làm giàu `tools/data-seed` (session clustering +
nhịp giờ/ngày, review sau mua, lịch sử voucher — xem `churn-risk-log.md` mục Tầng 1.2) và reseed
thật, cả 3 bảng đã có dữ liệu lệch thật. Thêm `BLOCK_SESSION`, `BLOCK_REVIEW`, `BLOCK_VOUCHER` —
xem đánh giá circularity riêng ở docstring từng hàm `_session()`/`_review()`/`_voucher()` bên dưới.

**Đã đo bằng `POST /api/v1/models/ablation`: cả 3 block đều LOẠI (trong sàn nhiễu ±0.0312)** —
session ΔAUC −0.0126, review −0.0039, voucher +0.0021. Đây là kết quả ĐÚNG NHƯ DỰ ĐOÁN: cả 3 tham
số ẩn mới cố ý sinh độc lập với `willChurn` nên không mang tín hiệu churn — nếu ablation báo "có
tín hiệu" thì mới là dấu hiệu đáng ngờ. Không đưa vào `assembler.py`/`FEATURE_COLUMNS`.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy.engine import Engine

from shared_common.logger import get_logger

logger = get_logger(__name__)

ABANDON_WINDOW_DAYS = 30
ABANDON_BASELINE_DAYS = 120  # 30 ngày gần nhất so với 90 ngày trước đó
ABANDON_GRACE_HOURS = 24
# Cửa sổ quan sát coi như "không thấy mua lặp lại" khi user có < 2 đơn. Dùng số hữu hạn thay vì
# sentinel 9999 kiểu assembler.py: sentinel lớn sẽ bị MinMaxScaler kéo giãn làm cả block mất tác
# dụng, khiến thí nghiệm ablation kết luận sai về block chứ không phải về feature.
NO_REPEAT_PURCHASE_DAYS = 365


# --- Block 1: hình dạng hành vi bỏ giỏ (nhắm trực tiếp cơ chế "phân vân" 2.5x của generator) ---
# Circularity: TRUNG BÌNH với `abandon_recent_vs_baseline` (nó gần như đọc thẳng hệ số 2.5x),
# THẤP với `cart_abandon_rate` (là phép chuẩn hoá mà số đếm thô không diễn đạt được).
BLOCK_ABANDON_SHAPE = ["cart_abandon_rate", "abandon_recent_vs_baseline"]

# --- Block 2: độ phân tán khoảng cách giữa 2 lần mua ---
# Circularity: TRUNG BÌNH. λ tụt bậc làm khoảng cách hiện tại giãn ra so với lịch sử, nên các
# feature này bám một phần vào cơ chế sinh. Không phải slope tường minh (đã loại vì quá vòng tròn),
# nhưng phải khai báo rõ khi báo cáo.
BLOCK_GAP_DISPERSION = [
    "interpurchase_gap_mean",
    "interpurchase_gap_std",
    "interpurchase_gap_max",
    "recency_over_median_gap",
]

# --- Block 3: ĐỐI CHỨNG ÂM (negative control) ---
# Đã lập luận ở docstring là nhiễu. Giữ lại CHỦ ĐÍCH: nếu harness báo block này cũng "cải thiện"
# AUC thì chính harness đang sai, không phải feature tốt. Đây là phép kiểm tra chính harness.
BLOCK_NOISE_CONTROL = ["distinct_items_viewed", "repeat_view_ratio", "distinct_items_carted"]

# --- Block 4: nhịp phiên (session) — Tầng 1.2, mở khoá sau khi sửa write-path session_id ---
# Circularity: TRUNG BÌNH. `sessionBrowseSpreadMinutes`/`sessionPureViewBatch` (profiles.mjs) sinh
# ĐỘC LẬP với willChurn, nhưng SỐ LƯỢNG phiên trong 30 ngày vẫn tỉ lệ thuận với mức hoạt động chung
# — cùng cơ chế λ tụt bậc mà `recent_view_count`/`days_since_last_activity` (feature hiện tại) đã
# bắt được. Nên nhiều khả năng ĐÓNG GÓP TRÙNG LẶP chứ không phải tín hiệu mới, tương tự lo ngại đã
# nêu ở `gap_dispersion`. `avg_events_per_session_30d` (độ "sâu" 1 lượt ghé) là phần có cơ hội mới
# nhất trong block này — nó đo hành vi trong 1 lần ghé, không phải tần suất ghé.
BLOCK_SESSION = ["distinct_sessions_30d", "avg_events_per_session_30d"]

# --- Block 5: review sau khi mua — Tầng 1.2 ---
# Circularity: `review_count` TRUNG BÌNH (tỉ lệ thuận số đơn đã mua -> tương quan với `frequency`
# sẵn có, xem multicollinearity đã đo ở feature hiện tại). `avg_rating_given` THẤP — sinh từ
# `reviewRatingBias` (tính "khó/dễ tính" khi review), hoàn toàn độc lập cơ chế churn trong
# generator -> gần như một ĐỐI CHỨNG ÂM thứ 2: nếu harness báo feature này có tín hiệu thật, phải
# nghi ngờ chính harness trước khi tin.
BLOCK_REVIEW = ["review_count", "avg_rating_given"]

# --- Block 6: lịch sử voucher — Tầng 1.2 ---
# Circularity: TRUNG BÌNH. Cả 2 feature sinh từ `priceSensitivity` (hidden param ĐÃ CÓ, dùng để
# tính `discount_dependency` hiện tại) — nên câu hỏi thật của block này là "voucher_usage_rate có
# thêm thông tin NGOÀI discount_dependency không", không phải "có tương quan churn không" (dữ liệu
# không tạo quan hệ trực tiếp nào giữa vouchers và willChurn/churnMonth).
BLOCK_VOUCHER = ["voucher_issued_count", "voucher_usage_rate"]

CANDIDATE_BLOCKS: dict[str, list[str]] = {
    "abandon_shape": BLOCK_ABANDON_SHAPE,
    "gap_dispersion": BLOCK_GAP_DISPERSION,
    "noise_control": BLOCK_NOISE_CONTROL,
    "session": BLOCK_SESSION,
    "review": BLOCK_REVIEW,
    "voucher": BLOCK_VOUCHER,
}

CANDIDATE_COLUMNS = [col for cols in CANDIDATE_BLOCKS.values() for col in cols]

CANDIDATE_DEFAULTS = {
    "cart_abandon_rate": 0.0,
    "abandon_recent_vs_baseline": 0.0,
    "interpurchase_gap_mean": float(NO_REPEAT_PURCHASE_DAYS),
    "interpurchase_gap_std": 0.0,
    "interpurchase_gap_max": float(NO_REPEAT_PURCHASE_DAYS),
    "recency_over_median_gap": 0.0,
    "distinct_items_viewed": 0.0,
    "repeat_view_ratio": 0.0,
    "distinct_items_carted": 0.0,
    "distinct_sessions_30d": 0.0,
    "avg_events_per_session_30d": 0.0,
    "review_count": 0.0,
    "avg_rating_given": 0.0,
    "voucher_issued_count": 0.0,
    "voucher_usage_rate": 0.0,
}

# Tên đầy đủ database.table cho 2 bảng KHÔNG thuộc `ecommerce_order_db` (DB mặc định của engine
# được truyền vào module này) — cùng 1 server MariaDB (xem `tools/data-seed/lib/db.mjs`), nên
# JOIN/SELECT cross-database bằng tên đủ vẫn chạy được trên CÙNG 1 connection, không cần tạo
# thêm engine riêng cho từng DB.
_PRODUCT_REVIEWS_TABLE = "ecommerce_product_db.product_reviews"
_ISSUED_VOUCHERS_TABLE = "ecommerce_promotion_db.issued_vouchers"
_USERS_TABLE = "ecommerce_user_db.users"


def _abandon_shape(engine: Engine, as_of_clause: str, params: dict) -> pd.DataFrame:
    """`cart_abandon_rate` = bỏ giỏ / tổng lần thêm giỏ (30 ngày).
    `abandon_recent_vs_baseline` = nhịp bỏ giỏ 30 ngày gần nhất / nhịp 90 ngày trước đó."""
    sql = f"""
        SELECT ue.user_id,
               SUM(CASE WHEN ue.created_at >= {as_of_clause} - INTERVAL {ABANDON_WINDOW_DAYS} DAY
                        THEN 1 ELSE 0 END) AS cart_add_recent,
               SUM(CASE WHEN ue.created_at >= {as_of_clause} - INTERVAL {ABANDON_WINDOW_DAYS} DAY
                         AND NOT EXISTS (
                             SELECT 1 FROM orders o
                             WHERE o.user_id = ue.user_id
                               AND o.created_at BETWEEN ue.created_at
                                   AND DATE_ADD(ue.created_at, INTERVAL {ABANDON_GRACE_HOURS} HOUR)
                         )
                        THEN 1 ELSE 0 END) AS abandon_recent,
               SUM(CASE WHEN ue.created_at < {as_of_clause} - INTERVAL {ABANDON_WINDOW_DAYS} DAY
                         AND NOT EXISTS (
                             SELECT 1 FROM orders o
                             WHERE o.user_id = ue.user_id
                               AND o.created_at BETWEEN ue.created_at
                                   AND DATE_ADD(ue.created_at, INTERVAL {ABANDON_GRACE_HOURS} HOUR)
                         )
                        THEN 1 ELSE 0 END) AS abandon_baseline
        FROM user_events ue
        WHERE ue.action_type IN ('ADD_TO_CART', 'UPDATE_CART_QTY')
          AND ue.user_id IS NOT NULL
          AND ue.created_at >= {as_of_clause} - INTERVAL {ABANDON_BASELINE_DAYS} DAY
          AND ue.created_at <= {as_of_clause}
        GROUP BY ue.user_id
    """
    with engine.connect() as conn:
        df = pd.read_sql(sql, conn, params=params)

    if df.empty:
        return pd.DataFrame(columns=["user_id", *BLOCK_ABANDON_SHAPE]).set_index("user_id")

    # np.nan (KHÔNG phải pd.NA) làm mẫu số rỗng: pd.NA không chuyển được sang float, phép chia sẽ
    # sinh dtype object và .astype(float) nổ "NAType". np.nan vốn đã là float nên an toàn.
    df = df.set_index("user_id").astype(float)
    df["cart_abandon_rate"] = df["abandon_recent"] / df["cart_add_recent"].replace(0, np.nan)

    # Nhịp/tháng: 30 ngày gần nhất so với 90 ngày trước đó (baseline chia 3 để cùng đơn vị).
    baseline_rate = (df["abandon_baseline"] / 3.0).replace(0, np.nan)
    df["abandon_recent_vs_baseline"] = df["abandon_recent"] / baseline_rate

    return df[BLOCK_ABANDON_SHAPE]


def _gap_dispersion(engine: Engine, as_of_clause: str, params: dict, as_of: pd.Timestamp | None) -> pd.DataFrame:
    """Thống kê khoảng cách giữa các đơn DELIVERED liên tiếp. Tính trong pandas (chỉ vài nghìn đơn)
    thay vì SQL window function để giữ tương thích với MariaDB cũ."""
    sql = f"""
        SELECT user_id, created_at
        FROM orders
        WHERE status = 'DELIVERED'
          AND user_id IS NOT NULL
          AND created_at <= {as_of_clause}
        ORDER BY user_id, created_at
    """
    with engine.connect() as conn:
        orders = pd.read_sql(sql, conn, params=params)

    if orders.empty:
        return pd.DataFrame(columns=["user_id", *BLOCK_GAP_DISPERSION]).set_index("user_id")

    orders["created_at"] = pd.to_datetime(orders["created_at"])
    orders["gap_days"] = orders.groupby("user_id")["created_at"].diff().dt.total_seconds() / 86400.0

    grouped = orders.groupby("user_id")
    out = pd.DataFrame(index=grouped.size().index)
    out["interpurchase_gap_mean"] = grouped["gap_days"].mean()
    out["interpurchase_gap_std"] = grouped["gap_days"].std()
    out["interpurchase_gap_max"] = grouped["gap_days"].max()

    reference = pd.Timestamp(as_of) if as_of is not None else pd.Timestamp.now()
    recency_days = (reference - grouped["created_at"].max()).dt.total_seconds() / 86400.0
    median_gap = grouped["gap_days"].median()
    # user có < 2 đơn: chưa quan sát được nhịp mua nào -> lấy cả cửa sổ quan sát làm mẫu số. Giữ
    # feature đơn điệu theo recency và có chặn trên, thay vì để NaN hay chia cho 0.
    median_gap = median_gap.fillna(float(NO_REPEAT_PURCHASE_DAYS)).replace(0, 1.0)
    out["recency_over_median_gap"] = recency_days / median_gap

    return out[BLOCK_GAP_DISPERSION]


def _noise_control(engine: Engine, as_of_clause: str, params: dict) -> pd.DataFrame:
    """Đối chứng âm — xem docstring module."""
    sql = f"""
        SELECT user_id,
               COUNT(DISTINCT CASE WHEN action_type = 'VIEW_PRODUCT' THEN item_id END) AS distinct_items_viewed,
               SUM(CASE WHEN action_type = 'VIEW_PRODUCT' THEN 1 ELSE 0 END) AS view_events,
               COUNT(DISTINCT CASE WHEN action_type IN ('ADD_TO_CART','UPDATE_CART_QTY') THEN item_id END) AS distinct_items_carted
        FROM user_events
        WHERE user_id IS NOT NULL
          AND created_at >= {as_of_clause} - INTERVAL {ABANDON_WINDOW_DAYS} DAY
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """
    with engine.connect() as conn:
        df = pd.read_sql(sql, conn, params=params)

    if df.empty:
        return pd.DataFrame(columns=["user_id", *BLOCK_NOISE_CONTROL]).set_index("user_id")

    df = df.set_index("user_id").astype(float)
    df["repeat_view_ratio"] = df["view_events"] / df["distinct_items_viewed"].replace(0, np.nan)
    return df[BLOCK_NOISE_CONTROL]


def _session(engine: Engine, as_of_clause: str, params: dict) -> pd.DataFrame:
    """`distinct_sessions_30d` = số phiên riêng biệt trong 30 ngày; `avg_events_per_session_30d` =
    event / phiên (độ "sâu" 1 lượt ghé) — xem đánh giá circularity ở `BLOCK_SESSION`."""
    sql = f"""
        SELECT user_id,
               COUNT(DISTINCT session_id) AS n_sessions,
               COUNT(*) AS n_events
        FROM user_events
        WHERE user_id IS NOT NULL
          AND session_id IS NOT NULL
          AND created_at >= {as_of_clause} - INTERVAL 30 DAY
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """
    with engine.connect() as conn:
        df = pd.read_sql(sql, conn, params=params)

    if df.empty:
        return pd.DataFrame(columns=["user_id", *BLOCK_SESSION]).set_index("user_id")

    df = df.set_index("user_id").astype(float)
    df["distinct_sessions_30d"] = df["n_sessions"]
    df["avg_events_per_session_30d"] = df["n_events"] / df["n_sessions"].replace(0, np.nan)
    return df[BLOCK_SESSION]


def _review(engine: Engine, as_of_clause: str, params: dict) -> pd.DataFrame:
    """`review_count`/`avg_rating_given` tính TOÀN BỘ lịch sử tới `as_of` (không giới hạn 30 ngày —
    review là sự kiện thưa, cửa sổ ngắn sẽ toàn 0). Xem đánh giá circularity ở `BLOCK_REVIEW`."""
    sql = f"""
        SELECT user_id,
               COUNT(*) AS review_count,
               AVG(rating) AS avg_rating_given
        FROM {_PRODUCT_REVIEWS_TABLE}
        WHERE user_id IS NOT NULL
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """
    with engine.connect() as conn:
        df = pd.read_sql(sql, conn, params=params)

    if df.empty:
        return pd.DataFrame(columns=["user_id", *BLOCK_REVIEW]).set_index("user_id")

    return df.set_index("user_id").astype(float)[BLOCK_REVIEW]


def _voucher(engine: Engine, as_of_clause: str, params: dict) -> pd.DataFrame:
    """`issued_vouchers.user_id` là id NỘI BỘ (Long), khác `keycloak_user_id` (String) dùng ở mọi
    bảng khác trong panel — JOIN qua `ecommerce_user_db.users` để quy về cùng khoá `user_id`
    (keycloak UUID) trước khi trả ra. Xem đánh giá circularity ở `BLOCK_VOUCHER`."""
    sql = f"""
        SELECT u.keycloak_user_id AS user_id,
               COUNT(*) AS voucher_issued_count,
               SUM(CASE WHEN v.status = 'USED' THEN 1 ELSE 0 END) AS used_count
        FROM {_ISSUED_VOUCHERS_TABLE} v
        JOIN {_USERS_TABLE} u ON u.id = v.user_id
        WHERE v.created_at <= {as_of_clause}
        GROUP BY u.keycloak_user_id
    """
    with engine.connect() as conn:
        df = pd.read_sql(sql, conn, params=params)

    if df.empty:
        return pd.DataFrame(columns=["user_id", *BLOCK_VOUCHER]).set_index("user_id")

    df = df.set_index("user_id").astype(float)
    df["voucher_usage_rate"] = df["used_count"] / df["voucher_issued_count"].replace(0, np.nan)
    return df[BLOCK_VOUCHER]


def fetch_candidate_features(engine: Engine, *, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
    """Trả DataFrame index user_id, đúng `CANDIDATE_COLUMNS`, không NaN.

    `as_of` giữ đúng ngữ nghĩa như `assembler.build_feature_matrix` — chỉ dùng dữ liệu tới thời
    điểm đó, để panel huấn luyện theo temporal split không rò rỉ tương lai.
    """
    as_of_clause = "NOW()" if as_of is None else "%(as_of)s"
    params = {} if as_of is None else {"as_of": as_of.to_pydatetime()}

    frames = [
        _abandon_shape(engine, as_of_clause, params),
        _gap_dispersion(engine, as_of_clause, params, as_of),
        _noise_control(engine, as_of_clause, params),
        _session(engine, as_of_clause, params),
        _review(engine, as_of_clause, params),
        _voucher(engine, as_of_clause, params),
    ]

    combined = frames[0]
    for frame in frames[1:]:
        combined = combined.join(frame, how="outer")

    for column in CANDIDATE_COLUMNS:
        if column not in combined.columns:
            combined[column] = CANDIDATE_DEFAULTS[column]

    combined = combined.replace([np.inf, -np.inf], np.nan)
    combined = combined.fillna(CANDIDATE_DEFAULTS)
    return combined[CANDIDATE_COLUMNS].astype(float)
