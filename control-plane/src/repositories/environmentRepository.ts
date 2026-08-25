import { EnvironmentType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const environmentRepository = {
  listByTenant(tenantId: string) {
    return prisma.environment.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  },
  findInTenant(tenantId: string, id: string) {
    return prisma.environment.findFirst({ where: { id, tenantId } });
  },
  create(tenantId: string, data: { name: string; slug: string; type: EnvironmentType }) {
    return prisma.environment.create({ data: { ...data, tenantId } });
  },
};
