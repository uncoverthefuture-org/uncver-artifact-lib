# uncver-redis-stream-chat-web

Web chat interface for communicating with AI through Redis streams. Connects to the gemma3.1b listener or any other Redis stream-based AI.

## Overview

- **Real-time Chat**: WebSocket-based instant messaging
- **Session Management**: Separate chat sessions with message history
- **Redis Integration**: Sends to `uncver:stream:input`, receives from `uncver:stream:response`
- **Message History**: Last 100 messages per session
- **Auto-reconnect**: Handles connection drops gracefully

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Browser   │ ◄────────────────► │ redis-stream-    │
│   (Chat)    │                    │ chat-web         │
└─────────────┘                    │  ┌────────────┐  │
                                    │  │  Session   │  │
                                    │  │  Manager   │  │
                                    │  └─────┬──────┘  │
                                    │        │         │
                                    │  ┌─────▼──────┐  │
                                    │  │   Redis    │  │
                                    │  │  Streams   │  │
                                    │  └─────┬──────┘  │
                                    └────────┼─────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  Gemma AI       │
                                    │  (ollama)       │
                                    └─────────────────┘
```

## Quick Start

```bash
# Start the chat web interface
docker-compose up -d

# Open browser to http://localhost:3000

# Configure settings (gear icon):
# - Session ID: unique identifier for your chat session
# - WebSocket URL: ws://localhost:3000
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Web server port |
| `REDIS_ADDR` | `redis:6379` | Redis server address |
| `REDIS_PASSWORD` | `` | Redis password |
| `INPUT_STREAM` | `uncver:stream:input` | Stream to send messages |
| `RESPONSE_STREAM` | `uncver:stream:response` | Stream to receive responses |

## Features

### Session-Based Chat
- Each session has isolated message history
- Multiple users can chat in different sessions
- Session ID persisted in localStorage

### Message Types
- **User messages**: Sent to Redis input stream
- **AI responses**: Received from Redis response stream
- **System messages**: Connection status, errors

### WebSocket Events

**Client → Server:**
- `chat_message`: Send a message to the AI
- `ping`: Heartbeat

**Server → Client:**
- `connected`: Connection established
- `history`: Previous messages for session
- `user_message`: Message from another client in same session
- `ai_message`: AI response from Redis stream
- `message_sent`: Confirmation of sent message
- `error`: Error notification

## Testing

```bash
# Start Redis (if not running)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Start gemma3.1b listener
cd ../gemma3.1b && docker-compose up -d

# Start chat web
cd ../redis-stream-chat-web && docker-compose up -d

# Open browser to http://localhost:3000
```

## API Endpoints

- `GET /health` - Health check
- `WebSocket /` - Chat connection (use `?session=SESSION_ID`)

## Message Format

### Input Stream (`uncver:stream:input`)
```json
{
  "type": "stream_message",
  "id": "unique-id",
  "content": "User message",
  "from": "session-id",
  "timestamp": "2024-01-15T10:30:00Z",
  "metadata": {
    "clientId": "uuid",
    "sessionId": "session-id"
  }
}
```

### Response Stream (`uncver:stream:response`)
```json
{
  "type": "ai_response",
  "id": "response-id",
  "content": "AI response",
  "from": "gemma-instance-id",
  "timestamp": "2024-01-15T10:30:05Z",
  "metadata": {
    "originalId": "message-id",
    "originalFrom": "session-id",
    "model": "gemma3:1b",
    "chunks_count": 1
  }
}
```

## Dependencies

- Express.js - Web server
- WebSocket (ws) - Real-time communication
- ioredis - Redis client
- uuid - Unique identifiers

## Related Artifacts

- `gemma3.1b` - AI listener that processes messages
- `redis-stream` - Redis infrastructure
