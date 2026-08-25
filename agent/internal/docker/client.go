package docker

import (
	"context"
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

func (c *Client) GetMetrics(ctx context.Context) map[string]interface{} {
	info, _ := c.cli.Info(ctx)
	return map[string]interface{}{
		"cpu_count":       info.NCPU,
		"memory_total":    info.MemTotal,
		"containers":      info.Containers,
		"running":         info.ContainersRunning,
		"paused":          info.ContainersPaused,
		"stopped":         info.ContainersStopped,
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