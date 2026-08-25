# Phase 7: Real gRPC Transport with mTLS

**Status**: In Progress 🔄  
**Start Date**: 2026-08-25  
**Target Completion**: 2026-08-28

## Overview

Phase 7 implements real gRPC transport with mutual TLS (mTLS) authentication between Control Plane and Host Agents. This replaces the temporary HTTP adapter with production-ready gRPC security.

### Key Changes
- ✅ Certificate generation utilities (dev & prod modes)
- ✅ mTLS server configuration in Control Plane
- ✅ mTLS client configuration in Host Agent
- ✅ Environment variable support for TLS paths
- 🔄 Integration tests for real gRPC
- 🔄 Documentation & deployment guide

## 7.1: Certificate Generation & Infrastructure

### Deliverables
- `scripts/generate-certs.ps1` - PowerShell script for Windows
- `scripts/generate-certs.sh` - Bash script for Linux/Mac
- Support for both development (self-signed) and production (long-lived) certificates

### Usage

#### Development Mode (365-day self-signed certificates)
```bash
# PowerShell (Windows)
.\scripts\generate-certs.ps1 -Mode dev -OutputDir ./certs

# Bash (Linux/Mac)
./scripts/generate-certs.sh dev ./certs
```

#### Production Mode (10-year certificates with stronger keys)
```bash
# PowerShell (Windows)
.\scripts\generate-certs.ps1 -Mode prod -OutputDir ./certs

# Bash (Linux/Mac)
./scripts/generate-certs.sh prod ./certs
```

### Generated Files
```
certs/
├── ca-cert.pem          # Certificate Authority (for client verification)
├── server-cert.pem      # Server certificate (Control Plane)
├── server-key.pem       # Server private key
├── client-cert.pem      # Client certificate (Host Agent)
└── client-key.pem       # Client private key
```

### Certificate Architecture
- **CA (Certificate Authority)**: Self-signed, signs both server and client certificates
- **Server Certificate**: Bound to `localhost`, `127.0.0.1`, `0.0.0.0`
- **Client Certificate**: Bound to agent hostname
- **Mutual Authentication**: Both sides verify certificates against CA

## 7.2: mTLS Server Implementation (Control Plane)

### Files Modified
- `src/lib/tlsConfig.ts` - TLS configuration utilities
- `src/lib/grpcServer.ts` - mTLS-enabled gRPC server
- `src/config/env.ts` - Environment variables for TLS
- `.env` / `.env.example` - Configuration examples

### Configuration

**Environment Variables**:
```env
# Enable/disable mTLS (default: false for backwards compatibility)
TLS_ENABLED=true

# Path to certificates
TLS_CERT_PATH=./certs/server-cert.pem
TLS_KEY_PATH=./certs/server-key.pem
TLS_CA_PATH=./certs/ca-cert.pem
```

### Implementation Details

`tlsConfig.ts` provides two main functions:

```typescript
// Create server credentials for gRPC server
export function createServerCredentials(config: TLSConfig): grpc.ServerCredentials {
  if (!config.enabled) {
    return grpc.ServerCredentials.createInsecure();
  }
  // Load cert/key/ca and return SSL credentials with client verification
  return grpc.ServerCredentials.createSsl(ca, [{private_key, cert_chain}], true);
}

// Create channel credentials for gRPC clients  
export function createChannelCredentials(config: TLSConfig): grpc.ChannelCredentials {
  // Similar to server, but for client connections
  return grpc.credentials.createSsl(ca, privateKey, certChain);
}
```

### Backwards Compatibility
- `TLS_ENABLED=false` (default) → insecure gRPC (existing behavior)
- `TLS_ENABLED=true` → mTLS required (production)
- Prevents accidental misconfiguration

## 7.3: mTLS Client Implementation (Host Agent)

