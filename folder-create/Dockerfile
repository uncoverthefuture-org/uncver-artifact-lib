FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY artifact.json ./

RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

CMD ["node", "src/index.js"]
