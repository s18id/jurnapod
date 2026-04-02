# story-23.0.1: Author package dependency policy ADR

**Story ID:** ADB-0.1  
**Epic:** [Epic 23: API Detachment](./epic-23.md)  
**Phase:** 0 (Pre-flight)  
**Priority:** P1  
**Estimate:** 2h

---

## Goal

Create an Architecture Decision Record (ADR) that establishes the package dependency policy and boundary rules for Epic 23: API Detachment. This ADR provides the architectural guardrails that all subsequent extraction work must follow.

---

## Acceptance Criteria

- [ ] ADR created at `docs/adr/adr-0014-api-detachment-boundary-policy.md`
- [ ] ADR defines allowed/forbidden dependency directions for all packages and apps
- [ ] **Dependency Rules documented:**
  - `packages/**` must never import from `apps/**`
  - `modules-accounting` must not import `modules-sales` (accounting is lower layer)
  - Domain packages must use injected ACL interface, not route-layer auth imports
  - `pos-sync` may depend on domain modules, never inverse
- [ ] **Lint enforcement strategy** outlined (implementation in ADB-0.2)
- [ ] **Rationale** provided for each rule with architectural justification
- [ ] **Examples** of allowed and prohibited import patterns
- [ ] **Sync protocol invariants** documented as migration guards:
  - Pull request cursor: `since_version`
  - Pull response cursor: `data_version`
  - Storage source of truth: `sync_versions` table
- [ ] ADR references Epic 23 critical path and linked artifacts

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `docs/adr/adr-0014-api-detachment-boundary-policy.md` | Create | Package boundary policy ADR |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Update | Mark story as in_progress |

---

## Technical Notes

### ADR Structure Required

The ADR must follow the standard format:
- **Status:** Proposed (pending review)
- **Context:** Why these boundaries are needed
- **Decision:** The rules and hierarchy
- **Consequences:** Positive and negative impacts
- **Enforcement:** How rules will be validated (lint, CI, review)
- **Related Decisions:** Link to ADR-0014 (Package Boundary Policy)

### Package Dependency Hierarchy

```
@jurnapod/shared
    ↑
@jurnapod/db, @jurnapod/telemetry
    ↑
@jurnapod/auth, @jurnapod/modules-platform, @jurnapod/modules-accounting,
@jurnapod/sync-core, @jurnapod/notifications,
@jurnapod/modules-sales, @jurnapod/modules-inventory,
@jurnapod/modules-reservations, @jurnapod/modules-reporting
    ↑
apps/api (HTTP composition/adapters only)
```

### Key Constraints

1. **No reverse imports:** Packages never import from apps
2. **Accounting isolation:** Accounting cannot depend on sales (prevents cycles)
3. **ACL injection:** Domain packages receive auth context via interfaces
4. **Sync transport boundary:** Domain modules don't depend on sync transport

---

## Dependencies

- None (this is the first story on the critical path)

## Blocks

- ADB-0.2 (Add import-boundary lint constraints)
- ADB-0.3 (Scaffold new domain package workspaces)
- All Phase 1-5 stories (depend on boundary policy)

---

## Validation

```bash
# Verify ADR file exists and follows format
cat docs/adr/adr-0014-api-detachment-boundary-policy.md | head -20

# Verify sprint status updated
grep "23-0-1" _bmad-output/implementation-artifacts/sprint-status.yaml
```

---

## Dev Notes

**Created:** 2026-04-02  
**Story Type:** Architecture / Documentation  
**Risk Level:** Low (documentation only)  
**Review Required:** Yes - Architecture team approval needed before proceeding
