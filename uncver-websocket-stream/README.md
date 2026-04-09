# uncver-websocket-stream

Public WebSocket broadcaster for uncver artifact discovery.

## Overview

Simple relay service that broadcasts artifact updates to all connected WebSocket clients.

**Input:** Redis Stream `uncver:discover:broadcast`  
**Output:** WebSocket broadcast to all connected clients

## Architecture

```
┌─────────────────┐     Redis Stream      ┌──────────────────────┐
│  discover-      │ ─────────────────────►│  websocket-stream    │
│  artifact       │ uncver:discover:      │  (This Service)      │
│                 │    broadcast          │                      │
└─────────────────┘                       │  ┌────────────────┐  │
                                          │  │   WebSocket    │  │
                                          │  │   Hub          │  │
                                          │  └────────────────┘  │
                                          │         │            │
                                          │         ▼            │
                                          │  ┌────────────────┐  │
                                          │  │  Public Clients│  │
                                          │  │  (Browsers,    │  │
                                          │  │   CLIs, etc.)  │  │
                                          │  └────────────────┘  │
                                          └──────────────────────┘
```

## Usage

```bash
# Run locally
go run cmd/server/main.go

# Or with custom Redis
REDIS_ADDR=redis:6379 go run cmd/server/main.go
```

## WebSocket Protocol

Connect to: `ws://host:8080/ws`

Messages are JSON format:
```json
{
  "type": "artifact_registered",
  "artifact_id": "uuid",
  "name": "my-artifact",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Docker

```bash
docker build -t uncver-websocket-stream .
docker run -p 8080:8080 -e REDIS_ADDR=redis:6379 uncver-websocket-stream
```
