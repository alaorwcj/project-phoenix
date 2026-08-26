import { PrismaClient, UsageEventType } from '@prisma/client';
import { getLogger } from './logger';

const prisma = new PrismaClient();
const log = getLogger({ component: 'cost-tracking' });

/**
 * Default pricing table (cents per hour) — kept in-memory for now.
 * A real deployment would pull this from a TenantPlan or Stripe Price object.
 */
export interface PricingTier {
  cpuShareCentsPerHour: number; // per 1 CPU share
  memoryGBCentsPerHour: number; // per 1 GB
}

export const DEFAULT_PRICING: PricingTier = {
  cpuShareCentsPerHour: 0.001, // $0.001 per share per hour
  memoryGBCentsPerHour: 0.5, // $0.005 per MB/hr = $0.50 per GB/hr
};

/**
 * Record a container start event. Stores cpu/memory allocation snapshot
 * so we can compute cost at stop time even if the container config changes.
 */
export async function recordContainerStart(params: {
  tenantId: string;
  containerId: string;
  cpuShares?: number;
  memoryBytes?: number;
  image?: string;
  hostId?: string;
}) {
  try {
    await prisma.usageEvent.create({
      data: {
        tenantId: params.tenantId,
        containerId: params.containerId,
        eventType: UsageEventType.CONTAINER_START,
        cpuShares: params.cpuShares ?? null,
        memoryBytes: params.memoryBytes ? BigInt(params.memoryBytes) : null,
        metadata: { image: params.image, hostId: params.hostId },
      },
    });
  } catch (err) {
    log.error({ err, params }, 'Failed to record container start usage event');
  }
}

/**
 * Record a container stop event. Calculates duration from the most recent
 * START event and computes cost based on the pricing tier.
 */
export async function recordContainerStop(params: {
  tenantId: string;
  containerId: string;
  pricing?: PricingTier;
}) {
  const tier = params.pricing ?? DEFAULT_PRICING;

  try {
    const startEvent = await prisma.usageEvent.findFirst({
      where: {
        tenantId: params.tenantId,
        containerId: params.containerId,
        eventType: UsageEventType.CONTAINER_START,
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!startEvent) {
      log.warn({ containerId: params.containerId }, 'No start event found; recording stop without duration');
      await prisma.usageEvent.create({
        data: {
          tenantId: params.tenantId,
          containerId: params.containerId,
          eventType: UsageEventType.CONTAINER_STOP,
        },
      });
      return;
    }

    const durationMs = Date.now() - startEvent.timestamp.getTime();
    const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
    const billingHours = durationSeconds / 3600;

    const cpuCost = (startEvent.cpuShares ?? 0) * tier.cpuShareCentsPerHour * billingHours;
    const memGB = Number(startEvent.memoryBytes ?? BigInt(0)) / (1024 * 1024 * 1024);
    const memoryCost = memGB * tier.memoryGBCentsPerHour * billingHours;
    const costCents = Math.round((cpuCost + memoryCost) * 100) / 100; // 2 decimal places

    await prisma.usageEvent.create({
      data: {
        tenantId: params.tenantId,
        containerId: params.containerId,
        eventType: UsageEventType.CONTAINER_STOP,
        cpuShares: startEvent.cpuShares,
        memoryBytes: startEvent.memoryBytes,
        durationSeconds,
        billingHours,
        costCents,
        metadata: { startEventId: startEvent.id },
      },
    });
  } catch (err) {
    log.error({ err, params }, 'Failed to record container stop usage event');
  }
}

/**
 * Aggregate cost for a tenant within a time window.
 * Returns total cost, total hours, and per-container breakdown.
 */
export async function getTenantUsageSummary(
  tenantId: string,
  from: Date,
  to: Date
): Promise<{
  totalCostCents: number;
  totalBillingHours: number;
  containerCount: number;
  events: Array<{ containerId: string | null; costCents: number; durationSeconds: number }>;
}> {
  const stopEvents = await prisma.usageEvent.findMany({
    where: {
      tenantId,
      eventType: UsageEventType.CONTAINER_STOP,
      timestamp: { gte: from, lte: to },
      costCents: { not: null },
    },
    select: {
      containerId: true,
      costCents: true,
      durationSeconds: true,
      billingHours: true,
    },
  });

  let totalCostCents = 0;
  let totalBillingHours = 0;
  const containerIds = new Set<string>();

  const events = stopEvents.map((e) => {
    const cost = Number(e.costCents ?? 0);
    totalCostCents += cost;
    totalBillingHours += Number(e.billingHours ?? 0);
    if (e.containerId) containerIds.add(e.containerId);
    return {
      containerId: e.containerId,
      costCents: cost,
      durationSeconds: e.durationSeconds ?? 0,
    };
  });

  return {
    totalCostCents: Math.round(totalCostCents * 100) / 100,
    totalBillingHours: Math.round(totalBillingHours * 100) / 100,
    containerCount: containerIds.size,
    events,
  };
}
