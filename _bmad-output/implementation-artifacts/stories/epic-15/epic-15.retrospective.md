---
epic: 15
epic_title: "Foundation Hardening & TD Resolution"
status: Done
completed_date: 2026-03-28
stories_completed: 5
stories_total: 5
completion_rate: 100%
retrospective_date: 2026-03-29
facilitator: Bob (Scrum Master)
participants:
  - Bob (Scrum Master)
  - Amelia (Developer)
  - Quinn (QA)
  - John (PM)
overall_grade: "A-"
---

# Epic 15 Retrospective: Foundation Hardening & TD Resolution

**Epic Status:** Done (completed 2026-03-28)  
**Stories:** 5/5 (100%)  
**Retrospective Date:** 2026-03-29  

---

## Executive Summary

Epic 15 successfully delivered foundation hardening and technical debt resolution, closing out all items from the Epic 14 retrospective while establishing patterns for future work. The epic achieved its primary goal of resolving TD-030 (Effective Date Filtering) while implementing critical infrastructure improvements including connection safety and test fixture reliability.

**Overall Grade: A-**

---

## Story Deliverables Summary

| Story | Title | Status | Key Deliverable |
|-------|-------|--------|-----------------|
| 15.1 | Connection Guard | Done | `withKysely()` wrapper in lib/db.ts |
| 15.2 | Test Fixtures Unique Naming | Done | Timestamp/random suffix for test isolation |
| 15.3 | TD-030 Effective Date Filtering | Done | Migration 0128 + query updates |
| 15.4 | Documentation + Epic 16 Planning | Done | ADR-0011 updated, TD-030 resolved |
| 15.5 | TD-031 Alert Retry Spike | Done | Identified alert-manager.ts, designed retry pattern |

---

## What Worked Well

### 1. Systematic Technical Debt Resolution
**Amelia (Developer):** The TD-030 resolution in Story 15.3 was executed properly—not just patched, but systematically addressed through migration 0128 and comprehensive query updates. The effective date filtering now works correctly across the codebase.

**Impact:** Eliminated a significant source of reporting errors and date-range calculation bugs.

### 2. Proactive Foundation Hardening
**Amelia (Developer):** The `withKysely()` wrapper from Story 15.1 transformed our database connection handling from a P1 risk into a clean, testable abstraction. This pattern is now reusable across all database operations.

**Bob (Scrum Master):** Front-loading the connection safety work gave us a solid foundation for everything else in the epic and beyond.

**Impact:** Connection leaks eliminated; operational risk significantly reduced.

### 3. Test Infrastructure Reliability
**Quinn (QA):** The unique naming approach in Story 15.2—adding timestamps and random suffixes to test fixtures—eliminated an entire class of flaky tests. CI pass rates have improved measurably.

**Impact:** Developer confidence in CI increased; less time spent debugging test collisions.

### 4. Documentation Discipline
**Quinn (QA):** Updating ADR-0011 in Story 15.4 demonstrates that we're not just fixing things, but documenting why and how. This creates organizational memory and helps future developers understand decisions.

**Impact:** Knowledge preserved; onboarding improved; audit trail maintained.

### 5. Forward-Looking Planning
**John (PM):** Completing the TD-031 spike in Story 15.5 positions us perfectly for Epic 16. We didn't just resolve current debt; we identified and planned for the next priority.

**Impact:** Epic 16 planning completed with clear implementation path for alert retry mechanism.

### 6. Continuous Improvement from Previous Retro
**Bob (Scrum Master):** We systematically addressed all three issues from the Epic 14 retrospective: connection leaks (now guarded), test fixture naming (now unique), and Epic 15 planning (now complete with Epic 16 roadmap).

**Impact:** Team demonstrated learning and adaptation; process maturity increased.

---

## What Was Challenging

### 1. Migration Complexity Underestimated
**Amelia (Developer):** The TD-030 migration in Story 15.3 was more complex than initially estimated. Effective date filtering touches numerous queries, and ensuring backward compatibility while adding new behavior required extensive edge-case handling.

**Specific Challenges:**
- Handling `duration_minutes IS NULL` legacy rows
- Timezone resolution (outlet → company, no UTC fallback)
- Ensuring overlap rules (`a_start < b_end && b_start < a_end`) remained correct

