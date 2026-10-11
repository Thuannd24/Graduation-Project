"""
Thí nghiệm cải thiện visual search trên ảnh CHƯA TỪNG THẤY (offline, không cần chạy service).

Giao thức:
  - Ảnh truy vấn = ảnh CUỐI của mỗi sản phẩm có >= 4 ảnh; ảnh này KHÔNG BAO GIỜ nằm trong index.
  - Sản phẩm truy vấn chia ngẫu nhiên 50/50: TUNE (chọn cấu hình) và TEST (chỉ để báo cáo)
    ⇒ tránh chọn trúng cấu hình "may mắn" trên chính tập báo cáo.
  - Tie@k: chấp nhận sản phẩm có ảnh giống hệt từng byte với ảnh truy vấn (xem search-evaluation.md).

Biến thể:
  - index  : first3 (hiện tại) | all (mọi ảnh trừ ảnh held-out)
  - agg    : max (hiện tại) | top2 (s1 + w·s2) | lse (τ·log Σ exp(s/τ) theo ảnh của sản phẩm)
  - tta    : none | flip | flip+crop (trung bình vector nhiều góc nhìn của ảnh truy vấn)
  - query  : plain | augment (cắt 70% + giảm sáng + xoay — mô phỏng ảnh người dùng tự chụp)

Embedding toàn catalog được cache ở DATA_DIR/exp/ ⇒ chạy lại chỉ tốn vài giây.
    docker exec -it ai-search-service python scripts/experiment_visual.py
"""
import argparse
import hashlib
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import search_settings  # noqa: E402
from app.services import catalog  # noqa: E402
from app.services.image_loader import _cache_path, load_image_from_url  # noqa: E402
from app.services.visual_search import visual_search_service  # noqa: E402
from evaluate import augment, family_key  # noqa: E402

MIN_IMAGES = 4
MAX_SIDE = 448

# Phân loại zero-shot bằng chính CLIP: ảnh truy vấn nào là "ảnh chụp sản phẩm" (thứ người dùng
# thật sẽ tìm) và ảnh nào là banner / infographic / thẻ dịch vụ / "trong hộp có gì".
PHOTO_PROMPTS = [
    "a product photo of a smartphone", "a product photo of a laptop", "a product photo of a tablet",
    "a product photo of a desktop computer case", "a product photo of a monitor or television",
    "a product photo of headphones or a speaker", "a product photo of a charger, cable or power bank",
    "a product photo of a camera or smartwatch", "a photo of an electronic device",
]
NON_PHOTO_PROMPTS = [
    "an advertisement banner with large text", "an infographic with specifications and icons",
    "a spec sheet with text", "a warranty or service card with icons", "what's in the box contents diagram",
    "a thin side view of a device edge showing ports",
]


def l2n(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=-1, keepdims=True)
    n[n == 0] = 1
    return m / n


def encode(model, images: List[Image.Image], batch: int = 32) -> np.ndarray:
    return np.asarray(model.encode(images, batch_size=batch, normalize_embeddings=True), dtype="float32")


# ── Embedding toàn bộ ảnh catalog (có cache) ─────────────────────────────────

def embed_catalog(products: List[Dict], model, cache_file: str, workers: int):
    if os.path.exists(cache_file):
        z = np.load(cache_file, allow_pickle=True)
        print(f"Dùng cache embedding: {cache_file} ({len(z['pid'])} ảnh)")
        return z["vecs"], z["pid"], z["pos"], z["n_imgs"], list(z["url"])

    jobs = [(p["id"], i, len(p["images"]), u) for p in products for i, u in enumerate(p["images"])]
    print(f"Encode {len(jobs)} ảnh catalog (một lần, sẽ cache)...")
    vecs, meta = [], []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for s in range(0, len(jobs), 128):
            chunk = jobs[s: s + 128]
            imgs = list(pool.map(lambda j: load_image_from_url(j[3], max_side=MAX_SIDE), chunk))
            ok = [(j, im) for j, im in zip(chunk, imgs) if im is not None]
            if ok:
                vecs.append(encode(model, [im for _, im in ok]))
                meta += [j for j, _ in ok]
            print(f"  {min(s + 128, len(jobs))}/{len(jobs)} — {time.time() - t0:.0f}s", flush=True)
    vecs = np.vstack(vecs)
    pid = np.array([m[0] for m in meta])
    pos = np.array([m[1] for m in meta])
    n_imgs = np.array([m[2] for m in meta])
    url = np.array([m[3] for m in meta], dtype=object)
    os.makedirs(os.path.dirname(cache_file), exist_ok=True)
    np.savez(cache_file, vecs=vecs, pid=pid, pos=pos, n_imgs=n_imgs, url=url)
    return vecs, pid, pos, n_imgs, list(url)


def byte_twins(urls: List[str], pids: np.ndarray) -> Tuple[Dict[str, set], Dict[str, str]]:
    by_hash: Dict[str, set] = {}
    url_hash = {}
    for u, p in zip(urls, pids):
        try:
            with open(_cache_path(u), "rb") as f:
                h = hashlib.md5(f.read()).hexdigest()
        except OSError:
            continue
        url_hash[u] = h
        by_hash.setdefault(h, set()).add(int(p))
    return {u: by_hash[h] for u, h in url_hash.items()}, url_hash


