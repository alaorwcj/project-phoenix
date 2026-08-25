package grpc

import (
	"context"
	"fmt"
	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"google.golang.org/grpc"
	"log"
	"time"
)

type Client struct {
	conn    *grpc.ClientConn
	client  pb.HostAgentServiceClient
	agentID string
	hostID  string
}

// NewClient creates a new gRPC client for communication with Control Plane
// Supports both insecure (dev) and mTLS (prod) modes
func NewClient(addr, agentID string, tlsConfig *TLSConfig) (*Client, error) {
	var dialOpts []grpc.DialOption

	// Load TLS credentials if enabled
	if tlsConfig != nil && tlsConfig.Enabled {
		tlsDialOpt, err := LoadClientCredentials(tlsConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to load TLS credentials: %w", err)
		}
		dialOpts = append(dialOpts, tlsDialOpt)
	} else {
		// Development: insecure connection
		dialOpts = append(dialOpts, grpc.WithInsecure())
		log.Println("Warning: gRPC connection is insecure (no TLS)")
	}

	// Add connection options
	dialOpts = append(dialOpts,
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(1024*1024*100)),
	)

	conn, err := grpc.Dial(addr, dialOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", addr, err)
	}

	// Create gRPC client stub
	grpcClient := pb.NewHostAgentServiceClient(conn)

	return &Client{
		conn:    conn,
		client:  grpcClient,
		agentID: agentID,
	}, nil
}

func (c *Client) RegisterHost(ctx context.Context, name, hostname, os, dockerVersion string) (string, error) {
	req := &pb.RegisterHostRequest{
		AgentID:         c.agentID,
		Hostname:        hostname,
		DockerVersion:   dockerVersion,
		OperatingSystem: os,
		Architecture:    "amd64",
		Labels:          map[string]string{"name": name},
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
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}