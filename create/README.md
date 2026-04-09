# uncver-create-artifact

A C++ service that listens to Redis streams and creates artifacts on demand.

## Overview

This service:
1. Connects to Redis and listens on the `uncver:artifacts:create` stream
2. When a create request is received, it:
   - Clones the repository to `/tmp/[name]` (if URL provided)
   - Creates an `artifact.json` in the artifacts folder
   - Publishes a success message to `uncver:artifacts:created`
3. Returns success/error messages via Redis streams

## Architecture

```
┌─────────────────────┐     Redis Streams      ┌──────────────────────┐
│  uncver-artifacts   │ ─────────────────────> │ uncver-create-artifact│
│   (CLI/Requester)   │   uncver:artifacts:    │    (This Service)     │
│                     │        create          │                       │
└─────────────────────┘                        └──────────────────────┘
                                                         │
                                                         ▼
                                              ┌──────────────────────┐
                                              │   Clone to /tmp/     │
                                              │   Create artifact.json│
                                              └──────────────────────┘
                                                         │
┌─────────────────────┐     Redis Streams              │
│  uncver-artifacts   │ <──────────────────────────────┘
│   (CLI/Requester)   │   uncver:artifacts:created
│                     │   (or uncver:artifacts:errors)
└─────────────────────┘
```

## Building

### Prerequisites

- CMake 3.14+
- C++17 compiler
- libcurl
- nlohmann-json
- hiredis (Redis C client)

### macOS
```bash
brew install cmake curl nlohmann-json hiredis

mkdir build && cd build
cmake ..
make
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install cmake libcurl4-openssl-dev nlohmann-json3-dev libhiredis-dev

mkdir build && cd build
cmake ..
make
```

## Usage

### Running the Service

```bash
# Default connection (localhost:6379)
./uncver-create-artifact

# Custom Redis host/port
./uncver-create-artifact --redis-host redis --redis-port 6379

# Using environment variables
export REDIS_HOST=redis
export REDIS_PORT=6379
./uncver-create-artifact
```

### Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  create-artifact:
    build: ./uncver-create-artifact
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    networks:
      - uncver-network
    depends_on:
      - redis
```

## Redis Stream Messages

### Input Stream: `uncver:artifacts:create`

Fields:
- `name` (required): Artifact name
- `description`: Artifact description
- `url`: Repository URL to clone
- `local_path`: Local path to code
- `container_image`: Container image reference

### Output Stream: `uncver:artifacts:created`

Fields:
- `request_id`: The ID of the original request
- `success`: 1 for success, 0 for failure
- `message`: Human-readable message
- `artifact_path`: Path to created artifact

### Error Stream: `uncver:artifacts:errors`

Fields:
- `request_id`: The ID of the original request
- `error`: Error description

## Example: Sending a Create Request

Using `redis-cli`:

```bash
# Send create request
redis-cli XADD uncver:artifacts:create * name my-artifact url https://github.com/user/repo container_image docker.io/myimage:latest

# Read response
redis-cli XREAD COUNT 1 STREAMS uncver:artifacts:created 0
```

## Artifact Output

Creates artifacts in the data directory:

```
~/.local/share/uncver-artifacts/artifacts/
└── my-artifact/
    └── artifact.json
```

Code is cloned to:
```
/tmp/my-artifact/
```
