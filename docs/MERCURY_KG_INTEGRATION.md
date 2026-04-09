# Mercury-Inception + Knowledge Graph Integration

This document explains how the `mecury-inception-listener` artifact uses the `knowledge-graph` artifact to get context before responding to the network.

## System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INPUT                                  │
│  "Tell me about Rust"                                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│            MERCURY-INCEPTION LISTENER                           │
│  1. Receives message from Redis stream                          │
│  2. Detects it's a question about "Rust"                        │
│  3. Needs context before responding                             │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ Step 1: REQUEST CONTEXT
           │ {type: "get_context_for_topic", topic: "Rust"}
           ▼
┌─────────────────────────────────────────────────────────────────┐
│            REDIS STREAM: uncver:stream:queries                  │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│            KNOWLEDGE-GRAPH ARTIFACT                             │
│  4. Listens on query stream                                     │
│  5. Runs: uncverkg read --query "Rust"                          │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│            UNCOVER-KG STORAGE                                   │
│  (uncver-kg-kg/ directory with facts)                           │
│                                                                 │
│  Facts stored:                                                  │
│  - Rust --IS_A--> programming_language                          │
│  - Rust --HAS_FEATURE--> memory_safety                          │
│  - David --WORKS_ON--> Rust                                     │
│  - User --ASKED_ABOUT--> Rust                                   │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ Step 2: RETURN CONTEXT
           │ {facts: [...]}
           ▼
┌─────────────────────────────────────────────────────────────────┐
│            REDIS STREAM: uncver:stream:responses                │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│            MERCURY-INCEPTION LISTENER                           │
│  6. Receives context facts                                      │
│  7. Queries Mercury API with context + question                 │
│  8. Gets AI-generated response                                  │
│  9. Can also store new facts from conversation                  │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ Step 3: SEND RESPONSE
           │ {type: "ai_response", content: "..."}
           ▼
┌─────────────────────────────────────────────────────────────────┐
│            NETWORK (other artifacts/users)                      │
│  Receives informed response about Rust                          │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Stats vs Knowledge (Separate Concerns)

- **Stats** = Artifact status, health, commands → Use `discover` artifact
- **Knowledge** = Facts about topics, user preferences → Use `knowledge-graph` artifact

### 2. Redis Stream Separation

| Stream | Purpose | Used By |
|--------|---------|---------|
| `uncver:stream:commands` | Artifact commands | discover, all artifacts |
| `uncver:stream:stats` | Artifact status | discover, monitoring |
| `uncver:stream:knowledge` | Knowledge writes | knowledge-graph |
| `uncver:stream:queries` | Knowledge queries | knowledge-graph |
| `uncver:stream:responses` | All responses | mercury-inception |

### 3. Mercury-Inception Uses Knowledge Graph For:

1. **Getting context** before responding to questions
2. **Storing facts** learned from conversation
3. **Remembering** user preferences and history

## Example Message Flow

### User Asks About Topic

**User → Network:**
```json
{
  "type": "chat_message",
  "content": "What do you know about Rust?"
}
```

**Mercury-Inception → Knowledge-Graph:**
```json
{
  "type": "get_context_for_topic",
  "id": "req-001",
  "from": "mercury-inception",
  "payload": {
    "topic": "Rust"
  }
}
```

**Knowledge-Graph → Mercury-Inception:**
```json
{
  "type": "context",
  "response_to": "req-001",
  "payload": {
    "topic": "Rust",
    "facts": [
      {"subject": "Rust", "predicate": "IS_A", "object": "systems_language"},
      {"subject": "Rust", "predicate": "HAS", "object": "borrow_checker"},
      {"subject": "David", "predicate": "WORKS_ON", "object": "Rust"}
    ]
  }
}
```

**Mercury-Inception → Network:**
```json
{
  "type": "ai_response",
  "content": "Rust is a systems programming language with a borrow checker for memory safety. David in our network has been working with it..."
}
```

### Mercury-Inception Learns New Fact

During conversation, user says: "I'm learning Rust too"

**Mercury-Inception → Knowledge-Graph:**
```json
{
  "type": "learn_from_conversation",
  "id": "learn-001",
  "from": "mercury-inception",
  "payload": {
    "topic": "User",
    "fact": "learning Rust",
    "source": "user_shared"
  }
}
```

This executes: `uncverkg write --subject User --predicate USER_SHARED --object "learning Rust"`

## Commands Artifacts Respond To

### For Knowledge-Graph

**Write Fact:**
```bash
# Via Redis
redis-cli XADD uncver:stream:knowledge '*' type write_fact subject David predicate WORKS_ON object Rust

# Via HTTP
curl -X POST http://localhost:8085/fact \
  -d '{"subject":"David","predicate":"WORKS_ON","object":"Rust"}'
```

**Query Knowledge:**
```bash
# Via Redis
redis-cli XADD uncver:stream:queries '*' type query_knowledge query David

# Via HTTP
curl "http://localhost:8085/query?q=David"
```

### For Discover (Stats/Commands)

**Get All Artifacts:**
```bash
redis-cli XADD uncver:stream:stats '*' type query_artifacts
```

**Get Artifact Commands:**
```bash
redis-cli XADD uncver:stream:commands '*' type query_commands artifact_name uncver-create
```

## How Mercury-Inception Decides Which to Query

```
User asks question
        │
        ├── Contains artifact name? ("How do I use uncver-create?")
        │   └── Query discover → Get commands
        │
        ├── About topic/person? ("Tell me about David")
        │   └── Query knowledge-graph → Get context
        │
        └── General question? ("What's new?")
            └── Query both → Synthesize response
```

## Testing the Integration

```bash
# 1. Start Redis
./scripts/build.sh redis-stream

# 2. Start knowledge-graph
./scripts/build.sh knowledge-graph
./knowledge-graph/knowledge-graph

# 3. Add some facts
curl -X POST http://localhost:8085/fact \
  -d '{"subject":"Rust","predicate":"IS","object":"awesome"}'

# 4. Query for context
curl "http://localhost:8085/query?q=Rust"

# 5. Start mercury-inception-listener
./scripts/build.sh mecury-inception-listener
./mecury-inception-listener/mecury-inception-listener

# 6. Send a message that would trigger context request
redis-cli XADD uncver:stream:input '*' type chat_message content "What is Rust?"
```

## Benefits of This Design

1. **Separation of concerns** - Stats vs Knowledge are handled separately
2. **Flexibility** - Mercury can query either or both as needed
3. **Extensibility** - New artifact types can register their own queries
4. **Decoupling** - Artifacts don't need to know about each other
5. **Persistence** - Knowledge is stored in uncver-kg, survives restarts
