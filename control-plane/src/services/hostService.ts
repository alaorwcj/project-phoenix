import { hostRepository } from '../repositories/hostRepository';

export class HostNotFoundError extends Error {}

export const hostService = {
  async list(tenantId: string) {
    return hostRepository.listByTenant(tenantId);
  },

  async get(tenantId: string, id: string) {
    const host = await hostRepository.findInTenant(tenantId, id);
    if (!host) throw new HostNotFoundError('Host not found');
    return host;
  },

  async register(
    tenantId: string,
    data: { name: string; hostname: string; agentId?: string; metadata?: object },
  ) {
    return hostRepository.create(tenantId, data);
  },
};
