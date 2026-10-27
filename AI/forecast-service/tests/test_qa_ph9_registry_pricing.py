"""PH9 — Unit test registry lưu/nạp model, model card, retrain gate và validate request định giá động.
Registry ghi vào thư mục tạm (tmp_path), không đụng data/models thật.
"""
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app  # noqa: E402
from app.services.pricing import DynamicPricingService  # noqa: E402
from app.training import model_card  # noqa: E402
from app.training import train as train_module  # noqa: E402
from shared_common import registry  # noqa: E402
from shared_common.config import shared_settings  # noqa: E402


@pytest.fixture
def models_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(shared_settings, "MODELS_DIR", str(tmp_path / "models"))
    return tmp_path / "models"


# ─────────────────────────── Registry ───────────────────────────

def test_tc_ph9_reg_01_save_and_load_latest(models_dir):
    """TC_PH9_REG_01: save_model ghi artifact + metadata + con trỏ latest; load_model/load_metadata đọc lại đúng bản mới nhất."""
    v1 = registry.save_model("churn_classifier", {"w": 1}, feature_version="churn_v1", metrics={"auc_mean": 0.8})
    v2 = registry.save_model("churn_classifier", {"w": 2}, feature_version="churn_v1", metrics={"auc_mean": 0.85})
    assert v1 != v2  # độ phân giải micro-giây: 2 lần train liên tiếp không ghi đè nhau
    assert registry.load_model("churn_classifier") == {"w": 2}
    assert registry.load_model("churn_classifier", v1) == {"w": 1}
    meta = registry.load_metadata("churn_classifier")
    assert meta["version"] == v2 and meta["feature_version"] == "churn_v1" and meta["metrics"]["auc_mean"] == 0.85
    assert registry.has_model("churn_classifier") and not registry.has_model("churn_kmeans")


