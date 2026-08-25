package docker

import (
	"context"
	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"github.com/docker/docker/client"
	"github.com/docker/docker/api/types"
)

type Client struct {
	cli *client.Client
}

func NewClient(host string) (*Client, error) {
	cli, err := client.NewClientWithOpts(client.WithHost(host), client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &Client{cli: cli}, nil
}

func (c *Client) GetInfo(ctx context.Context) (types.Info, error) {
	return c.cli.Info(ctx)
}

func (c *Client) ListContainers(ctx context.Context) ([]types.Container, error) {
	return c.cli.ContainerList(ctx, types.ContainerListOptions{All: true})
}

// GetMetrics returns host metrics in the gRPC message format
func (c *Client) GetMetrics(ctx context.Context) *pb.HostMetrics {
	info, _ := c.cli.Info(ctx)
	return &pb.HostMetrics{
		CPUPercent:        float64(info.NCPU),
		MemoryTotalBytes:  uint64(info.MemTotal),
		MemoryUsedBytes:   0, // Would require more detailed info
		RunningContainers: uint32(info.ContainersRunning),
	}
}

func (c *Client) StartContainer(ctx context.Context, containerID string) error {
	return c.cli.ContainerStart(ctx, containerID, types.ContainerStartOptions{})
}

func (c *Client) StopContainer(ctx context.Context, containerID string, timeout int) error {
	stopTimeout := int(timeout)
	return c.cli.ContainerStop(ctx, containerID, &stopTimeout)
}

func (c *Client) Close() error {
	return c.cli.Close()
}