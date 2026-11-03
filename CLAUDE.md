# CLAUDE.md — Thrive Gym Backend

## Project Overview
The backend uses NestJS, TypeORM, and PostgreSQL, with Passport and JWT for authentication. Verify the actual implementation before assuming specific configurations.

The desktop application operates offline and synchronizes data to the website. **Sync is intentionally one-way: desktop → website.** Do not add or extend any website-to-desktop syncing. The few existing desktop pulls (website prospects, online-payment decisions, paid payroll) must be left exactly as they are. Preserve the existing sync contracts.

## ⚠️ LIVE PRODUCTION SYSTEM — READ FIRST
This is maintenance and feature work on a **deployed system with a live production database holding real member, staff, and payment data**. Treat every action accordingly.
- **Do not touch the deployed database.** Never connect to it, query it, write to it, or run scripts against it.
- **All migrations go through the user.** Write migration files for review only. Never run, revert, or auto-sync them (`migration:run`, `migration:revert`, `schema:sync`, `synchronize: true`, etc.). The user reviews and applies every migration personally.
- **Migrations must be additive and non-destructive.** Do not drop, rename, or retype columns or tables, change constraints, or rewrite existing rows unless the user explicitly approves that specific change. New columns must be nullable or have safe defaults so existing records stay valid.
- **Never affect existing data.** No backfills, bulk updates, deletes, seeds, or data fixes without explicit approval of the exact operation.
- **No testing with real data or real payments.** Do not use production records, real accounts, real credentials, or real payment flows for testing. Never trigger real charges, refunds, or payment-provider calls. Use local/test databases and sandbox/mock payment setups only.
- **Do not read, print, or copy production secrets** (e.g., `.env` files with live credentials) unless the user asks.
- When in doubt, stop and ask before proceeding.

## Rules
- Inspect existing modules, entities, DTOs, controllers, services, guards, authentication, and synchronization logic before making changes.
- Preserve existing API contracts and desktop compatibility unless a change is explicitly requested and its impact is understood.
- Maintain data integrity, stable identifiers, relationships, and existing synchronization behavior.
- Prevent duplicate records and handle retries safely where applicable.
- Distinguish desktop-originated data from web-managed data. Do not overwrite fields owned by another application without an explicit conflict-resolution rule.
- Enforce RBAC and authorization on the backend. Never rely solely on frontend permission checks.
- Validate incoming data and protect endpoints against unauthorized access and privilege escalation.
- Enforce user and organization data boundaries wherever the existing business model requires them.
- Keep credentials and secrets in environment configuration. Never hardcode or expose them.
- Inspect TypeORM entities and migrations before database changes. Never reset, drop, truncate, or modify important data without explicit approval.
- Avoid unnecessary dependencies, broad refactoring, and unrelated changes.

## Working Process
1. Trace the existing implementation before changing it.
2. Explain significant security, schema, or synchronization risks before proceeding.
3. Make focused, backward-compatible changes.
4. Run relevant tests and checks when available.
5. Report changed files, migration impact, test results, and unresolved issues honestly.

**Priority:** Protect authorization, database integrity, and the one-way desktop → website sync while extending the web platform.