package grpc

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"log"
)

type Client struct {
	conn   *grpc.ClientConn
	client pb.HostAgentServiceClient
	agentID string
	hostID string
}

func NewClient(addr, agentID string) (*Client, error) {
	conn, err := grpc.Dial(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("did not connect: %v", err)
	}

	return &Client{
		conn:    conn,
		client:  pb.NewHostAgentServiceClient(conn),
		agentID: agentID,
	}, nil
}

func (c *Client) RegisterHost(ctx context.Context, name, hostname, os, dockerVersion string) (string, error) {
	resp, err := c.client.RegisterHost(ctx, &pb.RegisterHostRequest{
		AgentId:        c.agentID,
		Hostname:       hostname,
		DockerVersion:  dockerVersion,
		OperatingSystem: os,
		Labels:         map[string]string{"name": name},
	})
	if err != nil {
		return "", fmt.Errorf("register failed: %v", err)
	}

	c.hostID = resp.HostId
	log.Printf("Host registered: %s (tenant: %s)", resp.HostId, resp.TenantId)
	return resp.HostId, nil
}

func (c *Client) SendHeartbeat(ctx context.Context, metrics map[string]interface{}) error {
	if c.hostID == "" {
		return fmt.Errorf("host not registered yet")
	}

	resp, err := c.client.Heartbeat(ctx, &pb.HeartbeatRequest{
		HostId:  c.hostID,
		AgentId: c.agentID,
	})
	if err != nil {
		return fmt.Errorf("heartbeat failed: %v", err)
	}

	if !resp.Acknowledged {
		return fmt.Errorf("heartbeat not acknowledged")
	}

	return nil
}

func (c *Client) Close() error {
	return c.conn.Close()
}