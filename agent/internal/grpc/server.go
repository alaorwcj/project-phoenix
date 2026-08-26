package grpc

import (
	"fmt"
	"net"

	pb "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"
	"github.com/alaorwcj/project-phoenix/agent/internal/docker"
	"github.com/alaorwcj/project-phoenix/agent/internal/logging"
	"google.golang.org/grpc"
)

// Server wraps a gRPC server listening for commands from Control Plane
type Server struct {
	grpcServer     *grpc.Server
	listener       net.Listener
	commandHandler *CommandHandler
	log            logging.Logger
	port           string
}

// NewServer creates a gRPC server that receives commands from the Control Plane
func NewServer(port string, dockerClient *docker.Client, tlsConfig *TLSConfig, log logging.Logger) (*Server, error) {
	listener, err := net.Listen("tcp", net.JoinHostPort("0.0.0.0", port))
	if err != nil {
		return nil, fmt.Errorf("failed to listen on port %s: %w", port, err)
	}

	var grpcServer *grpc.Server
	if tlsConfig != nil && tlsConfig.Enabled {
		creds, err := LoadServerCredentials(tlsConfig, log)
		if err != nil {
			listener.Close()
			return nil, fmt.Errorf("failed to load server credentials: %w", err)
		}
		grpcServer = grpc.NewServer(grpc.Creds(creds))
	} else {
		grpcServer = grpc.NewServer()
	}

	// Create command handler
	handler := NewCommandHandler(dockerClient, log)

	// NOTE: RegisterHostAgentServiceServer does not exist in manually-generated grpcgen types.
	// This is a limitation of the manual proto generation workaround for Windows protoc crash.
	// In production, use real protoc-generated code from google.golang.org/grpc/cmd/protoc-gen-go-grpc
	//
	// For now, the server is created but NOT registered with a service descriptor.
	// This means incoming gRPC calls will not be routed to the handler.
	// TODO: Fix once protoc is working on Windows (upgrade to v37+) or use WSL2.
	_ = handler
	_ = pb.HostAgentServiceServer(nil)

	log.Info("gRPC command server initialized (handlers not registered - protoc limitation)", "port", port)

	return &Server{
		grpcServer:     grpcServer,
		listener:       listener,
		commandHandler: handler,
		log:            log,
		port:           port,
	}, nil
}

// Start begins serving gRPC requests
func (s *Server) Start() error {
	s.log.Info("gRPC command server starting", "addr", s.listener.Addr().String())
	return s.grpcServer.Serve(s.listener)
}

// Stop gracefully shuts down the server
func (s *Server) Stop() error {
	s.log.Info("gRPC command server shutting down")
	s.grpcServer.GracefulStop()
	return nil
}

// GetPort returns the port the server is listening on
func (s *Server) GetPort() string {
	return s.port
}
