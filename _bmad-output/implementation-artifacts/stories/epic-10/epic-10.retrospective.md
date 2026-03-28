# Epic 10 Retrospective: Fix Critical Hardcoded ID Tests

**Epic:** Epic 10 - Fix Critical Hardcoded ID Tests  
**Date:** 2026-03-28  
**Status:** Completed  
**Stories:** 4/4 (100%)

---

## Party Mode Discussion Summary

### Participants

- **Alex (Scrum Master)** - Sprint flow, story sizing, process
- **Devon (Developer)** - Technical implementation, refactoring challenges
- **Quinn (QA)** - Test stability, coverage improvements
- **Pat (Product Manager)** - Risk mitigation, value delivery

---

## Individual Perspectives

### Alex (Scrum Master) 🎯

**What Worked Well:**
The story sizing was spot-on. Story 10.1 creating `createOutletBasic()` was the foundational piece, and the follow-on refactor stories (10.2-10.4) each tackled a specific test file. The dependency chain was clean—no blocking, no rework loops. Each story was estimated around 2-4 hours and landed within that range.

**What Was Challenging:**
The gap between Epic 9 and Epic 10—we didn't have a formal handoff document explaining *which* tests still had hardcoded IDs. Devon had to hunt for them. A 'brittle test inventory' would've saved 15-20 minutes at kickoff.

**One Thing I'd Change:**
For future test refactoring epics, add a pre-epic spike story to catalog the problem areas. Something like '10.0-audit-hardcoded-ids' that just lists all offending files and lines. Would make planning cleaner.

---

### Devon (Developer) 💻

**What Worked Well:**
The pattern established in Epic 9—creating 'Basic' utility functions—paid off big time here. `createOutletBasic()` mirrors `createCompanyBasic()` perfectly. Once we had that foundation, refactoring each test file was mechanical: swap hardcoded IDs for dynamic creation, update cleanup order, done. The consistency made reviews easy.

Also, the cleanup order discipline mattered. Variant combinations → variants → items → outlets → companies. Getting that wrong meant FK constraint headaches, but we nailed it every time.

**What Was Challenging:**
The `services/stock.test.ts` file had 65+ references to hardcoded IDs. That wasn't clear from a quick skim. Some of those IDs were buried in nested objects and utility functions. Three passes were needed to catch them all. Also, the `999999`, `999998`, `999997` pattern—someone thought they were being 'safe' with high numbers, but it just made the tests brittle when the test DB had actual data in that range.

**One Thing I'd Change:**
Add a lint rule or custom ESLint plugin to flag hardcoded IDs in test files. If we catch `TEST_COMPANY_ID = 1` or `= 999999` at commit time, we prevent the debt from accumulating. The fix is cheap; finding it later is expensive.

---

### Quinn (QA) 🧪

**What Worked Well:**
Post-refactor, all 1,524 tests pass consistently. That's the win. More importantly, these tests are now *isolated*—each creates its own company/outlet, so no cross-test pollution. Before, if `company_id = 1` existed in the DB with unexpected state, tests would flake. Now? Deterministic.

The cleanup patterns Devon mentioned are critical. We've seen tests pass locally but fail in CI because cleanup was incomplete. The proper delete order in `test.after()` hooks saved us from that pain.

**What Was Challenging:**
Verifying the refactor was tedious. Had to spot-check that dynamic IDs were actually being used, not just imported. In one case, the import was added but a hardcoded ID remained in an assertion. It didn't fail because `1 == 1` by accident, but it was wrong. Visual inspection caught it, not the test runner.

Also, coverage metrics don't tell us if isolation is working. A test can 'pass' but still depend on global state. We need a different signal for true isolation.

**One Thing I'd Change:**
Add a 'test isolation check' to our CI. Something that runs tests in random order or with a fresh DB per test file. If tests fail under randomization, they're not isolated. Tools like `vitest --sequence.shuffle` exist—we should use them.

---

### Pat (Product Manager) 📊

**What Worked Well:**
This epic directly reduced delivery risk. Brittle tests slow down every subsequent feature. When developers fear the test suite, they skip running it, and bugs slip through. By making tests reliable, we've removed friction from the entire pipeline. That's compounding value—Epic 10 pays dividends on every future epic.

The scope was also well-contained. Four stories, clear acceptance criteria, no scope creep. We knew what 'done' looked like: no hardcoded IDs in the target files, all tests passing.

**What Was Challenging:**
From a stakeholder view, this work is invisible. 'Fixed tests' doesn't demo well. Had to actively communicate *why* this mattered—explaining that 2-3 days spent here saves weeks of debugging later. That education overhead is real.

Also, we don't have a metric showing 'test brittleness over time.' Can say 'tests are more stable,' but can't quantify it for leadership. Did we fix 10% of brittle tests? 50%? 90%? Unknown.

**One Thing I'd Change:**
Want a dashboard or periodic report on test health metrics: flaky test count, average test runtime, isolation violations. That way we can see the trend and justify ongoing maintenance investment.

