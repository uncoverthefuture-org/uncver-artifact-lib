# Knowledge Graph Artifact

The `uncver-knowledge-graph` artifact manages artifact metadata, commands, and status using the uncver-kg knowledge graph engine. It serves as the central knowledge repository for the mercury-inception AI to query artifact capabilities.

## Architecture

```
┌─────────────────────┐
│ Mercury Inception   │
│ AI Listener         │
└──────────┬──────────┘
           │ Redis Streams
           ▼
┌─────────────────────┐
│ uncver:stream:stats │◄── Query all artifacts status
│ uncver:stream:cmds  │◄── Query artifact commands
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Knowledge Graph     │
│ Manager             │
│ (uncver-kg)         │
└──────────┬──────────┘
           │ Stores facts
           ▼
┌─────────────────────┐
│ uncver-kg KG files  │
│ (artifact metadata) │
└─────────────────────┘
```

## Redis Communication Protocol

### Stats Requests (General)

When mercury-inception AI wants to know about all artifacts:

**Request (to `uncver:stream:stats`):**
```json
{
  "type": "query_artifacts",
  "id": "msg-123",
  "from": "mercury-inception",
  "timestamp": "2024-01-15T10:30:00Z",
  "payload": {}
}
```

**Response (to `uncver:stream:responses`):**
```json
{
  "type": "artifact_list",
  "id": "resp-456",
  "from": "knowledge-graph",
  "timestamp": "2024-01-15T10:30:01Z",
  "response_to": "msg-123",
  "payload": {
    "artifacts": [
      {
        "name": "uncver-create",
        "version": "1.0.0",
        "status": "running",
        "language": "cpp",
        "commands": [...]
      }
    ],
    "count": 5
  }
}
```

### Commands Requests (Specific)

When mercury-inception AI wants commands for a specific artifact:

**Request (to `uncver:stream:commands`):**
```json
{
  "type": "query_commands",
  "id": "msg-124",
  "from": "mercury-inception",
  "timestamp": "2024-01-15T10:30:00Z",
  "payload": {
    "artifact_name": "uncver-create"
  }
}
```

**Response:**
```json
{
  "type": "command_list",
  "payload": {
    "artifact_name": "uncver-create",
    "commands": [
      {
        "name": "create_artifact",
        "description": "Create a new artifact",
        "stream": "uncver:stream:commands",
        "action": "create"
      }
    ]
  }
}
```

## Knowledge Graph Storage

The knowledge graph stores facts about artifacts:

```
uncver-create --HAS_COMMAND--> create_artifact
uncver-create --HAS_STATUS--> running
uncver-create --PROVIDES--> artifact_creation
uncver-discover --DEPENDS_ON--> uncver-redis-stream
```

## API Endpoints

- `GET /health` - Health check
- `GET /artifacts` - List all artifacts
- `GET /artifacts/{name}` - Get specific artifact
- `POST /kg/query` - Query knowledge graph
- `WS /ws` - WebSocket for real-time updates

## Integration with Mercury-Inception

The mercury-inception listener can:

1. **Query all artifact stats** before responding to the network
2. **Get specific commands** when asked to perform actions
3. **Register new artifacts** as they come online
4. **Update statuses** as artifacts start/stop

Example mercury-inception workflow:

```
User: "What can the uncver system do?"
  ↓
Mercury sends: {type: "query_artifacts"} → uncver:stream:stats
  ↓
Knowledge Graph responds with artifact list
  ↓
Mercury synthesizes response: "The system can create, start, stop,
delete, and share artifacts via Redis streams..."
```

## Running Locally

```bash
# Start Redis first
./scripts/build.sh redis-stream

# Build and run knowledge-graph
./scripts/build.sh knowledge-graph
./knowledge-graph/knowledge-graph

# Query via HTTP
curl http://localhost:8085/artifacts

# Query via Redis
redis-cli XADD uncver:stream:stats '*' type query_artifacts
```

## Environment Variables

- `REDIS_ADDR` - Redis address (default: localhost:6379)
- `KG_DATA_PATH` - Knowledge graph data directory
- `UNCVERKG_PATH` - Path to uncverkg binary
- `API_PORT` - HTTP API port (default: 8085)
