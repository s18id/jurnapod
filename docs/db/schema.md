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

## Apply migration

Run from repo root:

```bash
npm run db:migrate
```

Behavior:

- Reads `packages/db/migrations/*.sql` in lexical order.
- Uses `schema_migrations.version` to skip already applied files.
- Uses advisory lock `GET_LOCK('jurnapod:<db>:migrations', timeout)` to prevent concurrent applies.

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

- Idempotent upsert for company, outlet, roles, owner user, user-role relation, user-outlet relation, and feature flags.
- Owner password hash uses bcrypt cost `12`.
- Feature flags seeded:
  - `pos.enabled` = true
  - `sales.enabled` = true
  - `inventory.enabled` = true with `{"level":0}`
  - `purchasing.enabled` = false

## Smoke checks

Run from repo root:

```bash
npm run db:smoke
```

Checks:

- Owner row exists for configured company/email.
- bcrypt password compare succeeds for configured owner password.
- `user_roles` contains `OWNER` role relation.
- `user_outlets` contains default outlet relation.

On failure, script exits non-zero.