---

## Cross-Team Insights

### Key Discussion Points

1. **Lint Rule for Prevention:** Devon's ESLint rule suggestion to flag hardcoded IDs at commit time
2. **Shuffle Testing for Detection:** Quinn's suggestion to use `--sequence.shuffle` to expose hidden dependencies
3. **Gradual Enforcement:** Pat's recommendation to start lint rules as warnings, escalate to errors after grace period
4. **Flaky Test Tracking:** Alex's idea to tag and trend retry attempts in CI for metrics
5. **Documentation Gap:** Need for a 'Testing Best Practices' doc showing cleanup order pattern

---

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Stories Completed | 0/4 | 4/4 |
| Tests Passing | ~1,500 | 1,524/1,524 |
| Hardcoded ID References | 80+ | 0 (in target files) |
| Test Isolation | Partial | Full (dynamic IDs) |
| Files Refactored | 0 | 3 test files + 1 utility |

---

## Consensus Findings

| Finding | Severity | Owner |
|---------|----------|-------|
| Hardcoded ID patterns persist elsewhere in codebase | Medium | Tech Debt Backlog |
| No automated detection of test isolation violations | Medium | QA/Dev |
| Test health metrics not visible to stakeholders | Low | PM/SM |
| Cleanup pattern not documented for onboarding | Low | Dev |

---

## Action Items

| # | Action | Owner | Priority | Target |
|---|--------|-------|----------|--------|
| 1 | Create ESLint rule to flag hardcoded IDs in tests | Devon | P2 | Epic 12 |
| 2 | Add `--sequence.shuffle` to CI test run | Quinn | P2 | Next sprint |
| 3 | Track and trend flaky test metrics monthly | Quinn/Pat | P3 | Ongoing |
| 4 | Document cleanup order pattern in testing guide | Devon | P3 | Epic 12 |
| 5 | Audit remaining test files for hardcoded IDs (spike) | Alex | P2 | Backlog |

---

## What Worked Well (Team Consensus)

1. **Pattern Consistency:** The `create*Basic()` utility pattern from Epic 9 proved reusable and effective
2. **Clean Dependencies:** Story 10.1 as foundation, then parallelizable refactor stories
3. **Mechanical Refactoring:** Clear, repeatable process made reviews straightforward
4. **Cleanup Discipline:** Proper FK-aware cleanup order prevented CI failures
5. **Test Stability:** All 1,524 tests passing with full isolation

---

## What Was Challenging (Team Consensus)

1. **Hidden Hardcoded IDs:** Some IDs buried in nested objects required multiple passes to find
2. **False Safety:** High-number IDs (999999) seemed safe but were still brittle
3. **Verification Tedium:** Spot-checking dynamic ID usage was manual and error-prone
4. **Invisible Value:** Stakeholder communication overhead for 'invisible' infrastructure work
5. **Metrics Gap:** No quantifiable way to show test health improvement to leadership

---

## One Thing We'd Change (Team Consensus)

**Alex:** Pre-epic spike to inventory problem areas  
**Devon:** ESLint rule to prevent new hardcoded ID debt  
**Quinn:** Shuffle testing to expose isolation violations  
**Pat:** Test health dashboard for stakeholder visibility

**Synthesized:** Implement a "test hygiene" toolchain combining lint rules, shuffle testing, and metrics tracking to prevent debt accumulation and make health visible.

---

## Key Takeaways

1. **Technical debt repayment follows compound interest** - The time invested in Epic 10 will accelerate every future epic by removing friction from the test suite.

2. **Patterns create leverage** - The `create*Basic()` utility pattern established in Epic 9 made Epic 10 implementation mechanical rather than exploratory.

3. **Isolation is invisible until it breaks** - Tests can pass while still having hidden dependencies. Explicit isolation verification (shuffle testing) is needed.

4. **Prevention beats detection** - Lint rules at commit time are cheaper than refactoring later. Invest in guardrails.

5. **Metrics justify maintenance** - Stakeholders need visible signals of invisible work. Track and trend test health.

---

## Epic Verdict

✅ **SUCCESSFUL**

- All stories completed on schedule
- Clear pattern established and documented
- Test stability significantly improved
- Good foundation laid for Epic 11

**Team Morale:** High. Mechanical, well-scoped work with clear outcomes.

**Recommended for Epic 11:** Apply the same pattern to remaining test files, with the additional tooling (lint rules, shuffle testing) suggested in action items.

---

## Stories Completed

- [x] **Story 10.1:** Add createOutletBasic() - DONE
- [x] **Story 10.2:** Refactor variant-stock.test.ts - DONE
- [x] **Story 10.3:** Refactor services/stock.test.ts - DONE
- [x] **Story 10.4:** Refactor routes/stock.test.ts - DONE

---

*Retrospective conducted via PARTY MODE - Multi-perspective team discussion*  
*Document generated: 2026-03-28*
