FROM docker.io/library/python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  espeak-ng alsa-utils curl \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --timeout 300 --no-cache-dir kokoro

WORKDIR /app
COPY cmd/server/main.py .

ENV REDIS_ADDR=uncver-redis-stream:6379
ENV INPUT_STREAM=uncver:ai:router
ENV VOICE=af_heart

CMD ["python", "main.py"]
