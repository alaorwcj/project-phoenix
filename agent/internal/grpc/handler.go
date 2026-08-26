package grpc

import (
	"context"
	"fmt"
	"time"

	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"github.com/alaorwcj/project-phoenix/agent/internal/docker"
	"github.com/alaorwcj/project-phoenix/agent/internal/logging"
)

// CommandHandler processes container operations received from the Control Plane.
// It bridges gRPC requests to Docker Engine API calls.
type CommandHandler struct {
	dockerClient *docker.Client
	logger       *logging.Logger
}

// NewCommandHandler creates a handler that executes container commands via Docker.
func NewCommandHandler(dockerClient *docker.Client, logger *logging.Logger) *CommandHandler {
	return &CommandHandler{
		dockerClient: dockerClient,
		logger:       logger,
	}
}

// HandleStartContainer processes a StartContainer command from the Control Plane.
// It looks up the container by ID, pulls the image if needed, creates the container,
// and starts it.
func (h *CommandHandler) HandleStartContainer(ctx context.Context, req *pb.StartContainerRequest) (*pb.ContainerActionResponse, error) {
	h.logger.Info("Received StartContainer command",
		"commandId", req.CommandId,
		"hostId", req.HostId,
		"containerId", req.ContainerId,
	)

	// Create a timeout context for Docker operations
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	// Start the container via Docker Engine API
	err := h.dockerClient.StartContainer(opCtx, req.ContainerId)
	if err != nil {
		h.logger.Error("Failed to start container",
			"containerId", req.ContainerId,
			"error", err,
		)
		return &pb.ContainerActionResponse{
			CommandId:   req.CommandId,
			ContainerId: req.ContainerId,
			Success:     false,
			Message:     fmt.Sprintf("Failed to start container: %v", err),
		}, nil
	}

	h.logger.Info("Container started successfully",
		"commandId", req.CommandId,
		"containerId", req.ContainerId,
	)

	return &pb.ContainerActionResponse{
		CommandId:   req.CommandId,
		ContainerId: req.ContainerId,
		Success:     true,
		Message:     "Container started successfully",
	}, nil
}

// HandleStopContainer processes a StopContainer command from the Control Plane.
// It attempts graceful shutdown with the specified timeout, falling back to kill.
func (h *CommandHandler) HandleStopContainer(ctx context.Context, req *pb.StopContainerRequest) (*pb.ContainerActionResponse, error) {
	h.logger.Info("Received StopContainer command",
		"commandId", req.CommandId,
		"hostId", req.HostId,
		"containerId", req.ContainerId,
		"timeoutSeconds", req.TimeoutSeconds,
	)

	timeout := int(req.TimeoutSeconds)
	if timeout == 0 {
		timeout = 15 // Default graceful shutdown timeout
	}

	// Create a context slightly longer than the stop timeout
	opCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout+5)*time.Second)
	defer cancel()

	// Attempt graceful stop
	err := h.dockerClient.StopContainer(opCtx, req.ContainerId, timeout)
	if err != nil {
		h.logger.Warn("Graceful stop failed, attempting force kill",
			"containerId", req.ContainerId,
			"error", err,
		)

		// Force kill as last resort
		killErr := h.dockerClient.KillContainer(opCtx, req.ContainerId)
		if killErr != nil {
			h.logger.Error("Force kill also failed",
				"containerId", req.ContainerId,
				"error", killErr,
			)
			return &pb.ContainerActionResponse{
				CommandId:   req.CommandId,
				ContainerId: req.ContainerId,
				Success:     false,
				Message:     fmt.Sprintf("Failed to stop container (graceful: %v, force: %v)", err, killErr),
			}, nil
		}
	}

	h.logger.Info("Container stopped successfully",
		"commandId", req.CommandId,
		"containerId", req.ContainerId,
	)

	return &pb.ContainerActionResponse{
		CommandId:   req.CommandId,
		ContainerId: req.ContainerId,
		Success:     true,
		Message:     "Container stopped successfully",
	}, nil
}

// HandleGetContainerLogs streams container logs back to the Control Plane.
func (h *CommandHandler) HandleGetContainerLogs(ctx context.Context, req *pb.GetContainerLogsRequest) (<-chan *pb.ContainerLogEntry, error) {
	h.logger.Info("Received GetContainerLogs request",
		"hostId", req.HostId,
		"containerId", req.ContainerId,
		"follow", req.Follow,
		"tail", req.Tail,
	)

	tail := "100"
	if req.Tail > 0 {
		tail = fmt.Sprintf("%d", req.Tail)
	}

	reader, err := h.dockerClient.GetContainerLogs(ctx, req.ContainerId, &docker.LogsOptions{
		Follow: req.Follow,
		Tail:   tail,
		Stdout: true,
		Stderr: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get container logs: %w", err)
	}

	entries := make(chan *pb.ContainerLogEntry, 64)

	go func() {
		defer close(entries)
		defer reader.Close()

		buf := make([]byte, 32*1024) // 32KB buffer
		for {
			select {
			case <-ctx.Done():
				return
			default:
				n, err := reader.Read(buf)
				if n > 0 {
					entry := &pb.ContainerLogEntry{
						ContainerId: req.ContainerId,
						Data:        make([]byte, n),
						Stream:      "stdout",
					}
					copy(entry.Data, buf[:n])
					entries <- entry
				}
				if err != nil {
					return
				}
			}
		}
	}()

	return entries, nil
}
