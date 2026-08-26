# Docker Platform - Development Roadmap

Current status: **Phase 9: Security Hardening Complete** ✅ (Phases 1-9 complete; Phase 10 ready to start)

This document outlines the remaining work to build out the Docker Platform multi-tenant architecture.

## Completed Phases

### Phase 1: Foundation ✅
- ✅ Project structure (control-plane, agent, proto)
- ✅ Node.js/TypeScript Control Plane scaffold
- ✅ Fastify REST API routing
- ✅ Prisma ORM with multi-tenant schema
- ✅ JWT authentication and RBAC
- ✅ Database schema (Tenant, User, Environment, Host)

### Phase 2: gRPC & Proto ✅
- ✅ Proto contract definition (docker_platform.proto)
- ✅ gRPC server in Control Plane
- ✅ Manual proto type generation (TypeScript/Go)
- ✅ HTTP adapter for development transport
- ✅ Host registration and heartbeat handlers

### Phase 3: Agent Implementation ✅
- ✅ Go agent scaffold with config loading
- ✅ Docker Engine API client
- ✅ Metrics collection (CPU, Memory, Disk)
- ✅ gRPC client (HTTP adapter in dev)
- ✅ Registration and heartbeat loops

### Phase 4: Database & Testing ✅
- ✅ Database migrations (Prisma)
- ✅ Seed data script (tenant, users, environments, hosts)
- ✅ Integration test suite (registration, heartbeat, isolation, RBAC)
- ✅ Unit tests (Agent proto types, mocking)
- ✅ Setup automation (bash, PowerShell)
- ✅ Comprehensive documentation

## Phase 5: Container Operations (NEXT)

**Status**: Ready to start
**Estimated**: 1-2 weeks
**Priority**: HIGH (core feature)

### 5.1 StartContainer Operation
- [ ] Add `StartContainer` RPC to proto
- [ ] Implement in Control Plane service
  - Validate container image + resources
  - Apply tenant-scoped environment variables
  - Reserve host + resources
- [ ] Implement in Agent
  - Docker API: create + start container
  - Mount volumes (bind, named volumes)
  - Set resource limits (CPU, memory)
  - Network configuration
- [ ] Testing
  - Unit: Container creation logic
  - Integration: End-to-end start flow
  - Validation: Image pulling, resource allocation

**Files to Create/Modify**:
- `proto/docker_platform.proto` - Add `StartContainerRequest/Response`
- `control-plane/src/services/containerService.ts` - Business logic
- `control-plane/src/repositories/containerRepository.ts` - Data access
- `agent/internal/docker/client.go` - Docker API integration

### 5.2 StopContainer Operation
- [ ] Add `StopContainer` RPC to proto
- [ ] Implement graceful shutdown (15s timeout)
- [ ] Force kill if needed
- [ ] Update container status in database
- [ ] Clean up resources

**Files**:
- `proto/docker_platform.proto` - Add `StopContainerRequest/Response`
- `control-plane/src/services/containerService.ts` - Stop logic
- `agent/internal/docker/client.go` - Docker stop/kill

### 5.3 GetContainerLogs
- [ ] Add `GetContainerLogs` RPC to proto
- [ ] Implement streaming response
- [ ] Support tail (last N lines)
- [ ] Follow mode (stream new logs)
- [ ] Timestamp filtering

**Files**:
- `proto/docker_platform.proto` - Add `GetContainerLogsRequest/Response`
- `agent/internal/docker/client.go` - Log streaming

### 5.4 Container Status & Lifecycle
- [ ] Database schema: Container table (if needed)
  ```prisma
  model Container {
    id              String    @id @default(cuid())
    dockerId        String    @unique
    name            String
    status          String    // running, stopped, error
    image           String
    createdAt       DateTime
    startedAt       DateTime?
    stoppedAt       DateTime?
    environmentId   String
    environment     Environment @relation(fields: [environmentId], references: [id])
    tenantId        String
    metadata        Json
  }
  ```
- [ ] Track state transitions (PENDING → RUNNING → STOPPED)
- [ ] Handle container crashes (restart policy)
- [ ] Status endpoint (GET /api/containers/:id)

---

## Phase 6: Job Queue & Async Operations

**Status**: Design phase
**Estimated**: 1-2 weeks
**Priority**: HIGH (reliability)

### 6.1 Job Queue Framework
- [ ] Choose queue: Redis+Bull, RabbitMQ, or Temporal
- [ ] Design job schema
- [ ] Implement: Create, Enqueue, Process, Retry
- [ ] Failed job handling (dead-letter queue)
- [ ] Job status tracking

### 6.2 Long-Running Operations
- [ ] Image pulling (can take minutes)
- [ ] Large log streaming
- [ ] Bulk container operations
- [ ] Database backups

### 6.3 Retry Logic
- [ ] Exponential backoff
- [ ] Max retries + dead-letter
- [ ] Error tracking + alerts
- [ ] Manual retry UI

---

## Phase 7: Real gRPC Transport ✅

**Status**: Complete
**Priority**: HIGH (security critical)

