# uncver-discover-artifact

Pure registry service for storing artifact metadata in SQLite. This service only stores and manages artifact data - it does not start, create, or manage running artifacts.

## Purpose

A **PURE REGISTRY** service that:
- Stores artifact metadata in SQLite with FTS5 full-text search
- Accepts registrations from multiple sources (Redis Stream, WebSocket, REST API)
- Broadcasts new registrations to WebSocket clients and Redis channels
- Tracks versions and provides fast search capabilities

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    uncver-discover-artifact                     │
│                         (Registry Service)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Redis Stream │  │  WebSocket   │  │   REST API   │          │
│  │   (Input)    │  │  (Input)     │  │   (Input)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                 │                  │
│         └──────────────────┼─────────────────┘                  │
│                            │                                    │
│                            ▼                                    │
│              ┌─────────────────────────┐                        │
│              │   Registry Service      │                        │
│              │   (internal/registry)   │                        │
│              └───────────┬─────────────┘                        │
│                          │                                      │
│              ┌───────────┴───────────┐                         │
│              │                       │                         │
│              ▼                       ▼                         │
│    ┌─────────────────┐   ┌──────────────────┐                │
│    │   SQLite DB     │   │  Redis Streams   │                │
│    │   (Storage)     │   │   (Broadcast)    │                │
│    └─────────────────┘   └──────────────────┘                │
│                                    │                           │
│         ┌──────────────────────────┼──────────────────┐       │
│         │                          │                  │       │
│         ▼                          ▼                  ▼       │
│  ┌──────────────┐       ┌──────────────┐    ┌──────────────┐ │
│  │ WebSocket    │       │ uncver:      │    │ uncver:      │ │
│  │ Broadcast    │       │ discover:    │    │ discover:    │ │
│  │              │       │ registered   │    │ update       │ │
│  └──────────────┘       └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Input Sources

1. **Redis Stream** `uncver:discover:register`
   - External services register artifacts via Redis stream
   - Consumer group processes messages with automatic retry

2. **WebSocket** `/ws`
   - Real-time bidirectional communication
   - Clients can send registration messages and receive broadcasts

3. **REST API** `/api/artifacts`
   - Direct HTTP registration endpoint
   - JSON-based request/response

## Output Channels

1. **Redis Stream** `uncver:discover:registered`
   - Confirms successful registrations

2. **Redis Stream** `uncver:discover:update`
   - Version update notifications

3. **Redis Pub/Sub** `uncver:discover:broadcast`
   - For websocket-stream service to relay to other services

4. **WebSocket Broadcast**
   - Real-time updates to all connected clients

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/artifacts` | Register a new artifact |
| GET | `/api/artifacts` | List artifacts (paginated) |
| GET | `/api/artifacts/{id}` | Get artifact by ID |
| PUT | `/api/artifacts/{id}` | Update artifact version |
| GET | `/api/search?q=query` | Search artifacts |
| GET | `/api/stats` | Get registry statistics |
| GET | `/health` | Health check |
| WS | `/ws` | WebSocket endpoint |

### WebSocket Actions

| Action | Description |
|--------|-------------|
| `register` | Register a new artifact |
| `update` | Update an artifact |
| `get` | Get artifact by ID |
| `list` | List artifacts |
| `search` | Search artifacts |

### WebSocket Message Format

```json
{
  "action": "register",
  "artifact": {
    "name": "my-artifact",
    "description": "Description here",
    "repository_url": "https://github.com/user/repo",
    "container_image": "myregistry/artifact:v1.0",
    "version": "1.0.0",
    "author": "user@example.com",
    "tags": ["go", "service"]
  }
}
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./artifacts.db` | SQLite database file path |
| `REDIS_ADDR` | `localhost:6379` | Redis server address |
| `REDIS_PASSWORD` | `` | Redis password |
| `REDIS_DB` | `0` | Redis database number |
| `HTTP_PORT` | `8080` | HTTP server port |

## Running

```bash
# Install dependencies
go mod download

# Run the server
go run cmd/server/main.go

# Or with custom configuration
DB_PATH=/data/artifacts.db REDIS_ADDR=redis:6379 HTTP_PORT=8080 go run cmd/server/main.go
```

## Building

```bash
# Build binary
go build -o uncver-discover-artifact cmd/server/main.go

# Build with CGO enabled (required for SQLite)
CGO_ENABLED=1 go build -o uncver-discover-artifact cmd/server/main.go
```

## Database Schema

### artifacts Table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | Unique artifact ID |
| name | TEXT | Artifact name |
| description | TEXT | Description |
| repository_url | TEXT | Source repository URL |
| container_image | TEXT | Container image reference |
| version | TEXT | Current version |
| author | TEXT | Author identifier |
| tags | TEXT | JSON array of tags |
| downloads | INTEGER | Download count |
| rating | REAL | Rating (0-5) |
| created_at | DATETIME | Creation timestamp |
| updated_at | DATETIME | Last update timestamp |

### FTS5 Virtual Table

Full-text search is enabled via the `artifacts_fts` virtual table, indexed on:
- name
- description
- tags

## File Structure

```
uncver-discover-artifact/
├── go.mod
├── go.sum
├── cmd/
│   └── server/
│       └── main.go              # HTTP server entry point
└── internal/
    ├── models/
    │   └── artifact.go          # Artifact struct and related types
    ├── db/
    │   └── database.go          # SQLite operations
    ├── redis/
    │   └── client.go            # Redis client for streams
    ├── websocket/
    │   └── handler.go           # WebSocket connection handler
    └── registry/
        └── service.go           # Core registry logic
```

## Key Features

- **Pure Registry**: Only stores metadata, never creates/starts artifacts
- **Multiple Inputs**: Redis streams, WebSocket, and REST API
- **Broadcast**: Publishes to multiple output channels
- **FTS5 Search**: Fast full-text search on name, description, and tags
- **Version Tracking**: Automatic version update notifications
- **WAL Mode**: SQLite write-ahead logging for concurrent access

## Redis Stream Message Format

### Input (uncver:discover:register)

```json
{
  "action": "register",
  "artifact": {
    "name": "example-service",
    "description": "An example service",
    "repository_url": "https://github.com/example/service",
    "container_image": "example/service:v1.0",
    "version": "1.0.0",
    "author": "developer@example.com",
    "tags": ["go", "microservice"]
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Output (uncver:discover:registered)

```json
{
  "action": "register",
  "artifact_id": "example-service_1705315800",
  "status": "success",
  "message": "Artifact registered successfully",
  "timestamp": "2024-01-15T10:30:01Z"
}
```

## Testing

```bash
# Register via REST API
curl -X POST http://localhost:8080/api/artifacts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-artifact",
    "description": "Test description",
    "version": "1.0.0",
    "author": "test@example.com",
    "tags": ["test", "go"]
  }'

# List artifacts
curl http://localhost:8080/api/artifacts

# Search artifacts
curl "http://localhost:8080/api/search?q=test"

# Get stats
curl http://localhost:8080/api/stats
```
