# Technical Debt Tracker

**Project:** Jurnapod  
**Last Updated:** 2026-03-22  
**Tracking System:** File-based

---

## Overview

This file tracks technical debt accumulated across epics. Items should be addressed in future sprints or formally closed with justification.

---

## Active Debt

### Epic 9 Carry-over

| ID | Debt Item | Origin | Priority | Status | Notes |
|----|-----------|--------|----------|--------|-------|
| DEBT-001 | Create architecture decision log (ADR) | Epic 9 | MEDIUM | OPEN | Carried from Epic 9 → Epic 10 → Epic 11. Should be completed in next epic cycle. |

**DEBT-001 Details:**
- **Created:** 2026-03-21 (Epic 9 retrospective)
- **Description:** Document key architectural decisions made across epics (ADR format)
- **Why Outstanding:** Priority shifted to feature delivery
- **Recommended Solution:** Create `/docs/adr/` directory with decision records for:
  - Authentication architecture (Epic 1)
  - POS offline-first sync pattern (Epic 2)
  - Journal/source-of-truth accounting model (Epic 3)
  - Component architecture decisions (Epic 8, 10)

---

## Epic 10 Action Items (Not Tracked in Sprint)

These items were identified in the Epic 10 retrospective but not added to sprint-status.yaml:

| ID | Action Item | Owner | Priority | Status | Notes |
|----|-------------|-------|----------|--------|-------|
| E10-ACT-001 | Audit Epic 10 components in existing pages | Dana | HIGH | OPEN | PageHeader, FilterBar, DataTable need adoption audit |
| E10-ACT-002 | Set up React Testing Library | Charlie | HIGH | OPEN | Required for component testing |
| E10-ACT-003 | Define lint rule requirements for adoption | Charlie | MEDIUM | OPEN | Enforce Epic 10 component usage |
| E10-ACT-004 | Create ADR for backoffice UI patterns | Charlie | MEDIUM | OPEN | Document PageHeader, FilterBar, DataTable patterns |
| E10-ACT-005 | Document Epic 9/10 patterns centrally | Elena | MEDIUM | OPEN | Centralize documentation in /docs/ |

**Action Item Details:**

#### E10-ACT-001: Audit Epic 10 Components in Existing Pages
- **Original Deadline:** Before Epic 11
- **Current Status:** OPEN (no evidence of completion)
- **Scope:** Audit backoffice pages to adopt PageHeader, FilterBar, DataTable
- **Effort:** ~4 hours

#### E10-ACT-002: Set up React Testing Library
- **Original Deadline:** Before Epic 11  
- **Current Status:** OPEN (no evidence of setup)
- **Scope:** Configure RTL for component testing in backoffice
- **Effort:** ~2 hours
- **Blocking:** E10-ACT-001 component audits

#### E10-ACT-003: Define Lint Rule Requirements for Adoption
- **Original Deadline:** Before Epic 11
- **Current Status:** OPEN
- **Scope:** ESLint rules to enforce Epic 10 component usage
- **Effort:** ~1 hour

#### E10-ACT-004: Create ADR for Backoffice UI Patterns
- **Original Deadline:** Epic 11 story 3
- **Current Status:** OPEN (supersedes DEBT-001 for UI patterns)
- **Scope:** Document PageHeader, FilterBar, DataTable architecture decisions
- **Effort:** ~2 hours

#### E10-ACT-005: Document Epic 9/10 Patterns Centrally
- **Original Deadline:** During Epic 11
- **Current Status:** OPEN
- **Scope:** Consolidate patterns from Epic 9 (useFilters, useBreadcrumbs) and Epic 10 (PageHeader, FilterBar, DataTable)
- **Effort:** ~3 hours

---

## Closed Debt

| ID | Debt Item | Closed Date | Resolution |
|----|-----------|-------------|------------|
| DEBT-CL-001 | XSS vulnerability in PageHeader | 2026-03-22 | Fixed during Epic 10 code review |
| DEBT-CL-002 | Focus management missing in FilterBar | 2026-03-22 | Fixed during Epic 10 code review |
| DEBT-CL-003 | Race condition in DataTable | 2026-03-22 | Fixed via E2E tests in Epic 10 |
| DEBT-CL-004 | Duplicate BREADCRUMB_ROUTES definition | 2026-03-22 | Fixed during Epic 10 code review |

---

## Debt Management Guidelines

1. **Before Starting New Epic:**
   - Review this file for carry-over items
   - Convert debt items to sprint tasks or formally close with justification

2. **During Code Review:**
   - Identify new debt items
   - Add to this file with DEBT-{number} identifier
   - Assign priority (HIGH/MEDIUM/LOW)

3. **Debt Prioritization:**
   - **HIGH:** Security vulnerabilities, production blockers
   - **MEDIUM:** Technical debt affecting developer velocity
   - **LOW:** Nice-to-have improvements

4. **Debt Review Cadence:**
   - Review in each retrospective
   - Update status monthly
   - Close items when resolved

---

## Metadata

- **File Created:** 2026-03-22
- **Last Review:** 2026-03-22 (Epic 10 retrospective)
- **Next Review:** 2026-03-29 or at project milestone
- **Owner:** Scrum Master / Tech Lead

---

## Related Documents

- Epic 9 Retrospective: `epic-9-retro-2026-03-21.md`
- Epic 10 Retrospective: `epic-10-retro-2026-03-22.md`
- UI Standards: `/docs/ui-standards.md`
- Sprint Status: `sprint-status.yaml`
