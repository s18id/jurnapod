# Jurnapod Project Context

## Overview

**Jurnapod** - From cashier to ledger. A modular ERP monorepo with offline-first POS and accounting/GL as financial source of truth.

## Tech Stack

- **Runtime**: Node.js 20.x
- **Monorepo**: pnpm workspaces
- **Apps**: 
  - `@jurnapod/api` - Next.js API routes
  - `@jurnapod/backoffice` - Admin dashboard (React/Mantine)
  - `@jurnapod/pos` - Point of Sale (PWA)
- **Packages**:
  - `@jurnapod/db` - Database migrations and seeding
  - `@jurnapod/shared` - Shared Zod schemas and types
  - `@jurnapod/core` - Core utilities
  - `@jurnapod/offline-db` - Dexie (IndexedDB wrapper for offline POS)
  - `@jurnapod/modules/*` - Business modules (platform, sales, accounting, inventory, purchasing, pos)
- **Database**: MySQL 8.0+ / MariaDB
- **Auth**: JWT (jose library), Argon2id/bcrypt password hashing
- **Roles**: SUPER_ADMIN, OWNER, ADMIN, ACCOUNTANT, CASHIER

## Architecture Principles

1. **Accounting/GL is the source of truth** - All posted documents must create journal entries
2. **POS is offline-first** - Write locally first, then sync via outbox
3. **POS sync must be idempotent** - Use `client_tx_id` (UUID v4)
4. **Tenant isolation** - All operational data must have `company_id` and `outlet_id`
5. **Immutable corrections** - Use VOID/REFUND, not silent mutations

## Database Patterns

- Migrations in `packages/db/migrations/*.sql` - rerunnable/idempotent
- Money values: DECIMAL(18,2), never FLOAT/DOUBLE
- Tenant scoping: `company_id` required on all tables, `outlet_id` where relevant
- Use `information_schema` for existence checks in migrations

## API Patterns

- REST (Next.js API routes) at `/api/*`
- Shared Zod contracts in `packages/shared/src/schemas/`
- Sync endpoint: POST `/api/sync/push` with client_tx_id for idempotency
- Tenant scoping enforced on every request

## Important Paths

- API routes: `apps/api/app/api/**/route.ts`
- Database: `packages/db/`
- Shared schemas: `packages/shared/src/schemas/`
- Modules: `packages/modules/*/`

## Testing Standards

- HTTP integration tests must create/mutate fixtures through API endpoints
- Direct DB writes allowed only for teardown/cleanup and read-only verification
- All test fixtures should use unique per-run identifiers
- Filter audit_logs by `success` (1/0), not `result`

## Review Guidelines

**P0/P1 Issues**:
- Incorrect ledger balances
- Duplicate posting
- Duplicate POS transaction creation
- Tenant data leakage
- Auth bypass

**Priority**:
- Be strict on correctness, validation, authorization, idempotency, and transaction boundaries
- Flag missing Zod validation, permissive parsing, missing tenant scoping
