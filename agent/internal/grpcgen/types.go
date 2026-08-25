// Code generated from proto/docker_platform.proto - DO NOT EDIT

package grpcgen

import (
	"time"
)

// RegisterHostRequest is the request for registering a new host
type RegisterHostRequest struct {
	AgentID        string
	Hostname       string
	DockerVersion  string
	OperatingSystem string
	Architecture   string
	Labels         map[string]string
}

// RegisterHostResponse is the response for host registration
type RegisterHostResponse struct {
	HostID   string
	TenantID string
	Accepted bool
	Message  string
}

// HostMetrics contains system metrics from a host
type HostMetrics struct {
	CPUPercent        float64
	MemoryUsedBytes   uint64
	MemoryTotalBytes  uint64
	DiskUsedBytes     uint64
	DiskTotalBytes    uint64
	RunningContainers uint32
}

// HeartbeatRequest is the periodic status update from an agent
type HeartbeatRequest struct {
	HostID     string
	AgentID    string
	Metrics    *HostMetrics
	ObservedAt time.Time
}

// HeartbeatResponse contains acknowledgment and pending commands
type HeartbeatResponse struct {
	Acknowledged    bool
	ServerTime      time.Time
	PendingCommands []*AgentCommand
}

// AgentCommand is a command to execute on the host
type AgentCommand struct {
	CommandID  string
	Type       string
	Parameters map[string]string
}

// StartContainerRequest requests container startup
type StartContainerRequest struct {
	CommandID   string
	HostID      string
	ContainerID string
}

// StopContainerRequest requests container shutdown
type StopContainerRequest struct {
	CommandID       string
	HostID          string
	ContainerID     string
	TimeoutSeconds  uint32
}

// ContainerActionResponse is the result of a container operation
type ContainerActionResponse struct {
	CommandID   string
	ContainerID string
	Success     bool
	Message     string
}

// GetContainerLogsRequest requests container logs
type GetContainerLogsRequest struct {
	HostID      string
	ContainerID string
	Follow      bool
	Timestamps  bool
	Tail        uint32
}

// ContainerLogEntry is a single log line from a container
type ContainerLogEntry struct {
	ContainerID string
	Data        []byte
	Timestamp   time.Time
	Stream      string
}
