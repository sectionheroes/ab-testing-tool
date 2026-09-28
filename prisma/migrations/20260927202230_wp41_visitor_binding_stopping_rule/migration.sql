/*
  Warnings:

  - You are about to drop the column `plannedSampleSize` on the `Experiment` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STOPPING_RULE_CHANGED';

-- AlterTable
ALTER TABLE "Experiment" DROP COLUMN "plannedSampleSize",
ADD COLUMN     "minConversionsPerArm" INTEGER DEFAULT 1000,
ADD COLUMN     "minDurationDays" INTEGER DEFAULT 14,
ADD COLUMN     "requireFullWeeks" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Exposure" ADD COLUMN     "isNewVisitor" BOOLEAN;

-- AlterTable
ALTER TABLE "OrderAttribution" ADD COLUMN     "visitorId" TEXT;

-- CreateIndex
CREATE INDEX "Exposure_experimentId_isBot_firstSeenAt_variantId_device_is_idx" ON "Exposure"("experimentId", "isBot", "firstSeenAt", "variantId", "device", "isNewVisitor");

-- CreateIndex
CREATE INDEX "OrderAttribution_visitorId_idx" ON "OrderAttribution"("visitorId");
