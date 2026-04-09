package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
	"uncver-discover-artifact/internal/models"

	"github.com/gorilla/websocket"
)

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			// Allow all origins - configure for production
			return true
		},
	}
)

// MessageHandler is a callback for handling WebSocket messages
type MessageHandler func(*Client, *WebSocketMessage)

// Handler manages WebSocket connections
type Handler struct {
	clients        map[*Client]bool
	broadcast      chan *models.Artifact
	register       chan *Client
	unregister     chan *Client
	messageHandler MessageHandler
	mu             sync.RWMutex
}

// Client represents a WebSocket client connection
type Client struct {
	handler *Handler
	conn    *websocket.Conn
	send    chan []byte
}

// WebSocketMessage represents a message from WebSocket clients
type WebSocketMessage struct {
	Action   string                       `json:"action"` // "register", "update", "list", "get", "search"
	Artifact *models.ArtifactRegistration `json:"artifact,omitempty"`
	ID       string                       `json:"id,omitempty"`
	Query    string                       `json:"query,omitempty"`
	Limit    int                          `json:"limit,omitempty"`
	Offset   int                          `json:"offset,omitempty"`
	SortBy   string                       `json:"sort_by,omitempty"`
}

// NewHandler creates a new WebSocket handler
func NewHandler() *Handler {
	return &Handler{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan *models.Artifact),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the WebSocket handler loop
func (h *Handler) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client connected. Total: %d", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected. Total: %d", len(h.clients))

		case artifact := <-h.broadcast:
			h.broadcastArtifact(artifact)
		}
	}
}

// broadcastArtifact sends an artifact to all connected clients
func (h *Handler) broadcastArtifact(artifact *models.Artifact) {
	data, err := json.Marshal(map[string]interface{}{
		"type":      "artifact_registered",
		"artifact":  artifact,
		"timestamp": time.Now(),
	})
	if err != nil {
		log.Printf("Failed to marshal artifact: %v", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			// Client's send channel is full, close it
			close(client.send)
			delete(h.clients, client)
		}
	}
}

// ServeHTTP handles WebSocket upgrade requests
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}

	client := &Client{
		handler: h,
		conn:    conn,
		send:    make(chan []byte, 256),
	}

	h.register <- client

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

// Broadcast sends an artifact to all connected WebSocket clients
func (h *Handler) Broadcast(artifact *models.Artifact) {
	h.broadcast <- artifact
}

// GetClientCount returns the number of connected clients
func (h *Handler) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// SetMessageHandler sets the handler for WebSocket messages
func (h *Handler) SetMessageHandler(handler MessageHandler) {
	h.messageHandler = handler
}

// readPump reads messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
		c.handler.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg WebSocketMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			c.sendError("invalid_message", "Failed to parse message")
			continue
		}

		// Handle the message through the registered handler
		if c.handler.messageHandler != nil {
			c.handler.messageHandler(c, &msg)
		}
	}
}

// writePump writes messages to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.conn.WriteMessage(websocket.TextMessage, message)

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// SendArtifact sends an artifact to the client
func (c *Client) SendArtifact(artifact *models.Artifact) {
	data, err := json.Marshal(map[string]interface{}{
		"type":      "artifact",
		"artifact":  artifact,
		"timestamp": time.Now(),
	})
	if err != nil {
		log.Printf("Failed to marshal artifact: %v", err)
		return
	}
	c.send <- data
}

// SendArtifactList sends a list of artifacts to the client
func (c *Client) SendArtifactList(artifacts []*models.Artifact, total int) {
	data, err := json.Marshal(map[string]interface{}{
		"type":      "artifact_list",
		"artifacts": artifacts,
		"total":     total,
		"timestamp": time.Now(),
	})
	if err != nil {
		log.Printf("Failed to marshal artifact list: %v", err)
		return
	}
	c.send <- data
}

// SendConfirmation sends a confirmation message to the client
func (c *Client) SendConfirmation(action string, artifactID string, status string, message string) {
	data, err := json.Marshal(map[string]interface{}{
		"type":        "confirmation",
		"action":      action,
		"artifact_id": artifactID,
		"status":      status,
		"message":     message,
		"timestamp":   time.Now(),
	})
	if err != nil {
		log.Printf("Failed to marshal confirmation: %v", err)
		return
	}
	c.send <- data
}

// sendError sends an error message to the client
func (c *Client) sendError(errorType string, message string) {
	data, err := json.Marshal(map[string]interface{}{
		"type":      "error",
		"error":     errorType,
		"message":   message,
		"timestamp": time.Now(),
	})
	if err != nil {
		log.Printf("Failed to marshal error: %v", err)
		return
	}
	select {
	case c.send <- data:
	default:
	}
}
