# Story 6.7: Epic 5 Follow-Up Actions

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to complete the follow-up actions identified in Epic 5 retrospective**,
So that **the import/export feature is fully complete and ready for production use**.

## Context

Epic 5 retrospective identified specific follow-up actions that weren't completed:
- Integration tests for import/export API
- UI completeness: column reordering, row preview, retry
- ADR-0010 update

## Acceptance Criteria

**AC1: Integration Tests (P1)**
- Add API-level integration tests for import/export endpoints
- Cover: upload → validate → apply flow
- Cover: export with filters

**AC2: UI Completeness (P2)**
- Add column reordering in export UI
- Add row count preview before export
- Add retry option on export errors

**AC3: Epic 5 ADR Update**
- Mark completed follow-ups in ADR-0010
- Update status of remaining debt items

## Tasks

- [ ] Add integration tests for item import API
- [ ] Add integration tests for price import API
- [ ] Add integration tests for item export API
- [ ] Add integration tests for price export API
- [ ] Add column reordering to export dialog
- [ ] Add row count preview to export dialog
- [ ] Add retry button on export errors
- [ ] Update ADR-0010 with completed items

## Estimated Effort

2 days

## Risk Level

Low (feature completion)

## Dependencies

None (can run in parallel with other Epic 6 stories)
