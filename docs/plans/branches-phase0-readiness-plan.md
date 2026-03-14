# Branches Phase 0 Readiness Plan

## Overview

Phase 0 establishes the location model for Jurnapod without introducing new entities. It locks terminology, codifies conventions, and creates the operational foundation for expanding to multiple offices.

**Status:** Ready for Implementation  
**Scope:** Terminology, conventions, runbooks, documentation  
**Dependencies:** None (no DB/API changes)

---

## Scope

### What Phase 0 Includes
- [ ] ADR: Location Model (ADR-0009)
- [ ] Terminology alignment (internal vs. user-facing)
- [ ] Outlet naming convention
- [ ] Expansion runbook (step-by-step new outlet onboarding)
- [ ] Operational checklist for multi-outlet readiness

### What Phase 0 Does NOT Include
- No new database tables (`areas`, `branches`)
- No changes to API contracts
- No changes to POS sync or idempotency
- No changes to journal/posting flows
- No new RBAC modules

---

## Deliverables

### 1. ADR: Location Model (Phase 0)
**File:** `docs/adr/ADR-0009-location-model-phase0.md`  
**Status:** ✅ Complete

Key decisions:
- `outlet` = operational location (technical term)
- User-facing: "Branch (Outlet)"
- No branch/area entity in Phase 0
- Trigger for Phase 1: 2+ cities OR 5+ outlets

### 2. Outlet Naming Convention
**Pattern:** `{CITY}-{SITE}` (uppercase, hyphen-separated)

| Example | City | Site |
|---------|------|------|
| `JKT-MAIN` | Jakarta | Main office |
| `SBY-01` | Surabaya | Outlet 1 |
| `BDG-CENTRAL` | Bandung | Central branch |

**Rules:**
- Unique per company
- Cannot be changed after creation (code is immutable)
- Use ISO 3166-2 city codes where possible (JKT, SBY, BDG)

### 3. Expansion Runbook
**File:** `docs/guides/outlet-expansion-runbook.md`

Step-by-step guide to open a new office/outlet:
1. Create outlet
2. Assign users with outlet roles
3. Configure module permissions
4. First POS sync pull at new outlet
5. Smoke test (sample transaction, journal verification)

### 4. Operational Checklist
**Included in:** Expansion runbook

Pre-flight checks:
- [ ] Company exists and is active
- [ ] No duplicate outlet code
- [ ] User accounts created with correct roles
- [ ] Module permissions assigned to roles
- [ ] POS devices can reach sync endpoint
- [ ] First sync pull succeeds
- [ ] Sample transaction posts to journal correctly

---

## Terminology Alignment

### Internal (Code/Database)
- `outlet` - Primary entity for physical locations
- `outlets` table - Location master data
- `/api/outlets` - REST endpoint

### User-Facing (UI/Reports)
- "Branch (Outlet)" or "Outlet/Branch"
- Example: "Manage Branches" page title

### Documentation
- Technical docs: use "outlet"
- User guides: use "Branch (Outlet)"
- Runbooks: explain both, map clearly

---

## Acceptance Criteria

### Must Pass
- [ ] No schema migration added
- [ ] No API contract changes
- [ ] POS sync behavior unchanged (`client_tx_id` idempotency preserved)
- [ ] Journal posting unchanged
- [ ] RBAC model unchanged

### Should Pass
- [ ] Runbook covers all steps to add new outlet
- [ ] Terminology is consistent across ADR + plan + runbook
- [ ] Naming convention documented and followed

### Nice to Have
- [ ] Backoffice UI labels show "Branch (Outlet)" in key places
- [ ] Help text explains outlet = branch for non-technical users

---

## Future Path: Phase 1 (Areas)

When Phase 1 is triggered (2+ cities or 5+ outlets):

### Schema Change
```sql
-- Add areas table
CREATE TABLE areas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  ...
  PRIMARY KEY (id),
  UNIQUE KEY uq_areas_company_code (company_id, code)
);

-- Add FK to outlets (nullable for safe rollout)
ALTER TABLE outlets ADD COLUMN area_id BIGINT UNSIGNED DEFAULT NULL;
ALTER TABLE outlets ADD CONSTRAINT fk_outlets_area FOREIGN KEY (area_id) REFERENCES areas(id);
```

### API Changes
- New `/api/areas` CRUD endpoints
- Extend `/api/outlets` to include `area_id`

### UI Changes
- New "Areas" management page
- Outlet create/edit form with area selector
- Area filter in reports

### Full Plan
See: `docs/plans/areas-phase1-implementation.md`

---

## Owner Checklist

Before expanding to office #2:

- [ ] Review ADR-0009 for terminology lock
- [ ] Follow naming convention for outlet code
- [ ] Execute expansion runbook end-to-end
- [ ] Verify POS sync pull at new outlet
- [ ] Verify journal shows correct outlet_id
- [ ] Verify user can access new outlet
- [ ] Document any deviations from runbook

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Terminology confusion | Medium | Consistent ADR + UI labels |
| No area grouping for reporting | Low | Accept until Phase 1 |
| Outlet code collision | Medium | Check uniqueness before create |
| POS sync failure at new outlet | High | Verify network + sync pull in runbook |

---

## Related Documents

- `docs/adr/ADR-0009-location-model-phase0.md` - Decision record
- `docs/guides/outlet-expansion-runbook.md` - Operational runbook
- `docs/plans/areas-phase1-implementation.md` - Future Phase 1 design