# ── Truy vấn: các góc nhìn cho TTA ───────────────────────────────────────────

def views(img: Image.Image, mode: str) -> List[Image.Image]:
    out = [img]
    if mode in ("flip", "flip+crop"):
        out.append(ImageOps.mirror(img))
    if mode == "flip+crop":
        w, h = img.size
        out.append(img.crop((int(w * 0.1), int(h * 0.1), int(w * 0.9), int(h * 0.9))))
    return out


# ── Xếp hạng sản phẩm từ điểm từng ảnh ───────────────────────────────────────

def rank_products(scores: np.ndarray, img_pid: np.ndarray, agg: str, param: float, top: int = 10) -> List[int]:
    order = np.argsort(-scores)[:400]  # đủ sâu để gom nhiều ảnh / sản phẩm
    per: Dict[int, List[float]] = {}
    for i in order:
        per.setdefault(int(img_pid[i]), []).append(float(scores[i]))
    if agg == "max":
        prod = {p: s[0] for p, s in per.items()}
    elif agg == "top2":
        prod = {p: s[0] + param * (s[1] if len(s) > 1 else s[0] - 0.05) for p, s in per.items()}
    elif agg == "lse":
        prod = {p: param * np.log(np.sum(np.exp(np.array(s) / param))) for p, s in per.items()}
    else:
        raise ValueError(agg)
    return [p for p, _ in sorted(prod.items(), key=lambda x: -x[1])[:top]]


def metrics(rows: List[Tuple[List[int], set, int]], prods: Dict[int, Dict]) -> Dict[str, float]:
    n = len(rows)
    t1 = t5 = f1 = mrr = cat = 0.0
    for ranked, accepted, target in rows:
        r = next((i + 1 for i, p in enumerate(ranked) if p in accepted), None)
        t1 += r == 1
        t5 += r is not None and r <= 5
        mrr += 1 / r if r else 0
        fam = family_key(prods[target]["name"])
        f1 += bool(ranked) and family_key(prods[ranked[0]]["name"]) == fam
        cat += sum(prods[p]["category"] == prods[target]["category"] for p in ranked[:5]) / 5
    return {"tie@1": t1 / n, "tie@5": t5 / n, "fam@1": f1 / n, "mrr": mrr / n, "catp@5": cat / n}


def _write_sheet(path, q_products, photo_q, last_row, urls, n=10):
    from app.services.image_loader import load_image_from_url as load
    cols = [[p for p in q_products if p in photo_q][:n], [p for p in q_products if p not in photo_q][:n]]
    sheet = Image.new("RGB", (2 * 170, n * 170), "white")
    for c, col in enumerate(cols):
        for r, pid in enumerate(col):
            im = load(urls[last_row[pid]], max_side=160)
            if im:
                im.thumbnail((160, 160))
                sheet.paste(im, (c * 170 + 5, r * 170 + 5))
    sheet.save(path, quality=85)
    print(f"Ảnh mẫu: cột trái = xếp 'ảnh sản phẩm', cột phải = 'không phải' → {path}")


