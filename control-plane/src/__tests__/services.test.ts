// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createContainerService } from '../services/containerService'
import { createHostService } from '../services/hostService'
import { createEnvironmentService } from '../services/environmentService'

const prisma = new PrismaClient()

describe('Service Layer - Business Logic', () => {
  let tenantId: string
  let hostId: string

  beforeAll(async () => {
    // Clean up test data
    await prisma.container.deleteMany({})
    await prisma.host.deleteMany({})
    await prisma.environment.deleteMany({})
    await prisma.user.deleteMany({})
    await prisma.tenant.deleteMany({})

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: { name: 'Service Test Tenant' },
    })
    tenantId = tenant.id

    // Create test host
    const host = await prisma.host.create({
      data: {
        name: 'service-test-host',
        hostname: 'service-test.local',
        agentId: 'agent-service-001',
        status: 'ONLINE',
        dockerVersion: '24.0.7',
        tenantId,
        metadata: {},
        lastHeartbeat: new Date(),
      },
    })
    hostId = host.id
  })

  afterAll(async () => {
    await prisma.container.deleteMany({ where: { hostId } })
    await prisma.environment.deleteMany({ where: { tenantId } })
    await prisma.host.delete({ where: { id: hostId } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  describe('ContainerService', () => {
    const containerService = createContainerService()

    it('should create a container', async () => {
      const container = await containerService.create({
        name: 'test-service-container',
        image: 'alpine:latest',
        hostId,
        tenantId,
      })

      expect(container).toHaveProperty('id')
      expect(container.name).toBe('test-service-container')
      expect(container.status).toBe('CREATED')

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('should list containers by tenant', async () => {
      const container1 = await prisma.container.create({
        data: {
          name: 'list-service-1',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const container2 = await prisma.container.create({
        data: {
          name: 'list-service-2',
          image: 'nginx:latest',
          status: 'STOPPED',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const result = await containerService.list(tenantId, {})

      expect(result.data).toContainEqual(expect.objectContaining({ id: container1.id }))
      expect(result.data).toContainEqual(expect.objectContaining({ id: container2.id }))

      // Cleanup
      await prisma.container.deleteMany({ where: { id: { in: [container1.id, container2.id] } } })
    })

    it('should filter containers by status', async () => {
      const running = await prisma.container.create({
        data: {
          name: 'filter-running-service',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const stopped = await prisma.container.create({
        data: {
          name: 'filter-stopped-service',
          image: 'alpine:latest',
          status: 'STOPPED',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const result = await containerService.list(tenantId, { status: 'RUNNING' })

      expect(result.data).toContainEqual(expect.objectContaining({ id: running.id }))
      expect(result.data).not.toContainEqual(expect.objectContaining({ id: stopped.id }))

      // Cleanup
      await prisma.container.deleteMany({ where: { id: { in: [running.id, stopped.id] } } })
    })

    it('should get container by id', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'get-service-container',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const result = await containerService.getById(container.id, tenantId)

      expect(result).not.toBeNull()
      expect(result?.id).toBe(container.id)
      expect(result?.name).toBe('get-service-container')

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('should update container status', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'update-status-service',
          image: 'alpine:latest',
          status: 'STOPPED',
          hostId,
          tenantId,
          createdAt: new Date(),
        },
      })

      const result = await containerService.updateStatus(container.id, 'RUNNING', tenantId)

      expect(result).not.toBeNull()
      expect(result?.status).toBe('RUNNING')

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('should return null for non-existent container', async () => {
      const result = await containerService.getById('non-existent-id', tenantId)
      expect(result).toBeNull()
    })
  })

  describe('HostService', () => {
    const hostService = createHostService()

    it('should create a host', async () => {
      const host = await hostService.create({
        name: 'test-host-service',
        hostname: 'test-service.local',
        agentId: 'agent-create-service',
        dockerVersion: '24.0.7',
        tenantId,
      })

      expect(host).toHaveProperty('id')
      expect(host.name).toBe('test-host-service')
      expect(host.status).toBe('ONLINE')

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('should list hosts by tenant', async () => {
      const host1 = await prisma.host.create({
        data: {
          name: 'list-host-1',
          hostname: 'list-1.local',
          agentId: 'agent-list-1',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const host2 = await prisma.host.create({
        data: {
          name: 'list-host-2',
          hostname: 'list-2.local',
          agentId: 'agent-list-2',
          status: 'OFFLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const result = await hostService.list(tenantId)

      expect(result).toContainEqual(expect.objectContaining({ id: host1.id }))
      expect(result).toContainEqual(expect.objectContaining({ id: host2.id }))

      // Cleanup
      await prisma.host.deleteMany({ where: { id: { in: [host1.id, host2.id] } } })
    })

    it('should get host by id', async () => {
      const host = await prisma.host.create({
        data: {
          name: 'get-host-service',
          hostname: 'get-service.local',
          agentId: 'agent-get-service',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const result = await hostService.getById(host.id, tenantId)

      expect(result).not.toBeNull()
      expect(result?.id).toBe(host.id)

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('should update host heartbeat', async () => {
      const host = await prisma.host.create({
        data: {
          name: 'heartbeat-host-service',
          hostname: 'heartbeat-service.local',
          agentId: 'agent-heartbeat-service',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(Date.now() - 60000),
        },
      })

      const result = await hostService.updateHeartbeat(host.id, {
        cpuUsage: 55.2,
        memoryUsage: 4096,
        containerCount: 5,
      })

      expect(result).not.toBeNull()
      expect(result?.lastHeartbeat.getTime()).toBeGreaterThan(host.lastHeartbeat.getTime())

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('should mark host offline', async () => {
      const host = await prisma.host.create({
        data: {
          name: 'offline-host-service',
          hostname: 'offline-service.local',
          agentId: 'agent-offline-service',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const result = await hostService.markOffline(host.id)

      expect(result).not.toBeNull()
      expect(result?.status).toBe('OFFLINE')

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })
  })

  describe('EnvironmentService', () => {
    const envService = createEnvironmentService()

    it('should create environment', async () => {
      const env = await envService.create({
        name: 'test-env-service',
        tenantId,
        variables: {
          DATABASE_URL: 'postgres://localhost/test',
          REDIS_URL: 'redis://localhost:6379',
        },
      })

      expect(env).toHaveProperty('id')
      expect(env.name).toBe('test-env-service')
      expect(env.variables).toHaveProperty('DATABASE_URL')

      // Cleanup
      await prisma.environment.delete({ where: { id: env.id } })
    })

    it('should list environments by tenant', async () => {
      const env1 = await prisma.environment.create({
        data: {
          name: 'list-env-1',
          tenantId,
          variables: { KEY1: 'value1' },
        },
      })

      const env2 = await prisma.environment.create({
        data: {
          name: 'list-env-2',
          tenantId,
          variables: { KEY2: 'value2' },
        },
      })

      const result = await envService.list(tenantId)

      expect(result).toContainEqual(expect.objectContaining({ id: env1.id }))
      expect(result).toContainEqual(expect.objectContaining({ id: env2.id }))

      // Cleanup
      await prisma.environment.deleteMany({ where: { id: { in: [env1.id, env2.id] } } })
    })

    it('should update environment variables', async () => {
      const env = await prisma.environment.create({
        data: {
          name: 'update-env-service',
          tenantId,
          variables: { OLD_KEY: 'old_value' },
        },
      })

      const result = await envService.update(env.id, tenantId, {
        variables: { NEW_KEY: 'new_value' },
      })

      expect(result).not.toBeNull()
      expect(result?.variables).toHaveProperty('NEW_KEY', 'new_value')
      expect(result?.variables).not.toHaveProperty('OLD_KEY')

      // Cleanup
      await prisma.environment.delete({ where: { id: env.id } })
    })

    it('should delete environment', async () => {
      const env = await prisma.environment.create({
        data: {
          name: 'delete-env-service',
          tenantId,
          variables: {},
        },
      })

      await envService.delete(env.id, tenantId)

      const found = await prisma.environment.findUnique({ where: { id: env.id } })
      expect(found).toBeNull()
    })

    it('should return null for non-existent environment', async () => {
      const result = await envService.getById('non-existent-id', tenantId)
      expect(result).toBeNull()
    })
  })

  describe('Cross-Tenant Isolation', () => {
    const containerService = createContainerService()
    const hostService = createHostService()

    it('should isolate containers by tenant', async () => {
      // Create other tenant
      const otherTenant = await prisma.tenant.create({
        data: { name: 'Other Service Tenant' },
      })

      // Create container in other tenant
      const otherHost = await prisma.host.create({
        data: {
          name: 'other-host',
          hostname: 'other.local',
          agentId: 'agent-other',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: otherTenant.id,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const otherContainer = await prisma.container.create({
        data: {
          name: 'other-container',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId: otherHost.id,
          tenantId: otherTenant.id,
          createdAt: new Date(),
        },
      })

      // Query from tenant 1
      const result1 = await containerService.list(tenantId, {})
      // Query from tenant 2
      const result2 = await containerService.list(otherTenant.id, {})

      expect(result1.data).not.toContainEqual(expect.objectContaining({ id: otherContainer.id }))
      expect(result2.data).toContainEqual(expect.objectContaining({ id: otherContainer.id }))

      // Cleanup
      await prisma.container.delete({ where: { id: otherContainer.id } })
      await prisma.host.delete({ where: { id: otherHost.id } })
      await prisma.tenant.delete({ where: { id: otherTenant.id } })
    })

    it('should isolate hosts by tenant', async () => {
      const otherTenant = await prisma.tenant.create({
        data: { name: 'Host Isolation Tenant' },
      })

      const otherHost = await prisma.host.create({
        data: {
          name: 'isolation-host',
          hostname: 'isolation.local',
          agentId: 'agent-isolation',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: otherTenant.id,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const result1 = await hostService.list(tenantId)
      const result2 = await hostService.list(otherTenant.id)

      expect(result1).not.toContainEqual(expect.objectContaining({ id: otherHost.id }))
      expect(result2).toContainEqual(expect.objectContaining({ id: otherHost.id }))

      // Cleanup
      await prisma.host.delete({ where: { id: otherHost.id } })
      await prisma.tenant.delete({ where: { id: otherTenant.id } })
    })
  })
})
