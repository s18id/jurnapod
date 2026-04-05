# Story 36.4: Lift Route Orchestration into Package Services

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-36.4 |
| Title | Lift Route Orchestration into Package Services |
| Status | pending |
| Type | Extraction |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 8-10h |

## Story

As a platform engineer, I want to move business orchestration from routes into package façade services, so that import/export workflows are reusable, testable, and not tightly coupled to HTTP concerns.

## Background

Currently `routes/import.ts` and `routes/export.ts` contain significant business logic: checkpoint/resume decisions, entity mapping, generation type decisions, batch processing orchestration. This violates the thin-adapter principle and prevents reuse. This story lifts that orchestration into façade services within the platform package.

## Acceptance Criteria

1. Created `ImportService` façade in platform package
2. Created `ExportService` façade in platform package
3. Moved checkpoint/resume logic from `routes/import.ts` to `ImportService`
4. Moved entity mapping and generation decisions from `routes/export.ts` to `ExportService`
5. Moved `batch-processor.ts` and `batch-operations.ts` orchestration logic into service methods
6. ImportService handles: create session → parse → validate → apply → checkpoint → complete
7. ExportService handles: create session → query → transform → stream → complete
8. Package services accept `db: KyselySchema` and optional `{ audit?: AuditPort }`
9. `npm run typecheck -w @jurnapod/modules-platform` passes

## Technical Notes

- Façade services should be the public API for import/export workflows
- Service pattern: `class ImportService { constructor(deps: { db: KyselySchema, audit?: AuditPort }) }`
- Methods should be workflow-oriented: `upload()`, `validate()`, `apply()`, `getStatus()`, `resume()`
- Keep services focused on orchestration; delegate actual work to existing import/export core modules
- Workflow state machine should be clear and handle: PENDING → PARSING → VALIDATING → APPLYING → COMPLETED/FAILED
- Include checkpoint logic for resumable imports
- Export should support: FULL_DATA, TEMPLATE, COLUMNS modes

## Tasks

- [ ] Create `packages/modules/platform/src/import-export/services/` directory
- [ ] Create `ImportService` class with workflow methods
- [ ] Create `ExportService` class with workflow methods
- [ ] Move checkpoint/resume logic from `routes/import.ts` to `ImportService`
- [ ] Move entity mapping logic from `routes/import.ts` to `ImportService`
- [ ] Move generation type decisions from `routes/export.ts` to `ExportService`
- [ ] Move batch orchestration from `batch-processor.ts` into service methods
- [ ] Wire existing import/export core modules (parsers, validators, query-builder, etc.) into services
- [ ] Ensure services accept `db: KyselySchema` and optional audit port
- [ ] Verify `npm run typecheck -w @jurnapod/modules-platform` passes

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
```

Services should have clear workflow methods; no HTTP concerns (req/res objects) in package services.
