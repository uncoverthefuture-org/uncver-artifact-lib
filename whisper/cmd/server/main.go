package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	redisAddr      = getEnv("REDIS_ADDR", "localhost:6379")
	registryStream = getEnv("REGISTRY_STREAM", "uncver:stream:registry")
	textStream     = getEnv("TEXT_STREAM", "uncver:stream:audio:text")
	chunkDurSec    = getEnv("CHUNK_DURATION_SEC", "5")
	sampleRate     = getEnv("SAMPLE_RATE", "16000")
	instanceID     = generateInstanceID()
)

func main() {
	log.SetOutput(os.Stdout)
	log.Printf("[whisper] Starting uncver-whisper - Instance: %s", instanceID)

	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("[whisper] Failed to connect to Redis: %v", err)
	}
	log.Printf("[whisper] Connected to Redis")

	broadcastCapability(ctx, rdb)

	go listenForBroadcastRequests(ctx, rdb)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	chunkDur := 5
	fmt.Sscanf(chunkDurSec, "%d", &chunkDur)

	log.Printf("[whisper] Recording %s second chunks at %sHz", chunkDurSec, sampleRate)

	chunkNum := 0
	ticker := time.NewTicker(time.Duration(chunkDur) * time.Second)

	for {
		select {
		case <-sigChan:
			log.Println("[whisper] Shutting down...")
			return
		case <-ticker.C:
			chunkNum++
			if err := captureAndTranscribe(ctx, rdb, chunkNum); err != nil {
				log.Printf("[whisper] Error: %v", err)
			}
		}
	}
}

func captureAndTranscribe(ctx context.Context, rdb *redis.Client, chunkNum int) error {
	msgID := fmt.Sprintf("%s-%d-%d", instanceID, time.Now().UnixNano(), chunkNum)

	cmd := exec.Command("sox", "-d", "-r", sampleRate, "-c", "1", "-b", "16", "-t", "raw", "-",
		"silence", "1", "0.1", "100%", "1", "0.1", "100%")
	var rawAudio []byte
	cmd.Stdout = &audioWriter{buf: &rawAudio}

	if err := cmd.Run(); err != nil {
		log.Printf("[whisper] sox error: %v", err)
	}

	if len(rawAudio) < 100 {
		log.Printf("[whisper] Chunk %d: silence, skipping", chunkNum)
		return nil
	}

	tmpWav := fmt.Sprintf("/tmp/whisper-%s.wav", msgID)
	defer os.Remove(tmpWav)

	if err := writeWav(tmpWav, rawAudio, sampleRate); err != nil {
		return fmt.Errorf("write wav: %w", err)
	}

	text, err := runWhisper(tmpWav)
	if err != nil {
		return fmt.Errorf("whisper: %w", err)
	}

	text = cleanText(text)
	if text == "" {
		log.Printf("[whisper] Chunk %d: empty transcription", chunkNum)
		return nil
	}

	_, err = rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: textStream,
		MaxLen: 1000,
		Approx: true,
		Values: map[string]interface{}{
			"type":      "transcription",
			"chunk_id":  msgID,
			"text":      text,
			"instance":  instanceID,
			"timestamp": time.Now().Unix(),
		},
	}).Result()
	if err != nil {
		return fmt.Errorf("redis xadd: %w", err)
	}

	log.Printf("[whisper] Sent: %s", truncate(text, 50))
	return nil
}

func broadcastCapability(ctx context.Context, rdb *redis.Client) {
	cap := map[string]interface{}{
		"type":        "capability",
		"name":        "uncver-whisper",
		"instance":    instanceID,
		"description": "Captures mic audio and transcribes to text via whisper.cpp",
		"streams":     map[string]string{"text_out": textStream},
		"commands":    []string{"broadcast"},
		"timestamp":   time.Now().Unix(),
	}
	data, _ := json.Marshal(cap)
	_, err := rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: registryStream,
		MaxLen: 1000,
		Approx: true,
		Values: map[string]interface{}{"type": "capability", "data": string(data)},
	}).Result()
	if err != nil {
		log.Printf("[whisper] Failed to broadcast capability: %v", err)
	} else {
		log.Printf("[whisper] Broadcast capability to %s", registryStream)
	}
}

func listenForBroadcastRequests(ctx context.Context, rdb *redis.Client) {
	lastID := "0"
	for {
		result, err := rdb.XRead(ctx, &redis.XReadArgs{
			Streams: []string{registryStream, lastID},
			Count:   10,
			Block:   5000,
		}).Result()
		if err != nil {
			if err == redis.Nil { continue }
			log.Printf("[whisper] Registry read error: %v", err)
			continue
		}
		for _, stream := range result {
			for _, msg := range stream.Messages {
				lastID = msg.ID
				msgType, _ := msg.Values["type"].(string)
				if msgType == "broadcast_request" {
					log.Printf("[whisper] Broadcast requested")
					broadcastCapability(ctx, rdb)
				}
			}
		}
	}
}

func writeWav(filename string, pcmData []byte, sampleRate string) error {
	sr := 16000
	fmt.Sscanf(sampleRate, "%d", &sr)

	file, err := os.Create(filename)
	if err != nil { return err }
	defer file.Close()

	header := make([]byte, 44)
	dataSize := len(pcmData)
	copy(header[0:4], []byte("RIFF"))
	writeUint32(header[4:8], uint32(36+dataSize))
	copy(header[8:12], []byte("WAVE"))
	copy(header[12:16], []byte("fmt "))
	writeUint32(header[16:20], 16)
	writeUint16(header[20:22], 1)
	writeUint16(header[22:24], 1)
	writeUint32(header[24:28], uint32(sr))
	writeUint32(header[28:32], uint32(sr*2))
	writeUint16(header[32:34], 2)
	writeUint16(header[34:36], 16)
	copy(header[36:40], []byte("data"))
	writeUint32(header[40:44], uint32(dataSize))

	file.Write(header)
	file.Write(pcmData)
	return nil
}

func writeUint16(buf []byte, v uint16) {
	buf[0] = byte(v); buf[1] = byte(v >> 8)
}

func writeUint32(buf []byte, v uint32) {
	buf[0] = byte(v); buf[1] = byte(v >> 8)
	buf[2] = byte(v >> 16); buf[3] = byte(v >> 24)
}

func runWhisper(wavFile string) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("whisper.cpp/main", "-m", "whisper.cpp/models/ggml-base.bin",
		"-f", wavFile, "--language", "en", "--no-timestamps")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("whisper failed: %v - %s", err, stderr.String())
	}
	return stdout.String(), nil
}

func cleanText(s string) string {
	s = bytes.NewBufferString(s).String()
	var result bytes.Buffer
	for _, r := range s {
		if r >= 32 && r <= 126 || r == '\n' || r == '\t' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

type audioWriter struct {
	buf *[]byte
}

func (w *audioWriter) Write(p []byte) (int, error) {
	*w.buf = append(*w.buf, p...)
	return len(p), nil
}

func truncate(s string, max int) string {
	if len(s) <= max { return s }
	return s[:max] + "..."
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" { return value }
	return defaultValue
}

func generateInstanceID() string {
	return fmt.Sprintf("whisper-%d", time.Now().UnixNano())
}