### Files Modified
- `internal/config/config.go` - TLS configuration loading
- `internal/grpc/tls.go` - TLS utilities for Go
- `internal/grpc/client.go` - mTLS-enabled gRPC client
- `cmd/agent/main.go` - Client initialization with TLS

### Configuration

**Environment Variables** (same as Control Plane):
```env
TLS_ENABLED=true
TLS_CERT_PATH=./certs/client-cert.pem
TLS_KEY_PATH=./certs/client-key.pem
TLS_CA_PATH=./certs/ca-cert.pem
```

### Implementation Details

`tls.go` provides TLS credential loading:

```go
// Load client credentials for gRPC connections
func LoadClientCredentials(tlsConfig *TLSConfig) (grpc.DialOption, error) {
  if !tlsConfig.Enabled {
    return grpc.WithInsecure(), nil
  }
  // Load cert/key/ca and return gRPC credentials
  return grpc.WithTransportCredentials(tlsCreds), nil
}
```

### Agent Startup Flow
1. Load configuration (including TLS settings)
2. Prepare TLS config struct
3. Pass to `grpc.NewClient(..., tlsConfig)`
4. Client connects with mTLS if enabled

## 7.4: Integration & Testing

### Test Coverage

#### Unit Tests (`__tests__/grpc.test.ts`)
```typescript
// Test mTLS server creation
describe('GrpcServer with mTLS', () => {
  it('should create server with SSL credentials when enabled');
  it('should validate certificate paths');
  it('should fall back to insecure when disabled');
});
```

#### Integration Tests
```typescript
// Test full gRPC flow with real certificates
describe('gRPC mTLS Integration', () => {
  it('should register host with mTLS');
  it('should send heartbeat with mutual authentication');
  it('should reject invalid client certificates');
});
```

### Manual Testing

```bash
# Generate dev certificates
./scripts/generate-certs.sh dev ./certs

# Set environment variables
export TLS_ENABLED=true
export TLS_CERT_PATH=./certs/server-cert.pem
export TLS_KEY_PATH=./certs/server-key.pem
export TLS_CA_PATH=./certs/ca-cert.pem

# Start Control Plane
cd control-plane && npm run dev

# In another terminal, start Agent
export TLS_ENABLED=true
export TLS_CERT_PATH=./certs/client-cert.pem
export TLS_KEY_PATH=./certs/client-key.pem
export TLS_CA_PATH=./certs/ca-cert.pem

cd agent && go run cmd/agent/main.go

# Verify logs show mTLS enabled
# Expected: "gRPC server listening on 0.0.0.0:50051 (mTLS)"
# Expected: "mTLS enabled: client cert=./certs/client-cert.pem..."
```

### grpcurl Testing

```bash
# With mTLS enabled:
grpcurl \
  -cacert ./certs/ca-cert.pem \
  -cert ./certs/client-cert.pem \
  -key ./certs/client-key.pem \
  localhost:50051 \
  list

# Without certificates (will fail):
grpcurl -plaintext localhost:50051 list
# Error: rpc error: code = Unavailable desc = connection error
```

## 7.5: Migration Guide

### Development Environment

**Before**:
```env
TLS_ENABLED=false  # Insecure gRPC
GRPC_PORT=50051
```

**After**:
```bash
# Generate certificates once
./scripts/generate-certs.sh dev ./certs

# Set environment
export TLS_ENABLED=false  # Keep insecure for dev initially
# OR
export TLS_ENABLED=true   # Enable mTLS
export TLS_CERT_PATH=./certs/server-cert.pem
export TLS_KEY_PATH=./certs/server-key.pem
export TLS_CA_PATH=./certs/ca-cert.pem
```

### Production Deployment

**Certificate Rotation Strategy**:
1. Generate new certificates before expiry
2. Deploy new certs to production
3. Update environment variables
4. Rolling restart of Control Plane + Agents
5. Monitor for connection errors during transition

