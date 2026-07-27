FROM docker.io/library/golang:1.21-alpine AS builder

RUN apk add --no-cache espeak

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o uncver-piper ./cmd/server/

FROM docker.io/library/alpine:3.19

RUN apk add --no-cache espeak

WORKDIR /app

COPY --from=builder /app/uncver-piper .

ENV REDIS_ADDR=uncver-redis-stream:6379
ENV REDIS_STREAM=uncver:stream:audio
ENV WINDOW_SECONDS=60

CMD ["./uncver-piper"]
