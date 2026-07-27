import os
from pydantic import BaseModel

class SharedSettings(BaseModel):
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017/ecommerce_product_nosql")
    
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "3308"))
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "root")
    DB_NAME: str = os.getenv("DB_NAME", "ecommerce_product_db")

    # API Keys
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    # Kafka (dùng bởi các service AI tham gia ingest hành vi / phát sự kiện risk)
    KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:29092")

    # Nơi lưu model artifact đã train (KMeans/scaler/LogisticRegression...). Mặc định là path
    # tương đối "data/models" — khi WORKDIR của service là /workspace/<service>, path này khớp
    # đúng volume mount ./models:/workspace/<service>/data/models khai trong docker-compose.
    MODELS_DIR: str = os.getenv("MODELS_DIR", "data/models")

shared_settings = SharedSettings()
