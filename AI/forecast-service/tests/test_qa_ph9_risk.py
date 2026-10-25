"""PH9 — Unit test risk-scan (ngưỡng, điều kiện đủ, ngân sách), ngưỡng hiệu dụng và output phân khúc admin.
Model, feature store, DB và Kafka đều được mock: không train, không đọc DB, không publish lên topic thật.
"""
import asyncio
import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.endpoints import forecast as fc  # noqa: E402
from app.core.config import forecast_settings  # noqa: E402
from app.services import risk_scheduler as rs  # noqa: E402
from app.services import risk_scoring as rsc  # noqa: E402
from app.services.risk_scoring import ModelNotTrainedError  # noqa: E402


def _scored():
    rows = [
        # user, frequency, segment, p(churn), monetary, có bỏ giỏ gần đây
        ("u1", 3, "At Risk", 0.90, 1_000_000, True),
        ("u2", 5, "At Risk", 0.60, 10_000_000, True),
        ("u3", 1, "At Risk", 0.95, 50_000_000, True),    # ngoài dân số (<2 đơn DELIVERED)
        ("u4", 4, "Loyal Regulars", 0.90, 8_000_000, True),  # sai phân khúc
        ("u5", 2, "At Risk", 0.30, 2_000_000, True),     # đúng bằng ngưỡng 0.30 -> đạt
        ("u6", 2, "At Risk", 0.29, 9_000_000, True),     # dưới ngưỡng
        ("u7", 3, "At Risk", 0.80, 5_000_000, False),    # không bỏ giỏ gần đây
    ]
    df = pd.DataFrame(rows, columns=["user_id", "frequency", "segment", "churn_probability", "monetary", "abandon"])
    df = df.set_index("user_id")
    df["expected_loss"] = df["churn_probability"] * df["monetary"]
    df["days_since_last_activity"] = 5.0
    df["cart_abandon_count"] = 1.0
    return df


@pytest.fixture
def scan(monkeypatch):
    df = _scored()
    abandoned = set(df.index[df["abandon"]])
    checked = []
    monkeypatch.setattr(rs.feature_store, "refresh", lambda engine: 0)
    monkeypatch.setattr(rs, "get_engine", lambda name: object())
    monkeypatch.setattr(rs.risk_scoring_service, "predict", lambda as_of=None: df.drop(columns=["abandon"]))
    monkeypatch.setattr(rs, "effective_threshold", lambda: (0.30, True))

    def fake_abandon(engine, user_id, within_hours):
        checked.append((user_id, within_hours))
        return user_id in abandoned

    monkeypatch.setattr(rs, "has_recent_abandoned_cart", fake_abandon)
    monkeypatch.setattr(forecast_settings, "RISK_MAX_VOUCHERS_PER_SCAN", 2)
    return checked


class FakeRiskProducer:
    def __init__(self):
        self.events = []

    async def publish_churn_risk(self, user_id, segment, extra):
        self.events.append((user_id, segment, extra))


# ─────────────────────────── Risk scan ───────────────────────────

def test_tc_ph9_risk_01_funnel_counts(scan):
    """TC_PH9_RISK_01: Phễu lọc: chấm 7 -> dân số hợp lệ 6 (>=2 đơn) -> At Risk & P>=ngưỡng 4 -> có bỏ giỏ 3."""
    out = rs.RiskScheduler(FakeRiskProducer())._compute_selection()
    assert out["status"] == "SUCCESS"
    assert (out["scored_users"], out["in_population"], out["at_risk_candidates"], out["eligible"]) == (7, 6, 4, 3)


def test_tc_ph9_risk_02_threshold_boundary_and_segment(scan):
    """TC_PH9_RISK_02: P đúng bằng ngưỡng (0.30) được giữ, 0.29 bị loại; phân khúc khác 'At Risk' bị loại dù P cao."""
    rs.RiskScheduler(FakeRiskProducer())._compute_selection()
    checked_users = {u for u, _ in scan}
    assert "u5" in checked_users and "u6" not in checked_users and "u4" not in checked_users and "u3" not in checked_users


def test_tc_ph9_risk_03_rank_by_expected_loss_then_budget(scan):
    """TC_PH9_RISK_03: Lọc đủ điều kiện TRƯỚC rồi xếp theo tổn thất kỳ vọng và cắt ngân sách 2 -> [u2, u1] (u7 không bỏ giỏ không chiếm suất)."""
    out = rs.RiskScheduler(FakeRiskProducer())._compute_selection()
    assert list(out["selected"].index) == ["u2", "u1"]
    assert out["ranked_count"] == 3 and out["budget"] == 2


