FROM golang:1.21-alpine

RUN apk add --no-cache espeak

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o uncver-piper ./cmd/server/

FROM alpine:3.19

RUN apk add --no-cache espeak

WORKDIR /app

COPY --from=0 /app/uncver-piper .

ENV REDIS_ADDR=localhost:6379
ENV REDIS_STREAM=uncver:stream:audio
ENV WINDOW_SECONDS=60

CMD ["./uncver-piper"]
