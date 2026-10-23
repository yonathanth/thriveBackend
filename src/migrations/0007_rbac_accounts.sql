-- Website roles (admin, manager, trainer, member) and account provisioning.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand. Additive only: existing admin rows keep role 'admin',
-- their email and password, and existing tokens stay valid (tokenVersion 0).

-- The admin table now holds every website login.
ALTER TABLE admin ALTER COLUMN email DROP NOT NULL;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "staffLocalId" INTEGER;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "memberLocalId" INTEGER;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMPTZ;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMPTZ;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'web';
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "createdById" INTEGER;
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "deactivatedReason" VARCHAR(50);
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "contactEmail" VARCHAR(255);
ALTER TABLE admin ADD COLUMN IF NOT EXISTS "telegramUsername" VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_phone ON admin(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_staff_local_id ON admin("staffLocalId") WHERE "staffLocalId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_member_local_id ON admin("memberLocalId") WHERE "memberLocalId" IS NOT NULL;

-- Website account actions (resets, admin creation, status changes).
CREATE TABLE IF NOT EXISTS account_audit (
  id SERIAL PRIMARY KEY,
  "actorId" INTEGER,
  action VARCHAR(40) NOT NULL,
  "targetId" INTEGER,
  detail JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_audit_actor ON account_audit("actorId");
CREATE INDEX IF NOT EXISTS idx_account_audit_target ON account_audit("targetId");

-- Synced records that could not be given a login automatically.
CREATE TABLE IF NOT EXISTS account_link_conflict (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,
  "sourceType" VARCHAR(10) NOT NULL,
  "sourceLocalId" INTEGER NOT NULL,
  phone VARCHAR(50),
  detail TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_link_conflict_key
  ON account_link_conflict(kind, "sourceType", "sourceLocalId");
CREATE INDEX IF NOT EXISTS idx_account_link_conflict_status ON account_link_conflict(status);
