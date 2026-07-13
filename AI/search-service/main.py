import uvicorn
from app.main import app
from app.core.config import search_settings

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=search_settings.PORT, reload=True)
