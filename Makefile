# Docker Platform - Makefile
# Provides convenient commands for development, testing, and deployment

.PHONY: help setup setup-postgres setup-control-plane setup-agent \
	dev dev-control-plane dev-agent dev-dashboard \
	test test-control-plane test-agent \
	db-migrate db-seed db-reset db-studio \
	docker-up docker-down docker-clean \
	build build-agent build-control-plane build-dashboard \
	deploy deploy-prod clean logs

.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "Docker Platform - Available Commands"
	@echo "===================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

# Setup Commands
setup: setup-postgres setup-control-plane setup-agent ## Complete setup (postgres + control-plane + agent)

setup-postgres: ## Start PostgreSQL via docker-compose
	@echo "📦 Starting PostgreSQL..."
	docker-compose up -d postgres
	@sleep 5
	@docker-compose exec -T postgres pg_isready -U postgres -d docker_platform
	@echo "✅ PostgreSQL is ready"

setup-control-plane: ## Setup Control Plane (install deps, migrate, seed)
	@echo "🚀 Setting up Control Plane..."
	cd control-plane && npm install
	@echo "🔧 Generating Prisma client..."
	cd control-plane && npm run db:generate
	@echo "🗄️  Running migrations..."
	cd control-plane && npm run db:migrate -- --name init
	@echo "🌱 Seeding database..."
	cd control-plane && npm run db:seed
	@echo "✅ Control Plane setup complete"

setup-agent: ## Setup Host Agent (install deps)
	@echo "🚀 Setting up Host Agent..."
	cd agent && go mod download
	@echo "✅ Agent setup complete"

# Development Commands
dev: dev-control-plane ## Start Control Plane (default dev target)

dev-control-plane: ## Start Control Plane dev server
	@echo "🚀 Starting Control Plane (http://localhost:3000, gRPC: :50051)"
	cd control-plane && npm run dev

dev-agent: ## Start Host Agent
	@echo "🚀 Starting Host Agent"
	cd agent && go run cmd/agent/main.go

dev-dashboard: ## Start Dashboard dev server
	@echo "🚀 Starting Dashboard (http://localhost:5173)"
	cd dashboard && npm run dev

# Test Commands
test: test-control-plane test-agent ## Run all tests (control-plane + agent)

test-control-plane: ## Run Control Plane integration tests
	@echo "🧪 Running Control Plane integration tests..."
	cd control-plane && npm test

test-agent: ## Run Agent unit tests
	@echo "🧪 Running Agent unit tests..."
	cd agent && go test ./... -v

test-agent-coverage: ## Run Agent tests with coverage
	@echo "🧪 Running Agent tests with coverage..."
	cd agent && go test ./... -coverprofile=coverage.out
	@echo "📊 Coverage report: cd agent && go tool cover -html=coverage.out"

# Database Commands
db-migrate: ## Run pending database migrations
	@echo "🗄️  Running database migrations..."
	cd control-plane && npm run db:migrate -- --name init

db-seed: ## Seed database with test data
	@echo "🌱 Seeding database..."
	cd control-plane && npm run db:seed

db-reset: ## Reset database (delete all data and re-seed)
	@echo "⚠️  Resetting database..."
	cd control-plane && npm run db:reset

db-studio: ## Open Prisma Studio to view/edit database
	@echo "📊 Opening Prisma Studio (http://localhost:5555)"
	cd control-plane && npm run db:studio

# Docker Commands
docker-up: ## Start all services (postgres + pgadmin)
	@echo "📦 Starting Docker services..."
	docker-compose up -d
	@docker-compose ps

docker-down: ## Stop all services
	@echo "🛑 Stopping Docker services..."
	docker-compose down

docker-clean: ## Remove all containers, volumes, and images
	@echo "🧹 Cleaning up Docker resources..."
	docker-compose down -v
	docker system prune -f

docker-logs: ## View docker-compose logs
	docker-compose logs -f

# Build Commands
build: build-control-plane build-agent ## Build all (control-plane + agent)

build-control-plane: ## Build Control Plane
	@echo "🔨 Building Control Plane..."
	cd control-plane && npm run build
	@echo "✅ Build complete: dist/app.js"

build-agent: ## Build Agent binary
	@echo "🔨 Building Host Agent..."
	cd agent && go build -o bin/agent cmd/agent/main.go
	@echo "✅ Build complete: agent/bin/agent"

build-agent-linux: ## Build Agent for Linux (x86_64)
	@echo "🔨 Building Host Agent for Linux..."
	cd agent && GOOS=linux GOARCH=amd64 go build -o bin/agent-linux cmd/agent/main.go
	@echo "✅ Build complete: agent/bin/agent-linux"

build-agent-arm: ## Build Agent for ARM (Raspberry Pi)
	@echo "🔨 Building Host Agent for ARM64..."
	cd agent && GOOS=linux GOARCH=arm64 go build -o bin/agent-arm64 cmd/agent/main.go
	@echo "✅ Build complete: agent/bin/agent-arm64"

build-dashboard: ## Build Dashboard (React)
	@echo "🔨 Building Dashboard..."
	cd dashboard && npm run build
	@echo "✅ Build complete: dashboard/dist"

# Utility Commands
clean: ## Clean build artifacts
	@echo "🧹 Cleaning build artifacts..."
	rm -rf control-plane/dist
	rm -rf agent/bin
	rm -f agent/coverage.out
	cd control-plane && npm ci  # Reset node_modules if needed
	@echo "✅ Cleanup complete"

logs: docker-logs ## Alias for docker-logs

status: ## Show status of all services
	@echo "Docker Compose Status:"
	@docker-compose ps
	@echo ""
	@echo "Control Plane:"
	@curl -s http://localhost:3000/health 2>/dev/null && echo "  ✅ HTTP (port 3000)" || echo "  ❌ HTTP (port 3000) - not running"
	@grpcurl -plaintext localhost:50051 list 2>/dev/null && echo "  ✅ gRPC (port 50051)" || echo "  ❌ gRPC (port 50051) - not running"
	@echo ""
	@echo "Database:"
	@curl -s postgres://postgres:postgres@localhost:5432/docker_platform 2>/dev/null && echo "  ✅ PostgreSQL (port 5432)" || echo "  ❌ PostgreSQL (port 5432) - check docker-compose"

# Combined Workflows
quick-start: setup docker-up dev-control-plane ## Full quick start: setup + docker-up + dev

deploy: build-dashboard ## Build dashboard and start full stack via docker-compose
	@echo "🚀 Starting production stack..."
	docker compose up -d
	@echo "✅ Dashboard: http://localhost:8080"
	@echo "✅ Control Plane: http://localhost:3000"

deploy-prod: ## Deploy with production overrides (requires .env)
	@echo "🚀 Starting production stack with overrides..."
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
	@docker compose ps
	@echo "✅ Production stack deployed"

validate: build test ## Build and run all tests

# Note: This Makefile is for development. For production, use container orchestration (Docker Compose, Kubernetes, etc.)
