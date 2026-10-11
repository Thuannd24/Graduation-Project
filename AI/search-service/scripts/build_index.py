"""
Build chỉ mục cho search-service từ catalog thật (MariaDB `ecommerce_product_db`):

  1. Text index  : e5 encode "passage: tên + thương hiệu + danh mục + mô tả"  → text_index.faiss
  2. Image index : tải ảnh sản phẩm (có cache) → CLIP encode                  → item_index.faiss
  3. Similar     : cosine giữa sản phẩm (ảnh + text) → top-K                  → MongoDB product_similarities

Service đang chạy tự nạp index mới trong ≤30s (FaissStore.reload_if_changed), không cần restart.

Chạy trong container:
    docker exec -it ai-search-service python scripts/build_index.py
Chạy local (từ AI/search-service, đã cài requirements):
    python scripts/build_index.py --limit 50          # thử nhanh với 50 sản phẩm
    python scripts/build_index.py --skip-text         # chỉ build ảnh (bỏ qua e5-large ~2GB)
"""
import argparse
import gc
import html
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple

import numpy as np

# Cho phép chạy trực tiếp `python scripts/build_index.py` (import được package app.*)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import search_settings  # noqa: E402
from app.services import catalog  # noqa: E402
from app.services.image_loader import load_image_from_url  # noqa: E402
from app.services.text_search import text_search_service  # noqa: E402
from app.services.visual_search import visual_search_service  # noqa: E402
from shared_common.logger import get_logger  # noqa: E402

logger = get_logger("build_index")

IMAGE_CHUNK = 128
HOLDOUT_MIN_IMAGES = 4  # khớp scripts/evaluate.py --holdout last
IMAGE_MAX_SIDE = 448

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _clean_text(text: str, max_chars: int) -> str:
    text = _TAG_RE.sub(" ", html.unescape(text or ""))
    return _WS_RE.sub(" ", text).strip()[:max_chars]


def _passage(p: Dict) -> str:
    parts = [p["name"]]
    if p["brand"]:
        parts.append(f"Thương hiệu {p['brand']}")
    if p["category"]:
        parts.append(f"Danh mục {p['category']}")
    desc = _clean_text(p["description"], 800)
    if desc:
        parts.append(desc)
    return ". ".join(parts)


