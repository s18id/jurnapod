# Supplies Operations Rollout Plan

**Version:** 1.0  
**Status:** Proposed  
**Owner:** Backoffice + API + Accounting  
**Product:** Jurnapod (From cashier to ledger)

---

## 1) Executive Summary

This plan expands the Supplies module from master-data maintenance into end-to-end operational usage across purchase, expense, stock movement, reorder, transfer, and reporting flows.  
The rollout preserves Jurnapod invariants: GL as source of truth, tenant isolation, auditability, and safe/idempotent operational writes.

---

## 2) Goals

- Make `supplies` the canonical consumables reference for daily operations.
- Replace free-text consumable entries with `supply_id` references in high-frequency workflows.
- Ensure quantity-changing events are traceable via a stock movement ledger.
- Provide actionable reorder and spend visibility by outlet/company.
- Keep financial impact journal-backed and auditable.

## 3) Non-Goals (v1)

- Full procurement suite (supplier contracts, approvals, RFQ).
- Advanced MRP/forecasting.
- Automatic recipe costing engine beyond supply consumption linkage baseline.

---

## 4) Scope (All Targeted Flows)

1. Supplies master data (already available: CRUD/import/activate/inactivate).
2. Expense entry integration (`supply_id` in expense lines).
3. Purchase/receiving integration (`supply_id` in purchase lines).
4. Stock movement ledger (IN/OUT/ADJUST/WASTE/TRANSFER).
5. Reorder/min-stock thresholds and suggestions.
6. Outlet transfer workflow for consumables.
7. Spend and usage reporting (by supply/outlet/period).
8. POS/recipe consumption linkage (for F&B profile).

---

## 5) Operating Principles and Invariants

- **Accounting/GL source of truth:** financial reports derive from journals.
- **Tenant safety:** all records scoped by `company_id`; outlet-bound flows include `outlet_id`.
- **Idempotency:** retry-safe mutations for operational writes and sync-facing paths.
- **Auditability:** create/update/delete and stock movements emit audit events.
- **Immutable correction preference:** use explicit reversal/adjustment, no silent mutation on finalized records.
- **Money safety:** use DECIMAL, no FLOAT/DOUBLE.

---

## 6) Target Architecture

### 6.1 Core Master Data
- Existing `supplies` table remains canonical:
  - `id`, `company_id`, `sku`, `name`, `unit`, `is_active`, timestamps.
- Existing API and backoffice pages remain entry point for setup and import.

### 6.2 Operational Linking
- Add `supply_id` references in operational line tables (expense and purchase domains).
- Keep optional text snapshot fields where needed for historical readability, but operational integrity relies on `supply_id`.

### 6.3 Inventory Movement Layer
- Introduce movement ledger table for quantity deltas with immutable event rows:
  - Event types: `IN`, `OUT`, `ADJUST`, `WASTE`, `TRANSFER_IN`, `TRANSFER_OUT`.
- Derive on-hand balances from ledger (or from maintained snapshot + ledger reconciliation).

### 6.4 Reporting Layer
- Spend report joins journal-backed expense/purchase postings with `supply_id`.
- Usage and stock risk report combines movement ledger + min stock config.

---

## 7) Workstreams

### WS1 - Expense Flow Integration

**Objective:** Ensure consumable expenses reference supplies consistently.

**Deliverables**
- Shared contracts updated for expense line payload with `supply_id`.
- API validation for `supply_id` ownership and active status.
- Backoffice expense form supply picker (`SKU - Name - Unit`).
- Audit payload includes `supply_id`.

**Acceptance Criteria**
- New expense lines can select supply.
- Invalid/mismatched company supply rejected with 400.
- Inactive supplies blocked for new entries (existing history unaffected).
- Tests cover tenant scope, inactive handling, and duplicate retry behavior.

---

### WS2 - Purchase/Receiving Integration

**Objective:** Structure procurement usage around supplies master data.

**Deliverables**
- Purchase/receiving line contracts with `supply_id`.
- API and UI integration mirroring WS1 validation behavior.
- Posting link to journals where purchase flow requires accounting effect.

**Acceptance Criteria**
- Purchase lines can reference supplies.
- Financial posting remains consistent and journal-linked.
- Company/outlet boundaries enforced.

---

### WS3 - Stock Movement Ledger

**Objective:** Provide auditable quantity trail for all stock changes.

**Deliverables**
- New movement ledger schema + indexes.
- Mutation APIs for adjustment/waste/manual in-out with reason codes.
- Auto-movement creation from receiving and transfer flows.
- Read model for current stock by supply/outlet.

**Acceptance Criteria**
- Every quantity-changing action writes exactly one movement event.
- Repeated requests cannot double-apply the same logical event (idempotency key or equivalent guard).
- On-hand can be recomputed deterministically from ledger.

---

### WS4 - Reorder and Min Stock

**Objective:** Move from reactive to proactive replenishment.

**Deliverables**
- Per outlet-supply min stock configuration.
- Reorder suggestion query/view (shortage amount + recommended action).
- Backoffice alert cards and filtered reorder list.

**Acceptance Criteria**
- Reorder list updates from current on-hand vs threshold.
- Inactive supplies excluded from new suggestions.
- Queries indexed for tenant/outlet/report periods.

---

### WS5 - Outlet Transfer

**Objective:** Make inter-outlet consumable movement traceable.

**Deliverables**
- Transfer document flow (create/approve/receive as needed by policy).
- Paired movement events (`TRANSFER_OUT` source, `TRANSFER_IN` destination).
- Transfer audit trail with statuses.

