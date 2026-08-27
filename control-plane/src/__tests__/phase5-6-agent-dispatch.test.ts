// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { getAgentRegistry } from '../lib/agentRegistry'
import { getDeadLetterQueue } from '../lib/deadLetterQueue'

const prisma = new PrismaClient()

describe('Phase 5+6 - Agent Registry', () => {
  let tenantId: string
  let onlineHostId: string
  let offlineHostId: string
  let noGrpcHostId: string

  beforeAll(async () => {
    await prisma.container.deleteMany({})
    await prisma.host.deleteMany({})
    await prisma.user.deleteMany({})
    await prisma.tenant.deleteMany({})

    const tenant = await prisma.tenant.create({
      data: { name: 'Agent Registry Test Tenant' },
    })
    tenantId = tenant.id

    // Online host with gRPC address
    const onlineHost = await prisma.host.create({
      data: {
        name: 'online-host',
        hostname: 'online.local',
        agentId: 'agent-online-001',
        status: 'ONLINE',
        dockerVersion: '24.0.7',
        tenantId,
        metadata: { grpcAddress: 'localhost:50051', agentId: 'agent-online-001' },
        lastHeartbeat: new Date(),
      },
    })
    onlineHostId = onlineHost.id

    // Offline host
    const offlineHost = await prisma.host.create({
      data: {
        name: 'offline-host',
        hostname: 'offline.local',
        agentId: 'agent-offline-001',
        status: 'OFFLINE',
        dockerVersion: '24.0.7',
        tenantId,
        metadata: { grpcAddress: 'localhost:50052' },
        lastHeartbeat: new Date(Date.now() - 300000),
      },
    })
    offlineHostId = offlineHost.id

    // Online host WITHOUT gRPC address
    const noGrpcHost = await prisma.host.create({
      data: {
        name: 'no-grpc-host',
        hostname: 'nogrpc.local',
        agentId: 'agent-nogrpc-001',
        status: 'ONLINE',
        dockerVersion: '24.0.7',
        tenantId,
        metadata: {},
        lastHeartbeat: new Date(),
      },
    })
    noGrpcHostId = noGrpcHost.id
  })

  afterAll(async () => {
    await prisma.container.deleteMany({})
    await prisma.host.deleteMany({})
    await prisma.tenant.deleteMany({})
    await prisma.$disconnect()
  })

  it('returns agent info for an online host with a gRPC address', async () => {
    const registry = getAgentRegistry()
    const agent = await registry.getAgent(onlineHostId)

    expect(agent).not.toBeNull()
    expect(agent?.hostId).toBe(onlineHostId)
    expect(agent?.grpcAddress).toBe('localhost:50051')
    expect(agent?.status).toBe('ONLINE')
  })

  it('returns null for an offline host', async () => {
    const registry = getAgentRegistry()
    const agent = await registry.getAgent(offlineHostId)
    expect(agent).toBeNull()
  })

  it('returns null for an online host without a gRPC address', async () => {
    const registry = getAgentRegistry()
    const agent = await registry.getAgent(noGrpcHostId)
    expect(agent).toBeNull()
  })

  it('lists only online agents with gRPC addresses for the tenant', async () => {
    const registry = getAgentRegistry()
    const agents = await registry.listAgents(tenantId)

    expect(agents.length).toBe(1)
    expect(agents[0].hostId).toBe(onlineHostId)
  })

  it('verifyAgent returns true for reachable agent, false otherwise', async () => {
    const registry = getAgentRegistry()
    expect(await registry.verifyAgent(onlineHostId)).toBe(true)
    expect(await registry.verifyAgent(offlineHostId)).toBe(false)
  })

  it('updates agent metadata (merges gRPC address)', async () => {
    const registry = getAgentRegistry()
    await registry.updateAgentMetadata(noGrpcHostId, { grpcAddress: 'localhost:50099' })

    const agent = await registry.getAgent(noGrpcHostId)
    expect(agent).not.toBeNull()
    expect(agent?.grpcAddress).toBe('localhost:50099')
  })

  it('reports registry stats', async () => {
    const registry = getAgentRegistry()
    const stats = await registry.getRegistryStats(tenantId)

    expect(stats.totalOnline).toBeGreaterThanOrEqual(1)
    expect(stats.totalOffline).toBeGreaterThanOrEqual(1)
    expect(typeof stats.agentsWithoutGrpc).toBe('number')
  })
})

describe('Phase 6 - Dead-Letter Queue', () => {
  it('enqueues a permanently failed job without throwing', async () => {
    const dlq = getDeadLetterQueue()

    await expect(
      dlq.enqueue({
        jobId: 'job-123',
        jobType: 'container:start',
        tenantId: 'tenant-abc',
        resourceId: 'container-xyz',
        errorMessage: 'Agent unreachable after 3 attempts',
        lastAttemptAt: new Date(),
        attemptCount: 3,
        metadata: { hostId: 'host-1', image: 'nginx:latest' },
      })
    ).resolves.toBeUndefined()
  })

  it('resolves a dead-letter entry without throwing', async () => {
    const dlq = getDeadLetterQueue()
    await expect(dlq.resolve('dlq-1', 'Manually restarted container')).resolves.toBeUndefined()
  })

  it('lists unresolved entries (empty until table wired)', async () => {
    const dlq = getDeadLetterQueue()
    const entries = await dlq.listUnresolved('tenant-abc')
    expect(Array.isArray(entries)).toBe(true)
  })

  it('reports queue stats', async () => {
    const dlq = getDeadLetterQueue()
    const stats = await dlq.getStats()
    expect(stats).toHaveProperty('totalEntries')
    expect(stats).toHaveProperty('unresolvedByType')
  })
})
