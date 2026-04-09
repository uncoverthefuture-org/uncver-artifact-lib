# uncver-mecury-inception-listener

AI-powered Redis stream listener that asynchronously reviews and responds to messages using Mercury Inception AI.

## Overview

This artifact listens to a Redis stream for incoming messages, processes them through Mercury Inception AI, and publishes AI-generated responses back to a response stream. It features:

- **Asynchronous Processing**: Non-blocking message processing to prevent bottlenecks
- **Loop Prevention**: Does not respond to its own messages (identified by instance ID)
- **GUI Configuration**: Web-based UI for model selection and API key management
- **Encrypted Storage**: API keys are encrypted before storage
- **Real-time Activity Log**: WebSocket-based live activity monitoring

## Architecture

```
┌─────────────────────┐      Redis Stream       ┌──────────────────────────┐
│   Input Stream      │ ──────────────────────► │  Mercury Inception       │
│  (uncver:stream:   │                        │  Listener                │
│      input)        │                        │                          │
└─────────────────────┘                        │  ┌────────────────────┐  │
                                               │  │ Message Processor  │  │
                                               │  │ (async goroutine) │  │
                                               │  └────────┬───────────┘  │
                                               │           │                │
                                               │           ▼                │
                                               │  ┌────────────────────┐  │
                                               │  │ Mercury Inception  │  │
                                               │  │ API (OpenAI-like)  │  │
                                               │  └────────┬───────────┘  │
                                               └────────────┼────────────────┘
                                                           │
                                                           ▼
                                               ┌──────────────────────────┐
                                               │   Response Stream         │
                                               │  (uncver:stream:response)│
                                               └──────────────────────────┘
```

## Quick Start

### Prerequisites

- Redis server (or use `uncver-redis-stream-artifact`)
- Mercury Inception API key

### Run Locally

```bash
# Clone the repository
git clone https://github.com/uncver/uncver-artifact-lib.git
cd uncver-artifact-lib/mecury-inception-listener

# Install dependencies
go mod tidy

# Run
go run cmd/server/main.go
```

### Run with Docker

```bash
# Build
docker build -t uncver-mecury-inception-listener .

# Run
docker run -d \
  -p 8080:8080 \
  -e REDIS_ADDR=redis:6379 \
  -e MERCURY_API_URL=https://api.mercuryinception.ai/v1 \
  --name mercury-listener \
  uncver-mecury-inception-listener
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_ADDR` | `localhost:6379` | Redis server address |
| `REDIS_PASSWORD` | `` | Redis password (if required) |
| `MERCURY_API_URL` | `https://api.mercuryinception.ai/v1` | Mercury Inception API endpoint |
| `CONFIG_PORT` | `8080` | HTTP port for configuration GUI |
| `INPUT_STREAM` | `uncver:stream:input` | Redis stream to listen to |
| `OUTPUT_STREAM` | `uncver:stream:output` | Redis stream for general output |
| `RESPONSE_STREAM` | `uncver:stream:response` | Redis stream for AI responses |
| `ENCRYPTION_KEY` | `uncver-mercury-inception-default-key-32!` | Key for API key encryption |

## Configuration GUI

Open `http://localhost:8080` in your browser to access the configuration panel:

### Features

- **Model Selection**: Choose from available Mercury Inception models
- **API Key Management**: Securely enter and store your API key
- **Status Monitoring**: View listener status and activity
- **Real-time Logs**: Live activity feed showing processed messages

### API Key Security

The API key is encrypted using AES-256-GCM before being stored in memory. The encryption key can be customized via the `ENCRYPTION_KEY` environment variable.

## Message Format

### Input Message (to input stream)

```json
{
  "type": "stream_message",
  "id": "msg-123",
  "content": "What is the capital of France?",
  "from": "user-456",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Output Message (from response stream)

```json
{
  "type": "ai_response",
  "id": "msg-123-response",
  "content": "The capital of France is Paris.",
  "from": "mercury-listener-instance-id",
  "timestamp": "2024-01-15T10:30:01Z",
  "metadata": {
    "original_id": "msg-123",
    "model": "mercury-inception-v1"
  }
}
```

## Redis Streams

### Default Streams

| Stream | Purpose |
|--------|---------|
| `uncver:stream:input` | Incoming messages to process |
| `uncver:stream:output` | General output messages |
| `uncver:stream:response` | AI-generated responses |

## WebSocket Protocol

Connect to `ws://localhost:8080/ws` for real-time configuration updates.

### Server → Client Messages

```json
// Configuration update
{ "type": "config", "payload": { "model": "...", "enabled": true } }

// Activity notification
{ "type": "response_sent", "payload": { "original_id": "...", "content": "..." } }

// Error notification
{ "type": "error", "payload": { "message_id": "...", "error": "..." } }
```

## Related Artifacts

- [uncver-redis-stream-artifact](https://github.com/uncver/uncver-redis-stream-artifact) - Redis infrastructure for streams
- [uncver-websocket-stream-artifact](https://github.com/uncver/uncver-websocket-stream-artifact) - WebSocket broadcasting

## License

MIT
