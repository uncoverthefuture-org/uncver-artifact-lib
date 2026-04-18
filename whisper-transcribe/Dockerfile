# Simple whisper using a lightweight approach
FROM node:20-alpine

# Install ffmpeg for audio conversion
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/

RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8082

CMD ["node", "src/index.js"]
