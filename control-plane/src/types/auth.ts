import { UserRole } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string;
      tenantId: string;
      role: UserRole;
    };
    user?: {
      id?: string;
      userId?: string;
      tenantId: string;
      role: UserRole;
    };
  }
}

export interface AuthTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
}
