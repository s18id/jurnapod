# Epic 23 Sprint Plan: API Detachment

## Sprint Overview
- **Epic:** Epic 23: API Detachment
- **Total Stories:** 25
- **Total Estimate:** 84 hours
- **Sprint Cadence:** 2 weeks / 40h capacity
- **Total Sprints:** 3

## Sprint 1: Pre-flight + Foundation (40h)
**Goal:** Establish architectural guardrails, scaffold packages, extract foundation concerns

### Stories
1. ADB-0.1 (P1, 2h) - Author package dependency policy ADR
2. ADB-0.2 (P1, 3h) - Add import-boundary lint constraints  
3. ADB-0.3 (P2, 3h) - Scaffold new domain package workspaces
4. ADB-0.4 (P2, 2h) - Create extraction checklist template
5. ADB-1.1 (P1, 3h) - Move correlation primitives to @jurnapod/telemetry
6. ADB-1.2 (P1, 4h) - Extract email templates to @jurnapod/notifications
7. ADB-1.3 (P2, 4h) - Move feature flags/settings to @jurnapod/modules-platform
8. ADB-1.4 (P2, 3h) - Consolidate audit utilities into @jurnapod/modules-platform

**Capacity Check:** 22h assigned, 18h buffer
**Key Dependencies:** ADB-0.1 → ADB-0.2 → ADB-0.3/ADB-0.4 → ADB-1.1 → ADB-1.2 → ADB-1.3/ADB-1.4
**Sprint Goal:** Foundation extraction complete; all lint rules active; 4 new package scaffolds ready

## Sprint 2: Accounting + Domain Bootstraps (40h)
**Goal:** Extract posting/reconciliation to accounting; bootstrap all 4 domain packages

### Stories
1. ADB-2.1 (P1, 4h) - Move posting engines to @jurnapod/modules-accounting ⚠️ FINANCIAL
2. ADB-2.2 (P1, 3h) - Move reconciliation service to accounting package
3. ADB-2.3 (P2, 3h) - Thin API accounting adapters to composition-only
4. ADB-3.1 (P1, 3h) - modules-sales bootstrap + ACL interface seam
5. ADB-3.4 (P1, 3h) - modules-inventory bootstrap + scoping guards
6. ADB-3.7 (P1, 3h) - modules-reservations bootstrap with time model
7. ADB-3.10 (P1, 3h) - modules-reporting bootstrap

**Capacity Check:** 22h assigned, 18h buffer
**Key Dependencies:** ADB-1.4 → ADB-2.1 → ADB-2.2 → ADB-2.3 → ADB-3.1/3.4/3.7/3.10 (parallel)
**Sprint Goal:** Accounting extraction done; all 4 domain packages bootstrapped with ACL seams
**Critical:** ADB-2.1 requires running `npm run test:unit:critical -w @jurnapod/api` before/after

## Sprint 3: Domain Extraction + Sync + Cleanup (40h)
**Goal:** Extract all domain logic; thin sync routes; cleanup deprecated code

### Stories
1. ADB-3.2 (P1, 4h) - Extract orders/invoices to modules-sales
2. ADB-3.3 (P2, 4h) - Extract payments/credit-notes to modules-sales
3. ADB-3.5 (P1, 4h) - Extract item catalog services
4. ADB-3.6 (P2, 4h) - Extract stock/recipe/supplies
5. ADB-3.8 (P1, 4h) - Extract reservations/table services
6. ADB-3.9 (P2, 3h) - Extract service-session + table-sync
7. ADB-3.11 (P1, 4h) - Extract report query/services
8. ADB-4.1 (P1, 4h) - Extract sync push business logic ⚠️ SYNC CRITICAL
9. ADB-4.2 (P1, 4h) - Extract sync pull business logic ⚠️ SYNC CRITICAL
10. ADB-4.3 (P2, 2h) - Add route-thinness enforcement
11. ADB-5.1 (P1, 3h) - Remove deprecated API lib implementations
12. ADB-5.2 (P1, 3h) - Freeze package public APIs
13. ADB-5.3 (P1, 4h) - Run full workspace validation gate

**Capacity Check:** 47h assigned — this exceeds 40h, requires prioritization
**Fallback Priority Order if overloaded:**
1. (P1) ADB-5.3 - Final validation gate MUST happen
2. (P1) ADB-4.1, ADB-4.2 - Sync correctness critical  
3. (P1) ADB-3.2, ADB-3.5, ADB-3.8, ADB-3.11 - Core domain extractions
4. (P1) ADB-5.1, ADB-5.2 - Cleanup
5. (P2) ADB-3.3, ADB-3.6, ADB-3.9, ADB-4.3 - Can defer to follow-up epic if needed

**Key Dependencies:** ADB-3.1 → ADB-3.2/3.5/3.8/3.11 (parallel tracks); All Domain → ADB-4.1 → 4.2 → 4.3; All Phases → ADB-5.1 → 5.2 → 5.3
**Sprint Goal:** All domain logic extracted to packages; sync routes are thin adapters; workspace validates clean

## Validation Gates (All Sprints)

### Per-Sprint Commands
```bash
npm run typecheck -ws --if-present
npm run build -ws --if-present  
npm run lint -ws --if-present
npm run test:unit:critical -w @jurnapod/api
```

### Sprint-Specific Commands
- **Sprint 1:** `npm run test:unit:single -w @jurnapod/api src/middleware/telemetry.test.ts`
- **Sprint 2:** `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts` (before/after ADB-2.1)
- **Sprint 3:** `npm run test:unit:sync -w @jurnapod/api`

## Risk Mitigation

| Risk | Severity | Sprint | Mitigation |
|------|----------|--------|------------|
| Financial regression during posting extraction | P1 | Sprint 2 | ADB-2.1 has 4h estimate; run critical tests before/after |
| Sync idempotency drift | P1 | Sprint 3 | ADB-4.1/4.2 are P1 with explicit idempotency validation |
| Hidden circular dependencies | P1 | Sprint 1 | ADB-0.2 lint rules must pass before extraction begins |
| Tenant scoping regressions | P1 | All sprints | Each story AC mandates company_id/outlet_id test assertions |
| Sprint 3 overload | P2 | Sprint 3 | Fallback priority list above; P2s can defer |

## Success Criteria

- [ ] Sprint 1: ADR approved; lint rules active; 4 package scaffolds compile
- [ ] Sprint 2: Posting/reconciliation in accounting package; all 4 domains bootstrapped
- [ ] Sprint 3: All 25 stories complete OR P2s formally deferred
- [ ] Final: `npm run typecheck -ws --if-present && npm run build -ws --if-present && npm run test:unit:critical -w @jurnapod/api` all pass
- [ ] Final: No packages importing from apps/api (enforced by lint)

## Coordination Pattern for Parallel Domain Tracks (Sprint 3)

When executing the 4 parallel domain tracks (Sales, Inventory, Reservations, Reporting) in Sprint 3:
- Each track is owned by a single agent
- Use `bmad-dev-story` for each domain's extraction work
- Track cross-package import violations per PR via lint
- Do not merge any domain track until ADB-2.3 (accounting adapters thinned) is complete and verified
