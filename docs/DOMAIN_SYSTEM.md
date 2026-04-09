# Domain Generation System for uncver

## Overview

Each user gets a unique, discoverable domain for their WebSocket endpoint so others can connect and share artifacts P2P.

## Domain Generation Strategies

### Option 1: GitHub Username Based (Recommended)
```
Format: <github-username>.artifacts.uncver.io
Example: sirdavis99.artifacts.uncver.io
```

**Pros:**
- Human-readable
- Easy to remember
- Identity-linked

**Cons:**
- Requires DNS wildcard (*.artifacts.uncver.io)
- Needs centralized coordination

### Option 2: Machine Fingerprint Based
```
Format: <fingerprint>.local.uncver.io
Example: a3f7b2d9.local.uncver.io
```

Fingerprint = Hash of:
- Machine ID (e.g., /etc/machine-id)
- Username
- GitHub username

**Pros:**
- Unique per machine/user combo
- Works without central DNS

**Cons:**
- Hard to remember
- Changes if machine changes

### Option 3: ngrok Subdomain (Current Implementation)
```
Format: <random>.ngrok-free.app
Example: abc-123-xyz.ngrok-free.app
```

**Pros:**
- Works immediately
- No DNS setup
- TLS included

**Cons:**
- Changes on restart (free tier)
- Not memorable
- Rate limited

### Option 4: Tailscale MagicDNS (Recommended for Friends)
```
Format: <machine-name>.<tailnet>.ts.net
Example: macbook-pro.sirdavis99.ts.net
```

**Pros:**
- Private mesh network
- No public exposure
- Persistent names
- End-to-end encryption

**Cons:**
- Requires Tailscale account
- Friends need to be in same tailnet

## Recommended Architecture

### For Public Sharing (Option 1 + 3 hybrid)

```yaml
# User's docker-compose.yml
services:
  # ngrok provides temporary public URL
  ngrok:
    image: ngrok/ngrok:latest
    command: http websocket-stream:8080
    environment:
      - NGROK_AUTHTOKEN=${NGROK_TOKEN}
    # Generates: https://abc-123.ngrok.io
    
  # User registers their ngrok URL with central registry
  domain-registry:
    image: uncver/domain-registry:latest
    environment:
      - GITHUB_USERNAME=sirdavis99
      - NGROK_URL=${NGROK_URL}
      - REGISTRY_API=https://artifacts.uncver.io/api
    # Registers: sirdavis99 -> https://abc-123.ngrok.io
    
  websocket-stream:
    image: uncver/websocket-stream-artifact:latest
    ports:
      - "8080:8080"
```

**Flow:**
1. User starts ngrok → gets URL `https://abc-123.ngrok.io`
2. domain-registry service POSTs to central API:
   ```json
   {
     "username": "sirdavis99",
     "websocket_url": "wss://abc-123.ngrok.io/ws",
     "timestamp": "2024-01-01T00:00:00Z"
   }
   ```
3. Central registry maps `sirdavis99` → `wss://abc-123.ngrok.io/ws`
4. Friends query: `GET https://artifacts.uncver.io/api/users/sirdavis99`
5. Response: `{ "websocket_url": "wss://abc-123.ngrok.io/ws" }`
6. Friend connects directly to user's WebSocket

### For Private Sharing (Option 4 - Tailscale)

```yaml
# User's docker-compose.yml
services:
  websocket-stream:
    image: uncver/websocket-stream-artifact:latest
    network_mode: host  # Uses Tailscale network
    environment:
      - DOMAIN=${TAILSCALE_MACHINE_NAME}.sirdavis99.ts.net
    # Accessible at: wss://macbook-pro.sirdavis99.ts.net:8080
```

**Flow:**
1. User and friends join same Tailscale tailnet
2. User shares their Tailscale machine name
3. Friend connects: `wss://macbook-pro.sirdavis99.ts.net:8080`
4. Direct P2P connection over encrypted Tailscale network

## Terminal Integration

### Discover Command
```bash
# Discover user's WebSocket endpoint
uncver-artifacts discover sirdavis99
# Output: wss://abc-123.ngrok.io/ws

# Or with --tailscale flag
uncver-artifacts discover sirdavis99 --tailscale
# Output: wss://macbook-pro.sirdavis99.ts.net:8080
```

### Share Command
```bash
# Share artifact with friend
uncver-artifacts share my-app --to sirdavis99
# Automatically resolves sirdavis99 -> WebSocket URL
# Sends artifact metadata to friend's WebSocket
```

## Storage of Domain Info

### Local Cache
```bash
~/.uncver/cache/domains.json
```

```json
{
  "sirdavis99": {
    "websocket_url": "wss://abc-123.ngrok.io/ws",
    "expires_at": "2024-01-01T12:00:00Z",
    "last_seen": "2024-01-01T10:00:00Z"
  },
  "friend123": {
    "websocket_url": "wss://def-456.ngrok.io/ws",
    "expires_at": "2024-01-02T08:00:00Z",
    "last_seen": "2024-01-01T09:30:00Z"
  }
}
```

### Resolution Strategy
1. Check local cache first (if not expired)
2. Query central registry API
3. Cache result for 1 hour
4. If not found, try Tailscale (if available)

## Security Considerations

1. **Domain Spoofing:** Central registry must verify GitHub ownership
2. **Expired Domains:** Cache TTL prevents connecting to old ngrok URLs
3. **Private Sharing:** Tailscale provides encryption without trusting central registry
4. **Rate Limiting:** Central registry limits domain lookups per IP

## Implementation Phases

### Phase 1: ngrok Only (Current)
- User manually shares ngrok URL
- Friend uses URL directly
- No central registry needed

### Phase 2: Central Registry
- User registers ngrok URL with username
- Friend resolves username -> URL
- Automatic updates when ngrok changes

### Phase 3: Tailscale Support
- Detect if Tailscale is available
- Prefer Tailscale over ngrok for private sharing
- Fallback to ngrok for public sharing

### Phase 4: Custom Domains
- Support custom domains (e.g., artifacts.sirdavis99.com)
- Let's Encrypt auto-provisioning
- DDoS protection via CloudFlare

## Recommendation

**Start with Phase 1 (ngrok) + Phase 2 (central registry):**

1. User runs `uncver-artifacts serve` which:
   - Starts ngrok
   - Registers URL with central registry
   - Prints: "Share your artifacts: wss://abc-123.ngrok.io/ws or username: sirdavis99"

2. Friend runs `uncver-artifacts discover sirdavis99` which:
   - Resolves username to WebSocket URL
   - Connects and queries available artifacts

3. User runs `uncver-artifacts share my-app --to friend123` which:
   - Resolves friend123's WebSocket URL
   - Sends artifact metadata directly to friend's WebSocket
