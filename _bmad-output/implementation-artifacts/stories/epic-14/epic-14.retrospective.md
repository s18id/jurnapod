# Epic 14 Retrospective: Kysely ORM Migration for Epic 13 Libraries

**Epic:** Kysely ORM Migration for Epic 13 Libraries  
**Date:** 2026-03-28  
**Status:** Completed  
**Stories:** 5/5 (100%)

---

## Party Mode Discussion Summary

### Participants

- **Bob (Scrum Master)** - Sprint flow, process
- **Amelia (Developer)** - Technical implementation, Kysely patterns
- **Quinn (QA Engineer)** - Test coverage, quality assurance
- **John (Product Manager)** - Value delivery, stakeholder impact
- **Ahmad (Project Lead)** - Perspective and guidance

---

## Individual Perspectives

### Bob (Scrum Master) 🏃

**What Worked Well:**
The parallel delegation strategy worked smoothly - two streams (validation+permissions vs batch-operations) executed without conflicts. Epic 13's action items were properly addressed: test-fixtures.ts extended with permission fixtures, ADR-0011 updated with actual patterns used. Five stories, all completed cleanly.

**What Was Challenged:**
The P1 connection leak should have been caught in development, not review. This reveals a gap in our library template - we don't have guardrails that make connection leaks impossible to introduce. The Epic 13 retrospective warned about documentation timing, and we did better this time (incremental updates), but the connection handling pattern gap is the real issue.

**One Thing I'd Change:**
Add connection guardrails to the library template. Make it structurally impossible to write code that leaks connections - either via a wrapper that auto-releases, a lint rule, or a code pattern that enforces correct behavior.

---

### Amelia (Developer) 💻

**What Worked Well:**
The Kysely patterns from Epic 13 held up well. Once we had `newKyselyConnection()`, migration was straightforward. The bitwise permission check with `sql` template tag was the trickiest part but it's now documented. The column/value mismatch bug in `batchInsertItems` (7 columns but 9 values) was found and fixed - that would have been a runtime failure.

**What Was Challenged:**
I wrote validation.ts and permissions.ts initially and missed the connection leak pattern. The library template didn't have guard rails. I thought I was following existing patterns, but I didn't realize `newKyselyConnection()` needed specific handling. Review caught it before merge, but that's too late - I should have caught it in my own testing.

Also, I wrote initial tests using direct DB setup before refactoring to use test-fixtures.ts. That's rework that could have been avoided if the fixture library was available upfront.

**One Thing I'd Change:**
Add a Kysely connection guard to our library template - make it impossible to write code that leaks connections. A wrapper that auto-releases or a lint rule that fails if `connection.release()` isn't called.

---

### Quinn (QA Engineer) 🧪

**What Worked Well:**
test-fixtures.ts extension worked beautifully. The 7 new permission tests using fixtures are clean - `createUserWithRole()`, `createPermissionGrant()` helpers. When running the permissions test suite in isolation, it passed every time. The fixture approach solved setup/teardown consistency issues from Epic 13.

**What Was Challenged:**
Test ordering dependencies caused unique constraint violations when running the full suite together. When `npm run test:unit` runs all test files sequentially, they create conflicts on SKU uniqueness and company_id=1. The fixtures generate deterministic data, but when multiple test files run together, collisions happen.

The connection leak should have been caught earlier. Single test runs don't expose resource leaks - they require load or repeated execution. That's a gap in our test coverage model.

**One Thing I'd Change:**
Add load testing to CI - run critical tests multiple times in quick succession to catch connection leaks. Single test pass is insufficient for detecting resource management bugs. Also improve fixture naming to be truly unique.

---

### John (Product Manager) 📋

**What Worked Well:**
Epic 14 delivered exactly what it promised - Kysely ORM migration for Epic 13 libraries. The 9 functions migrated are production-ready. The connection leak fix is significant - that would have been a production incident under load. Catching it in review is better than catching it in production.

