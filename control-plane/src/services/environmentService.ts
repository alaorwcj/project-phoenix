import { EnvironmentType } from '@prisma/client';
import { environmentRepository } from '../repositories/environmentRepository';

export class EnvironmentAlreadyExistsError extends Error {}
export class EnvironmentNotFoundError extends Error {}

export const environmentService = {
  async list(tenantId: string) {
    return environmentRepository.listByTenant(tenantId);
  },

  async create(tenantId: string, data: { name: string; slug: string; type: EnvironmentType }) {
    const existing = await environmentRepository
      .listByTenant(tenantId)
      .then((items) => items.find((item) => item.slug === data.slug));
    if (existing) throw new EnvironmentAlreadyExistsError('Environment slug already used');
    return environmentRepository.create(tenantId, data);
  },

  async get(tenantId: string, id: string) {
    const environment = await environmentRepository.findInTenant(tenantId, id);
    if (!environment) throw new EnvironmentNotFoundError('Environment not found');
    return environment;
  },
};
