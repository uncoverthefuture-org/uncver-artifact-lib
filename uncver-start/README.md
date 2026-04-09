# uncver-start-artifact

C++ service for starting uncver artifacts via Redis streams.

## Overview

This service listens to Redis streams and starts artifacts on demand.

**Input:** JSON commands via `uncver:artifacts:start` stream  
**Output:** JSON responses via `uncver:artifacts:started` stream  
**Errors:** JSON errors via `uncver:artifacts:errors` stream

## Redis Stream Protocol

### Input Command (received on `uncver:artifacts:start`)

```json
{
  "artifact_name": "string (required)",
  "request_id": "string (auto-generated if not provided)"
}
```

### Output Response (sent to `uncver:artifacts:started`)

```json
{
  "request_id": "string",
  "artifact_name": "string",
  "success": true,
  "container_id": "string",
  "message": "Artifact started successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Response (sent to `uncver:artifacts:errors`)

```json
{
  "request_id": "string",
  "artifact_name": "string",
  "success": false,
  "error_code": "NOT_FOUND|ALREADY_RUNNING|PODMAN_ERROR",
  "message": "Error description",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Building

```bash
mkdir build && cd build
cmake ..
make
```

## Running

```bash
# Default Redis connection
./uncver-start-artifact

# Custom Redis host/port
./uncver-start-artifact --redis-host redis --redis-port 6379
```

## Docker

```bash
docker build -t uncver-start-artifact .
docker run -e REDIS_HOST=redis uncver-start-artifact
```
