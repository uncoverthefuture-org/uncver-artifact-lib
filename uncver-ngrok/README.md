# uncver-ngrok-artifact

NGROK integration for uncver artifacts with machine fingerprint-based domain generation.

## Overview

This artifact manages NGROK tunnels with consistent, fingerprint-based domains so other users can reliably connect to your WebSocket.

## Machine Fingerprint

Generates unique identifier from:
- Machine ID (`/etc/machine-id` or Windows registry)
- Username
- Device type (PC, laptop, server, etc.)

Domain format: `<fingerprint>.<device-type>.ngrok.io`

Example: `a3f7b2d9.pc.ngrok.io`

## Usage

```bash
# Start with fingerprint-based domain
docker-compose up -d ngrok

# Get your domain
./scripts/get-domain.sh
# Output: a3f7b2d9.pc.ngrok.io

# Share with friends
uncver-artifacts share my-app --to a3f7b2d9.pc.ngrok.io
```

## Environment Variables

```bash
NGROK_AUTHTOKEN=your_token
DEVICE_TYPE=pc  # pc, laptop, server, vm, wsl
CUSTOM_DOMAIN=  # optional custom domain
```

## Features

- **Consistent Domain**: Same fingerprint = same domain across restarts
- **Multiple Devices**: Different device types get different subdomains
- **Reserved**: Paid ngrok users can reserve their fingerprint domain
- **Auto-reconnect**: Reconnects with same domain on failure
