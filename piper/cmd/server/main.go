package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	redisAddr   = getEnv("REDIS_ADDR", "localhost:6379")
	redisStream = getEnv("REDIS_STREAM", "uncver:stream:audio")
	windowSecs  = getEnv("WINDOW_SECONDS", "60")
	instanceID  = generateInstanceID()
)

type Message struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type AudioQueue struct {
	mu       sync.Mutex
	messages []string
	ticker   *time.Ticker
	done     chan struct{}
}

func NewAudioQueue(windowSeconds int) *AudioQueue {
	q := &AudioQueue{
		messages: make([]string, 0),
		done:     make(chan struct{}),
	}
	q.ticker = time.NewTicker(time.Duration(windowSeconds) * time.Second)
	return q
}

func (q *AudioQueue) Add(text string) {
	q.mu.Lock()
	q.messages = append(q.messages, text)
	q.mu.Unlock()
}

func (q *AudioQueue) Drain() []string {
	q.mu.Lock()
	msgs := q.messages
	q.messages = make([]string, 0)
	q.mu.Unlock()
	return msgs
}

func (q *AudioQueue) Start(handler func([]string)) {
	go func() {
		for {
			select {
			case <-q.ticker.C:
				msgs := q.Drain()
				if len(msgs) > 0 {
					handler(msgs)
				}
			case <-q.done:
				q.ticker.Stop()
				return
			}
		}
	}()
}

func (q *AudioQueue) Stop() {
	close(q.done)
}

func main() {
	log.SetOutput(os.Stdout)
	log.Printf("[piper] Starting uncver-piper - Instance: %s", instanceID)
	log.Printf("[piper] Redis: %s, Stream: %s, Window: %ss", redisAddr, redisStream, windowSecs)

	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("[piper] Failed to connect to Redis: %v", err)
	}
	log.Printf("[piper] Connected to Redis")

	windowSec := 60
	fmt.Sscanf(windowSecs, "%d", &windowSec)
	queue := NewAudioQueue(windowSec)

	queue.Start(func(messages []string) {
		log.Printf("[piper] Window closed, speaking %d chunks", len(messages))
		for _, text := range messages {
			speak(text)
		}
	})

	go listenForAudio(ctx, rdb, queue)

	log.Printf("[piper] Listening on %s, speaking in %ds windows", redisStream, windowSec)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("[piper] Shutting down...")
	queue.Stop()
}

func listenForAudio(ctx context.Context, rdb *redis.Client, queue *AudioQueue) {
	lastID := "0"
	log.Printf("[piper] Listening for audio on: %s", redisStream)

	for {
		result, err := rdb.XRead(ctx, &redis.XReadArgs{
			Streams: []string{redisStream, lastID},
			Count:   100,
			Block:   5000,
		}).Result()

		if err != nil {
			if err == redis.Nil {
				continue
			}
			log.Printf("[piper] Error reading stream: %v", err)
			continue
		}

		for _, stream := range result {
			for _, msg := range stream.Messages {
				lastID = msg.ID
				handleMessage(msg.Values, queue)
			}
		}
	}
}

func handleMessage(values map[string]interface{}, queue *AudioQueue) {
	text := extractText(values)
	if text == "" {
		return
	}

	msgType := extractType(values)
	if msgType != "say" && msgType != "speak" && msgType != "utter" {
		msgType = "say"
	}

	queue.Add(text)
	log.Printf("[piper] Queued: %s", truncate(text, 50))
}

func extractText(values map[string]interface{}) string {
	for _, v := range values {
		switch val := v.(type) {
		case string:
			if val != "" && !strings.HasPrefix(val, "{") {
				return val
			}
		}
	}

	if data, ok := values["data"].(string); ok {
		var msg Message
		if err := json.Unmarshal([]byte(data), &msg); err == nil && msg.Text != "" {
			return msg.Text
		}
	}

	if text, ok := values["text"].(string); ok {
		return text
	}

	return ""
}

func extractType(values map[string]interface{}) string {
	if t, ok := values["type"].(string); ok {
		return t
	}
	if data, ok := values["data"].(string); ok {
		var msg Message
		if err := json.Unmarshal([]byte(data), &msg); err == nil {
			return msg.Type
		}
	}
	return ""
}

func speak(text string) {
	if text == "" {
		return
	}

	log.Printf("[piper] Speaking: %s", truncate(text, 30))

	cmd := exec.Command("espeak", "-w", "/dev/null", text)
	if err := cmd.Run(); err != nil {
		log.Printf("[piper] espeak check failed: %v", err)
	}

	cmd = exec.Command("espeak", text)
	if err := cmd.Run(); err != nil {
		log.Printf("[piper] espeak failed: %v", err)
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
	return fmt.Sprintf("piper-%d", time.Now().UnixNano())
}
