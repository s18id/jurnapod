# Epic 32 Sprint Plan

## Overview

**Epic:** Financial Period Close & Reconciliation Workspace
**Duration:** 1 sprint
**Goal:** Operationalize period-end financial workflows using Epic 30 observability.

## Story Dependencies

```
32.1 (fiscal year close)
  └── 32.2 (multi-period reconciliation) ── sequential
        └── 32.3 (trial balance validation) ── sequential
              ├── 32.4 (period transition audit) ── parallel
              └── 32.5 (roll-forward workspace) ── sequential
```

## Sprint Breakdown

### Story 32.1: Fiscal Year Close Procedure
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Lock fiscal year, enforce closing sequence, generate closing journal entries (manual approval)

### Story 32.2: Multi-Period Reconciliation Dashboard
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 32.1
- **Focus:** GL vs subledger reconciliation view, period-over-period comparison, Epic 30 metrics wired in

### Story 32.3: Trial Balance Validation with Variance Reporting
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 32.2
- **Focus:** Pre-close validation, variance thresholds, gl_imbalance_detected_total check

### Story 32.4: Period Transition Audit Trail
- **Estimate:** 3h
- **Priority:** P2
- **Dependencies:** 32.1 (parallel)
- **Focus:** Audit log for period changes, compliance recording, who/when/what

### Story 32.5: Roll-Forward Workspace UI
- **Estimate:** 5h
- **Priority:** P2
- **Dependencies:** 32.3
- **Focus:** Interactive workspace (TUI/admin dashboard) for period close workflow

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Closing entries affect reporting | Manual approval required; no auto-post |
| 2 | Period lock prevents legitimate corrections | Unlock procedure with audit trail |
| 3 | Variance thresholds too tight/loose | Configurable per company in `settings` |

---

## Validation Commands

### Story 32.1
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 32.2
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 32.3
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 32.4
```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

### Story 32.5
```bash
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
```
