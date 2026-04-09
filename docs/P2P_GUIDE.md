# uncver P2P Discovery System - Complete Guide

## Overview

The uncver P2P Discovery System allows users to share artifacts directly with friends without a central server. Each user's PC becomes both a client and server.

## System Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER A'S PC                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  uncver-ngrok-artifact                                   │  │
│  │  - Generates machine fingerprint                         │  │
│  │  - Creates: a3f7b2d9.pc.ngrok.io                        │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  uncver-websocket-stream-artifact                        │  │
│  │  - WebSocket Server on port 8080                         │  │
│  │  - Receives: GitHub webhooks, friend shares             │  │
│  │  - Broadcasts: To all connected clients                 │  │
│  └──────────┬───────────────────────────────┬───────────────┘  │
│             │                               │                   │
│             ▼                               ▼                   │
│  ┌─────────────────────┐    ┌──────────────────────────────┐  │
│  │ discover-artifact   │    │ share-artifact               │  │
│  │ (WebSocket Client)  │    │ (WebSocket Client + Server)  │  │
│  │ - Listens to WS     │    │ - Sends to friends           │  │
│  │ - Stores in SQLite  │    │ - Receives from friends      │  │
│  │ - Publishes to Redis│    │                              │  │
│  └──────────┬──────────┘    └──────────────────────────────┘  │
│             │                                                   │
│             ▼                                                   │
│  ┌─────────────────────┐                                       │
│  │ Redis               │                                       │
│  │ - Internal bus for  │                                       │
│  │   container comms   │                                       │
│  └─────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (wss://a3f7b2d9.pc.ngrok.io/ws)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         USER B'S PC                             │
│                                                                  │
│  uncver-share-artifact --to wss://a3f7b2d9.pc.ngrok.io/ws       │
│       │                                                          │
│       ▼                                                          │
│  Connects to User A's WebSocket                                  │
│  Sends: {                                                        │
│    "type": "artifact_shared",                                    │
│    "from": "user-b",                                             │
│    "artifact": { ... },                                          │
│    "timestamp": "..."                                            │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Machine Fingerprint

### How It Works

The fingerprint is generated from:
1. **Machine ID** - Unique per OS installation (`/etc/machine-id`)
2. **Username** - Current system user
3. **Device Type** - PC, laptop, server, etc.

```bash
Fingerprint = SHA256(MachineID + Username + DeviceType)[0:16]
Domain = Fingerprint[0:8] + "." + DeviceType + ".ngrok.io"
```

### Examples

```bash
# User: sirdavis99
# Machine: Desktop PC
# Device Type: pc
Fingerprint: a3f7b2d9e8c1d4f2
Domain: a3f7b2d9.pc.ngrok.io

# Same user, different device (laptop)
# Device Type: laptop
Fingerprint: e8c1d4f2a3f7b2d9
Domain: e8c1d4f2.laptop.ngrok.io
```

## Message Flows

### Flow 1: GitHub Push → Local Discovery

```
1. Developer pushes to GitHub
   ↓
2. GitHub Action triggers
   ↓
3. POST to https://a3f7b2d9.pc.ngrok.io/github-webhook
   ↓
4. ngrok forwards to local websocket-stream
   ↓
5. websocket-stream broadcasts to all clients
   ↓
6. discover-artifact receives and stores in SQLite
   ↓
7. discover-artifact publishes to Redis
   ↓
8. Local containers notified
```

### Flow 2: User Shares Artifact with Friend

```
1. User B runs: uncver-share --artifact my-app --to a3f7b2d9.pc.ngrok.io
   ↓
2. share-artifact connects to User A's WebSocket
   ↓
3. Sends artifact payload
   ↓
4. User A's websocket-stream broadcasts
   ↓
5. User A's discover-artifact receives
   ↓
6. Stores in SQLite with "shared_by: user-b"
   ↓
7. Available in User A's local search
```

### Flow 3: Friend Queries Available Artifacts

```
1. Friend connects to wss://a3f7b2d9.pc.ngrok.io/ws
   ↓
2. Sends: { "type": "query", "search": "web api" }
   ↓
3. websocket-stream broadcasts
   ↓
4. discover-artifact receives query
   ↓
5. Searches SQLite
   ↓
6. Sends results back via WebSocket
   ↓
7. Friend receives artifact list
```

## Message Formats

### GitHub Webhook Payload

```json
{
  "type": "github_push",
  "artifact": "uncver-create-artifact",
  "version": "1.1.0",
  "repository": "sirdavis99/uncver-create-artifact",
  "image": "ghcr.io/sirdavis99/uncver-create-artifact:1.1.0",
  "author": "sirdavis99",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Artifact Shared Payload

```json
{
  "type": "artifact_shared",
  "from": "user-b",
  "from_domain": "e8c1d4f2.laptop.ngrok.io",
  "artifact": {
    "name": "my-custom-app",
    "version": "2.0.0",
    "description": "A cool custom app",
    "repository_url": "https://github.com/user-b/my-custom-app",
    "container_image": "ghcr.io/user-b/my-custom-app:2.0.0",
    "author": "user-b",
    "tags": ["web", "api", "go"],
    "required_artifacts": [
      {
        "name": "uncver-redis-stream-artifact",
        "required": true
      }
    ]
  },
  "message": "Hey, check out my new version!",
  "timestamp": "2024-01-15T11:00:00Z"
}
```

### Query Payload

```json
{
  "type": "query",
  "query_id": "uuid-v4",
  "search": "web api",
  "filters": {
    "tags": ["go"],
    "author": "user-b"
  },
  "limit": 10
}
```

### Query Results Payload

```json
{
  "type": "query_results",
  "query_id": "uuid-v4",
  "results": [
    {
      "name": "my-custom-app",
      "version": "2.0.0",
      "description": "A cool custom app",
      "repository_url": "https://github.com/user-b/my-custom-app",
      "author": "user-b",
      "tags": ["web", "api", "go"],
      "shared_by": "user-b",
      "discovered_at": "2024-01-15T11:00:00Z"
    }
  ],
  "total": 5,
  "timestamp": "2024-01-15T11:00:01Z"
}
```

## CLI Usage

### Start Your P2P Node

```bash
# Start all required services
cd uncver-redis-stream-artifact
NGROK_TOKEN=your_token DEVICE_TYPE=pc docker-compose -f docker-compose-full.yml up -d

# Get your domain
docker logs uncver-ngrok
# Output: Domain: a3f7b2d9.pc.ngrok.io

# Check all services
docker-compose ps
```

### Share an Artifact

```bash
# Share your local artifact with a friend
./uncver-share-artifact \
  --artifact my-custom-app \
  --to wss://a3f7b2d9.pc.ngrok.io/ws \
  --message "Check out my latest version!"

# Share to multiple friends
./uncver-share-artifact \
  --artifact my-custom-app \
  --to wss://a3f7b2d9.pc.ngrok.io/ws \
  --to wss://e8c1d4f2.laptop.ngrok.io/ws
```

### Discover Artifacts from Friend

```bash
# Query friend's available artifacts
uncver-artifacts discover e8c1d4f2.laptop.ngrok.io

# Search with filters
uncver-artifacts discover e8c1d4f2.laptop.ngrok.io --search "web api" --tag go

# List all discovered artifacts
uncver-artifacts list --source shared
```

### Install Shared Artifact

```bash
# Install artifact shared by friend
uncver-artifacts install my-custom-app --from user-b

# This will:
# 1. Pull container image
# 2. Start required artifacts
# 3. Run the artifact
```

## Required Artifacts

When an artifact declares dependencies:

```json
{
  "name": "my-custom-app",
  "required_artifacts": [
    {
      "name": "uncver-redis-stream-artifact",
      "required": true,
      "auto_start": true
    },
    {
      "name": "uncver-websocket-stream-artifact",
      "required": true,
      "auto_start": true
    }
  ]
}
```

### Auto-Start Behavior

```bash
# User installs shared artifact
uncver-artifacts install my-custom-app --from user-b

# Output:
# Checking dependencies for my-custom-app...
#  ✗ uncver-redis-stream-artifact not running
#    → Pulling from ghcr.io...
#    → Starting container...
#    ✓ Healthy
#  ✗ uncver-websocket-stream-artifact not running
#    → Pulling from ghcr.io...
#    → Starting container...
#    ✓ Healthy
# Starting my-custom-app...
# ✓ my-custom-app running on port 3000
```

## Security Considerations

### 1. WebSocket Validation

- **Token-based auth** for GitHub webhooks
- **Origin validation** for WebSocket connections
- **Rate limiting** per IP address

### 2. Payload Validation

- **Schema validation** for all incoming messages
- **Size limits** (max 10MB payload)
- **Sanitization** of all string fields

### 3. Network Security

- **TLS/SSL** via ngrok (automatic)
- **No direct Redis exposure** (internal only)
- **Container isolation** via Docker networks

### 4. Trust Model

- **GitHub-verified** artifacts (via webhook signature)
- **Friend-to-friend** sharing (manual trust)
- **Local-only** storage of shared artifacts

## Troubleshooting

### WebSocket Not Connecting

```bash
# Check ngrok is running
docker logs uncver-ngrok

# Check ngrok tunnel status
curl http://localhost:4040/api/tunnels

# Test WebSocket locally
websocat ws://localhost:8080/ws
```

### Friend Can't Connect

```bash
# Verify domain is accessible
curl https://a3f7b2d9.pc.ngrok.io/health

# Check firewall rules
sudo ufw allow 8080

# Verify WebSocket endpoint
websocat wss://a3f7b2d9.pc.ngrok.io/ws
```

### Artifacts Not Auto-Starting

```bash
# Check dependency status
uncver-artifacts deps my-custom-app

# Fix broken dependencies
uncver-artifacts fix my-custom-app

# View logs
docker logs uncver-discover
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NGROK_TOKEN` | - | Your ngrok auth token |
| `DEVICE_TYPE` | `pc` | Device type (pc, laptop, server, vm) |
| `NGROK_DOMAIN` | auto | Override fingerprint domain |
| `WEBSOCKET_PORT` | `8080` | Local WebSocket port |
| `REDIS_PORT` | `6379` | Redis port |
| `DB_PATH` | `./artifacts.db` | SQLite database path |

## Testing

### Local Test Script

```bash
#!/bin/bash
# test-p2p.sh

echo "=== Testing P2P Discovery System ==="

# 1. Start services
echo "1. Starting services..."
docker-compose up -d

# 2. Get domain
echo "2. Getting domain..."
DOMAIN=$(docker logs uncver-ngrok 2>&1 | grep "Domain:" | cut -d' ' -f2)
echo "   Domain: $DOMAIN"

# 3. Test local WebSocket
echo "3. Testing local WebSocket..."
echo '{"type":"test","message":"hello"}' | websocat ws://localhost:8080/ws

# 4. Test ngrok endpoint
echo "4. Testing ngrok endpoint..."
curl -s https://$DOMAIN/health

# 5. Send test GitHub webhook
echo "5. Sending test webhook..."
curl -X POST https://$DOMAIN/github-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "github_push",
    "artifact": "test-artifact",
    "version": "1.0.0"
  }'

echo "=== Tests Complete ==="
```

## Advanced Topics

### Custom Domain with Reserved Ngrok

Paid ngrok users can reserve their fingerprint subdomain:

```bash
# Reserve: a3f7b2d9.pc.ngrok.io in ngrok dashboard
# It will always be yours
```

### Tailscale Alternative

For private networks without ngrok:

```bash
# Start with Tailscale
docker-compose -f docker-compose-tailscale.yml up -d

# Domain: macbook-pro.sirdavis99.ts.net
# No public exposure, fully encrypted
```

### Backup and Restore

```bash
# Backup discovered artifacts
cp data/artifacts.db backups/artifacts-$(date +%Y%m%d).db

# Restore
cp backups/artifacts-20240115.db data/artifacts.db
```
