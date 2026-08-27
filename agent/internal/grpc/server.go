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

	// Register the command handler as the HostAgentService implementation
	pb.RegisterHostAgentServiceServer(grpcServer, handler)

	log.Info("gRPC command server initialized", "port", port)

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