def test_tc_ph9_risk_04_zero_budget_means_unlimited(scan, monkeypatch):
    """TC_PH9_RISK_04: RISK_MAX_VOUCHERS_PER_SCAN=0 -> không giới hạn, chọn cả 3 người đủ điều kiện theo thứ hạng."""
    monkeypatch.setattr(forecast_settings, "RISK_MAX_VOUCHERS_PER_SCAN", 0)
    out = rs.RiskScheduler(FakeRiskProducer())._compute_selection()
    assert list(out["selected"].index) == ["u2", "u1", "u5"]


def test_tc_ph9_risk_05_abandon_window_from_config(scan, monkeypatch):
    """TC_PH9_RISK_05: Rule thời điểm dùng đúng cửa sổ RISK_ABANDON_GRACE_HOURS cấu hình."""
    monkeypatch.setattr(forecast_settings, "RISK_ABANDON_GRACE_HOURS", 48)
    rs.RiskScheduler(FakeRiskProducer())._compute_selection()
    assert scan and all(h == 48 for _, h in scan)


def test_tc_ph9_risk_06_not_trained_is_skipped(monkeypatch):
    """TC_PH9_RISK_06: Chưa train model -> run_risk_scan trả SKIPPED kèm lý do, không publish gì."""
    monkeypatch.setattr(rs.feature_store, "refresh", lambda engine: 0)
    monkeypatch.setattr(rs, "get_engine", lambda name: object())

    def not_trained(as_of=None):
        raise ModelNotTrainedError("Chưa có model nào được train")

    monkeypatch.setattr(rs.risk_scoring_service, "predict", not_trained)
    prod = FakeRiskProducer()
    out = asyncio.run(rs.RiskScheduler(prod).run_risk_scan())
    assert out["status"] == "SKIPPED" and "train" in out["reason"]
    assert prod.events == []


def test_tc_ph9_risk_07_empty_population(monkeypatch):
    """TC_PH9_RISK_07: Không có user nào được chấm điểm -> SUCCESS, published=0."""
    monkeypatch.setattr(rs.feature_store, "refresh", lambda engine: 0)
    monkeypatch.setattr(rs, "get_engine", lambda name: object())
    monkeypatch.setattr(rs.risk_scoring_service, "predict", lambda as_of=None: pd.DataFrame())
    out = asyncio.run(rs.RiskScheduler(FakeRiskProducer()).run_risk_scan())
    assert out == {"status": "SUCCESS", "scored_users": 0, "in_population": 0, "at_risk_candidates": 0,
                   "eligible": 0, "published": 0}


def test_tc_ph9_risk_08_publish_payload_and_rank(scan):
    """TC_PH9_RISK_08: Publish đúng N người được chọn, kèm riskRank 1..N, expectedLoss/monetary/churnProbability; báo số bị cắt do ngân sách."""
    prod = FakeRiskProducer()
    out = asyncio.run(rs.RiskScheduler(prod).run_risk_scan())
    assert out["published"] == 2 and out["skipped_by_budget"] == 1 and out["threshold_used"] == 0.30
    assert [(u, s) for u, s, _ in prod.events] == [("u2", "At Risk"), ("u1", "At Risk")]
    first = prod.events[0][2]
    assert first["riskRank"] == 1 and first["expectedLoss"] == pytest.approx(6_000_000)
    assert first["monetary"] == 10_000_000 and first["churnProbability"] == pytest.approx(0.60)


# ─────────────────────────── Ngưỡng hiệu dụng ───────────────────────────

def test_tc_ph9_thr_01_uncalibrated_model_uses_legacy(monkeypatch):
    """TC_PH9_THR_01: Model chưa hiệu chỉnh (thiếu cờ calibrated) -> lùi về ngưỡng legacy 0.5, kể cả khi có override."""
    monkeypatch.setattr(rsc, "load_model", lambda name: {"model": object()})
    monkeypatch.setattr(forecast_settings, "RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE", 0.1)
    assert rsc.effective_threshold() == (forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD_LEGACY, False)


