# Epic 23: API Detachment

**Status:** 🟠 In Progress (Sprint 1)  
**Date:** 2026-04-02  
**Stories:** 25 total, 0/25 complete (Sprint 1: 0/8 started)  
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-23-sprint-plan.md`

---

## Executive Summary

Epic 23 detaches reusable business/domain logic from `apps/api/src` into workspace packages under `packages/`, while keeping API routes as thin HTTP adapters. This improves code modularity, enables package reuse across apps (POS, Backoffice), and establishes clear dependency boundaries to prevent circular imports.

**Key Goals:**
- Extract 4 new domain packages: modules-sales, modules-inventory, modules-reservations, modules-reporting
- Move foundation code (telemetry, notifications, platform settings) to existing packages
- Thin API routes to HTTP adapter layer only
- Enforce package boundary policy via lint rules

---

## Goals & Non-Goals

### Goals
- Create @jurnapod/modules-sales, @jurnapod/modules-inventory, @jurnapod/modules-reservations, @jurnapod/modules-reporting
- Extract posting/reconciliation logic to @jurnapod/modules-accounting
- Move telemetry, notifications, platform settings, audit to existing packages
- Thin sync push/pull routes to adapter-only
- Enforce no packages importing from apps/api

### Non-Goals
- Not rewriting business logic - moving existing logic to packages
- Not changing sync protocol or database schema
- Not modifying POS or Backoffice apps (they consume packages)

---

## Success Criteria

- [ ] All 25 stories completed
- [ ] Workspace typecheck/build passes
- [ ] API critical test suites pass (auth, sync, posting)
- [ ] No packages importing from apps/api (enforced by lint)
- [ ] API routes are thin adapters (HTTP validation/auth/response only)
- [ ] New domain packages have public API contracts documented

---

## Phases Overview

| Phase | Name | Stories | Hours | Focus |
|-------|------|---------|-------|-------|
| 0 | Pre-flight | ADB-0.1 to ADB-0.4 | 10h | ADR, lint rules, package scaffolds |
| 1 | Foundation | ADB-1.1 to ADB-1.4 | 14h | Telemetry, notifications, platform settings, audit |
| 2 | Accounting | ADB-2.1 to ADB-2.3 | 10h | Posting engines, reconciliation, thin adapters |
| 3 | Domain | ADB-3.1 to ADB-3.11 | 32h | Sales, inventory, reservations, reporting |
| 4 | Sync | ADB-4.1 to ADB-4.3 | 10h | Route thinning |
| 5 | Cleanup | ADB-5.1 to ADB-5.3 | 10h | Finalization |

**Total: 25 stories, 84 hours**

---

## Story List

### Phase 0: Pre-flight
| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| ADB-0.1 | Author package dependency policy ADR | P1 | 2h |
| ADB-0.2 | Add import-boundary lint constraints | P1 | 3h |
| ADB-0.3 | Scaffold new domain package workspaces | P2 | 3h |
| ADB-0.4 | Create extraction checklist template | P2 | 2h |

### Phase 1: Foundation
| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| ADB-1.1 | Move correlation primitives to @jurnapod/telemetry | P1 | 3h |
| ADB-1.2 | Extract email templates to @jurnapod/notifications | P1 | 4h |
| ADB-1.3 | Move feature flags/settings to @jurnapod/modules-platform | P2 | 4h |
| ADB-1.4 | Consolidate audit utilities into @jurnapod/modules-platform | P2 | 3h |

### Phase 2: Accounting
| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| ADB-2.1 | Move posting engines to @jurnapod/modules-accounting | P1 | 4h |
| ADB-2.2 | Move reconciliation service to accounting package | P1 | 3h |
| ADB-2.3 | Thin API accounting adapters to composition-only | P2 | 3h |

### Phase 3: Domain
| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| ADB-3.1 | modules-sales bootstrap + ACL interface seam | P1 | 3h |
| ADB-3.2 | Extract orders/invoices to modules-sales | P1 | 4h |
| ADB-3.3 | Extract payments/credit-notes to modules-sales | P2 | 4h |
| ADB-3.4 | modules-inventory bootstrap + scoping guards | P1 | 3h |
| ADB-3.5 | Extract item catalog services | P1 | 4h |
| ADB-3.6 | Extract stock/recipe/supplies | P2 | 4h |
| ADB-3.7 | modules-reservations bootstrap with time model | P1 | 3h |
| ADB-3.8 | Extract reservations/table services | P1 | 4h |
| ADB-3.9 | Extract service-session + table-sync | P2 | 3h |
| ADB-3.10 | modules-reporting bootstrap | P1 | 3h |
| ADB-3.11 | Extract report query/services | P1 | 4h |

### Phase 4: Sync
| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| ADB-4.1 | Extract sync push business logic | P1 | 4h |
| ADB-4.2 | Extract sync pull business logic | P1 | 4h |
| ADB-4.3 | Add route-thinness enforcement | P2 | 2h |

### Phase 5: Cleanup
| Story | Title | Priority | Estimate |
|-------|-------|----------|----------|
| ADB-5.1 | Remove deprecated API lib implementations | P1 | 3h |
| ADB-5.2 | Freeze package public APIs | P1 | 3h |
| ADB-5.3 | Run full workspace validation gate | P1 | 4h |

---

## Critical Path

```
ADB-0.1 (ADR) 
    ↓
