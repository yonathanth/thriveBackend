-- Payroll: admins approve payouts the gym app calculated, entering what was actually
-- paid. The gym app collects approvals, books the expense and acknowledges them.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand. Only adds.

CREATE TABLE IF NOT EXISTS payout_approval (
  id SERIAL PRIMARY KEY,
  "payoutLocalId" INTEGER NOT NULL,
  "staffLocalId" INTEGER NOT NULL,
  "periodStart" VARCHAR(10) NOT NULL,
  "periodLast" VARCHAR(10) NOT NULL,
  "calculatedAmount" DOUBLE PRECISION NOT NULL,
  "paidAmount" DOUBLE PRECISION NOT NULL,
  "paidDate" VARCHAR(10) NOT NULL,
  "paymentMethod" VARCHAR(100),
  note TEXT,
  "approvedById" INTEGER,
  "approvedByName" VARCHAR(255) NOT NULL,
  "approvedAt" TIMESTAMPTZ NOT NULL,
  "recordedAt" TIMESTAMPTZ,
  "transactionLocalId" INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_approval_payout ON payout_approval ("payoutLocalId");
CREATE INDEX IF NOT EXISTS idx_payout_approval_staff ON payout_approval ("staffLocalId");
