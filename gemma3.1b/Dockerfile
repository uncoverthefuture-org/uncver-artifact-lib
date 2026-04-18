# Lightweight Node.js Redis stream listener for Ollama
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY src/ ./src/
COPY artifact.json ./

# Create non-root user
RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

# Expose port for health checks
EXPOSE 8080

# Run the listener
CMD ["node", "src/index.js"]
