import { PrismaClient, HostStatus } from '@prisma/client';
import { getLogger } from './logger';

const prisma = new PrismaClient();

const log = getLogger({ component: 'host-health' });

export interface HostHealthSummary {
  total: number;
  online: number;
  stale: number;
  offline: number;
  staleHosts: Array<{ id: string; name: string; lastHeartbeat: Date | null }>;
}

export interface MigrationTarget {
  hostId: string;
  name: string;
  cpuAvailable: number;
  memoryAvailable: bigint;
}

/**
 * Mark hosts as OFFLINE if they haven't sent a heartbeat within the threshold.
 * This should be invoked periodically (e.g. once a minute) by a scheduler.
 */
export async function evaluateHostHealth(staleAfterMs = 60_000): Promise<HostHealthSummary> {
  const cutoff = new Date(Date.now() - staleAfterMs);

  const hosts = await prisma.host.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      lastHeartbeat: true,
    },
  });

  const staleIds: string[] = [];
  const staleHosts: HostHealthSummary['staleHosts'] = [];

  for (const host of hosts) {
    if (host.status === HostStatus.OFFLINE) continue;
    const stale = !host.lastHeartbeat || host.lastHeartbeat < cutoff;
    if (stale) {
      staleIds.push(host.id);
      staleHosts.push({ id: host.id, name: host.name, lastHeartbeat: host.lastHeartbeat });
    }
  }

  if (staleIds.length > 0) {
    await prisma.host.updateMany({
      where: { id: { in: staleIds } },
      data: { status: HostStatus.OFFLINE },
    });
    log.warn({ count: staleIds.length, hostIds: staleIds }, 'Marked stale hosts as OFFLINE');
  }

  return {
    total: hosts.length,
    online: hosts.filter((h) => h.status === HostStatus.ONLINE && !staleIds.includes(h.id)).length,
    stale: staleIds.length,
    offline: hosts.filter((h) => h.status === HostStatus.OFFLINE).length,
    staleHosts,
  };
}

/**
 * Recover hosts that were marked OFFLINE but have sent a fresh heartbeat.
 * Heartbeats already flip status back to ONLINE via the gRPC layer, but this
 * helper exists for bulk reconciliation or tests.
 */
export async function reconcileFreshHosts(freshWindowMs = 5_000): Promise<number> {
  const cutoff = new Date(Date.now() - freshWindowMs);
  const result = await prisma.host.updateMany({
    where: {
      status: HostStatus.OFFLINE,
      lastHeartbeat: { gte: cutoff },
    },
    data: { status: HostStatus.ONLINE },
  });
  if (result.count > 0) {
    log.info({ count: result.count }, 'Recovered hosts marked OFFLINE with recent heartbeats');
  }
  return result.count;
}

/**
 * Find alternative hosts in the same tenant that could absorb containers
 * running on an unhealthy host. Considers capacity and tenant isolation.
 */
export async function findMigrationTargets(
  tenantId: string,
  excludeHostId: string,
  request: { cpuShares?: number; memory?: number }
): Promise<MigrationTarget[]> {
  const candidates = await prisma.host.findMany({
    where: {
      tenantId,
      id: { not: excludeHostId },
      status: HostStatus.ONLINE,
    },
    select: {
      id: true,
      name: true,
      cpuCapacity: true,
      memoryCapacity: true,
      containers: {
        where: { status: { notIn: ['STOPPED', 'FAILED'] } },
        select: { resourceLimits: true },
      },
    },
  });

  const targets: MigrationTarget[] = [];

  for (const host of candidates) {
    let cpuUsed = 0;
    let memoryUsed = BigInt(0);
    for (const c of host.containers) {
      const limits = c.resourceLimits as Record<string, unknown> | null;
      if (limits) {
        if (typeof limits.cpuShares === 'number') cpuUsed += limits.cpuShares;
        if (typeof limits.memory === 'number') memoryUsed += BigInt(limits.memory);
        if (typeof limits.cpuQuota === 'number') cpuUsed += Math.ceil(limits.cpuQuota / 1000);
        if (typeof limits.memoryLimitBytes === 'number') memoryUsed += BigInt(limits.memoryLimitBytes);
      }
    }

    const cpuAvailable = host.cpuCapacity ? Math.max(0, host.cpuCapacity - cpuUsed) : Number.MAX_SAFE_INTEGER;
    const memoryAvailable = host.memoryCapacity
      ? memoryUsed < host.memoryCapacity
        ? host.memoryCapacity - memoryUsed
        : BigInt(0)
      : BigInt(Number.MAX_SAFE_INTEGER);

    if (cpuAvailable >= (request.cpuShares ?? 0) && memoryAvailable >= BigInt(request.memory ?? 0)) {
      targets.push({ hostId: host.id, name: host.name, cpuAvailable, memoryAvailable });
    }
  }

  // Sort by most memory available (most-fit, prefer the host that can absorb more)
  return targets.sort((a, b) => (b.memoryAvailable > a.memoryAvailable ? 1 : -1));
}

/**
 * Container migration is non-destructive: it stops the container on the
 * unhealthy host (via the control plane) and schedules a start on the
 * migration target. Operators must approve destructive migrations in the UI.
 *
 * This helper returns the recommended targets but does NOT perform the
 * migration; actual restart logic stays in the container service.
 */
export async function planFailover(
  tenantId: string,
  unhealthyHostId: string
): Promise<{ containers: number; targets: MigrationTarget[] }> {
  const runningContainers = await prisma.container.findMany({
    where: {
      tenantId,
      hostId: unhealthyHostId,
      status: { notIn: ['STOPPED', 'FAILED'] },
    },
    select: { resourceLimits: true },
  });

  if (runningContainers.length === 0) {
    return { containers: 0, targets: [] };
  }

  const aggregateRequest = runningContainers.reduce(
    (acc, c) => {
      const limits = c.resourceLimits as Record<string, unknown> | null;
      if (limits) {
        if (typeof limits.cpuShares === 'number') acc.cpuShares += limits.cpuShares;
        if (typeof limits.memory === 'number') acc.memory += limits.memory;
      }
      return acc;
    },
    { cpuShares: 0, memory: 0 }
  );

  const targets = await findMigrationTargets(tenantId, unhealthyHostId, aggregateRequest);
  return { containers: runningContainers.length, targets };
}