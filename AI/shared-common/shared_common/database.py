import redis
from pymongo import MongoClient
import pymysql
from shared_common.config import shared_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

# Redis Client
def get_redis_client():
    try:
        client = redis.Redis(
            host=shared_settings.REDIS_HOST,
            port=shared_settings.REDIS_PORT,
            decode_responses=True
        )
        return client
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise e

# MongoDB Client
def get_mongo_client():
    try:
        client = MongoClient(shared_settings.MONGO_URI)
        return client
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise e

# MySQL/MariaDB Connection
def get_mysql_connection():
    try:
        conn = pymysql.connect(
            host=shared_settings.DB_HOST,
            port=shared_settings.DB_PORT,
            user=shared_settings.DB_USER,
            password=shared_settings.DB_PASSWORD,
            database=shared_settings.DB_NAME,
            cursorclass=pymysql.cursors.DictCursor
        )
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to MySQL/MariaDB: {e}")
        raise e
