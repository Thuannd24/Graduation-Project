import uvicorn
from app.main import app
from app.core.config import forecast_settings

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=forecast_settings.PORT, reload=True)
