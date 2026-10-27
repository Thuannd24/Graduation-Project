"""PH9 — Unit test dựng feature churn (fast_compute / assembler), sinh nhãn churn và gán nhãn phân khúc.
DB dùng SQLite in-memory (chỉ chứa vài dòng dựng tay) — không chạm MariaDB thật.
"""
import os
import sys

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import create_engine, text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.training import labels as labels_module  # noqa: E402
from app.training import train as train_module  # noqa: E402
from shared_common.features import assembler  # noqa: E402
from shared_common.features import fast_compute as fc  # noqa: E402

AS_OF = pd.Timestamp("2026-10-01 12:00:00")


def _orders():
    return pd.DataFrame([
        ("A", "DELIVERED", "2026-09-21 10:00:00", 100.0, None),
        ("A", "DELIVERED", "2026-09-28 23:00:00", 300.0, "SALE10"),
        ("A", "CANCELLED", "2026-09-29 09:00:00", 50.0, None),
        ("A", "DELIVERED", "2026-10-05 09:00:00", 999.0, None),  # sau as_of -> không được tính
        ("B", "CANCELLED", "2026-09-10 09:00:00", 80.0, "X"),
    ], columns=["user_id", "status", "created_at", "total_amount", "coupon_code"]).assign(
        created_at=lambda d: pd.to_datetime(d["created_at"]))


def _events():
    return pd.DataFrame([
        ("A", "VIEW_PRODUCT", "2026-09-30 08:00:00", 1, 11, "s1"),
        ("A", "VIEW_PRODUCT", "2026-09-20 08:00:00", 2, 12, "s1"),
        ("A", "ADD_TO_CART", "2026-09-28 20:00:00", 1, 11, "s1"),   # có đơn 3h sau -> không tính bỏ giỏ
        ("A", "ADD_TO_CART", "2026-09-25 08:00:00", 2, 12, "s1"),   # không có đơn trong 24h -> bỏ giỏ
        ("C", "VIEW_PRODUCT", "2026-09-15 08:00:00", 3, 13, "s2"),
        ("C", "VIEW_PRODUCT", "2026-10-03 08:00:00", 4, 14, "s2"),  # sau as_of
    ], columns=["user_id", "action_type", "created_at", "category_id", "item_id", "session_id"]).assign(
        created_at=lambda d: pd.to_datetime(d["created_at"]))


def _orders_by_user(orders):
    return {u: g["created_at"].sort_values().to_numpy() for u, g in orders.groupby("user_id")}


@pytest.fixture
def sqlite_engine():
    engine = create_engine("sqlite://")
    o, e = _orders(), _events()
    o["created_at"] = o["created_at"].dt.strftime("%Y-%m-%d %H:%M:%S")
    e["created_at"] = e["created_at"].dt.strftime("%Y-%m-%d %H:%M:%S")
    o.to_sql("orders", engine, index=False)
    e.to_sql("user_events", engine, index=False)
    return engine


# ─────────────────────────── Feature RFM / hành vi ───────────────────────────

def test_tc_ph9_feat_01_rfm_formula():
    """TC_PH9_FEAT_01: recency/frequency/monetary chỉ tính đơn DELIVERED tới as_of; cancel_rate & discount_dependency tính trên mọi đơn."""
    df = fc.rfm_features(_orders(), AS_OF)
    a = df.loc["A"]
    assert a["recency"] == 3          # 01/10 - 28/10 theo NGÀY (bỏ giờ, giống DATEDIFF)
    assert a["frequency"] == 2 and a["monetary"] == 400.0 and a["avg_order_value"] == 200.0
    assert a["cancel_rate"] == pytest.approx(1 / 3) and a["discount_dependency"] == pytest.approx(1 / 3)


def test_tc_ph9_feat_02_user_without_delivered_gets_defaults():
    """TC_PH9_FEAT_02: User chỉ có đơn huỷ -> recency=9999, frequency=0, monetary=0, AOV=0 (không chia cho 0, không NaN)."""
    b = fc.rfm_features(_orders(), AS_OF).loc["B"]
    assert (b["recency"], b["frequency"], b["monetary"], b["avg_order_value"]) == (9999, 0, 0.0, 0.0)
    assert b["cancel_rate"] == 1.0 and b["discount_dependency"] == 1.0


