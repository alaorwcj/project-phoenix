import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthTokenPayload } from '../types/auth';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Authentication required' });
  }

  try {
    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    if (!payload.sub || !payload.tenantId || !payload.role) throw new Error('Invalid token claims');
    request.auth = { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
    request.user = { id: payload.sub, tenantId: payload.tenantId, role: payload.role };
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

export const authMiddleware = authenticate;
