"""
Đánh giá chất lượng search-service trên catalog thật (số liệu dùng cho báo cáo).

TEXT (in-process — so sánh 3 chế độ BM25 / Dense e5 / Hybrid RRF):
  - name     : truy vấn = tên sản phẩm viết thường
  - short    : tên rút gọn (bỏ dung lượng/RAM, 4 từ đầu) — kiểu người dùng hay gõ
  - no-accent: tên rút gọn bỏ dấu tiếng Việt
  - intent   : truy vấn nhu cầu viết tay có nhãn danh mục (CategoryP@10)

Chạy trong container (sau khi đã build_index):
    docker exec -it ai-search-service python scripts/evaluate.py --samples 200
"""
import argparse
import json
import os
import random
import re
import statistics
import sys
import time
import unicodedata
from typing import Dict, List, Sequence

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import catalog  # noqa: E402

# Truy vấn nhu cầu → các danh mục được coi là đúng
INTENT_QUERIES = [
    ("điện thoại samsung", {"Samsung"}),
    ("samsung galaxy màn hình lớn", {"Samsung", "Máy tính bảng"}),
    ("iphone mới nhất", {"iPhone"}),
    ("điện thoại apple", {"iPhone"}),
    ("điện thoại xiaomi giá rẻ", {"Xiaomi"}),
    ("oppo reno chụp ảnh đẹp", {"OPPO"}),
    ("điện thoại pin trâu", {"Samsung", "Xiaomi", "OPPO", "iPhone", "Điện thoại, Tablet"}),
    ("máy tính bảng học online", {"Máy tính bảng"}),
    ("ipad", {"Máy tính bảng"}),
    ("laptop văn phòng mỏng nhẹ", {"Laptop"}),
    ("laptop gaming card rời", {"Laptop"}),
    ("macbook", {"Laptop"}),
    ("máy tính để bàn", {"PC, Máy tính để bàn"}),
    ("pc chơi game", {"PC, Máy tính để bàn"}),
    ("màn hình máy tính", {"PC, Màn hình, Máy in", "PC, Máy tính để bàn"}),
    ("tivi 4k", {"Tivi"}),
    ("smart tv 55 inch", {"Tivi"}),
    ("tai nghe bluetooth", {"Tai nghe", "Âm thanh, Mic thu âm"}),
    ("tai nghe chống ồn", {"Tai nghe", "Âm thanh, Mic thu âm"}),
    ("loa bluetooth", {"Loa", "Âm thanh, Mic thu âm"}),
    ("sạc dự phòng", {"Pin dự phòng"}),
    ("pin sạc dự phòng 20000mah", {"Pin dự phòng"}),
    ("cáp sạc nhanh", {"Sạc & Cáp"}),
    ("củ sạc type c", {"Sạc & Cáp"}),
    ("máy ảnh", {"Máy ảnh, Máy quay"}),
    ("camera hành trình", {"Máy ảnh, Máy quay", "Đồng hồ, Camera"}),
    ("đồng hồ thông minh", {"Đồng hồ, Camera"}),
]

_SPEC_RE = re.compile(r"\b\d+\s*(gb|tb|mb)\b|\b\d+g\b|\b5g\b|\b4g\b|\blte\b|\bwifi\b|\|.*$", re.IGNORECASE)


def family_key(name: str) -> str:
    """'Samsung Galaxy S26 Ultra 5G 12GB 256GB' → 'samsung galaxy s26 ultra' (bỏ RAM/dung lượng/mạng)."""
    s = _SPEC_RE.sub(" ", name.lower())
    return re.sub(r"\s+", " ", s).strip()