def test_tc_ph9_feat_03_behavior_features_and_cart_abandon():
    """TC_PH9_FEAT_03: Lượt xem 7 ngày, ngày từ hoạt động cuối, tỉ lệ xem->giỏ, đa dạng danh mục và bỏ giỏ (không có đơn trong 24h)."""
    orders = _orders()
    df = fc.behavior_features(orders, _events(), AS_OF, _orders_by_user(orders))
    a = df.loc["A"]
    assert a["recent_view_count"] == 1
    assert a["days_since_last_activity"] == 1
    assert a["cart_abandon_count"] == 1          # chỉ lần thêm giỏ 25/09
    assert a["view_to_cart_conversion_rate"] == 1.0  # 2 thêm giỏ / 2 lượt xem trong 30 ngày
    assert a["category_diversity_viewed"] == 2


def test_tc_ph9_feat_04_cart_abandon_grace_boundary():
    """TC_PH9_FEAT_04: Đơn tạo đúng mốc +24h vẫn tính là đã mua (không bỏ giỏ); +24h1s thì là bỏ giỏ."""
    cart = pd.DataFrame({"user_id": ["A", "A"],
                         "created_at": pd.to_datetime(["2026-09-01 10:00:00", "2026-09-05 10:00:00"])})
    orders = {"A": pd.to_datetime(["2026-09-02 10:00:00", "2026-09-06 10:00:01"]).to_numpy()}
    out = fc._cart_abandon_count(cart, orders)
    assert out.tolist() == [False, True]


def test_tc_ph9_feat_05_live_matrix_from_db(sqlite_engine):
    """TC_PH9_FEAT_05: compute_live_feature_matrix đọc DB, outer-join 2 nguồn, đúng 11 cột FEATURE_COLUMNS, không NaN; user chỉ có hành vi nhận default RFM."""
    X = fc.compute_live_feature_matrix(sqlite_engine, as_of=AS_OF)
    assert list(X.columns) == assembler.FEATURE_COLUMNS and len(X.columns) == 11
    assert not X.isna().any().any()
    assert set(X.index) == {"A", "B", "C"}
    c = X.loc["C"]
    assert c["recency"] == 9999 and c["frequency"] == 0 and c["days_since_last_activity"] == 16
    assert X.loc["B"]["days_since_last_activity"] == 9999  # chưa từng có hành vi
    assert X.loc["A"]["monetary"] == 400.0


def test_tc_ph9_feat_06_assembler_outer_join_defaults(monkeypatch):
    """TC_PH9_FEAT_06: build_feature_matrix (đường SQL) ghép outer join và áp default đúng ngữ nghĩa cho phía thiếu."""
    orders = pd.DataFrame({"recency": [5], "frequency": [2], "monetary": [10.0], "avg_order_value": [5.0],
                           "cancel_rate": [0.0], "discount_dependency": [0.5]}, index=pd.Index(["A"], name="user_id"))
    beh = pd.DataFrame({"recent_view_count": [3], "days_since_last_activity": [1], "cart_abandon_count": [0],
                        "view_to_cart_conversion_rate": [0.2], "category_diversity_viewed": [2]},
                       index=pd.Index(["Z"], name="user_id"))
    monkeypatch.setattr(assembler, "fetch_order_features", lambda engine, as_of=None: orders)
    monkeypatch.setattr(assembler, "fetch_behavior_features", lambda engine, as_of=None: beh)
    X = assembler.build_feature_matrix(object())
    assert X.loc["A", "days_since_last_activity"] == 9999 and X.loc["A", "recent_view_count"] == 0
    assert X.loc["Z", "recency"] == 9999 and X.loc["Z", "monetary"] == 0.0
    assert not X.isna().any().any()


# ─────────────────────────── Nhãn churn ───────────────────────────

