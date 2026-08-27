// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

describe('Repository Layer - Data Access', () => {
  let tenantId: string
  let hostId: string

  beforeAll(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: { name: 'Repo Test Tenant' },
    })
    tenantId = tenant.id

    // Create test host
    const host = await prisma.host.create({
      data: {
        name: 'repo-test-host',
        hostname: 'repo-test.local',
        agentId: 'agent-repo-001',
        status: 'ONLINE',
        dockerVersion: '24.0.7',
        tenantId,
        metadata: { os: 'Linux', arch: 'x86_64' },
        lastHeartbeat: new Date(),
      },
    })
    hostId = host.id
  })

  afterAll(async () => {
    await prisma.container.deleteMany({ where: { hostId } })
    await prisma.environment.deleteMany({ where: { tenantId } })
    await prisma.host.deleteMany({ where: { id: hostId } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.tenant.deleteMany({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  describe('Host Repository', () => {
    it('should create a host with metadata', async () => {
      const host = await prisma.host.create({
        data: {
          name: 'metadata-host',
          hostname: 'metadata.local',
          agentId: 'agent-metadata-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          ipAddress: '192.168.1.20',
          tenantId,
          metadata: {
            os: 'Ubuntu 22.04',
            arch: 'x86_64',
            cpuCores: 8,
            memoryMb: 16384,
          },
          lastHeartbeat: new Date(),
        },
      })

      expect(host.name).toBe('metadata-host')
      expect(host.metadata).toHaveProperty('os', 'Ubuntu 22.04')
      expect(host.metadata).toHaveProperty('cpuCores', 8)
      expect(host.tenantId).toBe(tenantId)

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('should find hosts by tenant', async () => {
      const host1 = await prisma.host.create({
        data: {
          name: 'tenant-host-1',
          hostname: 'tenant-1.local',
          agentId: 'agent-tenant-1',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const host2 = await prisma.host.create({
        data: {
          name: 'tenant-host-2',
          hostname: 'tenant-2.local',
          agentId: 'agent-tenant-2',
          status: 'OFFLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const hosts = await prisma.host.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      })

      expect(hosts.length).toBeGreaterThanOrEqual(2)
      expect(hosts).toContainEqual(expect.objectContaining({ id: host1.id }))
      expect(hosts).toContainEqual(expect.objectContaining({ id: host2.id }))

      // Cleanup
      await prisma.host.deleteMany({ where: { id: { in: [host1.id, host2.id] } } })
    })

    it('should update host status and lastHeartbeat', async () => {
      const host = await prisma.host.create({
        data: {
          name: 'update-host',
          hostname: 'update.local',
          agentId: 'agent-update-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(Date.now() - 60000),
        },
      })

      const newHeartbeat = new Date()
      const updated = await prisma.host.update({
        where: { id: host.id },
        data: {
          status: 'OFFLINE',
          lastHeartbeat: newHeartbeat,
          metadata: {
            ...host.metadata,
            lastError: 'Connection timeout',
          },
        },
      })

      expect(updated.status).toBe('OFFLINE')
      expect(updated.lastHeartbeat.getTime()).toBe(newHeartbeat.getTime())
      expect(updated.metadata).toHaveProperty('lastError')

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('should filter hosts by status', async () => {
      const online = await prisma.host.create({
        data: {
          name: 'filter-online',
          hostname: 'filter-online.local',
          agentId: 'agent-filter-online',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const offline = await prisma.host.create({
        data: {
          name: 'filter-offline',
          hostname: 'filter-offline.local',
          agentId: 'agent-filter-offline',
          status: 'OFFLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const onlineHosts = await prisma.host.findMany({
        where: { tenantId, status: 'ONLINE' },
      })

      expect(onlineHosts).toContainEqual(expect.objectContaining({ id: online.id }))
      expect(onlineHosts).not.toContainEqual(expect.objectContaining({ id: offline.id }))

      // Cleanup
      await prisma.host.deleteMany({ where: { id: { in: [online.id, offline.id] } } })
    })
  })

  describe('Container Repository', () => {
    it('should create a container with environment', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'env-container',
          image: 'node:20-alpine',
          status: 'RUNNING',
          hostId,
          ports: ['3000:3000'],
          environment: {
            NODE_ENV: 'production',
            DEBUG: 'false',
          },
          tenantId,
          createdAt: new Date(),
        },
      })

      expect(container.name).toBe('env-container')
      expect(container.environment).toHaveProperty('NODE_ENV', 'production')
      expect(container.ports).toContain('3000:3000')

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('should find containers by host', async () => {
      const container1 = await prisma.container.create({
        data: {
          name: 'host-container-1',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const container2 = await prisma.container.create({
        data: {
          name: 'host-container-2',
          image: 'nginx:latest',
          status: 'STOPPED',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const containers = await prisma.container.findMany({
        where: { hostId },
      })

      expect(containers).toContainEqual(expect.objectContaining({ id: container1.id }))
      expect(containers).toContainEqual(expect.objectContaining({ id: container2.id }))

      // Cleanup
      await prisma.container.deleteMany({ where: { id: { in: [container1.id, container2.id] } } })
    })

    it('should update container status', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'status-container',
          image: 'alpine:latest',
          status: 'STOPPED',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const updated = await prisma.container.update({
        where: { id: container.id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })

      expect(updated.status).toBe('RUNNING')
      expect(updated.startedAt).toBeTruthy()

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('should list containers by tenant', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'tenant-container',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const containers = await prisma.container.findMany({
        where: { tenantId },
      })

      expect(containers).toContainEqual(expect.objectContaining({ id: container.id }))

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })
  })

  describe('User Repository', () => {
    it('should create users with different roles', async () => {
      const admin = await prisma.user.create({
        data: {
          email: 'admin-repo@test.local',
          passwordHash: 'hashed_password',
          role: 'ADMIN',
          tenantId,
        },
      })

      const operator = await prisma.user.create({
        data: {
          email: 'operator-repo@test.local',
          passwordHash: 'hashed_password',
          role: 'OPERATOR',
          tenantId,
        },
      })

      expect(admin.role).toBe('ADMIN')
      expect(operator.role).toBe('OPERATOR')

      // Cleanup
      await prisma.user.deleteMany({ where: { id: { in: [admin.id, operator.id] } } })
    })

    it('should find user by email and tenant', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'find-user@test.local',
          passwordHash: 'hashed_password',
          role: 'VIEWER',
          tenantId,
        },
      })

      const found = await prisma.user.findUnique({
        where: { email_tenantId: { email: user.email, tenantId } },
      })

      expect(found?.id).toBe(user.id)
      expect(found?.email).toBe(user.email)

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } })
    })

    it('should update user role', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'update-user@test.local',
          passwordHash: 'hashed_password',
          role: 'VIEWER',
          tenantId,
        },
      })

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'OPERATOR' },
      })

      expect(updated.role).toBe('OPERATOR')

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } })
    })
  })

  describe('Environment Repository', () => {
    it('should create environment variables', async () => {
      const env = await prisma.environment.create({
        data: {
          name: 'production',
          tenantId,
          variables: {
            API_KEY: 'secret123',
            LOG_LEVEL: 'warn',
            FEATURES: ['feature-a', 'feature-b'],
          },
        },
      })

      expect(env.name).toBe('production')
      expect(env.variables).toHaveProperty('API_KEY', 'secret123')
      expect(env.variables).toHaveProperty('LOG_LEVEL', 'warn')

      // Cleanup
      await prisma.environment.delete({ where: { id: env.id } })
    })

    it('should update environment variables', async () => {
      const env = await prisma.environment.create({
        data: {
          name: 'staging',
          tenantId,
          variables: { DEBUG: 'true' },
        },
      })

      const updated = await prisma.environment.update({
        where: { id: env.id },
        data: {
          variables: { DEBUG: 'false', NEW_VAR: 'value' },
        },
      })

      expect(updated.variables).toHaveProperty('NEW_VAR', 'value')
      expect(updated.variables).toHaveProperty('DEBUG', 'false')

      // Cleanup
      await prisma.environment.delete({ where: { id: env.id } })
    })

    it('should list environments by tenant', async () => {
      const env1 = await prisma.environment.create({
        data: {
          name: 'env1',
          tenantId,
          variables: {},
        },
      })

      const env2 = await prisma.environment.create({
        data: {
          name: 'env2',
          tenantId,
          variables: {},
        },
      })

      const envs = await prisma.environment.findMany({
        where: { tenantId },
      })

      expect(envs).toContainEqual(expect.objectContaining({ id: env1.id }))
      expect(envs).toContainEqual(expect.objectContaining({ id: env2.id }))

      // Cleanup
      await prisma.environment.deleteMany({ where: { id: { in: [env1.id, env2.id] } } })
    })
  })
})
