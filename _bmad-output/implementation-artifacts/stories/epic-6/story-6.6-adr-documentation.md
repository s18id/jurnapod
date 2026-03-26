# Story 6.6: ADR Documentation & Debt Registry

**Status:** backlog

## Story

As a **Jurnapod architect**,
I want **to establish a systematic approach to tracking technical debt**,
So that **debt is visible, prioritized, and actively managed across epics**.

## Context

As the codebase matures (6 epics completed), technical debt needs active tracking. ADR-0010 was created for Epic 5 but there's no systematic approach.

## Acceptance Criteria

**AC1: Debt Registry**
- Create `docs/adr/TECHNICAL-DEBT.md` as living debt registry
- Catalog all known debt items across all epics
- Link to specific ADRs for detailed tracking

**AC2: Review Process**
- Document process for adding new debt items
- Define priority levels (P1/P2/P3)
- Set review cadence

**AC3: Debt Prevention**
- Add debt items to story templates as checkboxes
- Require debt review before closing epics

## Tasks

- [ ] Create `docs/adr/TECHNICAL-DEBT.md` template
- [ ] Catalog all known debt from Epics 0-5
- [ ] Define priority levels and review process
- [ ] Update story template with debt checkbox
- [ ] Add debt review step to epic close process

## Estimated Effort

1 day

## Risk Level

None (process improvement)

## Dependencies

None
