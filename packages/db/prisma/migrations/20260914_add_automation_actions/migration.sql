CREATE TYPE "AutomationActionStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED');
CREATE TYPE "AutomationActionType" AS ENUM ('AI_INSIGHT', 'FOLLOW_UP_SUGGESTION', 'INBOX_ALERT');

CREATE TABLE "AutomationAction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" "AutomationActionType" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "AutomationActionStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  CONSTRAINT "AutomationAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationAction_organizationId_eventId_type_key"
  ON "AutomationAction"("organizationId", "eventId", "type");
CREATE INDEX "AutomationAction_organizationId_status_createdAt_idx"
  ON "AutomationAction"("organizationId", "status", "createdAt");
CREATE INDEX "AutomationAction_organizationId_eventId_idx"
  ON "AutomationAction"("organizationId", "eventId");

ALTER TABLE "AutomationAction"
  ADD CONSTRAINT "AutomationAction_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationAction"
  ADD CONSTRAINT "AutomationAction_acknowledgedBy_fkey"
  FOREIGN KEY ("acknowledgedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