def test_tc_ph9_reg_02_rejected_run_keeps_production_pointer(models_dir):
    """TC_PH9_REG_02: update_latest=False (bị retrain-gate từ chối) -> vẫn lưu version + ghi run_log nhưng production giữ model cũ."""
    v1 = registry.save_model("churn_classifier", "old", feature_version="f", metrics={})
    v2 = registry.save_model("churn_classifier", "new", feature_version="f", metrics={}, update_latest=False)
    assert registry.load_model("churn_classifier") == "old"
    assert registry.load_model("churn_classifier", v2) == "new"
    lines = (models_dir / "run_log.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert [json.loads(x)["version"] for x in lines] == [v1, v2]


def test_tc_ph9_reg_03_missing_model_raises(models_dir):
    """TC_PH9_REG_03: Nạp model/metadata chưa từng lưu hoặc version không tồn tại -> FileNotFoundError rõ ràng."""
    with pytest.raises(FileNotFoundError):
        registry.load_model("churn_kmeans")
    with pytest.raises(FileNotFoundError):
        registry.load_metadata("churn_kmeans")
    registry.save_model("churn_kmeans", 1, feature_version="f", metrics={})
    with pytest.raises(FileNotFoundError):
        registry.load_model("churn_kmeans", "20000101T000000000000Z")


# ─────────────────────────── Model card ───────────────────────────

def test_tc_ph9_card_01_untrained(models_dir):
    """TC_PH9_CARD_01: Chưa train -> model card báo 'CHƯA TRAIN' cho cả classifier và segmentation, vẫn kèm giới hạn đã biết."""
    card = model_card.build_model_card()
    assert card["classifier"]["status"].startswith("CHƯA TRAIN")
    assert card["segmentation"]["status"].startswith("CHƯA TRAIN")
    assert len(card["known_limitations"]) >= 5


def test_tc_ph9_card_02_trained_fields_and_history(models_dir):
    """TC_PH9_CARD_02: Đã train -> card đọc version/metric/ngưỡng đề xuất từ metadata, đếm số lần train CHỈ của classifier, top-5 feature."""
    metrics = {"auc_mean": 0.84, "auc_std": 0.01, "n_splits": 5, "calibrated": True,
               "threshold_tuning": {"suggested_threshold": 0.26},
               "label_definition": {"label_version": "v2"}}
    importance = [{"feature": f"f{i}", "coef": i} for i in range(8)]
    registry.save_model(train_module.MODEL_NAME_CLASSIFIER, 1, feature_version="churn_v1", metrics=metrics)
    v = registry.save_model(train_module.MODEL_NAME_CLASSIFIER, 2, feature_version="churn_v1", metrics=metrics,
                            extra={"feature_importance": importance})
    registry.save_model(train_module.MODEL_NAME_KMEANS, 3, feature_version="churn_v1",
                        metrics={"n_clusters": 4, "silhouette": 0.31})
    card = model_card.build_model_card()
    c = card["classifier"]
    assert c["version"] == v and c["threshold_suggested"] == 0.26 and c["calibrated"] is True
    assert c["grouped_cv"]["auc_mean"] == 0.84 and c["total_training_runs"] == 2
    assert len(c["feature_importance_top5"]) == 5
    assert card["segmentation"]["n_clusters"] == 4


def test_tc_ph9_card_03_retrain_gate(monkeypatch):
    """TC_PH9_CARD_03: Retrain gate: chấp nhận khi AUC mới >= AUC cũ - std cũ; từ chối khi thấp hơn; bỏ qua gate khi đổi định nghĩa nhãn / chưa có model."""
    label = {"label_definition": {"label_version": "v2"}}
    monkeypatch.setattr(train_module, "load_metadata",
                        lambda name: {"metrics": dict(label, auc_mean=0.84, auc_std=0.02)})
    assert train_module._retrain_gate(dict(label, auc_mean=0.82))["passed"] is True     # đúng biên 0.82
    assert train_module._retrain_gate(dict(label, auc_mean=0.8199))["passed"] is False
    assert train_module._retrain_gate({"label_definition": {"label_version": "v3"}, "auc_mean": 0.5})["passed"] is True

    def missing(name):
        raise FileNotFoundError(name)

    monkeypatch.setattr(train_module, "load_metadata", missing)
    assert train_module._retrain_gate(dict(label, auc_mean=0.1))["passed"] is True


# ─────────────────────────── Định giá động ───────────────────────────

@pytest.mark.parametrize("tier,segment,cart,score,action", [
    ("REGULAR", "At Risk", 3_000_000, 0.90, "GIVE_HIGH_DISCOUNT"),
    ("vip", "VIP Champions", 5_000_000, 0.40, "GIVE_LOW_DISCOUNT"),   # tier không phân biệt hoa thường; biên 0.40
    ("GOLD", "Loyal Regulars", 100_000, 0.30, "NO_DISCOUNT"),
    ("SILVER", "New", 1_000_000, 0.60, "GIVE_LOW_DISCOUNT"),
])
def test_tc_ph9_price_01_sensitivity_rules(tier, segment, cart, score, action):
    """TC_PH9_PRICE_01: Điểm nhạy giá = 0.45 ± điều chỉnh theo hạng/phân khúc/giá trị giỏ; ngưỡng hành động 0.70 / 0.40."""
    out = DynamicPricingService().calculate_price_sensitivity(1, 2, tier, segment, cart)
    assert out == {"aiPriceScore": score, "recommendedAction": action}


def test_tc_ph9_price_02_endpoint_valid_request():
    """TC_PH9_PRICE_02: POST /pricing/predict với request hợp lệ -> 200, aiPriceScore trong [0,1]."""
    r = TestClient(app).post("/api/v1/pricing/predict", json={
        "userId": 7, "productId": 3, "customerTier": "GOLD", "segmentationLabel": "At Risk", "cartTotal": 2_500_000})
    assert r.status_code == 200
    body = r.json()
    assert body["recommendedAction"] == "GIVE_HIGH_DISCOUNT" and 0.0 <= body["aiPriceScore"] <= 1.0


@pytest.mark.parametrize("patch", [
    {"cartTotal": None}, {"userId": "abc"}, {"customerTier": None}, {"segmentationLabel": None},
])
def test_tc_ph9_price_03_endpoint_rejects_malformed(patch):
    """TC_PH9_PRICE_03: Thiếu field bắt buộc / sai kiểu (userId không phải số) -> 422."""
    body = {"userId": 7, "productId": 3, "customerTier": "GOLD", "segmentationLabel": "New", "cartTotal": 100.0}
    for k, v in patch.items():
        if v is None:
            body.pop(k)
        else:
            body[k] = v
    assert TestClient(app).post("/api/v1/pricing/predict", json=body).status_code == 422
