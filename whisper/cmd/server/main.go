package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	redisAddrIn    = getEnv("REDIS_ADDR", "localhost:6379")
	redisStreamIn  = getEnv("REDIS_STREAM_IN", "uncver:stream:audio:raw")
	redisStreamOut = getEnv("REDIS_STREAM_OUT", "uncver:stream:audio:text")
	batchSize      = getEnv("BATCH_SIZE", "10")
	instanceID     = generateInstanceID()
)

type AudioChunk struct {
	ChunkID    string `json:"chunk_id"`
	Audio      string `json:"audio"`
	SampleRate string `json:"sample_rate"`
	Channels   int    `json:"channels"`
	Timestamp  int64  `json:"timestamp"`
	Instance   string `json:"instance"`
}

type TranscriptionResult struct {
	ChunkID   string `json:"chunk_id"`
	Text      string `json:"text"`
	Language  string `json:"language"`
	Timestamp int64  `json:"timestamp"`
	Instance  string `json:"instance"`
	Error     string `json:"error,omitempty"`
}

func main() {
	log.SetOutput(os.Stdout)
	log.Printf("[whisper] Starting uncver-whisper - Instance: %s", instanceID)
	log.Printf("[whisper] In: %s, Out: %s, Batch: %s", redisStreamIn, redisStreamOut, batchSize)

	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{Addr: redisAddrIn})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("[whisper] Failed to connect to Redis: %v", err)
	}
	log.Printf("[whisper] Connected to Redis")

	batch := 10
	fmt.Sscanf(batchSize, "%d", &batch)

	queue := NewChunkQueue(batch)
	go queue.process(ctx, rdb)
	go listenForChunks(ctx, rdb, queue)

	log.Printf("[whisper] Listening on %s, outputting to %s", redisStreamIn, redisStreamOut)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("[whisper] Shutting down...")
}

func listenForChunks(ctx context.Context, rdb *redis.Client, queue *ChunkQueue) {
	lastID := "0"

	for {
		result, err := rdb.XRead(ctx, &redis.XReadArgs{
			Streams: []string{redisStreamIn, lastID},
			Count:   100,
			Block:   5000,
		}).Result()

		if err != nil {
			if err == redis.Nil {
				continue
			}
			log.Printf("[whisper] Error reading stream: %v", err)
			continue
		}

		for _, stream := range result {
			for _, msg := range stream.Messages {
				lastID = msg.ID
				var chunk AudioChunk
				if err := parseChunk(msg.Values, &chunk); err != nil {
					log.Printf("[whisper] Failed to parse chunk: %v", err)
					continue
				}
				queue.Add(chunk)
			}
		}
	}
}

func parseChunk(values map[string]interface{}, chunk *AudioChunk) error {
	chunk.ChunkID, _ = values["chunk_id"].(string)
	chunk.Audio, _ = values["audio"].(string)
	chunk.SampleRate, _ = values["sample_rate"].(string)
	chunk.Instance, _ = values["instance"].(string)

	if ts, ok := values["timestamp"].(int64); ok {
		chunk.Timestamp = ts
	} else if ts, ok := values["timestamp"].(int); ok {
		chunk.Timestamp = int64(ts)
	}

	if ch, ok := values["channels"].(int); ok {
		chunk.Channels = ch
	}

	return nil
}

type ChunkQueue struct {
	mu      sync.Mutex
	chunks  []AudioChunk
	batch   int
	pending chan struct{}
}

func NewChunkQueue(batch int) *ChunkQueue {
	return &ChunkQueue{
		chunks:  make([]AudioChunk, 0),
		batch:   batch,
		pending: make(chan struct{}, 1),
	}
}

func (q *ChunkQueue) Add(chunk AudioChunk) {
	q.mu.Lock()
	q.chunks = append(q.chunks, chunk)
	shouldProcess := len(q.chunks) >= q.batch
	q.mu.Unlock()

	if shouldProcess {
		select {
		case q.pending <- struct{}{}:
		default:
		}
	}
}

func (q *ChunkQueue) Drain() []AudioChunk {
	q.mu.Lock()
	chunks := q.chunks
	q.chunks = make([]AudioChunk, 0)
	q.mu.Unlock()
	return chunks
}

