import { PrismaClient } from '@prisma/client';
import { getLogger } from './logger';

const prisma = new PrismaClient();

export interface HostCapacity {
  cpuCapacity: number;
  memoryCapacity: bigint;
  diskCapacity: bigint;
}

export interface ResourceRequest {
  cpuShares?: number;
  memory?: number; // bytes
}

export interface AllocationResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: {
    cpuUsed: number;
    memoryUsed: bigint;
    containerCount: number;
  };
  remaining?: {
    cpuAvailable: number;
    memoryAvailable: bigint;
  };
}

/**
 * Calculate current resource usage on a host by summing allocations from
 * all containers that are not in a terminal state (STOPPED, FAILED).
 */
export async function getHostUsage(hostId: string, tenantId: string) {
  const activeContainers = await prisma.container.findMany({
    where: {
      hostId,
      tenantId,
      status: { notIn: ['STOPPED', 'FAILED'] },
    },
    select: {
      resourceLimits: true,
    },
  });

  let cpuUsed = 0;
  let memoryUsed = BigInt(0);

  for (const container of activeContainers) {
    const limits = container.resourceLimits as Record<string, unknown> | null;
    if (limits) {
      if (typeof limits.cpuShares === 'number') cpuUsed += limits.cpuShares;
      if (typeof limits.memory === 'number') memoryUsed += BigInt(limits.memory);
      // Support legacy field name from containerService
      if (typeof limits.cpuQuota === 'number') cpuUsed += Math.ceil(limits.cpuQuota / 1000);
      if (typeof limits.memoryLimitBytes === 'number') memoryUsed += BigInt(limits.memoryLimitBytes);
    }
  }

  return { cpuUsed, memoryUsed, containerCount: activeContainers.length };
}

/**
 * Check if a host has enough capacity to fulfil a resource request.
 * Returns { allowed: true } if host has no capacity limits set (backwards-compatible).
 */
export async function checkResourceAllocation(
  hostId: string,
  tenantId: string,
  request: ResourceRequest
): Promise<AllocationResult> {
  const logger = getLogger();

  const host = await prisma.host.findFirst({
    where: { id: hostId, tenantId },
    select: { cpuCapacity: true, memoryCapacity: true, diskCapacity: true },
  });

  if (!host) {
    return { allowed: false, reason: 'Host not found or does not belong to tenant' };
  }

  // If no capacity limits are configured, allow (backwards-compatible)
  if (!host.cpuCapacity && !host.memoryCapacity) {
    return { allowed: true };
  }

  const usage = await getHostUsage(hostId, tenantId);

  const cpuCapacity = host.cpuCapacity ?? Infinity;
  const memoryCapacity = host.memoryCapacity ?? BigInt(Number.MAX_SAFE_INTEGER);

  const requestedCpu = request.cpuShares ?? 0;
  const requestedMemory = BigInt(request.memory ?? 0);

  const cpuAfter = usage.cpuUsed + requestedCpu;
  const memoryAfter = usage.memoryUsed + requestedMemory;

  if (cpuAfter > cpuCapacity) {
    logger.info(
      { hostId, cpuAfter, cpuCapacity },
      'Resource allocation denied: CPU over-commit'
    );
    return {
      allowed: false,
      reason: `CPU over-commit: ${cpuAfter} requested, ${cpuCapacity} available`,
      currentUsage: usage,
      remaining: {
        cpuAvailable: cpuCapacity - usage.cpuUsed,
        memoryAvailable: memoryCapacity - usage.memoryUsed,
      },
    };
  }

  if (memoryAfter > memoryCapacity) {
    logger.info(
      { hostId, memoryAfter: memoryAfter.toString(), memoryCapacity: memoryCapacity.toString() },
      'Resource allocation denied: memory over-commit'
    );
    return {
      allowed: false,
      reason: `Memory over-commit: ${memoryAfter} bytes requested, ${memoryCapacity} bytes available`,
      currentUsage: usage,
      remaining: {
        cpuAvailable: cpuCapacity - usage.cpuUsed,
        memoryAvailable: memoryCapacity - usage.memoryUsed,
      },
    };
  }

  return {
    allowed: true,
    currentUsage: usage,
    remaining: {
      cpuAvailable: cpuCapacity - cpuAfter,
      memoryAvailable: memoryCapacity - memoryAfter,
    },
  };
}

/**
 * Find the best host for a container using a simple bin-packing strategy:
 * pick the host with the most available resources that can satisfy the request.
 * Only considers ONLINE hosts belonging to the given tenant.
 */
export async function findBestHost(
  tenantId: string,
  request: ResourceRequest
): Promise<{ hostId: string; hostname: string } | null> {
  const hosts = await prisma.host.findMany({
    where: { tenantId, status: 'ONLINE' },
    select: { id: true, hostname: true, cpuCapacity: true, memoryCapacity: true },
  });

  if (hosts.length === 0) return null;

  let bestHost: { id: string; hostname: string; score: bigint } | null = null;

  for (const host of hosts) {
    const allocation = await checkResourceAllocation(host.id, tenantId, request);
    if (!allocation.allowed) continue;

    // Score = remaining memory (higher is better — "most-fit" strategy)
    const score = allocation.remaining?.memoryAvailable ?? BigInt(0);
    if (!bestHost || score > bestHost.score) {
      bestHost = { id: host.id, hostname: host.hostname, score };
    }
  }

  if (!bestHost) return null;
  return { hostId: bestHost.id, hostname: bestHost.hostname };
}
