// Code generated manually (workaround for Windows protoc crash)
// This file provides the gRPC server registration that protoc-gen-go-grpc would generate

package grpcgen

import (
	"context"

	"google.golang.org/grpc"
)

// Register HostAgentService on the provided grpc.Server.
// This enables the server to handle incoming HostAgentService RPC calls.
func RegisterHostAgentServiceServer(s *grpc.Server, srv HostAgentServiceServer) {
	s.RegisterService(&HostAgentService_ServiceDesc, srv)
}

// HostAgentService_ServiceDesc is the ServiceDesc for HostAgentService.
var HostAgentService_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "dockerplatform.v1.HostAgentService",
	HandlerType: (*HostAgentServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "RegisterHost",
			Handler:    _HostAgentService_RegisterHost_Handler,
		},
		{
			MethodName: "Heartbeat",
			Handler:    _HostAgentService_Heartbeat_Handler,
		},
		{
			MethodName: "StartContainer",
			Handler:    _HostAgentService_StartContainer_Handler,
		},
		{
			MethodName: "StopContainer",
			Handler:    _HostAgentService_StopContainer_Handler,
		},
	},
	Streams: []grpc.StreamDesc{
		{
			StreamName:    "GetContainerLogs",
			Handler:       _HostAgentService_GetContainerLogs_Handler,
			ServerStreams: true,
		},
	},
	Metadata: "docker_platform.proto",
}

// RPC handler for RegisterHost
func _HostAgentService_RegisterHost_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(RegisterHostRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(HostAgentServiceServer).RegisterHost(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/dockerplatform.v1.HostAgentService/RegisterHost",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(HostAgentServiceServer).RegisterHost(ctx, req.(*RegisterHostRequest))
	}
	return interceptor(ctx, in, info, handler)
}

// RPC handler for Heartbeat
func _HostAgentService_Heartbeat_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(HeartbeatRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(HostAgentServiceServer).Heartbeat(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/dockerplatform.v1.HostAgentService/Heartbeat",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(HostAgentServiceServer).Heartbeat(ctx, req.(*HeartbeatRequest))
	}
	return interceptor(ctx, in, info, handler)
}

// RPC handler for StartContainer
func _HostAgentService_StartContainer_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(StartContainerRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(HostAgentServiceServer).StartContainer(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/dockerplatform.v1.HostAgentService/StartContainer",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(HostAgentServiceServer).StartContainer(ctx, req.(*StartContainerRequest))
	}
	return interceptor(ctx, in, info, handler)
}

// RPC handler for StopContainer
func _HostAgentService_StopContainer_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(StopContainerRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(HostAgentServiceServer).StopContainer(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/dockerplatform.v1.HostAgentService/StopContainer",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(HostAgentServiceServer).StopContainer(ctx, req.(*StopContainerRequest))
	}
	return interceptor(ctx, in, info, handler)
}

// Stream handler for GetContainerLogs
func _HostAgentService_GetContainerLogs_Handler(srv interface{}, stream grpc.ServerStream) error {
	m := new(GetContainerLogsRequest)
	if err := stream.RecvMsg(m); err != nil {
		return err
	}
	return srv.(HostAgentServiceServer).GetContainerLogs(m, &getContainerLogsServer{stream})
}

type getContainerLogsServer struct {
	grpc.ServerStream
}

func (x *getContainerLogsServer) Send(m *ContainerLogEntry) error {
	return x.ServerStream.SendMsg(m)
}

// HostAgentService_GetContainerLogsServer is the server stream for GetContainerLogs
type HostAgentService_GetContainerLogsServer interface {
	Send(*ContainerLogEntry) error
	grpc.ServerStream
}
