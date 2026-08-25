# Docker Platform - Complete Setup Guide

This guide walks you through setting up and running the complete Docker Platform multi-tenant architecture.

## Prerequisites

- **Node.js** 18+ (for Control Plane)
- **Go** 1.21+ (for Host Agent)
- **Docker & Docker Compose** (for PostgreSQL)
- **PostgreSQL** 16+ (via Docker Compose)

## Quick Start (All Platforms)

### 1. Start Infrastructure

```bash
# From project root
docker-compose up -d postgres

# Verify PostgreSQL is running
docker-compose ps
```

### 2. Set Up Control Plane

```bash
cd control-plane

# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migration
npm run db:migrate -- --name init

# Seed test data (users, tenants, environments, hosts)
npm run db:seed
```

### 3. Start Control Plane Server

```bash
# From control-plane directory
npm run dev

# Expected output:
# ✅ Fastify server listening on http://localhost:3000
# ✅ gRPC server listening on localhost:50051
```

### 4. Start Host Agent (in new terminal)

```bash
cd agent

# Install Go dependencies
go mod download

# Run agent
go run cmd/agent/main.go

# Expected output:
# 🚀 Starting Docker Platform Host Agent
# ✅ Connected to Docker Engine
# 🔗 Registering with Control Plane...
# ✅ Host registered (host-id: xxx)
# 💓 Heartbeat loop started (30s interval)
```

## Automated Setup Scripts

### Windows PowerShell

```powershell
# From project root
.\scripts\setup-db.ps1

# Options:
# -SkipCompose    : Skip docker-compose up (if already running)
# -SkipSeed       : Skip database seeding
```

### Linux/macOS Bash

```bash
# From project root
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh
```

## Database Setup Details

### What the Migration Does

1. **Creates Tenant Table**: Multi-tenant root entity
   - `id`, `name`, `createdAt`
   - All other tables reference this via `tenant_id`

2. **Creates User Table**: Authentication & RBAC
   - `id`, `email`, `passwordHash`, `role` (ADMIN/OPERATOR/VIEWER)
   - `tenantId` for tenant isolation

3. **Creates Environment Table**: Container deployment contexts
   - `id`, `name`, `slug`, `description`
   - `variables` (JSON) for environment-specific secrets
   - `tenantId` for isolation

4. **Creates Host Table**: Docker host registry
   - `id`, `name`, `hostname`, `agentId`
   - `status` (ONLINE/OFFLINE/PENDING)
   - `dockerVersion`, `metadata`, `lastHeartbeat`
   - `tenantId` for isolation

### Test Credentials (from seed.ts)

After seeding, you have:

**Tenant**: Acme Corporation

| Email | Password | Role |
|-------|----------|------|
| admin@acme.local | admin123456 | ADMIN |
| operator@acme.local | operator123456 | OPERATOR |
| viewer@acme.local | viewer123456 | VIEWER |

**Environments**:
- Development (dev)
- Staging (staging)
- Production (prod)

**Hosts** (for testing):
- docker-host-01 (agent-001, ONLINE)
- docker-host-02 (agent-002, OFFLINE)

## Testing

### Run Integration Tests

```bash
cd control-plane

# Install Jest
npm install --save-dev jest @jest/globals @types/jest ts-jest

# Create jest.config.js
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
EOF

# Run tests
npm test
```

### Run Agent Tests

```bash
cd agent

# Run all tests
go test ./internal/grpcgen -v

# Run specific test
go test ./internal/grpcgen -run TestHostMetricsMarshaling -v

# Run with coverage
go test ./internal/grpcgen -cover
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       REST API + gRPC Server                │
│                  (Control Plane - Port 3000/50051)           │
├──────────────────────────────────────┬──────────────────────┤
│  Fastify Routes                      │  gRPC Services       │
├────────┬────────┬────────────────────┼──────────────────────┤
│ Auth   │ Hosts  │ Containers         │ RegisterHost         │
│ Env    │ Status │ Logs               │ Heartbeat            │
│        │        │                    │ StartContainer       │
│        │        │                    │ StopContainer        │
└────────┴────────┴────────────────────┴──────────────────────┘
                            ↕
              ┌─────────────────────────┐
              │  PostgreSQL (Docker)    │
              │  Port 5432              │
              └─────────────────────────┘
                            ↑
          (tenant_id filtering on all queries)
                            ↑
        ┌─────────────────────────────────────┐
        │   Host Agent (Docker Socket)        │
        │   (Port 50051 gRPC)                 │
        ├─────────────────────────────────────┤
        │ Docker Engine API Client            │
        │ ├─ Container Lifecycle              │
        │ ├─ Metrics Collection               │
        │ └─ Log Streaming                    │
        └─────────────────────────────────────┘
```

