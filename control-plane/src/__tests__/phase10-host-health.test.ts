// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  evaluateHostHealth,
  reconcileFreshHosts,
  findMigrationTargets,
  planFailover,
} from '../lib/hostHealth';

const prisma = new PrismaClient();

describe('Phase 10.2: Multi-Host Orchestration', () => {
  let tenantId: string;
  let onlineHostId: string;
  let staleHostId: string;
  let healthyHostId: string;

  beforeAll(async () => {
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.tenant.deleteMany({});

    const tenant = await prisma.tenant.create({
      data: { name: 'Orchestration Tenant', slug: 'orchestration-test' },
    });
    tenantId = tenant.id;

    onlineHostId = (
      await prisma.host.create({
        data: {
          tenantId,
          name: 'online-host',
          hostname: 'online.local',
          agentId: 'agent-online',
          status: 'ONLINE',
          lastHeartbeat: new Date(),
          cpuCapacity: 1024,
          memoryCapacity: BigInt(2 * 1024 * 1024 * 1024),
        },
      })
    ).id;

    staleHostId = (
      await prisma.host.create({
        data: {
          tenantId,
          name: 'stale-host',
          hostname: 'stale.local',
          agentId: 'agent-stale',
          status: 'ONLINE',
          // 5 minutes ago — well past the 60s threshold
          lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000),
          cpuCapacity: 1024,
          memoryCapacity: BigInt(2 * 1024 * 1024 * 1024),
        },
      })
    ).id;

    healthyHostId = (
      await prisma.host.create({
        data: {
          tenantId,
          name: 'healthy-host',
          hostname: 'healthy.local',
          agentId: 'agent-healthy',
          status: 'ONLINE',
          lastHeartbeat: new Date(),
          cpuCapacity: 1024,
          memoryCapacity: BigInt(2 * 1024 * 1024 * 1024),
        },
      })
    ).id;
  });

  beforeEach(async () => {
    // Reset stale-host status so we can re-evaluate cleanly
    await prisma.host.update({
      where: { id: staleHostId },
      data: { status: 'ONLINE' },
    });
    await prisma.container.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.$disconnect();
  });

  it('marks hosts OFFLINE when heartbeat is stale', async () => {
    const summary = await evaluateHostHealth(60_000);

    expect(summary.stale).toBe(1);
    expect(summary.staleHosts[0].id).toBe(staleHostId);

    const reloaded = await prisma.host.findUnique({ where: { id: staleHostId } });
    expect(reloaded?.status).toBe('OFFLINE');
  });

  it('does not mark recently-active hosts OFFLINE', async () => {
    await evaluateHostHealth(60_000);
    const online = await prisma.host.findUnique({ where: { id: onlineHostId } });
    expect(online?.status).toBe('ONLINE');
  });

  it('reconciles OFFLINE hosts back to ONLINE when heartbeats resume', async () => {
    await evaluateHostHealth(60_000);
    const down = await prisma.host.findUnique({ where: { id: staleHostId } });
    expect(down?.status).toBe('OFFLINE');

    // Send a fresh heartbeat
    await prisma.host.update({
      where: { id: staleHostId },
      data: { lastHeartbeat: new Date() },
    });

    const recovered = await reconcileFreshHosts(5_000);
    expect(recovered).toBeGreaterThanOrEqual(1);

    const upAgain = await prisma.host.findUnique({ where: { id: staleHostId } });
    expect(upAgain?.status).toBe('ONLINE');
  });

  it('finds migration targets with available capacity', async () => {
    // Saturate online host with one container
    await prisma.container.create({
      data: {
        tenantId,
        hostId: onlineHostId,
        name: 'busy-container',
        image: 'nginx:latest',
        dockerId: 'docker-busy-001',
        status: 'RUNNING',
        resourceLimits: { cpuShares: 768, memory: 1.5 * 1024 * 1024 * 1024 },
      },
    });

    const targets = await findMigrationTargets(tenantId, onlineHostId, {
      cpuShares: 256,
      memory: 256 * 1024 * 1024,
    });

    // healthy host has free capacity; stale is excluded because it's now OFFLINE
    expect(targets.some((t) => t.hostId === healthyHostId)).toBe(true);
    expect(targets.find((t) => t.hostId === staleHostId)).toBeUndefined();
  });

  it('skips hosts that cannot fit the requested resources', async () => {
    // Fill healthy host entirely
    await prisma.container.create({
      data: {
        tenantId,
        hostId: healthyHostId,
        name: 'full-container',
        image: 'nginx:latest',
        dockerId: 'docker-full-001',
        status: 'RUNNING',
        resourceLimits: { cpuShares: 1024, memory: 2 * 1024 * 1024 * 1024 },
      },
    });

    const targets = await findMigrationTargets(tenantId, healthyHostId, {
      cpuShares: 1,
      memory: 1,
    });

    expect(targets.find((t) => t.hostId === healthyHostId)).toBeUndefined();
  });

  it('plans a failover reporting running container count and targets', async () => {
    // Make staleHost a target by giving it fresh heartbeat
    await prisma.host.update({
      where: { id: staleHostId },
      data: { lastHeartbeat: new Date() },
    });

    await prisma.container.createMany({
      data: [
        {
          tenantId,
          hostId: staleHostId,
          name: 'failover-1',
          image: 'redis:latest',
          dockerId: 'docker-fo-001',
          status: 'RUNNING',
          resourceLimits: { cpuShares: 128, memory: 128 * 1024 * 1024 },
        },
        {
          tenantId,
          hostId: staleHostId,
          name: 'failover-2',
          image: 'postgres:latest',
          dockerId: 'docker-fo-002',
          status: 'RUNNING',
          resourceLimits: { cpuShares: 256, memory: 512 * 1024 * 1024 },
        },
      ],
    });

    const plan = await planFailover(tenantId, staleHostId);
    expect(plan.containers).toBe(2);
    expect(plan.targets.length).toBeGreaterThan(0);
  });

  it('returns zero containers when nothing runs on the unhealthy host', async () => {
    const plan = await planFailover(tenantId, staleHostId);
    expect(plan.containers).toBe(0);
    expect(plan.targets).toEqual([]);
  });
});