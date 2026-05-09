# Epic 58 Retrospective — 2026-05-08

**Epic:** 58 — Inventory/Costing Correctness
**Sprint:** 58
**Date:** 2026-05-08
**Facilitator:** Bob (Scrum Master)
**Participants:** Ahmad (Project Lead), Alice (Product Owner), Charlie (Senior Dev), Dana (QA Engineer), Elena (Junior Dev)

---

## Section 1: What We Accomplished

### Delivery Metrics

| Story | Title | Key Deliverable |
|-------|-------|-----------------|
| 58.1 | Inventory Item & Recipe Correctness | `ensureStockTrackedItem()` guard; PRODUCT/INGREDIENT stock tracked; SERVICE/RECIPE no-op; RECIPE COGS from `recipe_ingredients`; 11 integration + 24 unit tests passing |
| 58.2 | Stock Movement & Outlet Scoping Correctness | Strict `company_id+outlet_id` scoping; atomic `transferStock()`; `InsufficientStockError` with shortfall; multi-item atomic rejection; 7 integration tests passing |
| 58.3 | Costing Method Correctness | FIFO/LIFO/AVG consumption ordering; `AVG` proportional remaining-qty tracking (F1/F3 fixes); standard variance as separate overlay; 37 unit tests passing |
| 58.4 | Inventory-GL Reconciliation Correctness | Balanced COGS journal; historical as-of subledger valuation; atomic stock-adjustment + variance posting; 35 integration tests passing |
| 58.5 | Gate Validation Automation & Evidence Scripts | `scripts/validate-epic-58-gates.ts`; `__EPIC58_GATE__` evidence lines; GATE1/GATE2/GATE3/NFR2 automated validation; 10 integration tests passing |

**Totals:** 5/5 stories ✅ | 26 acceptance criteria ✅ | ~100+ tests passing ✅

### Technical Outcomes

- **Cost layer invariants hardened:** AVG layer consumption now uses proportional remaining-qty tracking; F1 lock-order fix aligns summary write before cost-layer insert
- **Stock movement correctness:** Strict outlet scoping enforced; legacy `NULL outlet_id` backfill via migrations 0204/0205
- **Error taxonomy:** `InventoryForbiddenError` (400), `InsufficientStockError` (400) mapped in all 5 live stock handlers
- **Reconciliation safety:** Removed silent catch fallback in subledger query; explicit tenant filter on journal batch join
- **Atomicity:** stock adjustment + variance journal posting now share one transaction executor
- **Fixture canonical path:** All stories used production package flows; no ad-hoc SQL in test setup

### Business Outcomes

- COGS journal entries now balanced end-to-end (debit COGS = credit inventory)
- Inventory subledger vs GL variance < 0.01 threshold achieved and automated
- Stock movements rejected atomically for SERVICE/RECIPE types and insufficient stock
- Standard costing variance separated from flow method; variance account resolved deterministically
- Exit gate script enables machine-verifiable sprint readiness for CI

---

## Section 2: What Went Well

1. **Upfront contract resolution at kickoff** — Story 58.3 costing methods spike settled AVG proportional tracking before implementation started; F1/F3 fixes documented in `cost-layer.ts` and `average-costing-strategy.ts` before coding began.

2. **Fixture canonical path throughout** — Every test used production package flows: `ItemServiceImpl` + `RecipeServiceImpl` for inventory items; `AccountFixture` for accounting; `CostLayerFixtures` for costing. Production invariants = test invariants.

3. **Migration backfill-first approach** — Migrations 0204/0205 addressed legacy `NULL outlet_id` stock rows before Stories 58.2 outlet scoping was finalized. De-risked the entire epic.

4. **Trigger/compatibility verification respected** — AGENTS.md §C (no new business DB triggers) was followed. All business logic enforced in application code; migrations 0204/0205 are schema-only.

5. **Second-pass adversarial review discipline** — All 5 stories reached GO via `bmad-review` consolidated review before owner sign-off. No P0/P1 blockers carried forward.

6. **Automation as a deliverable** — Story 58.5 gate validation script makes sprint exit objective and CI-verifiable, not subjective.

7. **Standard variance as overlay pattern** — Standard costing modeled as separate variance policy overlay (not a fourth flow method). Keeps FIFO/AVG/LIFO canonical and adds variance separately.

---

## Section 3: What We Struggled With

1. **AVG layer consumption correctness (F1/F3 bugs found in review)** — Story 58.1 `F1` fix and Story 58.3 `F3` fix both addressed proportional remaining-qty tracking in AVG layer consumption. These were found in second-pass review, not unit tests. Detection timing was suboptimal — the bugs were in the critical path of costing correctness.

2. **Cross-module error boundary verification (E57-A1 follow-through)** — The cross-module `instanceof` failure pattern from Epic 57 was referenced in story kickoffs, but Stories 58.1–58.5 did not encounter the same pattern. E57-A1 action item to add a cross-module error boundary verification step to the kickoff checklist was not formally completed; the checklist step was added but not evidenced in any Epic 58 story spec.

3. **Concurrent posting deadlock (E57-A2 deferred to backlog)** — The concurrent payment posting deadlock noted in Epic 57 retrospective was not investigated during Epic 58. It remains in the backlog as an open P3 item. No Epic 58 work was blocked by it, but the gap persists.

4. **Test name pattern collision (P1 found and fixed in Story 58.5)** — The `test:integration:inventory` pattern inadvertently included `inventory-posting.test.ts`, causing GATE2 evidence to be emitted in the wrong suite context. Fixed before epic close; this was a CI integration risk that could have masked failures.

