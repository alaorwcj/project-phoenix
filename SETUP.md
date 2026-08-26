# Docker Platform - Complete Setup Guide

Comprehensive guide for the **Project Phoenix** multi-tenant Docker management platform (Phases 1-12).

## What You're Getting

- **Control Plane**: Node.js/TypeScript REST API + gRPC server (Fastify + Prisma + PostgreSQL)
- **Host Agent**: Go-based daemon on Docker hosts (Docker Engine API + gRPC client)
- **Web Dashboard**: React SPA (Vite + TypeScript + Tailwind CSS) — http://localhost:8080
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
| `dashboard` | 8080 | React web UI (Vite SPA) |

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

## Web Dashboard Development

```bash
cd dashboard && npm install
npm run dev                               # Start Vite dev server (http://localhost:5173)
npm run build                             # Build for production
```

**API Proxy**: Vite proxies `/api` → `http://localhost:3000` during development.

**Auth**: JWT stored in localStorage as `docker-platform-auth`. Demo credentials:
- Email: `admin@acme.local`
- Password: `admin123456`

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

## Production Deployment (Docker Compose)

```bash
cp .env.example .env                        # Copy and edit with real passwords
make deploy-prod                            # Full stack with production overrides
```

**Production override** (`docker-compose.prod.yml`) adds:
- TLS termination via nginx (port 443)
- Restart policies (always)
- Log rotation (10MB max, 3-5 files)
- Password-based Redis auth
- Secure JWT secret requirement

**Dashboard-only Docker build:**
```bash
cd dashboard && docker build -t docker-platform-dashboard .
docker run -p 8080:80 docker-platform-dashboard
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
├── dashboard/         # React: Vite SPA + Tailwind CSS (port 8080)
│   └── src/           # Components, pages, hooks, lib, types
├── proto/             # gRPC definitions
├── deploy/
│   ├── database/      # PostgreSQL config, backup/restore
│   ├── helm/          # Kubernetes chart
│   ├── nginx/         # TLS reverse proxy config
│   └── monitoring/    # Prometheus, Grafana
├── scripts/           # Setup, certs
├── docker-compose.yml
├── docker-compose.prod.yml
└── ROADMAP.md
```

## Troubleshooting

```bash
docker-compose logs postgres                   # DB issues
docker-compose logs dashboard                  # Dashboard issues
npx prisma generate && npx tsc --noEmit        # TS compilation
cd dashboard && npm run build                  # Dashboard build
netstat -ano | findstr :50051                   # Port conflict (Windows)
curl http://localhost:3000/api/status           # Control Plane health
curl http://localhost:8080/health               # Dashboard health
```