Epic 13 action items were properly addressed. test-fixtures.ts extension (Action #2) was P2 in Epic 13 and we prioritized it in Epic 14. Continuity working as intended.

**What Was Challenged:**
The "invisible value" problem persists. Epic 14's work - Kysely migration, connection leak fix - is foundational. Stakeholders don't see "P1 connection leak that would have caused outages under load." They see nothing visible. Value is absence of problems.

Epic 15 isn't planned yet. We have clean momentum from Epic 13→14, but the pipeline goes cold if we don't plan soon. There's business pressure to ship features, but Epic 14 shows the value of investment sprints.

**One Thing I'd Change:**
Create a production health metric that captures "P1 bugs caught pre-production." Make invisible value visible - connection leaks caught, edge cases tested, patterns documented. Help stakeholders understand the value of foundation work.

---

## Cross-Team Insights

### Key Discussion Points

1. **Connection Template Gap:** The P1 connection leak reveals our library template lacks guardrails that make leaks impossible. This is a systemic issue, not an individual developer issue.

2. **Test Ordering Dependencies:** Unique constraint violations when running full test suite together. Fixtures need better unique naming to prevent collisions.

3. **Epic 13 Actions Addressed:** Action items #1 (documentation), #2 (test-fixtures), #5 (library validation) were all addressed in Epic 14.

4. **Parallel Execution Success:** Two streams completed without conflicts because library signatures were stable and well-defined.

5. **Epic Pipeline Gap:** Epic 15 not planned - momentum could stall without forward planning.

---

## Metrics

| Metric | Before Epic 14 | After Epic 14 |
|--------|---------------|---------------|
| Stories Completed | 0/5 | 5/5 |
| Functions Migrated | 0 | 9 |
| P1 Bugs Caught | 0 | 1 (connection leak) |
| Critical Bugs Fixed | 0 | 1 (column/value mismatch) |
| Unit Tests Added | 0 | 7 (permissions) |
| Documentation Updated | ADR-0011 v1 | ADR-0011 v2 (patterns) |
| test-fixtures.ts | Basic | Extended with permissions |

---

## Consensus Findings

| Finding | Severity | Owner |
|---------|----------|-------|
| Library template lacks connection guardrails | High | Dev |
| Test ordering dependencies (unique constraint collisions) | Medium | QA |
| Initial tests needed rework to use fixtures | Low | Dev/QA |
| Invisible value of foundation work | Low | PM |
| Epic 15 not planned | Medium | SM/PM |

---

## Action Items

| # | Action | Owner | Priority | Target |
|---|--------|-------|----------|--------|
| 1 | Add Kysely connection guard to library template - make leaks impossible via template enforcement | Amelia (Dev) | P1 | Epic 15 |
| 2 | Improve test-fixtures with unique naming - prevent constraint violations in parallel test runs | Quinn (QA) | P1 | Epic 15 |
| 3 | Add CI load test for critical paths - run tests multiple times to catch resource leaks | Quinn (QA) | P2 | Epic 15 |
| 4 | Create production health metrics dashboard - capture P1 bugs caught, invisible value made visible | John (PM) | P3 | Epic 15 |
| 5 | Plan Epic 15 - maintain momentum, don't let pipeline go cold | Bob/John | P1 | Immediate |

---

## What Worked Well (Team Consensus)

1. **Parallel execution worked cleanly** - Two streams (validation+permissions vs batch-operations) completed without conflicts
2. **Epic 13 learnings applied** - test-fixtures.ts extended, ADR-0011 updated with actual patterns used
3. **Critical bugs caught pre-merge** - P1 connection leak fixed before production; column/value mismatch bug fixed
4. **Documentation currency maintained** - ADR-0011 updated with batch operations + bitwise permission patterns, not reconstructed post-hoc
5. **100% story completion** - 5/5 stories, all acceptance criteria met

---

## What Was Challenged (Team Consensus)

1. **Connection leak P1 should have been caught earlier** - Template gap allowed bug to reach review; suggests development-time detection gap
2. **Test ordering dependencies** - Unique constraint violations when tests run together in full suite
3. **Initial tests needed rework** - Direct DB setup instead of fixtures initially; rework that could have been avoided
4. **Invisible value of foundation work** - Stakeholders don't see P1 bugs caught, only absence of production incidents
5. **Epic pipeline gap** - Epic 15 not planned; momentum could stall

---

## One Thing We'd Change (Team Consensus)

- **Bob:** Add connection guardrails to library template - make leaks structurally impossible
- **Amelia:** Add Kysely connection guard to library template - wrapper or lint rule
- **Quinn:** Add load testing to CI for critical paths - single pass insufficient for resource leaks
- **John:** Create production health metrics dashboard - make invisible value visible

**Synthesized:** Invest in detection and measurement infrastructure - connection guardrails in templates, load testing in CI, and metrics dashboards. The implementation execution was solid; the supporting infrastructure needs attention.

---

## Key Takeaways

1. **Library template gaps are systemic risks.** The connection leak wasn't a developer mistake - it was a template that allowed incorrect behavior. Fix the template, fix the root cause.

2. **Single-test-pass is insufficient for resource management bugs.** Connection leaks require load or repeated execution to surface. Add load testing to CI for critical paths.

3. **Epic 13 learnings properly applied.** test-fixtures.ts extended, documentation updated incrementally - these action items from Epic 13's retrospective were addressed in Epic 14.

4. **Parallel execution requires stable interfaces.** Two streams worked because library signatures were well-defined upfront. Without stable interfaces, rework would have eaten time savings.

5. **Invisible value needs visible metrics.** Foundation work prevents problems - that's real value, but stakeholders don't see it. Invest in metrics that make absence of problems visible.

---

## Epic Verdict

### Grade: A-

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Delivery** | Excellent | 5/5 stories, 100% completion |
| **Quality** | Good | P1 connection leak caught pre-merge; critical bug fixed |
| **Process** | Good | Parallel streams worked; Epic 13 actions addressed |
| **Technical** | Mixed | Connection leak pattern gap in template |
| **Testing** | Mixed | Fixtures improved; ordering issues remain |

### Net Assessment

Epic 14 successfully validated Epic 13 libraries under Kysely migration and fixed critical bugs. The connection leak issue reveals a template gap that needs addressing. Team execution was solid, and Epic 13 learnings were properly applied.

### Recommended for Epic 15

Address connection template gap as first priority. Continue the library investment theme - Epic 13→14 established reusable foundations, Epic 15 should extend them with proper guardrails.

---

## Stories Completed

- [x] **Story 14.1:** Migrate import/validation.ts to Kysely - DONE
- [x] **Story 14.2:** Migrate auth/permissions.ts to Kysely - DONE (7 new tests)
- [x] **Story 14.3:** Migrate batch-operations.ts SELECT operations - DONE
- [x] **Story 14.4:** Migrate batch-operations.ts WRITE operations - DONE (bug fix)
- [x] **Story 14.5:** Epic 14 documentation - DONE

---

## Epic 13 Action Item Follow-Through

| Action from Epic 13 | Status | Evidence |
|---------------------|--------|----------|
| 1: Document patterns incrementally | ✅ Done | ADR-0011 updated with batch operations + bitwise permission patterns |
| 2: Create shared test-fixtures.ts | ✅ Done | Extended with permission fixtures, 7 new tests passing |
| 3: Investigate test ordering dependencies | ⏳ Partial | Acknowledged, improved fixtures but not fully resolved |
| 4: Create architectural health metrics | ❌ Not done | Deferred to Epic 15 |
| 5: Validate library reusability | ✅ Done | Epic 13 libraries successfully migrated to Kysely |

---

*Retrospective conducted via PARTY MODE - Multi-perspective team discussion*  
*Document generated: 2026-03-28*
