"""
Đánh giá chất lượng search-service trên catalog thật (số liệu dùng cho báo cáo).

VISUAL (gọi HTTP endpoint thật — gồm upload, decode, CLIP, FAISS, metadata):
  - held-out : truy vấn bằng ảnh thứ N+1 của sản phẩm (KHÔNG có trong index, index dùng N ảnh đầu)
  - augmented: ảnh held-out bị cắt 70% giữa + giảm sáng + xoay nhẹ (giống ảnh người dùng tự chụp)
  - seen     : ảnh chính (đã có trong index) — kiểm tra pipeline, kỳ vọng ~100%
  Chỉ số: Hit@1/5/10 (đúng sản phẩm), FamilyHit@1/5 (đúng dòng, bỏ qua khác dung lượng),
          MRR, CategoryP@5 (tỉ lệ top-5 cùng danh mục), latency p50/p95.

TEXT (in-process — so sánh 3 chế độ BM25 / Dense e5 / Hybrid RRF):
  - name     : truy vấn = tên sản phẩm viết thường
  - short    : tên rút gọn (bỏ dung lượng/RAM, 4 từ đầu) — kiểu người dùng hay gõ
  - no-accent: tên rút gọn bỏ dấu tiếng Việt
  - intent   : truy vấn nhu cầu viết tay có nhãn danh mục (CategoryP@10)

Chạy trong container (sau khi đã build_index):
    docker exec -it ai-search-service python scripts/evaluate.py --samples 200
"""
import argparse
import io
import json
import os
import random
import re
import statistics
import sys
import time
import unicodedata
from typing import Dict, List, Optional, Sequence

import requests
from PIL import Image, ImageEnhance

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import catalog  # noqa: E402
from app.services.image_loader import load_image_from_url  # noqa: E402

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


def augment(img: Image.Image, rng: random.Random) -> Image.Image:
    w, h = img.size
    cw, ch = int(w * 0.7), int(h * 0.7)
    x, y = rng.randint(0, w - cw), rng.randint(0, h - ch)
    img = img.crop((x, y, x + cw, y + ch))
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.7, 0.9))
    return img.rotate(rng.uniform(-12, 12), expand=True, fillcolor=(255, 255, 255))


def to_jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def percentile(values: Sequence[float], p: float) -> float:
    if not values:
        return 0.0
    v = sorted(values)
    return v[min(len(v) - 1, int(round(p / 100 * (len(v) - 1))))]


class Metrics:
    def __init__(self, name: str):
        self.name = name
        self.rows: List[Dict] = []

    def add(self, ranked_ids: List[int], target: int, products: Dict[int, Dict], latency_ms: float = 0.0,
            twins: Optional[set] = None):
        """twins: các sản phẩm khác có ảnh GIỐNG HỆT ảnh truy vấn — không mô hình ảnh nào phân biệt được."""
        tgt = products[target]
        accepted = {target} | (twins or set())
        tie_rank = next((i + 1 for i, pid in enumerate(ranked_ids) if pid in accepted), None)
        fam = family_key(tgt["name"])
        rank = ranked_ids.index(target) + 1 if target in ranked_ids else None
        fam_rank = next(
            (i + 1 for i, pid in enumerate(ranked_ids) if pid in products and family_key(products[pid]["name"]) == fam),
            None,
        )
        top5 = [pid for pid in ranked_ids[:5] if pid in products]
        cat_p5 = sum(products[pid]["category"] == tgt["category"] for pid in top5) / 5
        self.rows.append({"rank": rank, "tie_rank": tie_rank, "fam_rank": fam_rank, "cat_p5": cat_p5,
                          "latency": latency_ms})

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
            "tie@1": hit("tie_rank", 1), "tie@5": hit("tie_rank", 5),
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
    if s.get("tie@1") is not None and s["tie@1"] != s["hit@1"]:
        line += f" Tie@1={s['tie@1']:.1%} Tie@5={s['tie@5']:.1%}"
    if s.get("p50_ms"):
        line += f"  p50={s['p50_ms']:.0f}ms p95={s['p95_ms']:.0f}ms"
    return line


# ── Visual ───────────────────────────────────────────────────────────────────