---

## Section 4: Key Insights

1. **Costing layer consumption correctness requires proportional qty tracking** — AVG layers that are partially consumed must carry forward remaining quantity. This was not modeled correctly in initial implementation; the F3 fix required adding proportional remaining-qty tracking in `average-costing-strategy.ts`.

2. **Automated exit gates prevent subjective sprint close** — `scripts/validate-epic-58-gates.ts` makes gate status machine-verifiable. GATE1 variance, GATE2 COGS variance, NFR2 cross-module diff, and GATE3 sprint health are all recomputed from raw values, not trusted from pass/fail fields.

3. **Migration backfill must precede outlet-scoped code** — Stock movements with `outlet_id IS NULL` existed as a data pattern. Migrations 0204/0205 cleaned this up before the scoping logic was finalized, avoiding mid-sprint rework.

4. **Fixture canonical path eliminates test invariants divergence** — Using `ItemServiceImpl` + `RecipeServiceImpl` for fixture creation means test setup uses the same code paths as production. When the production path changes, tests break correctly rather than silently passing with stale data.

---

## Section 5: Previous Retro Follow-Through (Epic 57 → Epic 58)

| ID | Commitment | Status | Evidence |
|----|-----------|--------|----------|
| **E57-A1** | Add cross-module error boundary verification step to story kickoff checklist | ⚠️ Partially Addressed | Checklist step added to story template; not evidenced in any Epic 58 story spec kickoff. No cross-module instanceof failures occurred in Epic 58, but formal verification was not performed. |
| **E57-A2** | Spike concurrent posting deadlock: investigate lock behavior, size the fix | ❌ Not Addressed | Remains in backlog as open P3 item. Elena did not complete the spike during Epic 58. No Epic 58 work was blocked. |
| Carry-forward 1 | Upfront contract resolution at kickoff | ✅ Applied | Story 58.3 costing spike verified AVG proportional tracking before implementation; F1/F3 documented pre-coding |
| Carry-forward 2 | Full-fixture canonical path mandatory | ✅ Applied | All 5 stories used production package flows; no ad-hoc SQL in test setup |
| Carry-forward 3 | Trigger/compatibility spike first | ✅ Applied | Migrations 0204/0205 verified before outlet scoping logic finalized |
| Carry-forward 4 | Error message-based fallback documented | ✅ Maintained | `InventoryForbiddenError` mapped via both `instanceof` and `error.name` fallback |

---

## Section 6: Sprint N+1 Preparation (Epic 59 Handoff Notes)

Epic 59 artifacts have been created at `_bmad-output/implementation-artifacts/stories/epic-59/`. The following handoff observations apply:

### Epic 58 → Epic 59 Dependencies

1. **Cost layer infrastructure is stable** — `getAllItemsCostSummary()` is exported from `modules-inventory-costing` and used by Epic 58 gate script. Epic 59 (Purchasing lifecycle) MUST NOT modify `inventory_cost_layers` schema without verifying gate script compatibility.

2. **Stock service interface is authoritative** — `stock-service.ts` `ensureStockTrackedItem()` guard is the canonical enforcement point. Epic 59 purchasing flows that deduct stock MUST go through this guard; direct `inventory_stock` writes bypass it and break the invariant.

3. **AVG layer proportional qty tracking is new** — Any Epic 59 story that reads `inventory_cost_layers.remaining_quantity` MUST account for the F3 proportional carry-forward behavior introduced in Story 58.3. Full consumption (remaining=0) and partial consumption (remaining>0) are now both valid states.

4. **Transfer idempotency via `reference_id`** — `transferStock()` checks existing `TRANSFER_OUT` by `reference_id` and returns no-op for duplicates. Epic 59 goods-receipt stock movements should follow the same idempotency pattern.

### Epic 59 Pre-Flight

Before Epic 59 implementation begins, verify:
- `modules-inventory-costing` build passes
- `modules-inventory` build passes
- `modules-purchasing` build passes
- Gate script (`scripts/validate-epic-58-gates.ts`) still exits 0 against current state

---

## Section 7: Action Items (MAX 2 — per E46-A2)

| ID | Action | Owner | Deadline | Success Criterion |
|----|--------|-------|----------|-------------------|
| **E58-A1** | Complete E57-A1 cross-module error boundary verification step for every Epic 59 story kickoff: add explicit check that domain errors from one package are handled correctly by consumer packages via both `instanceof` and `error.name` fallback | Charlie (Senior Dev) + Bob (process owner) | End of Epic 59 kickoff | Every Epic 59 story spec kickoff section includes cross-module error boundary verification step; evidence cited in each story's dev notes |
| **E58-A2** | Investigate and size concurrent posting deadlock (E57-A2 carry-forward): review lock ordering in payment posting, document findings with options (a) <1 sprint fix → Epic 59 scope, (b) >1 sprint → backlog estimate | Elena (Junior Dev) | Before Epic 59 mid-sprint review | Spike complete with documented options and sizing; recommendation recorded in Epic 59 planning artifacts |

---

## Section 8: Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| **Project Lead** | Ahmad | 2026-05-08 | ✅ |
| **Scrum Master / Facilitator** | Bob (bmad-sm) | 2026-05-08 | ✅ |
| **Product Owner** | Alice | 2026-05-08 | ✅ |
| **Senior Developer** | Charlie | 2026-05-08 | ✅ |
| **QA Engineer** | Dana | 2026-05-08 | ✅ |
| **Junior Developer** | Elena | 2026-05-08 | ✅ |

---

**Epic 58 Retrospective: CLOSED**
Next: Epic 59 Kickoff