def test_tc_ph9_label_01_window_boundaries(sqlite_engine):
    """TC_PH9_LABEL_01: Nhãn 'orders': có đơn trong (as_of, as_of+window] -> 0; đơn đúng tại as_of không tính; không có đơn -> 1."""
    with sqlite_engine.begin() as conn:
        conn.execute(text("INSERT INTO orders (user_id, status, created_at, total_amount) VALUES "
                          "('D','DELIVERED','2026-10-01 12:00:00',1), "   # đúng as_of -> KHÔNG tính
                          "('E','PENDING','2026-10-31 12:00:00',1)"))     # đúng as_of+30d -> tính
    labels = labels_module.compute_churn_labels(sqlite_engine, ["A", "B", "D", "E"], AS_OF, 30, "orders")
    assert labels == {"A": 0, "B": 1, "D": 1, "E": 0}


def test_tc_ph9_label_02_invalid_source_rejected(sqlite_engine):
    """TC_PH9_LABEL_02: source nhãn không thuộc ('activity','orders') -> ValueError, không truy vấn DB."""
    with pytest.raises(ValueError):
        labels_module.compute_churn_labels(sqlite_engine, ["A"], AS_OF, 30, "views")


def test_tc_ph9_label_03_population_constant():
    """TC_PH9_LABEL_03: Dân số churn = user >= 2 đơn DELIVERED; phiên bản nhãn v2 dùng nguồn 'orders', cửa sổ 120 ngày."""
    assert labels_module.MIN_DELIVERED_ORDERS_FOR_CHURN == 2
    d = train_module._label_definition()
    assert d["source"] == "orders" and d["window_days"] == 120 and d["min_delivered_orders"] == 2
    assert d["label_version"] == labels_module.LABEL_VERSION


# ─────────────────────────── Gán nhãn phân khúc ───────────────────────────

def test_tc_ph9_seg_01_at_risk_is_highest_churn_cluster():
    """TC_PH9_SEG_01: 'At Risk' gán cho cụm có tỉ lệ churn đo được cao nhất; 3 cụm còn lại theo monetary giảm dần."""
    panel = pd.DataFrame({
        "cluster":     [0, 0, 1, 1, 2, 2, 3, 3],
        "churn_label": [0, 0, 1, 1, 0, 1, 0, 0],
        "monetary":    [500, 500, 900, 900, 100, 100, 300, 300],
    })
    labels, rates = train_module._assign_cluster_labels(panel)
    assert labels == {1: "At Risk", 0: "VIP Champions", 3: "Loyal Regulars", 2: "Lapsed"}
    assert rates["At Risk"] == 1.0 and rates["Lapsed"] == 0.5


def test_tc_ph9_seg_02_more_clusters_than_labels():
    """TC_PH9_SEG_02: k=5 > số nhãn mô tả -> cụm dư (hạng giá trị thứ 4) được đặt tên "Value Tier 4", không mất cụm nào."""
    panel = pd.DataFrame({"cluster": [0, 1, 2, 3, 4], "churn_label": [1, 0, 0, 0, 0],
                          "monetary": [1, 50, 40, 30, 20]})
    labels, _ = train_module._assign_cluster_labels(panel)
    assert len(labels) == 5 and labels[0] == "At Risk" and labels[4] == "Value Tier 4"


def test_tc_ph9_seg_03_contamination_guard():
    """TC_PH9_SEG_03: Panel churn>90% VÀ >50% user 'chết từ lâu' (trộn dữ liệu lệch mốc) -> chặn train bằng RuntimeError."""
    cutoffs = [pd.Timestamp("2026-01-01"), pd.Timestamp("2026-03-01")]
    bad = pd.DataFrame({"churn_label": [1] * 10, "recency": [2000] * 10})
    with pytest.raises(RuntimeError):
        train_module._assert_panel_not_contaminated(bad, cutoffs)
    ok = pd.DataFrame({"churn_label": [1, 0, 0, 1], "recency": [10, 20, 30, 2000]})
    train_module._assert_panel_not_contaminated(ok, cutoffs)  # không ném lỗi
