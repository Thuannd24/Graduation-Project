"""SASRec phải nhận lịch sử theo thứ tự CŨ -> MỚI dù Redis trả MỚI -> CŨ (LPUSH)."""
import torch

from app.services.sasrec import SASRecModel, SasRecService


class RecordingModel(SASRecModel):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.last_input = None

    def forward(self, seqs):
        self.last_input = seqs.clone()
        return super().forward(seqs)


def _service(n_items=10, maxlen=4) -> tuple[SasRecService, RecordingModel]:
    torch.manual_seed(0)
    model = RecordingModel(n_items, d_model=8, n_blocks=1, n_heads=2, maxlen=maxlen).eval()
    svc = SasRecService()
    svc._load_attempted = True
    svc.model = model
    svc.maxlen = maxlen
    # product_id thật = 100 + index nội bộ
    svc.item_to_idx = {100 + i: i for i in range(n_items)}
    svc.idx_to_item = {i: 100 + i for i in range(n_items)}
    return svc, model


def test_newest_item_is_at_last_position():
    svc, model = _service()
    svc.recommend([103, 102, 101], top_k=3)  # newest-first: 103 là item vừa xem
    # embedding index = index nội bộ + 1 (0 = pad); left-pad
    assert model.last_input.tolist() == [[0, 2, 3, 4]]


def test_truncation_keeps_most_recent_items():
    svc, model = _service(maxlen=3)
    svc.recommend([105, 104, 103, 102, 101], top_k=3)
    # giữ 3 item MỚI nhất (103, 104, 105) theo thứ tự cũ -> mới, không phải 3 item cũ nhất
    assert model.last_input.tolist() == [[4, 5, 6]]


def test_seen_items_are_never_recommended():
    svc, _ = _service()
    recs = svc.recommend([101, 102], top_k=8)
    assert {r["product_id"] for r in recs}.isdisjoint({101, 102})
    assert len(recs) == 8
