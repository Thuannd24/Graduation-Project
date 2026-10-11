import os
from typing import Any, Dict, List, Optional

import torch
import torch.nn as nn

from app.core.config import recs_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)


# ⚠️ PHẢI khớp hệt kiến trúc `SASRec` trong
# `AI/forecast-service/app/training/experiments/recsys_sasrec.py` — checkpoint train ở đó chỉ
# nạp được `load_state_dict` vào đây nếu 2 định nghĩa layer giống nhau tuyệt đối. Sửa một bên thì
# phải sửa bên kia. (Bản trước đây là 1 LSTM "dummy" hoàn toàn khác kiến trúc — không đại diện cho
# gì đã nghiên cứu, chỉ để service compile được.)
class SASRecModel(nn.Module):
    def __init__(self, n_items: int, d_model: int, n_blocks: int, n_heads: int, maxlen: int):
        super().__init__()
        self.item_emb = nn.Embedding(n_items + 1, d_model, padding_idx=0)  # 0 = pad
        self.pos_emb = nn.Embedding(maxlen, d_model)
        self.dropout = nn.Dropout(0.2)
        layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_model * 4,
            dropout=0.2, batch_first=True, activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=n_blocks)
        self.ln = nn.LayerNorm(d_model)
        self.maxlen = maxlen

    def forward(self, seqs: torch.Tensor) -> torch.Tensor:
        positions = torch.arange(seqs.size(1), device=seqs.device).unsqueeze(0)
        x = self.item_emb(seqs) + self.pos_emb(positions)
        x = self.dropout(x)
        pad_mask = seqs == 0
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seqs.size(1)).to(seqs.device)
        h = self.encoder(x, mask=causal_mask, src_key_padding_mask=pad_mask)
        return self.ln(h)


class SasRecService:
    """⚠️ Điểm mấu chốt (2026-09-21): các checkpoint đang có (`training/experiments/recsys_sasrec.py`)
    được train trên bộ NGHIÊN CỨU CÔNG KHAI (REES46 Cosmetics) để trả lời câu hỏi "chuỗi hành vi có
    thông tin hơn tổng hợp không" — index item trong đó (`0..46184`) là chỉ số nội bộ của bộ dữ liệu
    đó, KHÔNG tương ứng với `Product.id` thật trong `ecommerce_product_db` của platform. Nạp thẳng
    checkpoint này rồi trả `item_history` thật của platform vào sẽ ra gợi ý SAI nhưng TRÔNG NHƯ hợp
    lệ — nguy hiểm hơn cả class giả trước đây (nó trả `prod_1` rõ ràng là rác).

    Vì vậy service này CHỈ tin một checkpoint có `item_space == "platform_v1"` kèm `item_id_map`
    (product_id thật -> index nội bộ dùng lúc train) — checkpoint dạng này do một script train
    RIÊNG cho dữ liệu platform sinh ra (chưa tồn tại tại thời điểm viết class này). Thiếu điều kiện
    đó, `is_ready()` trả False và nơi gọi (xem `api/endpoints/recommend.py`) phải rơi về Popularity.
    """

    def __init__(self):
        self.model: Optional[SASRecModel] = None
        self.item_to_idx: Dict[int, int] = {}
        self.idx_to_item: Dict[int, int] = {}
        self.maxlen = 20
        self._load_attempted = False

    def _ensure_loaded(self) -> None:
        if self._load_attempted:
            return
        self._load_attempted = True

        path = recs_settings.MODEL_WEIGHTS_PATH
        if not os.path.exists(path):
            logger.warning(f"Khong tim thay checkpoint SASRec tai {path} — dung Popularity fallback")
            return
        try:
            ckpt = torch.load(path, map_location="cpu", weights_only=False)
        except Exception as e:
            logger.error(f"Loi doc checkpoint SASRec ({path}): {e}")
            return

        if ckpt.get("item_space") != "platform_v1" or "item_id_map" not in ckpt:
            logger.warning(
                f"Checkpoint SASRec tai {path} co item_space={ckpt.get('item_space')!r} "
                "(khong phai 'platform_v1', hoac thieu item_id_map) — index cua model nay KHONG "
                "tuong ung voi product_id that cua platform. Bo qua, dung Popularity fallback."
            )
            return

        try:
            cfg = ckpt["config"]
            model = SASRecModel(cfg["n_items"], cfg["d_model"], cfg["n_blocks"], cfg["n_heads"], cfg["maxlen"])
            model.load_state_dict(ckpt["model_state_dict"])
            model.eval()
        except Exception as e:
            logger.error(f"Checkpoint SASRec co item_space dung nhung load that bai: {e}")
            return

        self.model = model
        self.maxlen = cfg["maxlen"]
        self.item_to_idx = {int(k): int(v) for k, v in ckpt["item_id_map"].items()}
        self.idx_to_item = {v: k for k, v in self.item_to_idx.items()}
        logger.info(
            f"Da nap SASRec platform_v1 tu {path}: {len(self.item_to_idx):,} item, "
            f"epoch={ckpt.get('epoch')}"
        )

    def is_ready(self) -> bool:
        self._ensure_loaded()
        return self.model is not None

    def recommend(self, item_history: List[int], top_k: int = 10) -> List[Dict[str, Any]]:
        """Trả về [{product_id, score}] — KHÔNG kèm name/price (tra cứu catalog thật là việc của
        endpoint, xem `catalog.get_products_by_ids`), và KHÔNG bịa dữ liệu khi rỗng."""
        self._ensure_loaded()
        if self.model is None or not item_history:
            return []

        # +1 vi index 0 danh cho pad token trong embedding
        idx_seq = [self.item_to_idx[i] + 1 for i in item_history if i in self.item_to_idx]
        if not idx_seq:
            # Toan bo lich su la item chua tung xuat hien luc train platform_v1 (vd item moi thêm)
            return []

        seq = torch.zeros((1, self.maxlen), dtype=torch.long)
        tail = idx_seq[-self.maxlen:]
        seq[0, self.maxlen - len(tail):] = torch.tensor(tail, dtype=torch.long)

        with torch.no_grad():
            h = self.model(seq)
            last_h = h[0, -1, :]
            scores = self.model.item_emb.weight @ last_h  # (n_items+1,)
            scores[0] = -float("inf")  # khong bao gio goi y pad token
            for seen_idx in set(idx_seq):
                scores[seen_idx] = -float("inf")  # khong goi y lai item da xem/mua
            k = min(top_k, scores.numel())
            top_scores, top_idx = torch.topk(scores, k)

        results = []
        for idx, score in zip(top_idx.tolist(), top_scores.tolist()):
            product_id = self.idx_to_item.get(idx - 1)
            if product_id is None:
                continue
            results.append({"product_id": product_id, "score": float(score)})
        return results


sasrec_service = SasRecService()
