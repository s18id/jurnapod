# Epic 31 Sprint Plan (Corrected)

## Overview

**Epic:** API Detachment Completion  
**Duration:** 3 sprints (rebaselined from 2)  
**Goal:** Complete final detachment from `apps/api/src/lib/`, enforce package boundaries, and safely remove dead `lib/modules-*` code only after adapter migration proof.

## Rebaseline Summary

Previous estimates were materially low for extraction-heavy stories. This plan uses realistic complexity-based sizing.

| Story | Previous | Corrected | Rationale |
|---|---:|---:|---|
| 31.1 Users/RBAC (1,520 LOC) | 8h | 24h | High auth/RBAC regression risk + integration surface |
| 31.2 Companies (1,128 LOC) | 6h | 18h | Provisioning constants + initialization matrix |
| 31.3 Reservations (~2,400 LOC consolidation) | 8h | 20h | Merge + duplicate removal + outlet scoping validations |
| 31.4 Thin users/companies routes | 4h | 10h | Adapter conversion + tests + auth flow checks |
| 31.5 Import/Export (~6,000 LOC) | 12h | 40h | Large extraction with parser/validator/batch coupling |
| 31.6 Notifications (~800 LOC) | 4h | 12h | Outbox/template/token cohesion + API touchpoints |
| 31.7 Thin accounts/inventory/reports routes | 6h | 14h | Large route files, mostly independent of 31.5/31.6 |
| 31.8A Adapter migration prep + boundaries | 6h (in old 31.8) | 8h | Add hard lint/CI boundaries + migration checks |
| 31.8B Deletion verification + final cleanup | (not split) | 10h | Safe delete only after references/tests are green |

**Total:** 156h (vs previous 54h)

## Corrected Dependency Graph

```
31.1 ──┐
       ├── 31.4 ──┐
31.2 ──┘          │
                  ├── 31.8A (adapter migration prep + boundaries)
31.3 ─────────────┘

31.5 ──┐
31.6 ──┤ (parallel lane)
       │
31.7 ──┘ (independent thinning lane; does NOT depend on 31.5/31.6)

31.8B (deletion verification + cleanup)
  depends on: 31.5 + 31.6 + 31.7 + 31.8A
```

### Notes on Corrections
- **31.7 dependency fixed:** no dependency on 31.5/31.6; it can run in parallel as route-thinning of accounts/inventory/reports.
- **31.8 split:** execution is now explicitly two-phase:
  - **31.8A:** adapter migration prep + import-boundary enforcement
  - **31.8B:** deletion verification + final `lib/modules-*` deletion

## Sprint Breakdown

## Sprint 1 (Core Extractions + First Route Thinning) — 72h

### Story 31.1: Extract Users/RBAC to `modules-platform`
- **Estimate:** 24h
- **Priority:** P1
- **Dependencies:** None

### Story 31.2: Extract Companies/Provisioning to `modules-platform`
- **Estimate:** 18h
- **Priority:** P1
- **Dependencies:** None (parallel with 31.1)

### Story 31.3: Consolidate Reservations duplicate logic
- **Estimate:** 20h
- **Priority:** P1
- **Dependencies:** None (can run parallel lane)

### Story 31.4: Thin `routes/users.ts` and `routes/companies.ts`
- **Estimate:** 10h
- **Priority:** P1
- **Dependencies:** 31.1 + 31.2

## Sprint 2 (Large Infra Extraction + Independent Route Thinning) — 66h

### Story 31.5: Import/Export infrastructure → `modules-platform`
- **Estimate:** 40h
- **Priority:** P1
- **Dependencies:** 31.1 + 31.2 (shared platform contracts available)

### Story 31.6: Notifications consolidation (email/mailer)
- **Estimate:** 12h
- **Priority:** P2
- **Dependencies:** None (parallel with 31.5)

### Story 31.7: Route thinning enforcement (accounts, inventory, reports)
- **Estimate:** 14h
- **Priority:** P1
- **Dependencies:** None (parallel lane; independent from 31.5/31.6)

## Sprint 3 (Safe Cleanup and Final Validation) — 18h

### Story 31.8A: Adapter migration prep + import-boundary enforcement
- **Estimate:** 8h
- **Priority:** P1
- **Dependencies:** 31.3 + 31.4 + 31.7
- **Focus:** Verify route→package adapters are complete, install hard import boundary checks in lint/CI.

### Story 31.8B: Deletion verification + dead code cleanup
- **Estimate:** 10h
- **Priority:** P1
- **Dependencies:** 31.5 + 31.6 + 31.8A
- **Focus:** Prove no runtime/test dependency on `apps/api/src/lib/modules-*`, then delete and revalidate.

---

## Import Boundary Enforcement (Mandatory)

Apply in workspace ESLint config for package code (`packages/**`):

```js
"import/no-restricted-paths": [
  "error",
  {
    "zones": [
      {
        "target": "./packages",
        "from": "./apps/api",
        "message": "packages/** must not import from apps/api/**"
      }
    ]
  }
]
```

Required CI command:

```bash
npm run lint --workspaces --if-present
```

Hard failure condition: any `packages/** -> apps/api/**` import path detected.

---

## Validation Commands

### Story 31.1 / 31.2 / 31.5
```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```

### Story 31.3
```bash
npm run typecheck -w @jurnapod/modules-reservations
npm run test -w @jurnapod/modules-reservations
npm run typecheck -w @jurnapod/api
```

### Story 31.4 / 31.7
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 31.6
```bash
npm run typecheck -w @jurnapod/notifications
npm run typecheck -w @jurnapod/api
```

### Story 31.8A / 31.8B
```bash
npm run lint --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
```
