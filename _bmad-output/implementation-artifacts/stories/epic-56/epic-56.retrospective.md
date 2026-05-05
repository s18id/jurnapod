# Epic 56 Retrospective — Correctness Infrastructure

**Epic:** 56 — Correctness Infrastructure
**Date:** 2026-05-05
**Epic Status:** done
**Stories Completed:** 2/2 (100%)

---

## 1. What We Accomplished

### Delivery Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 2/2 (100%) |
| Integration tests | 24 new + 22 existing = 46 total |
| Test suites 3× consecutive green | ✅ (ap-reconciliation-snapshots) |
| Action items closed | 2/2 (E55-A1, E55-A2) |
| Migration lint violations | 0 (all 16 existing triggers grandfathered) |
| P0/P1 blockers | 0 unresolved |

### Technical Outcomes

- **Migration 0201** created: `trg_ap_reconciliation_snapshots_before_update` replaced with archive-enabling version (allows `status='ARCHIVED'` + supersession chain, blocks all else)
- **`scripts/lint-migrations.ts`** created: pure function `lintMigrationsContent()` + CLI with `--stdin`/`--file`/`--dir` flags
- **CI job** `lint-migrations` wired in `.github/workflows/ci.yml` as required gate
- **9 unit tests** written and passing
- **16 existing business-logic triggers** grandfathered across 8 migration files
- **`AGENTS.md` §C** updated with enforcement description referencing `npm run lint:migrations`
- **Sprint blueprint** re-baselined: program closure extended to Sprint 64; S63/S64 (boundary enforcement, DRY/KISS consolidation) reinstated

### Business Outcomes

- **E55-A1 closed** — CI enforcement for "no new business DB triggers" rule now active
- **E55-A2 closed** — archive flow unblocked for AR snapshot work (AP and AR both allowed `status='ARCHIVED'` transitions)
- **AR/treasury correctness** unblocked: sprint 57 can proceed without trigger constraint blocking archive path

---

## 2. What Went Well

1. **Both E55 retro items resolved in one epic** — previous retros had action items sitting idle for multiple epics. E55-A1 and E55-A2 were both resolved in S56, unblocking the downstream AR/treasury work.

2. **Spec corrections applied before delegation** — trigger name `trg_ap_reconciliation_snapshots_before_update` (not the spec's sketch name), supersession chain path preserved from Migration 0193, migration number corrected — all caught in review before code.

3. **Grandfathering done in bulk** — 16 triggers annotated in a single batch pass across 8 files. `npm run lint:migrations` exits 0 immediately after.

4. **CI job positioned as required gate** — `lint-migrations` runs as a required blocking gate (parallel with lint-api, typecheck-api, fixture-flow), not advisory.

5. **Sprint blueprint re-baseline in same epic** — the shift to S48–S64 and reinstatement of S63/S64 documented and approved immediately, not deferred.

---

## 3. What We Struggled With

1. **Trigger detection in lint script** — first version of `extractTriggers()` consumed body lines starting from the CREATE TRIGGER line, which captured `FOR EACH ROW` and SQL statements preceding the actual trigger body. This caused `SIGNAL SQLSTATE` in one-liner triggers to be missed. Fixed by skipping to the line after `FOR EACH ROW` before collecting body.

2. **Annotation line adjacency** — initial annotation placement for Migration 0193 and 0201 had blank lines between `-- lint:allow-business-trigger` and `CREATE TRIGGER`. The detector checks only the immediately preceding line, so blank lines caused violations. Fixed with no-gap placement.

3. **Test invocation from monorepo** — running `vitest` with `--config scripts/vitest.config.ts` from root failed because `__test__/**/*.test.ts` pattern was relative to CWD, not the config file's directory. Solved with `scripts/vitest.config.ts` using `resolve(__dirname, "__test__/**/*.test.ts")`.

---

## 4. Key Insights

1. **Inline corrective epics work** — Epic 56 packaged two blocking items (E55-A1, E55-A2) as a focused prep sprint. This is a pattern worth noting: correctness infrastructure that unblocks downstream work deserves its own sprint rather than being buried as "extra tasks" in a feature sprint.

2. **Grandfathering is not optional** — rolling out a CI lint gate without grandfathering existing violations means the gate fails on day one. Budget time for it.

3. **Trigger body parsing requires attention to `FOR EACH ROW`** — MySQL/MariaDB trigger body starts after the `FOR EACH ROW` line, not at `CREATE TRIGGER`. Off-by-line errors cause silent false negatives in lint detection.

4. **Sprint blueprint drift tracking** — the May 28 re-baseline pushed S60–S61 beyond program window. The May 5 re-baseline restored them (now S63–S64) because the program window extended. Both re-baselines documented; the artifact is now self-consistent.

---

## 5. Previous Retro Follow-Through

Epic 55 had 2 action items (both from this epic's retrospective):

| Action Item | Status | Evidence |
|-------------|--------|----------|
| E55-A1: CI lint gate for no-business-triggers rule | ✅ Completed | `scripts/lint-migrations.ts` created, CI job wired, 16 triggers grandfathered |
| E55-A2: Resolve archive flow trigger constraint | ✅ Completed | Migration 0201 replaces trigger, archive path allowed, 24 tests pass |

**Conclusion:** Both Epic 55 action items resolved in Epic 56. Follow-through improved vs. previous epics where items sat idle (e.g., E51-A1 sat for 4 epics before E55).

---

## 6. Sprint 57 Preparation

Sprint 57: **AR + Treasury Correctness** — builds directly on Epic 56's archive flow being unblocked.

### Critical Path

| Item | Owner | Success Criterion |
|------|-------|------------------|
| AR snapshot schema spike | — | AR-equivalent `ap_reconciliation_snapshots` table design with `status='ARCHIVED'` support |
| Archive-path audit trail | — | `ap_reconciliation_audit_trail` receives `ARCHIVED` action_type |
| Trigger 0201 verified against AR schema | — | No migration needed for AR; trigger logic applies to `ap_reconciliation_snapshots` (shared table between AP and AR) |

### Epic 56 Knowledge Carry-Forward

| Pattern | Sprint 57 Application |
|---------|----------------------|
| Archive transition (status='ARCHIVED') | AR snapshot retention/archival |
| `archive_version` incrementing on each archive | AR snapshot versioning |
| `archived_at` column (nullable, set on first archive) | AR snapshot lifecycle tracking |
| Supersession chain (`superseded_by_snapshot_id`) | AR snapshot version chain |
| Migration 0201 trigger body logic | Migration 0191 applies to AR; confirm no AR-specific column blocks trigger |

---

## 7. Action Items (Max 2 — AGENTS.md E46-A2)

*(none — both E55 action items closed; no new P0/P1 items identified)*

> Epic 56 was a corrective prep sprint. No new action items were generated.
> Items for future epics enter the backlog as standard work, not as retro carry-overs.

---

## 8. Sign-Off

| Role | Agent | Date |
|------|-------|------|
| Facilitator | — | 2026-05-05 |
| Product Owner | — | 2026-05-05 |
| Senior Developer | — | 2026-05-05 |
| Project Lead | Ahmad | 2026-05-05 |

---

_Last Updated: 2026-05-05T10:50:00Z_