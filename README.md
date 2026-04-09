# uncver-artifact-lib

Collection of uncver artifacts for the P2P discovery system.

## Artifacts

### mecury-inception-listener

AI-powered Redis stream listener that asynchronously reviews and responds to messages using Mercury Inception AI.

**Features:**
- Listens to Redis streams for incoming messages
- Asynchronously processes messages through Mercury Inception AI
- Does not listen for its own responses to prevent loops
- GUI-based configuration for model selection and API key
- Encrypted API key storage

**Documentation:** [mecury-inception-listener/README.md](./mecury-inception-listener/README.md)

**artifact.json:** [mecury-inception-listener/artifact.json](./mecury-inception-listener/artifact.json)

## Structure

```
uncver-artifact-lib/
├── README.md
└── mecury-inception-listener/
    ├── artifact.json       # Artifact metadata
    ├── Dockerfile          # Container build file
    ├── README.md          # Artifact documentation
    ├── go.mod              # Go module definition
    ├── go.sum              # Go dependencies checksum
    └── cmd/
        └── server/
            └── main.go     # Main server implementation
```

## Usage

### Building the Container

```bash
cd mecury-inception-listener
docker build -t ghcr.io/uncver/mecury-inception-listener:latest .
```

### Running

```bash
docker run -d \
  -p 8080:8080 \
  -e REDIS_ADDR=redis:6379 \
  -e MERCURY_API_URL=https://api.mercuryinception.ai/v1 \
  ghcr.io/uncver/mecury-inception-listener:latest
```

## License

MIT
