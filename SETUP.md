# Docker Platform - Complete Setup Guide

Comprehensive guide for the **Project Phoenix** multi-tenant Docker management platform (Phases 1-12).

## What You're Getting

- **Control Plane**: Node.js/TypeScript REST API + gRPC server (Fastify + Prisma + PostgreSQL)
- **Host Agent**: Go-based daemon on Docker hosts (Docker Engine API + gRPC client)
- **Production Infrastructure**: Docker images, Helm charts, monitoring (Prometheus/Grafana), backups
- **Complete Platform**: 12 phases including security, observability, resource management, and deployment

**Status**: All phases complete and merged to `main`. Ready for local testing or Kubernetes deployment.

## Prerequisites

- **Node.js** 18+ (Control Plane)
- **Docker & Docker Compose** (local dev stack, PostgreSQL, Redis)
- **Go** 1.21+ (optional; Agent binary provided in Docker image)
- **kubectl** (optional; for Helm deployment)

## Quick Start

### 1. Start Full Stack

```bash
docker-compose up -d
docker-compose ps                          # Verify all services running
```

### 2. Verify

```bash
curl http://localhost:3000/api/status      # Health check
open http://localhost:3000/docs            # Swagger UI
curl http://localhost:3000/metrics         # Prometheus metrics
```

### 3. Authenticate

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.local","password":"admin123456"}' | jq -r '.token')
```

### 4. Explore

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/hosts
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/containers
```

## Docker Compose Services

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | PostgreSQL 16 database |
| `redis` | 6379 | Job queue (Bull) |
| `control-plane` | 3000/50051/9090 | HTTP / gRPC / metrics |
| `agent` | — | Docker host agent |

```bash
docker-compose logs -f control-plane      # Follow logs
docker-compose down                       # Stop all
docker-compose down -v                    # Stop + remove data
```

## Development Mode

```bash
docker-compose up -d postgres redis       # Just infrastructure
cd control-plane && npm install && npx prisma generate && npx prisma migrate dev
npm run db:seed && npm run dev            # Seed + start
```

## Test Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@acme.local | admin123456 | ADMIN |
| operator@acme.local | operator123456 | OPERATOR |
| viewer@acme.local | viewer123456 | VIEWER |

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/status` | Detailed status |
| GET | `/docs` | Swagger UI |
| GET | `/metrics` | Prometheus metrics |

### Authenticated

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/containers` | VIEWER | List (paginated) |
| POST | `/api/containers` | OPERATOR | Start container |
| POST | `/api/containers/:id/stop` | OPERATOR | Stop container |
| GET | `/api/containers/:id/logs` | VIEWER | Stream logs |
| GET | `/api/hosts` | VIEWER | List (paginated) |
| POST | `/api/hosts/health/sweep` | ADMIN | Trigger health check |
| GET | `/api/hosts/:id/failover-plan` | ADMIN | Failover analysis |
| GET | `/api/hosts/:id/migration-targets` | ADMIN | Migration targets |
| GET | `/api/usage/summary?from=&to=` | VIEWER | Cost summary |

**Pagination**: `?limit=20&offset=0` (max 500)

## Go CLI

```bash
cd agent && go build -o docker-platform ./cmd/cli
docker-platform config set api-url http://localhost:3000
docker-platform login --email admin@acme.local --password admin123456
docker-platform container-list
docker-platform host-list
```

## Configuration

### Control Plane (.env)

```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/docker_platform"
JWT_SECRET="your-super-secret-jwt-key-min-32-chars-long"
GRPC_PORT=50051
GRPC_HOST=0.0.0.0
TLS_ENABLED=false
```

### Agent (.env)

```env
CONTROL_PLANE_ADDR=localhost:50051
DOCKER_HOST=unix:///var/run/docker.sock
AGENT_ID=agent-001
HEARTBEAT_INTERVAL=30s
TLS_ENABLED=false
METRICS_PORT=9091
```

## Kubernetes (Helm)

```bash
cd deploy/helm/docker-platform
helm install docker-platform . --namespace docker-platform --create-namespace
```

## Production Database

```bash
./deploy/database/backup.sh                              # Backup
./deploy/database/restore-pitr.sh <backup-file>          # Restore
./deploy/database/restore-pitr.sh --pitr "2024-01-15 14:30:00 UTC"  # PITR
```

## TLS Certificates

```bash
.\scripts\generate-certs.ps1     # Windows
./scripts/generate-certs.sh      # Linux/macOS
```

## Multi-Tenant Isolation

Every query filters by `tenantId`. All tables have `tenant_id`. JWT includes tenant claim.

| Role | Level | Access |
|------|-------|--------|
| ADMIN | 1 | Full (hosts, users, tenants, audit) |
| OPERATOR | 2 | Deploy/stop containers, logs, environments |
| VIEWER | 3 | Read-only |

## Project Structure

```
project-phoenix/
├── control-plane/     # Node.js: handlers, services, repos, middleware, lib
│   ├── prisma/        # Schema + migrations
│   └── src/__tests__/ # Tests (vitest)
├── agent/             # Go: Docker client, gRPC, CLI, logging, metrics
├── proto/             # gRPC definitions
├── deploy/
│   ├── database/      # PostgreSQL config, backup/restore
│   ├── helm/          # Kubernetes chart
│   └── monitoring/    # Prometheus, Grafana
├── scripts/           # Setup, certs
├── docker-compose.yml
└── ROADMAP.md
```

## Troubleshooting

```bash
docker-compose logs postgres                   # DB issues
npx prisma generate && npx tsc --noEmit        # TS compilation
netstat -ano | findstr :50051                   # Port conflict (Windows)
curl http://localhost:3000/api/status           # Control Plane health
```
