import { prisma } from '../lib/prisma';

export const hostRepository = {
  listByTenant(tenantId: string, options?: { limit?: number; offset?: number }) {
    return prisma.host.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });
  },

  countByTenant(tenantId: string) {
    return prisma.host.count({ where: { tenantId } });
  },

  findInTenant(tenantId: string, id: string) {
    return prisma.host.findFirst({ where: { id, tenantId } });
  },
  create(
    tenantId: string,
    data: { name: string; hostname: string; agentId?: string; metadata?: object },
  ) {
    return prisma.host.create({ data: { ...data, tenantId } });
  },
};