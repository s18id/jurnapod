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

### Fixture Extraction Governance (Q49-001) — Superseded by Owner-Package Model

> **⚠️ Historical note:** The Q49-001 framing (Sprint 49) assumed domain fixtures would be extracted to `@jurnapod/db/test-fixtures`. This assumption has been superseded by the owner-package model adopted in this blueprint. The execution-pass-1 plan and Q49-001 tracking artifacts remain as historical evidence of what was executed; the principles below reflect the current model.

Q49-001 (Canonical fixture extraction) MUST be treated as an integral part of Sprint 49 execution only as a historical record. The current correct model is:

1. **`@jurnapod/db/test-fixtures`** MUST contain **DB-generic primitives and assertions only** — constants, enums, typed helper interfaces, and assertion utilities that carry no domain semantics.
2. **Domain fixtures** (company, outlet, user, supplier, fiscal-year, AP settings, etc.) MUST live in their **owner packages** (`packages/modules-accounting`, `packages/modules-platform`, `packages/modules-purchasing`, etc.).
3. **`apps/api/src/lib/test-fixtures.ts`** is a **transitional re-export layer only** — it delegates to owner packages for existing consumers during migration. It MUST NOT contain new domain-invariant logic.

Rules:
1. Fixture extraction scope MUST be tracked against owner packages; `@jurnapod/db/test-fixtures` MUST NOT be the canonical home for domain fixtures.
2. No new domain-invariant logic MUST be introduced into `apps/api/src/lib/test-fixtures.ts` during the extraction window.
3. Package fixture build (`npm run build -w @jurnapod/{owner-package}`) MUST pass before consumer flip.
4. Fixture extraction scope MUST be tracked in `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md` (Queue A, Q49-001) and MUST be executed per `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md`.

### Architecture Cleanup Policy (MANDATORY)
**A) Cleanup mandatory when touching sprint scope.**
Any code change that falls within active sprint scope MUST include a cleanup pass for:
- Resolved TODO/FIXME comments in the modified area
- Outdated comments or dead code paths made unreachable by the change
- Misplaced files discovered during the change
Cleanup is not optional. Unchecked cleanup debt is a sprint-trackable P1/P2 item.

**B) Fixture flow mode policy.**
- **Full Fixture Mode (default):** Fixture setup MUST use canonical production package flow so production invariants and test invariants remain identical.
- **Partial Fixture Mode (global exception):** Fixture setup MAY use decomposed domain parts only when those parts are provided by the same production package that owns the domain invariant. Partial mode MUST be explicitly declared with scope, rationale, and owner.
- Fixture setup MUST NOT introduce a parallel business-write path.

> **Q49-001 Historical Alignment Note:** Q49-001 Pass 1 (Sprint 49) extracted AP exception constants to `@jurnapod/db/test-fixtures`. This was a minimal safe-scope execution under the superseded DB-first model. The correct current model is that domain fixtures belong to their owner packages; the Q49-001 artifacts remain as historical evidence only.

**C) No new business DB triggers.**
All business invariants MUST be enforced in application code where they are testable, reviewable, and version-controllable. Existing triggers MUST NOT be extended with new business logic.

**D) Reserved.**
Section D is reserved for future global policy additions.

**E) Agent-safe documentation language.**
All documentation, policy statements, and specifications MUST use RFC-style keywords: `MUST`, `MUST NOT`, `SHOULD`, `MAY`. Terms such as "should", "might", "could", "consider", "recommend", or "prefer" are forbidden in policy statements — they create ambiguity for agents executing against these documents. Where nuance is required, it MUST be expressed as an explicit conditional with a concrete example.

### Story Done Authority (MANDATORY)
The implementing developer MUST NOT mark their own story done. Done requires:
- Reviewer GO (code review approval with no blockers)
- Story owner explicit sign-off

