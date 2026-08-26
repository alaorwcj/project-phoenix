# 🐳 Docker Platform — Multi-Tenant Container Orchestration

[![PR #10](https://img.shields.io/badge/PR-%2310-merged-6e40c9)](https://github.com/alaorwcj/project-phoenix/pull/10)
[![Phases](https://img.shields.io/badge/Phases-1%2F12%20Complete-brightgreen)](ROADMAP.md)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

A centralized platform for multi-tenant Docker container orchestration, monitoring, and management with gRPC communication, mTLS security, and production-ready infrastructure.

## Architecture

```
                          ┌──────────────────────────┐
                          │   REST API + gRPC Server │
                          │   (Control Plane)        │
                          │   Port 3000 / 50051       │
                          └─────────┬────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
      ┌───────▼───────┐   ┌────────▼────────┐   ┌───────▼───────┐
      │  Fastify       │   │  gRPC Services  │   │  PostgreSQL   │
      │  REST Routes   │   │  HostAgent      │   │  Multi-Tenant │
      └───────┬───────┘   └────────┬────────┘   └───────────────┘
              │                     │              (tenant_id isolation)
              │    ┌────────────────┘
              │    │
      ┌───────▼────▼──────────────┐
      │   Host Agent(s)           │
      │   Go + Docker Engine API  │
      │   + gRPC Client + mTLS   │
      └───────────────────────────┘
```

## What's Included

| Component | Tech | Features |
|-----------|------|----------|
| **Control Plane** | Node.js/TypeScript, Fastify, Prisma | JWT auth, RBAC, multi-tenant isolation, pagination |
| **Host Agent** | Go, Docker SDK, gRPC | Container lifecycle, metrics, health checks |
| **gRPC** | Protocol Buffers, mTLS | Secure bidirectional communication |
| **Security** | AES-256-GCM, Zod, rate limiting | Input validation, audit logging, secrets encryption |
| **Observability** | Pino, Prometheus, distributed tracing | Structured logs, metrics export, request tracing |
| **Resources** | Bin-packing scheduler, health monitor | Capacity management, failover planning, cost tracking |
| **Deployment** | Docker, Helm, Prometheus, Grafana | Production configs, backup/restore, alerting |

## Quick Start

```bash
# Start everything
docker-compose up -d

# Verify
curl http://localhost:3000/api/status

# Swagger docs
open http://localhost:3000/docs

# Authenticate
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.local","password":"admin123456"}'
```

## Project Structure

```
project-phoenix/
├── control-plane/              # Node.js/TypeScript
│   ├── src/
│   │   ├── config/             # Environment configuration
│   │   ├── handlers/           # HTTP request handlers
│   │   ├── lib/                # Libraries (16 modules)
│   │   │   ├── audit.ts        # Audit logging
│   │   │   ├── auth.ts         # JWT + RBAC
│   │   │   ├── costTracking.ts # Per-tenant billing
│   │   │   ├── grpcServer.ts   # gRPC server
│   │   │   ├── hostHealth.ts   # Health monitoring + failover
│   │   │   ├── logger.ts       # Structured logging
│   │   │   ├── metrics.ts      # Prometheus metrics
│   │   │   ├── pagination.ts   # List pagination
│   │   │   ├── rateLimit.ts    # Rate limiting
│   │   │   ├── resourceManager.ts # Capacity scheduling
│   │   │   ├── secrets.ts      # AES-256-GCM encryption
│   │   │   ├── trace.ts        # Distributed tracing
│   │   │   ├── tlsConfig.ts    # mTLS configuration
│   │   │   └── validation.ts   # Zod input validation
│   │   ├── middleware/          # Auth, tenant isolation
│   │   ├── repositories/       # Prisma data access
│   │   ├── routes/             # Route definitions
│   │   ├── services/           # Business logic
│   │   └── __tests__/          # Test suites
│   ├── prisma/
│   │   ├── schema.prisma       # 9 models, 13 audit actions
│   │   └── migrations/         # 6 migrations
│   └── Dockerfile
├── agent/                      # Go
│   ├── cmd/agent/              # Agent entrypoint
│   ├── cmd/cli/                # CLI tool (cobra)
│   ├── internal/
│   │   ├── cli/                # CLI commands
│   │   ├── config/             # Configuration
│   │   ├── docker/             # Docker Engine API
│   │   ├── grpc/               # gRPC client + mTLS
│   │   ├── logging/            # Structured logger
│   │   ├── metrics/            # Prometheus metrics
│   │   └── trace/              # Distributed tracing
│   └── Dockerfile
├── proto/                      # gRPC contracts
│   └── docker_platform.proto
├── deploy/
│   ├── database/               # PostgreSQL config + backup scripts
│   ├── helm/docker-platform/   # Kubernetes Helm chart
│   └── monitoring/             # Prometheus + Grafana
├── scripts/                    # Setup + cert generation
├── docker-compose.yml          # Full local dev stack
└── ROADMAP.md                  # Development roadmap
```

## API Reference

### Authentication

```bash
# Login (returns JWT)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.local","password":"admin123456"}'
```

### Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/status` | Public | System health |
| GET | `/api/hosts` | VIEWER | List hosts (paginated) |
| POST | `/api/hosts/health/sweep` | ADMIN | Health check sweep |
| GET | `/api/hosts/:id/failover-plan` | ADMIN | Failover analysis |
| GET | `/api/containers` | VIEWER | List containers (paginated) |
| POST | `/api/containers` | OPERATOR | Start container |
| POST | `/api/containers/:id/stop` | OPERATOR | Stop container |
| GET | `/api/containers/:id/logs` | VIEWER | Stream logs |
| GET | `/api/usage/summary` | VIEWER | Cost summary |
| GET | `/docs` | Public | Swagger UI |
| GET | `/metrics` | Public | Prometheus metrics |

**Pagination**: `?limit=20&offset=0` (default 20, max 500)

### gRPC Services

| RPC | Description |
|-----|-------------|
| `RegisterHost` | Agent registration with metadata |
| `Heartbeat` | Periodic health + metrics report |
| `StartContainer` | Deploy container to host |
| `StopContainer` | Graceful shutdown (15s timeout) |
| `GetContainerLogs` | Stream container logs |

## Development Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation | ✅ |
| 2 | gRPC & Proto | ✅ |
| 3 | Agent Implementation | ✅ |
| 4 | Database & Testing | ✅ |
| 5 | Container Operations | ✅ |
| 6 | Job Queue | ✅ |
| 7 | Real gRPC + mTLS | ✅ |
| 8 | Observability | ✅ |
| 9 | Security Hardening | ✅ |
| 10 | Resource Management | ✅ |
| 11 | UI & Developer Experience | ✅ |
| 12 | Production Deployment | ✅ |

See [ROADMAP.md](ROADMAP.md) for detailed phase breakdown.

## Security

- **mTLS**: Certificate-based authentication between Control Plane and Agents
- **JWT**: Token-based API authentication with tenant scoping
- **RBAC**: Three roles (ADMIN, OPERATOR, VIEWER) with hierarchical permissions
- **Encryption**: AES-256-GCM for secrets at rest
- **Rate Limiting**: Per-tenant (10 ops/min) and per-user (100 writes/min, 500 reads/min)
- **Audit Logging**: All operations tracked with who/what/when/result
- **Input Validation**: Zod schemas for all API inputs

## Deployment

### Local (Docker Compose)

```bash
docker-compose up -d
```

### Kubernetes (Helm)

```bash
cd deploy/helm/docker-platform
helm install docker-platform . -n docker-platform --create-namespace
```

### Production Checklist

- [ ] PostgreSQL 16+ with `deploy/database/postgresql-production.conf`
- [ ] TLS certificates for gRPC (`scripts/generate-certs.sh`)
- [ ] Prometheus scraping `/metrics` endpoints
- [ ] Grafana dashboard imported from `deploy/monitoring/grafana-dashboard.json`
- [ ] Backup schedule configured (`deploy/database/backup.sh`)
- [ ] Alert rules active (`deploy/monitoring/prometheus-alerts.yaml`)

## Test Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@acme.local | admin123456 | ADMIN |
| operator@acme.local | operator123456 | OPERATOR |
| viewer@acme.local | viewer123456 | VIEWER |

## Contributing

1. Create feature branch: `git checkout -b phase/X-description`
2. Follow Clean Architecture (handlers → services → repositories)
3. Add tests for new functionality
4. Run `npx tsc --noEmit` before committing
5. Commit with descriptive message + `Co-authored-by` trailer
6. Open PR against `main`

## References

- [Prisma Multi-Tenancy](https://www.prisma.io/docs/concepts/components/prisma-schema/multi-tenancy)
- [gRPC Go Quickstart](https://grpc.io/docs/languages/go/quickstart/)
- [Docker Engine API](https://docs.docker.com/engine/api/)
- [Fastify Documentation](https://www.fastify.io/docs/)
