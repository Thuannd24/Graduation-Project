FROM python:3.10-slim

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install shared common package
COPY shared-common /workspace/shared-common
RUN pip install --no-cache-dir -e /workspace/shared-common

# Copy and install recs-service
COPY recs-service /workspace/recs-service
WORKDIR /workspace/recs-service
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8003

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]
