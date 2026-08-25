import { prisma } from '../lib/prisma';

export const hostRepository = {
  listByTenant(tenantId: string) {
    return prisma.host.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
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