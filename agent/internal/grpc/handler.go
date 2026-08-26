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
// It implements pb.HostAgentServiceServer and bridges gRPC requests to Docker Engine API calls.
type CommandHandler struct {
	dockerClient *docker.Client
	logger       logging.Logger
}

// Compile-time assertion that CommandHandler implements the server interface
var _ pb.HostAgentServiceServer = (*CommandHandler)(nil)

// NewCommandHandler creates a handler that executes container commands via Docker.
func NewCommandHandler(dockerClient *docker.Client, logger logging.Logger) *CommandHandler {
	return &CommandHandler{
		dockerClient: dockerClient,
		logger:       logger,
	}
}

// RegisterHost is a no-op on the agent side. The Control Plane implements this.
// The agent is a client of RegisterHost, not a server.
func (h *CommandHandler) RegisterHost(ctx context.Context, req *pb.RegisterHostRequest) (*pb.RegisterHostResponse, error) {
	return nil, fmt.Errorf("RegisterHost is not implemented on agent side")
}

// Heartbeat is a no-op on the agent side. The Control Plane implements this.
func (h *CommandHandler) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	return nil, fmt.Errorf("Heartbeat is not implemented on agent side")
}

// StartContainer processes a StartContainer command from the Control Plane.
func (h *CommandHandler) StartContainer(ctx context.Context, req *pb.StartContainerRequest) (*pb.ContainerActionResponse, error) {
	h.logger.Info("Received StartContainer command",
		"commandID", req.CommandID,
		"hostID", req.HostID,
		"containerID", req.ContainerID,
	)

	// Create a timeout context for Docker operations
	opCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	// Start the container via Docker Engine API
	err := h.dockerClient.StartContainer(opCtx, req.ContainerID)
	if err != nil {
		h.logger.Error("Failed to start container", err,
			"containerID", req.ContainerID,
		)
		return &pb.ContainerActionResponse{
			CommandID:   req.CommandID,
			ContainerID: req.ContainerID,
			Success:     false,
			Message:     fmt.Sprintf("Failed to start container: %v", err),
		}, nil
	}

	h.logger.Info("Container started successfully",
		"commandID", req.CommandID,
		"containerID", req.ContainerID,
	)

	return &pb.ContainerActionResponse{
		CommandID:   req.CommandID,
		ContainerID: req.ContainerID,
		Success:     true,
		Message:     "Container started successfully",
	}, nil
}

// StopContainer processes a StopContainer command from the Control Plane.
// It attempts graceful shutdown with the specified timeout, falling back to kill.
func (h *CommandHandler) StopContainer(ctx context.Context, req *pb.StopContainerRequest) (*pb.ContainerActionResponse, error) {
	h.logger.Info("Received StopContainer command",
		"commandID", req.CommandID,
		"hostID", req.HostID,
		"containerID", req.ContainerID,
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
	err := h.dockerClient.StopContainer(opCtx, req.ContainerID, timeout)
	if err != nil {
		h.logger.Warn("Graceful stop failed, attempting force kill",
			"containerID", req.ContainerID,
			"error", err,
		)

		// Force kill as last resort
		killErr := h.dockerClient.KillContainer(opCtx, req.ContainerID)
		if killErr != nil {
			h.logger.Error("Force kill also failed", killErr,
				"containerID", req.ContainerID,
			)
			return &pb.ContainerActionResponse{
				CommandID:   req.CommandID,
				ContainerID: req.ContainerID,
				Success:     false,
				Message:     fmt.Sprintf("Failed to stop container (graceful: %v, force: %v)", err, killErr),
			}, nil
		}
	}

	h.logger.Info("Container stopped successfully",
		"commandID", req.CommandID,
		"containerID", req.ContainerID,
	)

	return &pb.ContainerActionResponse{
		CommandID:   req.CommandID,
		ContainerID: req.ContainerID,
		Success:     true,
		Message:     "Container stopped successfully",
	}, nil
}

// GetContainerLogs streams container logs back to the Control Plane.
func (h *CommandHandler) GetContainerLogs(req *pb.GetContainerLogsRequest, stream pb.HostAgentService_GetContainerLogsServer) error {
	h.logger.Info("Received GetContainerLogs request",
		"hostID", req.HostID,
		"containerID", req.ContainerID,
		"follow", req.Follow,
		"tail", req.Tail,
	)

	tail := "100"
	if req.Tail > 0 {
		tail = fmt.Sprintf("%d", req.Tail)
	}

	ctx := stream.Context()
	reader, err := h.dockerClient.GetContainerLogs(ctx, req.ContainerID, &docker.LogsOptions{
		Follow: req.Follow,
		Tail:   tail,
		Stdout: true,
		Stderr: true,
	})
	if err != nil {
		return fmt.Errorf("failed to get container logs: %w", err)
	}
	defer reader.Close()

	buf := make([]byte, 32*1024) // 32KB buffer
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
			n, readErr := reader.Read(buf)
			if n > 0 {
				entry := &pb.ContainerLogEntry{
					ContainerID: req.ContainerID,
					Data:        make([]byte, n),
					Stream:      "stdout",
				}
				copy(entry.Data, buf[:n])
				if sendErr := stream.Send(entry); sendErr != nil {
					return fmt.Errorf("failed to send log entry: %w", sendErr)
				}
			}
			if readErr != nil {
				return nil // EOF or other read completion
			}
		}
	}
}
