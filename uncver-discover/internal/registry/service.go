package registry

import (
	"encoding/json"
	"log"
	"uncver-discover-artifact/internal/db"
	"uncver-discover-artifact/internal/models"
	"uncver-discover-artifact/internal/redis"
	"uncver-discover-artifact/internal/websocket"
)

// Service handles the core registry logic
type Service struct {
	database  *db.Database
	redis     *redis.Client
	wsHandler *websocket.Handler
}

// NewService creates a new registry service
func NewService(database *db.Database, redisClient *redis.Client, wsHandler *websocket.Handler) *Service {
	svc := &Service{
		database:  database,
		redis:     redisClient,
		wsHandler: wsHandler,
	}

	// Set up WebSocket message handler
	if wsHandler != nil {
		wsHandler.SetMessageHandler(svc.handleWebSocketMessage)
	}

	// Set up Redis stream subscriber
	if redisClient != nil {
		redisClient.SubscribeToRegisterStream(svc.handleRedisRegistration)
	}

	return svc
}

// RegisterArtifact registers a new artifact
func (s *Service) RegisterArtifact(reg *models.ArtifactRegistration) (*models.Artifact, error) {
	// Validate the registration
	if err := reg.Validate(); err != nil {
		return nil, err
	}

	// Store in database
	artifact, err := s.database.RegisterArtifact(reg)
	if err != nil {
		log.Printf("Failed to register artifact: %v", err)
		return nil, err
	}

	log.Printf("Registered artifact: %s (ID: %s)", artifact.Name, artifact.ID)

	// Publish confirmation to Redis
	if s.redis != nil {
		if err := s.redis.PublishConfirmation(artifact.ID, "success", "Artifact registered successfully"); err != nil {
			log.Printf("Failed to publish confirmation: %v", err)
		}

		// Publish to broadcast channel for websocket-stream service
		if err := s.redis.PublishBroadcast("artifact_registered", artifact); err != nil {
			log.Printf("Failed to publish broadcast: %v", err)
		}
	}

	// Broadcast to WebSocket clients
	if s.wsHandler != nil {
		s.wsHandler.Broadcast(artifact)
	}

	return artifact, nil
}

// GetArtifact retrieves an artifact by ID
func (s *Service) GetArtifact(id string) (*models.Artifact, error) {
	return s.database.GetArtifact(id)
}

// ListArtifacts lists all artifacts with pagination
func (s *Service) ListArtifacts(limit int, offset int, sortBy string) ([]*models.Artifact, error) {
	return s.database.ListArtifacts(limit, offset, sortBy)
}

// SearchArtifacts searches artifacts by query
func (s *Service) SearchArtifacts(query string, limit int, offset int) ([]*models.Artifact, error) {
	return s.database.SearchArtifacts(query, limit, offset)
}

// UpdateVersion updates an artifact's version
func (s *Service) UpdateVersion(id string, newVersion string) (*models.Artifact, error) {
	artifact, err := s.database.UpdateVersion(id, newVersion)
	if err != nil {
		return nil, err
	}

	log.Printf("Updated artifact version: %s (v%s)", artifact.Name, artifact.Version)

	// Publish update to Redis
	if s.redis != nil {
		if err := s.redis.PublishUpdate(artifact.ID, artifact.Version); err != nil {
			log.Printf("Failed to publish update: %v", err)
		}

		// Publish to broadcast channel
		if err := s.redis.PublishBroadcast("artifact_updated", artifact); err != nil {
			log.Printf("Failed to publish broadcast: %v", err)
		}
	}

	return artifact, nil
}

// UpdateArtifact updates artifact fields
func (s *Service) UpdateArtifact(id string, update *models.ArtifactUpdate) (*models.Artifact, error) {
	artifact, err := s.database.UpdateArtifact(id, update)
	if err != nil {
		return nil, err
	}

	log.Printf("Updated artifact: %s", artifact.Name)

	// Publish update to Redis
	if s.redis != nil {
		if err := s.redis.PublishUpdate(artifact.ID, artifact.Version); err != nil {
			log.Printf("Failed to publish update: %v", err)
		}
	}

	return artifact, nil
}

// GetArtifactsByTag retrieves artifacts by tag
func (s *Service) GetArtifactsByTag(tag string, limit int, offset int) ([]*models.Artifact, error) {
	return s.database.GetArtifactsByTag(tag, limit, offset)
}

