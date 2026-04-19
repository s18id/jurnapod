# Story 47.6: Reconciliation Snapshot & Audit Trail

Status: backlog

## Story

As an **auditor**,  
I want immutable snapshots of reconciliation results with a complete audit trail,  
So that I can verify past reconciliations and track changes over time.

---

## Context

Reconciliation results are point‑in‑time calculations that can change as new transactions are posted or errors corrected. This story creates immutable snapshots of reconciliation summaries (Story 47.1) and stores them with a versioned audit trail, enabling historical comparison and audit compliance.

**Dependencies:** Story 47.1 (reconciliation summary) provides the data to snapshot. Story 47.5 (period close) may trigger snapshots at period‑end.

---

## Acceptance Criteria

**AC1: Reconciliation Snapshot Capture**
**Given** a reconciliation summary is calculated,
**When** a user explicitly requests a snapshot,
**Then** the system stores an immutable copy of the summary along with:
- `as_of_date`
- AP balance, GL balance, variance
- Account set used
- Calculation timestamp
- User who requested the snapshot (if manual)
- **And** the snapshot is assigned a unique version number.

**AC2: Automated Period‑End Snapshots**
**Given** a period is closed (Epic 32),
**When** the period‑close process completes,
**Then** an automatic reconciliation snapshot is taken for the period‑end date,
**And** the snapshot is marked as `auto_generated = true`.

**AC3: Snapshot Immutability**
**Given** a snapshot is stored,
**When** any attempt is made to modify or delete it,
**Then** the operation is rejected (snapshots are read‑only).

**AC4: Snapshot Query & Comparison**
**Given** multiple snapshots exist for the same `as_of_date`,
**When** a user queries snapshots,
**Then** they can:
- List all snapshots for a date range
- Compare two snapshots side‑by‑side (differences highlighted)
- See the delta between consecutive snapshots for the same `as_of_date`

**AC5: Audit Trail for Snapshot Changes**
**Given** a snapshot is created or a reconciliation is re‑run,
**When** the snapshot differs from a previous snapshot for the same `as_of_date`,
**Then** an audit entry is created capturing:
- Previous values
- New values
- What changed (which transactions added/removed/modified)
- Reason for change (e.g., “journal posted”, “invoice voided”)

**AC6: Snapshot Export**
**Given** a snapshot exists,
**When** the user requests export,
**Then** they can download a PDF or CSV containing the snapshot details and supporting drill‑down (if available).

**AC7: API Endpoints**
**Given** appropriate permissions,
**When** the user calls:
- `POST /api/accounting/ap-reconciliation/snapshots` (create snapshot for a given `as_of_date`)
- `GET /api/accounting/ap-reconciliation/snapshots` (list with filters)
- `GET /api/accounting/ap-reconciliation/snapshots/{id}` (retrieve one)
- `GET /api/accounting/ap-reconciliation/snapshots/{id}/compare?with={other_id}` (compare two)
- `GET /api/accounting/ap-reconciliation/snapshots/{id}/export?format=pdf` (export)
**Then** each endpoint returns the expected data.

**AC8: Retention Policy**
**Given** snapshots accumulate over time,
**When** a snapshot is older than a configurable retention period (e.g., 7 years),
**Then** it may be archived (moved to cold storage) but never deleted.

---

## Tasks / Subtasks

- [ ] Design `ap_reconciliation_snapshots` table (company_id, version, as_of_date, ap_balance, gl_balance, variance, account_set JSON, calculation_ts, created_by, auto_generated BOOLEAN)
- [ ] Design `ap_reconciliation_audit_trail` table (company_id, snapshot_id, previous_snapshot_id, change_description, changed_at, changed_by)
- [ ] Create migrations for snapshot and audit tables
- [ ] Implement snapshot service that copies current reconciliation summary
- [ ] Integrate automatic snapshot on period‑close (hook into Epic 32)
- [ ] Build snapshot CRUD endpoints (create, list, retrieve)
- [ ] Implement comparison endpoint (diff two snapshots)
- [ ] Add export endpoint (reuse existing export infrastructure)
- [ ] Write integration tests for snapshot immutability and audit trail
- [ ] Write integration tests for period‑end auto‑snapshot
- [ ] Update OpenAPI spec

---

### Review Findings

- [ ] *Review placeholder – findings will be populated during implementation review*

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/db/migrations/0XXX_ap_reconciliation_snapshots.sql` | snapshots table migration |
| `packages/db/migrations/0XXX_ap_reconciliation_audit_trail.sql` | audit trail table migration |
| `packages/shared/src/schemas/ap-reconciliation-snapshots.ts` | Zod schemas for snapshot types |
| `packages/modules/accounting/src/services/ap-reconciliation-snapshot-service.ts` | Snapshot and audit logic |
| `apps/api/src/routes/accounting/ap-reconciliation-snapshots.ts` | Snapshot API routes |
| `apps/api/__test__/integration/accounting/ap-reconciliation-snapshots.test.ts` | Integration tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add ApReconciliationSnapshots and ApReconciliationAuditTrail types |
| `packages/shared/src/index.ts` | Modify | Export snapshot schemas |
- `packages/modules/accounting/src/services/ap-reconciliation-service.ts` | Modify | Call snapshot service on manual request |
- `packages/modules/accounting/src/services/period-close-service.ts` (Epic 32) | Modify | Trigger auto‑snapshot on period close |
| `packages/shared/src/constants/modules.ts` | Modify | Add `accounting.ap_reconciliation_snapshots` permission entry |

---

## Validation Evidence

```bash
# Create a manual snapshot
curl -X POST /api/accounting/ap-reconciliation/snapshots \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"as_of_date": "2025-04-19"}'

# List snapshots
curl "/api/accounting/ap-reconciliation/snapshots?start_date=2025-04-01&end_date=2025-04-30" \
  -H "Authorization: Bearer $TOKEN"

# Compare two snapshots
curl "/api/accounting/ap-reconciliation/snapshots/1001/compare?with=1002" \
  -H "Authorization: Bearer $TOKEN"

# Export snapshot as PDF
curl "/api/accounting/ap-reconciliation/snapshots/1001/export?format=pdf" \
  -H "Authorization: Bearer $TOKEN" -o snapshot.pdf
```

---

## Dev Notes

- `version` can be a monotonically increasing integer per company (or a UUID). Simpler: auto‑increment ID plus a `version` column that increments for the same `as_of_date`.
- `account_set` stored as JSON array of account IDs; ensure the JSON schema is validated.
- Snapshots are immutable; updates are prohibited at the database level (no UPDATE statements). Deletion may be prevented by application logic or DB trigger.
- Audit trail entries should reference both the new snapshot and the previous snapshot (if any) to form a chain.
- Change description should be machine‑readable where possible (e.g., “invoice_voided: INV‑1001”, “journal_posted: J‑2025‑0045”).
- Export can reuse the generic PDF/CSV export service from Epic 5/36.
- Retention policy may be implemented later; for MVP, store all snapshots indefinitely.

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `as any` casts added without justification
- [ ] New status columns use `TINYINT` (per Epic 47 constraint)
- [ ] All new tables have proper indexes on `company_id`, `as_of_date`, `version`
- [ ] Snapshot creation is atomic (transaction‑safe)
- [ ] Comparison logic is efficient (does not recompute full reconciliation)
- [ ] Audit trail captures sufficient context for forensic investigation
- [ ] Export uses canonical export patterns (no ad‑hoc file generation)