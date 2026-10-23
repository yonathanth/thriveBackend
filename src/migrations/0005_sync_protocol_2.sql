-- Sync protocol 2: deletions, newer desktop columns, and generic desktop records.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand.

-- Rows deleted on the desktop are hidden, not removed.
ALTER TABLE member ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE service ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE health_metric ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE member ADD COLUMN IF NOT EXISTS "trainerStaffLocalId" INTEGER;

ALTER TABLE service ADD COLUMN IF NOT EXISTS color VARCHAR(20);
ALTER TABLE service ADD COLUMN IF NOT EXISTS "freezeMaxDays" INTEGER;
ALTER TABLE service ADD COLUMN IF NOT EXISTS "freezeMinDays" INTEGER;
ALTER TABLE service ADD COLUMN IF NOT EXISTS "freezeMaxCount" INTEGER;
ALTER TABLE service ADD COLUMN IF NOT EXISTS "freezeRuleMode" VARCHAR(20);
ALTER TABLE service ADD COLUMN IF NOT EXISTS "groupSize" INTEGER;
ALTER TABLE service ADD COLUMN IF NOT EXISTS "groupPricing" TEXT;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS status VARCHAR(20);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS "accessValidTo" TIMESTAMPTZ;

ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "originalAmount" DECIMAL(10, 2);
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(10, 2);
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "discountLocalId" INTEGER;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "discountCode" VARCHAR(100);
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "additionalServiceLocalId" INTEGER;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "usageServiceLocalId" INTEGER;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "memberGroupLocalId" INTEGER;
CREATE INDEX IF NOT EXISTS idx_transaction_addon_local_id ON "transaction"("additionalServiceLocalId");
CREATE INDEX IF NOT EXISTS idx_transaction_drop_in_local_id ON "transaction"("usageServiceLocalId");

-- Desktop tables without an entity of their own, one row per desktop row.
CREATE TABLE IF NOT EXISTS sync_record (
  id SERIAL PRIMARY KEY,
  entity VARCHAR(64) NOT NULL,
  "localId" INTEGER NOT NULL,
  "memberLocalId" INTEGER,
  data JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastSyncedAt" TIMESTAMPTZ,
  "deletedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_record_entity_local_id ON sync_record(entity, "localId");
CREATE INDEX IF NOT EXISTS idx_sync_record_entity ON sync_record(entity);
CREATE INDEX IF NOT EXISTS idx_sync_record_member_local_id ON sync_record("memberLocalId");
