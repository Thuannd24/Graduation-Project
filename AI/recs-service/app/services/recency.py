from typing import Any, Dict, List

from app.services.catalog import get_products_by_ids


class RecencyRecService:
    """⚠️ Chiến lược "gợi ý lại item vừa xem gần nhất", KHÔNG dùng model gì cả.

    Đo được (2026-09-21, `training/experiments/recsys_platform_sasrec.py`) trên dữ liệu THẬT
    của platform (501 user): quy tắc tầm thường này (recall@10=0,2754) THẮNG cả SASRec train
    riêng cho platform (0,1976) lẫn Popularity toàn cục (0,0020). Lý do: hành vi seed khiến user
    quay lại đúng vài sản phẩm cũ rất thường xuyên — tín hiệu "vừa xem gần đây" mạnh hơn hẳn bất
    kỳ pattern chuỗi phức tạp nào ở quy mô dữ liệu này. Dùng làm chiến lược mặc định cho user có
    lịch sử cho tới khi có checkpoint SASRec platform_v1 thật sự vượt qua được baseline này.
    """

    def recommend(self, item_history: List[int], top_k: int = 10) -> List[Dict[str, Any]]:
        # Redis luu newest-first (behavior_consumer.py dung LPUSH) nen giu THU TU dau tien gap
        # duoc = gan day nhat, chi khu trung lap (1 item co the xuat hien nhieu lan trong history).
        seen_order: List[int] = []
        seen_set = set()
        for item_id in item_history:
            if item_id not in seen_set:
                seen_order.append(item_id)
                seen_set.add(item_id)
        recent_ids = seen_order[:top_k]
        if not recent_ids:
            return []

        product_map = get_products_by_ids(recent_ids)
        results = []
        for rank, product_id in enumerate(recent_ids):
            if product_id not in product_map:
                continue  # san pham da an/xoa, bo qua thay vi bia du lieu
            results.append({**product_map[product_id], "score": float(len(recent_ids) - rank)})
        return results


recency_rec_service = RecencyRecService()
