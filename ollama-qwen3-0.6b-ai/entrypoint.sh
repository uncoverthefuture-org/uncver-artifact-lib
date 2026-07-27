#!/bin/sh
set -e

OLLAMA_HOST="${OLLAMA_HOST:-uncver-ollama}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"
OLLAMA_URL="http://${OLLAMA_HOST}:${OLLAMA_PORT}"

echo "Waiting for Ollama at ${OLLAMA_URL}..."
for i in $(seq 1 30); do
  if curl -s "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
    echo "Ollama is ready"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "Error: Ollama not available after 30 seconds"
    exit 1
  fi
  sleep 1
done

echo "Starting AI router..."
exec node /app/dist/index.js
