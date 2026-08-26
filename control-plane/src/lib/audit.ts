import { PrismaClient } from '@prisma/client';
import { getLogger } from './logger';

const prisma = new PrismaClient();

export type AuditActionType =
  | 'CONTAINER_START' | 'CONTAINER_STOP' | 'CONTAINER_DELETE'
  | 'HOST_REGISTER' | 'HOST_DEREGISTER'
  | 'ENVIRONMENT_CREATE' | 'ENVIRONMENT_UPDATE' | 'ENVIRONMENT_DELETE'
  | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE'
  | 'SECRET_CREATE' | 'SECRET_DELETE';

export interface AuditEntry {
  tenantId: string;
  userId?: string;
  action: AuditActionType;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  result: 'success' | 'failure';
  error?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const logger = getLogger();
  try {
    await (prisma as any).auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: entry.action as any,
        resource: entry.resource,
        resourceId: entry.resourceId,
        metadata: entry.metadata as any,
        result: entry.result,
        error: entry.error,
      },
    });
    logger.info({ audit: true, action: entry.action, tenantId: entry.tenantId, result: entry.result }, 'Audit log written');
  } catch (err) {
    // Never throw — audit log failure must not break the main flow
    logger.error({ err, audit: true }, 'Failed to write audit log');
  }
}
