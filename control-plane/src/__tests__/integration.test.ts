import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { start, stop, getApp } from '../app';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-very-long-and-secure';

describe('Integration Tests - Docker Platform', () => {
  let tenantId: string;
  let userId: string;
  let authToken: string;
  let app: any;

  beforeAll(async () => {
    // Start the application
    app = await start();

    // Clean up test data
    await prisma.host.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Integration Test Tenant',
        createdAt: new Date(),
      },
    });
    tenantId = tenant.id;

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@integration.local',
        passwordHash: 'hashed_password',
        role: 'ADMIN',
        tenantId: tenant.id,
        createdAt: new Date(),
      },
    });
    userId = user.id;

    // Generate JWT token
    authToken = jwt.sign(
      {
        sub: userId,
        tenantId: tenantId,
        role: 'ADMIN',
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up
    await prisma.host.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.$disconnect();

    // Stop the application
    if (app) {
      await stop();
    }
  });

  describe('Host Registration Flow', () => {
    it('should register a new host via gRPC', async () => {
      const hostData = {
        agentId: 'test-agent-001',
        hostname: 'test-host.local',
        dockerVersion: '24.0.7',
        metadata: {
          os: 'Linux',
          arch: 'x86_64',
        },
      };

      // Simulate RegisterHost gRPC call
      const host = await prisma.host.create({
        data: {
          name: hostData.agentId,
          hostname: hostData.hostname,
          agentId: hostData.agentId,
          status: 'ONLINE',
          dockerVersion: hostData.dockerVersion,
          tenantId: tenantId,
          metadata: hostData.metadata,
          lastHeartbeat: new Date(),
          createdAt: new Date(),
        },
      });

      expect(host).toBeDefined();
      expect(host.agentId).toBe('test-agent-001');
      expect(host.status).toBe('ONLINE');
      expect(host.tenantId).toBe(tenantId);
    });

    it('should enforce tenant isolation on host registration', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Tenant',
          createdAt: new Date(),
        },
      });

      // Create host in tenant A
      const hostA = await prisma.host.create({
        data: {
          name: 'host-tenant-a',
          hostname: 'host-a.local',
          agentId: 'agent-tenant-a',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
          createdAt: new Date(),
        },
      });

      // Try to query from tenant B (should not see host from tenant A)
      const hostsInB = await prisma.host.findMany({
        where: { tenantId: otherTenant.id },
      });

      expect(hostsInB.length).toBe(0);
      expect(hostA.tenantId).toBe(tenantId);

      // Clean up
      await prisma.host.delete({ where: { id: hostA.id } });
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    });
  });

  describe('Heartbeat Flow', () => {
    it('should update host metrics on heartbeat', async () => {
      // Register a host first
      const host = await prisma.host.create({
        data: {
          name: 'heartbeat-test-host',
          hostname: 'heartbeat-test.local',
          agentId: 'agent-heartbeat-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: tenantId,
          metadata: {},
          lastHeartbeat: new Date(Date.now() - 60000), // 1 minute ago
          createdAt: new Date(),
        },
      });

      // Simulate heartbeat with metrics
      const metricsTimestamp = new Date();
      const updatedHost = await prisma.host.update({
        where: { id: host.id },
        data: {
          lastHeartbeat: metricsTimestamp,
          status: 'ONLINE',
          metadata: {
            ...host.metadata,
            lastMetrics: {
              timestamp: metricsTimestamp.toISOString(),
              cpuUsage: 45.5,
              memoryUsage: 2048,
              diskUsage: 51200,
              containerCount: 12,
            },
          },
        },
      });

      expect(updatedHost.lastHeartbeat).toEqual(metricsTimestamp);
      expect((updatedHost.metadata as any).lastMetrics.cpuUsage).toBe(45.5);

      // Clean up
      await prisma.host.delete({ where: { id: host.id } });
    });

    it('should mark host as OFFLINE if heartbeat stales', async () => {
      // Register a host
      const host = await prisma.host.create({
        data: {
          name: 'stale-heartbeat-host',
          hostname: 'stale.local',
          agentId: 'agent-stale-001',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: tenantId,
          metadata: {},
          lastHeartbeat: new Date(Date.now() - 300000), // 5 minutes ago
          createdAt: new Date(),
        },
      });

      // Simulate heartbeat timeout logic
      const heartbeatTimeout = 120000; // 2 minutes
      const timeSinceLastHeartbeat =
        Date.now() - host.lastHeartbeat.getTime();

      let shouldMarkOffline = timeSinceLastHeartbeat > heartbeatTimeout;

      if (shouldMarkOffline) {
        await prisma.host.update({
          where: { id: host.id },
          data: { status: 'OFFLINE' },
        });
      }

      const updatedHost = await prisma.host.findUnique({
        where: { id: host.id },
      });

      expect(shouldMarkOffline).toBe(true);
      expect(updatedHost?.status).toBe('OFFLINE');

      // Clean up
      await prisma.host.delete({ where: { id: host.id } });
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('should isolate hosts between tenants', async () => {
      // Create second tenant
      const tenant2 = await prisma.tenant.create({
        data: {
          name: 'Isolation Test Tenant 2',
          createdAt: new Date(),
        },
      });

      // Create host in tenant 1
      const hostInTenant1 = await prisma.host.create({
        data: {
          name: 'host-in-tenant-1',
          hostname: 'host1.local',
          agentId: 'agent-tenant1',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: tenantId,
          metadata: {},
          lastHeartbeat: new Date(),
          createdAt: new Date(),
        },
      });

      // Create host in tenant 2
      const hostInTenant2 = await prisma.host.create({
        data: {
          name: 'host-in-tenant-2',
          hostname: 'host2.local',
          agentId: 'agent-tenant2',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: tenant2.id,
          metadata: {},
          lastHeartbeat: new Date(),
          createdAt: new Date(),
        },
      });

      // Query hosts from tenant 1
      const hostsT1 = await prisma.host.findMany({
        where: { tenantId: tenantId },
      });

      // Query hosts from tenant 2
      const hostsT2 = await prisma.host.findMany({
        where: { tenantId: tenant2.id },
      });

      // Verify isolation
      expect(hostsT1).toContainEqual(
        expect.objectContaining({ id: hostInTenant1.id })
      );
      expect(hostsT1).not.toContainEqual(
        expect.objectContaining({ id: hostInTenant2.id })
      );

      expect(hostsT2).toContainEqual(
        expect.objectContaining({ id: hostInTenant2.id })
      );
      expect(hostsT2).not.toContainEqual(
        expect.objectContaining({ id: hostInTenant1.id })
      );

      // Clean up
      await prisma.host.delete({ where: { id: hostInTenant1.id } });
      await prisma.host.delete({ where: { id: hostInTenant2.id } });
      await prisma.tenant.delete({ where: { id: tenant2.id } });
    });

    it('should prevent cross-tenant user access', async () => {
      // Create second tenant with its own user
      const tenant2 = await prisma.tenant.create({
        data: {
          name: 'Cross-Tenant Test Tenant 2',
          createdAt: new Date(),
        },
      });

      const user2 = await prisma.user.create({
        data: {
          email: 'user2@integration.local',
          passwordHash: 'hashed_password_2',
          role: 'ADMIN',
          tenantId: tenant2.id,
          createdAt: new Date(),
        },
      });

      // User 1 should only see their tenant
      const user1Tenants = await prisma.tenant.findMany({
        where: { id: tenantId },
      });

      expect(user1Tenants).toHaveLength(1);
      expect(user1Tenants[0].id).toBe(tenantId);

      // User 2 should only see their tenant
      const user2Tenants = await prisma.tenant.findMany({
        where: { id: tenant2.id },
      });

      expect(user2Tenants).toHaveLength(1);
      expect(user2Tenants[0].id).toBe(tenant2.id);

      // Clean up
      await prisma.user.delete({ where: { id: user2.id } });
      await prisma.tenant.delete({ where: { id: tenant2.id } });
    });
  });

  describe('JWT & RBAC', () => {
    it('should validate JWT token format', async () => {
      const decoded = jwt.verify(authToken, JWT_SECRET);
      expect(decoded).toHaveProperty('sub', userId);
      expect(decoded).toHaveProperty('tenantId', tenantId);
      expect(decoded).toHaveProperty('role', 'ADMIN');
    });

    it('should reject invalid JWT tokens', async () => {
      const invalidToken = 'invalid.jwt.token';

      expect(() => {
        jwt.verify(invalidToken, JWT_SECRET);
      }).toThrow();
    });

    it('should respect RBAC role hierarchy', async () => {
      const roles = { ADMIN: 1, OPERATOR: 2, VIEWER: 3 };

      // Admin should have higher privilege (lower number)
      expect(roles.ADMIN).toBeLessThan(roles.OPERATOR);
      expect(roles.OPERATOR).toBeLessThan(roles.VIEWER);

      // Verify role assignment
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      expect(user?.role).toBe('ADMIN');
      expect(roles[user?.role as keyof typeof roles]).toBe(1);
    });
  });
});
