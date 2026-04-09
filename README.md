# uncver-artifact-lib

A library of reusable artifacts for the uncver ecosystem - all in one repository.

## Overview

This monorepo contains all uncver artifacts following the naming pattern: `uncver-{action}-artifact`

## Artifacts

### Core Management (Rust)
| Artifact | Description |
|----------|-------------|
| **uncver-artifacts** | CLI tool for managing artifacts (list, start, stop, create, delete, share) |

### Lifecycle Management (C++)
| Artifact | Description |
|----------|-------------|
| **uncver-create-artifact** | Creates artifacts via Redis streams |
| **uncver-start-artifact** | Starts artifacts via Redis streams |
| **uncver-stop-artifact** | Stops artifacts via Redis streams |
| **uncver-delete-artifact** | Deletes artifacts via Redis streams |
| **uncver-share-artifact** | P2P artifact sharing via WebSocket |

### Discovery & Communication (Go)
| Artifact | Description |
|----------|-------------|
| **uncver-discover-artifact** | Artifact registry with SQLite database |
| **uncver-websocket-stream-artifact** | WebSocket broadcaster for P2P communication |

### Infrastructure (Docker)
| Artifact | Description |
|----------|-------------|
| **uncver-redis-stream-artifact** | Redis infrastructure for internal messaging |
| **uncver-traefik-artifact** | Traefik routing with DDoS protection |
| **uncver-ngrok-artifact** | ngrok with fingerprint-based domain generation |

### Custom
| Artifact | Description |
|----------|-------------|
| **mecury-inception-listener** | AI-powered Redis stream listener |

## Quick Start

```bash
# Clone the library
git clone https://github.com/sirdavis99/uncver-artifact-lib.git
cd uncver-artifact-lib

# Start core infrastructure
cd uncver-redis-stream-artifact
docker-compose -f docker-compose-full.yml up -d

# Use the CLI from another terminal
cd ../uncver-artifacts
cargo run -- list
```

## Directory Structure

```
uncver-artifact-lib/
├── uncver-artifacts/              # Rust CLI tool
├── uncver-create-artifact/        # C++ create service
├── uncver-start-artifact/         # C++ start service
├── uncver-stop-artifact/          # C++ stop service
├── uncver-delete-artifact/        # C++ delete service
├── uncver-share-artifact/         # C++ P2P sharing
├── uncver-discover-artifact/      # Go registry service
├── uncver-websocket-stream-artifact/  # Go WebSocket server
├── uncver-redis-stream-artifact/      # Docker Redis infra
├── uncver-traefik-artifact/       # Docker Traefik
├── uncver-ngrok-artifact/         # Docker ngrok
├── mecury-inception-listener/     # Custom listener
├── configs/                       # Shared configurations
├── docs/                          # Documentation
└── scripts/                       # Helper scripts
```

## Each Artifact Contains

- `artifact.json` - Artifact configuration and metadata
- `Dockerfile` - Container build definition
- `README.md` - Artifact-specific documentation
- Source code files (language-specific structure)

## P2P Discovery System

The artifacts work together to enable peer-to-peer artifact sharing:

1. **uncver-ngrok-artifact** - Creates consistent domain (`fingerprint.pc.ngrok.io`)
2. **uncver-websocket-stream-artifact** - Broadcasts messages to all peers
3. **uncver-discover-artifact** - Stores shared artifacts in SQLite
4. **uncver-share-artifact** - Sends artifacts to friends' WebSocket endpoints

See [P2P_GUIDE.md](./docs/P2P_GUIDE.md) for detailed documentation.

## Contributing

Each artifact is self-contained in its directory:

1. Navigate to the specific artifact directory
2. Make your changes
3. Test locally
4. Commit with conventional commit format
5. Push to this repository

## Documentation

- [P2P_GUIDE.md](./docs/P2P_GUIDE.md) - Complete P2P system guide
- [DOMAIN_SYSTEM.md](./docs/DOMAIN_SYSTEM.md) - Domain generation strategies
- [ARTIFACT_DEPENDENCIES.md](./docs/ARTIFACT_DEPENDENCIES.md) - Dependency management

## License

MIT
