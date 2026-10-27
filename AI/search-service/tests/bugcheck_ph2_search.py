"""PH2 (AI search) — BugCheck: khẳng định HÀNH VI ĐÚNG nghiệp vụ mà code hiện tại CHƯA đạt.

Không khớp mẫu `test_*.py` nên `pytest` mặc định không thu thập. Chạy riêng:
`python -m pytest tests/bugcheck_ph2_search.py`.
"""
import struct
import zlib

import pytest
from fastapi.testclient import TestClient

from app.api.endpoints import search as search_ep
from app.main import app
from app.services.image_loader import InvalidImageError, load_image_from_bytes


def _png_header_only(width: int, height: int) -> bytes:
    """PNG hợp lệ về cấu trúc, khai báo kích thước rất lớn nhưng chỉ vài chục byte (ảnh 'bom giải nén')."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"")) + chunk(b"IEND", b"")


def test_tc_ph2_img_06_decompression_bomb_is_invalid_image():
    """TC_PH2_IMG_06: Ảnh khai báo 20000x20000 px (bom giải nén, chỉ ~60 byte) phải bị coi là ảnh không hợp lệ (InvalidImageError -> 400).
    Hiện tại PIL ném DecompressionBombError (không phải OSError) nên lọt qua except, endpoint trả 500 'Visual search failed'."""
    data = _png_header_only(20000, 20000)
    assert len(data) < 200
    with pytest.raises(InvalidImageError):
        load_image_from_bytes(data)


def test_tc_ph2_hyb_06_negative_top_k_rejected(monkeypatch):
    """TC_PH2_HYB_06: top_k âm phải bị từ chối 422. Hiện tại không có ràng buộc (Query(10) không ge=1): top_k=-5 -> pool=-15 được
    gửi thành `size=-15` lên Elasticsearch, ES báo lỗi và catalog._mark_es_down() tắt BM25 30s cho MỌI người dùng."""
    monkeypatch.setattr(search_ep.hybrid_search_service, "search", lambda **kw: [])
    r = TestClient(app).get("/api/v1/public/search", params={"q": "iphone", "top_k": -5})
    assert r.status_code == 422, f"status={r.status_code}"