## Configuration

### Control Plane (.env)

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/docker_platform"

# JWT
JWT_SECRET="your-super-secret-jwt-key-min-32-chars-long"

# gRPC
GRPC_PORT=50051
GRPC_HOST=localhost

# Server
PORT=3000
LOG_LEVEL=debug
```

### Host Agent (.env)

```env
# Control Plane
CONTROL_PLANE_ADDR=localhost:50051

# Docker
DOCKER_HOST=unix:///var/run/docker.sock
AGENT_ID=agent-001

# Heartbeat
HEARTBEAT_INTERVAL=30s
```

## Multi-Tenant Isolation Strategy

Every query includes `tenantId` filter:

```typescript
// Example: Only see hosts for YOUR tenant
const hosts = await prisma.host.findMany({
  where: { tenantId: currentUser.tenantId }
});
```

**Key Rules**:
1. All operational tables have `tenant_id` column
2. Foreign keys cascade delete (tenant deletion removes all data)
3. JWT payload must include `tenantId` claim
4. Auth middleware validates tenant membership
5. Repositories enforce tenant filters at query level

## JWT Token Structure

```json
{
  "sub": "user-id-uuid",
  "tenantId": "tenant-id-uuid",
  "role": "ADMIN",
  "iat": 1234567890,
  "exp": 1234571490
}
```

**Role Hierarchy** (lower = more privileged):
- ADMIN (1): Full access
- OPERATOR (2): Deploy, manage containers
- VIEWER (3): Read-only access

## RBAC Examples

```typescript
// Admin only
@requireRole('ADMIN')
async deleteHost() { }

// Operator and Admin
@requireRole('OPERATOR')
async startContainer() { }

// All authenticated users
@requireRole('VIEWER')
async listContainers() { }
```

## Troubleshooting

### PostgreSQL Connection Error

```bash
# Check if postgres is running
docker-compose ps postgres

# View postgres logs
docker-compose logs postgres

# Verify connection
docker-compose exec postgres psql -U postgres -d docker_platform -c "SELECT version();"
```

### gRPC Port Already in Use

```bash
# Find process using port 50051
lsof -i :50051  # macOS/Linux
netstat -ano | findstr :50051  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### Agent Can't Connect to Control Plane

```bash
# Check if Control Plane is running
curl http://localhost:3000/health

# Check gRPC availability
grpcurl -plaintext localhost:50051 list

# Verify agent env variables
cat .env.example
```

### Tests Failing

```bash
# Reset database
cd control-plane
npm run db:reset

# Re-seed
npm run db:seed

# Run tests
npm test
```

## Next Steps

1. **Implement Container Operations**
   - `StartContainer`: Deploy to host via Docker API
   - `StopContainer`: Graceful shutdown
   - `GetLogs`: Stream container logs

2. **Add Job Queue** (for long-running operations)
   - Redis + Bull for reliable container operations
   - Retry logic and dead-letter handling

3. **Implement Real gRPC** (currently using HTTP adapter)
   - Replace manual proto types with protoc-generated code
   - Add mTLS certificate authentication

4. **Add Observability**
   - Prometheus metrics export
   - Structured logging (JSON)
   - Distributed tracing (OpenTelemetry)

5. **Security Hardening**
   - Rate limiting
   - Input validation/sanitization
   - CORS policy enforcement

## File Locations

| Component | Path | Notes |
|-----------|------|-------|
| Control Plane | `./control-plane/` | Node.js + Fastify + Prisma |
| Host Agent | `./agent/` | Go + Docker SDK |
| Proto Contracts | `./proto/` | gRPC service definitions |
| Database | `./.docker-compose.yml` | PostgreSQL 16 |
| Setup Scripts | `./scripts/` | Bash & PowerShell automation |
| Documentation | `./README.md` | Full architecture overview |

## Support

For issues, check the README.md or review:
- Control Plane logs: `npm run dev`
- Agent logs: `go run cmd/agent/main.go`
- Database: `npm run db:studio` (Prisma Studio)

Good luck! 🚀
