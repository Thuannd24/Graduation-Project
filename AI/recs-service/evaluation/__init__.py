"""Harness đánh giá gợi ý DUY NHẤT của dự án (plan GĐ2, docs/canvas/recsys-p1-assessment-and-plan.md).

Mọi con số đưa vào báo cáo phải ra từ đây — cùng protocol, cùng metric, cùng class model với serving
(`app.services.sasrec.SASRecModel`), để không còn cảnh script train đo một kiểu, service phục vụ một kiểu.

    python -m evaluation.run --source platform --seeds 3
    python -m evaluation.run --source csv --csv events.csv --user-col user_id --item-col product_id --ts-col event_time
"""
