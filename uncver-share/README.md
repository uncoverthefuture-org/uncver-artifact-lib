# uncver-share-artifact

A C++ CLI tool for sharing artifacts P2P (peer-to-peer) with friends via WebSocket connections.

## Overview

`uncver-share-artifact` reads artifact metadata from local JSON files and sends them to a friend's WebSocket endpoint. This enables seamless sharing of artifact information between developers.

## Features

- Read artifact metadata from local `artifacts/` directory
- Connect to WebSocket endpoints securely (WSS supported)
- Send structured JSON artifact data
- Receive acknowledgments from peers
- Comprehensive logging of share events
- Docker support for containerized builds

## Prerequisites

- C++17 compatible compiler (GCC 8+, Clang 7+, MSVC 2017+)
- CMake 3.14+
- OpenSSL development libraries
- Boost (for WebSocket++)

## Building

### Local Build

```bash
mkdir build && cd build
cmake ..
make -j$(nproc)
```

### With Docker

```bash
docker build -t uncver-share-artifact .
docker run --rm uncver-share-artifact --help
```

## Usage

### Basic Usage

Share an artifact with a friend:

```bash
./uncver-share-artifact --artifact my-app --to wss://friend.ngrok.io/ws
```

### With Custom Message

Add a personalized message when sharing:

```bash
./uncver-share-artifact --artifact my-app --to wss://friend.ngrok.io/ws --message "Check out my new artifact!"
```

### Help

```bash
./uncver-share-artifact --help
```

## CLI Options

| Option | Short | Description | Required |
|--------|-------|-------------|----------|
| `--artifact` | `-a` | Name of the artifact to share | Yes |
| `--to` | `-t` | Friend's WebSocket URL | Yes |
| `--message` | `-m` | Optional message to include | No |
| `--config` | `-c` | Path to config directory (default: ~/.uncver) | No |
| `--help` | `-h` | Show help message | No |

## Artifact JSON Format

The tool reads artifacts from `~/.uncver/artifacts/<artifact-name>/artifact.json`:

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "description": "A sample application",
  "repository_url": "https://github.com/user/my-app",
  "container_image": "ghcr.io/user/my-app:v1.0.0",
  "author": "sirdavis99"
}
```

## JSON Payload Sent

When sharing, the following JSON structure is sent:

```json
{
  "type": "artifact_shared",
  "from": "sirdavis99",
  "artifact": {
    "name": "my-app",
    "version": "1.0.0",
    "description": "...",
    "repository_url": "https://github.com/...",
    "container_image": "...",
    "author": "sirdavis99"
  },
  "message": "Check out my new artifact!",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Configuration

Default configuration directory: `~/.uncver/`

Create a config file at `~/.uncver/config.json`:

```json
{
  "username": "sirdavis99",
  "artifacts_dir": "~/.uncver/artifacts"
}
```

## Environment Variables

- `UNCVER_USERNAME` - Override the username
- `UNCVER_ARTIFACTS_DIR` - Override the artifacts directory

## Example Workflow

1. Create an artifact in your local registry:
   ```bash
   mkdir -p ~/.uncver/artifacts/my-app
   # Create artifact.json with metadata
   ```

2. Share with a friend:
   ```bash
   ./uncver-share-artifact --artifact my-app --to wss://friend.ngrok.io/ws
   ```

3. Friend receives the artifact metadata and can pull/run it

## Troubleshooting

### Connection Refused
- Ensure the friend's WebSocket server is running
- Check firewall rules for the WebSocket port
- Verify the URL is correct (ws:// vs wss://)

### Artifact Not Found
- Verify the artifact exists in `~/.uncver/artifacts/<name>/`
- Check that `artifact.json` is valid JSON
- Ensure proper file permissions

### SSL/TLS Errors
- For WSS connections, ensure certificates are valid
- Use `--insecure` flag for self-signed certificates (development only)

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please submit issues and pull requests.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    uncver-share-artifact                    │
├─────────────────────────────────────────────────────────────┤
│  CLI Parser  │  ArtifactReader  │  ShareClient  │  Logger  │
├──────────────┴──────────────────┴───────────────┴──────────┤
│                      Core Services                           │
├─────────────────────────────────────────────────────────────┤
│  File I/O  │  JSON Parser  │  WebSocket Client  │  Config   │
└─────────────────────────────────────────────────────────────┘
```

## Related Projects

- uncver-registry - Artifact registry management
- uncver-cli - Main CLI tool for artifact operations
