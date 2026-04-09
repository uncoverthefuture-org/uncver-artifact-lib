# Knowledge Graph Artifact

The `uncver-knowledge-graph` artifact provides knowledge storage using **uncver-kg** CLI commands. It stores facts as Subject-Predicate-Object triples and answers queries from mercury-inception AI.

## What It Does

- **Stores facts** using uncver-kg: `uncverkg write --subject X --predicate Y --object Z`
- **Answers queries** using uncver-kg: `uncverkg read --query "search"`
- **Provides context** to mercury-inception AI before it responds

## Architecture

```
Mercury-Inception AI
       │
       ├─► Wants to respond to user about "Rust"
       │
       ▼
Sends: {type: "get_context_for_topic", payload: {topic: "Rust"}}
       │
       ▼
┌──────────────────────────┐
│ uncver:stream:queries    │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Knowledge Graph Artifact │
│ (this artifact)          │
└──────────┬───────────────┘
           │ Runs: uncverkg read --query "Rust"
           ▼
┌──────────────────────────┐
│ uncver-kg storage        │
│ (uncver-kg-kg/)          │
└──────────┬───────────────┘
           │ Returns facts about Rust
           ▼
Responds: {type: "context", payload: {facts: [...]}}
           │
           ▼
Mercury-Inception AI uses context to respond
```

## Redis Communication

### Write Knowledge

**To `uncver:stream:knowledge`:**
```json
{
  "type": "write_fact",
  "id": "msg-123",
  "from": "mercury-inception",
  "payload": {
    "subject": "David",
    "predicate": "WORKS_ON",
    "object": "Rust"
  }
}
```

This executes: `uncverkg write --subject David --predicate WORKS_ON --object Rust`

### Query Knowledge

**To `uncver:stream:queries`:**
```json
{
  "type": "query_knowledge",
  "id": "msg-124",
  "from": "mercury-inception",
  "payload": {
    "query": "David"
  }
}
```

This executes: `uncverkg read --query David`

**Response to `uncver:stream:responses`:**
```json
{
  "type": "query_results",
  "response_to": "msg-124",
  "payload": {
    "query": "David",
    "facts": [
      {"subject": "David", "predicate": "WORKS_ON", "object": "Rust"},
      {"subject": "David", "predicate": "USES", "object": "uncver-kg"}
    ],
    "count": 2
  }
}
```

### Get Context (For AI Responses)

**To `uncver:stream:queries`:**
```json
{
  "type": "get_context_for_topic",
  "id": "msg-125",
  "from": "mercury-inception",
  "payload": {
    "topic": "Rust"
  }
}
```

## uncver-kg Commands Used

| Action | Command |
|--------|---------|
| Write fact | `uncverkg write --subject '{}' --predicate '{}' --object '{}'` |
| Read/Query | `uncverkg read --query '{}'` |
| Bulk write | `uncverkg bulk --file '{}'` |

## HTTP API

- `GET /health` - Health check
- `POST /fact` - Write a fact (JSON body: `{subject, predicate, object}`)
- `GET /query?q=search` - Query knowledge graph
- `GET /subject/{name}` - Get all facts about subject

## Example Mercury-Inception Flow

```
User: "Tell me about what David is working on"

Mercury-Inception AI:
  1. Sends {type: "get_context_for_topic", topic: "David"} → queries stream
  2. Knowledge Graph queries uncver-kg
  3. Receives: David WORKS_ON Rust, David USES uncver-kg
  4. AI synthesizes response: "David is working on Rust projects 
     and uses uncver-kg for knowledge management..."
  5. AI can also store new facts if user shares more info
```

## Running Locally

```bash
# Ensure uncverkg is installed
which uncverkg

# Start Redis
./scripts/build.sh redis-stream

# Build knowledge-graph
./scripts/build.sh knowledge-graph

# Run it
./knowledge-graph/knowledge-graph

# Test via HTTP
curl -X POST http://localhost:8085/fact \
  -H "Content-Type: application/json" \
  -d '{"subject":"Test","predicate":"USES","object":"uncver-kg"}'

curl "http://localhost:8085/query?q=Test"

# Or via Redis
redis-cli XADD uncver:stream:knowledge '*' type write_fact subject Test predicate USES object uncver-kg
```

## Environment Variables

- `REDIS_ADDR` - Redis address (default: localhost:6379)
- `KG_STREAM` - Stream for knowledge writes (default: uncver:stream:knowledge)
- `QUERY_STREAM` - Stream for queries (default: uncver:stream:queries)
- `API_PORT` - HTTP API port (default: 8085)
- `UNCVERKG_PATH` - Path to uncverkg binary (default: uncverkg)
