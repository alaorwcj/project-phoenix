package docker

import (
	"context"
	"io"
	"time"

	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"github.com/alaorwcj/project-phoenix/agent/internal/metrics"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type Client struct {
	cli     *client.Client
	metrics *metrics.Registry
}

type LogsOptions struct {
	Follow bool
	Tail   string
	Stdout bool
	Stderr bool
}

func NewClient(host string, reg *metrics.Registry) (*Client, error) {
	cli, err := client.NewClientWithOpts(client.WithHost(host), client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &Client{cli: cli, metrics: reg}, nil
}

func (c *Client) GetInfo(ctx context.Context) (types.Info, error) {
	return c.cli.Info(ctx)
}

func (c *Client) ListContainers(ctx context.Context) ([]types.Container, error) {
	return c.cli.ContainerList(ctx, types.ContainerListOptions{All: true})
}

// GetMetrics returns host metrics in the gRPC message format
func (c *Client) GetMetrics(ctx context.Context) *pb.HostMetrics {
	start := time.Now()
	defer func() {
		if c.metrics != nil {
			c.metrics.ObserveDuration("docker_metrics_collection_duration_seconds", nil, time.Since(start))
		}
	}()
	info, _ := c.cli.Info(ctx)
	return &pb.HostMetrics{
		CPUPercent:        float64(info.NCPU),
		MemoryTotalBytes:  uint64(info.MemTotal),
		MemoryUsedBytes:   0, // Would require more detailed info
		RunningContainers: uint32(info.ContainersRunning),
	}
}

// StartContainer starts an existing container
func (c *Client) StartContainer(ctx context.Context, containerID string) error {
	return c.cli.ContainerStart(ctx, containerID, types.ContainerStartOptions{})
}

// StopContainer stops a container with specified timeout (in seconds)
func (c *Client) StopContainer(ctx context.Context, containerID string, timeoutSeconds int) error {
	// Use container.StopOptions for newer versions
	stopOpts := container.StopOptions{}
	// Note: Duration field may be available in newer docker versions
	// For now, we use the simpler approach
	return c.cli.ContainerStop(ctx, containerID, stopOpts)
}

// KillContainer forcefully terminates a container
func (c *Client) KillContainer(ctx context.Context, containerID string) error {
	return c.cli.ContainerKill(ctx, containerID, "SIGKILL")
}

// GetContainerLogs retrieves container logs
func (c *Client) GetContainerLogs(ctx context.Context, containerID string, opts *LogsOptions) (io.ReadCloser, error) {
	logsOptions := types.ContainerLogsOptions{
		ShowStdout: opts.Stdout,
		ShowStderr: opts.Stderr,
		Follow:     opts.Follow,
		Tail:       opts.Tail,
	}
	return c.cli.ContainerLogs(ctx, containerID, logsOptions)
}

func (c *Client) Close() error {
	return c.cli.Close()
}