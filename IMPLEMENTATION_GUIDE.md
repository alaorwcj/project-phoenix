# Manual de Implementação — Project Phoenix

**Versão**: 1.0  
**Data**: 2025  
**Público**: Engenheiros, Arquitetos, Contribuidores

---

## 📋 Índice

1. [Visão Geral Técnica](#visão-geral-técnica)
2. [Arquitetura de Componentes](#arquitetura-de-componentes)
3. [Estrutura de Diretórios](#estrutura-de-diretórios)
4. [Ambiente de Desenvolvimento](#ambiente-de-desenvolvimento)
5. [Fases Implementadas (1–12)](#fases-implementadas-1–12)
6. [Guia de Contribuição](#guia-de-contribuição)
7. [Troubleshooting de Desenvolvimento](#troubleshooting-de-desenvolvimento)
8. [Referências de Código](#referências-de-código)

---

## Visão Geral Técnica

**Project Phoenix** é uma plataforma multi-tenant para gerenciamento centralizado de contêineres Docker.

### Arquitetura em Camadas

```
┌─────────────────────────────────────────────────────┐
│               Dashboard (React + Vite)              │  Camada de Apresentação
└──────────────┬──────────────────────────────────────┘
               │ REST API + WebSocket
┌──────────────▼──────────────────────────────────────┐
│    Control Plane (Node.js + TypeScript)             │  Camada de Negócio
│  ├─ Autenticação (JWT)                              │
│  ├─ RBAC (Role-Based Access Control)                │
│  ├─ Job Queue (Bull/Redis)                          │
│  ├─ gRPC Server (recebe heartbeat de agentes)       │
│  └─ PostgreSQL (multi-tenant)                       │
└──────────────┬──────────────────────────────────────┘
               │ gRPC (mTLS)
┌──────────────▼──────────────────────────────────────┐
│    Host Agent (Go)                                  │  Camada de Execução
│  ├─ gRPC Server (recebe comandos do Control Plane)  │
│  ├─ Docker Engine API                               │
│  └─ Métricas de Host                                │
└──────────────────────────────────────────────────────┘
```

### Princípios de Design

- **Multi-tenancy**: Toda entidade (Containers, Hosts, Users) pertence a um Tenant. Campo `tenant_id` obrigatório em todas as tabelas operacionais.
- **Clean Architecture**: Separação clara entre handlers (HTTP), serviços (lógica), repositórios (dados) e interfaces.
- **gRPC**: Comunicação Control Plane ↔ Agent em protobuf + gRPC com suporte a mTLS.
- **Job Queue**: Processamento assíncrono de operações (iniciar/parar contêineres) com retry exponencial e dead-letter queue.
- **Observabilidade**: Logs estruturados (JSON), métricas (Prometheus), traces (W3C TraceContext).

---

## Arquitetura de Componentes

### 1. Control Plane (Node.js/TypeScript)

**Responsabilidades**:
- REST API para gerenciar tenants, usuários, ambientes, hosts, contêineres
- Banco de dados relacional (PostgreSQL) com isolamento por tenant
- Job Queue para despachar operações aos agentes
- gRPC Server para receber heartbeat e métricas dos agentes
- Autenticação JWT e RBAC

**Stack**:
- Runtime: Node.js 20+
- Framework: Fastify
- ORM: Prisma
- Job Queue: Bull (Redis)
- gRPC: @grpc/grpc-js
- Banco: PostgreSQL 15+

**Arquivos-chave**:
```
control-plane/
├─ src/
│  ├─ app.ts                  # Inicialização Fastify + gRPC + Job Queue
│  ├─ config/env.ts          # Validação de variáveis de ambiente
│  ├─ routes/                 # Handlers HTTP (REST)
│  ├─ handlers/               # Lógica de requisições HTTP
│  ├─ services/               # Lógica de negócio
│  ├─ repositories/           # Acesso a dados (Prisma)
│  ├─ lib/
│  │  ├─ jobQueue.ts         # Bull Queue initialization
│  │  ├─ jobHandlers.ts      # Job processors (dispatch to agents)
│  │  ├─ grpcAgentClient.ts  # Client pool para conectar-se aos agentes
│  │  ├─ grpcServer.ts       # gRPC server para receber heartbeat
│  │  ├─ hostHealth.ts       # Monitor de saúde dos hosts
│  │  ├─ deadLetterQueue.ts  # Gerenciamento de jobs permanentemente falhados
│  │  ├─ audit.ts            # Logging de auditoria
│  │  ├─ costTracking.ts     # Cálculo de custo por tenant
│  │  └─ secrets.ts          # Criptografia de secrets
│  ├─ models/                 # Tipos TypeScript (interfaces)
│  └─ __tests__/              # Testes de integração
├─ prisma/
│  ├─ schema.prisma          # Schema do banco (modelos)
│  ├─ migrations/            # Histórico de mudanças no schema
│  └─ seed.ts                # Dados de seed (dev)
└─ proto/                     # Protocol Buffers compartilhados com agent
```

### 2. Host Agent (Go)

**Responsabilidades**:
- gRPC Server: Recebe comandos do Control Plane (StartContainer, StopContainer, GetContainerLogs)
- gRPC Client: Registra host, envia heartbeat e métricas ao Control Plane
- Docker Engine API: Interage com Docker local

**Stack**:
- Runtime: Go 1.21+
- gRPC: google.golang.org/grpc + protobuf
- Docker: github.com/docker/docker
- Observabilidade: Prometheus metrics, structured logging

**Arquivos-chave**:
```
agent/
├─ cmd/agent/
│  └─ main.go                # Entry point: inicia server + client + heartbeat
├─ internal/
│  ├─ config/                # Carregamento de config (env vars)
│  ├─ docker/
│  │  └─ client.go           # Wrapper da Docker Engine API
│  ├─ grpc/
│  │  ├─ server.go           # gRPC server listener
│  │  ├─ handler.go          # Implementa HostAgentServiceServer
│  │  ├─ client.go           # gRPC client para Control Plane
│  │  └─ tls.go              # Carregamento de certificados TLS
│  ├─ grpcgen/               # WORKAROUND: tipos + serviço gRPC (manual protoc)
│  │  ├─ types.go            # Mensagens protobuf como structs Go
│  │  ├─ service.go          # Descriptores de serviço
│  │  └─ server_impl.go      # ServiceDesc + registrador (manual gerado)
│  ├─ logging/
│  ├─ metrics/
│  └─ trace/
└─ proto/                     # Protocol Buffers (compartilhado)
```

### 3. Dashboard (React + Vite)

**Responsabilidades**:
- Interface de usuário para gerenciar contêineres, hosts, ambientes
- Visualizar logs em tempo real
- Monitorar métricas de host
- Gerenciar dead-letter queue

**Stack**:
- Runtime: Node.js 20+
- Framework: React 18 + TypeScript
- Build: Vite
- UI: Tailwind CSS
- HTTP Client: Axios + React Query
- WebSocket: Socket.io (logs em tempo real)

**Arquivos-chave**:
```
dashboard/
├─ src/
│  ├─ App.tsx               # Root component
│  ├─ pages/
│  │  ├─ ContainersPage.tsx
│  │  ├─ HostsPage.tsx
│  │  ├─ EnvironmentsPage.tsx
│  │  ├─ DeadLetterQueuePage.tsx
│  │  └─ AuditLogsPage.tsx
│  ├─ components/            # Componentes reutilizáveis
│  └─ hooks/                 # Custom React hooks
└─ nginx.conf               # Config de reverse proxy
```

### 4. Banco de Dados (PostgreSQL)

**Modelos**:
- `tenants`: Isolamento multi-tenant
- `users`: Autenticação + RBAC
- `environments`: Dev/Staging/Prod
- `hosts`: Servidores Docker
- `containers`: Contêineres gerenciados
- `jobs`: Fila assíncrona de tarefas
- `audit_logs`: Rastreamento de ações
- `usage_events`: Dados para billing
- `container_logs`: Logs de contêineres

**Isolamento**:
- Todas as queries devem filtrar por `tenant_id`
- Índices compostos (tenant_id, resource_id) para performance
- Cascata de deleção quando um tenant é removido

---

## Estrutura de Diretórios

```
project-phoenix/
├─ control-plane/            # Node.js + TypeScript
├─ agent/                    # Go
├─ dashboard/                # React + Vite
├─ proto/                    # Protocol Buffers
├─ deploy/                   # Infraestrutura (Helm, Nginx, Monitoring)
├─ infra/                    # IaC (Terraform, CloudFormation)
├─ docs/                     # Documentação técnica
├─ scripts/                  # Utilitários de desenvolvimento
├─ docker-compose.yml        # Stack de desenvolvimento
├─ docker-compose.prod.yml   # Overrides para produção
├─ Makefile                  # Automação de tarefas
├─ ROADMAP.md               # Fases 1–12 implementadas
├─ SETUP.md                 # Instruções de setup inicial
├─ .env.example             # Template de variáveis de ambiente
└─ README.md                # Overview do projeto
```

---

## Ambiente de Desenvolvimento

### Pré-requisitos

- **Node.js**: 20+
- **Go**: 1.21+
- **Docker**: 24.0+
- **PostgreSQL**: 15+ (ou container via docker-compose)
- **Redis**: 7+ (ou container via docker-compose)
- **Make**: Para automação

### Setup Inicial

#### 1. Clone e instale dependências

```bash
git clone https://github.com/alaorwcj/project-phoenix.git
cd project-phoenix

# Instale todas as dependências
make setup
```

#### 2. Configure variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com valores de desenvolvimento
```

Valores padrão para dev:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/docker_platform
JWT_SECRET=dev-only-jwt-secret-minimum-32-chars-long!
REDIS_HOST=localhost
REDIS_PORT=6379
GRPC_PORT=50051
LOG_LEVEL=debug
TLS_ENABLED=false
```

#### 3. Inicie a stack local

```bash
# Inicia PostgreSQL + Redis em containers
make docker-up

# Aguarde a stack ficar pronta
make status
```

#### 4. Setup do banco de dados

```bash
# Gera cliente Prisma
cd control-plane
npm run db:generate

# Executa migrations
npm run db:migrate -- --name init

# Seed (dados de teste)
npm run db:seed
```

#### 5. Inicie os serviços em desenvolvimento

**Terminal 1 — Control Plane**:
```bash
make dev-control-plane
# Listening on http://localhost:3000
# Swagger docs: http://localhost:3000/docs
```

**Terminal 2 — Host Agent**:
```bash
make dev-agent
# Listening on localhost:9000 (gRPC server)
```

**Terminal 3 — Dashboard**:
```bash
make dev-dashboard
# Listening on http://localhost:5173
```

---

## Fases Implementadas (1–12)

### Visão Geral

Todas as 12 fases foram implementadas em código. Veja o `ROADMAP.md` para detalhes completos.

| Fase | Nome | Status | Componentes |
|------|------|--------|------------|
| 1 | REST API + Proto | ✅ Completo | Control Plane API, Proto types |
| 2 | gRPC + TLS | ✅ Completo | Agent gRPC server/client, mTLS |
| 3 | Container Ops | ✅ Completo | StartContainer, StopContainer, GetLogs |
| 4 | Job Queue | ✅ Completo | Bull/Redis, retry exponencial |
| 5 | Health Checks | ✅ Completo | Heartbeat loop, host status tracking |
| 6 | Dead-Letter Queue | ✅ Completo | Persistência de jobs falhados |
| 7 | Audit + Security | ✅ Completo | AuditLog, secrets encryption |
| 8 | Cost Tracking | ✅ Completo | Usage events, billing calculation |
| 9 | Observabilidade | ✅ Completo | Prometheus, structured logs, traces |
| 10 | Resource Manager | ✅ Completo | CPU/Memory/Disk reservation |
| 11 | React Dashboard | ✅ Completo | SPA, container management, logs |
| 12 | Integration Tests | ✅ Completo | E2E tests, control plane + agent |

### Exemplos por Fase

**Fase 1: REST API**
```typescript
// control-plane/src/routes/containers.ts
POST /api/containers
  Cria container no banco (status=PENDING)
  Enfileira job type="container:start"

GET /api/containers/:id
  Retorna container com tenant_id check
```

**Fase 3: Container Operations**
```typescript
// control-plane/src/lib/jobHandlers.ts
async function handleContainerStart(job: Job) {
  const container = await getContainer(job.containerId);
  
  // Despacha via gRPC ao agent responsável
  const response = await grpcAgentClient.startContainer({
    command_id: uuid(),
    host_id: container.hostId,
    container_id: container.dockerId,
  });
  
  if (response.success) {
    await updateContainer(container.id, { status: 'RUNNING' });
  } else {
    throw new Error(response.message);
  }
}
```

**Fase 4: Job Queue com Retry**
```typescript
// control-plane/src/lib/jobQueue.ts
const queue = new Queue('container-ops', redisUrl);

queue.process(3, async (job: Job) => {
  try {
    await handleJob(job);
  } catch (error) {
    if (job.attemptsMade < job.opts.attempts) {
      const delay = Math.pow(2, job.attemptsMade) * 1000; // exponential backoff
      throw job.updateProgress({ delay });
    } else {
      // Mover para dead-letter queue
      await deadLetterQueue.enqueue(job);
    }
  }
});
```

---

## Guia de Contribuição

### Branch Strategy

- `main`: Production-ready
- `develop`: Integration branch
- `feature/*`: Novas funcionalidades
- `bugfix/*`: Correções
- `hotfix/*`: Emergências

### Workflow

1. **Crie uma branch**:
   ```bash
   git checkout -b feature/sua-feature
   ```

2. **Faça as mudanças**:
   - Mantenha commits pequenos e bem descritos
   - Prefira features isoladas

3. **Teste localmente**:
   ```bash
   make validate  # Build + tests
   ```

4. **Faça push e abra PR**:
   ```bash
   git push origin feature/sua-feature
   # Abra PR no GitHub
   ```

5. **Código review + merge**:
   - Mínimo 1 aprovação
   - CI/CD deve passar
   - Squash merge para main

### Padrões de Código

#### TypeScript (Control Plane + Dashboard)

```typescript
// Sempre use tipos explícitos
interface CreateContainerDTO {
  tenantId: string;
  hostId: string;
  image: string;
  name: string;
  environment?: Record<string, string>;
}

// Separe responsabilidades: handlers → services → repositories
async function handleCreateContainer(req: FastifyRequest, reply: FastifyReply) {
  const dto = validateRequestBody<CreateContainerDTO>(req.body);
  const container = await containerService.create(dto);
  reply.code(201).send(container);
}

// Sempre isole por tenant
async function getContainer(tenantId: string, containerId: string) {
  return prisma.container.findUniqueOrThrow({
    where: {
      id: containerId,
      tenantId, // ← Critério obrigatório
    },
  });
}
```

#### Go (Agent)

```go
// Sempre use contexto para cancelamento e timeouts
func (h *Handler) StartContainer(ctx context.Context, req *pb.StartContainerRequest) (*pb.ContainerActionResponse, error) {
  ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
  defer cancel()
  
  container, err := h.dockerClient.Start(ctx, req.ContainerId)
  if err != nil {
    return &pb.ContainerActionResponse{
      Success: false,
      Message: fmt.Sprintf("Failed to start container: %v", err),
    }, nil
  }
  
  return &pb.ContainerActionResponse{
    Success:     true,
    ContainerId: container.ID,
  }, nil
}

// Use interfaces para testabilidade
type DockerClient interface {
  Start(ctx context.Context, containerID string) (*types.Container, error)
  Stop(ctx context.Context, containerID string, timeout *time.Duration) error
}
```

### Testes

#### Control Plane

```bash
# Testes unitários + integração
cd control-plane
npm test

# Cobertura
npm test -- --coverage
```

Exemplo de teste:
```typescript
// control-plane/src/__tests__/containers.test.ts
describe('Container Handlers', () => {
  it('should create a container for a tenant', async () => {
    const tenantId = uuid();
    const hostId = uuid();
    
    const container = await containerService.create({
      tenantId,
      hostId,
      image: 'nginx:latest',
      name: 'test-container',
    });
    
    expect(container.tenantId).toBe(tenantId);
    expect(container.name).toBe('test-container');
  });
});
```

#### Agent

```bash
# Testes unitários com coverage
cd agent
go test ./... -v -coverprofile=coverage.out
go tool cover -html=coverage.out
```

---

## Troubleshooting de Desenvolvimento

### Problema: "Cannot find module '@grpc/grpc-js'"

**Causa**: Dependências não instaladas  
**Solução**:
```bash
cd control-plane
npm ci  # Clean install
npm run db:generate
```

### Problema: "Error: connect ECONNREFUSED 127.0.0.1:5432"

**Causa**: PostgreSQL não está rodando  
**Solução**:
```bash
docker-compose up -d postgres
docker-compose exec postgres pg_isready
```

### Problema: "gRPC service descriptor not found"

**Causa**: Workaround de protoc no Windows causou tipos incompletos  
**Solução**: Regerar tipos (quando protoc for atualizado):
```bash
cd agent
protoc --go_out=. --go-grpc_out=. ../proto/docker_platform.proto
```

### Problema: "Agent fails to register with Control Plane"

**Causa**: Credenciais gRPC mTLS inválidas ou porte incorreto  
**Solução**:
```bash
# Verificar se Control Plane está pronto
curl http://localhost:3000/health

# Verificar logs do agent
RUST_LOG=debug make dev-agent

# Verificar conectividade gRPC
grpcurl -plaintext localhost:50051 list
```

### Problema: "Docker socket permission denied"

**Causa**: Agent não tem permissão para `/var/run/docker.sock`  
**Solução**:
```bash
# Em Linux
sudo usermod -aG docker $USER
newgrp docker

# Em Docker-in-Docker
# Mude DOCKER_HOST para tcp://docker:2375 (sem TLS para dev)
```

---

## Referências de Código

### Configuração

- `control-plane/src/config/env.ts`: Schema de variáveis de ambiente (Zod)
- `agent/internal/config/config.go`: Carregamento de config do agent

### Banco de Dados

- `control-plane/prisma/schema.prisma`: Schema Prisma com isolamento multi-tenant
- `control-plane/prisma/migrations/`: Histórico de migrações

### gRPC

- `proto/docker_platform.proto`: Definição de serviços (RegisterHost, Heartbeat, StartContainer, StopContainer, GetContainerLogs)
- `control-plane/src/lib/grpcServer.ts`: gRPC server que recebe heartbeat
- `control-plane/src/lib/grpcAgentClient.ts`: Pool de clientes gRPC
- `agent/internal/grpc/handler.go`: Implementação de HostAgentServiceServer
- `agent/internal/grpc/server.go`: Listener gRPC do agent

### Job Queue

- `control-plane/src/lib/jobQueue.ts`: Inicialização Bull queue
- `control-plane/src/lib/jobHandlers.ts`: Processors (dispatch via gRPC)
- `control-plane/src/lib/deadLetterQueue.ts`: Persistência de jobs falhados

### Observabilidade

- `control-plane/src/lib/logger.ts`: Logger estruturado (Pino JSON)
- `control-plane/src/lib/metrics.ts`: Métricas Prometheus
- `control-plane/src/lib/trace.ts`: W3C TraceContext para correlation
- `agent/internal/metrics/metrics.go`: Prometheus metrics no agent

### Autenticação

- `control-plane/src/middleware/auth.ts`: Middleware JWT
- `control-plane/src/lib/secrets.ts`: Criptografia de secrets (AES-256)

### Testes

- `control-plane/src/__tests__/`: Testes de integração
- `agent/internal/.../.*_test.go`: Testes unitários Go

---

## Próximos Passos

1. **Ler o ROADMAP.md** para ver cada fase em detalhes
2. **Explorar os testes** para entender o comportamento esperado
3. **Fazer primeira contribuição** (bug fix ou feature pequena)
4. **Revisar PRs de colegas** para aprender padrões do projeto

---

**Última atualização**: 2025-01-14  
**Mantido por**: Equipe de Arquitetura
