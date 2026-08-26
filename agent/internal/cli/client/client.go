package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/alaorwcj/project-phoenix/agent/internal/cli/config"
)

// Client is a thin authenticated HTTP client for the Control Plane API.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// New builds a client from persisted config. Returns an error if unauthenticated.
func New() (*Client, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	if cfg.ServerURL == "" {
		return nil, fmt.Errorf("server_url not configured — run: docker-platform config set server_url <url>")
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("not authenticated — run: docker-platform login")
	}
	return &Client{
		baseURL: cfg.ServerURL,
		token:   cfg.Token,
		http:    &http.Client{},
	}, nil
}

// Do issues an authenticated request and decodes the JSON response into out.
func (c *Client) Do(method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, string(data))
	}

	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return fmt.Errorf("invalid response: %w", err)
		}
	}
	return nil
}
