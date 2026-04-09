FROM golang:1.21-alpine

RUN apk add --no-cache sox bash

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o uncver-mic ./cmd/server/

FROM alpine:3.19

RUN apk add --no-cache sox bash

WORKDIR /app

COPY --from=0 /app/uncver-mic .

ENV REDIS_ADDR=localhost:6379
ENV REDIS_STREAM=uncver:stream:audio:raw
ENV CHUNK_DURATION_SEC=5
ENV SAMPLE_RATE=16000

CMD ["./uncver-mic"]
