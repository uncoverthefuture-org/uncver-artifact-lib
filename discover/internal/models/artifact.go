package models

import (
	"encoding/json"
	"time"
)

// Artifact represents a registered artifact's metadata
type Artifact struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	RepositoryURL  string    `json:"repository_url"`
	ContainerImage string    `json:"container_image"`
	Version        string    `json:"version"`
	Author         string    `json:"author"`
	Tags           []string  `json:"tags"`
	Downloads      int       `json:"downloads"`
	Rating         float64   `json:"rating"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TagsAsJSON converts tags slice to JSON string for database storage
func (a *Artifact) TagsAsJSON() string {
	if len(a.Tags) == 0 {
		return "[]"
	}
	data, _ := json.Marshal(a.Tags)
	return string(data)
}

// SetTagsFromJSON parses JSON string into tags slice
func (a *Artifact) SetTagsFromJSON(data string) error {
	return json.Unmarshal([]byte(data), &a.Tags)
}

// ArtifactRegistration represents a registration request
type ArtifactRegistration struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	RepositoryURL  string   `json:"repository_url"`
	ContainerImage string   `json:"container_image"`
	Version        string   `json:"version"`
	Author         string   `json:"author"`
	Tags           []string `json:"tags"`
}

// ArtifactUpdate represents an update request
type ArtifactUpdate struct {
	Version   string   `json:"version"`
	Tags      []string `json:"tags,omitempty"`
	Downloads int      `json:"downloads,omitempty"`
	Rating    float64  `json:"rating,omitempty"`
}

// Validate checks if the registration has required fields
func (r *ArtifactRegistration) Validate() error {
	if r.Name == "" {
		return &ValidationError{Field: "name", Message: "name is required"}
	}
	if r.Version == "" {
		return &ValidationError{Field: "version", Message: "version is required"}
	}
	return nil
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

// RegistrationMessage represents a message from Redis stream
type RegistrationMessage struct {
	Action    string               `json:"action"` // "register" or "update"
	Artifact  ArtifactRegistration `json:"artifact"`
	Timestamp time.Time            `json:"timestamp"`
}

// ConfirmationMessage represents a confirmation to send
type ConfirmationMessage struct {
	Action     string    `json:"action"`
	ArtifactID string    `json:"artifact_id"`
	Status     string    `json:"status"` // "success" or "error"
	Message    string    `json:"message,omitempty"`
	Timestamp  time.Time `json:"timestamp"`
}
