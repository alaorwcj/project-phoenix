-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('PENDING', 'CREATING', 'RUNNING', 'STOPPING', 'STOPPED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContainerRestartPolicy" AS ENUM ('NO', 'ALWAYS', 'ON_FAILURE', 'UNLESS_STOPPED');

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "dockerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "status" "ContainerStatus" NOT NULL DEFAULT 'PENDING',
    "restartPolicy" "ContainerRestartPolicy" NOT NULL DEFAULT 'NO',
    "environmentVars" JSONB NOT NULL DEFAULT '{}',
    "resourceLimits" JSONB NOT NULL DEFAULT '{}',
    "portBindings" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Container_tenantId_dockerId_key" ON "Container"("tenantId", "dockerId");

-- CreateIndex
CREATE UNIQUE INDEX "Container_tenantId_hostId_name_key" ON "Container"("tenantId", "hostId", "name");

-- CreateIndex
CREATE INDEX "Container_tenantId_idx" ON "Container"("tenantId");

-- CreateIndex
CREATE INDEX "Container_hostId_idx" ON "Container"("hostId");

-- CreateIndex
CREATE INDEX "Container_status_idx" ON "Container"("status");

-- CreateIndex
CREATE INDEX "ContainerLog_tenantId_idx" ON "ContainerLog"("tenantId");

-- CreateIndex
CREATE INDEX "ContainerLog_containerId_idx" ON "ContainerLog"("containerId");

-- CreateIndex
CREATE INDEX "ContainerLog_timestamp_idx" ON "ContainerLog"("timestamp");

-- CreateIndex
CREATE INDEX "ContainerLog_tenantId_containerId_timestamp_idx" ON "ContainerLog"("tenantId", "containerId", "timestamp");

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerLog" ADD CONSTRAINT "ContainerLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerLog" ADD CONSTRAINT "ContainerLog_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;
