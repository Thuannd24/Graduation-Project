"""Connection pooling dùng chung cho mọi service AI.

`shared_common.database` (bản cũ) mở 1 connection MỚI mỗi lần gọi `get_redis_client()`/
`get_mysql_connection()` — không sao với traffic thấp, nhưng behavior_consumer.py (Phase 4)
xử lý MỌI lượt xem sản phẩm/thao tác giỏ hàng nên cần connection pool thật, nếu không sẽ hết
file descriptor rất nhanh dưới tải liên tục.

`database.py` được giữ nguyên cho code cũ (search/chatbot/recs-service đang import nó), coi là
deprecated cho code mới. Code mới (Phase 4 trở đi) dùng module này.
"""
from __future__ import annotations

import redis
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool

from shared_common.config import shared_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

_redis_pool: redis.ConnectionPool | None = None
_engines: dict[str, Engine] = {}


def get_pooled_redis_client() -> redis.Redis:
    """Redis client dùng chung 1 ConnectionPool cho cả process (thay vì tạo connection mới
    mỗi lần gọi như `shared_common.database.get_redis_client`)."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool(
            host=shared_settings.REDIS_HOST,
            port=shared_settings.REDIS_PORT,
            decode_responses=True,
            max_connections=50,
        )
        logger.info(
            f"Initialized Redis connection pool host={shared_settings.REDIS_HOST} "
            f"port={shared_settings.REDIS_PORT}"
        )
    return redis.Redis(connection_pool=_redis_pool)


def get_engine(
    db_name: str,
    *,
    host: str | None = None,
    port: int | None = None,
    user: str | None = None,
    password: str | None = None,
) -> Engine:
    """SQLAlchemy engine có pool, cache theo `db_name` để không tạo lại engine (và pool bên
    trong nó) mỗi lần gọi. Mặc định dùng credential từ `shared_settings`; truyền `user`/`password`
    riêng khi cần một tài khoản chỉ-đọc cho DB của service khác (xem ghi chú production bên dưới).

    Lưu ý production: với DB không thuộc sở hữu của service đang gọi (vd forecast-service đọc
    `ecommerce_product_db`/`ecommerce_promotion_db` để lấy feature), nên tạo 1 MySQL user riêng
    chỉ có quyền SELECT trên đúng bảng cần và truyền vào qua `user`/`password` (hoặc biến môi
    trường `<DB>_READONLY_USER`/`<DB>_READONLY_PASSWORD`) thay vì dùng chung tài khoản root ghi
    được của `ecommerce_order_db`. Việc tạo user đó là thao tác hạ tầng (GRANT trên MySQL), không
    thể làm từ code — ghi chú lại đây để nhớ làm khi triển khai thật.
    """
    cache_key = f"{host or shared_settings.DB_HOST}:{port or shared_settings.DB_PORT}/{db_name}:{user or shared_settings.DB_USER}"
    if cache_key not in _engines:
        url = (
            f"mysql+pymysql://{user or shared_settings.DB_USER}:"
            f"{password or shared_settings.DB_PASSWORD}@"
            f"{host or shared_settings.DB_HOST}:{port or shared_settings.DB_PORT}/{db_name}"
        )
        _engines[cache_key] = create_engine(
            url,
            poolclass=QueuePool,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,  # tránh lỗi "MySQL server has gone away" trên connection cũ
        )
        logger.info(f"Initialized SQLAlchemy engine for db={db_name} (pooled)")
    return _engines[cache_key]
