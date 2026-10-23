-- Notifications from desktop events (sync protocol 3), per-admin read state, and Web
-- Push subscriptions. TypeORM (synchronize: true) applies this itself; the file
-- records the change for databases managed by hand.

CREATE TABLE IF NOT EXISTS notification (
  id SERIAL PRIMARY KEY,
  "eventUid" VARCHAR(64) NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  "memberLocalId" INTEGER,
  "transactionLocalId" INTEGER,
  data JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_event_uid ON notification("eventUid");
CREATE INDEX IF NOT EXISTS idx_notification_type ON notification(type);
CREATE INDEX IF NOT EXISTS idx_notification_occurred_at ON notification("occurredAt");

CREATE TABLE IF NOT EXISTS notification_read (
  id SERIAL PRIMARY KEY,
  "notificationId" INTEGER NOT NULL REFERENCES notification(id) ON DELETE CASCADE,
  "adminId" INTEGER NOT NULL,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_read_unique ON notification_read("notificationId", "adminId");
CREATE INDEX IF NOT EXISTS idx_notification_read_admin ON notification_read("adminId");

CREATE TABLE IF NOT EXISTS push_subscription (
  id SERIAL PRIMARY KEY,
  "adminId" INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  types TEXT[] NOT NULL DEFAULT '{payment,package_changed,start_date_changed}',
  "userAgent" VARCHAR(255),
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_endpoint ON push_subscription(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscription_admin ON push_subscription("adminId");