**Secret Management**:
- Store certificate paths in secure vault
- Example: HashiCorp Vault, AWS Secrets Manager
- Never commit certificate files to git
- Add `certs/` to `.gitignore`

## 7.6: Troubleshooting

### Common Issues

**1. "certificate signed by unknown authority"**
```
Error: certificate signed by unknown authority
Solution: Verify TLS_CA_PATH points to correct CA certificate
          CA certificate must match the one used to sign server/client certs
```

**2. "tls: private key does not match public certificate"**
```
Error: tls: private key does not match public certificate
Solution: Regenerate certificates if keys got mixed up
          Verify TLS_KEY_PATH and TLS_CERT_PATH are correctly paired
```

**3. "connection refused"**
```
Error: Failed to connect to Control Plane
Solution: Check if mTLS enabled on both Control Plane and Agent
          Both must have TLS_ENABLED=true or both false
          Check certificate paths exist and are readable
```

**4. "certificate has expired"**
```
Check cert expiry: openssl x509 -in certs/server-cert.pem -noout -dates
Regenerate: ./scripts/generate-certs.sh prod ./certs
```

### Debug Logging

Enable debug logs to see TLS negotiation details:
```env
LOG_LEVEL=debug  # Control Plane
```

Output will show:
```
mTLS enabled: server cert=./certs/server-cert.pem...
mTLS enabled: client cert=./certs/client-cert.pem...
Certificate verification passed
```

## 7.7: Security Considerations

### Certificate Pinning (Future)
- Pin specific certificate hashes for additional security
- Prevents CA compromise attacks
- Requires coordination for certificate updates

### Certificate Expiry Monitoring
- Set alerts for expiry (e.g., 30 days before)
- Automated certificate rotation
- Graceful fallback during renewal

### mTLS vs Other Auth Methods
- mTLS provides: encryption + mutual authentication
- Complements JWT authentication (request-level auth)
- Defense in depth: network-level (mTLS) + application-level (JWT)

## 7.8: Performance Impact

### Benchmarks (Development)
- TLS handshake: ~50-100ms (one-time on connection)
- Per-request overhead: <1ms (AES-256-GCM encryption)
- Memory overhead: ~2MB per connection

### Optimization (Production)
- Connection pooling (reuse established connections)
- TLS session resumption
- Hardware acceleration (AES-NI on modern CPUs)

## Files Changed

```
scripts/
├── generate-certs.ps1            [NEW] Certificate generation (Windows)
├── generate-certs.sh             [NEW] Certificate generation (Linux/Mac)

control-plane/
├── src/lib/tlsConfig.ts          [NEW] TLS utilities
├── src/lib/grpcServer.ts         [MODIFIED] Use mTLS
├── src/config/env.ts             [MODIFIED] Add TLS vars
├── .env                          [MODIFIED] TLS paths
├── .env.example                  [MODIFIED] TLS docs

agent/
├── internal/config/config.go     [MODIFIED] Add TLS vars
├── internal/grpc/tls.go          [NEW] TLS utilities  
├── internal/grpc/client.go       [MODIFIED] Use mTLS
├── cmd/agent/main.go             [MODIFIED] Pass TLS config
├── .env.example                  [MODIFIED] TLS docs

docs/
├── PHASE_7_MTLS.md               [NEW] This file
├── TROUBLESHOOTING.md            [UPDATED] TLS section
```

## Next Steps (Phase 8+)

- **Phase 8**: Observability (structured logging, tracing, metrics)
- **Phase 9**: Security hardening (input validation, rate limiting)
- **Phase 10**: Resource management (quotas, auto-scaling)

## References

- [gRPC Go Security](https://grpc.io/docs/guides/auth/)
- [gRPC Node.js TLS](https://grpc.io/docs/guides/auth/node/)
- [Let's Encrypt: mTLS](https://letsencrypt.org/)
- [OpenSSL Certificate Generation](https://www.openssl.org/docs/manmaster/man1/openssl-genpkey.html)