def post_image(base_url: str, data: bytes, top_k: int) -> (List[int], float):
    t0 = time.time()
    r = requests.post(
        f"{base_url}/search/image", params={"top_k": top_k},
        files={"image": ("q.jpg", data, "image/jpeg")}, timeout=120,
    )
    ms = (time.time() - t0) * 1000
    r.raise_for_status()
    body = r.json()
    assert body.get("code") == "SUCCESS", body
    return [int(it["id"]) for it in body["data"]["items"]], ms


def image_twins(products: Dict[int, Dict]) -> Dict[str, set]:
    """URL ảnh → tập sản phẩm có ảnh byte-giống-hệt (dựa trên cache đã tải khi build index)."""
    import hashlib
    from app.services.image_loader import _cache_path

    by_hash: Dict[str, set] = {}
    url_hash: Dict[str, str] = {}
    for pid, p in products.items():
        for url in p["images"]:
            try:
                with open(_cache_path(url), "rb") as f:
                    h = hashlib.md5(f.read()).hexdigest()
            except OSError:
                continue
            url_hash[url] = h
            by_hash.setdefault(h, set()).add(pid)
    return {url: by_hash[h] for url, h in url_hash.items()}


def eval_visual(base_url: str, products: Dict[int, Dict], samples: int, index_images: int, rng: random.Random):
    twins_of = image_twins(products)
    candidates = [pid for pid, p in products.items() if len(p["images"]) > index_images]
    picked = rng.sample(candidates, min(samples, len(candidates)))
    print(f"\n[VISUAL] {len(picked)} sản phẩm có ảnh held-out (ảnh #{index_images + 1}), top_k=10")

    # Làm nóng: lần gọi đầu nạp CLIP, không tính vào latency
    first = load_image_from_url(products[picked[0]]["images"][0])
    post_image(base_url, to_jpeg(first), 10)

    seen, held, aug = Metrics("seen (ảnh trong index)"), Metrics("held-out"), Metrics("held-out + augment")
    failures = []
    for i, pid in enumerate(picked, 1):
        p = products[pid]
        img_seen = load_image_from_url(p["images"][0])
        img_held = load_image_from_url(p["images"][index_images])
        if img_seen is None or img_held is None:
            continue
        tw_seen = twins_of.get(p["images"][0], set()) - {pid}
        tw_held = twins_of.get(p["images"][index_images], set()) - {pid}
        ids, ms = post_image(base_url, to_jpeg(img_seen), 10)
        seen.add(ids, pid, products, ms, tw_seen)
        ids, ms = post_image(base_url, to_jpeg(img_held), 10)
        held.add(ids, pid, products, ms, tw_held)
        if held.rows[-1]["fam_rank"] is None and len(failures) < 8:
            failures.append((p["name"], p["category"], [products[x]["name"] for x in ids[:3] if x in products]))
        ids, ms = post_image(base_url, to_jpeg(augment(img_held, rng)), 10)
        aug.add(ids, pid, products, ms, tw_held)
        if i % 25 == 0:
            print(f"  ... {i}/{len(picked)}")

    results = [seen.summary(), held.summary(), aug.summary()]
    for s in results:
        print(fmt(s))
    if failures:
        print("  Ví dụ held-out trượt cả dòng sản phẩm (top-10):")
        for name, cat, got in failures:
            print(f"    - [{cat}] {name}\n        → {got}")
    return results


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
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8001/api/v1/public")
    ap.add_argument("--samples", type=int, default=150)
    ap.add_argument("--index-images", type=int, default=3, help="= --max-images lúc build_index")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--skip-visual", action="store_true")
    ap.add_argument("--skip-text", action="store_true")
    ap.add_argument("--out", default="", help="Ghi kết quả JSON ra file")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    products = {p["id"]: p for p in catalog.load_catalog_for_index()}
    print(f"Catalog: {len(products)} sản phẩm")

    report: Dict[str, object] = {"samples": args.samples, "seed": args.seed}
    if not args.skip_visual:
        report["visual"] = eval_visual(args.base_url, products, args.samples, args.index_images, rng)
    if not args.skip_text:
        report["text"], report["intent"] = eval_text(products, args.samples, rng)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"\nĐã ghi {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
