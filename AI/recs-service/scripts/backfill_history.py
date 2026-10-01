"""Dựng lại Redis `user:{uid}:history` từ `ecommerce_order_db.user_events`.

Vì sao cần: consumer chỉ ghi Redis khi có event MỚI qua Kafka. User đã có lịch sử trong DB (dữ liệu
seed, hoặc sau khi Redis bị xoá/khởi động lại) sẽ bị recs-service coi là cold-start cho tới lượt xem
kế tiếp. Script này tái tạo đúng trạng thái consumer sẽ tạo ra: cùng tập action (`HISTORY_ACTIONS`),
cùng thứ tự newest-first, cùng giới hạn `HISTORY_MAX_LEN` và TTL.

Mặc định CHỈ lấp key đang trống — không đè lịch sử live mà consumer đang ghi. `--overwrite` để dựng
lại toàn bộ.

    python scripts/backfill_history.py --dry-run
    python scripts/backfill_history.py
"""
import argparse
from collections import defaultdict

from sqlalchemy import bindparam, text

from shared_common.contracts import HISTORY_ACTIONS, HISTORY_MAX_LEN, HISTORY_TTL_SECONDS, user_history_key
from shared_common.pool import get_engine, get_pooled_redis_client

# Chỉ lấy HISTORY_MAX_LEN event gần nhất mỗi user (window function — MariaDB >= 10.2)
LATEST_EVENTS_SQL = text(
    """
    SELECT user_id, item_id FROM (
        SELECT user_id, item_id,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
        FROM ecommerce_order_db.user_events
        WHERE user_id IS NOT NULL AND item_id IS NOT NULL AND action_type IN :actions
    ) t
    WHERE rn <= :max_len
    ORDER BY user_id, rn
    """
).bindparams(bindparam("actions", expanding=True))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="chỉ in thống kê, không ghi Redis")
    parser.add_argument("--overwrite", action="store_true", help="dựng lại cả key đã có dữ liệu")
    args = parser.parse_args()

    with get_engine("ecommerce_order_db").connect() as conn:
        rows = conn.execute(LATEST_EVENTS_SQL, {"actions": sorted(HISTORY_ACTIONS), "max_len": HISTORY_MAX_LEN}).all()

    newest_first: dict[str, list[int]] = defaultdict(list)
    for user_id, item_id in rows:
        newest_first[user_id].append(int(item_id))

    redis_client = get_pooled_redis_client()
    written = skipped = 0
    for user_id, items in newest_first.items():
        key = user_history_key(user_id)
        if not args.overwrite and redis_client.exists(key):
            skipped += 1
            continue
        if args.dry_run:
            written += 1
            continue
        pipe = redis_client.pipeline()
        pipe.delete(key)
        pipe.rpush(key, *items)  # RPUSH theo newest-first == trạng thái sau chuỗi LPUSH của consumer
        pipe.expire(key, HISTORY_TTL_SECONDS)
        pipe.execute()
        written += 1

    # In khong dau: console Windows (cp1252) khong encode duoc tieng Viet co dau
    mode = "DRY-RUN - " if args.dry_run else ""
    print(f"{mode}{len(newest_first):,} user co lich su | ghi {written:,} | bo qua (da co key) {skipped:,}")


if __name__ == "__main__":
    main()
