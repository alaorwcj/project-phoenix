# Docker Platform - Multi-Tenant Container Orchestration

Plataforma centralizada para orquestração, monitoramento e gerenciamento de hosts, containers e serviços Docker com arquitetura multi-tenant, autenticação JWT, RBAC e comunicação gRPC bidirecional.

## ⚡ Status de Implementação

| Componente | Status | Detalhes |
|-----------|--------|----------|
| **REST API** | ✅ Completo | JWT auth, RBAC (ADMIN/OPERATOR/VIEWER), multi-tenant isolation |
| **gRPC Server** | ✅ Completo | RegisterHost, Heartbeat, Container ops (stubs) |
| **Proto Types** | ✅ Completo | TypeScript e Go (manual, sem protoc) |
| **Go Agent** | ✅ Completo | Config, Docker client (extended), gRPC client, heartbeat loop |
| **Database** | ✅ Completo | Tenant, User, Environment, Host, Container, ContainerLog, Job models |
| **Container Operations** | ✅ Fase 5 | StartContainer, StopContainer, GetContainerLogs com lifecycle tracking |
| **Job Queue** | ✅ Fase 6 | Bull + Redis para async operations com retry e progress tracking |
| **Integration Tests** | ✅ Completo | Tenants, hosts, containers, job queue, isolation verification |

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────┐
│        REST API (Fastify + TypeScript)      │
│  JWT → RBAC → Handlers → Services → Repos   │
└────────────────────┬────────────────────────┘
                     │
         ┌───────────┴────────────┐
         ▼                        ▼
    [REST Routes]          [gRPC Server:50051]
    (Multi-tenant)         (Host Agent Service)
         │                        │
         └───────────┬────────────┘
                     ▼
            [Prisma + PostgreSQL]
      (Tenants, Users, Hosts, Envs)
                     ▲
                     │ ◄─────┐
              ┌──────┴──────┐ │
              │   Control   │ │
              │   Plane     │ │
              └──────┬──────┘ │
                     │        │
            ┌────────▼────────┘
            │
     ┌──────▼──────────┐
     │  Host Agent(s)  │
     │    (Go Binary)  │
     ├─────────────────┤
     │  Docker Client  │
     │  Container Ops  │
     │  Metrics        │
     └─────────────────┘
```

## 📁 Estrutura do Projeto

```
project-phoenix/
├── control-plane/               # Backend (Node.js/TypeScript + Fastify)
│   ├── src/
│   │   ├── app.ts              # Bootstrap REST + gRPC
│   │   ├── config/             # Env vars, database, JWT secrets
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT Bearer token validation
│   │   │   └── rbac.ts         # Role-based access control
│   │   ├── handlers/
│   │   │   ├── tenantHandlers.ts
│   │   │   ├── environmentHandlers.ts
│   │   │   └── hostHandlers.ts
│   │   ├── services/           # Business logic
│   │   ├── repositories/       # Prisma queries + tenant filtering
│   │   ├── routes/
│   │   │   └── api.ts          # Route registry with auth/RBAC hooks
│   │   ├── lib/
│   │   │   └── grpcServer.ts   # gRPC server (proto loading + handlers)
│   │   ├── proto/
│   │   │   └── docker_platform.ts  # Generated TypeScript types
│   │   └── types/
│   │       └── auth.ts         # Fastify request augmentation
│   ├── prisma/
│   │   └── schema.prisma       # Multi-tenant data models
│   └── package.json
│
├── agent/                       # Host Agent (Go)
│   ├── cmd/
│   │   └── agent/
│   │       └── main.go         # Agent entry point
│   ├── internal/
│   │   ├── config/
│   │   │   └── config.go       # Env-based configuration
│   │   ├── docker/
│   │   │   └── client.go       # Docker Engine API wrapper
│   │   ├── grpc/
│   │   │   └── client.go       # gRPC client to Control Plane
│   │   └── grpcgen/            # Generated proto types
│   │       ├── types.go        # Message types
│   │       ├── service.go      # Service interfaces
│   │       ├── mock_client.go  # Testing support
│   │       └── http_client.go  # Dev transport (non-gRPC)
│   ├── go.mod
│   └── .env.example
│
├── proto/
│   └── docker_platform.proto   # gRPC service contract
│
├── docker-compose.yml          # PostgreSQL + development stack
├── README.md                   # This file
└── docs/                       # Architecture, API, setup guides
```

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- PostgreSQL 16
- Docker (para agente)
- Go 1.21+ (para compilar agente)

### Control Plane Setup

```bash
cd control-plane