def test_tc_ph9_thr_02_override_then_metadata(monkeypatch):
    """TC_PH9_THR_02: Model đã hiệu chỉnh: có override -> dùng override; không override -> đọc suggested_threshold trong metadata."""
    monkeypatch.setattr(rsc, "load_model", lambda name: {"calibrated": True})
    monkeypatch.setattr(rsc, "load_metadata",
                        lambda name: {"metrics": {"threshold_tuning": {"suggested_threshold": 0.26}}})
    monkeypatch.setattr(forecast_settings, "RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE", 0.4)
    assert rsc.effective_threshold() == (0.4, True)
    monkeypatch.setattr(forecast_settings, "RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE", None)
    assert rsc.effective_threshold() == (0.26, True)


def test_tc_ph9_thr_03_fallbacks(monkeypatch):
    """TC_PH9_THR_03: Metadata thiếu khoá -> ngưỡng cấu hình mặc định; chưa có model -> ngưỡng cấu hình, calibrated=False."""
    monkeypatch.setattr(forecast_settings, "RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE", None)
    monkeypatch.setattr(rsc, "load_model", lambda name: {"calibrated": True})
    monkeypatch.setattr(rsc, "load_metadata", lambda name: {"metrics": {}})
    assert rsc.effective_threshold() == (forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD, True)

    def missing(name):
        raise FileNotFoundError(name)

    monkeypatch.setattr(rsc, "load_model", missing)
    assert rsc.effective_threshold() == (forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD, False)


def test_tc_ph9_thr_04_predict_requires_trained_model(monkeypatch):
    """TC_PH9_THR_04: predict() khi chưa có artifact KMeans/classifier -> ModelNotTrainedError (không trả kết quả giả)."""
    monkeypatch.setattr(rsc, "has_model", lambda name: False)
    with pytest.raises(ModelNotTrainedError):
        rsc.RiskScoringService().predict()


# ─────────────────────────── Output phân khúc (admin) ───────────────────────────

def test_tc_ph9_seg_04_segmentation_distribution(monkeypatch):
    """TC_PH9_SEG_04: /admin/analytics/segmentation chỉ tính dân số >=2 đơn, % theo số user, spendRatio theo monetary, màu theo phân khúc, sắp giảm dần."""
    df = pd.DataFrame({
        "frequency": [2, 3, 5, 1, 4],
        "segment": ["At Risk", "At Risk", "VIP Champions", "VIP Champions", "Lapsed"],
        "monetary": [100.0, 100.0, 600.0, 9999.0, 200.0],
    }, index=["a", "b", "c", "d", "e"])
    monkeypatch.setattr(fc.risk_scoring_service, "predict", lambda as_of=None: df)
    monkeypatch.setattr(fc, "get_engine", lambda name: object())
    monkeypatch.setattr(fc.feature_store, "last_computed_at", lambda engine: pd.Timestamp("2026-10-17 08:00:00"))
    out = fc.get_admin_segmentation()
    assert out["is_demo_data"] is False and out["computed_at"] == "2026-10-17T08:00:00"
    rows = {r["segment"]: r for r in out["data"]}
    assert out["data"][0]["segment"] == "At Risk"
    assert rows["At Risk"]["count"] == 2 and rows["At Risk"]["percentage"] == 50.0
    assert rows["VIP Champions"]["spendRatio"] == 60.0 and rows["VIP Champions"]["color"] == "#10b981"
    assert sum(r["count"] for r in out["data"]) == 4  # user 'd' (1 đơn) bị loại


def test_tc_ph9_seg_05_segmentation_without_model(monkeypatch):
    """TC_PH9_SEG_05: Chưa train -> trả data rỗng + ghi chú, is_demo_data=False (không bịa số)."""
    def not_trained(as_of=None):
        raise ModelNotTrainedError("chưa train")

    monkeypatch.setattr(fc.risk_scoring_service, "predict", not_trained)
    out = fc.get_admin_segmentation()
    assert out["data"] == [] and out["is_demo_data"] is False and "train" in out["note"]


def test_tc_ph9_seg_06_demo_endpoints_flagged():
    """TC_PH9_SEG_06: Demand-forecasting và anomalies vẫn là dữ liệu minh hoạ -> luôn gắn cờ is_demo_data=True + note."""
    d = fc.get_admin_demand_forecasting()
    a = fc.get_admin_anomalies()
    assert d["is_demo_data"] is True and d["note"] and len(d["data"]["dates"]) == 10
    assert a["is_demo_data"] is True and a["note"]
