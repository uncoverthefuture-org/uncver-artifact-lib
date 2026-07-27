#!/bin/sh
set -e

MODEL="${OLLAMA_MODEL:-qwen3:0.6b}"

echo "Starting Ollama server..."
ollama serve > /dev/null 2>&1 &
OLLAMA_PID=$!

echo "Waiting for Ollama to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Ollama is ready (PID $OLLAMA_PID)"
    break
  fi
  sleep 1
done

if curl -s http://localhost:11434/api/tags | grep -q "\"name\":\"$MODEL\""; then
  echo "Model $MODEL already cached"
else
  echo "Pulling model $MODEL..."
  ollama pull "$MODEL"
fi

echo "Ollama ready — serving on 0.0.0.0:11434"
wait $OLLAMA_PID
