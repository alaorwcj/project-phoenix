import { PrismaClient, HostStatus } from '@prisma/client';
import { getLogger } from './logger';

const prisma = new PrismaClient();
const log = getLogger({ component: 'agent-registry' });

/**
 * Agent metadata stored in Host.metadata during registration.
 * Includes the gRPC address where the agent can be reached.
 */
export interface AgentMetadata {
  grpcAddress?: string; // e.g., "localhost:50051" or "10.0.1.5:50051"
  agentId?: string;
  osVersion?: string;
  dockerVersion?: string;
  agentVersion?: string;
}

/**
 * Registry entry for an online agent.
 */
export interface AgentRegistryEntry {
  hostId: string;
  tenantId: string;
  hostname: string;
  grpcAddress: string;
  status: HostStatus;
  lastHeartbeat: Date | null;
}

/**
 * Track online agents and provide routing info for container operations.
 */
export class AgentRegistry {
  /**
   * Get agent connection info for a specific host.
   * Returns null if host is not ONLINE or missing gRPC address.
   */
  async getAgent(hostId: string): Promise<AgentRegistryEntry | null> {
    const host = await prisma.host.findUnique({
      where: { id: hostId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        hostname: true,
        status: true,
        lastHeartbeat: true,
        metadata: true,
      },
    });

    if (!host || host.status !== HostStatus.ONLINE) {
      return null;
    }

    const metadata = (host.metadata as AgentMetadata | null) || {};
    const grpcAddress = metadata.grpcAddress;

    if (!grpcAddress) {
      log.warn({ hostId }, 'Host is online but has no gRPC address in metadata');
      return null;
    }

    return {
      hostId: host.id,
      tenantId: host.tenantId,
      hostname: host.hostname,
      grpcAddress,
      status: host.status,
      lastHeartbeat: host.lastHeartbeat,
    };
  }

  /**
   * Get all agents in a tenant that are online.
   */
  async listAgents(tenantId: string): Promise<AgentRegistryEntry[]> {
    const hosts = await prisma.host.findMany({
      where: {
        tenantId,
        status: HostStatus.ONLINE,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        hostname: true,
        status: true,
        lastHeartbeat: true,
        metadata: true,
      },
    });

    return hosts
      .map((host) => {
        const metadata = (host.metadata as AgentMetadata | null) || {};
        const grpcAddress = metadata.grpcAddress;

        if (!grpcAddress) {
          log.warn({ hostId: host.id }, 'Host has no gRPC address');
          return null;
        }

        return {
          hostId: host.id,
          tenantId: host.tenantId,
          hostname: host.hostname,
          grpcAddress,
          status: host.status,
          lastHeartbeat: host.lastHeartbeat,
        };
      })
      .filter((e) => e !== null) as AgentRegistryEntry[];
  }

  /**
   * Update agent metadata (e.g., when agent provides gRPC address).
   * Called during agent registration or heartbeat.
   */
  async updateAgentMetadata(hostId: string, metadata: Partial<AgentMetadata>): Promise<void> {
    const host = await prisma.host.findUnique({
      where: { id: hostId },
      select: { metadata: true },
    });

    if (!host) {
      throw new Error(`Host ${hostId} not found`);
    }

    const current = (host.metadata as AgentMetadata | null) || {};
    const updated = { ...current, ...metadata };

    await prisma.host.update({
      where: { id: hostId },
      data: { metadata: updated },
    });

    log.info({ hostId, grpcAddress: updated.grpcAddress }, 'Updated agent metadata');
  }

  /**
   * Verify agent is reachable and online.
   * Used before dispatching operations.
   */
  async verifyAgent(hostId: string): Promise<boolean> {
    const agent = await this.getAgent(hostId);
    if (!agent) {
      log.warn({ hostId }, 'Agent not found or offline');
      return false;
    }

    // TODO: In production, could perform a lightweight gRPC health check here
    return true;
  }

  /**
   * Get agent stats for monitoring.
   */
  async getRegistryStats(tenantId?: string): Promise<{
    totalOnline: number;
    totalOffline: number;
    agentsWithoutGrpc: number;
  }> {
    const query = tenantId ? { tenantId } : {};

    const allHosts = await prisma.host.findMany({
      where: query,
      select: {
        status: true,
        metadata: true,
      },
    });

    let totalOnline = 0;
    let totalOffline = 0;
    let agentsWithoutGrpc = 0;

    for (const host of allHosts) {
      if (host.status === HostStatus.ONLINE) {
        totalOnline++;
        const metadata = (host.metadata as AgentMetadata | null) || {};
        if (!metadata.grpcAddress) {
          agentsWithoutGrpc++;
        }
      } else {
        totalOffline++;
      }
    }

    return { totalOnline, totalOffline, agentsWithoutGrpc };
  }
}

// Singleton instance
let registry: AgentRegistry | undefined;

export function getAgentRegistry(): AgentRegistry {
  if (!registry) {
    registry = new AgentRegistry();
  }
  return registry;
}