def _l2norm(m: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return m / norms


# ── 1. Text ──────────────────────────────────────────────────────────────────

def build_text_index(products: List[Dict], batch_size: int) -> Dict[int, np.ndarray]:
    logger.info(f"[text] Encode {len(products)} sản phẩm bằng {search_settings.TEXT_MODEL_NAME}...")
    model = text_search_service._get_model()
    prefix = "passage: " if text_search_service._is_e5() else ""
    passages = [prefix + _passage(p) for p in products]

    vectors = model.encode(
        passages, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=True
    ).astype("float32")
    ids = [p["id"] for p in products]

    text_search_service.store.build(vectors, ids)
    text_search_service.store.save()
    return dict(zip(ids, vectors))


# ── 2. Image ─────────────────────────────────────────────────────────────────

def image_urls_for_index(p: Dict, max_images: int, holdout_last: bool) -> List[str]:
    urls = list(p["images"])
    if holdout_last and len(urls) >= HOLDOUT_MIN_IMAGES:
        urls = urls[:-1]  # ảnh cuối để dành làm ảnh test "chưa từng thấy" (scripts/evaluate.py)
    return urls[:max_images] if max_images > 0 else urls


def build_image_index(
    products: List[Dict], max_images: int, workers: int, batch_size: int, holdout_last: bool = False
) -> Dict[int, np.ndarray]:
    jobs: List[Tuple[int, str]] = [
        (p["id"], url) for p in products for url in image_urls_for_index(p, max_images, holdout_last)
    ]
    logger.info(
        f"[image] {len(jobs)} ảnh, xử lý theo lô {IMAGE_CHUNK} ({workers} luồng tải, "
        f"cache: {search_settings.img_cache_dir}), encode bằng {search_settings.VISION_MODEL_NAME}..."
    )
    model = visual_search_service._get_model()

    # Tải + encode từng lô rồi bỏ ảnh đi — chỉ giữ vector 512-dim. Giữ nguyên cả catalog ảnh
    # đã giải mã (~2MB/ảnh) trong RAM sẽ bị OOM kill giữa chừng.
    t0 = time.time()
    ids: List[int] = []
    chunks: List[np.ndarray] = []
    failed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for start in range(0, len(jobs), IMAGE_CHUNK):
            batch = jobs[start: start + IMAGE_CHUNK]
            images = list(pool.map(lambda job: load_image_from_url(job[1], max_side=IMAGE_MAX_SIDE), batch))
            ok = [(pid, img) for (pid, _), img in zip(batch, images) if img is not None]
            failed += len(batch) - len(ok)
            if ok:
                vecs = model.encode([img for _, img in ok], batch_size=batch_size, normalize_embeddings=True)
                chunks.append(np.asarray(vecs, dtype="float32"))
                ids.extend(pid for pid, _ in ok)
            done = min(start + IMAGE_CHUNK, len(jobs))
            logger.info(f"[image] {done}/{len(jobs)} ảnh ({failed} lỗi) — {time.time() - t0:.0f}s")

    if not ids:
        raise RuntimeError("Không tải được ảnh nào — kiểm tra kết nối mạng / URL ảnh trong DB.")
    vectors = np.vstack(chunks)

    visual_search_service.store.build(vectors, ids)
    visual_search_service.store.save()

    # Vector đại diện mỗi sản phẩm = trung bình các ảnh của nó (đã normalize)
    per_product: Dict[int, List[np.ndarray]] = {}
    for pid, vec in zip(ids, vectors):
        per_product.setdefault(pid, []).append(vec)
    return {pid: _l2norm(np.mean(vs, axis=0, keepdims=True))[0] for pid, vs in per_product.items()}


# ── 3. Similar items ─────────────────────────────────────────────────────────

def _cosine_matrix(vecs: Dict[int, np.ndarray], ids: List[int]) -> np.ndarray:
    """Ma trận cosine (n×n) theo thứ tự ids; sản phẩm thiếu vector ⇒ hàng/cột NaN."""
    dim = len(next(iter(vecs.values())))
    m = np.full((len(ids), dim), np.nan, dtype="float32")
    for i, pid in enumerate(ids):
        if pid in vecs:
            m[i] = vecs[pid]
    return m @ m.T


def build_similarities(
    image_vecs: Dict[int, np.ndarray], text_vecs: Dict[int, np.ndarray], top_k: int, image_weight: float
) -> int:
    ids = sorted(set(image_vecs) | set(text_vecs))
    if len(ids) < 2:
        logger.warning("[similar] Không đủ sản phẩm để tính tương tự.")
        return 0
    logger.info(f"[similar] Tính top-{top_k} tương tự cho {len(ids)} sản phẩm (ảnh {image_weight:.0%} / text)...")

    img = _cosine_matrix(image_vecs, ids) if image_vecs else np.full((len(ids), len(ids)), np.nan)
    txt = _cosine_matrix(text_vecs, ids) if text_vecs else np.full((len(ids), len(ids)), np.nan)
    # Có cả 2 ⇒ trộn theo trọng số; chỉ có 1 ⇒ dùng cái có
    sim = np.where(
        np.isnan(img), txt,
        np.where(np.isnan(txt), img, image_weight * img + (1 - image_weight) * txt),
    )
    sim = np.nan_to_num(sim, nan=-1.0)
    np.fill_diagonal(sim, -np.inf)

    k = min(top_k, len(ids) - 1)
    similar: Dict[int, List[Tuple[int, float]]] = {}
    for i, pid in enumerate(ids):
        top = np.argpartition(-sim[i], k - 1)[:k]
        top = top[np.argsort(-sim[i][top])]
        similar[pid] = [(ids[j], float(sim[i][j])) for j in top if sim[i][j] > -1.0]

    written = catalog.save_similarities(similar)
    logger.info(f"[similar] Đã ghi {written} document vào MongoDB {catalog.SIMILARITY_COLLECTION}.")
    return written


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Build FAISS index + product_similarities cho search-service")
    ap.add_argument("--skip-text", action="store_true", help="Không build text index (e5)")
    ap.add_argument("--skip-image", action="store_true", help="Không build image index (CLIP)")
    ap.add_argument("--skip-similar", action="store_true", help="Không ghi product_similarities")
    ap.add_argument("--limit", type=int, default=0, help="Chỉ lấy N sản phẩm đầu (thử nhanh)")
    ap.add_argument("--max-images", type=int, default=0,
                    help="Số ảnh tối đa / sản phẩm (0 = tất cả — index nhiều góc chụp cho kết quả tốt hơn)")
    ap.add_argument("--holdout-last", action="store_true",
                    help="CHỈ ĐỂ ĐÁNH GIÁ: bỏ ảnh cuối của sản phẩm có >=4 ảnh khỏi index")
    ap.add_argument("--workers", type=int, default=8, help="Số luồng tải ảnh")
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--similar-top-k", type=int, default=20)
    ap.add_argument("--image-weight", type=float, default=0.6, help="Trọng số ảnh khi trộn similar (0–1)")
    args = ap.parse_args()

    t0 = time.time()
    products = catalog.load_catalog_for_index()
    if args.limit:
        products = products[: args.limit]
    logger.info(f"Catalog: {len(products)} sản phẩm active (nguồn: {search_settings.CATALOG_SOURCE}).")
    if not products:
        logger.error("Catalog rỗng — kiểm tra kết nối DB / đã seed sản phẩm chưa.")
        return 1

    text_vecs: Dict[int, np.ndarray] = {}
    image_vecs: Dict[int, np.ndarray] = {}
    if not args.skip_text:
        text_vecs = build_text_index(products, args.batch_size)
        # Giải phóng e5 (~2GB RAM) trước khi nạp CLIP + ảnh
        text_search_service.model = None
        gc.collect()
    elif not args.skip_similar and text_search_service.store.load():
        text_vecs = text_search_service.store.vectors_by_product()
        logger.info(f"[text] Bỏ qua encode, dùng lại {len(text_vecs)} vector từ text index đã build.")
    if not args.skip_image:
        image_vecs = build_image_index(
            products, args.max_images, args.workers, args.batch_size, holdout_last=args.holdout_last
        )
    if not args.skip_similar and (text_vecs or image_vecs):
        build_similarities(image_vecs, text_vecs, args.similar_top_k, args.image_weight)

    logger.info(f"Hoàn tất trong {time.time() - t0:.0f}s. Service sẽ tự nạp index mới trong ≤30s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
