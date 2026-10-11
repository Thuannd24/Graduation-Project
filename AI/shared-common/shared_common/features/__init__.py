"""Định nghĩa feature dùng chung cho mọi model AI đọc dữ liệu user (churn, recs, pricing...).

Trước module này, mỗi service AI tự viết SQL riêng cho cùng khái niệm ("recency" ở
forecast-service tính từ `orders`, "history" ở recs-service lấy từ Redis) — dẫn tới định nghĩa
lệch nhau giữa các model. Từ giờ: MỘT định nghĩa duy nhất ở đây, mọi service import lại.
"""
from shared_common.features.assembler import FEATURE_VERSION, build_feature_matrix

__all__ = ["FEATURE_VERSION", "build_feature_matrix"]
