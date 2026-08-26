// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  recordContainerStart,
  recordContainerStop,
  getTenantUsageSummary,
  DEFAULT_PRICING,
} from '../lib/costTracking';

const prisma = new PrismaClient();

describe('Phase 10.3: Cost Tracking', () => {
  let tenantId: string;
  let hostId: string;
  let containerId: string;

  beforeAll(async () => {
    await prisma.usageEvent.deleteMany({});
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.tenant.deleteMany({});

    const tenant = await prisma.tenant.create({
      data: { name: 'Cost Tracking Tenant', slug: 'cost-test' },
    });
    tenantId = tenant.id;

    const host = await prisma.host.create({
      data: {
        tenantId,
        name: 'cost-host',
        hostname: 'cost-host.local',
        agentId: 'agent-cost-001',
        status: 'ONLINE',
        lastHeartbeat: new Date(),
      },
    });
    hostId = host.id;

    const container = await prisma.container.create({
      data: {
        tenantId,
        hostId,
        name: 'cost-container',
        image: 'nginx:latest',
        dockerId: 'docker-cost-001',
        status: 'RUNNING',
        resourceLimits: { cpuShares: 256, memory: 512 * 1024 * 1024 },
      },
    });
    containerId = container.id;
  });

  afterAll(async () => {
    await prisma.usageEvent.deleteMany({});
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.$disconnect();
  });

  it('records a container start event', async () => {
    await recordContainerStart({
      tenantId,
      containerId,
      cpuShares: 256,
      memoryBytes: 512 * 1024 * 1024,
      image: 'nginx:latest',
      hostId,
    });

    const event = await prisma.usageEvent.findFirst({
      where: { tenantId, containerId, eventType: 'CONTAINER_START' },
    });

    expect(event).not.toBeNull();
    expect(event?.cpuShares).toBe(256);
    expect(event?.memoryBytes).toBe(BigInt(512 * 1024 * 1024));
  });

  it('records a container stop event with cost and duration', async () => {
    // Small artificial wait to ensure duration > 0
    await new Promise((resolve) => setTimeout(resolve, 100));

    await recordContainerStop({ tenantId, containerId });

    const stopEvent = await prisma.usageEvent.findFirst({
      where: { tenantId, containerId, eventType: 'CONTAINER_STOP' },
    });

    expect(stopEvent).not.toBeNull();
    expect(Number(stopEvent?.durationSeconds)).toBeGreaterThanOrEqual(0);
    expect(stopEvent?.costCents).not.toBeNull();
  });

  it('calculates non-zero cost for containers with resources allocated', async () => {
    const newContainerId = (
      await prisma.container.create({
        data: {
          tenantId,
          hostId,
          name: 'billed-container',
          image: 'redis:latest',
          dockerId: 'docker-billed-001',
          status: 'STOPPED',
        },
      })
    ).id;

    await prisma.usageEvent.create({
      data: {
        tenantId,
        containerId: newContainerId,
        eventType: 'CONTAINER_START',
        cpuShares: 512,
        memoryBytes: BigInt(1024 * 1024 * 1024), // 1 GB
        timestamp: new Date(Date.now() - 3600_000), // 1 hour ago
      },
    });

    await recordContainerStop({ tenantId, containerId: newContainerId });

    const stopEvent = await prisma.usageEvent.findFirst({
      where: { tenantId, containerId: newContainerId, eventType: 'CONTAINER_STOP' },
    });

    const cost = Number(stopEvent?.costCents ?? 0);
    expect(cost).toBeGreaterThan(0);

    // Expected: 512 * 0.001 $/share/hr * 1hr = $0.512 cpu
    //         + 1GB * 0.50 $/GB/hr * 1hr = $0.50 memory
    //         = ~$1.01 -> costCents ~ 1.01
    expect(cost).toBeGreaterThan(0.5);
  });

  it('aggregates usage summary for tenant over a date window', async () => {
    const from = new Date(Date.now() - 7 * 24 * 3600_000);
    const to = new Date();

    const summary = await getTenantUsageSummary(tenantId, from, to);

    expect(summary.containerCount).toBeGreaterThan(0);
    expect(summary.totalCostCents).toBeGreaterThan(0);
    expect(summary.events.length).toBeGreaterThan(0);
  });

  it('returns zero for empty date window with no events', async () => {
    const from = new Date(Date.now() - 365 * 24 * 3600_000); // 1 year ago
    const to = new Date(Date.now() - 364 * 24 * 3600_000); // 364 days ago

    const summary = await getTenantUsageSummary(tenantId, from, to);

    expect(summary.totalCostCents).toBe(0);
    expect(summary.containerCount).toBe(0);
    expect(summary.events).toHaveLength(0);
  });

  it('handles stop event without prior start event gracefully', async () => {
    const noStartContainerId = (
      await prisma.container.create({
        data: {
          tenantId,
          hostId,
          name: 'orphan-container',
          image: 'alpine:latest',
          dockerId: 'docker-orphan-001',
          status: 'STOPPED',
        },
      })
    ).id;

    // Should not throw — logs warning and creates a stop event without cost
    await expect(
      recordContainerStop({ tenantId, containerId: noStartContainerId })
    ).resolves.not.toThrow();

    const stopEvent = await prisma.usageEvent.findFirst({
      where: { tenantId, containerId: noStartContainerId, eventType: 'CONTAINER_STOP' },
    });

    expect(stopEvent).not.toBeNull();
    expect(stopEvent?.costCents).toBeNull();
  });

  it('exports DEFAULT_PRICING with expected keys', () => {
    expect(DEFAULT_PRICING).toHaveProperty('cpuShareCentsPerHour');
    expect(DEFAULT_PRICING).toHaveProperty('memoryGBCentsPerHour');
    expect(DEFAULT_PRICING.cpuShareCentsPerHour).toBeGreaterThan(0);
    expect(DEFAULT_PRICING.memoryGBCentsPerHour).toBeGreaterThan(0);
  });
});
