# Correctness-First Architecture Blueprint (Sprint 48–61)

> Owner: Architecture Program (Correctness > Safety > Speed)
> 
> Status: Baseline v1 (approved)
> 
> Cadence: 2-week sprints

---

## 1) Program Intent

This plan maps the **entire architecture hardening program** across **Sprint 48 to Sprint 61**.

Primary outcome:

- Eliminate recurring correctness regressions in financial, ACL, tenant-scoping, and sync flows
- Enforce SOLID/DRY/KISS as a repeatable sprint gate
- Move from review-dependent quality to architecture + CI-enforced quality

Non-goals:

- Net-new feature development (except explicit emergency/regulatory exception)
- Broad unscheduled refactor outside sprint-defined scope

---

## 2) Program Governance Rules

1. **Correctness > Safety > Speed**
2. Each story must include:
   - reproducible defect/invariant target
   - failing test before fix
   - passing test + evidence after fix
3. Sprint closes only when no unresolved **P0/P1** in sprint scope
4. Any deviation from this baseline requires explicit re-baseline approval

---

## 2a) Current Execution Scope

> **In effect immediately — architecture-first scope freeze.**

| Scope | Status | Notes |
|-------|--------|-------|
| `apps/api` | ✅ Active | Primary focus; all correctness work proceeds here |
| `packages/db`, `packages/shared`, `packages/auth`, `packages/modules/*` | ✅ Active | Shared packages required for API correctness |
| `apps/backoffice` | ⏸️ Frozen | Emergency / regulatory / security fixes **only**; requires explicit approval |
| `apps/pos` | ⏸️ Frozen | Emergency / regulatory / security fixes **only**; requires explicit approval |

**Rationale:** Direct full resources at API-layer architecture correctness before resuming app-layer work.

---

## 3) Target Architecture Module/Package Structure

### 3.1 Business/Core Modules

1. `platform`
2. `identity-access`
3. `accounting-ledger`
4. `fiscal-control`
5. `sales-ar`
6. `purchasing-ap`
7. `inventory`
8. `treasury`
9. `reservations`
10. `pos-core`

### 3.2 Supporting Layers

- `projections/reporting` (read model only, never financial write authority)
- `infrastructure` (`db`, `sync-core`, sync adapters, telemetry, notifications, offline-store)
- `apps` (`api`, `backoffice`, `pos`) as adapter/composition layers

### 3.3 Ownership Principle

- Domain rules live in modules
- Shared contracts/types in shared/contracts layer
- Apps orchestrate and adapt transport/UI only

---

## 4) Mandatory Sprint Loop (Repeat Every Sprint: 48–61)

### Loop Step A — Kickoff Gate

- Score SOLID/DRY/KISS as `Unknown/Pass/Fail`
- Convert all `Fail` to tracked sprint tasks with severity and owner

### Loop Step B — Mid-Sprint Checkpoint

- Re-score checklist
- Escalate unresolved P1 risks
- Freeze scope creep

### Loop Step C — Pre-Close Quality Gate

- Final score with evidence links (tests/logs/review)
- Adversarial review gate: **NO-GO** if unresolved P0/P1 remains

### Loop Step D — Retrospective Carry-Over

- Maximum 2 action items
- Each item must have: owner, deadline, measurable success criterion
- Unfinished items enter next sprint backlog as explicit work, not notes

---

## 5) SOLID/DRY/KISS Checklist (Use Per Sprint)

> Apply this checklist in kickoff, midpoint, and pre-close for every sprint (48–61).

### SOLID Principles Checklist Per Sprint