### 7.1 Certificate Generation ✅
- ✅ PowerShell script (Windows): `scripts/generate-certs.ps1`
- ✅ Bash script (Linux/Mac): `scripts/generate-certs.sh`
- ✅ Support for dev (self-signed) and prod modes
- ✅ Generated: CA, server cert, client cert with proper extensions

### 7.2 mTLS Server (Control Plane) ✅
- ✅ `src/lib/tlsConfig.ts`: TLS utilities
- ✅ `src/lib/grpcServer.ts`: Use ServerCredentials.createSsl()
- ✅ `src/config/env.ts`: TLS_ENABLED, TLS_CERT_PATH, TLS_KEY_PATH, TLS_CA_PATH
- ✅ Backwards compatible (TLS_ENABLED=false for development)

### 7.3 mTLS Client (Go Agent) ✅
- ✅ `agent/internal/grpc/tls.go`: TLS credential loading
- ✅ `agent/internal/grpc/client.go`: Use gRPC with mTLS
- ✅ `agent/internal/config/config.go`: TLS configuration
- ✅ `agent/cmd/agent/main.go`: Pass TLS config to client

### 7.4 Integration Tests 🔄
- [ ] `__tests__/grpc-mtls.test.ts`: mTLS server/client tests
- [ ] Test certificate validation
- [ ] Test certificate rejection scenarios
- [ ] Performance benchmarks

### 7.5 Documentation ✅
- ✅ `docs/PHASE_7_MTLS.md`: Complete guide
- [ ] Troubleshooting section
- [ ] Deployment checklist
- [ ] Certificate rotation procedures

---

## Phase 8: Observability ✅

**Status**: Complete
**Priority**: MEDIUM (post-MVP)

### 8.1 Structured Logging ✅
- ✅ JSON logging via Pino (Fastify)
- ✅ Request tracing IDs (trace entire flow)
- ✅ StructuredLogger interface (`src/lib/logger.ts`)
- ✅ Go structured key=value logger (`agent/internal/logging/`)

### 8.2 Metrics ✅
- ✅ Prometheus export (Node + Go)
- ✅ Key metrics: HTTP requests, gRPC operations, job queue counters, heartbeat latency
- ✅ Dependency-free Prometheus text format exporter
- ✅ `/metrics` endpoint on Control Plane
- ✅ Optional metrics HTTP server on Agent (`METRICS_PORT`)

### 8.3 Distributed Tracing ✅
- ✅ W3C traceparent + x-trace-id header propagation
- ✅ Trace context resolution per request (`src/lib/trace.ts`)
- ✅ Agent trace ID resolution (`agent/internal/trace/`)
- ✅ gRPC metadata propagation

---

## Phase 9: Security Hardening ✅

**Status**: Complete
**Priority**: HIGH (before production)

### 9.1 Input Validation ✅
- ✅ Container name validation (alphanumeric + underscore/dot/dash, max 64)
- ✅ Image name validation (registry/repo:tag format)
- ✅ Resource limits (max CPU shares 1024, max memory 16GB)
- ✅ Environment variable sanitization (key format, no shell injection)
- ✅ Zod schemas + `validateBody()` helper (`src/lib/validation.ts`)

### 9.2 Rate Limiting ✅
- ✅ Per-tenant rate limits (10 container ops/min)
- ✅ Per-user rate limits (100 writes/min, 500 reads/min)
- ✅ In-memory sliding window (`src/lib/rateLimit.ts`)
- ✅ 429 with Retry-After header

### 9.3 Audit Logging ✅
- ✅ Track all operations (who, what, when, result)
- ✅ Database: AuditLog table + AuditAction enum (13 actions)
- ✅ `writeAuditLog()` never throws (`src/lib/audit.ts`)
- [ ] Admin audit UI (deferred to Phase 11)

### 9.4 Secrets Management ✅
- ✅ Encrypt environment variables at rest (AES-256-GCM, random IV)
- ✅ `encryptSecret/decryptSecret`, `encryptEnvVars/decryptEnvVars` (`src/lib/secrets.ts`)
- [ ] Vault integration (HashiCorp Vault) — abstraction path documented, deferred
- [ ] Secret rotation mechanism (deferred)

---

## Phase 10: Resource Management & Scaling

**Status**: Ready to start
**Estimated**: 2-3 weeks
**Priority**: MEDIUM (post-MVP)

### 10.1 Resource Reservation ✅
- ✅ Track host capacity (CPU shares, memory, disk) — Host model fields
- ✅ Prevent over-allocation — `checkResourceAllocation()` returns 402 on over-commit
- ✅ Current usage computed from active (non-terminal) containers
- ✅ Multi-host scheduling (most-fit bin packing) — `findBestHost()`
- ✅ Backwards-compatible: hosts without capacity limits accept all allocations
- ✅ Tests: `src/__tests__/phase10-resources.test.ts`

### 10.2 Multi-Host Orchestration ✅
- ✅ Host health monitoring — `evaluateHostHealth()` marks stale agents OFFLINE (60s timeout)
- ✅ Failover planning — `planFailover()` identifies containers + target hosts
- ✅ Migration targeting — `findMigrationTargets()` considers capacity and tenant isolation
- ✅ Periodic sweeper — 30s health check integrated into app startup
- ✅ Reconciliation — `reconcileFreshHosts()` recovers agents with fresh heartbeats
- ✅ Admin REST endpoints:
  - POST /api/hosts/health/sweep (manual trigger)
  - GET  /api/hosts/:id/failover-plan
  - GET  /api/hosts/:id/migration-targets