**Lesson:** Infrastructure migrations need padding for edge-case discovery.

### 2. Spike Scope Creep
**Bob (Scrum Master):** Story 15.5 (TD-031 spike) was intended as investigation only, but finding alert-manager.ts led to designing a full retry pattern. This blurred the line between spike and implementation.

**Amelia (Developer):** The output was valuable, but the time spent was closer to a full story than a spike.

**Lesson:** Define clearer "stop conditions" for spikes; if designing solutions, convert to implementation story.

### 3. Test Coverage Gaps on Infrastructure
**Quinn (QA):** The connection guard in Story 15.1 would have benefited from earlier test scenario definition. Some issues were caught in review that could have been identified by tests sooner.

**Lesson:** Apply "shift-left" testing to infrastructure stories, not just features.

### 4. Stakeholder Communication of Foundation Value
**John (PM):** Communicating the value of foundation work to stakeholders was challenging. "Fixing connection leaks" doesn't resonate like feature announcements, despite being critically important.

**Lesson:** Need better frameworks for quantifying risk reduction and velocity improvements from technical debt paydown.

---

## One Thing to Change

**Team Consensus:** Adopt stricter spike boundaries and earlier QA involvement in infrastructure stories.

### Rationale
This combines two key insights from the challenges:
1. **Amelia's observation** about spike scope creep needing clearer boundaries
2. **Quinn's feedback** about earlier test involvement in infrastructure work

### Implementation
- Add "test scenario review" checkpoint to infrastructure story template
- Create spike template with strict time-box and explicit "stop conditions"
- Include QA in all infrastructure story kickoffs

---

## Action Items

| ID | Action | Owner | Due Date | Priority | Status |
|----|--------|-------|----------|----------|--------|
| A1 | Add "test scenario review" checkpoint to infrastructure story template | Bob | Sprint 17 | P2 | Open |
| A2 | Create spike template with strict time-box and clear "stop conditions" | Bob | Sprint 17 | P2 | Open |
| A3 | Build technical debt burndown dashboard for sprint reviews | John | Epic 16 mid-point | P3 | Open |
| A4 | Define "foundation win" celebration criteria for team shout-outs | John | Sprint 17 | P3 | Open |
| A5 | Include QA in Story 16.1 kickoff (TD-031 implementation) | Amelia | Story 16.1 start | P1 | Open |

---

## Epic Verdict Grade

### Grade Breakdown

| Dimension | Grade | Weight | Contribution |
|-----------|-------|--------|--------------|
| **Delivery** | A | 25% | All 5 stories completed on time |
| **Quality** | A- | 25% | Solid foundation; minor test coverage gap |
| **Technical Debt** | A | 25% | TD-030 resolved, TD-031 identified and planned |
| **Process Improvement** | A | 15% | All Epic 14 retrospective items addressed |
| **Stakeholder Value** | B+ | 10% | Critical risk reduction; visibility was low |

### **Overall Grade: A-**

### Verdict Summary

Epic 15 was a strong foundation-hardening success. The team demonstrated excellent continuous improvement by systematically addressing prior retrospective items. The technical outcomes—connection safety, test reliability, and debt resolution—position the codebase well for Epic 16.

Minor deductions for:
- Spike discipline (scope creep in Story 15.5)
- Stakeholder communication (foundation value not well articulated)
- Early test involvement (could have caught issues sooner)

### Participant Closing Thoughts

> **Bob:** "Great work, team. Let's carry this momentum into TD-031 implementation."

> **Amelia:** "Agreed. The patterns we established here will make Epic 16 smoother."

> **Quinn:** "Looking forward to testing that retry logic!"

> **John:** "Onward to Epic 16. Well done, everyone."

---

## Links & References

- Epic 15 Tech Spec: `docs/tech-specs/epic-15-foundation-hardening.md`
- ADR-0011: `docs/adr/adr-011-effective-date-filtering.md`
- Sprint Status: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Previous Retro (Epic 14): `_bmad-output/implementation-artifacts/stories/epic-14/epic-14.retrospective.md`
- Next Epic Plan: Epic 16 - TD-031 Alert Retry Implementation

---

*Document generated via Party Mode Retrospective on 2026-03-29*
*Facilitated by: BMAD Scrum Master*
*Participants: Bob, Amelia, Quinn, John*
