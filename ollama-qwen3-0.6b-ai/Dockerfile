FROM node:22-bookworm AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/download/ollama-linux-amd64.tgz -o /tmp/ollama.tgz && \
    tar -C /usr/local -xzf /tmp/ollama.tgz && \
    rm /tmp/ollama.tgz

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

ENV OLLAMA_HOST=0.0.0.0
ENV OLLAMA_KEEP_ALIVE=5m

EXPOSE 11434

CMD ["./entrypoint.sh"]
