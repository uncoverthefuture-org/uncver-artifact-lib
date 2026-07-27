FROM docker.io/library/golang:1.21-alpine AS builder

RUN apk add --no-cache sox bash

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o uncver-mic ./cmd/server/

FROM docker.io/library/alpine:3.19

RUN apk add --no-cache sox bash

WORKDIR /app

COPY --from=builder /app/uncver-mic .

ENV REDIS_ADDR=uncver-redis-stream:6379
ENV REDIS_STREAM=uncver:stream:audio:raw
ENV CHUNK_DURATION_MS=1000
ENV SAMPLE_RATE=16000

CMD ["./uncver-mic"]
