import { prisma } from '../lib/prisma';

export const tenantRepository = {
  findById(id: string) {
    return prisma.tenant.findUnique({ where: { id } });
  },
  list() {
    return prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  },
  create(data: { name: string; slug: string }) {
    return prisma.tenant.create({ data });
  },
};
