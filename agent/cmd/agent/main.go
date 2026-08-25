package main

import (
	"context"
	"github.com/alaorwcj/project-phoenix/agent/internal/config"
	"github.com/alaorwcj/project-phoenix/agent/internal/docker"
	"github.com/alaorwcj/project-phoenix/agent/internal/grpc"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg := config.Load()

	if cfg.AgentID == "" {
		log.Fatal("AGENT_ID not set")
	}

	log.Printf("Starting Docker Platform Agent (ID: %s)", cfg.AgentID)

	dockerClient, err := docker.NewClient(cfg.DockerHost)
	if err != nil {
		log.Fatalf("Failed to connect to Docker: %v", err)
	}
	defer dockerClient.Close()

	// Prepare TLS config for gRPC client
	tlsConfig := &grpc.TLSConfig{
		Enabled:  cfg.TLSEnabled,
		CertPath: cfg.TLSCertPath,
		KeyPath:  cfg.TLSKeyPath,
		CAPath:   cfg.TLSCAPath,
	}

	grpcClient, err := grpc.NewClient(cfg.ControlPlaneAddr, cfg.AgentID, tlsConfig)
	if err != nil {
		log.Fatalf("Failed to connect to Control Plane: %v", err)
	}
	defer grpcClient.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hostname, _ := os.Hostname()
	osInfo := "linux"

	hostID, err := grpcClient.RegisterHost(ctx, "docker-host", hostname, osInfo, "latest")
	if err != nil {
		log.Fatalf("Failed to register host: %v", err)
	}

	log.Printf("Host registered with ID: %s", hostID)

	go heartbeatLoop(ctx, grpcClient, dockerClient, cfg.HeartbeatInterval)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down agent...")
	cancel()
}

func heartbeatLoop(ctx context.Context, grpcClient *grpc.Client, dockerClient *docker.Client, interval int) {
	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			metrics := dockerClient.GetMetrics(ctx)
			if err := grpcClient.SendHeartbeat(ctx, metrics); err != nil {
				log.Printf("Heartbeat failed: %v", err)
			} else {
				log.Printf("Heartbeat sent successfully")
			}
		}
	}
}