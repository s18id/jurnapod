# ADR-0013: Epic 20 Schema Consolidation Canonical Model

## Status
Accepted — 2026-04-01

## Context

Epic 20 consolidates legacy duplicate tables and JSON-heavy configuration into normalized, typed, and auditable structures.
The highest-risk area is sync versioning, where protocol and storage drift can cause broken incremental sync behavior.

## Decision

1. **Sync protocol is canonical and strict**
   - Pull request cursor: `since_version`
   - Pull response cursor: `data_version`
   - No alias protocol fields (for example `sync_data_version`) unless versioned API migration is explicitly planned.

2. **Sync storage is canonical and strict**
   - Single runtime source of truth: `sync_versions`
   - Data-sync row uses `tier IS NULL`
   - Tiered rows use explicit tier values (`MASTER`, `OPERATIONAL`, `REALTIME`, `ADMIN`, `ANALYTICS`)

3. **Legacy sync version tables are retired**
   - `sync_data_versions` and `sync_tier_versions` are archived then dropped
   - Reconciliation to `sync_versions` must happen before drop
   - Migration chain must remain idempotent and MySQL/MariaDB compatible

4. **Legacy relationship/operation tables are retired with archive**
   - `user_outlets` archived then dropped (role scoping via `user_role_assignments`)
   - `sync_operations` archived then dropped (operational tracking via canonical sync/audit flows)

## Consequences

- Reduces schema duplication and migration complexity.
- Prevents two-source-of-truth failures in sync cursor progression.
- Requires strict review discipline to reject any reintroduction of legacy tables/fields in runtime code.

## Validation Evidence

- Database migrations executed successfully on target test database, rerun idempotency verified.
- DB smoke checks passed.
- Sync package tests (`@jurnapod/sync-core`, `@jurnapod/pos-sync`, `@jurnapod/backoffice-sync`) passed after consolidation.
