# Contributing to Docker Platform

Welcome! This document outlines how to contribute to the Docker Platform project.

## Code of Conduct

- Be respectful and inclusive
- Focus on the code, not the person
- Help others learn and grow
- Report issues constructively

## Getting Started

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/project-phoenix.git
   cd project-phoenix
   ```

2. **Set Up Development Environment**
   ```bash
   make setup              # Run all setup steps
   # OR manually:
   make setup-postgres
   make setup-control-plane
   make setup-agent
   ```

3. **Create Feature Branch**
   ```bash
   git checkout -b feature/my-feature
   ```

4. **Make Changes and Test**
   ```bash
   make test               # Run all tests
   make test-control-plane # Test just Control Plane
   make test-agent         # Test just Agent
   ```

5. **Commit and Push**
   ```bash
   git commit -m "Feature: descriptive message"
   git push origin feature/my-feature
   ```

6. **Create Pull Request**
   - Base: `main`
   - Compare: `your-feature-branch`
   - Title: Clear, concise description
   - Body: Explain **why**, not just **what**

## Architecture Overview

```
control-plane/          # Node.js + TypeScript + Fastify
├── src/
│   ├── app.ts          # Main app and route setup
│   ├── routes/         # API endpoints
│   ├── services/       # Business logic
│   ├── repositories/   # Database queries (with tenant_id)
│   ├── middleware/     # Auth, RBAC, error handling
│   ├── proto/          # gRPC message types
│   └── lib/            # Utilities (gRPC server, JWT)
├── prisma/
│   ├── schema.prisma   # Database schema
│   └── seed.ts         # Test data generator
└── src/__tests__/      # Integration tests

