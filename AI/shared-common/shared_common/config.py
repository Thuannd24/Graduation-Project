import os
from dotenv import load_dotenv
from pydantic import BaseModel

# One shared env file for every service under AI/ (AI/.env, gitignored — see AI/.env.example).
# shared_common lives at AI/shared-common/shared_common/, so AI/ is 2 levels up from this file.
_AI_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(_AI_ROOT, ".env"))


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
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")


shared_settings = SharedSettings()
