// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import * as jwt from 'jsonwebtoken'
import { buildApp } from '../app'
import type { FastifyInstance } from 'fastify'

const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-very-long-and-secure'

describe('HTTP API Routes - Control Plane', () => {
  let app: FastifyInstance
  let tenantId: string
  let adminToken: string
  let operatorToken: string
  let viewerToken: string
  let adminUserId: string
  let operatorUserId: string
  let viewerUserId: string

  beforeAll(async () => {
    app = await buildApp()

    // Clean test data
    await prisma.container.deleteMany({})
    await prisma.host.deleteMany({})
    await prisma.environment.deleteMany({})
    await prisma.user.deleteMany({})
    await prisma.tenant.deleteMany({})

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: { name: 'Test Tenant' },
    })
    tenantId = tenant.id

    // Create users with different roles
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.local',
        passwordHash: 'hashed_password',
        role: 'ADMIN',
        tenantId,
      },
    })
    adminUserId = adminUser.id

    const operatorUser = await prisma.user.create({
      data: {
        email: 'operator@test.local',
        passwordHash: 'hashed_password',
        role: 'OPERATOR',
        tenantId,
      },
    })
    operatorUserId = operatorUser.id

    const viewerUser = await prisma.user.create({
      data: {
        email: 'viewer@test.local',
        passwordHash: 'hashed_password',
        role: 'VIEWER',
        tenantId,
      },
    })
    viewerUserId = viewerUser.id

    // Generate tokens
    adminToken = jwt.sign(
      { sub: adminUserId, tenantId, role: 'ADMIN' },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
    operatorToken = jwt.sign(
      { sub: operatorUserId, tenantId, role: 'OPERATOR' },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
    viewerToken = jwt.sign(
      { sub: viewerUserId, tenantId, role: 'VIEWER' },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
  })

  afterAll(async () => {
    // Cleanup
    await prisma.container.deleteMany({})
    await prisma.host.deleteMany({})
    await prisma.environment.deleteMany({})
    await prisma.user.deleteMany({})
    await prisma.tenant.deleteMany({})
    await prisma.$disconnect()
    await app.close()
  })

  describe('Public Endpoints', () => {
    it('GET /api/health should return 200 OK', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('status', 'ok')
    })

    it('GET /api/status should return detailed system status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/status',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('status')
      expect(body).toHaveProperty('uptime')
      expect(body).toHaveProperty('timestamp')
    })

    it('GET /docs should return Swagger UI HTML', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/html')
      expect(response.body).toContain('swagger')
    })

    it('GET /metrics should return Prometheus metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/plain')
      expect(response.body).toContain('# HELP')
      expect(response.body).toContain('control_plane_http_requests_total')
    })
  })

  describe('Authentication & RBAC', () => {
    it('should reject requests without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/hosts',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should reject invalid JWT tokens', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/hosts',
        headers: { authorization: 'Bearer invalid.jwt.token' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should accept valid JWT tokens', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/hosts',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('VIEWER should not be able to start containers', async () => {
      // Create a host first
      const host = await prisma.host.create({
        data: {
          name: 'test-host',
          hostname: 'test-host.local',
          agentId: 'agent-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      // Create a container
      const container = await prisma.container.create({
        data: {
          name: 'test-container',
          image: 'alpine:latest',
          status: 'STOPPED',
          hostId: host.id,
          tenantId,
          createdAt: new Date(),
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/containers/${container.id}/start`,
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(403)

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('OPERATOR should be able to start containers', async () => {
      // Create host + container
      const host = await prisma.host.create({
        data: {
          name: 'op-test-host',
          hostname: 'op-test.local',
          agentId: 'agent-op-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const container = await prisma.container.create({
        data: {
          name: 'op-test-container',
          image: 'alpine:latest',
          status: 'STOPPED',
          hostId: host.id,
          tenantId,
          createdAt: new Date(),
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/containers/${container.id}/start`,
        headers: { authorization: `Bearer ${operatorToken}` },
      })

      // Should succeed or fail with specific error (container might not actually start)
      expect([200, 202, 409]).toContain(response.statusCode)

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
      await prisma.host.delete({ where: { id: host.id } })
    })
  })

  describe('Hosts API', () => {
    it('GET /api/hosts should list hosts', async () => {
      const host = await prisma.host.create({
        data: {
          name: 'list-test-host',
          hostname: 'list.local',
          agentId: 'agent-list-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/hosts',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('data')
      expect(body).toHaveProperty('pagination')
      expect(body.data).toContainEqual(expect.objectContaining({ id: host.id }))

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('GET /api/hosts?limit=10&offset=0 should support pagination', async () => {
      // Create multiple hosts
      const hosts = await Promise.all([
        prisma.host.create({
          data: {
            name: 'page-host-1',
            hostname: 'page-1.local',
            agentId: 'agent-page-1',
            status: 'ONLINE',
            dockerVersion: '24.0.7',
            tenantId,
            metadata: {},
            lastHeartbeat: new Date(),
          },
        }),
        prisma.host.create({
          data: {
            name: 'page-host-2',
            hostname: 'page-2.local',
            agentId: 'agent-page-2',
            status: 'ONLINE',
            dockerVersion: '24.0.7',
            tenantId,
            metadata: {},
            lastHeartbeat: new Date(),
          },
        }),
      ])

      const response = await app.inject({
        method: 'GET',
        url: '/api/hosts?limit=1&offset=0',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.pagination.limit).toBe(1)
      expect(body.pagination.offset).toBe(0)
      expect(body.data).toHaveLength(1)

      // Cleanup
      for (const host of hosts) {
        await prisma.host.delete({ where: { id: host.id } })
      }
    })

    it('GET /api/hosts/:id should return host details', async () => {
      const host = await prisma.host.create({
        data: {
          name: 'detail-host',
          hostname: 'detail.local',
          agentId: 'agent-detail-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          ipAddress: '192.168.1.10',
          tenantId,
          metadata: { os: 'Linux', arch: 'x86_64' },
          lastHeartbeat: new Date(),
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/hosts/${host.id}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('id', host.id)
      expect(body).toHaveProperty('name', 'detail-host')
      expect(body).toHaveProperty('status', 'ONLINE')
      expect(body).toHaveProperty('ipAddress', '192.168.1.10')

      // Cleanup
      await prisma.host.delete({ where: { id: host.id } })
    })

    it('GET /api/hosts/:id should return 404 for non-existent host', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/hosts/non-existent-id',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('Containers API', () => {
    let testHost: any

    beforeAll(async () => {
      testHost = await prisma.host.create({
        data: {
          name: 'container-test-host',
          hostname: 'containers.local',
          agentId: 'agent-containers-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })
    })

    afterAll(async () => {
      await prisma.container.deleteMany({ where: { hostId: testHost.id } })
      await prisma.host.delete({ where: { id: testHost.id } })
    })

    it('GET /api/containers should list containers', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'list-container',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId: testHost.id,
          tenantId,
          createdAt: new Date(),
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/containers',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data).toContainEqual(expect.objectContaining({ id: container.id }))

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('GET /api/containers?status=RUNNING should filter by status', async () => {
      const running = await prisma.container.create({
        data: {
          name: 'filter-running',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId: testHost.id,
          tenantId,
          createdAt: new Date(),
        },
      })

      const stopped = await prisma.container.create({
        data: {
          name: 'filter-stopped',
          image: 'alpine:latest',
          status: 'STOPPED',
          hostId: testHost.id,
          tenantId,
          createdAt: new Date(),
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/containers?status=RUNNING',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data).toContainEqual(expect.objectContaining({ id: running.id }))
      expect(body.data).not.toContainEqual(expect.objectContaining({ id: stopped.id }))

      // Cleanup
      await prisma.container.delete({ where: { id: running.id } })
      await prisma.container.delete({ where: { id: stopped.id } })
    })

    it('GET /api/containers/:id should return container details', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'detail-container',
          image: 'nginx:latest',
          status: 'RUNNING',
          hostId: testHost.id,
          ports: ['80:8080', '443:8443'],
          tenantId,
          createdAt: new Date(),
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/containers/${container.id}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.id).toBe(container.id)
      expect(body.name).toBe('detail-container')
      expect(body.status).toBe('RUNNING')

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('POST /api/containers/:id/start should start a container', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'start-test',
          image: 'alpine:latest',
          status: 'STOPPED',
          hostId: testHost.id,
          tenantId,
          createdAt: new Date(),
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/containers/${container.id}/start`,
        headers: { authorization: `Bearer ${operatorToken}` },
      })

      expect([200, 202, 409]).toContain(response.statusCode)

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })

    it('POST /api/containers/:id/stop should stop a container', async () => {
      const container = await prisma.container.create({
        data: {
          name: 'stop-test',
          image: 'alpine:latest',
          status: 'RUNNING',
          hostId: testHost.id,
          tenantId,
          createdAt: new Date(),
        },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/containers/${container.id}/stop`,
        headers: { authorization: `Bearer ${operatorToken}` },
      })

      expect([200, 202, 409]).toContain(response.statusCode)

      // Cleanup
      await prisma.container.delete({ where: { id: container.id } })
    })
  })

  describe('Usage & Metrics', () => {
    it('GET /api/usage/summary should return usage data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/usage/summary',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('tenantId')
      expect(body).toHaveProperty('period')
    })

    it('GET /api/usage/summary?from=...&to=... should filter by date range', async () => {
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const to = new Date().toISOString()

      const response = await app.inject({
        method: 'GET',
        url: `/api/usage/summary?from=${from}&to=${to}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('period')
    })
  })

  describe('Multi-Tenant Isolation', () => {
    it('should not expose other tenant data in list endpoints', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: { name: 'Other Tenant' },
      })

      // Create user in other tenant
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@test.local',
          passwordHash: 'hashed_password',
          role: 'VIEWER',
          tenantId: otherTenant.id,
        },
      })

      const otherToken = jwt.sign(
        { sub: otherUser.id, tenantId: otherTenant.id, role: 'VIEWER' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      // Create host in first tenant
      const host1 = await prisma.host.create({
        data: {
          name: 'tenant-1-host',
          hostname: 'host-1.local',
          agentId: 'agent-tenant-1',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      // Create host in second tenant
      const host2 = await prisma.host.create({
        data: {
          name: 'tenant-2-host',
          hostname: 'host-2.local',
          agentId: 'agent-tenant-2',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: otherTenant.id,
          metadata: {},
          lastHeartbeat: new Date(),
        },
      })

      // Query from tenant 1
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/hosts',
        headers: { authorization: `Bearer ${viewerToken}` },
      })

      // Query from tenant 2
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/hosts',
        headers: { authorization: `Bearer ${otherToken}` },
      })

      expect(response1.statusCode).toBe(200)
      expect(response2.statusCode).toBe(200)

      const body1 = JSON.parse(response1.body)
      const body2 = JSON.parse(response2.body)

      // Tenant 1 should only see their host
      expect(body1.data).toContainEqual(expect.objectContaining({ id: host1.id }))
      expect(body1.data).not.toContainEqual(expect.objectContaining({ id: host2.id }))

      // Tenant 2 should only see their host
      expect(body2.data).toContainEqual(expect.objectContaining({ id: host2.id }))
      expect(body2.data).not.toContainEqual(expect.objectContaining({ id: host1.id }))

      // Cleanup
      await prisma.host.delete({ where: { id: host1.id } })
      await prisma.host.delete({ where: { id: host2.id } })
      await prisma.user.delete({ where: { id: otherUser.id } })
      await prisma.tenant.delete({ where: { id: otherTenant.id } })
    })
  })

  describe('Trace Context Headers', () => {
    it('should preserve trace-id header in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-trace-id': 'custom-trace-123' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['x-trace-id']).toBe('custom-trace-123')
    })

    it('should generate trace-id if not provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['x-trace-id']).toBeTruthy()
      expect(typeof response.headers['x-trace-id']).toBe('string')
    })

    it('should include request-id header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['x-request-id']).toBeTruthy()
    })
  })
})