def strip_accents(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D")


def percentile(values: Sequence[float], p: float) -> float:
    if not values:
        return 0.0
    v = sorted(values)
    return v[min(len(v) - 1, int(round(p / 100 * (len(v) - 1))))]


class Metrics:
    def __init__(self, name: str):
        self.name = name
        self.rows: List[Dict] = []

    def add(self, ranked_ids: List[int], target: int, products: Dict[int, Dict], latency_ms: float = 0.0):
        tgt = products[target]
        fam = family_key(tgt["name"])
        rank = ranked_ids.index(target) + 1 if target in ranked_ids else None
        fam_rank = next(
            (i + 1 for i, pid in enumerate(ranked_ids) if pid in products and family_key(products[pid]["name"]) == fam),
            None,
        )
        top5 = [pid for pid in ranked_ids[:5] if pid in products]
        cat_p5 = sum(products[pid]["category"] == tgt["category"] for pid in top5) / 5
        self.rows.append({"rank": rank, "fam_rank": fam_rank, "cat_p5": cat_p5, "latency": latency_ms})

    def summary(self) -> Dict:
        n = len(self.rows)
        if n == 0:
            return {"name": self.name, "n": 0}

        def hit(key, k):
            return sum(1 for r in self.rows if r[key] is not None and r[key] <= k) / n

        lat = [r["latency"] for r in self.rows if r["latency"]]
        return {
            "name": self.name,
            "n": n,
            "hit@1": hit("rank", 1), "hit@5": hit("rank", 5), "hit@10": hit("rank", 10),
            "fam@1": hit("fam_rank", 1), "fam@5": hit("fam_rank", 5),
            "mrr": sum(1 / r["rank"] for r in self.rows if r["rank"]) / n,
            "cat_p5": statistics.mean(r["cat_p5"] for r in self.rows),
            "p50_ms": percentile(lat, 50), "p95_ms": percentile(lat, 95),
        }


def fmt(s: Dict) -> str:
    if not s.get("n"):
        return f"  {s['name']:<22} (không có mẫu)"
    line = (
        f"  {s['name']:<22} n={s['n']:<4} Hit@1={s['hit@1']:.1%} Hit@5={s['hit@5']:.1%} Hit@10={s['hit@10']:.1%} "
        f"Fam@1={s['fam@1']:.1%} Fam@5={s['fam@5']:.1%} MRR={s['mrr']:.3f} CatP@5={s['cat_p5']:.1%}"
    )
    if s.get("p50_ms"):
        line += f"  p50={s['p50_ms']:.0f}ms p95={s['p95_ms']:.0f}ms"
    return line


# ── Text ─────────────────────────────────────────────────────────────────────

def eval_text(products: Dict[int, Dict], samples: int, rng: random.Random):
    from app.services.hybrid_search import hybrid_search_service
    from app.services.text_search import text_search_service

    text_ready = text_search_service.store.load()
    modes = {"bm25": lambda q: [h["id"] for h in catalog.bm25_search(q, size=10)]}
    if text_ready:
        modes["dense"] = lambda q: [h["id"] for h in text_search_service.search(q, top_k=10)]
    modes["hybrid"] = lambda q: [int(h["id"]) for h in hybrid_search_service.search(q, top_k=10)]
    if not text_ready:
        print("\n[TEXT] Chưa có text index — chỉ đánh giá BM25 và hybrid (= BM25).")

    picked = rng.sample(list(products), min(samples, len(products)))

    def short(name):
        return " ".join(family_key(name).split()[:4])

    query_sets = {
        "name": lambda p: p["name"].lower(),
        "short": lambda p: short(p["name"]),
        "no-accent": lambda p: strip_accents(short(p["name"])),
    }

    results = []
    print(f"\n[TEXT] {len(picked)} sản phẩm × {len(query_sets)} kiểu truy vấn × {len(modes)} chế độ")
    for qs_name, make_q in query_sets.items():
        for mode, fn in modes.items():
            m = Metrics(f"{qs_name}/{mode}")
            for pid in picked:
                t0 = time.time()
                ids = fn(make_q(products[pid]))
                m.add(ids, pid, products, (time.time() - t0) * 1000)
            s = m.summary()
            results.append(s)
            print(fmt(s))

    print(f"\n[TEXT] Truy vấn nhu cầu ({len(INTENT_QUERIES)} câu) — CategoryP@10")
    intent = {}
    for mode, fn in modes.items():
        scores, misses = [], []
        for q, cats in INTENT_QUERIES:
            ids = [pid for pid in fn(q)[:10] if pid in products]
            score = sum(products[pid]["category"] in cats for pid in ids) / 10
            scores.append(score)
            if score < 0.5:
                misses.append((q, score))
        intent[mode] = statistics.mean(scores)
        miss_txt = ", ".join(f"'{q}'={s:.0%}" for q, s in misses[:6])
        print(f"  {mode:<7} CatP@10={intent[mode]:.1%}   dưới 50%: {miss_txt or 'không có'}")
    return results, intent


def main() -> int:
    ap = argparse.ArgumentParser(description="Đánh giá chất lượng text search (BM25, Dense e5, Hybrid RRF)")
    ap.add_argument("--samples", type=int, default=150)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="", help="Ghi kết quả JSON ra file")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    products = {p["id"]: p for p in catalog.load_catalog_for_index()}
    print(f"Catalog: {len(products)} sản phẩm")

    report: Dict[str, object] = {"samples": args.samples, "seed": args.seed}
    report["text"], report["intent"] = eval_text(products, args.samples, rng)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"\nĐã ghi {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
