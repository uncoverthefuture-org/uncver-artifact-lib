package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"
	"uncver-discover-artifact/internal/models"

	"github.com/redis/go-redis/v9"
)

const (
	// Input stream for registration requests
	RegisterStream = "uncver:discover:register"

	// Output streams
	RegisteredStream = "uncver:discover:registered"
	UpdateStream     = "uncver:discover:update"
	BroadcastChannel = "uncver:discover:broadcast"
)

// Client handles Redis operations
type Client struct {
	client *redis.Client
	ctx    context.Context
}

// NewClient creates a new Redis client
func NewClient(addr string, password string, db int) (*Client, error) {
	ctx := context.Background()

	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	// Test connection
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &Client{
		client: rdb,
		ctx:    ctx,
	}, nil
}

// Close closes the Redis connection
func (c *Client) Close() error {
	return c.client.Close()
}

// PublishConfirmation publishes a registration confirmation
func (c *Client) PublishConfirmation(artifactID string, status string, message string) error {
	msg := models.ConfirmationMessage{
		Action:     "register",
		ArtifactID: artifactID,
		Status:     status,
		Message:    message,
		Timestamp:  time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal confirmation: %w", err)
	}

	return c.client.XAdd(c.ctx, &redis.XAddArgs{
		Stream: RegisteredStream,
		Values: map[string]interface{}{
			"data": string(data),
		},
	}).Err()
}

// PublishUpdate publishes a version update
func (c *Client) PublishUpdate(artifactID string, newVersion string) error {
	msg := map[string]interface{}{
		"action":      "version_update",
		"artifact_id": artifactID,
		"version":     newVersion,
		"timestamp":   time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal update: %w", err)
	}

	return c.client.XAdd(c.ctx, &redis.XAddArgs{
		Stream: UpdateStream,
		Values: map[string]interface{}{
			"data": string(data),
		},
	}).Err()
}

// PublishBroadcast publishes to the broadcast channel for websocket-stream service
func (c *Client) PublishBroadcast(eventType string, artifact *models.Artifact) error {
	msg := map[string]interface{}{
		"type":      eventType,
		"artifact":  artifact,
		"timestamp": time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal broadcast: %w", err)
	}

	return c.client.Publish(c.ctx, BroadcastChannel, string(data)).Err()
}

// RegistrationHandler is a callback for handling registration messages
type RegistrationHandler func(*models.RegistrationMessage) error

// SubscribeToRegisterStream subscribes to the registration stream
func (c *Client) SubscribeToRegisterStream(handler RegistrationHandler) {
	consumerGroup := "uncver-discover-artifact"
	consumerName := fmt.Sprintf("consumer-%d", time.Now().Unix())

	// Create consumer group if it doesn't exist
	err := c.client.XGroupCreateMkStream(c.ctx, RegisterStream, consumerGroup, "$").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		log.Printf("Failed to create consumer group: %v", err)
	}

	go func() {
		for {
			streams, err := c.client.XReadGroup(c.ctx, &redis.XReadGroupArgs{
				Group:    consumerGroup,
				Consumer: consumerName,
				Streams:  []string{RegisterStream, ">"},
				Count:    10,
				Block:    5 * time.Second,
			}).Result()

			if err != nil {
				if err != redis.Nil {
					log.Printf("Error reading from stream: %v", err)
				}
				time.Sleep(1 * time.Second)
				continue
			}

			for _, stream := range streams {
				for _, message := range stream.Messages {
					c.processMessage(&message, handler, consumerGroup)
				}
			}
		}
	}()
}

// processMessage processes a single stream message
func (c *Client) processMessage(msg *redis.XMessage, handler RegistrationHandler, consumerGroup string) {
	data, ok := msg.Values["data"].(string)
	if !ok {
		log.Printf("Invalid message format: %v", msg.Values)
		c.client.XAck(c.ctx, RegisterStream, consumerGroup, msg.ID)
		return
	}

	var regMsg models.RegistrationMessage
	if err := json.Unmarshal([]byte(data), &regMsg); err != nil {
		log.Printf("Failed to unmarshal message: %v", err)
		c.client.XAck(c.ctx, RegisterStream, consumerGroup, msg.ID)
		return
	}

	// Handle the registration
	if err := handler(&regMsg); err != nil {
		log.Printf("Failed to handle registration: %v", err)
		// Don't ack - will be retried
		return
	}

	// Acknowledge the message
	if err := c.client.XAck(c.ctx, RegisterStream, consumerGroup, msg.ID).Err(); err != nil {
		log.Printf("Failed to ack message: %v", err)
	}
}

// GetClient returns the underlying Redis client for direct access if needed
func (c *Client) GetClient() *redis.Client {
	return c.client
}

// Context returns the context for Redis operations
func (c *Client) Context() context.Context {
	return c.ctx
}
