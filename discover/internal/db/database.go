package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"uncver-discover-artifact/internal/models"

	_ "github.com/mattn/go-sqlite3"
)

// Database handles SQLite operations for artifact metadata
type Database struct {
	db *sql.DB
}

// NewDatabase creates a new database instance
func NewDatabase(dbPath string) (*Database, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_journal=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	database := &Database{db: db}
	if err := database.Init(); err != nil {
		db.Close()
		return nil, err
	}

	return database, nil
}

// Init creates tables and indexes
func (d *Database) Init() error {
	// Main artifacts table
	query := `
	CREATE TABLE IF NOT EXISTS artifacts (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT,
		repository_url TEXT,
		container_image TEXT,
		version TEXT NOT NULL,
		author TEXT,
		tags TEXT, -- JSON array
		downloads INTEGER DEFAULT 0,
		rating REAL DEFAULT 0.0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_artifacts_name ON artifacts(name);
	CREATE INDEX IF NOT EXISTS idx_artifacts_version ON artifacts(version);
	CREATE INDEX IF NOT EXISTS idx_artifacts_author ON artifacts(author);
	CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_artifacts_downloads ON artifacts(downloads DESC);
	CREATE INDEX IF NOT EXISTS idx_artifacts_rating ON artifacts(rating DESC);
	`

	if _, err := d.db.Exec(query); err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}

	// FTS5 virtual table for full-text search
	ftsQuery := `
	CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
		name,
		description,
		tags,
		content='artifacts',
		content_rowid='rowid'
	);

	-- Triggers to keep FTS index in sync
	CREATE TRIGGER IF NOT EXISTS artifacts_ai AFTER INSERT ON artifacts BEGIN
		INSERT INTO artifacts_fts(rowid, name, description, tags)
		VALUES (new.rowid, new.name, new.description, new.tags);
	END;

	CREATE TRIGGER IF NOT EXISTS artifacts_ad AFTER DELETE ON artifacts BEGIN
		INSERT INTO artifacts_fts(artifacts_fts, rowid, name, description, tags)
		VALUES ('delete', old.rowid, old.name, old.description, old.tags);
	END;

	CREATE TRIGGER IF NOT EXISTS artifacts_au AFTER UPDATE ON artifacts BEGIN
		INSERT INTO artifacts_fts(artifacts_fts, rowid, name, description, tags)
		VALUES ('delete', old.rowid, old.name, old.description, old.tags);
		INSERT INTO artifacts_fts(rowid, name, description, tags)
		VALUES (new.rowid, new.name, new.description, new.tags);
	END;
	`

	if _, err := d.db.Exec(ftsQuery); err != nil {
		return fmt.Errorf("failed to create FTS table: %w", err)
	}

	return nil
}

// Close closes the database connection
func (d *Database) Close() error {
	return d.db.Close()
}

// generateID creates a unique ID for an artifact
func generateID(name string) string {
	// Simple ID generation: lowercase name with underscores
	id := strings.ToLower(name)
	id = strings.ReplaceAll(id, " ", "_")
	id = strings.ReplaceAll(id, "/", "_")
	id = strings.ReplaceAll(id, ":", "_")
	id = fmt.Sprintf("%s_%d", id, time.Now().Unix())
	return id
}

