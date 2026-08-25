import { tenantRepository } from '../repositories/tenantRepository';

export class TenantSlugAlreadyExistsError extends Error {}

export const tenantService = {
  async list() {
    return tenantRepository.list();
  },

  async get(id: string) {
    return tenantRepository.findById(id);
  },

  async create(data: { name: string; slug: string }) {
    const existing = await tenantRepository.list().then((items) => items.find((item) => item.slug === data.slug));
    if (existing) throw new TenantSlugAlreadyExistsError('Tenant slug already exists');
    return tenantRepository.create(data);
  },
};
