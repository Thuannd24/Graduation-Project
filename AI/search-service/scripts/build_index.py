"""
Build chỉ mục cho search-service từ catalog thật (MariaDB `ecommerce_product_db`):

  1. Text index  : e5 encode "passage: tên + thương hiệu + danh mục + mô tả"  → text_index.faiss
  2. Similar     : cosine giữa sản phẩm (text) → top-K                        → MongoDB product_similarities

Service đang chạy tự nạp index mới trong ≤30s (FaissStore.reload_if_changed), không cần restart.

Chạy trong container:
    docker exec -it ai-search-service python scripts/build_index.py
Chạy local (từ AI/search-service, đã cài requirements):
    python scripts/build_index.py --limit 50          # thử nhanh với 50 sản phẩm
"""
import argparse
import html
import os
import re
import sys
import time
from typing import Dict, List, Tuple

import numpy as np

# Cho phép chạy trực tiếp `python scripts/build_index.py` (import được package app.*)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import search_settings  # noqa: E402
from app.services import catalog  # noqa: E402
from app.services.text_search import text_search_service  # noqa: E402
from shared_common.logger import get_logger  # noqa: E402

logger = get_logger("build_index")

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


# ── 2. Similar items ─────────────────────────────────────────────────────────

def _cosine_matrix(vecs: Dict[int, np.ndarray], ids: List[int]) -> np.ndarray:
    """Ma trận cosine (n×n) theo thứ tự ids; sản phẩm thiếu vector ⇒ hàng/cột NaN."""
    dim = len(next(iter(vecs.values())))
    m = np.full((len(ids), dim), np.nan, dtype="float32")
    for i, pid in enumerate(ids):
        if pid in vecs:
            m[i] = vecs[pid]
    return m @ m.T


def build_similarities(text_vecs: Dict[int, np.ndarray], top_k: int) -> int:
    ids = sorted(text_vecs.keys())
    if len(ids) < 2:
        logger.warning("[similar] Không đủ sản phẩm để tính tương tự.")
        return 0
    logger.info(f"[similar] Tính top-{top_k} tương tự cho {len(ids)} sản phẩm (text)...")

    sim = _cosine_matrix(text_vecs, ids)
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
    ap = argparse.ArgumentParser(description="Build FAISS text index + product_similarities cho search-service")
    ap.add_argument("--skip-text", action="store_true", help="Không build text index (e5)")
    ap.add_argument("--skip-similar", action="store_true", help="Không ghi product_similarities")
    ap.add_argument("--limit", type=int, default=0, help="Chỉ lấy N sản phẩm đầu (thử nhanh)")
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--similar-top-k", type=int, default=20)
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
    if not args.skip_text:
        text_vecs = build_text_index(products, args.batch_size)
    elif not args.skip_similar and text_search_service.store.load():
        text_vecs = text_search_service.store.vectors_by_product()
        logger.info(f"[text] Bỏ qua encode, dùng lại {len(text_vecs)} vector từ text index đã build.")

    if not args.skip_similar and text_vecs:
        build_similarities(text_vecs, args.similar_top_k)

    logger.info(f"Hoàn tất trong {time.time() - t0:.0f}s. Service sẽ tự nạp index mới trong ≤30s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
