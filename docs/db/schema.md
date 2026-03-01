<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# M1 DB schema and bootstrap

This milestone uses one SQL migration file with BIGINT internal IDs and UUID only for POS idempotency (`pos_transactions.client_tx_id`).

## Prerequisites

- MySQL/MariaDB database exists and is reachable.
- Environment variables are set for DB access:
  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_NAME`
- DB scripts auto-load repo-root `.env` (if present) and keep already-exported env values (`override: false`).

## Apply migration

Run from repo root:

```bash
npm run db:migrate
```

Behavior:

- Reads `packages/db/migrations/*.sql` in lexical order.
- Uses `schema_migrations.version` to skip already applied files.
- Uses advisory lock `GET_LOCK('jurnapod:<db>:migrations', timeout)` to prevent concurrent applies.
- `schema_migrations` is written only after one migration file finishes; failed files are retried on the next run.

### Migration recovery notes (MySQL DDL partial apply)

MySQL DDL is non-atomic: a migration can fail after some statements already changed schema.

- Expected operator flow: fix the reported error, then rerun `npm run db:migrate`.
- Migrations in this repo are written to be rerunnable/idempotent (conditional create/drop/check patterns).
- If migration `0004_item_prices_company_scoped_foreign_keys.sql` fails preflight, the script found existing cross-company `item_prices` rows and intentionally stops before scoped FK apply.
  - Resolve violating rows first (`item_prices.company_id` must match both `items.company_id` and `outlets.company_id`).
  - Rerun `npm run db:migrate` after data cleanup.

## Seed defaults

Run from repo root:

```bash
npm run db:seed
```

Default seed values:

- `COMPANY_CODE=JP`
- `COMPANY_NAME=Jurnapod Demo`
- `OUTLET_CODE=MAIN`
- `OUTLET_NAME=Main Outlet`
- `OWNER_EMAIL=owner@local`
- `OWNER_PASSWORD=ChangeMe123!`

Override via env:

- `JP_COMPANY_CODE`
- `JP_COMPANY_NAME`
- `JP_OUTLET_CODE`
- `JP_OUTLET_NAME`
- `JP_OWNER_EMAIL`
- `JP_OWNER_PASSWORD`

Seed behavior:

- Idempotent upsert for company, outlet, roles, owner user, user-role relation, user-outlet relation, modules, and company modules.
- Owner password hash follows env-driven password policy (default `argon2id`; configurable to `bcrypt`).
- Company modules seeded:
  - `pos` = enabled, config `{"payment_methods":["CASH"]}`
  - `sales` = enabled
  - `inventory` = enabled with `{"level":0}`
  - `purchasing` = disabled
  - `platform`, `reports`, `settings`, `accounts`, `journals` = enabled

## Smoke checks

Run from repo root:

```bash
npm run db:smoke
```

Checks:

- Owner row exists for configured company/email.
- Password verifier self-check passes for both hash formats (bcrypt + argon2id).
- Configured owner password compare succeeds against stored hash (bcrypt or argon2id).
- `user_roles` contains `OWNER` role relation.
- `user_outlets` contains default outlet relation.
- Required seeded modules exist with expected values:
  - `pos` = enabled
  - `sales` = enabled
  - `inventory` = enabled and `config_json.level = 0`
  - `purchasing` = disabled
- Additional modules and config keys are allowed.
- Transaction/write prerequisites are validated before checks:
  - Required tables (`companies`, `outlets`, `items`, `item_prices`) must exist with `InnoDB` engine.
  - DB user must be able to perform transactional write probe (`INSERT` + rollback) on `companies`.
  - Rollback must fully revert the write probe (no persisted probe row).

Smoke failure messages include explicit prerequisite hints (for example, run migration first, grant write permission, or restore transactional table engine).

On failure, script exits non-zero.
