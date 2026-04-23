# Epic 50 — Ledger Correctness Hardening

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** backlog
> **Sprint:** 50 (2026-04-27 to 2026-05-08)
> **Theme:** Fix-found-issues + add missing integration tests
> **Primary Module:** `accounting-ledger`
> **Exit Gate:** posting/immutability proof set exists; no unresolved P0/P1 in ledger scope

---

## 0) HARD GATE — E49-A1 / E49-A2 Prerequisites (MANDATORY)

> **RFC Keywords (Agent-Safe):** Implementation of ANY Epic 50 story MUST NOT begin until ALL of the following conditions are met:

| Gate ID | Requirement | Artifact | Status |
|---------|-------------|----------|--------|
| **E49-A1** | Second-Pass Determinism Review requirements in story specs | `story-50.1.md`, `story-50.2.md`, `story-50.3.md`, `story-50.4.md` | MUST be present |
| **E49-A1** | PR template with second-pass review checklist | `.github/pull_request_template.md` | MUST be created |
| **E49-A2** | Tiered audit table in Story 50.1 with Critical → High → Medium execution order | `story-50.1.md` (E49-A2 section) | MUST be present |

**Gate enforcement language:**
- "MUST NOT begin implementation" — no ambiguity, no exceptions
- Implementors MUST verify gate artifacts are in place before starting any Epic 50 work
- Reviewers MUST reject any PR that does not include second-pass review evidence
- This gate is a P0 process requirement — not optional, not deferrable

---

## 1) Charter

### 1.1 Program Alignment

Epic 50 is Sprint 50 in the S48–S61 Correctness-First Architecture Blueprint:

| Sprint | Blueprint Focus | Epic 50 Alignment |
|--------|-----------------|-------------------|
| 49 | Test determinism + CI reliability | Q49-001 fixture extraction continues here |
| **50** | **Ledger correctness hardening** | **This epic** — posting/immutability proof set |
| 51 | Fiscal correctness hardening | Subledger gaps enter Epic 51 scope |

### 1.2 What We Know from Exploration

**Epic 48 (done):** 8 P1 risks closed, dual-DB migration pass, 252/252 × 12 runs zero flakes.

**Epic 49 (in-progress):** Stories 49.1–49.6 done. Story 49.7 `ready-for-dev`. Q49-001 fixture extraction plan documented (`epic-49-q49-001-test-fixtures-execution-pass-1.md`).

**Module exploration findings (`packages/modules/accounting`):**

| Finding | Severity | Implication |
|---------|----------|-------------|
| Zero integration tests for posting flows | P1 | Cannot prove posting correctness without tests |
| POS sync push has deliberate unbalanced-journal override | P1 | Story 50.1 resolves this |
| REFUND reversal mechanism missing | P1 | Story 50.3 surfaces it; Story 50.4 fixes it |
| Only unit tests exist for `PostingService` | P1 | Integration-level invariants untested |
| Fiscal year close has dual execution paths | P2 | Consistency review needed |
| Subledger reconciliation: only CASH implemented | P2 | Other ledgers enter Epic 51 |

### 1.3 Non-Goals

- Net-new feature development (except explicit emergency/regulatory exception)
- Refactor of `fiscal-year/service.ts` (already hardened in Epic 48, R48-001 closed)
- POS offline-first correctness (frozen app per architecture-first scope freeze)

---

## 2) Story Breakdown

### Story 50.1 — POS Sync Unbalanced Posting Override: Investigate & Resolve
**Status:** backlog  
**Owner:** @bmad-dev  
**Type:** Correctness risk resolution

Investigate `SYNC_PUSH_POSTING_FORCE_UNBALANCED` purpose, produce a recommendation (remove entirely or harden to production-safe), and apply the resolution.

**AC1:** Purpose documented (git history trace + use case confirmation)  
**AC2:** Decision with recommendation committed to one path  
**AC3:** Resolution applied (override deleted OR guard hardened to `NODE_ENV === "test"` only)  
**AC4:** Code review GO required

---

### Story 50.2 — Q49-001 Fixture Extraction (Pass 1)
**Status:** backlog  
**Owner:** @bmad-dev  
**Type:** Architecture/correctness (mandatory program requirement)

Execute Pass 1 of Q49-001 per `epic-49-q49-001-test-fixtures-execution-pass-1.md`. Move portable DB fixtures from `apps/api/src/lib/test-fixtures.ts` to `packages/db/src/test-fixtures/`. Keep API wrapper backward-compatible. Flip at least one consumer path.

**AC1:** Package fixture scaffold created (`packages/db/src/test-fixtures/*`)  
**AC2:** Portable fixture core moved (company/outlet/user/supplier/fiscal/AP settings + registry)  
**AC3:** API wrapper backward-compatible (existing tests pass without changes)  
**AC4:** Consumer flipped (`apps/api/__test__/fixtures/index.ts` imports from package)  
**AC5:** `npm run build -w @jurnapod/db` passes  
**AC6:** `npm run typecheck -w @jurnapod/api` passes  
**AC7:** Representative suites pass (fiscal-year-close, ap-reconciliation)

---

### Story 50.3 — Posting Flow Integration Tests
**Status:** backlog  
**Owner:** @bmad-dev  
**Type:** Test coverage + correctness verification

Write integration tests for all major posting flows with real database. Establish baseline that posting invariants are proven, not assumed.

