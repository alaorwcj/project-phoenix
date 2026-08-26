// Code generated from proto/docker_platform.proto - DO NOT EDIT

package grpcgen

import "context"

// HostAgentServiceClient is the client to call the HostAgentService
type HostAgentServiceClient interface {
	RegisterHost(ctx context.Context, req *RegisterHostRequest) (*RegisterHostResponse, error)
	Heartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, error)
	StartContainer(ctx context.Context, req *StartContainerRequest) (*ContainerActionResponse, error)
	StopContainer(ctx context.Context, req *StopContainerRequest) (*ContainerActionResponse, error)
	GetContainerLogs(ctx context.Context, req *GetContainerLogsRequest) (HostAgentService_GetContainerLogsClient, error)
}

// HostAgentService_GetContainerLogsClient is the client stream for container logs
type HostAgentService_GetContainerLogsClient interface {
	Recv() (*ContainerLogEntry, error)
}

// HostAgentServiceServer is the server interface that must be implemented
type HostAgentServiceServer interface {
	RegisterHost(context.Context, *RegisterHostRequest) (*RegisterHostResponse, error)
	Heartbeat(context.Context, *HeartbeatRequest) (*HeartbeatResponse, error)
	StartContainer(context.Context, *StartContainerRequest) (*ContainerActionResponse, error)
	StopContainer(context.Context, *StopContainerRequest) (*ContainerActionResponse, error)
	GetContainerLogs(*GetContainerLogsRequest, HostAgentService_GetContainerLogsServer) error
}

// Note: HostAgentService_GetContainerLogsServer is defined in server_impl.go
// (it embeds grpc.ServerStream for the real gRPC server registration).