# 1. Instalar dependências
npm install

# 2. Configurar banco de dados
cp .env.example .env
# Editar .env com conexão PostgreSQL

# 3. Gerar migrations
npx prisma migrate dev --name init

# 4. Seed data (default tenant + test user)
npx prisma db seed

# 5. Iniciar servidor
npm run dev
```

**REST API**: http://localhost:3000
**gRPC Server**: localhost:50051

### Host Agent Setup

```bash
cd agent

# 1. Configurar ambiente
cp .env.example .env
# Editar .env:
#   CONTROL_PLANE_ADDR=localhost:50051
#   AGENT_ID=agent-001
#   DOCKER_HOST=unix:///var/run/docker.sock

# 2. Compilar (requer Go)
go build -o bin/agent ./cmd/agent

# 3. Executar
./bin/agent
```

## 🔐 Autenticação & Autorização

### JWT Token Structure
```typescript
{
  sub: "user-id",          // User identifier
  tenantId: "tenant-id",   // Tenant organization
  role: "ADMIN",           // Role: ADMIN | OPERATOR | VIEWER
  iat: 1234567890,
  exp: 1234571490
}
```

### RBAC Hierarchy
```
ADMIN (1)     ≥ (can perform any action)
OPERATOR (2)  ≥ (can manage containers)
VIEWER (3)    ≥ (read-only access)
```

### Exemplo de Requisição Autenticada
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3000/api/tenants
```

## 📡 gRPC Contrato (docker_platform.proto)

### Serviço: HostAgentService

| RPC | Request | Response | Status |
|-----|---------|----------|--------|
| **RegisterHost** | RegisterHostRequest | RegisterHostResponse | ✅ Impl |
| **Heartbeat** | HeartbeatRequest | HeartbeatResponse | ✅ Impl |
| **StartContainer** | StartContainerRequest | ContainerActionResponse | ✅ Phase 5 |
| **StopContainer** | StopContainerRequest | ContainerActionResponse | ✅ Phase 5 |
| **GetContainerLogs** | GetContainerLogsRequest | stream ContainerLogEntry | ✅ Phase 5 |
| **Job Queue** | - | - | ✅ Phase 6 |

### Mensagens Principais

**RegisterHostRequest**
```protobuf
{
  agent_id: string           // Unique agent identifier
  hostname: string           // Host name
  docker_version: string     // Docker version
  operating_system: string   // OS (linux, windows, darwin)
  architecture: string       // CPU arch (amd64, arm64)
  labels: map<string, string>
}
```

**HeartbeatRequest**
```protobuf
{
  host_id: string
  agent_id: string
  metrics: HostMetrics       // CPU, memory, containers
  observed_at: Timestamp
}
```

**HostMetrics**
```protobuf
{
  cpu_percent: double
  memory_used_bytes: uint64
  memory_total_bytes: uint64
  running_containers: uint32
}
```

## 🔄 Fluxo de Comunicação

### Host Registration
```
1. Agent startup
   └─> Agent.RegisterHost(agentId, hostname, dockerVersion)
       └─> ControlPlane.gRPC.RegisterHost()
           ├─> Create Host record (status=PENDING)
           └─> Return hostId, tenantId
2. Agent stores hostId for future heartbeats
```

### Heartbeat Loop
```
1. Agent starts ticker (default: 30s interval)
2. Every tick:
   └─> GetMetrics() from Docker daemon
       └─> SendHeartbeat(hostId, metrics, timestamp)
           └─> ControlPlane.gRPC.Heartbeat()
               ├─> Update lastHeartbeat timestamp
               ├─> Update status to ONLINE
               ├─> Store metrics JSON
               └─> Return pending commands (if any)
3. Agent processes pending commands (TODO: job queue)
```

