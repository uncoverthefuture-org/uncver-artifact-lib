package redis

import (
	"context"
	"log"
	"os"

	"github.com/redis/go-redis/v9"
)

// Client wraps the Redis client for streaming operations
type Client struct {
	client *redis.Client
	stream string
}

// NewClient creates a new Redis client
func NewClient() *Client {
	addr := getEnv("REDIS_ADDR", "localhost:6379")
	password := getEnv("REDIS_PASSWORD", "")
	db := 0

	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	return &Client{
		client: rdb,
		stream: "uncver:discover:broadcast",
	}
}

// Ping checks the connection to Redis
func (c *Client) Ping(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}

// SubscribeToBroadcast subscribes to the broadcast stream and sends messages to the callback
func (c *Client) SubscribeToBroadcast(ctx context.Context, onMessage func(map[string]interface{})) error {
	// Use XREAD to read from the stream
	// Start reading from the latest messages
	lastID := "0"

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Read from the stream with a block timeout
		result, err := c.client.XRead(ctx, &redis.XReadArgs{
			Streams: []string{c.stream, lastID},
			Count:   100,
			Block:   5000, // Block for 5 seconds
		}).Result()

		if err != nil {
			if err == redis.Nil {
				// Timeout, continue and retry
				continue
			}
			log.Printf("Error reading from Redis stream: %v", err)
			continue
		}

		// Process messages
		for _, stream := range result {
			for _, msg := range stream.Messages {
				// Update lastID to get messages after this one
				lastID = msg.ID

				// Convert message values to map[string]interface{}
				data := make(map[string]interface{})
				for k, v := range msg.Values {
					data[k] = v
				}

				// Add metadata
				data["_stream_id"] = msg.ID
				data["_stream"] = c.stream

				// Call the callback
				onMessage(data)
			}
		}
	}
}

// Close closes the Redis connection
func (c *Client) Close() error {
	return c.client.Close()
}

// getEnv returns the value of an environment variable or a default value
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
