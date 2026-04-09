# uncver-delete-artifact

C++ service for deleting uncver artifacts via Redis streams.

## Overview

This service listens to Redis streams and deletes artifacts on demand.

**Input:** JSON commands via `uncver:artifacts:delete` stream  
**Output:** JSON responses via `uncver:artifacts:deleted` stream  
**Errors:** JSON errors via `uncver:artifacts:errors` stream

## Redis Stream Protocol

### Input Command (received on `uncver:artifacts:delete`)

```json
{
  "artifact_name": "string (required)",
  "request_id": "string (auto-generated if not provided)"
}
```

### Output Response (sent to `uncver:artifacts:deleted`)

```json
{
  "request_id": "string",
  "artifact_name": "string",
  "success": true,
  "message": "Artifact 'name' deleted successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Response (sent to `uncver:artifacts:errors`)

```json
{
  "request_id": "string",
  "artifact_name": "string",
  "success": false,
  "error_code": "ARTIFACT_NOT_FOUND|STOP_FAILED|DELETE_FAILED",
  "message": "Error description",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Deletion Process

1. Validates that the artifact exists in `~/.local/share/uncver-artifacts/artifacts/`
2. Stops any running container using `podman stop`
3. Deletes the artifact directory from `~/.local/share/uncver-artifacts/artifacts/`
4. Deletes code directory from `/tmp/[artifact_name]` if it exists

## Building

```bash
mkdir build && cd build
cmake ..
make
```

## Running

```bash
# Default Redis connection
./uncver-delete-artifact

# Custom Redis host/port
./uncver-delete-artifact --redis-host redis --redis-port 6379
```

## Docker

```bash
docker build -t uncver-delete-artifact .
docker run -e REDIS_HOST=redis uncver-delete-artifact
```
