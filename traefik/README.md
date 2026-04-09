# uncver-traefik-artifact

Reusable Traefik configuration for uncver artifacts with DDoS protection, SSL, and rate limiting.

## Overview

This artifact provides a production-ready Traefik setup that can be shared and reused by any uncver user.

## Features

- **SSL/TLS**: Automatic HTTPS certificates
- **DDoS Protection**: Rate limiting per IP
- **WebSocket Support**: Native ws/wss forwarding
- **Metrics**: Prometheus metrics endpoint
- **Dashboard**: Web UI for monitoring

## Usage

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    volumes:
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./dynamic:/etc/traefik/dynamic:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "80:80"
      - "443:443"
    networks:
      - uncver-network
    labels:
      - "traefik.enable=true"

  # Your websocket-stream-artifact
  websocket-stream:
    image: your-websocket-image
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.websocket.rule=PathPrefix(`/`)"
      - "traefik.http.services.websocket.loadbalancer.server.port=8080"
      - "traefik.http.routers.websocket.tls.certresolver=letsencrypt"
    networks:
      - uncver-network

networks:
  uncver-network:
    driver: bridge
```

## Configuration

The artifact includes:

- `traefik.yml` - Main configuration
- `dynamic/rate-limit.yml` - Rate limiting rules
- `dynamic/security.yml` - Security headers

## Domain Options

### Option 1: Local Development
```bash
# Use localhost
docker-compose up
```

### Option 2: ngrok (Quick Public Access)
```bash
# Run ngrok alongside
docker run --network=host ngrok/ngrok http 8080
```

### Option 3: Custom Domain with DDNS
Set `DOMAIN` environment variable in your docker-compose.

## Security Features

- Rate limiting: 100 requests/minute per IP
- Max body size: 10MB
- Request timeout: 30s
- WebSocket ping interval: 30s
