FROM python:3.10-slim

WORKDIR /workspace

# Install build dependencies if needed
# libgl1 + libglib2.0-0: OpenCV runtime libs cần cho YOLO/ultralytics khi YOLO_ENABLED=true
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy shared common package and build it
COPY shared-common /workspace/shared-common
RUN pip install --no-cache-dir -e /workspace/shared-common

# Copy search-service and install requirements
COPY search-service /workspace/search-service
WORKDIR /workspace/search-service
# Cài PyTorch bản CPU-only trước (nhẹ hơn ~4 lần so với bản CUDA mặc định) để
# sentence-transformers/ultralytics dùng lại, tránh pip kéo về wheel CUDA ~2.5GB
# gây OOM khi build. Container không dùng GPU (YOLO_ENABLED/PRELOAD_MODELS=false).
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
