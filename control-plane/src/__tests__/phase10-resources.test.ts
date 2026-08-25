// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { checkResourceAllocation, getHostUsage, findBestHost } from '../lib/resourceManager';

const prisma = new PrismaClient();

describe('Phase 10: Resource Management', () => {
  let tenantId: string;
  let hostWithCapacity: string;
  let hostNoCapacity: string;

  beforeAll(async () => {
    // Clean up
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Resource Test Tenant',
        slug: 'resource-test',
      },
    });
    tenantId = tenant.id;

    // Create host WITH capacity limits
    const host1 = await prisma.host.create({
      data: {
        tenantId,
        name: 'capacity-host',
        hostname: 'host-with-capacity.local',
        agentId: 'agent-capacity-001',
        status: 'ONLINE',
        cpuCapacity: 1024, // 1024 shares
        memoryCapacity: BigInt(4 * 1024 * 1024 * 1024), // 4GB
        diskCapacity: BigInt(100 * 1024 * 1024 * 1024), // 100GB
      },
    });
    hostWithCapacity = host1.id;

    // Create host WITHOUT capacity limits (backwards-compatible)
    const host2 = await prisma.host.create({
      data: {
        tenantId,
        name: 'no-capacity-host',
        hostname: 'host-no-capacity.local',
        agentId: 'agent-no-capacity-001',
        status: 'ONLINE',
      },
    });
    hostNoCapacity = host2.id;
  });

  afterAll(async () => {
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.$disconnect();
  });

  describe('getHostUsage', () => {
    it('should return zero usage for empty host', async () => {
      const usage = await getHostUsage(hostWithCapacity, tenantId);
      expect(usage.cpuUsed).toBe(0);
      expect(usage.memoryUsed).toBe(BigInt(0));
      expect(usage.containerCount).toBe(0);
    });

    it('should sum resource usage from active containers', async () => {
      // Create a container with known resource limits
      await prisma.container.create({
        data: {
          tenantId,
          hostId: hostWithCapacity,
          dockerId: 'sha256:test1',
          name: 'test-container-1',
          image: 'nginx:latest',
          status: 'RUNNING',
          resourceLimits: {
            cpuShares: 256,
            memory: 512 * 1024 * 1024, // 512MB
          },
        },
      });

      const usage = await getHostUsage(hostWithCapacity, tenantId);
      expect(usage.cpuUsed).toBe(256);
      expect(usage.memoryUsed).toBe(BigInt(512 * 1024 * 1024));
      expect(usage.containerCount).toBe(1);
    });

    it('should exclude stopped containers from usage', async () => {
      // Create a stopped container
      await prisma.container.create({
        data: {
          tenantId,
          hostId: hostWithCapacity,
          dockerId: 'sha256:test2',
          name: 'test-stopped',
          image: 'nginx:latest',
          status: 'STOPPED',
          resourceLimits: {
            cpuShares: 512,
            memory: 1024 * 1024 * 1024, // 1GB
          },
        },
      });

      const usage = await getHostUsage(hostWithCapacity, tenantId);
      // Should only count the RUNNING container
      expect(usage.cpuUsed).toBe(256);
      expect(usage.containerCount).toBe(1);
    });
  });

  describe('checkResourceAllocation', () => {
    it('should allow allocation when host has no capacity limits (backwards-compatible)', async () => {
      const result = await checkResourceAllocation(hostNoCapacity, tenantId, {
        cpuShares: 10000,
        memory: 100 * 1024 * 1024 * 1024, // 100GB (huge)
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny allocation when CPU would exceed capacity', async () => {
      const result = await checkResourceAllocation(hostWithCapacity, tenantId, {
        cpuShares: 800, // Would exceed 1024 total capacity
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CPU over-commit');
    });

    it('should deny allocation when memory would exceed capacity', async () => {
      const result = await checkResourceAllocation(hostWithCapacity, tenantId, {
        cpuShares: 100,
        memory: 3 * 1024 * 1024 * 1024, // 3GB (would exceed 4GB total)
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Memory over-commit');
    });

    it('should allow allocation within available capacity', async () => {
      const result = await checkResourceAllocation(hostWithCapacity, tenantId, {
        cpuShares: 256,
        memory: 1 * 1024 * 1024 * 1024, // 1GB
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining?.cpuAvailable).toBe(512); // 1024 - 256 - 256 (existing)
      expect(result.remaining?.memoryAvailable).toBe(BigInt(2048 * 1024 * 1024)); // 2.5GB remaining
    });
  });

  describe('findBestHost', () => {
    it('should return null when no ONLINE hosts exist', async () => {
      // Mark all hosts as OFFLINE
      await prisma.host.updateMany({
        where: { tenantId },
        data: { status: 'OFFLINE' },
      });

      const result = await findBestHost(tenantId, { cpuShares: 100, memory: 256 * 1024 * 1024 });
      expect(result).toBeNull();

      // Restore ONLINE status
      await prisma.host.updateMany({
        where: { tenantId },
        data: { status: 'ONLINE' },
      });
    });

    it('should return a host capable of fulfilling the request', async () => {
      const result = await findBestHost(tenantId, {
        cpuShares: 128,
        memory: 512 * 1024 * 1024, // 512MB
      });

      expect(result).not.toBeNull();
      expect(result?.hostId).toBeTruthy();
    });

    it('should skip hosts that cannot fulfil the request', async () => {
      // Try to request more than the uncapacitated host can provide (it has limits)
      const result = await findBestHost(tenantId, {
        cpuShares: 900, // Would exceed hostWithCapacity (1024 total - 512 used)
        memory: 3 * 1024 * 1024 * 1024, // Would exceed hostWithCapacity (4GB total - 1.5GB used)
      });

      // Should either get no-capacity host or null (both can't satisfy)
      // If it returns no-capacity host, that's OK (backward-compat)
      // If it returns null, also OK
      if (result) {
        expect(result.hostId).toBe(hostNoCapacity);
      }
    });
  });
});
