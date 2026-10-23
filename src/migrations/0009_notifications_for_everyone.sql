-- Notifications for every role, and the website's own audit log.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand. Only adds: nothing existing changes meaning.
--
-- notification."recipientId": the one account a personal notification is for (a
-- member's membership ending, a message from staff, a trainer's client list). NULL is
-- a desk notification for admins and managers, which is what every existing row is.
--
-- web_audit: key actions staff take on the website (admins, managers, trainers; never
-- members). The desktop's audit log stays in sync_record.

ALTER TABLE notification ADD COLUMN IF NOT EXISTS "recipientId" INTEGER;
CREATE INDEX IF NOT EXISTS idx_notification_recipient ON notification ("recipientId");

CREATE TABLE IF NOT EXISTS web_audit (
  id SERIAL PRIMARY KEY,
  "actorId" INTEGER,
  "actorName" VARCHAR(255) NOT NULL,
  "actorRole" VARCHAR(50) NOT NULL,
  area VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  detail JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_web_audit_created_at ON web_audit ("createdAt");
CREATE INDEX IF NOT EXISTS idx_web_audit_area ON web_audit (area);
