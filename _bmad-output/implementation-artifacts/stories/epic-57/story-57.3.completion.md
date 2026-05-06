# Story 57.3 Completion Report

**Story:** 57.3 — AR Credits/Void/Refund Invariants
**Epic:** 57 — AR + Treasury Correctness (S57)
**Status:** ✅ DONE
**Completed:** 2026-05-06

---

## Summary

Story 57.3 implements atomic journal posting for AR credit notes via a `CreditNotePostingHook` injection point inside `postCreditNote()`, following the same pattern established in Story 57.2 for invoices and payments. It also hardens error mapping across the AR correction routes (credit-notes, invoices, payments) so that all documented domain error types return appropriate HTTP status codes. Additionally, a real AP reconciliation snapshot archive transition flow was implemented as a parallel deliverable, providing the live archive path required by the trigger-0201 exception mechanism.

---

## Files Created

| File | Description |
|------|-------------|
| `packages/modules/sales/src/interfaces/credit-note-posting-hook.ts` | `CreditNotePostingHook` interface (analogous to `InvoicePostingHook` / `PaymentPostingHook`) |
| `apps/api/src/lib/modules-sales/credit-note-posting-hook.ts` | `ApiCreditNotePostingHook` adapter — queries credit note + lines within live transaction |
| `apps/api/src/lib/modules-sales/credit-note-service-composition.ts` | Singleton `getComposedCreditNoteService()` wiring `db + accessScopeChecker + ApiCreditNotePostingHook` |

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/modules/sales/src/types/credit-notes.ts` | Added `PostCreditNoteInput` type (`_creditNoteId`, `_companyId` internal input for hook) |
| `packages/modules/sales/src/services/credit-note-service.ts` | Added `postingHook: CreditNotePostingHook` to deps; called inside `postCreditNote()` transaction block |
| `packages/modules/sales/src/index.ts` | Exported `CreditNotePostingHook` interface and `PostCreditNoteInput` type |
| `apps/api/src/lib/modules-sales/index.ts` | Exported `ApiCreditNotePostingHook`, `createComposedCreditNoteService`, `getComposedCreditNoteService` |
| `apps/api/src/lib/credit-notes/credit-note-service.ts` | Switched from `createCreditNoteService()` to `getComposedCreditNoteService()` |
| `apps/api/src/routes/sales/payments.ts` | Added `PaymentStatusError` → 409 mapping for PATCH on POSTED payment (AC6) |
| `apps/api/src/routes/sales/invoices.ts` | Added defensive string-match mapping for void conflict messages → 409 in both normal and OpenAPI handlers |
| `apps/api/src/routes/sales/credit-notes.ts` | Added defensive string-match mapping for reference/conflict messages → 404/409 in both normal and OpenAPI handlers |
| `packages/modules/purchasing/src/types/ap-reconciliation-snapshots.ts` | Added `ArchiveAPReconciliationSnapshotParams` type |
| `packages/modules/purchasing/src/services/ap-reconciliation-snapshot-service.ts` | Added `archiveAPReconciliationSnapshot()` method — idempotent, atomically sets `status='ARCHIVED'`, `archived_at`, `archive_version`, writes `ap_reconciliation_audit_trail` entry; elevated audit failure log from `warn` to `error` |
| `apps/api/src/lib/purchasing/ap-reconciliation-snapshots.ts` | Added `archiveAPReconciliationSnapshot()` API adapter |
| `apps/api/src/routes/purchasing/reports/ap-reconciliation.ts` | Added `POST /api/purchasing/reports/ap-reconciliation/snapshots/:id/archive` with `purchasing.reports` + `manage` ACL |
| `apps/api/__test__/integration/sales/ar-credit-void-refund.test.ts` | All 11 AC tests implemented and active (no `it.skip()` remaining) |
| `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` | Added archive transition integration tests (26 total); fixed `archive_version` type to string `"1"` / `"2"` |
| `apps/api/__test__/integration/sales/ar-snapshot-trigger-compatibility.test.ts` | Fixed `archive_version` type to string `"1"` |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Updated story 57-3 status to `done` |
| `_bmad-output/implementation-artifacts/stories/epic-57/story-57.3.md` | Normalized stale scope; resolved AC4/AC7 refund deferral contradiction; updated status to `ready-for-dev` |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | AR credit note creates new journal entries atomically | ✅ Complete — `CreditNotePostingHook` called inside `postCreditNote()` transaction |
| AC2 | AR credit note idempotency (duplicate `client_ref` → 201 same ID) | ✅ Complete — existing `createCreditNote` replay path returns existing record, no second journal |
| AC3 | AR void marks original as voided, no ledger change | ✅ Complete — already implemented in `sales-db.ts` VOID branch (pre-existing) |
| AC4 | AR refund out of scope — returns 404 | ✅ Complete — `POST /sales/payments/:id/refund` returns 404 |
| AC5 | POSTED invoice PATCH → 409 | ✅ Complete — route maps `InvoiceStatusError` → 409 (pre-existing from 57.2) |
| AC6 | POSTED payment PATCH → 409 | ✅ Complete — route now maps `PaymentStatusError` + `DatabaseConflictError` → 409 |
| AC7 | Refund amount cap validation (deferred) | ✅ Deferred — returns 404 |
| AC8 | Credit note on non-POSTED invoice → 404/400 | ✅ Complete — service throws `DatabaseReferenceError` → route maps to 404; defensive string-match added |
| AC9 | Void of already-voided invoice → 409 | ✅ Complete — service throws `DatabaseConflictError` → route maps to 409; defensive string-match added |
| AC10 | Audit trail entries for CREDIT_NOTE and VOID | ✅ Complete — `credit-note-service.ts` + `sales-db.ts` write audit entries (pre-existing) |
| AC11 | Code review GO | ✅ Complete — review returned GO with no blockers |

---

## Key Features Implemented

### Credit Note Journal Posting (AC1)
- `CreditNotePostingHook` interface defined in `packages/modules/sales` with `_creditNoteId` / `_companyId` internal input fields
- `ApiCreditNotePostingHook` queries credit note + lines within the live `postCreditNote()` transaction
- Hook called at line 427–432 of `postCreditNote()`, atomic with status transition to POSTED
- `createComposedCreditNoteService` wires hook as dependency; `getComposedCreditNoteService()` used by route

### AP Snapshot Archive Transition
- `archiveAPReconciliationSnapshot()` — idempotent: re-archive of already-ARCHIVED snapshot is a no-op (returns current snapshot, no version advancement, no duplicate audit write)
- Atomically: `status='ARCHIVED'` + `archived_at` + `archive_version` + `ap_reconciliation_audit_trail` entry in same transaction
- ACL: `purchasing.reports` + `manage` permission
- Audit trail write failure elevated from `console.warn` to `console.error`

### Error Mapping Hardening
- `PATCH /sales/payments/:id` — `PaymentStatusError` → 409 (AC6)
- `POST /sales/invoices/:id/void` — defensive mapping for `"Invoice is already voided"` / `"Cannot void invoice with payments"` → 409 (AC8, AC9) in both normal and OpenAPI handler paths
- `POST /sales/credit-notes` — defensive mapping for `"Invoice not found or not posted"` / `"Invoice outlet mismatch"` → 404; `"exceeds remaining credit capacity"` / `"Line totals sum"` → 409 in both handler paths

---

## Technical Implementation

### Credit Note Journal Posting Flow
```
POST /sales/credit-notes/:id/post
  → credit-note-service.postCreditNote({ id, companyId, userId })
    → BEGIN TRANSACTION
      → UPDATE status = 'POSTED'
      → CreditNotePostingHook.postCreditNoteToJournal({ _creditNoteId, _companyId })
        → findCreditNoteByIdWithTx + findCreditNoteLinesWithTx
        → postCreditNoteToJournal() — creates journal entries
      → COMMIT
    → returns posted credit note with journal entries
