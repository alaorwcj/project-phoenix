import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';

const ROLE_ORDER: Record<UserRole, number> = {
  ADMIN: 1,
  OPERATOR: 2,
  VIEWER: 3,
};

export function requireRole(...allowed: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.auth) return reply.code(401).send({ error: 'Authentication required' });

    const current = ROLE_ORDER[request.auth.role];
    const sufficient = allowed.some((role) => ROLE_ORDER[role] >= current);
    if (!sufficient) return reply.code(403).send({ error: 'Insufficient role' });
  };
}
