# uncver-whisper-transcribe

Receives audio from Redis, transcribes with Whisper, sends text to chat.

## Usage

```bash
docker-compose up -d whisper-transcribe
```

## Environment Variables

- `REDIS_ADDR`: Redis server address
- `AUDIO_STREAM`: Input audio stream (default: uncver:stream:mic)
- `OUTPUT_STREAM`: Output text stream (default: uncver:stream:input)
- `WHISPER_MODEL`: Model size (tiny, base, small, medium, large)

## Flow

mic-capture → uncver:stream:mic → whisper-transcribe → uncver:stream:input → gemma
