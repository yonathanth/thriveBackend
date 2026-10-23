-- Progress tracking on the website: photos members attach to their measurements, goals,
-- and how often a member should come for a check. Website-only; never synced.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand. Only adds.

CREATE TABLE IF NOT EXISTS progress_photo (
  id SERIAL PRIMARY KEY,
  "memberLocalId" INTEGER NOT NULL,
  "healthMetricId" INTEGER NOT NULL,
  "filePath" VARCHAR(255) NOT NULL,
  "thumbPath" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(40) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "visibleToTrainer" BOOLEAN NOT NULL DEFAULT false,
  "visibleToStaff" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_progress_photo_member ON progress_photo ("memberLocalId");
CREATE INDEX IF NOT EXISTS idx_progress_photo_metric ON progress_photo ("healthMetricId");

CREATE TABLE IF NOT EXISTS progress_goal (
  id SERIAL PRIMARY KEY,
  "memberLocalId" INTEGER NOT NULL,
  metric VARCHAR(40) NOT NULL,
  target DOUBLE PRECISION NOT NULL,
  "setById" INTEGER,
  "setByName" VARCHAR(255),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_goal_member_metric ON progress_goal ("memberLocalId", metric);

CREATE TABLE IF NOT EXISTS progress_schedule (
  id SERIAL PRIMARY KEY,
  "memberLocalId" INTEGER NOT NULL UNIQUE,
  "intervalDays" INTEGER NOT NULL,
  "setById" INTEGER,
  "setByName" VARCHAR(255),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
