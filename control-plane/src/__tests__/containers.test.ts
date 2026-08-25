import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { createContainerService, ContainerService } from '../services/containerService';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-very-long-and-secure';

describe('Container Operations Tests', () => {
  let tenantId: string;
  let hostId: string;
  let containerService: ContainerService;

  beforeAll(async () => {
    containerService = createContainerService();

    // Clean up test data
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Container Test Tenant',
        slug: 'container-test',
        createdAt: new Date(),
      },
    });
    tenantId = tenant.id;

    // Create test host
    const host = await prisma.host.create({
      data: {
        name: 'test-docker-host',
        hostname: 'docker-host.local',
        agentId: 'agent-container-test',
        status: 'ONLINE',
        dockerVersion: '24.0.7',
        tenantId,
        metadata: { os: 'Linux' },
        lastHeartbeat: new Date(),
        createdAt: new Date(),
      },
    });
    hostId = host.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.containerLog.deleteMany({});
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Container Lifecycle', () => {
    it('should create a container with PENDING status', async () => {
      const result = await containerService.startContainer(tenantId, {
        name: 'test-app',
        image: 'nginx:latest',
        hostId,
        environmentVars: {
          ENVIRONMENT: 'test',
          DEBUG: 'true',
        },
        resourceLimits: {
          memoryLimitBytes: 1073741824, // 1GB
          cpuQuota: 1000000,
        },
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('test-app');
      expect(result.status).toBe('PENDING');

      // Verify container was created in database
      const container = await prisma.container.findUnique({
        where: { id: result.id },
      });
      expect(container).toBeDefined();
      expect(container?.image).toBe('nginx:latest');
      expect(container?.tenantId).toBe(tenantId);
      expect(container?.hostId).toBe(hostId);
    });

    it('should prevent creating container on non-existent host', async () => {
      const fakeHostId = 'fake-host-uuid';

      await expect(
        containerService.startContainer(tenantId, {
          name: 'should-fail',
          image: 'nginx:latest',
          hostId: fakeHostId,
        })
      ).rejects.toThrow('Host');
    });

    it('should update container status to RUNNING', async () => {
      const container = await prisma.container.create({
        data: {
          tenantId,
          hostId,
          dockerId: 'sha256:abc123',
          name: 'test-running',
          image: 'nginx:latest',
          status: 'PENDING',
          createdAt: new Date(),
        },
      });

      const updated = await containerService.updateContainerStatus(
        tenantId,
        container.id,
        'RUNNING'
      );

      expect(updated.status).toBe('RUNNING');
      expect(updated.startedAt).toBeDefined();
    });

    it('should update container status to STOPPED with timestamp', async () => {
      const container = await prisma.container.create({
        data: {
          tenantId,
          hostId,
          dockerId: 'sha256:def456',
          name: 'test-stopped',
          image: 'nginx:latest',
          status: 'RUNNING',
          startedAt: new Date(),
          createdAt: new Date(),
        },
      });

      const updated = await containerService.updateContainerStatus(
        tenantId,
        container.id,
        'STOPPED'
      );

      expect(updated.status).toBe('STOPPED');
      expect(updated.stoppedAt).toBeDefined();
    });

    it('should stop container with graceful shutdown', async () => {
      const container = await prisma.container.create({
        data: {
          tenantId,
          hostId,
          dockerId: 'sha256:ghi789',
          name: 'test-stop-graceful',
          image: 'nginx:latest',
          status: 'RUNNING',
          startedAt: new Date(),
          createdAt: new Date(),
        },
      });

      const result = await containerService.stopContainer(tenantId, {
        containerId: container.id,
        timeoutSeconds: 15,
      });

      expect(result.status).toBe('STOPPING');

      // Container should remain in database
      const verified = await prisma.container.findUnique({
        where: { id: container.id },
      });
      expect(verified).toBeDefined();
    });
  });

  describe('Container Querying', () => {
    beforeEach(async () => {
      // Create multiple containers for testing
      await prisma.container.createMany({
        data: [
          {
            tenantId,
            hostId,
            dockerId: 'sha256:query1',
            name: 'query-container-1',
            image: 'nginx:latest',
            status: 'RUNNING',
            startedAt: new Date(),
            createdAt: new Date(),
          },
          {
            tenantId,
            hostId,
            dockerId: 'sha256:query2',
            name: 'query-container-2',
            image: 'postgres:15',
            status: 'RUNNING',
            startedAt: new Date(),
            createdAt: new Date(),
          },
          {
            tenantId,
            hostId,
            dockerId: 'sha256:query3',
            name: 'query-container-3',
            image: 'redis:latest',
            status: 'STOPPED',
            stoppedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      });
    });

    it('should list all containers for a tenant', async () => {
      const containers = await containerService.listContainers(tenantId);
      expect(containers.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter containers by host', async () => {
      const containers = await containerService.listContainers(tenantId, hostId);
      expect(containers.length).toBeGreaterThanOrEqual(3);
      expect(containers.every((c: any) => c.hostId === hostId)).toBe(true);
    });

    it('should get specific container details', async () => {
      const created = await prisma.container.findFirst({
        where: { tenantId, hostId, name: 'query-container-1' },
      });

      if (!created) throw new Error('Container not created');

      const container = await containerService.getContainer(tenantId, created.id);
      expect(container.id).toBe(created.id);
      expect(container.name).toBe('query-container-1');
      expect(container.image).toBe('nginx:latest');
    });

    it('should prevent accessing container from wrong tenant', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Tenant',
          slug: `other-${Date.now()}`,
          createdAt: new Date(),
        },
      });

      const container = await prisma.container.findFirst({
        where: { tenantId, hostId },
      });

      if (!container) throw new Error('Container not found');

      await expect(
        containerService.getContainer(otherTenant.id, container.id)
      ).rejects.toThrow('Container');

      // Cleanup
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    });
  });

  describe('Container Logs', () => {
    let containerId: string;

    beforeEach(async () => {
      const container = await prisma.container.create({
        data: {
          tenantId,
          hostId,
          dockerId: 'sha256:logs123',
          name: 'test-logs',
          image: 'nginx:latest',
          status: 'RUNNING',
          startedAt: new Date(),
          createdAt: new Date(),
        },
      });
      containerId = container.id;
    });

    it('should record container stdout logs', async () => {
      const logData = Buffer.from('Server started on port 8080');

      await containerService.recordContainerLog(tenantId, containerId, 'stdout', logData);

      const logs = await prisma.containerLog.findMany({
        where: { containerId },
      });

      expect(logs.length).toBe(1);
      expect(logs[0].stream).toBe('stdout');
      expect(logs[0].data).toEqual(logData);
    });

    it('should record multiple log entries', async () => {
      const messages = ['Log line 1', 'Log line 2', 'Log line 3'];

      for (const msg of messages) {
        await containerService.recordContainerLog(
          tenantId,
          containerId,
          'stdout',
          Buffer.from(msg)
        );
      }

      const logs = await prisma.containerLog.findMany({
        where: { containerId },
        orderBy: { createdAt: 'asc' },
      });

      expect(logs.length).toBe(messages.length);
      expect(logs.map((l: any) => l.data.toString())).toEqual(messages);
    });

    it('should distinguish stdout and stderr', async () => {
      await containerService.recordContainerLog(
        tenantId,
        containerId,
        'stdout',
        Buffer.from('Standard output message')
      );

      await containerService.recordContainerLog(
        tenantId,
        containerId,
        'stderr',
        Buffer.from('Error message')
      );

      const stdoutLogs = await prisma.containerLog.findMany({
        where: { containerId, stream: 'stdout' },
      });

      const stderrLogs = await prisma.containerLog.findMany({
        where: { containerId, stream: 'stderr' },
      });

      expect(stdoutLogs.length).toBe(1);
      expect(stderrLogs.length).toBe(1);
    });

    it('should prevent logging to container from wrong tenant', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Log Test Tenant',
          slug: `log-test-${Date.now()}`,
          createdAt: new Date(),
        },
      });

      await expect(
        containerService.recordContainerLog(
          otherTenant.id,
          containerId,
          'stdout',
          Buffer.from('Should fail')
        )
      ).rejects.toThrow('Container');

      // Cleanup
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('should isolate containers between tenants', async () => {
      const tenant2 = await prisma.tenant.create({
        data: {
          name: 'Isolation Test Tenant 2',
          slug: `isolate-${Date.now()}`,
          createdAt: new Date(),
        },
      });

      const host2 = await prisma.host.create({
        data: {
          name: 'test-docker-host-2',
          hostname: 'docker-host-2.local',
          agentId: 'agent-isolation-2',
          status: 'ONLINE',
          dockerVersion: '24.0.7',
          tenantId: tenant2.id,
          metadata: {},
          lastHeartbeat: new Date(),
          createdAt: new Date(),
        },
      });

      // Create container in tenant 1
      const container1 = await containerService.startContainer(tenantId, {
        name: 'tenant1-container',
        image: 'nginx:latest',
        hostId,
      });

      // Create container in tenant 2
      const container2 = await containerService.startContainer(tenant2.id, {
        name: 'tenant2-container',
        image: 'nginx:latest',
        hostId: host2.id,
      });

      // Tenant 1 should only see their containers
      const tenant1Containers = await containerService.listContainers(tenantId);
      expect(tenant1Containers.some((c: any) => c.id === container1.id)).toBe(true);
      expect(tenant1Containers.some((c: any) => c.id === container2.id)).toBe(false);

      // Tenant 2 should only see their containers
      const tenant2Containers = await containerService.listContainers(tenant2.id);
      expect(tenant2Containers.some((c: any) => c.id === container2.id)).toBe(true);
      expect(tenant2Containers.some((c: any) => c.id === container1.id)).toBe(false);

      // Cleanup
      await prisma.host.delete({ where: { id: host2.id } });
      await prisma.tenant.delete({ where: { id: tenant2.id } });
    });
  });
});
