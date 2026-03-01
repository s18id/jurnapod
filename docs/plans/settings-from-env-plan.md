<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Settings from Env Plan

## Goal
Move configurable, non-secret `.env` values into a settings table so they can be edited per company (with optional outlet overrides) and managed from the backoffice.

## Scope
- Add a general settings table for company + optional outlet overrides.
- Provide a settings registry (keys, types, defaults).
- Add API endpoints to read/update settings.
- Seed defaults from `.env` once.
- Add a backoffice UI for inventory-related settings.

## Non-Goals
- Do not store secrets (DB credentials, auth secrets, OAuth secrets).
- Do not change auth or infra configuration flows.

## Defaults (Inventory)
- `inventory.low_stock_threshold` (int, default 5)
- `inventory.reorder_point` (int, default 10)
- `inventory.allow_negative_stock` (bool, default false)
- `inventory.costing_method` (enum: AVG | FIFO | LIFO, default AVG)
- `inventory.warn_on_negative` (bool, default true)

## Proposed Table
`company_settings`
- `id` BIGINT PK
- `company_id` BIGINT NOT NULL
- `outlet_id` BIGINT NULL
- `key` VARCHAR(64) NOT NULL
- `value_type` VARCHAR(16) NOT NULL
- `value_json` LONGTEXT NOT NULL
- `created_at`, `updated_at`
- `created_by`, `updated_by` (nullable if not tracked)

Constraints
- UNIQUE (company_id, outlet_id, key)
- JSON_VALID(value_json)

## API Plan
- `GET /api/settings/config?keys=...`
  - Resolve in order: outlet override → company default → env fallback → registry default
- `PUT /api/settings/config`
  - Validate types using shared schemas
  - Write audit log entry

## Settings Registry
Add in `packages/shared`:
- Zod schema per key
- Defaults map
- Type metadata

## Seeding Strategy
- One-time seed script reads env keys and inserts missing DB settings per company
- After seeding, DB is the source of truth

## Backoffice UI
- Add an “Inventory Settings” section in Settings
- Inputs:
  - Number fields for thresholds
  - Toggle for negative stock
  - Select for costing method

## Risks
- Must avoid storing secrets in DB
- Ensure per-company scoping on all reads/writes

## Testing
- Verify GET/PUT with valid and invalid payloads
- Confirm outlet override precedence
- Confirm backoffice UI updates persist
