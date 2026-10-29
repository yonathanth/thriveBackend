-- Online renewal payments through SantimPay. The website takes the money; the gym app
-- collects paid ones and staff apply or reject them there. TypeORM (synchronize: true)
-- applies this itself; the file records the change for databases managed by hand.

CREATE TABLE IF NOT EXISTS online_payment (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(64) NOT NULL UNIQUE,
  "memberLocalId" INTEGER NOT NULL,
  "memberName" VARCHAR(255) NOT NULL,
  "serviceLocalId" INTEGER NOT NULL,
  "serviceName" VARCHAR(255) NOT NULL,
  "servicePeriod" INTEGER NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  status VARCHAR(20) NOT NULL,
  "phoneNumber" VARCHAR(30),
  "providerTxnId" VARCHAR(64),
  "paidVia" VARCHAR(100),
  "paidAt" TIMESTAMPTZ,
  note TEXT,
  "decidedBy" VARCHAR(255),
  "decidedAt" TIMESTAMPTZ,
  "collectedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_payment_member ON online_payment ("memberLocalId");
CREATE INDEX IF NOT EXISTS idx_online_payment_status ON online_payment (status);
