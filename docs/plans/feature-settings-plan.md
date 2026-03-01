<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Feature Settings Plan

## Goal
Introduce configurable, non-secret feature settings (module options) stored per outlet in `company_settings` and managed from the backoffice.

## Scope
- Add feature settings keys to the shared settings registry.
- Reuse `/api/settings/config` to read/write feature settings (outlet scoped).
- Seed defaults from env once (per company outlet).
- Add a backoffice UI for feature settings.

## Non-Goals
- Do not replace existing `feature_flags` table (enable/disable modules stays separate).
- Do not store secrets.
- Do not alter auth or infrastructure configuration flows.

## Feature Settings (v1)
- `feature.pos.auto_sync_enabled` (bool, default true, env: `JP_FEATURE_POS_AUTO_SYNC_ENABLED`)
- `feature.pos.sync_interval_seconds` (int, default 60, env: `JP_FEATURE_POS_SYNC_INTERVAL_SECONDS`)
- `feature.sales.tax_included_default` (bool, default false, env: `JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT`)
- `feature.inventory.allow_backorder` (bool, default false, env: `JP_FEATURE_INVENTORY_ALLOW_BACKORDER`)
- `feature.purchasing.require_approval` (bool, default true, env: `JP_FEATURE_PURCHASING_REQUIRE_APPROVAL`)

## Data Source and Resolution Order
Outlet-scoped only (no company-level row):
- outlet setting → env fallback → registry default

## API Plan
- `GET /api/settings/config?outlet_id=...&keys=...`
  - Requires outlet access
  - Returns resolved settings with `value_type`
- `PUT /api/settings/config`
  - Requires outlet access
  - Validates types via shared registry
  - Writes audit log entry

## Settings Registry
Add to `packages/shared`:
- Zod schema per key
- Defaults map
- Type metadata

## Seeding Strategy
- One-time seed script reads env keys and inserts missing DB settings per company (using the first outlet).
- After seeding, DB is the source of truth.

## Backoffice UI
- Add a "Feature Settings" page in Settings.
- Inputs:
  - Toggle for booleans
  - Number input for sync interval
- Default outlet to the user’s first outlet, allow switching.

## Risks
- Must avoid storing secrets in DB.
- Ensure outlet scoping on all reads/writes.
- Keep feature settings distinct from `feature_flags` (module enable/disable).

## Testing
- Verify GET/PUT with valid and invalid payloads.
- Confirm outlet scope enforcement.
- Confirm env fallback is used when DB setting is missing.
- Confirm backoffice UI updates persist.
