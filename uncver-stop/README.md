# uncver-stop-artifact

C++ service for stopping uncver artifacts via Redis streams.

## Overview

This service listens to Redis streams and stops running artifacts on demand.

**Input:** JSON commands via `uncver:artifacts:stop` stream  
**Output:** JSON responses via `uncver:artifacts:stopped` stream  
**Errors:** JSON errors via `uncver:artifacts:errors` stream

## Redis Stream Protocol

### Input Command (received on `uncver:artifacts:stop`)

```json
{
  "container_id": "string (required)",
  "request_id": "string (auto-generated if not provided)"
}
```

### Output Response (sent to `uncver:artifacts:stopped`)

```json
{
  "request_id": "string",
  "container_id": "string",
  "success": true,
  "message": "Container stopped successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Response (sent to `uncver:artifacts:errors`)

```json
{
  "request_id": "string",
  "container_id": "string",
  "success": false,
  "error_code": "NOT_FOUND|NOT_RUNNING|PODMAN_ERROR|STOP_FAILED",
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
./uncver-stop-artifact

# Custom Redis host/port
./uncver-stop-artifact --redis-host redis --redis-port 6379
```

## Docker

```bash
docker build -t uncver-stop-artifact .
docker run -e REDIS_HOST=redis uncver-stop-artifact
```
