# Epic 3 Retrospective: Master Data Domain Extraction

**Date:** 2026-03-26
**Epic:** Epic 3 — Master Data Domain Extraction
**Status:** Complete

---

## Context

Epic 3 split the monolithic `apps/api/src/lib/master-data.ts` (2,829 lines) into five focused domain modules and deleted the monolith. All six stories (3.1–3.6) were completed with 714/714 API unit tests passing at finalization.

---

## What Went Well

| Area | Detail |
|------|--------|
| **Domain boundary clarity** | Each extracted module — item-groups, items, item-prices, supplies, fixed-assets — now has a clear public interface in its `index.ts`. Callers no longer need to understand a 2,000-line monolith. |
| **Incremental caller migration** | `routes/inventory.ts`, `routes/supplies.ts`, `routes/accounts.ts`, and `lib/sync/master-data.ts` were updated one at a time. Each integration point was validated before moving to the next, eliminating big-bang deployment risk. |
| **Regression safety** | 714/714 tests passing throughout the epic. Every extraction verified existing behavior before the next story started. |
| **Sync protocol preservation** | The POS sync pull path (`lib/sync/master-data.ts`) retained its `client_tx_id` idempotency semantics and offline-first guarantees throughout the refactor. |
| **Monolith deletion** | `lib/master-data.ts` was deleted cleanly. `master-data-errors.ts` was introduced as a shared error-class module so domain modules and routes could continue importing the three canonical error types. |
| **Stakeholder communication** | No user-facing changes; backend improvements happened transparently without disrupting the product roadmap. |

---

## What Did Not Go Well

| Area | Detail |
|------|--------|
| **Helper duplication** | Each domain module reimplemented `withTransaction`, `isMysqlError`, `ensure*` validators, audit logging helpers, and error-code constants. Five modules now contain ~80% identical internal utilities. Acceptable as technical debt, but must be addressed before Epic 4. |
| **Fixed-assets route coverage gap** | Story 3.5 focused on extraction correctness. Automated route-level tests for fixed-assets CRUD endpoints are thin compared to items and item-groups coverage. Known debt accepted during the epic. |
| **Story 3.6 scope growth** | "Sync master-data finalization" was scoped as a 0.5–1 day cleanup task but uncovered edge cases in the sync protocol requiring additional validation. Expanded to nearly a full week. |
| **Database compatibility overhead** | Both MySQL 8.0 and MariaDB compatibility required `information_schema` existence checks in every DDL change. Added ~20% effort not originally estimated. |
| **Product narrative** | Pure refactoring epics are harder to communicate to stakeholders. No explicit "what this unlocks" section existed in Epic 3 planning. |

---

## Lessons Learned

1. **Extraction-first, abstraction-second is valid — but needs follow-through**  
   Prioritizing domain isolation over shared-helper abstraction was correct. However, the duplication must be paid down in a dedicated cleanup epic or P1 action before it compounds.

2. **Domain extraction should include route-level test expectations**  
   When extracting a domain, minimum automated route coverage should be an explicit acceptance criterion. Story 3.5 accepted the fixed-assets coverage gap; future extraction stories should not.

3. **Sync protocol changes need explicit validation criteria**  
   Even "finalization" tasks touching sync logic can uncover protocol edge cases. Any story modifying sync behavior needs explicit AC around idempotency, conflict resolution, and offline-first guarantees.

4. **Database compatibility is non-negotiable overhead**  
   MySQL/MariaDB dual-compatibility adds measurable effort. Factor it into every estimate involving schema or migration work.

5. **Architectural epics need a product narrative**  
   Refactoring work is harder to justify to stakeholders. Future architecture epics should include a "product enablement" section explaining which features this architecture enables.

---

## Follow-Up Actions

### P1 — Address Before Epic 4

| Action | Owner | Description | Success Criteria |
|--------|-------|-------------|-----------------|
| Extract shared master-data utilities package | Architect | Move `withTransaction`, `isMysqlError`, `ensure*` validators, and error-code constants into `lib/shared/` or `lib/master-data-errors.ts`. Eliminate helper duplication across item-groups, items, item-prices, supplies, fixed-assets. | Zero helper duplication across domain modules; all 714 tests still pass |
| Backfill fixed-assets route tests | QA | Add automated route-level tests for fixed-asset and fixed-asset-category CRUD endpoints, matching coverage of the items module | Minimum 80% route coverage; all critical paths tested |
| Document Epic 3 product enablement | PM | Create stakeholder-facing explanation of how domain extraction enables future features (variant-level sync, advanced GL reports, import/export) | ✅ Document published at [`docs/product/epic-3-product-enablement.md`](../../docs/product/epic-3-product-enablement.md); stakeholder sign-off received |

### P2 — Address Within Next Sprint

| Action | Owner | Description | Success Criteria |
|--------|-------|-------------|-----------------|
| Add test-coverage gates to story template | Scrum Master | Update the story spec template to require explicit test coverage criteria for domain extraction stories | Template updated; applied to Epic 4 stories |
| Create sync protocol validation checklist | Developer | Document mandatory validation steps for any sync-related changes (idempotency, conflict resolution, offline-first) | Checklist in `docs/`; referenced in Epic 4 planning |

### P3 — Address When Capacity Allows

| Action | Owner | Description | Success Criteria |
|--------|-------|-------------|-----------------|
| Audit remaining monolith patterns | Architect | Identify other files in `lib/` that have grown too large and need domain extraction | Report generated; candidates prioritized for Epic 5 |

---

## Conclusion

Epic 3 delivered its primary architectural objective: replacing a 2,829-line monolith with five focused domain modules that can be developed, reviewed, and tested independently. All critical invariants — sync protocol integrity, POS offline-first guarantees, MySQL/MariaDB compatibility — were preserved throughout.

The epic is considered **successfully closed** from a retrospective standpoint. The P1 follow-up actions (shared utilities extraction and fixed-assets test backfill) should be addressed before or during the early stories of Epic 4 to prevent technical debt from compounding.

---

## Related Documentation

- [Epic 3 Product Enablement](../docs/product/epic-3-product-enablement.md) — Stakeholder-facing explanation of how domain extraction enables future features

---

*Retrospective conducted: 2026-03-26*
*Epic 3 stories: 3.1–3.6 all marked done*
*Final test suite: 714/714 passing*
