# Manual Operacional — Project Phoenix

**Versão**: 1.0  
**Data**: 2025  
**Público**: DevOps, SREs, Operadores, Administradores

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura de Produção](#arquitetura-de-produção)
3. [Pré-requisitos de Infraestrutura](#pré-requisitos-de-infraestrutura)
4. [Deploy em Docker Compose](#deploy-em-docker-compose)
5. [Deploy em Kubernetes](#deploy-em-kubernetes)
6. [Operações Diárias](#operações-diárias)
7. [Monitoramento e Alertas](#monitoramento-e-alertas)
8. [Troubleshooting Operacional](#troubleshooting-operacional)
9. [Disaster Recovery](#disaster-recovery)
10. [SLOs e Limites](#slos-e-limites)
11. [Runbooks](#runbooks)

---

## Visão Geral

**Project Phoenix** é uma plataforma multi-tenant para gerenciar contêineres Docker em escala.

### Componentes Principais

| Componente | Tecnologia | Propósito | Port |
|------------|-----------|----------|------|
| **Control Plane** | Node.js 20+ | REST API + gRPC server | 3000 (HTTP), 50051 (gRPC) |
| **Host Agent** | Go 1.21+ | Execução de comandos Docker | 9000 (gRPC server) |
| **Dashboard** | React 18 | Interface de usuário | 8080 (HTTP) |
| **PostgreSQL** | 15+ | Banco de dados relacional | 5432 |
| **Redis** | 7+ | Job queue (Bull) | 6379 |
| **Prometheus** | 2.40+ | Métricas | 9090 |
| **Grafana** | 10+ | Dashboards | 3001 |

### Fluxo de Operação

```
Usuário (Dashboard)
    ↓
REST API (Control Plane: 3000)
    ↓
Job Queue (Redis 6379)
    ↓
Job Processor (Bull Queue)
    ↓
gRPC Client → Host Agent (gRPC 50051)
    ↓
Host Agent gRPC Server (9000)
    ↓
Docker Engine API
    ↓
Contêiner executado no Docker
```

---

## Arquitetura de Produção

### Stack Local (Docker Compose)

```yaml
services:
  postgres:          # Database (5432)
  redis:             # Job queue (6379)
  control-plane:     # REST + gRPC server (3000, 50051)
  agent:             # Docker agent (9000)
  dashboard:         # Web UI (8080)
  nginx:             # Reverse proxy + TLS (80, 443)
  prometheus:        # Metrics collection (9090)
  grafana:           # Dashboards (3001)
```

### Topologia Multi-Host

```
Load Balancer (nginx/Traefik)
    ↓
┌─────────────────────────────────┐
│ Kubernetes Cluster              │
├─────────────────────────────────┤
│ Pod: control-plane              │  × 3 replicas
│ Pod: agent                       │  × N (um por nó Docker)
│ Pod: dashboard                  │  × 2 replicas
│ StatefulSet: postgres           │  × 1 (replicação ativa/passiva)
│ StatefulSet: redis              │  × 1 (Redis Cluster opcional)
└─────────────────────────────────┘
    ↓
    ├─ Docker Host 1 (agent pod)
    ├─ Docker Host 2 (agent pod)
    └─ Docker Host N (agent pod)
```

---

## Pré-requisitos de Infraestrutura

### Mínimo (POC/Dev)

- 2 CPUs
- 4 GB RAM
- 20 GB SSD
- Docker 24.0+
- Docker Compose 2.0+

### Recomendado (Produção)

- 8 CPUs
- 32 GB RAM
- 100 GB SSD (escalável)
- Kubernetes 1.25+
- PostgreSQL 15+ (managed ou self-hosted)
- Redis 7+ (managed ou self-hosted com replicação)
- Prometheus + Grafana
- Load balancer (nginx, Traefik, AWS ALB, etc)

### Rede

- Controle Plane ↔ Host Agents: mTLS em porta gRPC (50051)
- Usuários ↔ Dashboard: HTTPS (443)
- Prometheus ↔ Componentes: HTTP interno (9090)

---

## Deploy em Docker Compose

### 1. Prepare Environment

```bash
git clone https://github.com/alaorwcj/project-phoenix.git
cd project-phoenix

# Copy e edite com senhas reais
cp .env.example .env
```

**Conteúdo do `.env` para produção**:

```env
# Database
POSTGRES_PASSWORD=your-strong-password-min-32-chars
DATABASE_URL=postgresql://postgres:your-strong-password-min-32-chars@postgres:5432/docker_platform

# Redis
REDIS_PASSWORD=your-strong-redis-password

# API
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars-long-here
NODE_ENV=production
PORT=3000
GRPC_PORT=50051
LOG_LEVEL=warn

# TLS
TLS_ENABLED=true
TLS_CERT_PATH=/etc/tls/control-plane/cert.pem
TLS_KEY_PATH=/etc/tls/control-plane/key.pem
TLS_CA_PATH=/etc/tls/ca/ca.pem

# Agent
AGENT_ID=agent-prod-001
CONTROL_PLANE_URL=control-plane:50051
```

### 2. Generate TLS Certificates

```bash
# Linux/macOS
./scripts/generate-certs.sh

# Windows PowerShell
.\scripts\generate-certs.ps1
```

Certificados serão salvos em `deploy/certs/`.

### 3. Start Stack

```bash
# Full production stack
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verify services
docker-compose ps
```

**Esperado**:
```
NAME                      STATUS              PORTS
docker-platform-postgres  Up (healthy)        5432
docker-platform-redis     Up (healthy)        6379
docker-platform-control-plane Up (healthy)   3000, 50051
docker-platform-agent     Up                  9000
docker-platform-dashboard Up                  8080
docker-platform-nginx     Up                  80, 443
```

### 4. Verify Health

```bash
# Health check
curl http://localhost:3000/api/health

# Swagger docs
curl http://localhost:3000/docs

# Metrics
curl http://localhost:3000/metrics | head -20

# Dashboard
open http://localhost:8080
```

### 5. Create Initial Tenant

```bash
# Login com credenciais padrão
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.local","password":"admin123456"}' | jq -r '.token')

# Criar novo tenant
curl -X POST http://localhost:3000/api/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"MyTenant","slug":"mytenant"}'
```

---

## Deploy em Kubernetes

### 1. Prepare Namespace

```bash
kubectl create namespace docker-platform
```

### 2. Create Secrets

```bash
# Database password
kubectl create secret generic postgres-secret \
  --from-literal=password=your-strong-password \
  -n docker-platform

# Redis password
kubectl create secret generic redis-secret \
  --from-literal=password=your-strong-redis-password \
  -n docker-platform

# JWT secret
kubectl create secret generic jwt-secret \
  --from-literal=secret=your-super-secret-jwt-key-min-32-chars \
  -n docker-platform

# mTLS certificates
kubectl create secret tls grpc-tls \
  --cert=deploy/certs/control-plane-cert.pem \
  --key=deploy/certs/control-plane-key.pem \
  -n docker-platform

kubectl create secret generic ca-cert \
  --from-file=ca.pem=deploy/certs/ca.pem \
  -n docker-platform
```

### 3. Deploy Helm Chart

```bash
cd deploy/helm/docker-platform

# Customize values.yaml
vim values.yaml

# Install
helm install docker-platform . \
  --namespace docker-platform \
  -f values.yaml

# Verify
kubectl get pods -n docker-platform
kubectl get svc -n docker-platform
```

### 4. Expose Services

```bash
# Port-forward para teste local
kubectl port-forward -n docker-platform svc/control-plane 3000:3000 &
kubectl port-forward -n docker-platform svc/dashboard 8080:8080 &

# Ou configure Ingress
kubectl apply -f deploy/helm/docker-platform/ingress.yaml
```

---

## Operações Diárias

### Health Checks

```bash
# Control Plane
curl http://localhost:3000/api/health

# Agents (via Control Plane)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/hosts

# Database
kubectl exec -it postgres-0 -- pg_isready -U postgres

# Redis
kubectl exec -it redis-0 -- redis-cli ping
```

### Logs

```bash
# Docker Compose
docker-compose logs -f control-plane
docker-compose logs -f agent

# Kubernetes
kubectl logs -f deployment/control-plane -n docker-platform
kubectl logs -f daemonset/agent -n docker-platform

# Search logs
kubectl logs -n docker-platform --all-containers=true | grep ERROR
```

### Metrics

```bash
# Prometheus endpoint
curl http://localhost:9090/api/v1/query?query=container_count

# Key metrics to monitor
- http_requests_total (API request count)
- http_request_duration_seconds (API latency)
- grpc_operations_total (gRPC operations)
- job_queue_size (pending jobs)
- host_status (agent health)
- container_count (total containers)
- db_connection_pool_used (database connections)
```

### Container Lifecycle

```bash
# Start container (via API)
curl -X POST http://localhost:3000/api/containers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId":"...",
    "hostId":"...",
    "image":"nginx:latest",
    "name":"my-container"
  }'

# Stop container
curl -X POST http://localhost:3000/api/containers/{id}/stop \
  -H "Authorization: Bearer $TOKEN"

# Get logs
curl -N http://localhost:3000/api/containers/{id}/logs \
  -H "Authorization: Bearer $TOKEN"
```

### Database Backups

```bash
# Automated backup (cron)
0 2 * * * /project-phoenix/deploy/database/backup.sh

# Manual backup
./deploy/database/backup.sh

# Backup files
ls -la backups/

# Restore from backup
./deploy/database/restore-pitr.sh backups/docker_platform-2025-01-15-020000.sql.gz

# Point-in-time recovery
./deploy/database/restore-pitr.sh --pitr "2025-01-15 14:30:00 UTC"
```

### User and Tenant Management

```bash
# Create tenant
curl -X POST http://localhost:3000/api/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Tenant1","slug":"tenant1"}'

# List tenants
curl http://localhost:3000/api/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Create user in tenant
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "tenantId":"...",
    "email":"user@tenant.com",
    "password":"strong-password",
    "name":"User Name",
    "role":"OPERATOR"
  }'

# Change role
curl -X PATCH http://localhost:3000/api/users/{id} \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"role":"ADMIN"}'
```

---

## Monitoramento e Alertas

### Prometheus Scrape Targets

```yaml
# Arquivo: deploy/monitoring/prometheus.yaml
scrape_configs:
  - job_name: 'control-plane'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s
  
  - job_name: 'agents'
    # Autodiscover via DNS/Consul
    scrape_interval: 30s
  
  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

### Key Metrics

| Métrica | Descrição | Alerta |
|---------|-----------|--------|
| `http_requests_total` | Total de requisições HTTP | Aumento anormal |
| `http_request_duration_seconds` | Latência de requisições | p99 > 2s |
| `grpc_operations_total` | Total de ops gRPC | Taxa de erro > 5% |
| `job_queue_size` | Jobs pendentes | > 50 jobs |
| `host_status` | Status do agent | = OFFLINE |
| `container_count` | Contêineres ativos | Tendência |
| `db_connections_used` | Conexões PostgreSQL | > 180/200 |
| `redis_used_memory` | Memória Redis | > 80% |

### Alert Rules

```yaml
# deploy/monitoring/prometheus-alerts.yaml
groups:
  - name: critical
    rules:
      - alert: HighAPIErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        annotations:
          summary: "API error rate > 5%"
      
      - alert: HostOffline
        expr: host_status{status="OFFLINE"}
        for: 2m
        annotations:
          summary: "Host agent offline > 2 min"
```

### Grafana Dashboards

Dashboards pré-configurados:
- `Control Plane Overview`: Request rates, latency, errors
- `Hosts Health`: Agent status, CPU/memory usage
- `Container Lifecycle`: Start/stop rates, running count
- `Job Queue`: Pending jobs, failure rate
- `Database`: Connections, query performance, replication

---

## Troubleshooting Operacional

### Problema: Control Plane não inicia

```bash
# Verificar logs
docker-compose logs control-plane | tail -50

# Verificar dependências
docker-compose ps postgres redis

# Checar porta em uso
lsof -i :3000

# Verificar variáveis de ambiente
docker-compose config | grep DATABASE_URL
```

**Soluções comuns**:
- PostgreSQL não está pronto: aguarde health check
- DATABASE_URL inválida: verifique .env
- Porta 3000 em uso: libere a porta ou mude PORT

### Problema: Agent não registra com Control Plane

```bash
# Verificar logs do agent
docker-compose logs agent | tail -50

# Verificar conectividade gRPC
grpcurl -plaintext localhost:50051 list

# Verificar firewall
netstat -an | grep 50051

# Teste mTLS
openssl s_client -connect localhost:50051 -cert client.pem -key client-key.pem -CAfile ca.pem
```

**Soluções comuns**:
- Control Plane não está rodando: verifique docker-compose ps
- gRPC port bloqueado: libere a porta ou mude GRPC_PORT
- Certificados TLS inválidos: regere com scripts/generate-certs.sh

### Problema: Job queue backup

```bash
# Verificar tamanho da fila
redis-cli LLEN bull:container-ops:wait

# Verificar jobs falhados
redis-cli LLEN bull:container-ops:failed

# Limpar jobs antigos
redis-cli LTRIM bull:container-ops:completed 0 1000

# Inspecionar job específico
redis-cli HGETALL bull:container-ops:<job-id>
```

**Soluções**:
- Aumentar workers: scale up replicas de control-plane
- Verificar agentes: alertas de hosts OFFLINE
- Conferir logs de container operations: kubectl logs -f job-processor

### Problema: Database lenta

```bash
# Conexões ativas
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Queries lentas
psql -U postgres -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5;"

# Índices faltando
psql -U postgres -c "\di" docker_platform

# Vacuum/Analyze
psql -U postgres -d docker_platform -c "VACUUM ANALYZE;"
```

**Soluções**:
- Aumentar pool de conexões: DATABASE_POOL_SIZE
- Criar índices: `PRAGMA ANALYZE` ou Prisma schema updates
- Limpar logs antigos: DELETE FROM container_logs WHERE timestamp < NOW() - INTERVAL '30 days'

### Problema: Dashboard não carrega

```bash
# Verificar logs do nginx
docker-compose logs nginx

# Verificar API proxy
curl -v http://localhost:8080/api/health

# Verificar build
docker-compose logs dashboard

# Reconstrói
docker-compose build dashboard
docker-compose up -d dashboard
```

---

## Disaster Recovery

### Backup Strategy

**RPO (Recovery Point Objective)**: 1 hora  
**RTO (Recovery Time Objective)**: 15 minutos

#### Database Backups

```bash
# Nightly backups (cron: 2 AM)
0 2 * * * /project-phoenix/deploy/database/backup.sh

# Backup script
#!/bin/bash
DATE=$(date +%Y-%m-%d-%H%M%S)
pg_dump -U postgres docker_platform | gzip > backups/docker_platform-$DATE.sql.gz
# Upload to S3 or external storage
aws s3 cp backups/docker_platform-$DATE.sql.gz s3://backups/
```

#### Point-in-Time Recovery (PITR)

```bash
# Habilitar archive_mode em postgresql.conf
archive_mode = on
archive_command = 'test ! -f /backup/wal_archive/%f && cp %p /backup/wal_archive/%f'

# Restaurar para ponto específico
./deploy/database/restore-pitr.sh --pitr "2025-01-15 14:30:00 UTC"
```

### Failover Procedure

#### PostgreSQL

```bash
# 1. Demote primary (read-only)
ALTER SYSTEM SET default_transaction_read_only = on;
SELECT pg_ctl('restart', 'fast');

# 2. Promote replica
SELECT pg_promote();

# 3. Update connection strings
DATABASE_URL=postgresql://postgres:pass@new-primary:5432/docker_platform

# 4. Restart services
docker-compose restart control-plane
```

#### Host Agent

```bash
# 1. Detectar agente offline
Agent X (ID: abc) → status = OFFLINE (heartbeat missing 2+ min)

# 2. Notificar operador
Alert: HostOffline{host_id: X}

# 3. Migrar contêineres
GET /api/hosts/{X}/migration-targets → [Host Y, Host Z]
POST /api/containers/{cid}/migrate {targetHostId: Y}

# 4. Registrar novo agente
- Replace Docker host or reinstall
- Start agent com mesmo AGENT_ID
- Agent reconnects e re-registra
```

### Restore from Backup

```bash
# 1. Stop services
docker-compose down

# 2. Restore database
./deploy/database/restore-pitr.sh backups/docker_platform-2025-01-15-020000.sql.gz

# 3. Restart
docker-compose up -d

# 4. Verify
curl http://localhost:3000/api/health
docker-compose exec postgres psql -U postgres -d docker_platform -c "SELECT COUNT(*) FROM containers;"
```

---

## SLOs e Limites

### Service Level Objectives

| SLO | Target | Medição |
|-----|--------|---------|
| **Availability** | 99.5% | Uptime / período mensal |
| **Error Rate** | < 0.5% | 5xx errors / total requests |
| **Latency p99** | < 5s | HTTP request duration |
| **Latency p50** | < 200ms | HTTP request duration |

### Performance Baselines

| Métrica | Limite | Ação |
|---------|--------|------|
| API latency p99 | > 5s | Scale up control-plane replicas |
| Job queue backlog | > 50 | Increase job workers |
| Database connections | > 180/200 | Investigate slow queries |
| Agent heartbeat loss | > 2 min | Alert + failover |
| Redis memory | > 80% | Clean old data or scale |
| Disk usage | > 85% | Archive logs or expand |

### Scaling Guidelines

```yaml
# Horizontal scaling (Kubernetes)
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi

autoscaling:
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 75
```

---

## Runbooks

### Runbook 1: Emergency Restart

**Situação**: Control Plane ou Agent travados  
**RTO**: 5 minutos

```bash
# 1. Identify failed component
docker-compose ps | grep -v "Up"

# 2. Restart component
docker-compose restart control-plane
# ou
docker-compose restart agent

# 3. Verify recovery
curl http://localhost:3000/api/health
sleep 10

# 4. Check metrics
curl http://localhost:3000/metrics | grep -i error

# 5. If still failing, escalate to manual investigation
```

### Runbook 2: Database Recovery

**Situação**: Database crashed ou corrupted  
**RTO**: 15 minutos

```bash
# 1. Backup current state
docker-compose exec postgres pg_dump -U postgres docker_platform > backup-corrupted.sql

# 2. Restore from last known good backup
./deploy/database/restore-pitr.sh backups/docker_platform-latest.sql.gz

# 3. Wait for recovery
while ! docker-compose exec postgres pg_isready -U postgres; do sleep 5; done

# 4. Run integrity check
docker-compose exec postgres psql -U postgres -d docker_platform -c "ANALYZE;"

# 5. Verify no data loss
docker-compose exec postgres psql -U postgres -d docker_platform -c "SELECT COUNT(*) FROM containers;"
```

### Runbook 3: Agent Offline

**Situação**: Agent não responde  
**RTO**: 10 minutos

```bash
# 1. Check agent status in Control Plane
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/hosts | jq '.[] | select(.status == "OFFLINE")'

# 2. SSH into host
ssh docker-host-1

# 3. Restart agent
sudo systemctl restart docker-platform-agent
# ou
docker restart docker-platform-agent

# 4. Verify reconnection
journalctl -u docker-platform-agent -f
# Should see: "Host registered successfully"

# 5. Migrate containers from offline host
# Script: deploy/scripts/migrate-containers.sh
./deploy/scripts/migrate-containers.sh --from-host X --to-host Y
```

### Runbook 4: Out of Capacity

**Situação**: Não há hosts com capacidade para novo container  
**RTO**: 30 minutos

```bash
# 1. Check available capacity
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/hosts | jq '.[] | {id, cpuUsed, cpuCapacity}'

# 2. Option A: Scale existing host
# Add CPU/memory to Docker host
# Docker picks up automatically on heartbeat

# 3. Option B: Add new host
docker-compose up -d docker-host-2

# 4. Verify new host registered
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/hosts

# 5. Retry container creation
curl -X POST http://localhost:3000/api/containers \
  -H "Authorization: Bearer $TOKEN" \
  -d '{...}'
```

---

**Última atualização**: 2025-01-14  
**Mantido por**: Equipe DevOps  
**Contato de Emergência**: ops@company.com
