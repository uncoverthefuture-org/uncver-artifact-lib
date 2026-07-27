FROM docker.io/library/golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o uncver-piper ./cmd/server/

FROM docker.io/library/debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  alsa-utils curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN curl -sL \
  https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz \
  -o /tmp/piper.tar.gz \
  && mkdir -p /app/piper \
  && tar -xzf /tmp/piper.tar.gz -C /tmp \
  && mv /tmp/piper /app/piper/piper \
  && chmod +x /app/piper/piper/piper \
  && rm /tmp/piper.tar.gz

WORKDIR /app

RUN curl -sL \
  https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx \
  -o /tmp/model.onnx \
  && curl -sL \
  https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json \
  -o /tmp/model.onnx.json \
  && mv /tmp/model.onnx . \
  && mv /tmp/model.onnx.json .

COPY --from=builder /app/uncver-piper .

ENV REDIS_ADDR=uncver-redis-stream:6379
ENV INPUT_STREAM=uncver:ai:router

CMD ["./uncver-piper"]
