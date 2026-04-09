# uncver-artifact-lib

A library of reusable artifacts for the uncver ecosystem - all in one repository.

## Overview

This monorepo contains all uncver artifacts. Each artifact has:
- **Full name** in `artifact.json`: `uncver-{action}` (e.g., `uncver-create`)
- **Folder name** (simplified): `{action}` (e.g., `create/`)

## Artifacts

### Core Management (Rust)
| Folder | Full Name | Description |
|--------|-----------|-------------|
| **artifacts/** | uncver-cli | CLI tool for managing artifacts |

### Lifecycle Management (C++)
| Folder | Full Name | Description |
|--------|-----------|-------------|
| **create/** | uncver-create | Creates artifacts via Redis streams |
| **start/** | uncver-start | Starts artifacts via Redis streams |
| **stop/** | uncver-stop | Stops artifacts via Redis streams |
| **delete/** | uncver-delete | Deletes artifacts via Redis streams |
| **share/** | uncver-share | P2P artifact sharing via WebSocket |

### Discovery & Communication (Go)
| Folder | Full Name | Description |
|--------|-----------|-------------|
| **discover/** | uncver-discover | Artifact registry with SQLite database |
| **websocket-stream/** | uncver-websocket-stream | WebSocket broadcaster for P2P communication |

### Infrastructure (Docker)
| Folder | Full Name | Description |
|--------|-----------|-------------|
| **redis-stream/** | uncver-redis-stream | Redis infrastructure for internal messaging |
| **traefik/** | uncver-traefik | Traefik routing with DDoS protection |
| **ngrok/** | uncver-ngrok | ngrok with fingerprint-based domain generation |

### Custom
| Folder | Full Name | Description |
|--------|-----------|-------------|
| **mecury-inception-listener/** | mecury-inception-listener | AI-powered Redis stream listener |

## Quick Start

```bash
# Clone the library
git clone https://github.com/uncoverthefuture-org/uncver-artifact-lib.git
cd uncver-artifact-lib

# Build specific artifact
./scripts/build.sh create
./scripts/build.sh discover

# Test specific artifact
./scripts/test.sh create

# Package specific artifact
./scripts/package.sh create

# Start core infrastructure
cd redis-stream
docker-compose -f docker-compose-full.yml up -d

# Use the CLI
cd ../artifacts
cargo run -- list
```

## Directory Structure

```
uncver-artifact-lib/
├── artifact.json                  # Meta-package configuration
├── artifacts/                     # Rust CLI tool
├── create/                        # C++ create service
├── start/                         # C++ start service
├── stop/                          # C++ stop service
├── delete/                        # C++ delete service
├── share/                         # C++ P2P sharing
├── discover/                      # Go registry service
├── websocket-stream/              # Go WebSocket server
├── redis-stream/                  # Docker Redis infra
├── traefik/                       # Docker Traefik
├── ngrok/                         # Docker ngrok
├── mecury-inception-listener/     # Custom listener
├── scripts/                       # Build/test/package scripts
├── configs/                       # Shared configurations
└── docs/                          # Documentation
```

## Each Artifact Contains

- `artifact.json` - Artifact configuration with full name (e.g., `uncver-create`)
- `Dockerfile` - Container build definition
- `README.md` - Artifact-specific documentation
- Source code files (language-specific structure)

## Build System

The monorepo uses a centralized build system:

```bash
# Build all artifacts
for artifact in create start stop delete discover; do
    ./scripts/build.sh $artifact
done

# Or use the orchestration workflow (GitHub Actions)
# .github/workflows/orchestrate.yml
```

### Build Scripts

- `scripts/build.sh <artifact>` - Build an artifact
- `scripts/test.sh <artifact>` - Test an artifact  
- `scripts/package.sh <artifact>` - Package an artifact

## P2P Discovery System

The artifacts work together to enable peer-to-peer artifact sharing:

1. **ngrok/** - Creates consistent domain (`fingerprint.pc.ngrok.io`)
2. **websocket-stream/** - Broadcasts messages to all peers
3. **discover/** - Stores shared artifacts in SQLite
4. **share/** - Sends artifacts to friends' WebSocket endpoints

See [P2P_GUIDE.md](./docs/P2P_GUIDE.md) for detailed documentation.

## GitHub Actions

### Orchestration Workflow

The `.github/workflows/orchestrate.yml` workflow:
1. Detects which artifacts changed
2. Builds changed artifacts in parallel
3. Tests each artifact
4. Notifies your local PC via WebSocket
5. Fires up all artifacts when complete

### Local PC Notification

Set `LOCAL_WEBSOCKET_URL` in your repository secrets to receive notifications when builds complete.

## Contributing

Each artifact is self-contained in its directory:

1. Navigate to the specific artifact directory
2. Make your changes to code AND `artifact.json`
3. Test locally with `./scripts/build.sh <artifact>`
4. Commit with conventional commit format
5. Push to this repository

## Documentation

- [P2P_GUIDE.md](./docs/P2P_GUIDE.md) - Complete P2P system guide
- [DOMAIN_SYSTEM.md](./docs/DOMAIN_SYSTEM.md) - Domain generation strategies
- [ARTIFACT_DEPENDENCIES.md](./docs/ARTIFACT_DEPENDENCIES.md) - Dependency management
- [P2P_ARCHITECTURE.md](./docs/P2P_ARCHITECTURE.md) - Implementation summary

## License

MIT
