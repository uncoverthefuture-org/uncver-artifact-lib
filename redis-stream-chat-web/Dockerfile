# Lightweight Node.js chat web interface for Redis streams
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY src/ ./src/
COPY public/ ./public/
COPY artifact.json ./

# Create non-root user
RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

# Expose web server port
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]
