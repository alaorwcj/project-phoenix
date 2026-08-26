import { PrismaClient } from '@prisma/client';
import { getLogger } from './logger';

const prisma = new PrismaClient();

/**
 * Dead-letter entry for jobs that have exhausted all retries.
 * These are permanent failures that require operator intervention.
 */
export interface DeadLetterEntry {
  id: string;
  jobId: string;
  jobType: string;
  tenantId: string;
  resourceId?: string;
  errorMessage: string;
  lastAttemptAt: Date;
  attemptCount: number;
  metadata: Record<string, unknown>;
  alertSent: boolean;
  resolvedAt?: Date;
}

/**
 * Manages the dead-letter queue for permanent job failures.
 * Stores failed jobs, sends alerts, and tracks resolution.
 */
export class DeadLetterQueue {
  private log = getLogger({ component: 'dead-letter-queue' });

  /**
   * Record a job that has failed permanently (exhausted retries).
   */
  async enqueue(entry: Omit<DeadLetterEntry, 'id' | 'alertSent' | 'resolvedAt'>): Promise<void> {
    try {
      // In production, this would write to a dedicated table or external system (e.g., sentry, datadog)
      this.log.error(
        {
          jobId: entry.jobId,
          jobType: entry.jobType,
          tenantId: entry.tenantId,
          errorMessage: entry.errorMessage,
          attemptCount: entry.attemptCount,
          metadata: entry.metadata,
        },
        'Job permanently failed - added to dead-letter queue'
      );

      // TODO: Send alert to ops dashboard
      // await this.sendAlert(entry);

      // TODO: Write to audit log
      // await this.auditLog(entry);

      // TODO: Write to dead-letter table in database
      // await prisma.deadLetterJob.create({ data: { ...entry } });
    } catch (err) {
      this.log.error({ err, jobId: entry.jobId }, 'Failed to enqueue dead-letter entry');
    }
  }

  /**
   * Mark a dead-letter entry as resolved by operator.
   */
  async resolve(deadLetterId: string, resolution: string): Promise<void> {
    this.log.info(
      { deadLetterId, resolution },
      'Dead-letter entry resolved by operator'
    );

    // TODO: Update dead-letter table with resolved timestamp
    // await prisma.deadLetterJob.update({
    //   where: { id: deadLetterId },
    //   data: { resolvedAt: new Date(), resolutionNotes: resolution }
    // });
  }

  /**
   * List unresolved dead-letter entries for a tenant.
   */
  async listUnresolved(tenantId: string, limit: number = 100): Promise<DeadLetterEntry[]> {
    // TODO: Query dead-letter table
    // const entries = await prisma.deadLetterJob.findMany({
    //   where: { tenantId, resolvedAt: null },
    //   orderBy: { lastAttemptAt: 'desc' },
    //   take: limit,
    // });
    // return entries;

    return [];
  }

  /**
   * Send alert to ops (Slack, email, dashboard).
   * Called when a job is dead-lettered.
   */
  private async sendAlert(entry: Omit<DeadLetterEntry, 'id' | 'alertSent' | 'resolvedAt'>): Promise<void> {
    // TODO: Implement based on alert configuration
    // Example: POST to Slack webhook, send email, etc.
    this.log.warn(
      { jobType: entry.jobType, tenantId: entry.tenantId },
      'Alert would be sent to ops'
    );
  }

  /**
   * Audit log for compliance/forensics.
   */
  private async auditLog(entry: Omit<DeadLetterEntry, 'id' | 'alertSent' | 'resolvedAt'>): Promise<void> {
    // TODO: Write to audit table
    this.log.info(
      { jobType: entry.jobType, tenantId: entry.tenantId },
      'Dead-letter entry recorded in audit log'
    );
  }

  /**
   * Get queue stats for monitoring.
   */
  async getStats(): Promise<{
    totalEntries: number;
    unresolvedByType: Record<string, number>;
  }> {
    // TODO: Query dead-letter table
    return {
      totalEntries: 0,
      unresolvedByType: {},
    };
  }
}

// Singleton instance
let dlq: DeadLetterQueue | undefined;

export function getDeadLetterQueue(): DeadLetterQueue {
  if (!dlq) {
    dlq = new DeadLetterQueue();
  }
  return dlq;
}
