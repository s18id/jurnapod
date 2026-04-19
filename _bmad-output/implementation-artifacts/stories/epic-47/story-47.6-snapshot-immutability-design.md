# Story 47.6 Snapshot Immutability & Versioning Design

**Epic:** 47 (AP Reconciliation)  
**Story:** 47.6  
**Date:** 2026-04-19

## 1) Snapshot Table Schema Proposal

Table: `ap_reconciliation_snapshots`

- `id` BIGINT UNSIGNED PK
- `company_id` BIGINT UNSIGNED NOT NULL
- `as_of_date` DATE NOT NULL
- `timezone` VARCHAR(64) NOT NULL (resolved at snapshot time)
- `snapshot_version` INT UNSIGNED NOT NULL
- `ap_subledger_balance` DECIMAL(19,4) NOT NULL
- `gl_control_balance` DECIMAL(19,4) NOT NULL
- `variance` DECIMAL(19,4) NOT NULL
- `configured_account_ids_json` JSON/TEXT NOT NULL (resolved account-set at snapshot time)
- `account_source` VARCHAR(64) NOT NULL (`settings` | `fallback_company_default`)
- `inputs_hash` CHAR(64) NOT NULL (deterministic checksum of effective inputs)
- `created_by` BIGINT UNSIGNED NOT NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `superseded_by_snapshot_id` BIGINT UNSIGNED NULL
- `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'

Indexes / constraints:

- UNIQUE (`company_id`, `as_of_date`, `snapshot_version`)
- INDEX (`company_id`, `as_of_date`, `created_at`)
- INDEX (`company_id`, `status`)
- FK (`company_id`) -> companies(id)
- FK (`created_by`) -> users(id)

## 2) Versioning + Immutability Model

- Snapshots are append-only records.
- Existing snapshot financial values (`ap_subledger_balance`, `gl_control_balance`, `variance`) are immutable after insert.
- Re-run for same `company_id` + `as_of_date` creates a new `snapshot_version = previous + 1`.
- Previous snapshot remains preserved and linked via `superseded_by_snapshot_id` (optional chain), never overwritten.
- `inputs_hash` captures effective account-set, source, timezone, and calculation boundaries so historical interpretation is locked.

## 3) Retention & Archival Policy

- Keep all versions for current fiscal year + previous fiscal year online.
- Older snapshots move to archive table/storage with same schema shape.
- Archive operation must preserve `inputs_hash`, version chain, and actor metadata.
- Deletion is disallowed for ACTIVE snapshots in application paths; retention jobs only archive, not hard-delete.

## 4) Config Change Behavior

- Changes to AP reconciliation settings affect only future snapshot runs.
- Historical snapshots remain tied to their stored `configured_account_ids_json`, `account_source`, `timezone`, and `inputs_hash`.
- No recomputation-in-place is allowed.

## 5) ACL + Audit Requirements

- Create snapshot endpoint requires explicit resource ACL (proposed `accounting.journals` ANALYZE/READ depending route policy).
- Read/list snapshot endpoints require explicit resource ACL and tenant scoping by `company_id`.
- Every create/archive action must emit audit log entries with actor, company, as_of_date, snapshot_version, and action result.

## 6) Risk Register

- **P1:** Retroactive mutation of historical snapshot values.  
  **Mitigation:** append-only versioning and immutable financial columns.
- **P1:** Cross-tenant leakage in list/read paths.  
  **Mitigation:** mandatory `company_id` scoping and ACL checks.
- **P2:** Inconsistent reruns caused by missing input traceability.  
  **Mitigation:** deterministic `inputs_hash` + stored effective inputs.
- **P2:** Archive drift breaks auditability.  
  **Mitigation:** archive schema parity + chain-preserving archival jobs.

## 7) Story 47.6 Acceptance Checklist

- [ ] `ap_reconciliation_snapshots` migration implemented (MySQL/MariaDB portable, rerunnable guards)
- [ ] Application write path is append-only versioned
- [ ] Update/delete of immutable financial fields blocked in service layer
- [ ] Read/list APIs enforce tenant scope + resource ACL
- [ ] Snapshot creation persists effective input lock (`configured_account_ids_json`, `account_source`, `timezone`, `inputs_hash`)
- [ ] Audit logs present for create/archive actions
- [ ] Integration tests cover version increment, immutability, and tenant isolation
