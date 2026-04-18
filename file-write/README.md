# uncver-file-write

Writes content to files via Redis streams. Creates directories automatically.

## Quick Start

```bash
docker-compose -f docker-compose-file-ops.yml up -d file-write
```

## Redis Stream Usage

### Write to file

```bash
redis-cli -p 6380 XADD uncver:file:write '*' data '{"path":"test.txt","content":"Hello World"}'
```

### Response (uncver:file:written)

```json
{
  "type": "file_written",
  "path": "test.txt",
  "size": 11,
  "modified": "2024-01-15T10:30:00Z"
}
```

## Options

- `path` (required): File path relative to /data
- `content`: File content
- `options.append`: Append to file instead of overwrite
- `options.encoding`: File encoding (default: utf8)
