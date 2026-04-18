# uncver-file-read

Reads file content via Redis streams. Can also list directories.

## Quick Start

```bash
docker-compose -f docker-compose-file-ops.yml up -d file-read
```

## Redis Stream Usage

### Read file

```bash
redis-cli -p 6380 XADD uncver:file:read '*' data '{"path":"test.txt"}'
```

### List directory

```bash
redis-cli -p 6380 XADD uncver:file:read '*' data '{"path":"/","list":true}'
```

## Options

- `path` (required): File or directory path
- `list`: Set to true to list directory contents
- `options.encoding`: File encoding (default: utf8)