ADB-0.2 (Lint) → ADB-0.3 (Scaffolds) → ADB-0.4 (Checklist)
    ↓
Phase 1 (Foundation) - ADB-1.1 → 1.2 → 1.3 → 1.4
    ↓
Phase 2 (Accounting) - ADB-2.1 → 2.2 → 2.3
    ↓
Phase 3 (Domain - parallel tracks after bootstraps):
  Sales: 3.1 → 3.2 → 3.3
  Inventory: 3.4 → 3.5 → 3.6
  Reservations: 3.7 → 3.8 → 3.9
  Reporting: 3.10 → 3.11
    ↓
Phase 4 (Sync) - ADB-4.1 → 4.2 → 4.3
    ↓
Phase 5 (Cleanup) - ADB-5.1 → 5.2 → 5.3
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Financial regression during posting extraction | P1 | Move accounting first, keep integration tests for journal balancing |
| Sync idempotency drift | P1 | Keep client_tx_id contract tests as migration gate |
| Hidden circular dependencies | P1 | Enforce package boundary linting before extraction |
| Tenant scoping regressions | P1 | Mandatory test assertions for company_id/outlet_id |
| Package sprawl / ownership ambiguity | P2 | Start with 4 domain packages, avoid micro-packages |
| Incomplete route thinning | P2 | PR checklist enforces route files have no DB writes |

---

## Linked Artifacts

- [Package Boundary Policy ADR](../../docs/adr/adr-0014-package-boundary-policy.md)
- [Domain Packages Tech Spec](../../docs/tech-specs/api-detachment-domain-packages.md)
- [Sprint Backlog](../../_bmad-output/planning-artifacts/api-detachment-sprint-backlog.md)
- [Detachment Plan](../../_bmad-output/planning-artifacts/api-detachment-plan.md)

---

## Technical Notes

### Package Dependency Rules (from ADR)
- packages/** must never import apps/**
- modules-accounting must not import modules-sales
- Domain packages use injected ACL interface, not route-layer imports
- pos-sync may depend on domain modules, not inverse

### Sync Protocol Invariants (must preserve)
- since_version (pull request cursor)
- data_version (pull response cursor)
- sync_versions table (single source of truth)

### Canonical Reservation Time (from tech spec)
- reservation_start_ts and reservation_end_ts in BIGINT (unix ms)
- Overlap rule: a_start < b_end AND b_start < a_end
- Timezone resolution: outlet → company (no UTC fallback)
