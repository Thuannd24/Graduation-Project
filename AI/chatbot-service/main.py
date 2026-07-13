import uvicorn
from app.main import app
from app.core.config import chatbot_settings

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=chatbot_settings.PORT, reload=True)