agent/                  # Go + Docker SDK
├── cmd/agent/
│   └── main.go         # Entry point
├── internal/
│   ├── config/         # Environment variables
│   ├── docker/         # Docker Engine API
│   ├── grpc/           # gRPC client
│   └── grpcgen/        # Proto types & adapters
└── internal/grpcgen/*_test.go  # Unit tests

proto/                  # gRPC service definitions
└── docker_platform.proto

docs/                   # Architecture & decision records
README.md               # Project overview
SETUP.md               # Setup guide
Makefile               # Development commands
```

## Code Style

### TypeScript (Control Plane)

- Use `prettier` for formatting
- Follow ESLint rules
- 2-space indentation
- Interfaces > Classes for data types
- Strict null checks enabled

```typescript
// Good
interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

const getUser = async (id: string): Promise<User | null> => {
  return prisma.user.findUnique({ where: { id } });
};

// Bad
const getUser = (id) => {
  return db.query('SELECT * FROM users WHERE id = ' + id);
};
```

### Go (Agent)

- Run `gofmt` (automatic formatting)
- Follow Go idioms (interfaces, error handling)
- Organize imports: stdlib, third-party, local
- Comments for exported functions

```go
// Good
type HostClient interface {
  RegisterHost(ctx context.Context, req *RegisterHostRequest) (*RegisterHostResponse, error)
  Heartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, error)
}

func (c *HTTPClient) Heartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, error) {
  // implementation
}

// Bad
func heartbeat(req interface{}) interface{} {
  // implementation
}
```

## Testing

### Control Plane

```bash
# Add Jest to devDependencies if not present
cd control-plane
npm install --save-dev jest @jest/globals ts-jest

# Create jest.config.js (if not present)
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
EOF

# Run tests
npm test

# Run specific test file
npm test -- integration.test.ts

# Run with coverage
npm test -- --coverage
```

**Test Guidelines**:
- Name tests after behavior: `should register a new host`
- Use `describe` blocks for grouping
- Isolate tests: clean up data in `afterEach`
- Mock external dependencies (Docker, gRPC)
- Verify multi-tenant isolation

### Agent

```bash
cd agent

# Run all tests
go test ./...

# Run with verbose output
go test ./... -v

# Run specific package
go test ./internal/docker -v

# Run with coverage
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

**Test Guidelines**:
- Write unit tests for business logic (no Docker daemon required)
- Use mock client for gRPC testing
- Test JSON marshaling/unmarshaling
- Verify error handling

## Multi-Tenant Isolation

**Critical**: All data queries MUST filter by `tenant_id`.

### Control Plane Example

```typescript
// ✅ CORRECT - filters by tenant_id
const hosts = await prisma.host.findMany({
  where: { 
    tenantId: currentUser.tenantId  // Always include this
  }
});

// ❌ WRONG - no tenant filtering
const hosts = await prisma.host.findMany();
```

### Database Schema Rule

Every operational table must have:
```prisma
model MyEntity {
  id        String   @id @default(cuid())
  tenantId  String   @db.Uuid
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // ... other fields
  @@index([tenantId])  // For query performance
  @@unique([tenantId, name])  // Unique within tenant
}
```

## Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: feat, fix, docs, style, refactor, perf, test, chore
**Scope**: control-plane, agent, proto, docs, etc.
**Subject**: Imperative, present tense, lowercase
**Body**: Explain **why**, not **what**
**Footer**: References to issues (Fixes #123)

### Examples

```
feat(control-plane): implement host registration endpoint

Add POST /api/hosts/register to handle new host registration
with tenant isolation and duplicate detection.

Implements the first step of the registration flow defined in
the gRPC contract. Validates agentId uniqueness within tenant.

Fixes #42
```

```
fix(agent): handle Docker socket timeout gracefully

Previously, connection timeout would panic. Now returns error
with context message enabling retry logic.

Closes #89
```

## Pull Request Guidelines

1. **Title**: Clear, concise (under 80 chars)
2. **Description**: Explain **why** and **what**, not just file changes
3. **Testing**: Include test code or test plan
4. **Commits**: Logical units, self-contained
5. **Documentation**: Update README/SETUP if adding features
6. **No Breaking Changes**: Maintain backward compatibility (or note breaking)

### PR Template

```markdown
## Summary
Brief explanation of what this PR does.

## Why
Explain the motivation and context.

## Changes
- High-level summary of changes
- Focus on design decisions, not line-by-line

## Testing
How to verify the changes work:
- Steps to reproduce
- Expected behavior
- Test commands (make test, etc.)

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or noted)
- [ ] Follows code style
- [ ] Multi-tenant isolation verified
```

## Running Locally

### Quick Workflow

```bash
# Terminal 1: Infrastructure
make docker-up

# Terminal 2: Control Plane
make dev-control-plane

# Terminal 3: Agent
make dev-agent

# Terminal 4: Testing/Work
make test
```

### Common Tasks

```bash
# Reset database and reseed
make db-reset

# View/edit database in UI
make db-studio

# Run specific test
cd control-plane && npm test -- integration.test.ts
cd agent && go test ./internal/docker -v

# Check what endpoints are running
make status
```

## Database Migrations

When adding new tables/columns:

1. **Update schema.prisma**
   ```prisma
   model NewTable {
     id       String  @id @default(cuid())
     tenantId String  // Always include for multi-tenant!
     // ... fields
   }
   ```

2. **Create migration**
   ```bash
   cd control-plane
   npm run db:migrate -- --name add_new_table
   ```

3. **Review migration SQL** in `prisma/migrations/<timestamp>_add_new_table/`

4. **Seed test data** if needed in `prisma/seed.ts`

5. **Test**
   ```bash
   npm run db:reset  # Wipes and recreates schema
   npm test          # Run tests with fresh data
   ```

## Documentation

Update docs for:
- New features or APIs
- Configuration changes
- Troubleshooting tips
- Architecture decisions

Files to update:
- `README.md` - Project overview, quick start
- `SETUP.md` - Setup instructions, configuration
- `agent/README.md` - Agent-specific details
- `docs/` - Decision records, architectural notes

## Performance & Security

### Code Review Checklist

- ✅ No SQL injection (use parameterized queries)
- ✅ No hardcoded secrets
- ✅ Input validation on all endpoints
- ✅ Multi-tenant isolation enforced
- ✅ Error messages don't leak sensitive info
- ✅ Proper error handling (no panics in Agent)
- ✅ Resource limits (timeouts, rate limiting)
- ✅ Secure defaults (JWT expiry, password hashing)

### Performance Considerations

- Add database indexes for frequently queried fields
- Use pagination for large result sets
- Avoid N+1 queries (use JOIN)
- Profile with pprof (Go) or Node profiler
- Cache where appropriate (never cache user data)

## Getting Help

- **Questions?** Open a discussion
- **Bug?** Create an issue with reproduction steps
- **Feature Request?** Propose with use cases
- **Design Discussion?** Start a draft PR for feedback

## Useful Resources

- [Prisma Docs](https://www.prisma.io/docs/)
- [Fastify Docs](https://www.fastify.io/)
- [gRPC Docs](https://grpc.io/docs/)
- [Go Code Review Comments](https://golang.org/doc/effective_go)
- [Conventional Commits](https://www.conventionalcommits.org/)

## License

By contributing, you agree that your contributions will be licensed under the project's existing license.

---

Thank you for contributing to Docker Platform! 🚀
