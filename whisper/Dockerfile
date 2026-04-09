FROM golang:1.21-alpine

RUN apk add --no-cache sox bash whisper

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o uncver-whisper ./cmd/server/

FROM alpine:3.19

RUN apk add --no-cache sox bash whisper

WORKDIR /app

COPY --from=0 /app/uncver-whisper .

ENV REDIS_ADDR=localhost:6379
ENV REDIS_STREAM_IN=uncver:stream:audio:raw
ENV REDIS_STREAM_OUT=uncver:stream:audio:text
ENV BATCH_SIZE=10

CMD ["./uncver-whisper"]