func (q *ChunkQueue) process(ctx context.Context, rdb *redis.Client) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-q.pending:
			chunks := q.Drain()
			if len(chunks) == 0 {
				continue
			}
			log.Printf("[whisper] Processing batch of %d chunks", len(chunks))
			for _, chunk := range chunks {
				result := transcribe(chunk)
				q.sendResult(ctx, rdb, result)
			}
		}
	}
}

func transcribe(chunk AudioChunk) TranscriptionResult {
	result := TranscriptionResult{
		ChunkID:   chunk.ChunkID,
		Timestamp: time.Now().Unix(),
		Instance:  instanceID,
		Language:  "en",
	}

	if chunk.Audio == "" {
		result.Error = "empty audio"
		return result
	}

	// Decode base64 audio
	audioData, err := base64.StdEncoding.DecodeString(chunk.Audio)
	if err != nil {
		result.Error = fmt.Sprintf("base64 decode: %v", err)
		return result
	}

	// Write to temp WAV file
	tmpWav := fmt.Sprintf("/tmp/whisper-%s.wav", chunk.ChunkID)
	defer os.Remove(tmpWav)

	// Convert raw PCM to WAV
	if err := writeWav(tmpWav, audioData, chunk.SampleRate); err != nil {
		result.Error = fmt.Sprintf("write wav: %v", err)
		return result
	}

	// Run whisper.cpp
	text, err := runWhisper(tmpWav)
	if err != nil {
		result.Error = fmt.Sprintf("whisper: %v", err)
		return result
	}

	result.Text = text
	log.Printf("[whisper] Transcribed: %s", truncate(text, 50))
	return result
}

func writeWav(filename string, pcmData []byte, sampleRate string) error {
	sr := 16000
	fmt.Sscanf(sampleRate, "%d", &sr)

	// Simple WAV header
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	// WAV header
	header := make([]byte, 44)
	dataSize := len(pcmData)

	// RIFF header
	copy(header[0:4], []byte("RIFF"))
	writeUint32(header[4:8], uint32(36+dataSize))
	copy(header[8:12], []byte("WAVE"))

	// fmt chunk
	copy(header[12:16], []byte("fmt "))
	writeUint32(header[16:20], 16)           // chunk size
	writeUint16(header[20:22], 1)            // PCM format
	writeUint16(header[22:24], 1)            // mono
	writeUint32(header[24:28], uint32(sr))   // sample rate
	writeUint32(header[28:32], uint32(sr*2)) // byte rate
	writeUint16(header[32:34], 2)            // block align
	writeUint16(header[34:36], 16)           // bits per sample

	// data chunk
	copy(header[36:40], []byte("data"))
	writeUint32(header[40:44], uint32(dataSize))

	file.Write(header)
	file.Write(pcmData)
	return nil
}

func writeUint16(buf []byte, v uint16) {
	buf[0] = byte(v)
	buf[1] = byte(v >> 8)
}

func writeUint32(buf []byte, v uint32) {
	buf[0] = byte(v)
	buf[1] = byte(v >> 8)
	buf[2] = byte(v >> 16)
	buf[3] = byte(v >> 24)
}

func runWhisper(wavFile string) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("whisper.cpp/main", "-m", "whisper.cpp/models/ggml-base.bin", "-f", wavFile, "--language", "en", "--no-timestamps")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("whisper failed: %v - %s", err, stderr.String())
	}

	return stdout.String(), nil
}

func (q *ChunkQueue) sendResult(ctx context.Context, rdb *redis.Client, result TranscriptionResult) {
	data, err := json.Marshal(result)
	if err != nil {
		log.Printf("[whisper] Failed to marshal result: %v", err)
		return
	}

	_, err = rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: redisStreamOut,
		MaxLen: 1000,
		Approx: true,
		Values: map[string]interface{}{
			"type":      "transcription",
			"data":      string(data),
			"instance":  instanceID,
			"chunk_id":  result.ChunkID,
			"text":      result.Text,
			"error":     result.Error,
			"timestamp": time.Now().Unix(),
		},
	}).Result()

	if err != nil {
		log.Printf("[whisper] Failed to send result: %v", err)
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func generateInstanceID() string {
	return fmt.Sprintf("whisper-%d", time.Now().UnixNano())
}
