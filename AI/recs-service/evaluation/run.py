"""Chạy toàn bộ protocol đánh giá: split theo thời gian -> tune baseline trên val -> SASRec nhiều seed ->
bảng kết quả 2 track (explore / repeat) + so sánh ghép cặp.

    python -m evaluation.run --source platform --seeds 3 --out eval_platform.json
    python -m evaluation.run --source csv --csv rees46.csv --user-col user_id --item-col product_id \
        --ts-col event_time --category-col category_id --seeds 3
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from datetime import datetime, timezone

import numpy as np

from evaluation.baselines import CategoryPop, ItemKNN, Markov1, Popularity, Recency
from evaluation.data import load_csv, load_platform_events
from evaluation.metrics import arp, bootstrap_ci, case_metrics, coverage, gini, paired_delta
from evaluation.protocol import temporal_split
from evaluation.sasrec_trainer import SASRecConfig, SASRecRecommender

TRACKS = ("explore", "repeat")
K = 20


def evaluate(model, split, track: str) -> dict:
    cases = split.cases("test", track)
    recs = model.recommend_many(cases, K, exclude_seen=(track == "explore"))
    per_case = [case_metrics(r, c.target) for r, c in zip(recs, cases)]
    hr10 = [m["HR@10"] for m in per_case]
    return {
        "n": len(cases),
        **{m: float(np.mean([p[m] for p in per_case])) if per_case else 0.0 for m in ("HR@10", "HR@20", "NDCG@10", "MRR@20")},
        "HR@10_ci95": bootstrap_ci(hr10),
        "Coverage@10": coverage(recs, split.n_items),
        "Gini@10": gini(recs, split.n_items),
        "ARP@10": arp(recs, model.popularity),
        "_hr10": hr10,
    }


def tune_itemknn(split) -> ItemKNN:
    """Chọn (window, n_last) theo NDCG@10 trên VAL track explore — không bao giờ nhìn tập test."""
    explore_val = split.cases("val", "explore")
    best, best_score = None, -1.0
    for window in (1, 3, 5):
        for n_last in (1, 3, 5):
            m = ItemKNN(window, n_last).fit(split.train_seqs, split.n_items)
            recs = m.recommend_many(explore_val, 10, exclude_seen=True)
            score = float(np.mean([case_metrics(r, c.target)["NDCG@10"] for r, c in zip(recs, explore_val)]))
            if score > best_score:
                best, best_score = m, score
    best.val_ndcg10 = round(best_score, 5)
    return best


def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return None


def _fmt(r: dict) -> str:
    lo, hi = r["HR@10_ci95"]
    return (f"{r['HR@10']:.4f} [{lo:.3f}–{hi:.3f}] | {r['HR@20']:.4f} | {r['NDCG@10']:.4f} | {r['MRR@20']:.4f} | "
            f"{r['Coverage@10']:.3f} | {r['Gini@10']:.3f} | {r['ARP@10']:.5f}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Harness đánh giá gợi ý (GĐ2)")
    ap.add_argument("--source", choices=("platform", "csv"), default="platform")
    ap.add_argument("--csv")
    ap.add_argument("--user-col", default="user_id")
    ap.add_argument("--item-col", default="item_id")
    ap.add_argument("--ts-col", default="ts")
    ap.add_argument("--category-col")
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--q-val", type=float, default=0.8)
    ap.add_argument("--q-test", type=float, default=0.9)
    ap.add_argument("--out", default="eval_result.json")
    args = ap.parse_args()

    t0 = time.time()
    if args.source == "platform":
        df, raw_cat = load_platform_events()
    else:
        df, raw_cat = load_csv(args.csv, args.user_col, args.item_col, args.ts_col, args.category_col)
    split = temporal_split(df, args.q_val, args.q_test)
    print("== Du lieu & protocol ==")
    print(json.dumps(split.stats, indent=2, ensure_ascii=False))

    models = [Popularity(), Recency(), Markov1()]
    if raw_cat:
        models.append(CategoryPop({idx: raw_cat.get(item) for item, idx in split.item_index.items()}))
    for m in models:
        m.fit(split.train_seqs, split.n_items)
    knn = tune_itemknn(split)
    models.append(knn)

    results = {m.name: {t: evaluate(m, split, t) for t in TRACKS} for m in models}

    sasrec_runs = []
    for seed in range(args.seeds):
        s = SASRecRecommender(SASRecConfig(), seed=seed).fit(split.train_seqs, split.n_items, split.val)
        sasrec_runs.append({"model": s, "results": {t: evaluate(s, split, t) for t in TRACKS}})
        print(f"SASRec seed={seed}: best_epoch={s.best_epoch} "
              + " ".join(f"{t} HR@10={sasrec_runs[-1]['results'][t]['HR@10']:.4f}" for t in TRACKS))

    # SASRec gộp seed: trung bình theo case (để so ghép cặp), std giữa seed = SÀN NHIỄU
    sasrec_summary = {}
    for t in TRACKS:
        per_seed = [r["results"][t]["HR@10"] for r in sasrec_runs]
        mean_case = np.mean([r["results"][t]["_hr10"] for r in sasrec_runs], axis=0)
        sasrec_summary[t] = {"HR@10_mean": float(np.mean(per_seed)), "HR@10_std_across_seeds": float(np.std(per_seed)),
                             "per_seed": per_seed, "_hr10": mean_case}

    comparisons = {}
    for t in TRACKS:
        for name, res in results.items():
            if res[t]["n"]:
                comparisons[f"{t}: SASRec(mean {args.seeds} seed) - {name}"] = paired_delta(sasrec_summary[t]["_hr10"], res[t]["_hr10"])

    # ---------- In bảng ----------
    header = "| Model | HR@10 [CI95] | HR@20 | NDCG@10 | MRR@20 | Cov@10 | Gini@10 | ARP@10 |\n|---|---|---|---|---|---|---|---|"
    for t in TRACKS:
        print(f"\n### Track {t} (n={split.cases('test', t).__len__()} case test)\n{header}")
        for name, res in results.items():
            print(f"| {name} | {_fmt(res[t])} |")
        for r in sasrec_runs:
            print(f"| {r['model'].name} | {_fmt(r['results'][t])} |")
        s = sasrec_summary[t]
        print(f"\nSASRec HR@10 = {s['HR@10_mean']:.4f} ± {s['HR@10_std_across_seeds']:.4f} (std giua {args.seeds} seed = san nhieu)")
    print("\n### So sanh ghep cap HR@10 (SASRec trung binh seed - baseline)")
    for k, v in comparisons.items():
        lo, hi = v["ci95"]
        print(f"- {k}: {v['delta']:+.4f} [{lo:+.4f}, {hi:+.4f}] {'CO y nghia' if v['significant'] else 'khong co y nghia'}")

    strip = lambda d: {k: v for k, v in d.items() if not k.startswith("_")}  # noqa: E731
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "git_sha": _git_sha(), "args": vars(args),
        "protocol": {"split": "global temporal", "q_val": args.q_val, "q_test": args.q_test, "ranking": "full catalog",
                     "explore": "target not in history, seen items excluded", "repeat": "target in history, nothing excluded"},
        "data": split.stats, "itemknn_tuned": {"name": knn.name, "val_ndcg10": knn.val_ndcg10},
        "results": {n: {t: strip(r[t]) for t in TRACKS} for n, r in results.items()},
        "sasrec": {"runs": [{**r["model"].describe(), "results": {t: strip(r["results"][t]) for t in TRACKS}} for r in sasrec_runs],
                   "summary": {t: strip(sasrec_summary[t]) for t in TRACKS}},
        "comparisons_hr10": comparisons, "runtime_s": round(time.time() - t0, 1),
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, default=str)
    print(f"\nDa luu {args.out} ({out['runtime_s']}s)")


if __name__ == "__main__":
    main()
