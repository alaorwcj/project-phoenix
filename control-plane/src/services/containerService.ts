import { PrismaClient } from '@prisma/client';
import { ContainerStatus, ContainerRestartPolicy } from '@prisma/client';

const prisma = new PrismaClient();

export interface StartContainerInput {
  name: string;
  image: string;
  hostId: string;
  environmentVars?: Record<string, string>;
  resourceLimits?: {
    cpuQuota?: number;
    memoryLimitBytes?: number;
  };
  portBindings?: Record<string, number>;
  restartPolicy?: ContainerRestartPolicy;
}

export interface StopContainerInput {
  containerId: string;
  timeoutSeconds?: number;
}

export interface ContainerService {
  startContainer(tenantId: string, input: StartContainerInput): Promise<any>;
  stopContainer(tenantId: string, input: StopContainerInput): Promise<any>;
  getContainer(tenantId: string, containerId: string): Promise<any>;
  listContainers(tenantId: string, hostId?: string): Promise<any[]>;
  updateContainerStatus(tenantId: string, containerId: string, status: ContainerStatus): Promise<any>;
  recordContainerLog(tenantId: string, containerId: string, stream: string, data: Buffer): Promise<void>;
}

export class PrismaContainerService implements ContainerService {
  constructor(private prisma: PrismaClient) {}

  async startContainer(tenantId: string, input: StartContainerInput) {
    // Verify host belongs to tenant
    const host = await this.prisma.host.findFirst({
      where: {
        id: input.hostId,
        tenantId,
      },
    });

    if (!host) {
      throw new Error(`Host ${input.hostId} not found or does not belong to tenant ${tenantId}`);
    }

    // Create container record with PENDING status
    const container = await this.prisma.container.create({
      data: {
        tenantId,
        hostId: input.hostId,
        name: input.name,
        image: input.image,
        dockerId: '', // Will be filled by agent
        status: ContainerStatus.PENDING,
        restartPolicy: input.restartPolicy || ContainerRestartPolicy.NO,
        environmentVars: input.environmentVars || {},
        resourceLimits: input.resourceLimits || {},
        portBindings: input.portBindings || {},
      },
    });

    return {
      id: container.id,
      name: container.name,
      status: container.status,
      createdAt: container.createdAt,
    };
  }

  async stopContainer(tenantId: string, input: StopContainerInput) {
    // Verify container belongs to tenant
    const container = await this.prisma.container.findFirst({
      where: {
        id: input.containerId,
        tenantId,
      },
    });

    if (!container) {
      throw new Error(`Container ${input.containerId} not found or does not belong to tenant ${tenantId}`);
    }

    // Update status to STOPPING
    const updated = await this.prisma.container.update({
      where: { id: input.containerId },
      data: {
        status: ContainerStatus.STOPPING,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      stoppedAt: updated.stoppedAt,
    };
  }

  async getContainer(tenantId: string, containerId: string) {
    const container = await this.prisma.container.findFirst({
      where: {
        id: containerId,
        tenantId,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            hostname: true,
          },
        },
      },
    });

    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    return container;
  }

  async listContainers(tenantId: string, hostId?: string) {
    const containers = await this.prisma.container.findMany({
      where: {
        tenantId,
        ...(hostId && { hostId }),
      },
      include: {
        host: {
          select: {
            name: true,
            hostname: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return containers;
  }

  async updateContainerStatus(
    tenantId: string,
    containerId: string,
    status: ContainerStatus
  ) {
    const container = await this.prisma.container.findFirst({
      where: {
        id: containerId,
        tenantId,
      },
    });

    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    // Update timestamps based on status
    const updateData: any = { status };
    if (status === ContainerStatus.RUNNING && !container.startedAt) {
      updateData.startedAt = new Date();
    }
    if (status === ContainerStatus.STOPPED && !container.stoppedAt) {
      updateData.stoppedAt = new Date();
    }

    const updated = await this.prisma.container.update({
      where: { id: containerId },
      data: updateData,
    });

    return updated;
  }

  async recordContainerLog(
    tenantId: string,
    containerId: string,
    stream: string,
    data: Buffer
  ): Promise<void> {
    // Verify container belongs to tenant
    const container = await this.prisma.container.findFirst({
      where: {
        id: containerId,
        tenantId,
      },
    });

    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    // Record log entry
    await this.prisma.containerLog.create({
      data: {
        tenantId,
        containerId,
        stream,
        data,
      },
    });
  }
}

// Export factory function
export function createContainerService(): ContainerService {
  return new PrismaContainerService(prisma);
}
