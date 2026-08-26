package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/alaorwcj/project-phoenix/agent/internal/config"
	"github.com/alaorwcj/project-phoenix/agent/internal/docker"
	"github.com/alaorwcj/project-phoenix/agent/internal/grpc"
	"github.com/alaorwcj/project-phoenix/agent/internal/logging"
	"github.com/alaorwcj/project-phoenix/agent/internal/metrics"
	agenttrace "github.com/alaorwcj/project-phoenix/agent/internal/trace"
)

func main() {
	cfg := config.Load()
	traceID := agenttrace.ResolveTraceID(cfg.TraceID)
	log := logging.New("agent", cfg.AgentID).WithTraceID(traceID)
	reg := metrics.New()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if cfg.AgentID == "" {
		reg.IncCounter("agent_startup_total", metrics.Labels{"state": "failed"})
		log.Error("agent configuration invalid", nil, "field", "AGENT_ID")
		os.Exit(1)
	}

	log.Info("Starting Docker Platform Agent")
	reg.IncCounter("agent_startup_total", metrics.Labels{"state": "starting"})

	if cfg.MetricsPort != "" {
		startMetricsServer(ctx, cfg.MetricsPort, reg, log)
	}

	dockerClient, err := docker.NewClient(cfg.DockerHost, reg)
	if err != nil {
		reg.IncCounter("agent_startup_total", metrics.Labels{"state": "failed"})
		log.Error("Failed to connect to Docker", err)
		os.Exit(1)
	}
	defer dockerClient.Close()

	// Prepare TLS config for gRPC client and server
	tlsConfig := &grpc.TLSConfig{
		Enabled:  cfg.TLSEnabled,
		CertPath: cfg.TLSCertPath,
		KeyPath:  cfg.TLSKeyPath,
		CAPath:   cfg.TLSCAPath,
	}

	// Start gRPC server to receive commands from Control Plane
	grpcServer, err := grpc.NewServer(cfg.Port, dockerClient, tlsConfig, log)
	if err != nil {
		reg.IncCounter("agent_startup_total", metrics.Labels{"state": "failed"})
		log.Error("Failed to create gRPC server", err)
		os.Exit(1)
	}

	// Run server in background
	go func() {
		log.Info("gRPC command server listening on", "port", cfg.Port)
		if err := grpcServer.Start(); err != nil {
			log.Error("gRPC server error", err)
		}
	}()

	// Create gRPC client to connect to Control Plane
	grpcClient, err := grpc.NewClient(cfg.ControlPlaneAddr, cfg.AgentID, tlsConfig, reg, traceID)
	if err != nil {
		reg.IncCounter("agent_startup_total", metrics.Labels{"state": "failed"})
		log.Error("Failed to connect to Control Plane", err)
		os.Exit(1)
	}
	defer grpcClient.Close()

	hostname := cfg.Hostname
	osInfo := "linux"

	hostID, err := grpcClient.RegisterHost(ctx, "docker-host", hostname, osInfo, "latest")
	if err != nil {
		reg.IncCounter("agent_startup_total", metrics.Labels{"state": "failed"})
		log.Error("Failed to register host", err)
		os.Exit(1)
	}

	reg.IncCounter("agent_startup_total", metrics.Labels{"state": "ready"})
	log.WithHostID(hostID).Info("Host registered")

	go heartbeatLoop(ctx, grpcClient, dockerClient, reg, log.WithHostID(hostID), cfg.HeartbeatInterval)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Info("Shutting down agent")
	grpcServer.Stop()
	cancel()
}

func heartbeatLoop(ctx context.Context, grpcClient *grpc.Client, dockerClient *docker.Client, reg *metrics.Registry, log logging.Logger, interval int) {
	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			start := time.Now()
			reg.IncCounter("agent_heartbeat_total", nil)
			hostMetrics := dockerClient.GetMetrics(ctx)
			if err := grpcClient.SendHeartbeat(ctx, hostMetrics); err != nil {
				log.Error("Heartbeat failed", err)
			}
			reg.ObserveDuration("agent_heartbeat_duration_seconds", nil, time.Since(start))
		}
	}
}

func startMetricsServer(ctx context.Context, port string, reg *metrics.Registry, log logging.Logger) {
	addr := net.JoinHostPort("127.0.0.1", port)
	server := &http.Server{
		Addr:    addr,
		Handler: reg.Handler(),
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	go func() {
		log.Info("Metrics endpoint enabled", "addr", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("Metrics server failed", err, "addr", addr)
		}
	}()
}