- ✅ Tests: `src/__tests__/phase10-host-health.test.ts`

### 10.3 Cost Management
- [ ] Per-tenant usage tracking
- [ ] Cost attribution
- [ ] Billing integration (Stripe/Zuora)

---

## Phase 11: UI & Developer Experience

**Status**: Planning
**Estimated**: 2-4 weeks
**Priority**: LOW (after core features)

### 11.1 Control Plane REST API
- [ ] Document all endpoints (OpenAPI/Swagger)
- [ ] Add /health, /status endpoints
- [ ] Pagination for list endpoints
- [ ] Filtering + sorting

### 11.2 CLI Tool
- [ ] Go CLI: `docker-platform`
- [ ] Commands:
  - `docker-platform login` (JWT auth)
  - `docker-platform container start`
  - `docker-platform container logs`
  - `docker-platform host list`
  - `docker-platform config set/get`

### 11.3 Web Dashboard (Future)
- [ ] React frontend
- [ ] Tenant admin console
- [ ] Container management UI
- [ ] Metrics/logs dashboard
- [ ] User management

---

## Phase 12: Production Deployment

**Status**: Planning
**Estimated**: 2-3 weeks
**Priority**: HIGH (when core features done)

### 12.1 Containerization
- [ ] Control Plane: Docker image
- [ ] Agent: Docker image
- [ ] Docker Compose: Local development
- [ ] Helm chart: Kubernetes deployment

### 12.2 Database
- [ ] PostgreSQL: Production-grade config
- [ ] Backups + recovery
- [ ] Point-in-time restore
- [ ] Read replicas for high availability

### 12.3 High Availability
- [ ] Multiple Control Plane instances (load balanced)
- [ ] gRPC load balancing (multiple agents per host)
- [ ] Database failover
- [ ] Session persistence

### 12.4 Monitoring & Alerting
- [ ] Alert rules (CPU, memory, errors)
- [ ] On-call rotation (Pagerduty)
- [ ] Post-incident reviews
- [ ] SLO/SLA tracking

---

## Priority & Timeline

### MVP (Month 1)
- ✅ Phases 1-4: Foundation + gRPC + Database
- 🔄 Phase 5: Container operations (StartContainer, StopContainer)
- 🔄 Phase 6: Job queue (background operations)
- 🔄 Phase 8: Logging (observability foundation)

### Stable Release (Month 2)
- Phase 7: Real gRPC (protoc fix)
- Phase 9: Security hardening
- Phase 12: Production deployment (Docker, Helm)

### Enhancements (Month 3+)
- Phase 10: Resource management & multi-host
- Phase 11: UI & CLI
- Phase 8: Full observability (metrics, tracing)

---

## Known Issues & Blockers

### Protoc Windows Issue 🔴 BLOCKING
- **Issue**: protoc v36 crashes with `basic_string::_M_construct null not valid`
- **Impact**: Cannot auto-generate proto types on Windows
- **Workaround**: Manual type definitions (currently in use)
- **Solution**: Upgrade to protoc v37+ (when available) or use WSL2

### gRPC HTTP Adapter (Temporary)
- Currently using HTTP+JSON for development (not real gRPC)
- Will be replaced with real gRPC once protoc fixed
- Production: must use real gRPC + mTLS

### Docker Daemon Access
- Agent requires Docker socket or HTTP endpoint
- Development: unix:///var/run/docker.sock
- Production: Needs TCP endpoint + TLS

---

## Development Guidelines

### Before Starting a Phase
1. Create feature branch: `git checkout -b phase/X-description`
2. Update this roadmap with progress
3. Create supporting issues (one per major task)
4. Design review with team

### During Development
1. Write tests first (TDD)
2. Commit frequently (small, logical units)
3. Update documentation as you go
4. Run `make test` before pushing

### Before Merging
1. Pass all tests: `make test`
2. Run linters: (TypeScript + Go)
3. PR review + approval
4. Merge to main + deploy (if applicable)

---

## Testing Strategy

### Unit Tests (Developer Responsibility)
- Database queries (Prisma)
- Business logic (services)
- Validation logic
- Type safety (Go interfaces)

### Integration Tests (Test Suite)
- End-to-end flows (registration → container start)
- Multi-tenant isolation
- Authentication/RBAC
- Database consistency

### Performance Tests (Before Release)
- Load testing (containers/sec)
- Concurrency (multiple agents)
- Database query optimization
- Memory/CPU profiling

---

## Getting Help

- **Questions?** Create a discussion
- **Issue?** File issue with reproduction steps
- **Design?** Start draft PR for feedback
- **Stuck?** Contact team lead

---

## Contributions Welcome! 🎉

See CONTRIBUTING.md for:
- Code style guidelines
- Commit message format
- Testing requirements
- PR process
- Development workflow

Happy coding! 🚀
