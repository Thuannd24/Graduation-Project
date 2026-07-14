FROM python:3.10-slim

WORKDIR /workspace

# Install build dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy shared common package and build it
COPY shared-common /workspace/shared-common
RUN pip install --no-cache-dir -e /workspace/shared-common

# Copy search-service and install requirements
COPY search-service /workspace/search-service
WORKDIR /workspace/search-service
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