#### Single Responsibility Principle (SRP)
- [ ] Each module/class has one reason to change
- [ ] No module mixes infrastructure, domain logic, and presentation
- [ ] In Jurnapod: modules/* should own domain logic; packages/* handle shared infrastructure

#### Open/Closed Principle (OCP)
- [ ] Modules are open for extension, closed for modification
- [ ] New features via composition/inheritance, not by editing tested code
- [ ] In Jurnapod: adding a new accounting journal type shouldn't require editing core modules-accounting journal posting logic

#### Liskov Substitution Principle (LSP)
- [ ] Subtypes are substitutable for their base types without breaking behavior
- [ ] In Jurnapod: POS offline transactions must behave consistently with online ones when synced

#### Interface Segregation Principle (ISP)
- [ ] Clients don't depend on methods they don't use
- [ ] In Jurnapod: the sync contracts (outbox, reservation schemas) should have lean, focused interfaces

#### Dependency Inversion Principle (DIP)
- [ ] High-level modules don't depend on low-level modules; both depend on abstractions
- [ ] In Jurnapod: modules-sales depends on abstract modules-accounting journal interface, not concrete GL implementation

### DRY Principles Checklist Per Sprint
- [ ] No duplicated business logic — if the same calculation/validation exists in two places, extract to shared package (packages/shared)
- [ ] No duplicated schema definitions — Zod/TypeScript contracts live in packages/shared, consumed by all apps
- [ ] No duplicated SQL — repeated query patterns become repository helpers in packages/db
- [ ] No duplicated ACL logic — requireAccess() patterns centralized, not copy-pasted across route handlers
- [ ] No duplicated test fixtures — canonical fixtures in packages/db/test-fixtures.ts or packages/shared/test/fixtures.ts

### KISS Principles Checklist Per Sprint
- [ ] No over-engineering — simple feature flags over elaborate abstraction layers for speculative future needs
- [ ] Readable over clever — avoid clever one-liners; explicit is better than implicit
- [ ] Small interfaces — if an interface has >7 methods, consider splitting
- [ ] Flat over nested — deep inheritance hierarchies are a code smell in favor of composition
- [ ] Decisions deferred — don't bake in complex configurability until you have concrete use cases

---

## 6) Full Sprint Map (48–61)

| Sprint | Primary Focus | Target Modules | Required Output | Exit Gate |
|--------|----------------|----------------|-----------------|-----------|
| 48 | Baseline architecture truth map | all | module charters + risk register | architecture baseline approved |
| 49 | Test determinism + CI reliability | all | stable critical test baseline | 3 consecutive green reruns |
| 50 | Ledger correctness hardening | accounting-ledger | posting/immutability proof set | no unresolved P0/P1 in ledger scope |
| 51 | Fiscal correctness hardening | fiscal-control | close/override concurrency proof | deterministic close behavior under race tests |
| 52 | AP lifecycle correctness | purchasing-ap | AP write-path correctness evidence | no unresolved P0/P1 in AP write flows |
| 53 | AP reconciliation/snapshot correctness | purchasing-ap | recon + snapshot audit consistency | recon/snapshot critical suites green |
| 54 | AR + treasury correctness | sales-ar, treasury | handoff and posting consistency | no unresolved P0/P1 in AR/treasury |
| 55 | Inventory/costing correctness | inventory, inventory-costing | valuation consistency report | no material mismatch in costing tests |
| 56 | POS core correctness consolidation | pos-core | offline/idempotency replay proofs | zero duplicate financial effect on replay tests |
| 57 | Tenant + ACL correctness hardening | platform, identity-access | ACL matrix verification evidence | false-allow/false-deny P1 = 0 |
| 58 | Sync contract correctness hardening | sync-core + adapters | canonical cursor/version proof | no contract drift, no duplicate sync effect |
| 59 | Projection correctness hardening | reporting/projections | report-to-source reconciliation proof | projection trustworthiness gate pass |
| 60 | Boundary enforcement in CI | all | dependency rule + CI enforcement | boundary violations blocked by CI |
| 61 | DRY/KISS consolidation + final audit | all | consolidation report + final gate results | program-level no unresolved P0/P1 |

---

## 7) Per-Sprint Scoring Sheet Template

Copy this section for each sprint closeout note.

```md
### Sprint XX — SOLID/DRY/KISS Gate

#### SOLID
- SRP: Pass/Fail — Evidence:
- OCP: Pass/Fail — Evidence:
- LSP: Pass/Fail — Evidence:
- ISP: Pass/Fail — Evidence:
- DIP: Pass/Fail — Evidence:

#### DRY
- Business logic dedup: Pass/Fail — Evidence:
- Schema dedup: Pass/Fail — Evidence:
- SQL dedup: Pass/Fail — Evidence:
- ACL dedup: Pass/Fail — Evidence:
- Fixture dedup: Pass/Fail — Evidence:

#### KISS
- No over-engineering: Pass/Fail — Evidence:
- Readable over clever: Pass/Fail — Evidence:
- Small interfaces: Pass/Fail — Evidence:
- Flat over nested: Pass/Fail — Evidence:
- Deferred complexity: Pass/Fail — Evidence:

#### Risk Gate
- Unresolved P0 count:
- Unresolved P1 count:
- Verdict: GO / NO-GO
```

---

## 8) Program Closure Criteria (End of Sprint 61)

Program is considered complete only when all are true:

1. No unresolved P0/P1 in scoped architecture program backlog
2. Critical correctness suites remain stable across repeated runs
3. CI enforces boundary + quality policies (not manual-only)
4. SOLID/DRY/KISS checklists show sustained pass trend with evidence
5. Final adversarial review verdict is GO

---

## 9) Operating Note

This document is the fixed sprint map for S48–S61.
Changes must be made through explicit re-baseline approval (scope, risk, and schedule impact recorded).
