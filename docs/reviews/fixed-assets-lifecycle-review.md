# Fixed Assets Lifecycle Revamp - Review Document

**Version:** 1.1  
**Date:** 2026-03-14  
**Status:** Implemented with Critical Defects - Requires Patch

---

## 1. Summary

This review documents the implementation of the fixed-assets lifecycle management system, extending the original depreciation-only system to include full asset lifecycle: acquisition, transfer, impairment, disposal, and void operations.

**⚠️ CRITICAL:** This implementation contains financial posting errors and security gaps that must be remediated before production use. See Sections 3 and 9.

---

## 2. Changes Overview

### 2.1 New Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `fixed_asset_events` | Immutable event log for all lifecycle actions | event_type, event_date, journal_batch_id, status, idempotency_key |
| `fixed_asset_books` | Running book value per asset | cost_basis, accum_depreciation, accum_impairment, carrying_amount |
| `fixed_asset_disposals` | Disposal-specific data | proceeds, cost_removed, gain_loss, disposal_type |
| `fixed_assets.disposed_at` | Disposal tracking | DATETIME nullable |

### 2.2 New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/accounts/fixed-assets/:id/acquisition` | POST | Capitalize asset with journal entry |
| `/accounts/fixed-assets/:id/transfer` | POST | Transfer between outlets |
| `/accounts/fixed-assets/:id/impairment` | POST | Write down asset value |
| `/accounts/fixed-assets/:id/disposal` | POST | Dispose (sale/scrap) |
| `/accounts/fixed-assets/:id/ledger` | GET | Event timeline with journals |
| `/accounts/fixed-assets/:id/book` | GET | Current book value |
| `/accounts/fixed-assets/events/:eventId/void` | POST | Reverse event (acquisition/disposal only) |

### 2.3 New Shared Schemas

- `AcquisitionRequestSchema` / `AcquisitionResponseSchema`
- `TransferRequestSchema` / `TransferResponseSchema`
- `ImpairmentRequestSchema` / `ImpairmentResponseSchema`
- `DisposalRequestSchema` / `DisposalResponseSchema`
- `VoidEventRequestSchema` / `VoidResponseSchema`
- `FixedAssetEventSchema`, `FixedAssetBookSchema`, `FixedAssetDisposalSchema`
- `LedgerResponseSchema`

### 2.4 Backoffice UI

- Complete refactor using Mantine components
- Asset list with filters (outlet, status, category)
- Category management section
- Detail modal with tabs: Overview, Lifecycle, Actions
- Action modals: Acquisition, Transfer, Impairment, Disposal wizards

---

## 3. Critical Defects Found

### 3.1 P1 - Financial Posting Errors

| Issue | Location | Impact |
|-------|----------|--------|
| **Acquisition posts debit/credit to same account** | `fixed-assets-lifecycle.ts:484-491` | No real asset recorded; journals net to zero |
| **Impairment posts to same account on both sides** | `fixed-assets-lifecycle.ts:712-713` | No real impairment recorded |
| **Disposal journal lines all use `cash_account_id`** | `fixed-assets-lifecycle.ts:900-925` | Wrong account mapping for asset/accum/gain/loss |
| **Disposal gain/loss formula incorrect** | `fixed-assets-lifecycle.ts:795` | Sale: `proceeds + cost - carrying` should be `proceeds - cost - carrying` |

### 3.2 P1 - Access Control Gaps

| Issue | Location | Impact |
|-------|----------|--------|
| **Impairment, Disposal, Void don't enforce outlet access** | `recordImpairment`, `recordDisposal`, `voidEvent` | Users can mutate assets outside their outlet |
| **Transfer doesn't check source outlet access** | `recordTransfer:545` | User can transfer FROM outlet they can't access |
| **Read endpoints (book, ledger) lack outlet scoping** | `getAssetBook`, `getAssetLedger` | Users can read asset data outside their outlet |
| **Route layer returns 404 for unauthorized access** | All route handlers | Correctly hides existence, but service layer must enforce |

### 3.3 P1 - Void/Book Integrity

| Issue | Location | Impact |
|-------|----------|--------|
| **Void acquisition doesn't reset book** | `voidEvent:1010` | Book still shows acquired cost after void |
| **Void disposal restores carrying_amount incorrectly** | `voidEvent:1028` | Sets to `cost_removed` instead of `cost - depr - impair` |
| **No idempotency race handling** | All `record*` functions | Concurrent dupes can cause 500 instead of returning existing |

### 3.4 P0 - API Contract Mismatch

| Issue | Location | Impact |
|-------|----------|--------|
| **Response missing `duplicate` field** | Acquisition, Transfer, Impairment, Disposal routes | Idempotent callers cannot detect duplicates |
| **Request missing required account fields** | Schemas and UI | Cannot post correct journals without manual API calls |

---

## 4. Review Checklist

### 4.1 Data Model ⚠️

- [x] Event log is append-only (immutable corrections via void)
- [x] Idempotency key enforced at DB level (unique constraint)
- [x] Book values calculated correctly (cost - depr - impair = carrying)
- [x] Disposal gain/loss math verified (formula needs fix)
- [x] Disposed assets blocked from further lifecycle actions

