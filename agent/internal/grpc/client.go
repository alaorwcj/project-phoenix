package grpc

import (
	"context"
	"fmt"
	"time"

	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"github.com/alaorwcj/project-phoenix/agent/internal/logging"
	"github.com/alaorwcj/project-phoenix/agent/internal/metrics"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc"
)

type Client struct {
	conn    *grpc.ClientConn
	client  pb.HostAgentServiceClient
	agentID string
	hostID  string
	traceID string
	log     logging.Logger
	metrics *metrics.Registry
}

// NewClient creates a new gRPC client for communication with Control Plane
// Supports both insecure (dev) and mTLS (prod) modes
func NewClient(addr, agentID string, tlsConfig *TLSConfig, reg *metrics.Registry, traceID string) (*Client, error) {
	log := logging.New("grpc-client", agentID).WithTraceID(traceID)
	var dialOpts []grpc.DialOption

	// Load TLS credentials if enabled
	if tlsConfig != nil && tlsConfig.Enabled {
		tlsDialOpt, err := LoadClientCredentials(tlsConfig, log)
		if err != nil {
			return nil, fmt.Errorf("failed to load TLS credentials: %w", err)
		}
		dialOpts = append(dialOpts, tlsDialOpt)
	} else {
		// Development: insecure connection
		dialOpts = append(dialOpts, grpc.WithInsecure())
		log.Warn("gRPC connection is insecure (no TLS)")
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
		traceID: traceID,
		log:     log,
		metrics: reg,
	}, nil
}

func (c *Client) RegisterHost(ctx context.Context, name, hostname, os, dockerVersion string) (string, error) {
	start := time.Now()
	defer func() {
		if c.metrics != nil {
			c.metrics.ObserveDuration("grpc_register_host_duration_seconds", nil, time.Since(start))
		}
	}()
	req := &pb.RegisterHostRequest{
		AgentID:         c.agentID,
		Hostname:        hostname,
		DockerVersion:   dockerVersion,
		OperatingSystem: os,
		Architecture:    "amd64",
		Labels:          map[string]string{"name": name},
	}

	ctx = metadata.AppendToOutgoingContext(ctx, "x-trace-id", c.traceID)
	resp, err := c.client.RegisterHost(ctx, req)
	if err != nil {
		if c.metrics != nil {
			c.metrics.IncCounter("grpc_register_host_total", metrics.Labels{"result": "failure"})
		}
		return "", fmt.Errorf("register failed: %v", err)
	}

	if !resp.Accepted {
		if c.metrics != nil {
			c.metrics.IncCounter("grpc_register_host_total", metrics.Labels{"result": "failure"})
		}
		return "", fmt.Errorf("host registration not accepted: %s", resp.Message)
	}

	if c.metrics != nil {
		c.metrics.IncCounter("grpc_register_host_total", metrics.Labels{"result": "success"})
	}
	c.hostID = resp.HostID
	c.log = c.log.WithHostID(resp.HostID)
	c.log.Info("Host registered", "tenantID", resp.TenantID)
	return resp.HostID, nil
}

func (c *Client) SendHeartbeat(ctx context.Context, hostMetrics *pb.HostMetrics) error {
	if c.hostID == "" {
		return fmt.Errorf("host not registered yet")
	}

	start := time.Now()
	defer func() {
		if c.metrics != nil {
			c.metrics.ObserveDuration("grpc_heartbeat_duration_seconds", nil, time.Since(start))
		}
	}()
	req := &pb.HeartbeatRequest{
		HostID:     c.hostID,
		AgentID:    c.agentID,
		Metrics:    hostMetrics,
		ObservedAt: time.Now(),
	}

	ctx = metadata.AppendToOutgoingContext(ctx, "x-trace-id", c.traceID)
	resp, err := c.client.Heartbeat(ctx, req)
	if err != nil {
		if c.metrics != nil {
			c.metrics.IncCounter("grpc_heartbeat_total", metrics.Labels{"result": "failure"})
		}
		return fmt.Errorf("heartbeat failed: %v", err)
	}

	if !resp.Acknowledged {
		if c.metrics != nil {
			c.metrics.IncCounter("grpc_heartbeat_total", metrics.Labels{"result": "failure"})
		}
		return fmt.Errorf("heartbeat not acknowledged")
	}

	if c.metrics != nil {
		c.metrics.IncCounter("grpc_heartbeat_total", metrics.Labels{"result": "success"})
	}
	c.log.WithHostID(c.hostID).Info("Heartbeat acknowledged", "serverTime", resp.ServerTime)
	return nil
}

func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}