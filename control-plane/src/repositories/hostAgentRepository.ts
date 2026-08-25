import { prisma } from '../lib/prisma';
import { HostStatus } from '@prisma/client';

export const hostAgentRepository = {
  findByAgentId(agentId: string) {
    return prisma.host.findUnique({ where: { agentId } });
  },

  findInTenant(tenantId: string, id: string) {
    return prisma.host.findFirst({ where: { id, tenantId } });
  },

  registerAgent(tenantId: string, agentId: string, data: { name: string; hostname: string; metadata?: object }) {
    return prisma.host.create({ data: { ...data, tenantId, agentId, status: HostStatus.PENDING } });
  },

  updateHeartbeat(hostId: string, metadata?: object) {
    return prisma.host.update({ where: { id: hostId }, data: { status: HostStatus.ONLINE, lastHeartbeat: new Date(), metadata } });
  },
};