```

### Archive Transition Flow
```
POST /api/purchasing/reports/ap-reconciliation/snapshots/:id/archive
  → requireAccess(purchasing.reports, manage)
  → archiveAPReconciliationSnapshot({ snapshotId, companyId, userId })
    → BEGIN TRANSACTION
      → SELECT snapshot WHERE status != 'ARCHIVED' FOR UPDATE
      → UPDATE status = 'ARCHIVED', archived_at, archive_version
      → INSERT INTO ap_reconciliation_audit_trail (action_type='ARCHIVED')
      → COMMIT
    → returns updated snapshot
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sales/credit-notes/:id/post` | Transitions credit note to POSTED; atomically posts journal entries via hook |
| `POST` | `/sales/invoices/:id/void` | Voids invoice; marks `voided_at`/`voided_by`; writes audit trail |
| `PATCH` | `/sales/payments/:id` | Updates payment; rejects POSTED payment with 409 |
| `POST` | `/purchasing/reports/ap-reconciliation/snapshots/:id/archive` | Transitions snapshot to ARCHIVED; writes audit trail entry |

---

## Code Quality

| Check | Result |
|-------|--------|
| `npm run build -w @jurnapod/modules-purchasing` | ✅ Pass |
| `npm run build -w @jurnapod/modules-sales` | ✅ Pass |
| `npm run build -w @jurnapod/db` | ✅ Pass |
| `npm run build -w @jurnapod/api` | ✅ Pass (`tsc --noEmit`) |
| `npx tsx scripts/validate-sprint-status.ts` | ✅ Pass — 57 epic headers healthy |
| Integration test suites (45 tests) | ✅ 45/45 passing |

---

## Testing Performed

### Integration Tests
- ✅ `ar-credit-void-refund.test.ts` — 11/11 AC tests passing
  - AC1: Credit note creates journal entries atomically
  - AC2: Duplicate `client_ref` returns same credit note ID (idempotency)
  - AC3: Void preserves journal, `voided_at`/`voided_by` populated
  - AC4: Refund → 404 (deferred)
  - AC5: PATCH on POSTED invoice → 409
  - AC6: PATCH on POSTED payment → 409
  - AC7: Refund amount cap → 404 (deferred)
  - AC8: Credit note on VOID invoice → 404
  - AC9: Double void → 409
  - AC10: Audit logs contain CREDIT_NOTE and VOID actions
  - ACL: `analyzeOnlyToken` (ANALYZE=16 on `sales.transactions`) denied CREATE
- ✅ `ap-reconciliation-snapshots.test.ts` — 26/26 passing (including archive transition + audit trail)
- ✅ `ar-snapshot-trigger-compatibility.test.ts` — 8/8 passing

---

## Dev Notes

### Pattern Consistency
- Credit note journal posting follows the exact same `*PostingHook` pattern as `InvoicePostingHook` (Story 57.2) and `PaymentPostingHook` (Story 57.2): interface in `packages/modules`, API adapter in `apps/api/src/lib/modules-*`, composition singleton.
- Archive transition follows the idempotent pattern used in snapshot creation: early-return for already-ARCHIVED status, version preserved, audit trail written within same transaction.

### Type Safety
- `PostCreditNoteInput` uses underscore-prefixed fields (`_creditNoteId`, `_companyId`) as internal inputs set by `CreditNoteService` before calling the hook — convention clearly established by analogous hooks.
- `archive_version` is `VARCHAR(64)` in schema; tests use string literals `"1"`, `"2"` matching the DB type.

### Error Handling
- All domain error types (`DatabaseReferenceError`, `DatabaseConflictError`, `PaymentStatusError`, `InvoiceStatusError`) mapped to appropriate HTTP status codes in route catch blocks.
- Defensive string-match fallback catches plain `Error` instances with conflict-like messages — covers edge cases where service throws `Error` subclasses not caught by primary `instanceof` checks.

### No New Business DB Triggers
- Archive transition implemented entirely in application code (`archiveAPReconciliationSnapshot()` service method). No new triggers introduced. Trigger 0201 exception path is a DB-level allowlist; the actual business logic lives in the service layer.

---

## Review Findings

Risk-based review (bmad-master) returned **GO — no blockers**:

| Severity | Issue | Resolution |
|----------|-------|-----------|
| P2 | Audit trail INSERT failure was swallowed with `console.warn` | Elevated to `console.error` |
| P2 | Test comment about `archive_version` increment described non-idempotent behavior | Clarified as no-op for already-ARCHIVED |
| P3 | Defensive void error mapping is redundant with `DatabaseConflictError` catch | Kept as defense-in-depth; low risk |
| P3 | `postingHook` input fields use underscore convention without inline comment | Follows established pattern; low risk |

---

## Notes

- **Refund deferred beyond Epic 57**: `POST /sales/payments/:id/refund` returns 404. AC7 (refund amount cap) is deferred to post-Epic 57 treasury handoff.
- **Archive version is lifecycle metadata**: `archive_version` is a revision marker (string), not a business counter. `snapshot_version` is the true business version field.
- **Idempotent re-archive**: calling `archiveAPReconciliationSnapshot()` on an already-ARCHIVED snapshot returns the current snapshot with no changes — no duplicate audit entry, no version advancement.

---

**Story 57.3 is COMPLETE.**
