# Story 44.3 Completion Notes — Invoice Header Discounts Alignment

**Story:** 44.3 — Invoice Header Discounts Alignment  
**Epic:** Epic 44 — AR Customer Management & Invoicing Completion  
**Status:** ✅ DONE  
**Completed:** 2026-04-18

---

## Acceptance Criteria Evidence

### AC1: Discount schema baseline ✅
- Discount fields confirmed in runtime/schema paths (`discount_percent`, `discount_fixed`).
- Guarded fallback approach maintained for target-env safety.

### AC2/AC3/AC4: Contract + validation + calculation order ✅
- Shared schemas accept `discount_percent` and `discount_fixed` with proper constraints.
- Invoice service enforces “discount must not exceed subtotal”.
- Invoice totals remain computed in canonical order (discount before tax).

### AC5: Integration coverage ✅
- `sales.invoices.discounts` integration scenarios pass including:
  - percent-only
  - fixed-only
  - mixed discounts
  - over-discount rejection
  - update/add/remove discount cases

---

## Validation Evidence

```bash
npm run build -w @jurnapod/shared
npm run build -w @jurnapod/modules-sales
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm test -w @jurnapod/api -- --run --testNamePattern="sales.invoices.discounts"
```

Observed in final hardening run:
- Full API suite: **142/142 test files passed**, **1038 passed**, **3 skipped**, **0 failed**.
