"""Cổng deploy (GĐ4): checkpoint mang kết quả đánh giá; recs-service chỉ nạp checkpoint qua cổng."""
import pytest

from app.core.config import recs_settings
from app.services.sasrec import SasRecService
from evaluation.sasrec_trainer import SASRecConfig, SASRecRecommender
from evaluation.train_serving import decide_gate, save_serving_checkpoint


def test_gate_mean_rule():
    base = {"ItemKNN": [1, 0, 0, 0], "Popularity": [0, 0, 0, 0]}  # ItemKNN = 0.25 là baseline tốt nhất
    assert decide_gate([1, 0, 0, 0], base)["passed_gate"]          # ngang -> qua (không tệ hơn)
    assert not decide_gate([0, 0, 0, 0], base)["passed_gate"]      # tệ hơn -> không qua
    assert decide_gate([0, 0, 0, 0], base)["best_baseline"] == "ItemKNN"


def test_gate_significant_rule_is_stricter():
    base = {"ItemKNN": [0] * 30}
    assert not decide_gate([1, 0] * 15, {"ItemKNN": [0, 1] * 15}, require_significant=True)["passed_gate"]
    assert decide_gate([1] * 30, base, require_significant=True)["passed_gate"]


@pytest.fixture
def tiny_model():
    seqs = {f"u{i}": [0, 1, 2, 3] * 3 for i in range(8)}
    return SASRecRecommender(SASRecConfig(max_epochs=1, batch_size=16), seed=0).fit(seqs, 4)


ITEMS = {100: 0, 101: 1, 102: 2, 103: 3}  # product_id thật -> index nội bộ


@pytest.mark.parametrize("evaluation,ready", [
    ({"passed_gate": True, "sasrec_hr10": 0.05, "best_baseline": "ItemKNN", "best_baseline_hr10": 0.03, "track": "explore"}, True),
    ({"passed_gate": False, "sasrec_hr10": 0.01, "best_baseline": "ItemKNN", "best_baseline_hr10": 0.03, "track": "explore"}, False),
    (None, True),  # checkpoint cũ chưa có khối eval: vẫn nạp (tương thích), chỉ cảnh báo
])
def test_service_respects_gate(tmp_path, monkeypatch, tiny_model, evaluation, ready):
    path = tmp_path / "sasrec.pt"
    save_serving_checkpoint(tiny_model, ITEMS, 1, evaluation, str(path))
    monkeypatch.setattr(recs_settings, "MODEL_WEIGHTS_PATH", str(path))
    svc = SasRecService()
    assert svc.is_ready() is ready
    assert svc.status["loaded"] is ready
    if ready:
        recs = svc.recommend([101, 100], top_k=2)  # newest-first như Redis
        assert len(recs) == 2 and {r["product_id"] for r in recs} <= {102, 103}
    else:
        assert "cong danh gia" in svc.status["reason"]


def test_serving_checkpoint_refuses_action_model(tmp_path):
    seqs = {f"u{i}": [0, 1, 2] * 2 for i in range(4)}
    acts = {u: [0, 1, 0] * 2 for u in seqs}
    m = SASRecRecommender(SASRecConfig(max_epochs=1, use_action=True), seed=0).fit(seqs, 3, train_actions=acts, n_actions=2)
    with pytest.raises(ValueError):
        save_serving_checkpoint(m, {1: 0, 2: 1, 3: 2}, 1, {"passed_gate": True}, str(tmp_path / "x.pt"))
