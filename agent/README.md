# Docker Platform - Host Agent

Lightweight Go agent that runs on Docker hosts, manages containers via the Docker Engine API, and communicates with the Control Plane via gRPC.

## Quick Start

### Requirements
- Go 1.21+
- Docker daemon running locally
- Control Plane accessible at `CONTROL_PLANE_ADDR`

### Build & Run

```bash
# Install dependencies
go mod download

# Run agent
go run cmd/agent/main.go

# Build binary
go build -o bin/agent cmd/agent/main.go

# Run binary
./bin/agent
```

### Configuration

Create `.env` file (or set environment variables):

```env
# Control Plane connection
CONTROL_PLANE_ADDR=localhost:50051

# Agent identification
AGENT_ID=agent-001

# Docker socket
DOCKER_HOST=unix:///var/run/docker.sock

# Heartbeat frequency
HEARTBEAT_INTERVAL=30s

# Optional local Prometheus endpoint
METRICS_PORT=9090
```

### Example: Development with HTTP Transport

```bash
# Start Control Plane (in another terminal)
cd ../control-plane
npm run dev

# Start agent (uses HTTP client for development)
go run cmd/agent/main.go

# Expected output:
# 🚀 Starting Docker Platform Host Agent
# 📋 Config loaded: agent-001
# 🐋 Connected to Docker Engine (docker-daemon-v24.0.7)
# 🔗 Registering with Control Plane...
# ✅ Host registered: host-id-12345
# 💓 Heartbeat loop started (30s interval)
```

## Architecture

### Components

| Component | Path | Purpose |
|-----------|------|---------|
| Main | `cmd/agent/main.go` | Entry point, initialization |
| Config | `internal/config/` | Environment variable loading |
| Docker Client | `internal/docker/` | Docker Engine API wrapper |
| gRPC Client | `internal/grpc/` | Control Plane communication |
| Proto Types | `internal/grpcgen/` | Message definitions & interfaces |

### Flows

#### Initialization
```
main.go
  → Load Config (env vars)
  → Connect Docker Client
  → Create gRPC Client (HTTP adapter in dev)
  → Register Host with Control Plane
  → Start Heartbeat Loop
```

#### Registration
```
Agent                              Control Plane
  │
  ├─ RegisterHostRequest ────────→ gRPC Handler
  │                                  ├─ Create Host record (status: ONLINE)
  │                                  └─ Return HostID
  ←──────────────── RegisterHostResponse
  │
  └─ Store HostID for heartbeats
```

#### Heartbeat
```
Every 30 seconds:

Agent                              Control Plane
  │
  ├─ Collect Metrics
  │  ├─ Docker Info (CPU, Memory, Disk)
  │  └─ Container Stats
  │
  ├─ HeartbeatRequest ───────────→ gRPC Handler
  │  (HostID, Metrics, Timestamp)   ├─ Update Host.lastHeartbeat
  │                                  ├─ Store metrics in metadata
  │                                  ├─ Mark status: ONLINE
  │                                  └─ Return OK
  ←────────────── HeartbeatResponse
```

## Proto Messages

### RegisterHostRequest
```protobuf
message RegisterHostRequest {
  string agent_id = 1;
  string hostname = 2;
  string docker_version = 3;
  map<string, string> metadata = 4;
}
```

### HeartbeatRequest
```protobuf
message HeartbeatRequest {
  string agent_id = 1;
  HostMetrics metrics = 2;
}

message HostMetrics {
  google.protobuf.Timestamp timestamp = 1;
  float cpu_usage = 2;
  int32 memory_usage = 3;
  int32 disk_usage = 4;
  int32 container_count = 5;
  repeated ContainerMetric container_data = 6;
}
```

## Development & Testing

### Run Tests

```bash
# Run all tests
go test ./...

# Run with verbose output
go test ./... -v

# Run specific package
go test ./internal/grpcgen -v

# Run specific test
go test ./internal/grpcgen -run TestMockHostAgentServiceClient_Heartbeat -v

# Run with coverage
go test ./... -cover

# Generate coverage report
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

### Mocking

For development without Docker:

```go
// Use mock gRPC client (no network calls)
import "github.com/alaorwcj/project-phoenix/agent/internal/grpcgen"

client := grpcgen.NewMockHostAgentServiceClient()

// Mock always returns success
response, err := client.RegisterHost(ctx, request)
// response.Status == "registered"
```

### HTTP Transport (Development)

In development, the agent uses HTTP+JSON instead of real gRPC:

```go
// Automatically selected when Control Plane is accessible via HTTP
client := grpcgen.NewHTTPHostAgentServiceClient("http://localhost:3000")

// Makes actual HTTP POST to /api/grpc/register-host
response, err := client.RegisterHost(ctx, request)
```

## Docker Integration

### Collecting Metrics

```go
// Get host info (CPU, Memory, Kernel)
info, err := dockerClient.GetInfo(ctx)

// List containers
containers, err := dockerClient.ListContainers(ctx)

