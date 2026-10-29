-- People who are not members yet can join from the website and pay online. Their
-- payment has no member until staff apply it in the gym app, which registers them.
-- TypeORM (synchronize: true) applies this itself; the file records the change for
-- databases managed by hand.

ALTER TABLE online_payment ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'renewal';
ALTER TABLE online_payment ALTER COLUMN "memberLocalId" DROP NOT NULL;
ALTER TABLE online_payment ADD COLUMN IF NOT EXISTS "potentialCustomerId" INTEGER;
ALTER TABLE online_payment ADD COLUMN IF NOT EXISTS "contactPhone" VARCHAR(30);
ALTER TABLE online_payment ADD COLUMN IF NOT EXISTS "contactEmail" VARCHAR(255);
