import json
import os
import threading
import time
from typing import List, Tuple, Sequence

import numpy as np

from shared_common.logger import get_logger

logger = get_logger(__name__)


class FaissStore:
    """
    Bọc 1 FAISS index + map vị trí → productId.

    - Index là IndexFlatIP trên vector đã L2-normalize ⇒ inner product = cosine similarity.
      Catalog cỡ vài nghìn sản phẩm nên brute-force (Flat) vẫn < vài ms, không cần IVF/HNSW.
    - 1 sản phẩm có thể có NHIỀU vector (vd nhiều ảnh) ⇒ map là list productId theo thứ tự
      vector; khi search sẽ gộp theo productId, giữ score cao nhất.
    - Index chưa build ⇒ is_ready=False, search() trả [] (service vẫn UP, không crash).
    """

    def __init__(self, dim: int, index_path: str, map_path: str, name: str):
        self.dim = dim
        self.index_path = index_path
        self.map_path = map_path
        self.name = name
        self._index = None
        self._ids: List[int] = []
        self._lock = threading.Lock()
        self._loaded_mtime = 0.0
        self._last_check = 0.0

    # ── Trạng thái ───────────────────────────────────────────────────────────
    @property
    def is_ready(self) -> bool:
        return self._index is not None and self._index.ntotal > 0

    @property
    def size(self) -> int:
        return int(self._index.ntotal) if self._index is not None else 0

    # ── Load / Save ──────────────────────────────────────────────────────────
    def load(self) -> bool:
        """Nạp index từ đĩa. Trả False (không raise) nếu chưa có file hoặc file hỏng."""
        if not (os.path.exists(self.index_path) and os.path.exists(self.map_path)):
            logger.warning(
                f"[{self.name}] Chưa có FAISS index tại {self.index_path} — "
                f"chạy scripts/build_index.py để build."
            )
            return False

        import faiss  # lazy: không cài faiss thì service vẫn khởi động được

        index = faiss.read_index(self.index_path)
        with open(self.map_path, "r", encoding="utf-8") as f:
            ids = [int(x) for x in json.load(f)]

        if index.d != self.dim:
            logger.error(f"[{self.name}] Sai số chiều index: {index.d} != {self.dim} (đổi model mà chưa build lại?)")
            return False
        if index.ntotal != len(ids):
            logger.error(f"[{self.name}] Index ({index.ntotal}) và map ({len(ids)}) lệch nhau — cần build lại.")
            return False

        with self._lock:
            self._index = index
            self._ids = ids
            self._loaded_mtime = os.path.getmtime(self.index_path)
        logger.info(f"[{self.name}] Đã load FAISS index: {index.ntotal} vector, {len(set(ids))} sản phẩm.")
        return True

    def reload_if_changed(self, interval: float = 30.0) -> None:
        """
        Nạp lại khi scripts/build_index.py vừa ghi index mới (so mtime, tối đa 1 lần / interval giây)
        ⇒ build xong không cần restart service.
        """
        now = time.time()
        if now - self._last_check < interval:
            return
        self._last_check = now
        try:
            mtime = os.path.getmtime(self.index_path)
        except OSError:
            return
        if mtime > self._loaded_mtime:
            self.load()

    def vectors_by_product(self) -> dict:
        """{productId: vector trung bình đã normalize} đọc lại từ index (dùng lại khi build similar)."""
        if not self.is_ready:
            return {}
        with self._lock:
            index, ids = self._index, list(self._ids)
        all_vecs = index.reconstruct_n(0, index.ntotal)
        grouped: dict = {}
        for pid, vec in zip(ids, all_vecs):
            grouped.setdefault(pid, []).append(vec)
        out = {}
        for pid, vs in grouped.items():
            v = np.mean(vs, axis=0)
            n = np.linalg.norm(v)
            out[pid] = (v / n if n > 0 else v).astype("float32")
        return out

    def build(self, vectors: np.ndarray, product_ids: Sequence[int]) -> None:
        """Dựng index mới trong RAM từ ma trận (n, dim) đã normalize."""
        import faiss

        vectors = np.ascontiguousarray(vectors, dtype="float32")
        if vectors.ndim != 2 or vectors.shape[1] != self.dim:
            raise ValueError(f"[{self.name}] vectors phải có shape (n, {self.dim}), nhận {vectors.shape}")
        if len(product_ids) != vectors.shape[0]:
            raise ValueError(f"[{self.name}] Số productId ({len(product_ids)}) != số vector ({vectors.shape[0]})")

        index = faiss.IndexFlatIP(self.dim)
        index.add(vectors)
        with self._lock:
            self._index = index
            self._ids = [int(x) for x in product_ids]

    def save(self) -> None:
        """Ghi index + map ra đĩa (ghi file tạm rồi rename để không để lại file dở dang)."""
        import faiss

        if self._index is None:
            raise RuntimeError(f"[{self.name}] Chưa có index để lưu.")
        os.makedirs(os.path.dirname(self.index_path), exist_ok=True)

        tmp_index = self.index_path + ".tmp"
        tmp_map = self.map_path + ".tmp"
        faiss.write_index(self._index, tmp_index)
        with open(tmp_map, "w", encoding="utf-8") as f:
            json.dump(self._ids, f)
        os.replace(tmp_index, self.index_path)
        os.replace(tmp_map, self.map_path)
        logger.info(f"[{self.name}] Đã lưu FAISS index ({self.size} vector) → {self.index_path}")

    # ── Search ───────────────────────────────────────────────────────────────
    def search(self, vector: np.ndarray, top_k: int = 10) -> List[Tuple[int, float]]:
        """Trả [(productId, cosine)] giảm dần, mỗi sản phẩm xuất hiện 1 lần."""
        self.reload_if_changed()
        if not self.is_ready or top_k <= 0:
            return []

        query = np.asarray(vector, dtype="float32").reshape(1, -1)
        if query.shape[1] != self.dim:
            raise ValueError(f"[{self.name}] Query vector {query.shape[1]}-dim, index cần {self.dim}-dim")

        with self._lock:
            index, ids = self._index, self._ids
        # Lấy dư để còn đủ top_k sản phẩm sau khi gộp nhiều vector của cùng 1 sản phẩm
        k = min(index.ntotal, top_k * 4)
        scores, positions = index.search(query, k)

        best: dict = {}
        for pos, score in zip(positions[0], scores[0]):
            if pos < 0:
                continue
            pid = ids[pos]
            if pid not in best or score > best[pid]:
                best[pid] = float(score)

        ranked = sorted(best.items(), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]
