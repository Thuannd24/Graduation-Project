"""Sinh checkpoint SASRec CHO PHỤC VỤ, kèm kết quả đánh giá — cổng deploy tự động (plan GĐ4).

Trước đây `recsys_platform_sasrec.py` lưu checkpoint bất kể nó tốt hay dở, và recs-service nạp bất kỳ checkpoint
`platform_v1` nào. Script này:
  1. Chạy đúng protocol của harness (chia theo thời gian, track explore — đúng bài toán tab "Gợi ý cho bạn"),
     so SASRec (nhiều seed) với baseline tốt nhất.
  2. Quyết định CÓ QUA CỔNG không (xem `decide_gate`).
  3. Train lại trên TOÀN BỘ dữ liệu với số epoch đã chọn trên val, lưu checkpoint định dạng `platform_v1`
     kèm khối `eval`. recs-service đọc khối này: không qua cổng thì KHÔNG nạp (xem services/sasrec.py).

    python -m evaluation.train_serving --source platform --out ../models/sasrec.pt
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, replace
from datetime import datetime, timezone

import numpy as np
import torch

from evaluation.baselines import CategoryPop, Markov1, Popularity
from evaluation.data import load_platform_events
from evaluation.metrics import paired_delta
from evaluation.protocol import temporal_split
from evaluation.run import _git_sha, evaluate, run_sasrec, tune_itemknn
from evaluation.sasrec_trainer import SASRecConfig, SASRecRecommender

GATE_TRACK = "explore"  # tab "Gợi ý cho bạn" (source=for_you) là nơi tầng SASRec phục vụ


def decide_gate(sasrec_hr10_per_case, baselines: dict[str, list[float]], require_significant: bool = False) -> dict:
    """Qua cổng khi HR@10 trung bình của SASRec >= baseline tốt nhất (track explore). `require_significant`
    chặt hơn: phải thắng baseline tốt nhất có ý nghĩa thống kê (CI95 của chênh lệch ghép cặp > 0).

    Mặc định không đòi ý nghĩa thống kê: với dữ liệu nhỏ (vài trăm case) gần như không model nào qua được,
    và SASRec "ngang" baseline vẫn có lợi thế riêng (gợi ý được item ngoài lịch sử, ít thiên về món phổ biến).
    Khoảng tin cậy vẫn được lưu để người duyệt thấy rõ mức chắc chắn."""
    sasrec_mean = float(np.mean(sasrec_hr10_per_case)) if len(sasrec_hr10_per_case) else 0.0
    best_name = max(baselines, key=lambda n: np.mean(baselines[n]))
    delta = paired_delta(sasrec_hr10_per_case, baselines[best_name])
    passed = delta["significant"] and delta["delta"] > 0 if require_significant else sasrec_mean >= float(np.mean(baselines[best_name]))
    return {"track": GATE_TRACK, "metric": "HR@10", "rule": "significant_win" if require_significant else "mean_not_worse",
            "sasrec_hr10": sasrec_mean, "best_baseline": best_name, "best_baseline_hr10": float(np.mean(baselines[best_name])),
            "paired_delta": delta, "passed_gate": bool(passed)}


def full_sequences(df) -> tuple[dict[str, list[int]], dict[int, int]]:
    """Mọi tương tác tới hiện tại (không chia) — model phục vụ phải biết cả các item mới nhất."""
    item_index = {item: i for i, item in enumerate(sorted(df["item_id"].unique()))}
    seqs = {u: [item_index[i] for i in g["item_id"]] for u, g in df.groupby("user_id", sort=False)}
    return seqs, item_index


def save_serving_checkpoint(model: SASRecRecommender, item_index: dict[int, int], epochs: int, evaluation: dict, path: str):
    cfg = model.config
    if cfg.use_action:
        raise ValueError("Checkpoint phục vụ không được dùng use_action: recs-service chưa truyền loại hành vi vào model")
    torch.save({
        "model_state_dict": model.model.state_dict(),
        "epoch": epochs,
        "config": {"n_items": len(item_index), "d_model": cfg.d_model, "n_blocks": cfg.n_blocks,
                   "n_heads": cfg.n_heads, "maxlen": cfg.maxlen},
        "item_space": "platform_v1",
        "item_id_map": {int(k): int(v) for k, v in item_index.items()},  # product_id thật -> index nội bộ
        "eval": evaluation,
    }, path)


def main() -> None:
    ap = argparse.ArgumentParser(description="Train SASRec cho phục vụ + cổng đánh giá (GĐ4)")
    ap.add_argument("--source", choices=("platform",), default="platform")
    ap.add_argument("--out", required=True, help="đường dẫn checkpoint, vd ../models/sasrec.pt")
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--maxlen", type=int, default=SASRecConfig.maxlen)
    ap.add_argument("--n-negatives", type=int, default=SASRecConfig.n_negatives)
    ap.add_argument("--logq", action="store_true")
    ap.add_argument("--require-significant", action="store_true", help="cổng chặt: phải thắng có ý nghĩa thống kê")
    ap.add_argument("--save-even-if-failed", action="store_true",
                    help="vẫn ghi file khi không qua cổng (recs-service sẽ từ chối nạp nó)")
    args = ap.parse_args()

    config = replace(SASRecConfig(), maxlen=args.maxlen, n_negatives=args.n_negatives, logq=args.logq)
    df, raw_cat = load_platform_events()
    split = temporal_split(df)

    baselines = [Popularity(), Markov1()]  # Recency không áp dụng cho explore (chỉ trả món đã xem)
    if raw_cat:
        baselines.append(CategoryPop({idx: raw_cat.get(item) for item, idx in split.item_index.items()}))
    for b in baselines:
        b.fit(split.train_seqs, split.n_items)
    baselines.append(tune_itemknn(split))
    baseline_hr = {b.name: evaluate(b, split, GATE_TRACK)["_hr10"] for b in baselines}

    sasrec = run_sasrec(split, config, "SASRec", args.seeds)
    gate = decide_gate(sasrec["summary"][GATE_TRACK]["_hr10"], baseline_hr, args.require_significant)
    epochs = int(np.median([r["model"].best_epoch for r in sasrec["runs"]]))
    print(json.dumps({k: v for k, v in gate.items()}, indent=2, default=str))

    if not gate["passed_gate"] and not args.save_even_if_failed:
        print("KHONG qua cong danh gia -> khong ghi checkpoint (dung --save-even-if-failed de ghi de duyet)")
        return

    seqs, item_index = full_sequences(df)
    final = SASRecRecommender(replace(config, max_epochs=epochs), seed=0).fit(seqs, len(item_index))
    evaluation = {
        **gate, "generated_at": datetime.now(timezone.utc).isoformat(), "git_sha": _git_sha(),
        "config": asdict(config), "epochs_full_data": epochs, "data": split.stats,
        "seeds": args.seeds, "sasrec_per_seed_hr10": sasrec["summary"][GATE_TRACK]["per_seed"],
        "protocol": "evaluation.protocol.temporal_split (q_val=0.8, q_test=0.9), full-catalog ranking",
    }
    save_serving_checkpoint(final, item_index, epochs, evaluation, args.out)
    print(f"Da luu {args.out}: {len(item_index):,} item, {epochs} epoch tren toan bo du lieu, passed_gate={gate['passed_gate']}")


if __name__ == "__main__":
    main()
