# uncver-gemma3-1b-listener

Lightweight Redis stream listener that connects to local Ollama with Google Gemma 3 1B. Features session management for conversation context.

## Overview

- **Lightweight**: ~50MB Docker image (Alpine Node.js)
- **Local AI**: Connects to Ollama running on your machine
- **Session Memory**: Maintains conversation context across messages
- **Chunking**: Splits large messages for processing
- **Redis Streams**: Async message processing

## Prerequisites

1. Install Ollama locally:
```bash
# macOS
curl -fsSL https://ollama.com/install.sh | sh

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows (PowerShell)
irm https://ollama.com/install.ps1 | iex
```

2. Pull Gemma 3 1B model:
```bash
ollama pull gemma3:1b
```

3. Start Ollama:
```bash
ollama serve
```

## Quick Start

```bash
# Start the listener
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://host.docker.internal:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `gemma3:1b` | Model to use |
| `REDIS_ADDR` | `redis:6379` | Redis server |
| `INPUT_STREAM` | `uncver:stream:input` | Input stream |
| `RESPONSE_STREAM` | `uncver:stream:response` | Output stream |
| `CHUNK_SIZE` | `200` | Characters per chunk |
| `CHUNK_OVERLAP` | `20` | Overlap between chunks |
| `MAX_CHUNKS` | `5` | Max chunks per message |

## Session Management

The listener maintains conversation context per user:
- **Context preserved** across multiple messages
- **Session timeout**: 30 minutes of inactivity
- **Message history**: Last 10 messages retained
- **Ollama context**: Passed to model for coherent responses

## Testing

```bash
# Send a message
docker exec uncver-redis-gemma redis-cli XADD uncver:stream:input '*' type stream_message content "Hello, what's the weather like?" from "user-1"

# Read response
docker exec uncver-redis-gemma redis-cli XREAD STREAMS uncver:stream:response 0

# Send follow-up (context preserved)
docker exec uncver-redis-gemma redis-cli XADD uncver:stream:input '*' type stream_message content "What about tomorrow?" from "user-1"
```

## Health Check

```bash
curl http://localhost:8080/health
```

## Architecture

```
┌─────────────┐    Redis Stream    ┌──────────────┐
│  Input      │ ────────────────►  │   Gemma      │
│  Stream     │                    │   Listener   │
└─────────────┘                    │  ┌────────┐  │
                                   │  │Session │  │
┌─────────────┐    Response        │  │Memory  │  │
│  Response   │ ◄────────────────── │  └───┬────┘  │
│  Stream     │                    │      │       │
└─────────────┘                    │  ┌───▼────┐  │
                                   │  │Ollama  │  │
                                   │  │Local   │  │
                                   │  │http:// │  │
                                   │  │11434   │  │
                                   │  └────────┘  │
                                   └──────────────┘
```
