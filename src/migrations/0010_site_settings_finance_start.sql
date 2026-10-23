-- Website-only settings, starting with the date finances are counted from.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand. Only adds.
--
-- finance_start_date: the gym-calendar date (YYYY-MM-DD) an admin chose.
-- finance_start_at:   the moment that day starts in the gym's time zone, which every
--                     financial query compares against. Both unset: everything counts.
-- The desktop app has its own, separate setting; the sync still sends everything.

CREATE TABLE IF NOT EXISTS site_setting (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
