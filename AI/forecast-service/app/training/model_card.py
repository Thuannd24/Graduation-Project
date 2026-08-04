"""Model card (Tầng 5) — trả lời "model nào, version nào, train lúc nào, feature/nhãn gì, metric
bao nhiêu, giới hạn gì" bằng 1 endpoint, sinh tự động từ đúng những gì `registry.py` đã lưu.

Không dùng MLflow/công cụ MLOps ngoài — quá tay cho quy mô đồ án (đúng tinh thần đã chọn ở
`registry.py`). Đây chỉ là một lớp đọc + định dạng lại `metadata.json` / `run_log.jsonl` đã có sẵn,
KHÔNG train/tính toán gì mới — nên không có gì để "sai", chỉ có thể đọc thiếu.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from shared_common.config import shared_settings
from shared_common.registry import load_metadata

from app.training.train import MODEL_NAME_CLASSIFIER, MODEL_NAME_KMEANS

# Giới hạn đã biết, tĩnh — không suy ra được từ metadata (là kết luận định tính từ quá trình làm,
# không phải con số). Giữ NGẮN và trỏ về log để không lặp lại toàn bộ phân tích ở đây.
KNOWN_LIMITATIONS = [
    "Dữ liệu seed là tổng hợp (synthetic) — metric đo việc model có phục hồi được cấu trúc sinh dữ "
    "liệu hay không, không phải đo việc dự đoán đúng hành vi người thật.",
    "Chỉ áp dụng cho khách có ≥2 đơn DELIVERED (khớp dân số huấn luyện) — chấm điểm ngoài dân số này "
    "là ngoại suy.",
    "Mốc cắt lùi về ≥150 ngày (do cửa sổ nhãn 120 ngày) — model học từ dữ liệu 5–9 tháng trước.",
    "Mở rộng đặc trưng đã thử và không thành công (3 khối, kể cả đối chứng âm, đều không vượt sàn "
    "nhiễu) — xem docs/canvas/churn-risk-log.md mục Tầng 2.2/ablation.",
    "Hệ số Logistic Regression KHÔNG đọc được như độ quan trọng do đa cộng tuyến — dùng permutation "
    "importance trong `feature_importance` thay thế.",
    "Chưa có vòng phản hồi từ kết quả campaign (model không học từ việc voucher có hiệu quả hay "
    "không) — xem docs/canvas/churn-risk-roadmap.md Tầng 4.",
]

SEE_ALSO = [
    "docs/canvas/churn-risk-feature-overview.md — tính năng làm gì, AI dùng ở đâu",
    "docs/canvas/churn-risk-log.md — nhật ký đầy đủ, mọi số đo kèm bối cảnh",
    "docs/canvas/churn-risk-roadmap.md — việc tiếp theo, xếp theo thứ tự phụ thuộc",
]


def _run_log_entries(name: str) -> list[dict]:
    """Đọc lịch sử train của riêng 1 model từ `run_log.jsonl` — dùng để biết đã train bao nhiêu lần,
    không phải chỉ lần gần nhất. Ghép path giống hệt `registry._models_root()` nhưng qua config công
    khai (`shared_settings.MODELS_DIR`), không import hàm private xuyên module."""
    path = Path(shared_settings.MODELS_DIR) / "run_log.jsonl"
    if not path.exists():
        return []
    entries = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            if entry.get("name") == name:
                entries.append(entry)
    return entries


def _classifier_card() -> dict[str, Any]:
    try:
        meta = load_metadata(MODEL_NAME_CLASSIFIER)
    except FileNotFoundError:
        return {"status": "CHƯA TRAIN — gọi POST /api/v1/models/train"}

    metrics = meta.get("metrics", {})
    history = _run_log_entries(MODEL_NAME_CLASSIFIER)

    return {
        "version": meta.get("version"),
        "trained_at": meta.get("trained_at"),
        "feature_version": meta.get("feature_version"),
        "label_definition": metrics.get("label_definition"),
        "calibrated": metrics.get("calibrated"),
        "calibration_method": metrics.get("calibration_method"),
        "panel": {
            "rows": metrics.get("panel_rows"),
            "users": metrics.get("panel_users"),
            "cutoffs": metrics.get("cutoffs"),
            "churn_rate": metrics.get("churn_rate_overall"),
        },
        "grouped_cv": {
            "n_splits": metrics.get("n_splits"),
            "auc_mean": metrics.get("auc_mean"),
            "auc_std": metrics.get("auc_std"),
            "f1_mean": metrics.get("f1_mean"),
            "precision_mean": metrics.get("precision_mean"),
            "recall_mean": metrics.get("recall_mean"),
        },
        "threshold_suggested": (metrics.get("threshold_tuning") or {}).get("suggested_threshold"),
        "retrain_gate": metrics.get("retrain_gate"),
        "feature_importance_top5": (meta.get("extra") or {}).get("feature_importance", [])[:5],
        "total_training_runs": len(history),
        "note_optimistic_split": (
            "optimistic_user_overlap trong metadata là số ĐỐI CHIẾU (leakage cũ), KHÔNG dùng để "
            "đánh giá model — xem grouped_cv ở trên."
        ),
    }


def _segmentation_card() -> dict[str, Any]:
    try:
        meta = load_metadata(MODEL_NAME_KMEANS)
    except FileNotFoundError:
        return {"status": "CHƯA TRAIN — gọi POST /api/v1/models/train"}

    metrics = meta.get("metrics", {})
    extra = meta.get("extra") or {}

    return {
        "version": meta.get("version"),
        "trained_at": meta.get("trained_at"),
        "n_clusters": metrics.get("n_clusters"),
        "silhouette": metrics.get("silhouette"),
        "labeling_rule": metrics.get("labeling_rule"),
        "distribution": metrics.get("distribution"),
        "churn_rate_by_segment": metrics.get("churn_rate_by_segment"),
        "churn_rate_spread": metrics.get("churn_rate_spread"),
        "segment_gate_informative": metrics.get("segment_gate_informative"),
        "segment_profiles": extra.get("segment_profiles"),
    }


def build_model_card() -> dict[str, Any]:
    return {
        "generated_from": "shared_common/registry.py metadata + run_log.jsonl — không tính gì mới",
        "db_name": shared_settings.DB_NAME,
        "classifier": _classifier_card(),
        "segmentation": _segmentation_card(),
        "known_limitations": KNOWN_LIMITATIONS,
        "see_also": SEE_ALSO,
    }
