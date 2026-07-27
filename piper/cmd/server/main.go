package main

import (
	"context"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	redisAddr   = getEnv("REDIS_ADDR", "localhost:6379")
	inputStream = getEnv("INPUT_STREAM", "uncver:ai:router")
)
var playMu sync.Mutex

func main() {
	log.SetOutput(os.Stdout)
	log.Print("[piper] Starting")
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr, ReadTimeout: 3 * time.Second, WriteTimeout: 3 * time.Second})
	defer rdb.Close()
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("[piper] Redis: %v", err)
	}
	log.Print("[piper] Connected to Redis")
	rdb.XAdd(context.Background(), &redis.XAddArgs{
		Stream: inputStream, MaxLen: 1000, Approx: true,
		Values: map[string]interface{}{
			"source": "piper", "type": "piper:announce",
			"data": "Piper ready — neural voice online.",
			"timestamp": time.Now().Unix(),
		},
	})
	listenForMessages(rdb)
}

func listenForMessages(rdb *redis.Client) {
	lastID := "0"
	for {
		r, err := rdb.XRead(context.Background(), &redis.XReadArgs{
			Streams: []string{inputStream, lastID}, Count: 10, Block: 0,
		}).Result()
		if err != nil && err != redis.Nil {
			log.Printf("[piper] Stream error: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}
		for _, s := range r {
			for _, m := range s.Messages {
				lastID = m.ID
				msgType, _ := m.Values["type"].(string)
				if msgType == "piper:speak" {
					if text := extractText(m.Values); text != "" {
						go speakText(text)
					}
				}
			}
		}
		if len(r) == 0 {
			time.Sleep(500 * time.Millisecond)
		}
	}
}

func extractText(v map[string]interface{}) string {
	if d, ok := v["data"].(string); ok && d != "" && !strings.HasPrefix(d, "{") {
		return cleanResponse(d)
	}
	if t, ok := v["text"].(string); ok && t != "" {
		return cleanResponse(t)
	}
	return ""
}

func cleanResponse(text string) string {
	for _, s := range []string{"\n{\"call\"", "\n{\"tool\""} {
		if idx := strings.Index(text, s); idx > 0 {
			text = strings.TrimSpace(text[:idx])
		}
	}
	return text
}

func speakText(text string) {
	playMu.Lock()
	defer playMu.Unlock()

	chunks := splitSentences(text)
	if len(chunks) == 0 {
		return
	}

	for i, chunk := range chunks {
		if i > 0 {
			time.Sleep(50 * time.Millisecond)
		}
		piper := exec.Command("/app/piper/piper/piper", "--model", "/app/model.onnx", "--output-raw")
		piper.Stdin = strings.NewReader(chunk)
		piperOut, err := piper.StdoutPipe()
		if err != nil {
			log.Printf("[piper] pipe: %v", err)
			continue
		}
		aplay := exec.Command("aplay", "-q", "-r", "22050", "-f", "S16_LE", "-t", "raw", "-")
		aplay.Stdin = piperOut
		if err := aplay.Start(); err != nil {
			log.Printf("[piper] aplay start: %v", err)
			continue
		}
		if err := piper.Run(); err != nil {
			log.Printf("[piper] piper: %v", err)
			aplay.Process.Kill()
			aplay.Wait()
			continue
		}
		aplay.Wait()
	}

	first := chunks[0]
	if len(first) > 50 {
		first = first[:50] + "..."
	}
	log.Printf("[piper] Spoke: %s (%d chunks)", first, len(chunks))
}

func splitSentences(text string) []string {
	var chunks []string
	var buf strings.Builder
	runes := []rune(text)
	for i, r := range runes {
		buf.WriteRune(r)
		if strings.ContainsRune(".!?", r) {
			if i+1 >= len(runes) || runes[i+1] == ' ' || runes[i+1] == '\n' {
				if s := strings.TrimSpace(buf.String()); s != "" {
					chunks = append(chunks, s)
				}
				buf.Reset()
			}
		}
	}
	if s := strings.TrimSpace(buf.String()); s != "" {
		chunks = append(chunks, s)
	}
	if len(chunks) == 0 && strings.TrimSpace(text) != "" {
		chunks = append(chunks, strings.TrimSpace(text))
	}
	return chunks
}

func getEnv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
