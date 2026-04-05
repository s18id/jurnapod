# Sprint Plan Template

> **Purpose:** Standardized sprint planning for Jurnapod epics.  
> **Last Updated:** 2025-01-06 — Added Package-First Design Checkpoint (post-Epic 32 retrospective)

## Overview

**Epic:** {Epic Name}  
**Duration:** {N sprints}  
**Goal:** {One-sentence outcome statement}

---

## Package-First Design Checkpoint (REQUIRED)

> **Why:** From Epic 32 retrospective — a 1317-line fiscal-year domain file was placed in `apps/api/src/lib/` instead of `modules-accounting`, violating ADR-0014 package boundary policy. This checkpoint prevents recurrence.

### Before Any Story Kickoff

| Checkpoint | Required Evidence |
|------------|-------------------|
| **Domain Location Decision** | Where will new domain logic live: `packages/*` or `apps/api/src/lib/`? |
| **ADR-0014 Compliance** | If `apps/api/src/lib/` chosen, document written justification |
| **Line Count Projection** | Estimated lines of new domain code |
| **Architectural Sign-off** | Required if domain logic >500 lines in `apps/api/src/lib/` |

### 500-Line Threshold Rule

| Scenario | Action Required |
|----------|-----------------|
| New domain file in `apps/api/src/lib/` ≤500 lines | Standard review; document justification |
| New domain file in `apps/api/src/lib/` >500 lines | **Architectural sign-off required** before story kickoff |
| Any domain file in `packages/*` | Standard package extraction workflow |

### Decision Checklist

- [ ] All new domain logic has identified package home or explicit `apps/api/src/lib/` exception
- [ ] If exception: written justification references ADR-0014 section and includes sunset date
- [ ] If >500 lines in `apps/api/src/lib/`: architect/tech lead approval obtained
- [ ] Import direction verified: `apps/api` → `packages/*` (never reverse)

---

## Hard Prerequisite Gate (Must Pass Before Any Story)

{Epic} work may begin only when all are true:

1. {Prerequisite 1}
2. {Prerequisite 2}
3. {Prerequisite 3}

---

## Dependency Graph

```
G0: Prerequisite gate
        ↓
    {Story X.1}
      ├── {Story X.2}
      └── {Story X.3}

{X.4} depends on: {X.1 + X.2}
{X.5} depends on: {X.1 + X.2 + X.3 + X.4}
```

---

## Sprint Breakdown

### Sprint 1 — {N}h

#### Story {X.1}: {Title}
- **Estimate:** {N}h
- **Priority:** {P1/P2/P3}
- **Dependencies:** {G0 / X.Y}
- **Focus:**
  - {Bullet point}
  - {Bullet point}

#### Story {X.2}: {Title}
- **Estimate:** {N}h
- **Priority:** {P1/P2/P3}
- **Dependencies:** {X.Y}
- **Focus:**
  - {Bullet point}

### Sprint 2 — {N}h

#### Story {X.3}: {Title}
- **Estimate:** {N}h
- **Priority:** {P1/P2/P3}
- **Dependencies:** {X.Y + X.Z}
- **Focus:**
  - {Bullet point}

---

## Architecture Notes (Critical Decisions)

1. {Decision 1 with rationale}
2. {Decision 2 with rationale}
3. {Decision 3 with rationale}

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | {Risk description} | {Mitigation/approach} |
| 2 | {Risk description} | {Mitigation/approach} |

---

## Validation Commands

### Unit/Integration Tests
```bash
npm run test -w @jurnapod/{workspace}
```

### Type Check
```bash
npm run typecheck -w @jurnapod/{workspace}
```

### Build
```bash
npm run build -w @jurnapod/{workspace}
```

---

## References

- **ADR-0014 Package Boundary Policy:** `docs/adr/ADR-0014-package-boundary-policy.md`
- **Epic Specification:** {Link to epic spec}
- **Related Sprint Plans:** {Links to prior sprint plans}
