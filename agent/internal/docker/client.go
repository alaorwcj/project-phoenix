package docker

import (
	"context"
	"io"
	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"github.com/alaorwcj/project-phoenix/agent/internal/metrics"
	"github.com/docker/docker/client"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"time"
)

type Client struct {
	cli     *client.Client
	metrics *metrics.Registry
}

type ContainerConfig struct {
	Name         string
	Image        string
	Cmd          []string
	Env          []string
	ExposedPorts map[string]struct{}
	HostConfig   *container.HostConfig
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

// CreateContainer creates a new container with specified configuration
func (c *Client) CreateContainer(ctx context.Context, config *ContainerConfig) (string, error) {
	containerConfig := &container.Config{
		Image:        config.Image,
		Cmd:          config.Cmd,
		Env:          config.Env,
		ExposedPorts: config.ExposedPorts,
	}

	resp, err := c.cli.ContainerCreate(ctx, containerConfig, config.HostConfig, nil, nil, config.Name)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// StartContainer starts an existing container
func (c *Client) StartContainer(ctx context.Context, containerID string) error {
	return c.cli.ContainerStart(ctx, containerID, types.ContainerStartOptions{})
}

// StopContainer stops a container with specified timeout
func (c *Client) StopContainer(ctx context.Context, containerID string, timeout int) error {
	stopTimeout := int(timeout)
	return c.cli.ContainerStop(ctx, containerID, &stopTimeout)
}

// KillContainer forcefully terminates a container
func (c *Client) KillContainer(ctx context.Context, containerID string) error {
	return c.cli.ContainerKill(ctx, containerID, "SIGKILL")
}

// RemoveContainer removes a container
func (c *Client) RemoveContainer(ctx context.Context, containerID string, force bool) error {
	return c.cli.ContainerRemove(ctx, containerID, types.ContainerRemoveOptions{Force: force})
}

// GetContainerStats returns container resource usage
func (c *Client) GetContainerStats(ctx context.Context, containerID string) (*types.StatsResponse, error) {
	return c.cli.ContainerStats(ctx, containerID, false)
}

// GetContainerLogs retrieves container logs
func (c *Client) GetContainerLogs(ctx context.Context, containerID string, opts *LogsOptions) (io.ReadCloser, error) {
	logsOptions := types.ContainerLogsOptions{
		ShowStdout: opts.Stdout,
		ShowStderr: opts.Stderr,
		Follow:     opts.Follow,
		Tail:       opts.Tail,
		Timestamps: false,
	}
	return c.cli.ContainerLogs(ctx, containerID, logsOptions)
}

// GetContainer retrieves container information
func (c *Client) GetContainer(ctx context.Context, containerID string) (types.ContainerJSON, error) {
	return c.cli.ContainerInspect(ctx, containerID)
}

func (c *Client) Close() error {
	return c.cli.Close()
}