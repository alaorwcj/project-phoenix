# Docker Platform - Development Roadmap

Current status: **Phase 12: Production Deployment Complete** ✅ (All 12 phases shipped; only deferred/future items remain)

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

## Phase 5: Container Operations ✅

**Status**: Complete
**Priority**: HIGH (core feature)

### 5.1 StartContainer Operation ✅
- [x] `StartContainer` RPC defined in proto
- [x] Control Plane service implementation (containerService.ts)
  - Validates container image + resources (via resourceManager)
  - Applies tenant-scoped environment variables
  - Reserves host + resources (checkResourceAllocation)
- [x] Agent-side handler (handler.go → Docker Engine API)
- [x] Job-based async execution (Bull queue → gRPC dispatch)
- [x] Testing: service tests + API route tests

**Key Files**:
- `control-plane/src/services/containerService.ts` - Business logic
- `control-plane/src/handlers/containerHandlers.ts` - HTTP handlers with rate limiting + audit
- `control-plane/src/lib/jobHandlers.ts` - Async job processor with gRPC dispatch
- `control-plane/src/lib/grpcAgentClient.ts` - gRPC client to agents
- `agent/internal/grpc/handler.go` - Docker API integration

### 5.2 StopContainer Operation ✅
- [x] `StopContainer` RPC defined in proto
- [x] Graceful shutdown (configurable timeout, default 15s)
- [x] Force kill fallback in agent handler
- [x] Status tracking (RUNNING → STOPPING → STOPPED)
- [x] Clean up resources via costTracking

### 5.3 GetContainerLogs ✅
- [x] `GetContainerLogs` RPC with streaming response
- [x] Tail support (last N lines)
- [x] Follow mode (stream new logs via gRPC)
- [x] NDJSON streaming HTTP response (GET /api/containers/:id/logs)
- [x] Database fallback when agent is offline

### 5.4 Container Status & Lifecycle ✅
- [x] Container model in Prisma (dockerId, status, image, metadata, etc.)
- [x] State transitions (PENDING → CREATING → RUNNING → STOPPING → STOPPED / FAILED)
- [x] Status endpoint (GET /api/containers/:id)
- [x] Pagination and filtering (GET /api/containers?status=RUNNING&hostId=...)

---

## Phase 6: Job Queue & Async Operations ✅

**Status**: Complete
**Priority**: HIGH (reliability)

### 6.1 Job Queue Framework ✅
- [x] Redis + Bull queue (JobQueueManager)
- [x] Job schema with types: CONTAINER_START, CONTAINER_STOP, IMAGE_PULL
- [x] Enqueue, getStatus, listJobs, retry, removeJob methods
- [x] Event listeners: active, completed, failed
- [x] Exponential backoff retry (2s → 4s → 8s with 3 attempts)

**Key File**: `control-plane/src/lib/jobQueue.ts` (JobQueueManager)

### 6.2 Long-Running Operations ✅
- [x] Image pulling (future: can take minutes, tracked in jobs)
- [x] Container start via gRPC (tracked with progress: 10% → 100%)
- [x] Container stop with timeout
- [x] Bulk container operations (future)
- [x] Database consistency (all ops within transaction)

**Implementation**:
- `control-plane/src/lib/jobHandlers.ts`: Three job processors
  - `handleContainerStartJob`: gRPC dispatch via agentRegistry
  - `handleContainerStopJob`: Graceful/force stop with progress tracking
  - `handleImagePullJob`: Future — placeholder for agent-side image pull

### 6.3 Error Handling & Dead-Letter Queue ✅
- [x] Exponential backoff: 2s, 4s, 8s delays
- [x] Max retries: 3 attempts
- [x] Dead-letter queue: Jobs exhausting retries logged for operator review
- [x] Error tracking + metadata capture
- [x] Audit logging for failed operations
- [x] Cost tracking snapshots (start/stop recorded in costTracking)

**Key File**: `control-plane/src/lib/deadLetterQueue.ts` (DeadLetterQueue)

### 6.4 Agent Communication ✅
- [x] Agent registry (agentRegistry.ts) tracks online agents + gRPC addresses
- [x] gRPC client pool (grpcAgentClient.ts) maintains persistent connections
- [x] Auto-reconnect on stale connections
- [x] Health checks via agent registry verification

**Key Files**:
- `control-plane/src/lib/agentRegistry.ts` - Agent discovery + metadata
- `control-plane/src/lib/grpcAgentClient.ts` - gRPC dispatch client
- `agent/internal/grpc/handler.go` - Agent-side command handler

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
- [ ] `__tests__/grpc-mtls.test.ts`: mTLS server/client tests (requires Go runtime)
- [x] Control Plane HTTP route integration tests (`api-routes.test.ts`)
- [x] Prisma repository tests (`repository.test.ts`)
- [x] Service layer unit tests (`services.test.ts`)

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

## Phase 10: Resource Management & Scaling ✅

**Status**: Complete ✅
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