No story may be marked DONE based solely on self-attestation of the implementing developer.

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
- [ ] No duplicated test fixtures — canonical fixtures in owner packages (`packages/modules-accounting`, `packages/modules-platform`, `packages/modules-purchasing`, etc.) with DB-generic primitives in `@jurnapod/db/test-fixtures`; `apps/api/src/lib/test-fixtures.ts` is a transitional re-export, not a canonical source
- [ ] Fixture ownership enforced — domain fixtures in owner packages (`packages/modules-*`), DB-generic primitives in `@jurnapod/db/test-fixtures`, and no domain-invariant logic in `apps/api/src/lib/test-fixtures.ts`

### KISS Principles Checklist Per Sprint
- [ ] No over-engineering — simple feature flags over elaborate abstraction layers for speculative future needs
- [ ] Readable over clever — avoid clever one-liners; explicit is better than implicit
- [ ] Small interfaces — if an interface has >7 methods, consider splitting
- [ ] Flat over nested — deep inheritance hierarchies are a code smell in favor of composition
- [ ] Decisions deferred — don't bake in complex configurability until you have concrete use cases

---

## 6) Full Sprint Map (48–61)

> **Revision note (2026-05-28):** Sprints 52–53 were consumed by emergency drift-prevention epics (Epic 52: Datetime Standardization + Idempotency Hardening; Epic 53: Datetime API Consolidation Execution). The original S52–S61 content shifts to S54–S61. Items originally at S60–S61 (boundary enforcement, final consolidation) are pushed beyond the program window.

| Sprint | Epic | Primary Focus | Target Modules | Required Output | Exit Gate |
|--------|------|----------------|----------------|-----------------|-----------|
| 48 | — | Baseline architecture truth map | all | module charters + risk register | architecture baseline approved |
| 49 | — | Test determinism + CI reliability | all | stable critical test baseline | 3 consecutive green reruns |
| 50 | — | Ledger correctness hardening | accounting-ledger | posting/immutability proof set | no unresolved P0/P1 in ledger scope |
| 51 | — | Fiscal correctness hardening | fiscal-control | close/override concurrency proof | deterministic close behavior under race tests |
| 52 | 52 | **Drift prevention:** datetime standardization + idempotency hardening | all (primarily shared + api) | canonical datetime API + idempotency contract | all legacy date patterns removed, sync idempotency verified |
| 53 | 53 | **Drift prevention:** datetime API consolidation execution | all (primarily shared + modules) | namespaced toUtcIso/fromUtcIso API + deprecated wrapper removal | no deprecated datetime wrappers in use, Z$ assertions everywhere |
| 54 | 54 | AP lifecycle correctness | purchasing-ap | AP write-path correctness evidence | no unresolved P0/P1 in AP write flows |
| 55 | 55 | AP reconciliation/snapshot correctness | purchasing-ap | recon + snapshot audit consistency | recon/snapshot critical suites green |
| 56 | 56 | AR + treasury correctness | sales-ar, treasury | handoff and posting consistency | no unresolved P0/P1 in AR/treasury |
| 57 | 57 | Inventory/costing correctness | inventory, inventory-costing | valuation consistency report | no material mismatch in costing tests |
| 58 | 58 | POS core correctness consolidation | pos-core | offline/idempotency replay proofs | zero duplicate financial effect on replay tests |
| 59 | 59 | Tenant + ACL correctness hardening | platform, identity-access | ACL matrix verification evidence | false-allow/false-deny P1 = 0 |
| 60 | 60 | Sync contract correctness hardening | sync-core + adapters | canonical cursor/version proof | no contract drift, no duplicate sync effect |
| 61 | 61 | Projection correctness hardening | reporting/projections | report-to-source reconciliation proof | projection trustworthiness gate pass |

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

### Re-Baseline Record

| Date | Change | Reason | Approval |
|------|--------|--------|----------|
| 2026-05-28 | Sprints 52–53 reassigned to drift-prevention epics (Datetime Standardization + Idempotency Hardening). Original S52–S61 content shifted to S54–S61. Original S60–S61 (boundary enforcement, final DRY/KISS consolidation) deferred beyond program window. | Emergency drift prevention required 2 sprints to stabilize datetime API and idempotency contracts before continuing the AP/AR correctness pipeline. | Architecture Program baseline re-approval |
