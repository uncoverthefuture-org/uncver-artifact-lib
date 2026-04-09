# Artifact Dependencies

Each artifact can declare required artifacts that must be running.

## artifact.json with Dependencies

```json
{
  "name": "uncver-discover-artifact",
  "version": "1.0.0",
  "description": "Artifact discovery registry",
  "container_image": "ghcr.io/sirdavis99/uncver-discover-artifact:latest",
  "required_artifacts": [
    {
      "name": "uncver-redis-stream-artifact",
      "min_version": "1.0.0",
      "required": true
    },
    {
      "name": "uncver-websocket-stream-artifact", 
      "min_version": "1.0.0",
      "required": true
    }
  ],
  "auto_start": true
}
```

## Auto-Start Behavior

When `uncver-artifacts run` is called:

1. Check if artifact has `required_artifacts`
2. For each required artifact:
   - Check if it's already running
   - If not, pull image and start it
   - Wait for health check
3. Start the main artifact
4. If any required fails, mark main artifact as "broken"

## Dependency Resolution

```bash
# Running an artifact automatically starts dependencies
uncver-artifacts start my-custom-app
# Output:
# Checking dependencies...
#  ✓ redis-stream-artifact already running
#  ✓ websocket-stream-artifact already running
#  ✓ discover-artifact already running
#  ✓ Starting my-custom-app

# If dependency missing
uncver-artifacts start my-custom-app
# Output:
# Checking dependencies...
#  ✓ redis-stream-artifact already running
#  ✗ websocket-stream-artifact not running
#  → Pulling uncver-websocket-stream-artifact:latest
#  → Starting websocket-stream-artifact
#  ✓ websocket-stream-artifact healthy
#  ✓ Starting my-custom-app
```

## Broken State

If a required artifact stops:
```
⚠️  my-custom-app is BROKEN
   Missing dependency: redis-stream-artifact
   Run: uncver-artifacts fix my-custom-app
```

## CLI Commands

```bash
uncver-artifacts deps my-artifact    # Show dependencies
uncver-artifacts fix my-artifact     # Restart missing deps
uncver-artifacts deps --tree         # Show full dependency tree
```
