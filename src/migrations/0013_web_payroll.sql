-- Payroll moves to the website: admins set each person's pay and revenue shares here,
-- pay periods are calculated here from synced attendance and payments, and paid here.
-- The gym app collects paid payouts and books them as expenses.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand. It replaces the earlier approve-on-website, book-in-the-
-- gym-app flow, which was never used: its payout_approval table goes.

DROP TABLE IF EXISTS payout_approval;

CREATE TABLE IF NOT EXISTS staff_pay_setup (
  id SERIAL PRIMARY KEY,
  "staffLocalId" INTEGER NOT NULL,
  "baseType" VARCHAR(10) NOT NULL DEFAULT 'none',
  "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  cycle VARCHAR(10) NOT NULL DEFAULT 'monthly',
  "cycleDays" INTEGER NOT NULL DEFAULT 30,
  "cycleStart" VARCHAR(10) NOT NULL,
  "deductAbsence" BOOLEAN NOT NULL DEFAULT false,
  "workDays" INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  active BOOLEAN NOT NULL DEFAULT true,
  "updatedByName" VARCHAR(255),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_pay_setup_staff ON staff_pay_setup ("staffLocalId");

CREATE TABLE IF NOT EXISTS staff_revenue_share (
  id SERIAL PRIMARY KEY,
  "staffLocalId" INTEGER NOT NULL,
  scope VARCHAR(30) NOT NULL,
  "targetKind" VARCHAR(10),
  "targetLocalId" INTEGER,
  "rateType" VARCHAR(10) NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_revenue_share_staff ON staff_revenue_share ("staffLocalId");

CREATE TABLE IF NOT EXISTS staff_payout (
  id SERIAL PRIMARY KEY,
  "staffLocalId" INTEGER NOT NULL,
  "periodStart" VARCHAR(10) NOT NULL,
  "periodEnd" VARCHAR(10) NOT NULL,
  status VARCHAR(10) NOT NULL,
  "calculatedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]',
  "computedAt" TIMESTAMPTZ,
  "paidAmount" DOUBLE PRECISION,
  "paidDate" VARCHAR(10),
  "paymentMethod" VARCHAR(100),
  note TEXT,
  "paidById" INTEGER,
  "paidByName" VARCHAR(255),
  "paidAt" TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 0,
  "collectedRevision" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_payout_period ON staff_payout ("staffLocalId", "periodStart");
CREATE INDEX IF NOT EXISTS idx_staff_payout_staff ON staff_payout ("staffLocalId");
CREATE INDEX IF NOT EXISTS idx_staff_payout_status ON staff_payout (status);
