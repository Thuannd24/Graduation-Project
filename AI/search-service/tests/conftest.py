import os
import sys

# Chạy `pytest` từ AI/search-service: cho phép `import app...` như lúc uvicorn chạy service.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
