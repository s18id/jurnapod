<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0009: Location Model - Phase 0

## Status
Accepted

## Context
Jurnapod currently models physical business locations using the `outlet` entity. As the business grows beyond a single office, we need to clarify the location model and establish a clear expansion path.

Business questions that arose:
- Should we rename `outlet` to `branch`?
- Do we need a hierarchy (company -> branch -> outlet)?
- How do we handle multiple cities?

## Decision
For Phase 0 (single to multi-office), adopt the following location model:

### Entity Definitions

| Term | System Entity | User-Facing | Scope |
|------|--------------|-------------|-------|
| **Company** | `companies` | Company | Tenant boundary, full data isolation |
| **Outlet** | `outlets` | Branch (Outlet) | Operational location (POS, stock, journals, access control) |
| **Area/Region** | TBD (Phase 1) | Area/Region | Optional grouping for reporting (future) |

### Key Decisions

1. **Outlet = Branch (operational location)**
   - Technical term: `outlet`
   - Business term: "Branch (Outlet)" for user-facing copy
   - Rationale: Outlet already carries full operational semantics (POS, sync, journals, ACL). No rename needed.

2. **No intermediate "branch" entity yet**
   - Only add if branch-level governance is required (separate P&L, manager, tax ID, approval workflows).
   - Current outlet model already supports multi-location operations.

3. **No Area/Region entity in Phase 0**
   - Defer to Phase 1 when:
     - 2+ cities are in operation, OR
     - 5+ outlets exist across multiple locations
   - Phase 1 will add `areas` table with FK from `outlets.area_id`

### Outlets Table (Current)

```sql
CREATE TABLE outlets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,        -- e.g., 'JKT-MAIN', 'SBY-01'
  name VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outlets_company_code (company_id, code)
);
```

### Naming Convention

- **Code format**: `{CITY}-{SITE}` (uppercase, hyphen-separated)
- Examples: `JKT-MAIN`, `SBY-01`, `BDG-CENTRAL`
- Rationale: Human-readable, sortable, unique per company

## Consequences

### Positive
- No schema migration needed for Phase 0.
- Existing POS sync and journal posting flows unchanged.
- Simple onboarding for second office (create outlet, assign users).
- Clear terminology: "outlet" in code, "Branch (Outlet)" in UI.

### Negative
- Area-level reporting requires Phase 1 upgrade.
- If branch-level governance is needed later, migration path required.

### Neutral
- No change to API contracts (`/api/outlets` remains).
- No change to RBAC model (outlet-scoped roles already exist).

## Trigger for Phase 1

Implement Phase 1 (Areas) when any of:
- Operating in 2+ cities
- 5+ outlets across different locations
- Business requirement for area-level reporting/dashboards

## Related Documents
- `docs/plans/branches-phase0-readiness-plan.md` - Phase 0 implementation plan
- `docs/guides/outlet-expansion-runbook.md` - Step-by-step new outlet onboarding
- `docs/plans/areas-phase1-implementation.md` - Phase 1 design (future)
