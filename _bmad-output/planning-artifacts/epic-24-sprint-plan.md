# Epic 24 Sprint Plan

## Overview
**Epic:** Inventory Costing Boundary
**Duration:** 2-3 sprints
**Goal:** Extract cost-tracking logic to establish clean inventory/accounting boundary

## Sprint 1: Package Scaffold + Costing Extraction

### Story 24-1: Create `@jurnapod/modules-inventory-costing` package scaffold
- **Estimate:** 2h
- **Priority:** P2
- **Dependencies:** None

### Story 24-2: Extract `cost-tracking.ts` to costing package
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 24-1

## Sprint 2: Integrate Costing Package

### Story 24-3: Update `lib/stock.ts` to use costing package
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 24-2

### Story 24-4: Update COGS posting to use costing contract
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 24-3

## Sprint 3: Validation + Cleanup

### Story 24-5: Update sync-push stock handlers
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 24-4

### Story 24-6: Full validation gate
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** 24-5

## Critical Path
```
24-1 → 24-2 → 24-3 → 24-4 → 24-5 → 24-6
```

## Capacity Planning
- Sprint 1: 6h (2 + 4)
- Sprint 2: 6h (3 + 3)
- Sprint 3: 5h (3 + 2)
- **Total:** 17h across 3 sprints

## Pre-requisites
- Epic 23 modules-inventory stable
- Epic 23 modules-accounting stable

## Completion Status (2026-04-03)
- 24-1 ✅ done
- 24-2 ✅ done
- 24-3 ✅ done
- 24-4 ✅ done
- 24-5 ✅ done
- 24-6 ✅ done
- Epic 24 ✅ done