**AC1:** `sales-invoice-posting.test.ts` — invoice → journal flow, balanced, correct account mappings  
**AC2:** `sales-payment-posting.test.ts` — payment posting flow, variance handling, imbalance error  
**AC3:** `void-credit-note-posting.test.ts` — reversal batch created, original batch untouched  
**AC4:** `journal-immutability.test.ts` — no UPDATE path; corrections go through reversal batches only  
**AC5:** `cogs-posting.test.ts` — COGS posting with average cost, balanced journal  
**AC6:** All suites 3× consecutive green (determinism evidence)

---

### Story 50.4 — Correctness Fixes from Testing
**Status:** backlog  
**Owner:** @bmad-dev  
**Type:** Correctness defect resolution

Fix all defects surfaced by Story 50.3. Epic cannot close until this story is done.

**AC1:** All Story 50.3 defects fixed with evidence  
**AC2:** No new P1/P2 defects introduced in fixes  
**AC3:** Post-fix 3-consecutive-green on all posting suites  
**AC4:** Risk register updated (R50-003 elevated if REFUND gap confirmed)  
**AC5:** Sprint status updated

---

## 3) Epic 50 Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| R50-001: POS sync unbalanced override leaks to production | P1 | Story 50.1 | backlog |
| R50-002: Q49-001 execution uncovers hidden API-only fixture dependencies | P1 | Story 50.2 scope freeze + wrapper | backlog |
| R50-003: REFUND reversal mechanism missing | P1 | Story 50.3 surfaces; Story 50.4 fixes | backlog |
| R50-004: Story 50.3 finds many defects, scope creep risk | P2 | Story 50.4 is carry-forward; epic gate | backlog |
| R50-005: Subledger reconciliation gaps (RECEIVABLES, PAYABLES, INVENTORY) | P2 | Enter Epic 51 scope | backlog |

---

## 4) Sprint 50 SOLID/DRY/KISS Checklist

Apply at kickoff, midpoint, and pre-close per Sprint 50 loop.

### SOLID
- [ ] SRP: PostingService has one reason to change (posting orchestration)
- [ ] OCP: Mappers are open for extension (new doc_types) without modifying PostingService
- [ ] LSP: POS offline transactions behave consistently with online ones when synced
- [ ] ISP: PostingRepository interfaces are lean and focused
- [ ] DIP: modules-sales depends on abstract posting interface, not concrete PostingService

### DRY
- [ ] Business logic dedup: balance assertion in one place only
- [ ] Schema dedup: Zod contracts in `packages/shared`, consumed by posting
- [ ] SQL dedup: repeated posting query patterns become repository helpers
- [ ] ACL dedup: `requireAccess()` centralized, not copy-pasted
- [ ] Fixture dedup: Q49-001 portable fixtures in `@jurnapod/db/test-fixtures`

### KISS
- [ ] No over-engineering: simple balance check over elaborate posting abstraction
- [ ] Readable over clever: explicit debit/credit math over clever one-liners
- [ ] Small interfaces: PostingRepository has focused methods only
- [ ] Flat over nested: posting flow is linear, not deeply nested
- [ ] Decisions deferred: no complex configurability until concrete use cases exist

---

## 5) Exit Gate Criteria

Epic 50 can be marked `done` only when:

1. Story 50.1: Override resolved, reviewer GO attached
2. Story 50.2: Q49-001 Pass 1 complete, `npm run build -w @jurnapod/db` passes, API typecheck passes
3. Story 50.3: All 5 posting integration test suites written and 3× consecutive green
4. Story 50.4: All Story 50.3 defects fixed, 3× green post-fix, risk register updated
5. No unresolved P0/P1 in Epic 50 scope
6. Sprint status validated: `npx tsx scripts/validate-sprint-status.ts --epic 50` exits 0

---

## 6) Retrospective (Max 2 Action Items)

```
## Epic 50 Retrospective — Max 2 Action Items

1. Action item:
   - Owner:
   - Deadline:
   - Success criterion:

2. Action item:
   - Owner:
   - Deadline:
   - Success criterion:
```

---

## 7) Validation Commands

```bash
# Story 50.1
rg 'SYNC_PUSH_POSTING_FORCE_UNBALANCED' --type ts -l
rg 'isTestUnbalancedPostingEnabled' --type ts -l

# Story 50.2
npm run build -w @jurnapod/db
npm run typecheck -w @jurnapod/api
npm run test:single -- "apps/api/__test__/integration/accounting/fiscal-year-close.test.ts" -w @jurnapod/api
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api

# Story 50.3
npm run test:single -- "packages/modules/accounting/__test__/integration/posting/sales-invoice-posting.test.ts" -w @jurnapod/modules-accounting
npm run test:single -- "packages/modules/accounting/__test__/integration/posting/sales-payment-posting.test.ts" -w @jurnapod/modules-accounting
npm run test:single -- "packages/modules/accounting/__test__/integration/posting/void-credit-note-posting.test.ts" -w @jurnapod/modules-accounting
npm run test:single -- "packages/modules/accounting/__test__/integration/posting/journal-immutability.test.ts" -w @jurnapod/modules-accounting
npm run test:single -- "packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts" -w @jurnapod/modules-accounting

# Story 50.4 (after defects fixed)
# All above suites must be 3× green

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 50
# Expected: exit 0 — "Sprint 50 closure gate: GO"
```