// Get container stats (CPU %, Memory)
metrics, err := dockerClient.GetMetrics(ctx)
```

### Container Lifecycle (Stub for Next Phase)

```go
// Currently returns success stub
_, err := dockerClient.StartContainer(ctx, containerID)
_, err := dockerClient.StopContainer(ctx, containerID)
_, err := dockerClient.GetContainerLogs(ctx, containerID)
```

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTROL_PLANE_ADDR` | `localhost:50051` | Control Plane gRPC/HTTP endpoint |
| `AGENT_ID` | `agent-001` | Unique agent identifier |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker Engine socket/URL |
| `HEARTBEAT_INTERVAL` | `30s` | Time between heartbeats |
| `METRICS_PORT` | _disabled_ | Optional local Prometheus metrics endpoint |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

### Example Configurations

**Production (Linux)**
```env
CONTROL_PLANE_ADDR=control-plane.acme.local:50051
AGENT_ID=prod-docker-01
DOCKER_HOST=unix:///var/run/docker.sock
HEARTBEAT_INTERVAL=30s
```

**Development (macOS/Windows with Docker Desktop)**
```env
CONTROL_PLANE_ADDR=localhost:3000
AGENT_ID=dev-agent
DOCKER_HOST=unix:///var/run/docker.sock
HEARTBEAT_INTERVAL=5s
```

**Kubernetes Host**
```env
CONTROL_PLANE_ADDR=control-plane-service.default.svc.cluster.local:50051
AGENT_ID=$(hostname)
DOCKER_HOST=unix:///var/run/docker.sock
HEARTBEAT_INTERVAL=30s
```

## Troubleshooting

### Can't Connect to Docker Daemon

```bash
# Verify Docker is running
docker ps

# Check socket permissions
ls -la /var/run/docker.sock

# Test with docker CLI
docker info

# Agent with custom socket
DOCKER_HOST=unix:///var/lib/docker/docker.sock go run cmd/agent/main.go
```

### Can't Reach Control Plane

```bash
# Test HTTP connectivity
curl http://localhost:3000/health

# Test gRPC connectivity
grpcurl -plaintext localhost:50051 list

# Check firewall
netstat -tuln | grep 50051

# View agent logs
go run cmd/agent/main.go 2>&1 | grep error
```

### Heartbeat Failures

```bash
# Check agent logs
LOG_LEVEL=debug go run cmd/agent/main.go

# Verify Control Plane is accepting requests
curl -X POST http://localhost:3000/api/grpc/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"agentId": "test", "metrics": {}}'

# Check database connection
cd ../control-plane
npm run db:studio
```

### Port Conflicts

```bash
# Find process using port 50051
lsof -i :50051  # macOS/Linux
netstat -ano | findstr :50051  # Windows

# Kill process
kill -9 <PID>
```

## Build Targets

### Native Binary
```bash
go build -o bin/agent cmd/agent/main.go
```

### Cross-Compile for Linux (from macOS/Windows)
```bash
GOOS=linux GOARCH=amd64 go build -o bin/agent-linux cmd/agent/main.go
```

### Cross-Compile for ARM (Raspberry Pi)
```bash
GOOS=linux GOARCH=arm64 go build -o bin/agent-arm64 cmd/agent/main.go
```

### Docker Image
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download
RUN go build -o bin/agent cmd/agent/main.go

FROM alpine:latest
COPY --from=builder /app/bin/agent /agent
ENTRYPOINT ["/agent"]
```

## Next Steps

1. **Real gRPC Implementation**
   - Replace HTTP adapter with actual gRPC client
   - Add mTLS certificate validation
   - Implement bidirectional streaming (Control Plane can push commands)

2. **Container Management**
   - Implement `StartContainer` with resource limits
   - Implement `StopContainer` with graceful shutdown
   - Implement `GetLogs` with streaming

3. **Metrics Enhancement**
   - Add per-container CPU/memory tracking
   - Add network I/O metrics
   - Add disk I/O metrics
   - Implement time-series storage (InfluxDB)

4. **Observability**
   - Prometheus metrics export
   - Structured JSON logging
   - OpenTelemetry tracing

5. **Security**
   - JWT token-based authentication (not just agentId)
   - Rate limiting
   - Input validation

## File Structure

```
agent/
├── bin/
│   └── agent                          # Compiled binary
├── cmd/
│   └── agent/
│       └── main.go                    # Entry point
├── internal/
│   ├── config/
│   │   └── config.go                  # Env var loading
│   ├── docker/
│   │   └── client.go                  # Docker API wrapper
│   ├── grpc/
│   │   └── client.go                  # gRPC/HTTP client
│   └── grpcgen/
│       ├── types.go                   # Proto message types
│       ├── types_test.go               # Proto type tests
│       ├── service.go                 # Client/Server interfaces
│       ├── mock_client.go              # Mock for testing
│       └── http_client.go              # HTTP transport (dev)
├── .env.example                       # Configuration template
├── go.mod                             # Dependencies
├── go.sum                             # Dependency checksums
└── README.md                          # This file
```

## License

This is part of the Docker Platform multi-tenant architecture. See LICENSE at project root.

---

Questions? Check the root README.md or run `LOG_LEVEL=debug go run cmd/agent/main.go` for verbose output.
