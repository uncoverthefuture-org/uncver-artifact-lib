package main

import (
	"context"
	"encoding/base64"
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
	redisAddr   = getEnv("REDIS_ADDR", "localhost:6379")
	redisStream = getEnv("REDIS_STREAM", "uncver:stream:audio:raw")
	chunkDurSec = getEnv("CHUNK_DURATION_SEC", "5")
	sampleRate  = getEnv("SAMPLE_RATE", "16000")
	instanceID  = generateInstanceID()
)

func main() {
	log.SetOutput(os.Stdout)
	log.Printf("[mic] Starting uncver-mic - Instance: %s", instanceID)
	log.Printf("[mic] Redis: %s, Stream: %s, Chunk: %ss", redisAddr, redisStream, chunkDurSec)

	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("[mic] Failed to connect to Redis: %v", err)
	}
	log.Printf("[mic] Connected to Redis")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	chunkDur := 5
	fmt.Sscanf(chunkDurSec, "%d", &chunkDur)

	log.Printf("[mic] Recording %s second chunks at %sHz", chunkDurSec, sampleRate)
	log.Printf("[mic] Streaming to %s", redisStream)

	chunkNum := 0
	ticker := time.NewTicker(time.Duration(chunkDur) * time.Second)

	for {
		select {
		case <-sigChan:
			log.Println("[mic] Shutting down...")
			return
		case <-ticker.C:
			chunkNum++
			if err := recordAndSend(ctx, rdb, chunkNum); err != nil {
				log.Printf("[mic] Error recording chunk: %v", err)
			}
		}
	}
}

func recordAndSend(ctx context.Context, rdb *redis.Client, chunkNum int) error {
	msgID := fmt.Sprintf("%s-%d-%d", instanceID, time.Now().UnixNano(), chunkNum)

	cmd := exec.Command("sox", "-d", "-r", sampleRate, "-c", "1", "-b", "16", "-t", "raw", "-", " silence", "1", "0.1", "100%", "1", "0.1", "100%")

	var rawAudio []byte
	cmd.Stdout = &audioWriter{buf: &rawAudio}

	err := cmd.Run()
	if err != nil {
		log.Printf("[mic] sox error (may be silence): %v", err)
	}

	if len(rawAudio) < 100 {
		log.Printf("[mic] Chunk %d: silence or too short, skipping", chunkNum)
		return nil
	}

	audioB64 := base64.StdEncoding.EncodeToString(rawAudio)

	_, err = rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: redisStream,
		MaxLen: 1000,
		Approx: true,
		Values: map[string]interface{}{
			"chunk_id":     msgID,
			"audio":        audioB64,
			"sample_rate":  sampleRate,
			"channels":     1,
			"timestamp":    time.Now().Unix(),
			"instance":     instanceID,
			"duration_sec": chunkDurSec,
		},
	}).Result()

	if err != nil {
		return fmt.Errorf("redis xadd: %w", err)
	}

	log.Printf("[mic] Sent chunk %d: %d bytes", chunkNum, len(rawAudio))
	return nil
}

type audioWriter struct {
	buf *[]byte
}

func (w *audioWriter) Write(p []byte) (int, error) {
	*w.buf = append(*w.buf, p...)
	return len(p), nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func generateInstanceID() string {
	return fmt.Sprintf("mic-%d", time.Now().UnixNano())
}
