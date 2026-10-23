-- Sync protocol 4: inventory.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand.
--
-- The desktop owns inventory and sends it as records; these tables hold it typed so
-- the website can add it up. Quantities are whole base units (bottles, not packs).
-- An inventory sale is an ordinary income transaction tagged with the stock report
-- that booked it, so the financial totals include it once and reports can split it out.

CREATE TABLE IF NOT EXISTS inventory_item (
  id SERIAL PRIMARY KEY,
  "localId" INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  "unitName" VARCHAR(50) NOT NULL,
  "packName" VARCHAR(50),
  "unitsPerPack" INTEGER,
  "unitPrice" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "packPrice" DECIMAL(10, 2),
  "assetLocation" VARCHAR(255),
  "assetCondition" VARCHAR(100),
  "assetSerial" VARCHAR(100),
  notes TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "desktopCreatedAt" TIMESTAMPTZ,
  "desktopUpdatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSyncedAt" TIMESTAMPTZ,
  "deletedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_item_local_id ON inventory_item ("localId");

CREATE TABLE IF NOT EXISTS stock_balance (
  id SERIAL PRIMARY KEY,
  "localId" INTEGER NOT NULL,
  "itemLocalId" INTEGER NOT NULL,
  "holderUserLocalId" INTEGER,
  "qtyBase" INTEGER NOT NULL,
  "desktopUpdatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSyncedAt" TIMESTAMPTZ,
  "deletedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_balance_local_id ON stock_balance ("localId");
CREATE INDEX IF NOT EXISTS idx_stock_balance_item ON stock_balance ("itemLocalId");

CREATE TABLE IF NOT EXISTS stock_assignment (
  id SERIAL PRIMARY KEY,
  "localId" INTEGER NOT NULL,
  "itemLocalId" INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL,
  "qtyBase" INTEGER NOT NULL,
  "enteredPacks" INTEGER NOT NULL DEFAULT 0,
  "enteredUnits" INTEGER NOT NULL DEFAULT 0,
  "fromUserLocalId" INTEGER,
  "toUserLocalId" INTEGER NOT NULL,
  "createdByLocalId" INTEGER,
  status VARCHAR(20) NOT NULL,
  note TEXT,
  "desktopCreatedAt" TIMESTAMPTZ,
  "respondedAt" TIMESTAMPTZ,
  "respondedByLocalId" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSyncedAt" TIMESTAMPTZ,
  "deletedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_assignment_local_id ON stock_assignment ("localId");
CREATE INDEX IF NOT EXISTS idx_stock_assignment_status ON stock_assignment (status);

CREATE TABLE IF NOT EXISTS stock_count (
  id SERIAL PRIMARY KEY,
  "localId" INTEGER NOT NULL,
  "itemLocalId" INTEGER NOT NULL,
  "holderUserLocalId" INTEGER NOT NULL,
  "expectedQtyBase" INTEGER NOT NULL,
  "remainingQtyBase" INTEGER NOT NULL,
  "soldQtyBase" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10, 2) NOT NULL,
  "packPrice" DECIMAL(10, 2),
  "unitsPerPack" INTEGER,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "paymentMethodLocalId" INTEGER,
  "transactionLocalId" INTEGER,
  "reportedByLocalId" INTEGER,
  "desktopCreatedAt" TIMESTAMPTZ,
  "voidedAt" TIMESTAMPTZ,
  "voidedByLocalId" INTEGER,
  "voidReason" TEXT,
  "voidTransactionLocalId" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSyncedAt" TIMESTAMPTZ,
  "deletedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_count_local_id ON stock_count ("localId");
CREATE INDEX IF NOT EXISTS idx_stock_count_item ON stock_count ("itemLocalId");
CREATE INDEX IF NOT EXISTS idx_stock_count_transaction ON stock_count ("transactionLocalId");
CREATE INDEX IF NOT EXISTS idx_stock_count_void_transaction ON stock_count ("voidTransactionLocalId");
CREATE INDEX IF NOT EXISTS idx_stock_count_reported_at ON stock_count ("desktopCreatedAt");

CREATE TABLE IF NOT EXISTS stock_movement (
  id SERIAL PRIMARY KEY,
  "localId" INTEGER NOT NULL,
  "itemLocalId" INTEGER NOT NULL,
  type VARCHAR(30) NOT NULL,
  "qtyBase" INTEGER NOT NULL,
  "fromBucket" VARCHAR(20) NOT NULL,
  "fromUserLocalId" INTEGER,
  "toBucket" VARCHAR(20) NOT NULL,
  "toUserLocalId" INTEGER,
  "assignmentLocalId" INTEGER,
  "countLocalId" INTEGER,
  "unitPrice" DECIMAL(10, 2),
  amount DECIMAL(10, 2),
  "transactionLocalId" INTEGER,
  "actorUserLocalId" INTEGER,
  "actorUsername" VARCHAR(100),
  reason TEXT,
  "desktopCreatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSyncedAt" TIMESTAMPTZ,
  "deletedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movement_local_id ON stock_movement ("localId");
CREATE INDEX IF NOT EXISTS idx_stock_movement_item ON stock_movement ("itemLocalId");
CREATE INDEX IF NOT EXISTS idx_stock_movement_at ON stock_movement ("desktopCreatedAt");

ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "stockCountLocalId" INTEGER;
CREATE INDEX IF NOT EXISTS idx_transaction_stock_count ON "transaction" ("stockCountLocalId");
