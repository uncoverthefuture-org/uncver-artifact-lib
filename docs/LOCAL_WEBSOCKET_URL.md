# LOCAL_WEBSOCKET_URL Configuration

## What is LOCAL_WEBSOCKET_URL?

This is the GitHub secret that tells GitHub Actions how to notify your local PC when builds complete.

## Setting the Value

In your GitHub repository, go to **Settings → Secrets and variables → Actions**, and add:

**Name:** `LOCAL_WEBSOCKET_URL`

**Value:** Your ngrok or local WebSocket endpoint

### Option 1: Using ngrok (Recommended for remote access)

If you're using ngrok to expose your local WebSocket:

```
https://your-ngrok-subdomain.ngrok.io/notify
```

Or for the fire endpoint:
```
https://your-ngrok-subdomain.ngrok.io
```

### Option 2: Local Development (Same machine only)

If testing on the same machine:

```
http://localhost:8080/notify
```

### Option 3: Local Network (Same WiFi)

If testing on your local network:

```
http://192.168.1.xxx:8080/notify
```

## How It Works

1. GitHub Actions builds artifacts
2. After build completes, it POSTs to `LOCAL_WEBSOCKET_URL`
3. Your local WebSocket listener receives the notification
4. You can then trigger local deployment/testing

## Example Payload

GitHub Actions sends:

```json
{
  "type": "github_build_complete",
  "repository": "uncoverthefuture-org/uncver-artifact-lib",
  "commit": "abc123...",
  "status": "success",
  "artifacts_built": ["create", "discover", "knowledge-graph"],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## WebSocket Endpoints Used

The orchestrate.yml workflow uses two endpoints:

1. **Notification endpoint:** `${{ secrets.LOCAL_WEBSOCKET_URL }}`
   - Sends build completion status
   
2. **Fire endpoint:** `${{ secrets.LOCAL_WEBSOCKET_URL }}/fire`
   - Triggers deployment of all artifacts

## Testing Locally

You can test the notification manually:

```bash
# Start a local WebSocket listener first
curl -X POST http://localhost:8080/notify \
  -H "Content-Type: application/json" \
  -d '{
    "type": "github_build_complete",
    "repository": "test",
    "commit": "test123",
    "status": "success",
    "artifacts_built": ["test-artifact"],
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

## Security Note

- Keep this URL private (hence it's a GitHub secret)
- If using ngrok, regenerate the URL if compromised
- For production, add authentication to your WebSocket endpoint
