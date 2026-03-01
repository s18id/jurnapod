# Modules Replacement Plan (feature_flags → modules + company_modules)

## Goal
Replace `feature_flags` with `modules` + `company_modules` as the single source of truth for module enablement and module config, while preserving unknown flags in a legacy bucket.

## Decisions (Locked)
- Company-level only (no outlet overrides).
- Canonical JSON on write.
- Keep `feature_flags` read-only for one release, then drop.

## Scope
- Add module catalog + company module config.
- Migrate existing feature flags into module configs.
- Update API + sync pull to use company_modules.
- Replace Feature Flags UI with Modules UI.
- Keep Feature Settings and Inventory Settings as outlet-level `company_settings`.

## Non-Goals
- No outlet-level module enablement.
- No change to auth flows.
- No secret storage.

---

## Schema

### New tables
**modules**
- `id` (PK)
- `code` (unique, e.g. `pos`, `sales`, `inventory`)
- `name`, `description`
- `created_at`, `updated_at`

**company_modules**
- `company_id` (FK)
- `module_id` (FK)
- `enabled` (bool)
- `config_json` (JSON, canonical)
- `created_by_user_id`, `updated_by_user_id`
- `created_at`, `updated_at`
- Unique `(company_id, module_id)`
- `JSON_VALID(config_json)`

### Sync triggers
- Add insert/update/delete triggers on `company_modules` to bump `sync_data_versions`.
- Remove feature_flags triggers once deprecation period ends.

---

## Module Catalog (seed)
Minimum v1:
- `platform`, `pos`, `sales`, `inventory`, `purchasing`, `reports`, `settings`, `accounts`, `journals`

---

## Migration Strategy

### Known flag mapping
- `pos.enabled` → `company_modules.pos.enabled`
- `sales.enabled` → `company_modules.sales.enabled`
- `inventory.enabled` → `company_modules.inventory.enabled`
  - If `inventory.enabled` contains `level`, put `level` in `company_modules.inventory.config_json`.
- `purchasing.enabled` → `company_modules.purchasing.enabled`
- `pos.tax`, `pos.payment_methods`, `pos.config` → merge into `company_modules.pos.config_json`
  - Merge precedence: `pos.config` overrides `pos.tax`/`pos.payment_methods` if overlapping.

### Unknown flags (safe migration)
- All other `feature_flags` keys go to:
  - `company_modules.platform.config_json.legacy_flags[key] = { enabled, config_json }`

### Canonical JSON on write
- Sort keys and JSON stringify consistently in API layer for all module config updates.

---

## API

### New endpoint
`GET /api/settings/modules`
- Returns modules + enabled + config JSON.

`PUT /api/settings/modules`
- Validates per-module schema.
- Writes audit log.
- Saves canonical JSON.

### Replace reads
- Replace all `feature_flags` reads in:
  - `apps/api/src/lib/master-data.ts` (sync pull config)
  - `apps/api/app/api/settings/outlet-payment-method-mappings/route.ts`
  - Any POS sync or posting code reading flags
- Remove `/api/settings/feature-flags` after deprecation period.

---

## Shared Schemas

### Module registry
- Add per-module Zod schemas (pos, inventory, etc.).
- Provide defaults and types for validation.

### Example configs
- `pos`: tax + payment_methods
- `inventory`: level
- Others can be empty until needed.

---

## Backoffice UI

### Replace Feature Flags page
- New “Modules” page:
  - List modules with toggle.
  - Config editor: structured form when schema exists, JSON editor fallback.
  - Show warnings for legacy flags (optional).

### Keep existing settings
- Feature Settings (company_settings, outlet-scoped)
- Inventory Settings (company_settings, outlet-scoped)

---

## Scripts & Seeds
- Update `packages/db/scripts/seed.mjs` to seed modules + company_modules.
- Update any scripts that read feature_flags (e.g., `backfill-pos-journals.mjs`).

---

## Tests
- Add `/api/settings/modules` integration tests.
- Update integration tests referencing `feature_flags`.
- Verify `/sync/pull` returns POS config from modules.

---

## Deprecation Plan
- Release N: write `company_modules`, keep `feature_flags` read-only.
- Release N+1: drop `feature_flags` table + triggers.

---

## Rollback Strategy
- Keep `feature_flags` unchanged during migration.
- If issues arise, switch reads back to `feature_flags` temporarily.
- `company_modules` stays as shadow until fixed.
