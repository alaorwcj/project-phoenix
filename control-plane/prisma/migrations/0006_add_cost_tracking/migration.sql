-- CreateEnum for UsageEventType
CREATE TYPE "UsageEventType" AS ENUM ('CONTAINER_START', 'CONTAINER_STOP', 'CONTAINER_DELETE');

-- CreateTable for UsageEvent
CREATE TABLE "usage_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "container_id" UUID,
  "event_type" "UsageEventType" NOT NULL,
  "cpu_shares" INTEGER,
  "memory_bytes" BIGINT,
  "duration_seconds" INTEGER,
  "billing_hours" DECIMAL(10, 4),
  "cost_cents" DECIMAL(10, 2),
  "metadata" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "usage_events_tenant_id_idx" ON "usage_events"("tenant_id");
CREATE INDEX "usage_events_tenant_id_event_type_idx" ON "usage_events"("tenant_id", "event_type");
CREATE INDEX "usage_events_tenant_id_timestamp_idx" ON "usage_events"("tenant_id", "timestamp");
CREATE INDEX "usage_events_container_id_idx" ON "usage_events"("container_id");

-- Add foreign key constraint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenant_id_fkey" 
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
