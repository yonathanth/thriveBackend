-- Per-account permission overrides for the website (grant or deny one permission on
-- top of the account's role defaults). Website-only: never synced to or from the
-- desktop app.
--
-- APPLY BY HAND, BEFORE deploying the code that uses it. Purely additive: one new,
-- empty table. No existing table or row is changed. With no rows, every account keeps
-- its role defaults. Safe to run twice.

CREATE TABLE IF NOT EXISTS account_permission (
  id SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
  permission VARCHAR(80) NOT NULL,
  effect VARCHAR(5) NOT NULL CHECK (effect IN ('grant', 'deny')),
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_permission_account_key
  ON account_permission("accountId", permission);
