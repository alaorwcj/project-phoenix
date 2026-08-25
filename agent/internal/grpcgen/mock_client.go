// Code generated from proto/docker_platform.proto - DO NOT EDIT

package grpcgen

import (
	"context"
	"fmt"
)

// MockHostAgentServiceClient is a mock implementation for testing
type MockHostAgentServiceClient struct {
	TenantID string
}

// NewMockHostAgentServiceClient creates a new mock client
func NewMockHostAgentServiceClient(tenantID string) HostAgentServiceClient {
	return &MockHostAgentServiceClient{TenantID: tenantID}
}

func (m *MockHostAgentServiceClient) RegisterHost(ctx context.Context, req *RegisterHostRequest) (*RegisterHostResponse, error) {
	if req == nil || req.AgentID == "" {
		return nil, fmt.Errorf("invalid register request")
	}
	return &RegisterHostResponse{
		HostID:   fmt.Sprintf("host-%s", req.AgentID),
		TenantID: m.TenantID,
		Accepted: true,
		Message:  "Mock: Host registered successfully",
	}, nil
}

func (m *MockHostAgentServiceClient) Heartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, error) {
	if req == nil || req.HostID == "" {
		return nil, fmt.Errorf("invalid heartbeat request")
	}
	return &HeartbeatResponse{
		Acknowledged: true,
		ServerTime:   req.ObservedAt,
	}, nil
}

func (m *MockHostAgentServiceClient) StartContainer(ctx context.Context, req *StartContainerRequest) (*ContainerActionResponse, error) {
	if req == nil || req.ContainerID == "" {
		return nil, fmt.Errorf("invalid start container request")
	}
	return &ContainerActionResponse{
		CommandID:   req.CommandID,
		ContainerID: req.ContainerID,
		Success:     true,
		Message:     "Mock: Container start queued",
	}, nil
}

func (m *MockHostAgentServiceClient) StopContainer(ctx context.Context, req *StopContainerRequest) (*ContainerActionResponse, error) {
	if req == nil || req.ContainerID == "" {
		return nil, fmt.Errorf("invalid stop container request")
	}
	return &ContainerActionResponse{
		CommandID:   req.CommandID,
		ContainerID: req.ContainerID,
		Success:     true,
		Message:     "Mock: Container stop queued",
	}, nil
}

func (m *MockHostAgentServiceClient) GetContainerLogs(ctx context.Context, req *GetContainerLogsRequest) (HostAgentService_GetContainerLogsClient, error) {
	if req == nil || req.ContainerID == "" {
		return nil, fmt.Errorf("invalid get logs request")
	}
	return &MockLogsStream{}, nil
}

// MockLogsStream is a mock log stream
type MockLogsStream struct {
	finished bool
}

func (m *MockLogsStream) Recv() (*ContainerLogEntry, error) {
	if m.finished {
		return nil, fmt.Errorf("EOF")
	}
	m.finished = true
	return &ContainerLogEntry{
		ContainerID: "mock-container",
		Data:        []byte("Mock: No logs available"),
		Stream:      "stdout",
	}, nil
}
