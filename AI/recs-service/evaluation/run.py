"""Chạy toàn bộ protocol đánh giá: split theo thời gian -> tune baseline trên val -> SASRec nhiều seed ->
bảng kết quả 2 track (explore / repeat) + so sánh ghép cặp.

    python -m evaluation.run --source platform --seeds 3 --out eval_platform.json
    # REES46 Cosmetics (5 file theo tháng, có tiêu đề, thời gian dạng chuỗi UTC)
    python -m evaluation.run --source csv --csv "data/2019-*.csv,data/2020-*.csv" --user-col user_id \
        --item-col product_id --ts-col event_time --category-col category_id --action-col event_type --seeds 3 --ablation
    # Taobao UserBehavior (không tiêu đề, unix giây), lấy mẫu 10% user cho vừa CPU
    python -m evaluation.run --source csv --csv UserBehavior.csv --names user,item,category,behavior,ts \
        --user-col user --item-col item --ts-col ts --ts-unit s --category-col category --action-col behavior \
        --user-fraction 0.1 --seeds 3 --ablation

`--ablation` (GĐ3) chạy cả thang cấu hình SASRec (ABLATION_LADDER) thay vì một cấu hình.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import replace
from datetime import datetime, timezone

import numpy as np

from evaluation.baselines import CategoryPop, ItemKNN, Markov1, Popularity, Recency
from evaluation.data import load_csv, load_platform_events
from evaluation.metrics import arp, bootstrap_ci, case_metrics, coverage, gini, paired_delta
from evaluation.protocol import temporal_split
from evaluation.sasrec_trainer import SASRecConfig, SASRecRecommender

TRACKS = ("explore", "repeat")
K = 20

# Thang ablation GĐ3: mỗi bậc CHỒNG lên bậc trước, đổi đúng 1 yếu tố, để đo riêng tác dụng từng yếu tố.
# Hai bậc cuối cần dữ liệu có cột action; "(shuffled)" là đối chứng âm cho "+action".
_BASE = SASRecConfig()
ABLATION_LADDER = [
    ("base", _BASE),
    ("+neg256", replace(_BASE, n_negatives=256)),
    ("+logQ", replace(_BASE, n_negatives=256, logq=True)),
    ("+maxlen50", replace(_BASE, n_negatives=256, logq=True, maxlen=50)),
    ("+action", replace(_BASE, n_negatives=256, logq=True, maxlen=50, use_action=True)),
    ("+action(shuffled)", replace(_BASE, n_negatives=256, logq=True, maxlen=50, use_action=True, shuffle_actions=True)),
]


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


def run_sasrec(split, config: SASRecConfig, label: str, seeds: int) -> dict:
    """Train `seeds` lần; trả kết quả từng seed + gộp: trung bình theo CASE (để so ghép cặp) và std giữa
    các seed = SÀN NHIỄU — chênh lệch nhỏ hơn mức này thì không được nói là cải thiện."""
    runs = []
    for seed in range(seeds):
        s = SASRecRecommender(config, seed=seed, label=label).fit(
            split.train_seqs, split.n_items, split.val, split.train_actions, split.n_actions)
        runs.append({"model": s, "results": {t: evaluate(s, split, t) for t in TRACKS}})
        print(f"{s.name}: best_epoch={s.best_epoch} "
              + " ".join(f"{t} HR@10={runs[-1]['results'][t]['HR@10']:.4f}" for t in TRACKS), flush=True)
    summary = {}
    for t in TRACKS:
        per_seed = [r["results"][t]["HR@10"] for r in runs]
        summary[t] = {"HR@10_mean": float(np.mean(per_seed)), "HR@10_std_across_seeds": float(np.std(per_seed)),
                      "per_seed": per_seed, "_hr10": np.mean([r["results"][t]["_hr10"] for r in runs], axis=0)}
    return {"label": label, "runs": runs, "summary": summary}


def _git_sha() -> str | None:
    """Commit tạo ra kết quả; thêm '-dirty' khi working tree có thay đổi chưa commit — để không ai tưởng
    kết quả đến từ đúng code của commit đó."""
    try:
        sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
        dirty = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], text=True).strip()
        return f"{sha}-dirty" if dirty else sha
    except Exception:
        return None


def _fmt(r: dict) -> str:
    lo, hi = r["HR@10_ci95"]
    return (f"{r['HR@10']:.4f} [{lo:.3f}–{hi:.3f}] | {r['HR@20']:.4f} | {r['NDCG@10']:.4f} | {r['MRR@20']:.4f} | "
            f"{r['Coverage@10']:.3f} | {r['Gini@10']:.3f} | {r['ARP@10']:.5f}")


def _print_delta(name: str, d: dict) -> None:
    lo, hi = d["ci95"]
    print(f"- {name}: {d['delta']:+.4f} [{lo:+.4f}, {hi:+.4f}] {'CO y nghia' if d['significant'] else 'khong co y nghia'}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Harness đánh giá gợi ý (GĐ2/GĐ3)")
    ap.add_argument("--source", choices=("platform", "csv"), default="platform")
    ap.add_argument("--csv")
    ap.add_argument("--user-col", default="user_id")
    ap.add_argument("--item-col", default="item_id")
    ap.add_argument("--ts-col", default="ts")
    ap.add_argument("--category-col")
    ap.add_argument("--action-col")
    ap.add_argument("--names", help="file không có tiêu đề: tên cột theo thứ tự, ngăn bằng dấu phẩy")
    ap.add_argument("--ts-unit", choices=("s", "ms"), help="thời gian là unix timestamp")
    ap.add_argument("--keep-actions", help="chỉ giữ các loại hành vi này, ngăn bằng dấu phẩy")
    ap.add_argument("--user-fraction", type=float, default=1.0, help="lấy mẫu ổn định một phần user (0..1]")
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--q-val", type=float, default=0.8)
    ap.add_argument("--q-test", type=float, default=0.9)
    ap.add_argument("--ablation", action="store_true", help="chạy cả thang cấu hình SASRec (GĐ3)")
    ap.add_argument("--patience", type=int, help="ghi đè patience cho mọi cấu hình (mặc định 3)")
    ap.add_argument("--max-epochs", type=int, help="ghi đè max_epochs cho mọi cấu hình (mặc định 30)")
    ap.add_argument("--out", default="eval_result.json")
    args = ap.parse_args()

    t0 = time.time()
    if args.source == "platform":
        df, raw_cat = load_platform_events()
    else:
        split_list = lambda s: [x.strip() for x in s.split(",")] if s else None  # noqa: E731
        df, raw_cat = load_csv(args.csv, args.user_col, args.item_col, args.ts_col, args.category_col, args.action_col,
                               names=split_list(args.names), ts_unit=args.ts_unit,
                               keep_actions=split_list(args.keep_actions), user_fraction=args.user_fraction)
    split = temporal_split(df, args.q_val, args.q_test)
    print("== Du lieu & protocol ==")
    print(json.dumps(split.stats, indent=2, ensure_ascii=False), flush=True)

    models = [Popularity(), Recency(), Markov1()]
    if raw_cat:
        models.append(CategoryPop({idx: raw_cat.get(item) for item, idx in split.item_index.items()}))
    for m in models:
        m.fit(split.train_seqs, split.n_items)
    knn = tune_itemknn(split)
    models.append(knn)
    results = {m.name: {t: evaluate(m, split, t) for t in TRACKS} for m in models}

    ladder = ABLATION_LADDER if args.ablation else [("SASRec", _BASE)]
    # Val nhỏ thì NDCG@10 nhiễu, patience 3 có thể dừng ngay epoch 2 (đo được trên platform: +action seed=1).
    # Nới cho MỌI bậc như nhau để so sánh vẫn công bằng.
    overrides = {k: v for k, v in (("patience", args.patience), ("max_epochs", args.max_epochs)) if v is not None}
    ladder = [(label, replace(cfg, **overrides)) for label, cfg in ladder]
    if args.ablation and not split.n_actions:
        print("! Du lieu khong co cot action -> bo 2 bac '+action' cua thang ablation")
        ladder = [step for step in ladder if not step[1].use_action]
    sasrec = [run_sasrec(split, cfg, label, args.seeds) for label, cfg in ladder]

    # ---------- So sánh ghép cặp (HR@10, SASRec gộp seed theo case) ----------
    comparisons = {}
    for t in TRACKS:
        main_run = sasrec[0]
        for name, res in results.items():
            if res[t]["n"]:
                comparisons[f"{t}: {main_run['label']} - {name}"] = paired_delta(main_run["summary"][t]["_hr10"], res[t]["_hr10"])
        for prev, cur in zip(sasrec, sasrec[1:]):
            if cur["label"] == "+action(shuffled)":
                continue
            comparisons[f"{t}: {cur['label']} - {prev['label']}"] = paired_delta(cur["summary"][t]["_hr10"], prev["summary"][t]["_hr10"])
        by_label = {r["label"]: r for r in sasrec}
        if "+action" in by_label and "+action(shuffled)" in by_label:
            # PHÉP ĐO TRUNG TÂM: loại hành vi có mang thông tin không
            comparisons[f"{t}: +action - +action(shuffled) [doi chung am]"] = paired_delta(
                by_label["+action"]["summary"][t]["_hr10"], by_label["+action(shuffled)"]["summary"][t]["_hr10"])

    # ---------- In bảng ----------
    header = "| Model | HR@10 [CI95] | HR@20 | NDCG@10 | MRR@20 | Cov@10 | Gini@10 | ARP@10 |\n|---|---|---|---|---|---|---|---|"
    for t in TRACKS:
        print(f"\n### Track {t} (n={len(split.cases('test', t))} case test)\n{header}")
        for name, res in results.items():
            print(f"| {name} | {_fmt(res[t])} |")
        for run in sasrec:
            for r in run["runs"]:
                print(f"| {r['model'].name} | {_fmt(r['results'][t])} |")
        print()
        for run in sasrec:
            s = run["summary"][t]
            print(f"{run['label']}: HR@10 = {s['HR@10_mean']:.4f} ± {s['HR@10_std_across_seeds']:.4f} (std giua {args.seeds} seed)")
    print("\n### So sanh ghep cap HR@10")
    for k, v in comparisons.items():
        _print_delta(k, v)

    strip = lambda d: {k: v for k, v in d.items() if not k.startswith("_")}  # noqa: E731
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "git_sha": _git_sha(), "args": vars(args),
        "protocol": {"split": "global temporal", "q_val": args.q_val, "q_test": args.q_test, "ranking": "full catalog",
                     "explore": "target not in history, seen items excluded", "repeat": "target in history, nothing excluded"},
        "data": split.stats, "itemknn_tuned": {"name": knn.name, "val_ndcg10": knn.val_ndcg10},
        "results": {n: {t: strip(r[t]) for t in TRACKS} for n, r in results.items()},
        "sasrec": [{"label": run["label"],
                    "runs": [{**r["model"].describe(), "results": {t: strip(r["results"][t]) for t in TRACKS}} for r in run["runs"]],
                    "summary": {t: strip(run["summary"][t]) for t in TRACKS}} for run in sasrec],
        "comparisons_hr10": comparisons, "runtime_s": round(time.time() - t0, 1),
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, default=str)
    print(f"\nDa luu {args.out} ({out['runtime_s']}s)")


if __name__ == "__main__":
    main()
