# ADR-0020: Numbering System — Sequence Key, Reset, Locking & Audit

**Date:** 2026-04-15
**Status:** Accepted
**Deciders:** Ahmad, Architect

## Context

Epic 44 expands AR customer and invoicing workflows, which introduces new numbering pressure in two places: (1) higher concurrency during customer and invoice creation and (2) more reset variants for business-facing identifiers. The current numbering system uses `numbering_templates` with template pattern, `reset_period`, and `current_value`, and already relies on `SELECT ... FOR UPDATE` row locks. Existing reset periods are `NEVER`, `YEARLY`, and `MONTHLY`; Epic 44 adds `WEEKLY` and `DAILY`.

The epic also introduces `SALES_CUSTOMER` master data and requires strict collision handling for user-provided codes. Business expectation is that codes are never silently reused, including records that were soft-deleted. In parallel, template changes must remain auditable without creating unnecessary MVP schema sprawl.

## Decision

1. **Sequence key and scope**
   - Canonical sequence identity is `(company_id, doc_type, outlet_id)`.
   - Effective primary business key is `company_id + doc_type`; `outlet_id` is an optional partition used only for document types that explicitly require outlet-local sequences.
   - `SALES_CUSTOMER` is defined as company-wide, therefore `outlet_id = NULL` always.

2. **Reset periods and boundaries**
   - Supported reset periods are `NEVER`, `YEARLY`, `MONTHLY`, `WEEKLY`, `DAILY`.
   - `YEARLY`: reset at `YYYY-01-01T00:00:00Z`.
   - `MONTHLY`: reset at first day of month, `00:00:00Z`.
   - `WEEKLY`: ISO week boundary using ISO week number semantics (`getISOWeek()`), with week transitions determined at UTC boundary.
   - `DAILY`: reset at `00:00:00Z` each day.

3. **Locking and retry model**
   - Keep row-level serialization via `FOR UPDATE` on the active sequence row.
   - Concurrent requests for the same sequence key and same period must serialize.
   - Retry policy: maximum 3 attempts with bounded exponential backoff for lock wait/deadlock conflicts.

4. **Audit strategy**
   - MVP will not add a dedicated `numbering_template_changes` table.
   - Template edits are recorded in `audit_logs` with action `NUMBERING_TEMPLATE_UPDATE` and sufficient before/after metadata for supportability.
   - Future event-store migration remains an explicit extension path.

5. **Code collision policy**
   - User-provided code collisions against both active and soft-deleted records return `409 Conflict` with conflict details.
   - Active uniqueness remains DB-guarded by existing filtered active-record unique constraints.
   - Historical no-reuse is enforced in service validation (soft-deleted values are treated as reserved and unreusable).

6. **Default template seeding**
   - `initializeDefaultTemplates()` includes `doc_type = "SALES_CUSTOMER"`.
   - Pattern: `CUST/{{yyyy}}/{{seq4}}`.
   - Reset period: `YEARLY`.
   - Scope: company-wide (`outlet_id = NULL`).

## Consequences

**Positive:**
- Predictable, deterministic numbering under concurrency.
- Explicit support for operational reset cadences (daily/weekly) without custom logic per route.
- Customer codes remain stable and non-recyclable, improving auditability and external reconciliation.
- MVP keeps schema surface minimal by reusing `audit_logs`.

**Negative:**
- Service-layer historical uniqueness check adds one extra validation path.
- Weekly reset semantics require strict UTC/ISO-week consistency across services and tests.

**Neutral/Future:**
- A dedicated numbering event log may still be introduced later if audit query volume grows.

## Related Stories

- Story 44.0 — Numbering reset system (WEEKLY + DAILY)
- Story 44.1 — Customer master CRUD (unique code per company, soft delete)
