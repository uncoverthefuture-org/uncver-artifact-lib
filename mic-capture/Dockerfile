FROM node:20-alpine

# Install sox for audio capture
RUN apk add --no-cache sox

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/

RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8081

CMD ["node", "src/index.js"]
