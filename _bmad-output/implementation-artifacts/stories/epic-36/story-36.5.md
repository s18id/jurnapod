# Story 36.5: Convert API Routes to Thin Adapters

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-36.5 |
| Title | Convert API Routes to Thin Adapters |
| Status | pending |
| Type | Refactor |
| Sprint | TBD |
| Priority | P2 |
| Estimate | 4-6h |

## Story

As a platform engineer, I want to make API routes thin adapters that only handle HTTP concerns, so that business logic is properly isolated in the platform package and routes remain simple HTTP glue code.

## Background

With Stories 36.1-36.4 complete, the import/export infrastructure now lives in `@jurnapod/modules-platform` with façade services. This story refactors `routes/import.ts` and `routes/export.ts` to delegate all business logic to those services, becoming thin HTTP adapters that only handle auth, parsing, validation, and response shaping.

## Acceptance Criteria

1. `routes/import.ts` keeps only HTTP concerns (multipart parsing, auth guard, Zod validation, HTTP status/headers)
2. `routes/export.ts` keeps only HTTP concerns (request parsing, auth guard, Zod validation, HTTP status/headers, Content-Disposition)
3. All business logic in routes delegates to `ImportService` or `ExportService`
4. Deleted backward-compat wrappers from `apps/api/src/lib/import/` and `lib/export/`
5. Routes are under 100 LOC each
6. `npm run typecheck -w @jurnapod/api` passes
7. API contracts (request/response envelopes) remain backward-compatible

## Technical Notes

- Route responsibilities (keep in routes):
  - Authentication/authorization middleware
  - HTTP request parsing (body, query, params)
  - Zod validation of incoming payloads
  - HTTP status code mapping
  - Response headers (Content-Type, Content-Disposition)
  - Error response shaping
  
- Delegate to service (move from routes):
  - Session creation and management
  - Checkpoint/resume logic
  - Entity mapping
  - Generation type decisions
  - Batch processing orchestration
  - Streaming response handling

- If API contract stability is needed, wrapper layer can be kept temporarily behind a feature flag

## Tasks

- [ ] Refactor `routes/import.ts` to delegate all business logic to `ImportService`
- [ ] Refactor `routes/export.ts` to delegate all business logic to `ExportService`
- [ ] Remove HTTP concerns from service calls (services return data, not HTTP responses)
- [ ] Delete `apps/api/src/lib/import/` wrapper directory (or keep if contract needs stability)
- [ ] Delete `apps/api/src/lib/export/` wrapper directory (or keep if contract needs stability)
- [ ] Verify routes are under 100 LOC each
- [ ] Run `npm run typecheck -w @jurnapod/api` to verify
- [ ] Run existing tests to ensure API contract compatibility

## Validation

```bash
npm run typecheck -w @jurnapod/api
```

Routes should be thin adapters with minimal logic; business workflow in package services.