**Acceptance Criteria**
- Transfer preserves company scope and outlet correctness.
- Quantity conservation validated across paired events.
- Cancellation/reversal path does not silently mutate posted movements.

---

### WS6 - Spend and Usage Reporting

**Objective:** Deliver decision-ready views for operations and finance.

**Deliverables**
- Spend by supply/outlet/month report (journal-backed amount).
- Usage by supply/outlet/month report (movement-based quantity).
- Top supplies, inactive-but-used exception, stockout risk widgets.

**Acceptance Criteria**
- Totals reconcile to journal postings for spend reports.
- Usage totals reconcile to movement ledger.
- Company/outlet filters prevent cross-tenant leakage.

---

### WS7 - POS/Recipe Consumption Linkage (F&B Track)

**Objective:** Connect sales activity to consumable usage for F&B operations.

**Deliverables**
- Optional recipe/BOM mapping to supplies.
- Consumption posting from POS transaction completion (or batch posting).
- Exception handling for missing mappings.

**Acceptance Criteria**
- POS-linked consumption writes deterministic OUT movements.
- Retry/replay safe; no duplicate consumption effects.
- Can be disabled for non-F&B tenants.

---

### WS8 - Governance, RBAC, and Observability

**Objective:** Keep operations safe and supportable.

**Deliverables**
- RBAC matrix updates (`inventory.read/create/update/delete` plus movement/reorder/transfer actions).
- Expanded audit log event taxonomy for supplies operations.
- Operational dashboards for failures/conflicts/idempotency rejects.

**Acceptance Criteria**
- Unauthorized roles cannot mutate supplies operations.
- Critical actions are traceable end-to-end.
- Error rates and duplicate-protection signals are visible.

---

## 8) Shared Contract and API Plan

- Keep all cross-app contracts in `packages/shared` (TypeScript + Zod).
- Validate:
  - `supply_id` numeric and existent in tenant.
  - Optional `outlet_id` valid for outlet-scoped flows.
  - `quantity > 0` where applicable; explicit sign strategy for adjustments.
- Use explicit error envelopes:
  - `INVALID_REQUEST`, `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`.
- Preserve moved-route compatibility where legacy endpoints exist.

---

## 9) Data and Migration Plan

- Additive, rerunnable migrations only.
- MySQL + MariaDB compatibility preserved.
- Use guarded DDL patterns for reruns.
- Required indexes:
  - `(company_id, outlet_id, supply_id, movement_date)`
  - `(company_id, supply_id, movement_type)`
  - reporting period indexes as needed.
- Backfill strategy:
  - Legacy free-text lines remain valid.
  - Optional mapping tool for historical lines to `supply_id` (non-destructive).

---

## 10) Testing Strategy

### Unit
- Validation schemas, status rules, inactive handling, quantity rules.
- Import/matching logic edge cases.

### Integration
- Expense + purchase + movement + transfer happy path and conflicts.
- Tenant/outlet isolation checks.
- Idempotent retry behavior.

### Regression
- Journal reconciliation for spend reports.
- Movement reconciliation for usage/on-hand.
- Audit log single-emission for successful mutations.

### Performance/Smoke
- High-volume movement query latency checks.
- Reorder query under multi-outlet datasets.

---

## 11) Rollout Plan by Sprint

### Sprint 1 (Highest Frequency)
- WS1 Expense integration
- WS2 Purchase integration (core)
- Contract + RBAC baseline
- Focused tests

### Sprint 2
- WS3 Stock movement ledger
- WS4 Min stock + reorder suggestions
- Initial spend/usage report endpoints

### Sprint 3
- WS5 Outlet transfer
- WS6 Dashboard/report polish
- Hardening + migration/backfill utility

### Sprint 4 (Conditional by business profile)
- WS7 POS/recipe consumption linkage (F&B track)
- Feature flag + staged tenant rollout

---

## 12) Success Metrics (Definition of "Most Used Covered")

- >= 80% of new consumable-related entries use `supply_id` (vs free text).
- 100% of quantity-changing actions produce ledger movement events.
- Reorder suggestions available for all active outlets.
- Spend report reconciles with journal totals (variance 0 on controlled test sets).
- Duplicate/retry safety: no duplicate movement or posting from replayed requests.

---

## 13) Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Mixed free-text and `supply_id` data quality during transition. | Phased enforcement + mapping assistant + validation warnings. |
| Duplicate movements from retries/concurrency. | Idempotency keys + unique constraints + transactional boundaries. |
| Report trust issues if spend bypasses journals. | Enforce journal-backed spend derivation; add reconciliation tests. |
| Outlet leakage in transfer/reporting queries. | Strict `company_id` + `outlet_id` filters and tests. |

---

## 14) Open Decisions (Need Product Confirmation)

1. Business profile default: `F&B` vs `Retail` vs `Services` (affects WS7 priority).
2. Transfer policy: require approval step or direct transfer for v1.
3. Reorder suggestion formula: threshold-only vs threshold + recent average usage.
4. Enforcement timing: when to block free-text consumable lines entirely.

---

## 15) Implementation Checklist

- [ ] Contracts updated in `packages/shared`
- [ ] API validation and RBAC complete
- [ ] Backoffice selectors integrated in expense/purchase
- [ ] Movement ledger live with indexes and tests
- [ ] Reorder/min-stock enabled
- [ ] Transfer workflow live
- [ ] Spend/usage reports reconciled
- [ ] Audit + observability dashboards active
- [ ] Pilot rollout completed and signed off