### 4.2 API Contracts ⚠️

- [x] All requests validated with Zod schemas
- [x] All responses follow consistent `{ success, data }` format
- [x] Error codes consistent with existing API patterns
- [x] Auth/authorization enforced on all endpoints (partial - see 3.2)
- [ ] `duplicate` field returned in responses (missing - see 3.4)

### 4.3 Accounting Integrity ⚠️

- [x] Every lifecycle action creates journal batch (except transfer)
- [x] Journal lines are balanced (debit = credit) - BUT using wrong accounts
- [x] Fiscal year validation on all date fields
- [x] Void creates reversal journal entries (but book integrity broken)
- [x] Company/outlet scoping enforced (partial - see 3.2)

### 4.4 Security ⚠️

- [x] Company ID scoping on all queries
- [ ] Outlet access control for ALL asset operations (partial - see 3.2)
- [x] Role-based permissions (OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT)
- [x] User audit trail (created_by, voided_by)

### 4.5 Testing ⚠️

- [x] Integration tests for full lifecycle
- [x] Idempotency test (but test logic incorrect - sends different keys)
- [x] Void reversal test
- [x] Outlet access control test
- [x] 404 behavior for unauthorized access

---

## 5. Known Limitations (Phase 2)

1. **Revaluation** - Not included in v1; deferred to phase 2
2. **Depreciation Run Integration** - Existing depreciation system not yet linked to new event model
3. **Partial Impairment** - Currently writes off entire amount; partial writes need enhancement
4. **Bulk Operations** - No bulk acquisition/disposal support

---

## 6. Migration Notes

- Migrations 0094-0097 are additive and idempotent
- Existing fixed_assets data preserved
- Legacy routes return 410 with new path hints
- No data migration needed

---

## 7. Files Changed

```
apps/api/src/lib/fixed-assets-lifecycle.ts     (new, 1157 lines)
apps/api/app/api/accounts/fixed-assets/[assetId]/acquisition/route.ts
apps/api/app/api/accounts/fixed-assets/[assetId]/transfer/route.ts
apps/api/app/api/accounts/fixed-assets/[assetId]/impairment/route.ts
apps/api/app/api/accounts/fixed-assets/[assetId]/disposal/route.ts
apps/api/app/api/accounts/fixed-assets/[assetId]/ledger/route.ts
apps/api/app/api/accounts/fixed-assets/[assetId]/book/route.ts
apps/api/app/api/accounts/fixed-assets/events/[eventId]/void/route.ts
apps/backoffice/src/features/fixed-assets-page.tsx (rewritten)
packages/shared/src/schemas/fixed-assets.ts (new)
packages/db/migrations/0094-0097_*.sql (new)
docs/plans/fixed-assets-lifecycle-revamp.md (design)
```

---

## 8. Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| Acquisition creates journal and updates book | ⚠️ Broken | Posting uses same account on both sides |
| Depreciation runs post journals | ✅ (existing) | |
| Transfer updates outlet and creates audit | ⚠️ Partial | Missing source outlet access check |
| Impairment posts journal and updates book | ⚠️ Broken | Posting uses same account on both sides |
| Disposal calculates gain/loss correctly | ⚠️ Broken | Wrong formula and wrong account mapping |
| Void creates reversal journal | ⚠️ Broken | Book integrity not maintained |
| Ledger shows full event timeline | ⚠️ Partial | Missing outlet access control |
| Book shows current carrying amount | ⚠️ Partial | Missing outlet access control |
| Company/outlet scoping enforced | ⚠️ Partial | Gaps in mutation paths |
| Duplicate idempotent requests handled | ⚠️ Broken | Race condition possible, no duplicate in response |
| UI uses Mantine components | ✅ | |

---

## 9. Patch Phases

See `docs/patches/fixed-assets-lifecycle-patch-plan.md` for detailed implementation phases.

### Phase 1: Financial Posting Correctness (P1)
- Fix acquisition/impairment/disposal journal mappings
- Fix disposal gain/loss formula
- Add required account fields to schemas and UI

### Phase 2: Access Control Hardening (P1)
- Add outlet access checks to all lifecycle mutations
- Add outlet access checks to read endpoints (book, ledger)
- Fix transfer source outlet access verification

### Phase 3: Void/Book Integrity + Idempotency (P1)
- Implement book recompute from events
- Fix void logic to maintain book integrity
- Add race-safe idempotency handling

### Phase 4: Contract Alignment (P0)
- Add `duplicate` field to all command responses
- Align schemas with required account fields

### Phase 5: Tests + Final Polish
- Fix integration test assertions
- Add coverage for corrected behaviors

---

## 10. Recommendations

1. **DO NOT DEPLOY** until Phase 1-3 patches are applied
2. **Run integration tests** against a seeded database to verify end-to-end flow (after fixes)
3. **Add depreciation run integration** in phase 2 to link existing depreciation to event model
4. **Consider adding revaluation** support in phase 2
5. **Monitor journal batch sizes** - disposal can create 5+ lines; verify performance
6. **Add audit log integration** for compliance tracking
