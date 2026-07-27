"""Lưu/nạp model artifact (KMeans/scaler/LogisticRegression...) + log lại mỗi lần train.

Trước module này, `rfm.py`/`anomaly.py` fit lại model MỖI REQUEST — với churn đây là lỗi thật:
refit mỗi giờ làm tâm cụm dịch, user "At Risk" giờ này có thể hết "At Risk" giờ sau chỉ vì
khởi tạo lại, không phải vì hành vi đổi. `registry.py` tách rời huấn luyện (chạy định kỳ, lưu
artifact) khỏi việc dùng model (chỉ load + predict, xem Phase 6).

Không dùng MLflow/công cụ MLOps ngoài — quá tay cho quy mô đồ án. Chỉ cần đủ để trả lời "model
nào, version nào, train lúc nào, feature gì, metric bao nhiêu" khi bảo vệ, bằng 1 file JSON +
1 file JSONL đơn giản.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib

from shared_common.config import shared_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)


def _models_root() -> Path:
    root = Path(shared_settings.MODELS_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_model(
    name: str,
    artifact: Any,
    *,
    feature_version: str,
    metrics: dict[str, Any],
    version: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Lưu `artifact` (joblib-serializable: sklearn model/scaler/dict chứa nhiều model...) xuống
    `{MODELS_DIR}/{name}/{version}/model.joblib`, ghi kèm metadata.json, cập nhật con trỏ
    `latest.json`, và append 1 dòng vào `run_log.jsonl` để tra cứu lịch sử train. Trả về version
    vừa lưu.
    """
    # %f (microsecond) bắt buộc phải có: 2 lần train liên tiếp trong cùng 1 giây (vd retry nhanh,
    # hoặc test) sẽ trùng version nếu chỉ có độ phân giải tới giây -> ghi đè mất bản cũ âm thầm.
    version = version or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    model_dir = _models_root() / name / version
    model_dir.mkdir(parents=True, exist_ok=True)

    artifact_path = model_dir / "model.joblib"
    joblib.dump(artifact, artifact_path)

    metadata = {
        "name": name,
        "version": version,
        "feature_version": feature_version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "extra": extra or {},
    }
    with open(model_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    latest_path = _models_root() / name / "latest.json"
    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump({"version": version}, f)

    run_log_path = _models_root() / "run_log.jsonl"
    with open(run_log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(metadata, ensure_ascii=False) + "\n")

    logger.info(f"Saved model name={name} version={version} feature_version={feature_version} metrics={metrics}")
    return version


def load_model(name: str, version: str = "latest") -> Any:
    """Nạp lại artifact đã lưu. `version='latest'` (mặc định) đọc theo con trỏ `latest.json`."""
    name_dir = _models_root() / name
    if version == "latest":
        latest_path = name_dir / "latest.json"
        if not latest_path.exists():
            raise FileNotFoundError(f"No model saved yet for '{name}' (missing {latest_path})")
        with open(latest_path, encoding="utf-8") as f:
            version = json.load(f)["version"]

    artifact_path = name_dir / version / "model.joblib"
    if not artifact_path.exists():
        raise FileNotFoundError(f"Model artifact not found: {artifact_path}")
    return joblib.load(artifact_path)


def load_metadata(name: str, version: str = "latest") -> dict[str, Any]:
    """Đọc metadata (feature_version, metrics, trained_at...) không cần load artifact nặng."""
    name_dir = _models_root() / name
    if version == "latest":
        latest_path = name_dir / "latest.json"
        if not latest_path.exists():
            raise FileNotFoundError(f"No model saved yet for '{name}' (missing {latest_path})")
        with open(latest_path, encoding="utf-8") as f:
            version = json.load(f)["version"]

    metadata_path = name_dir / version / "metadata.json"
    with open(metadata_path, encoding="utf-8") as f:
        return json.load(f)


def has_model(name: str) -> bool:
    return (_models_root() / name / "latest.json").exists()
