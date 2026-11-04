-- Sponsored plans: ones the gym gives on someone else's account. The desktop marks them
-- (desktop migration 0085) and, from sync protocol 5, sends the flag with each plan.
-- The website leaves them off the public price list and never sells them online.
--
-- APPLY BY HAND, BEFORE deploying the code that uses it. Purely additive: one column
-- with a default, so every existing plan reads as not sponsored. No row is changed.
-- Safe to run twice. Add-ons and drop-ins need nothing here: they arrive as generic
-- sync records and carry the flag in their data.

ALTER TABLE service ADD COLUMN IF NOT EXISTS "isSponsored" BOOLEAN NOT NULL DEFAULT false;