## 🗄️ Database Schema

### Tabelas Multi-Tenant

```sql
-- Organizações
CREATE TABLE Tenant (
  id UUID PRIMARY KEY,
  name STRING,
  created_at TIMESTAMP
);

-- Usuários por tenant
CREATE TABLE User (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES Tenant,
  email STRING UNIQUE(tenant_id, email),
  password_hash STRING,
  role ENUM(ADMIN, OPERATOR, VIEWER),
  UNIQUE(tenant_id, email)
);

-- Ambientes (Dev, Staging, Prod)
CREATE TABLE Environment (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES Tenant,
  name STRING,
  slug STRING UNIQUE(tenant_id, slug),
  description TEXT,
  variables JSON -- Env vars per environment
);

-- Hosts registrados (servidores com Docker)
CREATE TABLE Host (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES Tenant,
  agent_id STRING UNIQUE(tenant_id, agent_id),
  hostname STRING,
  status ENUM(PENDING, ONLINE, OFFLINE),
  docker_version STRING,
  last_heartbeat TIMESTAMP,
  metadata JSON -- OS, arch, labels
);
```

**Princípio Multi-Tenant**: Todas as queries filtram por `tenant_id` derivado do JWT. FK constraints garantem integridade referencial.

## ⚠️ Itens Pendentes

### 1. **Protoc Code Generation** (BLOQUEADOR)
```bash
# Node.js (TypeScript)
protoc --ts_proto_out=./control-plane/src/proto \
  --plugin=protoc-gen-ts_proto=./control-plane/node_modules/.bin/protoc-gen-ts_proto \
  ./proto/docker_platform.proto

# Go
protoc --go_out=. --go-grpc_out=. ./proto/docker_platform.proto
```
**Status**: Tipos manuais criados como workaround; protoc Windows issues pendentes

### 2. **Database Migration**
```bash
cd control-plane
npx prisma migrate dev --name init
```
**Status**: Schema pronto; migration não criada

### 3. **Agent Authentication** (Segurança)
- Atual: agentId como identificador opaco
- TODO: mTLS + JWT token entre agent ↔ control-plane

### 4. **Container Operation Queueing** (Funcional)
- StartContainer/StopContainer: stubs apenas
- TODO: Redis job queue com retry logic

### 5. **Metrics Aggregation** (Analytics)
- Heartbeat armazena JSON bruto
- TODO: Time-series database (InfluxDB/TimescaleDB) para analytics

### 6. **Integration Tests** (QA)
```bash
npm run test:integration
```
- Verificar fluxo completo: registration → heartbeat → container ops

## 📊 Evolução Histórica

| PR | Título | Commits | Status |
|----|--------|---------|--------|
| #1 | Platform Foundation + proto contracts | 2 | ✅ Merged |
| #3 | Foundation rebase | - | ✅ Merged |
| #4 | REST API + JWT + RBAC | 1 | ✅ Merged |
| #5 | Go Host Agent | 1 | ✅ Merged |
| #6 | gRPC Server Implementation | 1 | ✅ Merged |
| #7 | Proto Types Generation | 1 | ✅ Merged |
| #9 | Phase 4-5-6: Database, Containers, Job Queue | 2 | 🔄 Open |

## 🔗 Referências

- [Prisma Multi-Tenancy Pattern](https://www.prisma.io/docs/concepts/components/prisma-schema/multi-tenancy)
- [gRPC Go Quickstart](https://grpc.io/docs/languages/go/quickstart/)
- [Docker Engine API](https://docs.docker.com/engine/api/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)

## 📝 Notas de Desenvolvimento

### Local Testing (sem Docker)
1. Mock gRPC client em `agent/internal/grpcgen/mock_client.go`
2. HTTP adapter em `agent/internal/grpcgen/http_client.go` para dev

### Production Deployment (TODO)
1. mTLS certificates para gRPC
2. JWT secret rotation
3. Database encrypted backups
4. Agent autoscaling via Kubernetes

## 📧 Contato

Para questões sobre arquitetura ou contribuições, abra uma issue ou PR.