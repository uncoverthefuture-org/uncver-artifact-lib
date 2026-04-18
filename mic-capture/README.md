# uncver-mic-capture

Captures microphone audio in chunks and publishes to Redis stream.

## Usage

```bash
docker-compose up -d mic-capture
```

## Environment Variables

- `REDIS_ADDR`: Redis server address (default: localhost:6379)
- `AUDIO_STREAM`: Output stream (default: uncver:stream:mic)
- `CHUNK_DURATION`: Chunk duration in ms (default: 5000)
- `SAMPLE_RATE`: Sample rate (default: 16000)

## Dependencies

- sox (for audio capture)