// GetArtifactsByAuthor retrieves artifacts by author
func (s *Service) GetArtifactsByAuthor(author string, limit int, offset int) ([]*models.Artifact, error) {
	return s.database.GetArtifactsByAuthor(author, limit, offset)
}

// CountArtifacts returns the total count of artifacts
func (s *Service) CountArtifacts() (int, error) {
	return s.database.CountArtifacts()
}

// handleWebSocketMessage handles messages from WebSocket clients
func (s *Service) handleWebSocketMessage(client *websocket.Client, msg *websocket.WebSocketMessage) {
	switch msg.Action {
	case "register":
		s.handleWebSocketRegister(client, msg)
	case "update":
		s.handleWebSocketUpdate(client, msg)
	case "get":
		s.handleWebSocketGet(client, msg)
	case "list":
		s.handleWebSocketList(client, msg)
	case "search":
		s.handleWebSocketSearch(client, msg)
	default:
		client.SendConfirmation(msg.Action, "", "error", "Unknown action")
	}
}

func (s *Service) handleWebSocketRegister(client *websocket.Client, msg *websocket.WebSocketMessage) {
	if msg.Artifact == nil {
		client.SendConfirmation("register", "", "error", "Missing artifact data")
		return
	}

	artifact, err := s.RegisterArtifact(msg.Artifact)
	if err != nil {
		client.SendConfirmation("register", "", "error", err.Error())
		return
	}

	client.SendConfirmation("register", artifact.ID, "success", "Artifact registered")
}

func (s *Service) handleWebSocketUpdate(client *websocket.Client, msg *websocket.WebSocketMessage) {
	if msg.ID == "" {
		client.SendConfirmation("update", "", "error", "Missing artifact ID")
		return
	}

	update := &models.ArtifactUpdate{
		Version: msg.Artifact.Version,
		Tags:    msg.Artifact.Tags,
	}

	artifact, err := s.UpdateArtifact(msg.ID, update)
	if err != nil {
		client.SendConfirmation("update", msg.ID, "error", err.Error())
		return
	}

	client.SendConfirmation("update", artifact.ID, "success", "Artifact updated")
}

func (s *Service) handleWebSocketGet(client *websocket.Client, msg *websocket.WebSocketMessage) {
	if msg.ID == "" {
		client.SendConfirmation("get", "", "error", "Missing artifact ID")
		return
	}

	artifact, err := s.GetArtifact(msg.ID)
	if err != nil {
		client.SendConfirmation("get", msg.ID, "error", err.Error())
		return
	}

	client.SendArtifact(artifact)
}

func (s *Service) handleWebSocketList(client *websocket.Client, msg *websocket.WebSocketMessage) {
	limit := msg.Limit
	if limit == 0 {
		limit = 20
	}

	artifacts, err := s.ListArtifacts(limit, msg.Offset, msg.SortBy)
	if err != nil {
		client.SendConfirmation("list", "", "error", err.Error())
		return
	}

	total, _ := s.CountArtifacts()
	client.SendArtifactList(artifacts, total)
}

func (s *Service) handleWebSocketSearch(client *websocket.Client, msg *websocket.WebSocketMessage) {
	if msg.Query == "" {
		client.SendConfirmation("search", "", "error", "Missing search query")
		return
	}

	limit := msg.Limit
	if limit == 0 {
		limit = 20
	}

	artifacts, err := s.SearchArtifacts(msg.Query, limit, msg.Offset)
	if err != nil {
		client.SendConfirmation("search", "", "error", err.Error())
		return
	}

	client.SendArtifactList(artifacts, len(artifacts))
}

// handleRedisRegistration handles messages from Redis stream
func (s *Service) handleRedisRegistration(msg *models.RegistrationMessage) error {
	switch msg.Action {
	case "register":
		_, err := s.RegisterArtifact(&msg.Artifact)
		return err
	case "update":
		// Handle update from Redis - requires artifact ID
		// For now, just log it
		log.Printf("Received update action from Redis (not implemented)")
		return nil
	default:
		log.Printf("Unknown action from Redis: %s", msg.Action)
		return nil
	}
}

// PublishArtifactToRedis publishes an artifact to Redis streams
func (s *Service) PublishArtifactToRedis(artifact *models.Artifact) error {
	if s.redis == nil {
		return nil
	}

	data, err := json.Marshal(artifact)
	if err != nil {
		return err
	}

	return s.redis.GetClient().Publish(s.redis.Context(), redis.RegisteredStream, data).Err()
}
