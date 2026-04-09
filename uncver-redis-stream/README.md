# uncver-redis-stream-artifact

Redis stream infrastructure for the uncver artifact system.

## Overview

This service provides a Redis bus for inter-service communication between:
- `uncver-artifacts` (the main CLI)
- `uncver-create-artifact` (artifact creation service)

## Services

| Service | Port | Description |
|---------|------|-------------|
| Redis | 6379 | Main Redis server for streams |
| Redis Insight | 5540 | Redis GUI for monitoring |

## Usage

```bash
# Start the Redis infrastructure
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Stop and remove data
docker-compose down -v
```

## Redis Streams

The system uses the following streams:

| Stream | Purpose |
|--------|---------|
| `uncver:artifacts:create` | Requests to create new artifacts |
| `uncver:artifacts:created` | Success confirmations |
| `uncver:artifacts:errors` | Error messages |

## Connecting

Services connect using:
```
Host: redis
Port: 6379
```

Or from host machine:
```
Host: localhost
Port: 6379
```