// RegisterArtifact stores a new artifact in the database
func (d *Database) RegisterArtifact(reg *models.ArtifactRegistration) (*models.Artifact, error) {
	artifact := &models.Artifact{
		ID:             generateID(reg.Name),
		Name:           reg.Name,
		Description:    reg.Description,
		RepositoryURL:  reg.RepositoryURL,
		ContainerImage: reg.ContainerImage,
		Version:        reg.Version,
		Author:         reg.Author,
		Tags:           reg.Tags,
		Downloads:      0,
		Rating:         0.0,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	query := `
		INSERT INTO artifacts (id, name, description, repository_url, container_image, version, author, tags, downloads, rating, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := d.db.Exec(
		query,
		artifact.ID,
		artifact.Name,
		artifact.Description,
		artifact.RepositoryURL,
		artifact.ContainerImage,
		artifact.Version,
		artifact.Author,
		artifact.TagsAsJSON(),
		artifact.Downloads,
		artifact.Rating,
		artifact.CreatedAt,
		artifact.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to register artifact: %w", err)
	}

	return artifact, nil
}

// GetArtifact retrieves an artifact by ID
func (d *Database) GetArtifact(id string) (*models.Artifact, error) {
	query := `SELECT id, name, description, repository_url, container_image, version, author, tags, downloads, rating, created_at, updated_at FROM artifacts WHERE id = ?`

	row := d.db.QueryRow(query, id)

	artifact := &models.Artifact{}
	var tagsJSON string

	err := row.Scan(
		&artifact.ID,
		&artifact.Name,
		&artifact.Description,
		&artifact.RepositoryURL,
		&artifact.ContainerImage,
		&artifact.Version,
		&artifact.Author,
		&tagsJSON,
		&artifact.Downloads,
		&artifact.Rating,
		&artifact.CreatedAt,
		&artifact.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("artifact not found: %s", id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get artifact: %w", err)
	}

	artifact.SetTagsFromJSON(tagsJSON)
	return artifact, nil
}

// UpdateVersion updates an artifact's version
func (d *Database) UpdateVersion(id string, newVersion string) (*models.Artifact, error) {
	query := `UPDATE artifacts SET version = ?, updated_at = ? WHERE id = ?`

	result, err := d.db.Exec(query, newVersion, time.Now(), id)
	if err != nil {
		return nil, fmt.Errorf("failed to update version: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("artifact not found: %s", id)
	}

	return d.GetArtifact(id)
}

// UpdateArtifact updates artifact fields
func (d *Database) UpdateArtifact(id string, update *models.ArtifactUpdate) (*models.Artifact, error) {
	sets := []string{}
	args := []interface{}{}

	if update.Version != "" {
		sets = append(sets, "version = ?")
		args = append(args, update.Version)
	}
	if len(update.Tags) > 0 {
		sets = append(sets, "tags = ?")
		tagsJSON, _ := json.Marshal(update.Tags)
		args = append(args, string(tagsJSON))
	}
	if update.Downloads > 0 {
		sets = append(sets, "downloads = ?")
		args = append(args, update.Downloads)
	}
	if update.Rating > 0 {
		sets = append(sets, "rating = ?")
		args = append(args, update.Rating)
	}

	if len(sets) == 0 {
		return d.GetArtifact(id)
	}

	sets = append(sets, "updated_at = ?")
	args = append(args, time.Now())
	args = append(args, id)

	query := fmt.Sprintf("UPDATE artifacts SET %s WHERE id = ?", strings.Join(sets, ", "))

	result, err := d.db.Exec(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to update artifact: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("artifact not found: %s", id)
	}

	return d.GetArtifact(id)
}

// SearchArtifacts performs full-text search on artifacts
func (d *Database) SearchArtifacts(query string, limit int, offset int) ([]*models.Artifact, error) {
	if limit <= 0 {
		limit = 20
	}

	// Use FTS5 for full-text search
	ftsQuery := `
		SELECT a.id, a.name, a.description, a.repository_url, a.container_image, a.version, a.author, a.tags, a.downloads, a.rating, a.created_at, a.updated_at
		FROM artifacts_fts fts
		JOIN artifacts a ON a.rowid = fts.rowid
		WHERE artifacts_fts MATCH ?
		ORDER BY rank
		LIMIT ? OFFSET ?
	`

	rows, err := d.db.Query(ftsQuery, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to search artifacts: %w", err)
	}
	defer rows.Close()

	return d.scanArtifacts(rows)
}

// ListArtifacts lists all artifacts with pagination and optional sorting
func (d *Database) ListArtifacts(limit int, offset int, sortBy string) ([]*models.Artifact, error) {
	if limit <= 0 {
		limit = 20
	}

	orderBy := "created_at DESC"
	switch sortBy {
	case "name":
		orderBy = "name ASC"
	case "downloads":
		orderBy = "downloads DESC"
	case "rating":
		orderBy = "rating DESC"
	case "updated":
		orderBy = "updated_at DESC"
	}

	query := fmt.Sprintf(
		`SELECT id, name, description, repository_url, container_image, version, author, tags, downloads, rating, created_at, updated_at 
		FROM artifacts 
		ORDER BY %s 
		LIMIT ? OFFSET ?`,
		orderBy,
	)

	rows, err := d.db.Query(query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list artifacts: %w", err)
	}
	defer rows.Close()

	return d.scanArtifacts(rows)
}

// GetArtifactsByTag retrieves artifacts by tag
func (d *Database) GetArtifactsByTag(tag string, limit int, offset int) ([]*models.Artifact, error) {
	if limit <= 0 {
		limit = 20
	}

	query := `
		SELECT id, name, description, repository_url, container_image, version, author, tags, downloads, rating, created_at, updated_at
		FROM artifacts
		WHERE tags LIKE ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`

	rows, err := d.db.Query(query, fmt.Sprintf("%%%s%%", tag), limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get artifacts by tag: %w", err)
	}
	defer rows.Close()

	return d.scanArtifacts(rows)
}

// GetArtifactsByAuthor retrieves artifacts by author
func (d *Database) GetArtifactsByAuthor(author string, limit int, offset int) ([]*models.Artifact, error) {
	if limit <= 0 {
		limit = 20
	}

	query := `
		SELECT id, name, description, repository_url, container_image, version, author, tags, downloads, rating, created_at, updated_at
		FROM artifacts
		WHERE author = ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`

	rows, err := d.db.Query(query, author, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get artifacts by author: %w", err)
	}
	defer rows.Close()

	return d.scanArtifacts(rows)
}

// scanArtifacts scans rows into artifact structs
func (d *Database) scanArtifacts(rows *sql.Rows) ([]*models.Artifact, error) {
	var artifacts []*models.Artifact

	for rows.Next() {
		artifact := &models.Artifact{}
		var tagsJSON string

		err := rows.Scan(
			&artifact.ID,
			&artifact.Name,
			&artifact.Description,
			&artifact.RepositoryURL,
			&artifact.ContainerImage,
			&artifact.Version,
			&artifact.Author,
			&tagsJSON,
			&artifact.Downloads,
			&artifact.Rating,
			&artifact.CreatedAt,
			&artifact.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan artifact: %w", err)
		}

		artifact.SetTagsFromJSON(tagsJSON)
		artifacts = append(artifacts, artifact)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return artifacts, nil
}

// CountArtifacts returns the total count of artifacts
func (d *Database) CountArtifacts() (int, error) {
	var count int
	err := d.db.QueryRow("SELECT COUNT(*) FROM artifacts").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count artifacts: %w", err)
	}
	return count, nil
}
