# Story 61.5 Completion — Deferred Debt Closure (Epic 55–60 Carry-Over)

**Status:** done
**Date:** 2026-05-09

## Debt Item Audit

### D1: ACCOUNTANT treasury READ (E60, P2) — ✅ CONFIRMED RESOLVED
Migration 0207 seeded canonical `module_roles` for all companies including ACCOUNTANT role with treasury READ=1. The ACCOUNTANT role has READ (1) on treasury per the canonical role-permission matrix. No ad-hoc `setModulePermission` needed.

### D2: No void route for payments (E57, P2) — ✅ RESOLVED by Epic 61.2
Sales payment void route (`POST /sales/payments/:id/void`) was implemented in Story 61.2. The endpoint uses DELETE permission on `sales.payments`, creates reversal journal entries, and restores invoice `paid_total`. 4 AC4 tests pass confirming the feature exists and works.

### D3: Multi-currency AP reconciliation edge case (E54 F5, P2) — 📋 TRACKED
The Epic 54 F5 item concerns multi-currency AP reconciliation edge cases where exchange rate fluctuations between invoice date and payment date cause reconciliation variances. The current AP reconciliation infrastructure (Epic 55) handles multi-currency through FX gain/loss posting at settlement time (AP payment posting). 
- **Owner:** Architecture (Winston)
- **Deadline:** Epic 62 planning
- **Success criterion:** At least 1 integration test covering FX variance in AP reconciliation

### D4: Snapshot race condition follow-up (E55 F1, P2) — ✅ CONFIRMED RESOLVED
E51-A1 (auto-snapshot race fix) and E55-A1 (CI lint gate) action items were already closed. The snapshot mechanism uses idempotency keys and `FOR UPDATE` locks to prevent race conditions. Confirmed closed.

### D5: Out-of-order push reconciliation (E59 59.8c descoped, P2) — 📋 TRACKED
POS out-of-order push reconciliation was descoped from Epic 59. The current architecture handles in-order pushes via `since_version` cursor. Out-of-order scenarios (packet loss, reordering) may cause gaps in sequence.
- **Owner:** POS team
- **Deadline:** Epic 62 planning (S61 exit gate review)
- **Success criterion:** Document out-of-order strategy or implement gap-fill mechanism

## Files Modified
None — documentation/story completion only.

## Validation
- All 5 debt items audited
- 2 resolved (D1, D2, D4)
- 2 tracked with owner + deadline (D3, D5)
