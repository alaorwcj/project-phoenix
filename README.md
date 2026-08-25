# Docker Platform - Multi-Tenant Container Orchestration

Plataforma centralizada para orquestração, monitoramento e gerenciamento de hosts, containers e serviços Docker com arquitetura multi-tenant.

## Arquitetura

```
project-phoenix/
├── control-plane/          # Backend API (Node.js/TypeScript)
│   ├── src/
│   │   ├── app.ts         # Application bootstrap
│   │   ├── config/        # Configuration management
│   │   ├── handlers/      # HTTP/gRPC request handlers
│   │   ├── services/      # Business logic layer
│   │   ├── repositories/  # Data access layer
│   │   ├── models/        # Domain models
│   │   └── middleware/    # Auth, RBAC, tenant isolation
│   ├── prisma/
│   │   └── schema.prisma  # Database schema
│   ├── proto/             # gRPC contract definitions
│   └── package.json
├── agent/                 # Host Agent (Go)
│   ├── cmd/
│   ├── internal/
│   │   ├── docker/        # Docker Engine API client
│   │   ├── grpc/          # gRPC client implementation
│   │   └── config/        # Agent configuration
│   └── go.mod
├── proto/                 # Shared Protocol Buffers
│   └── docker_platform.proto
└── docs/                  # Documentation
```

## Componentes Principais

### Control Plane
- API REST para gestão de tenants, users, environments e hosts
- Servidor gRPC para comunicação com agentes
- Banco de dados PostgreSQL com isolamento por tenant_id
- Autenticação JWT e controle de acesso baseado em papéis (RBAC)

### Host Agent
- Agente leve em Go rodando em cada host Docker
- Comunicação bidirecional via gRPC com mTLS
- Interação direta com Docker Engine API via Unix socket
- Health checks e métricas do host

## Multi-Tenancy

Todas as tabelas operacionais possuem coluna `tenant_id` para isolamento lógico:
- Tenants: Organizações/clientes isolados
- Environments: Workspaces dentro de um tenant (Dev, Staging, PRD)
- Users: Associados a tenants com papéis específicos
- Hosts: Registrados por tenant
- Containers: Gerenciados por ambiente e tenant

## Próximos Passos

1. Configurar projeto Node.js no control-plane
2. Definir schema do banco de dados
3. Implementar contratos gRPC
4. Desenvolver rotas da API REST
5. Implementar agente Go