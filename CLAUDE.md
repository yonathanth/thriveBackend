# CLAUDE.md — Thrive Gym Backend

## Project Overview
The backend uses NestJS, TypeORM, and PostgreSQL, with Passport and JWT for authentication. Verify the actual implementation before assuming specific configurations.

The desktop application operates offline and synchronizes data to the website. A simple website-to-desktop synchronization feature also exists. Preserve both existing synchronization directions and their contracts.

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

**Priority:** Protect authorization, database integrity, and both existing synchronization directions while extending the web platform.