def photo_mask(model, vecs: np.ndarray) -> np.ndarray:
    t = np.asarray(model.encode(PHOTO_PROMPTS + NON_PHOTO_PROMPTS, normalize_embeddings=True), dtype="float32")
    sims = vecs @ t.T
    best = sims.argmax(axis=1)
    return best < len(PHOTO_PROMPTS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--sheet", default="", help="Ghi ảnh mẫu phân loại photo/non-photo ra file để kiểm tra bằng mắt")
    args = ap.parse_args()
    rng = random.Random(args.seed)

    products = catalog.load_catalog_for_index()
    prods = {p["id"]: p for p in products}
    model = visual_search_service._get_model()
    cache = os.path.join(search_settings.DATA_DIR, "exp", f"clip_all_{search_settings.VISION_MODEL_NAME}.npz")
    vecs, img_pid, img_pos, img_n, urls = embed_catalog(products, model, cache, args.workers)
    twins, url_hash = byte_twins(urls, img_pid)

    # Ảnh held-out = ảnh cuối của sản phẩm có >= MIN_IMAGES ảnh
    # (chỉ lấy sản phẩm mà ảnh cuối tải/encode được)
    q_products = sorted({int(p) for p, pos, n in zip(img_pid, img_pos, img_n) if n >= MIN_IMAGES and pos == n - 1})
    # Chống rò rỉ: ảnh held-out trùng byte với ảnh KHÁC của chính sản phẩm đó thì "all" sẽ khớp hộ
    own_hashes: Dict[int, List[str]] = {}
    for p, u in zip(img_pid, urls):
        own_hashes.setdefault(int(p), []).append(url_hash.get(u))
    last_url = {int(p): u for p, pos, n, u in zip(img_pid, img_pos, img_n, urls) if pos == n - 1}
    leaky = {p for p in q_products if own_hashes[p].count(url_hash.get(last_url.get(p))) > 1}
    q_products = [p for p in q_products if p not in leaky]
    print(f"Loại {len(leaky)} sản phẩm có ảnh held-out trùng ảnh khác của chính nó.")
    rng.shuffle(q_products)
    half = len(q_products) // 2
    is_photo = photo_mask(model, vecs)
    last_row = {int(p): i for i, (p, pos, n) in enumerate(zip(img_pid, img_pos, img_n)) if pos == n - 1}
    photo_q = {p for p in q_products if is_photo[last_row[p]]}
    splits = {
        "tune": q_products[:half], "test": q_products[half:],
        "test_photo": [p for p in q_products[half:] if p in photo_q],
    }
    print(f"Sản phẩm truy vấn: {len(q_products)} (tune {half} / test {len(q_products) - half}); "
          f"ảnh held-out là ảnh chụp sản phẩm: {len(photo_q)} ({len(photo_q) / len(q_products):.0%}), "
          f"trong test: {len(splits['test_photo'])}")
    if args.sheet:
        _write_sheet(args.sheet, q_products, photo_q, last_row, urls)

    is_heldout = np.array([n >= MIN_IMAGES and pos == n - 1 for pos, n in zip(img_pos, img_n)])
    index_masks = {
        "first3": (img_pos < 3) & ~is_heldout,
        "all": ~is_heldout,
    }

    # Ảnh truy vấn (plain / augment) × các góc nhìn TTA — encode một lần
    q_url = {int(p): u for p, pos, n, u in zip(img_pid, img_pos, img_n, urls) if n >= MIN_IMAGES and pos == n - 1}
    print("Encode ảnh truy vấn (plain/augment × TTA)...")
    qvec: Dict[Tuple[str, str], Dict[int, np.ndarray]] = {}
    arng = random.Random(args.seed + 1)
    raw = {pid: load_image_from_url(q_url[pid], max_side=MAX_SIDE) for pid in q_products}
    aug = {pid: augment(img, arng) for pid, img in raw.items() if img is not None}
    for qname, imgs in (("plain", raw), ("augment", aug)):
        for tta in ("none", "flip", "flip+crop"):
            pids = [p for p in q_products if imgs.get(p) is not None]
            all_views = [views(imgs[p], tta) for p in pids]
            flat = encode(model, [v for vs in all_views for v in vs])
            k = len(all_views[0])
            qvec[(qname, tta)] = {p: l2n(flat[i * k:(i + 1) * k].mean(axis=0)) for i, p in enumerate(pids)}

    configs = [("max", 0.0)] + [("top2", w) for w in (0.25, 0.5)] + [("lse", t) for t in (0.01, 0.02, 0.05)]
    results = []
    for idx_name, mask in index_masks.items():
        iv, ip = vecs[mask], img_pid[mask]
        for qname in ("plain", "augment"):
            for tta in ("none", "flip", "flip+crop"):
                for agg, param in configs:
                    row = {"index": idx_name, "query": qname, "tta": tta, "agg": f"{agg}{'' if agg == 'max' else f'({param})'}"}
                    for split, pids in splits.items():
                        rows = []
                        for pid in pids:
                            q = qvec[(qname, tta)].get(pid)
                            if q is None:
                                continue
                            ranked = rank_products(iv @ q, ip, agg, param)
                            accepted = {pid} | (twins.get(q_url[pid], set()))
                            rows.append((ranked, accepted, pid))
                        row[split] = metrics(rows, prods)
                    results.append(row)

    def show(title, rows):
        print(f"\n{title}")
        print(f"  {'index':<7}{'query':<9}{'tta':<11}{'agg':<11}| TUNE tie@1 | TEST tie@1 tie@5  fam@1  mrr   catp@5"
              f" | TEST-PHOTO tie@1 tie@5  catp@5")
        for r in rows:
            t, s, ph = r["tune"], r["test"], r["test_photo"]
            print(f"  {r['index']:<7}{r['query']:<9}{r['tta']:<11}{r['agg']:<11}|   {t['tie@1']:6.1%}   |  "
                  f"{s['tie@1']:6.1%} {s['tie@5']:6.1%} {s['fam@1']:6.1%} {s['mrr']:.3f} {s['catp@5']:6.1%}"
                  f" |      {ph['tie@1']:6.1%} {ph['tie@5']:6.1%} {ph['catp@5']:6.1%}")

    for qname in ("plain", "augment"):
        rows = [r for r in results if r["query"] == qname]
        base = next(r for r in rows if r["index"] == "first3" and r["tta"] == "none" and r["agg"] == "max")
        best = max(rows, key=lambda r: r["tune"]["tie@1"])  # CHỌN theo TUNE
        only_index = next(r for r in rows if r["index"] == "all" and r["tta"] == "none" and r["agg"] == "max")
        show(f"[{qname}] baseline / chỉ đổi index / tốt nhất theo TUNE", [base, only_index, best])
        show(f"[{qname}] top 8 theo TUNE", sorted(rows, key=lambda r: -r["tune"]["tie@1"])[:8])
    return 0


if __name__ == "__main__":
    sys.exit(main())
