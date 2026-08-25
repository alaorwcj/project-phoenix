package grpc

import (
	"context"
	"fmt"
	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"log"
	"time"
)

type Client struct {
	client  pb.HostAgentServiceClient
	agentID string
	hostID  string
}

// NewClient creates a new gRPC client for communication with Control Plane
// For development: uses HTTP client; for production: should use real gRPC
func NewClient(addr, agentID string) (*Client, error) {
	// Development: use HTTP client
	// TODO: Replace with real gRPC client once protoc generates code
	client := pb.NewHTTPHostAgentServiceClient(addr)

	return &Client{
		client:  client,
		agentID: agentID,
	}, nil
}

func (c *Client) RegisterHost(ctx context.Context, name, hostname, os, dockerVersion string) (string, error) {
	req := &pb.RegisterHostRequest{
		AgentID:        c.agentID,
		Hostname:       hostname,
		DockerVersion:  dockerVersion,
		OperatingSystem: os,
		Architecture:   "amd64",
		Labels:         map[string]string{"name": name},
	}

	resp, err := c.client.RegisterHost(ctx, req)
	if err != nil {
		return "", fmt.Errorf("register failed: %v", err)
	}

	if !resp.Accepted {
		return "", fmt.Errorf("host registration not accepted: %s", resp.Message)
	}

	c.hostID = resp.HostID
	log.Printf("Host registered: %s (tenant: %s)\n", resp.HostID, resp.TenantID)
	return resp.HostID, nil
}

func (c *Client) SendHeartbeat(ctx context.Context, metrics *pb.HostMetrics) error {
	if c.hostID == "" {
		return fmt.Errorf("host not registered yet")
	}

	req := &pb.HeartbeatRequest{
		HostID:     c.hostID,
		AgentID:    c.agentID,
		Metrics:    metrics,
		ObservedAt: time.Now(),
	}

	resp, err := c.client.Heartbeat(ctx, req)
	if err != nil {
		return fmt.Errorf("heartbeat failed: %v", err)
	}

	if !resp.Acknowledged {
		return fmt.Errorf("heartbeat not acknowledged")
	}

	log.Printf("Heartbeat acknowledged at %v\n", resp.ServerTime)
	return nil
}

func (c *Client) Close() error {
	return c.conn.Close()
}