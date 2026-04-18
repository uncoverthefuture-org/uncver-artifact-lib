# uncver-folder-create

Creates, deletes, and checks folders via Redis streams.

## Quick Start

```bash
docker-compose -f docker-compose-file-ops.yml up -d folder-create
```

## Redis Stream Usage

### Create folder

```bash
redis-cli -p 6380 XADD uncver:folder:create '*' data '{"path":"my-folder"}'
```

### Delete folder

```bash
redis-cli -p 6380 XADD uncver:folder:create '*' data '{"path":"my-folder","action":"delete","options":{"recursive":true}}'
```

### Check if exists

```bash
redis-cli -p 6380 XADD uncver:folder:create '*' data '{"path":"my-folder","action":"exists"}'
```

## Actions

- `create` (default): Create folder (recursive)
- `delete`: Delete folder
- `exists`: Check if folder exists