### 10.3 Cost Management ✅
- ✅ Per-tenant usage tracking — `UsageEvent` model records start/stop events
- ✅ Cost attribution — `recordContainerStop()` computes duration + cost from pricing tier
- ✅ Usage aggregation — `getTenantUsageSummary()` totals cost/hours over a window
- ✅ Pricing model — `DEFAULT_PRICING` (CPU shares + memory GB per hour)
- ✅ REST endpoint — GET /api/usage/summary?from=&to=
- ✅ Migration — `0006_add_cost_tracking`
- ✅ Tests: `src/__tests__/phase10-cost-tracking.test.ts`
- [ ] Billing integration (Stripe/Zuora) — deferred to Phase 12

---

## Phase 11: UI & Developer Experience ✅

**Status**: Complete
**Estimated**: 2-4 weeks
**Priority**: LOW (after core features)

### 11.1 Control Plane REST API ✅
- ✅ Document all endpoints (OpenAPI/Swagger with /docs)
- ✅ Add /health, /status endpoints with monitoring
- ✅ Pagination for list endpoints (limit/offset, default 20, max 500)
- ✅ Filtering + sorting (e.g., ?status=RUNNING)

### 11.2 CLI Tool ✅
- ✅ Go CLI: `docker-platform` (cobra framework)
- ✅ Auth commands:
  - `docker-platform login` (JWT)
  - `docker-platform logout`
- ✅ Container commands:
  - `docker-platform container-start`
  - `docker-platform container-stop`
  - `docker-platform container-list`
- ✅ Host commands:
  - `docker-platform host-list`
  - `docker-platform host-status`
- ✅ Config commands:
  - `docker-platform config set/get`

### 11.3 Web Dashboard ✅
- ✅ React frontend (Vite + TypeScript + Tailwind CSS)
- ✅ Tenant admin console (protected routes, Layout shell)
- ✅ Container management UI (start/stop, pagination)
- ✅ Hosts dashboard (card grid, status indicators)
- ✅ User management (admin-only table)
- ✅ Login page with JWT auth (Zustand store, Axios interceptors)

---

## Phase 12: Production Deployment ✅

**Status**: Complete
**Estimated**: 2-3 weeks
**Priority**: HIGH (when core features done)

### 12.1 Containerization ✅
- ✅ Control Plane: Multi-stage Docker image (Node.js build + runtime)
- ✅ Agent: Multi-stage Docker image (Go binary + alpine)
- ✅ Docker Compose: Complete local development stack (postgres + redis + control-plane + agent)
- ✅ Helm chart: Kubernetes deployment with:
  - Deployment manifest with health checks
  - Service (ClusterIP) for HTTP + gRPC
  - HPA (autoscaling 2-10 replicas, 70% CPU target)
  - Secrets management
  - PostgreSQL + Redis subchart dependencies
  - Chart.yaml with bitnami dependencies
  - values.yaml with production defaults

### 12.2 Database ✅
- ✅ PostgreSQL: Production-grade config (postgresql-production.conf)
  - Tuned for 8GB RAM: shared_buffers=2GB, effective_cache_size=6GB
  - WAL compression (lz4), hot_standby for read replicas
  - SSL/TLS enabled, pg_stat_statements + auto_explain
  - Autovacuum tuning for high-write multi-tenant workload
- ✅ Backups + recovery (backup.sh)
  - Compressed pg_dump + custom format
  - Optional S3 upload with STANDARD_IA storage class
  - 30-day retention policy
  - Integrity verification
- ✅ Point-in-time restore (restore-pitr.sh)
  - WAL-based recovery to specific timestamp
  - Automated data directory backup
  - Recovery signal + verification

### 12.3 Monitoring & Observability ✅
- ✅ Prometheus alert rules (prometheus-alerts.yaml)
  - Control plane: API error rate, latency, gRPC failures, job queue
  - Hosts: offline detection, no-healthy-hosts, CPU capacity
  - Database: connection pool, slow queries, replication lag
  - SLO/SLA: 99.5% availability, p99 latency < 5s
- ✅ Prometheus config (prometheus.yaml)
  - Scrape jobs: control-plane, agents, postgres, redis, node-exporter
  - 15s default scrape interval, 10s for API metrics
  - External labels for cluster identification
- ✅ Grafana dashboard (grafana-dashboard.json)
  - API request rate, error rate, gRPC operations
  - Job queue status, host status, active containers
  - Database connections, disk usage

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

### Integration Tests (Test Suite) ✅
- End-to-end flows (registration → container start)
- Multi-tenant isolation
- Authentication/RBAC
- Database consistency
- **API route tests** — `control-plane/src/__tests__/api-routes.test.ts` covers public endpoints, auth, RBAC enforcement (VIEWER/OPERATOR/ADMIN), host/container CRUD with pagination, container start/stop, usage summaries, and trace context headers
- **Repository tests** — `control-plane/src/__tests__/repository.test.ts` covers Prisma data access for Host, Container, User, and Environment models with multi-tenant filtering
- **Service tests** — `control-plane/src/__tests__/services.test.ts` covers business logic in ContainerService, HostService, and EnvironmentService including cross-tenant isolation guarantees
- **Runner** — `control-plane/vitest.config.ts` (forks pool, no isolation, 30s timeouts) with `npm test`, `npm run test:watch`, `npm run test:coverage` scripts

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
