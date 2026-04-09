# Epic 36: OpenAPI Documentation & Swagger UI

## Status

**done**

## Epic Goal

Implement interactive API documentation with Scalar UI, full OpenAPI 3.0 coverage for all routes, and a smart regenerator for new route scaffolding.

## Context

The API currently has no interactive documentation. Developers and API consumers have no discoverable way to understand the API surface beyond reading route files. This epic adds:

1. **Scalar UI** - Modern API reference tool at `/swagger`
2. **OpenAPI 3.0 spec** - Machine-readable spec at `/swagger.json`
3. **Full route documentation** - All ~20+ route groups annotated with `openapi()` metadata
4. **Smart regenerator** - CLI tool that auto-scaffolds OpenAPI metadata for new routes using Zod schema introspection

## FR Coverage

| FR | Description | Story |
|----|-------------|-------|
| FR1 | API documentation via UI at /swagger | 36.1 |
| FR2 | OpenAPI 3.0 spec at /swagger.json | 36.1 |
| FR3 | Scalar API reference tool | 36.1 |
| FR4 | openapi() metadata on all routes | 36.2-36.6 |
| FR5 | Bearer token security scheme | 36.1 |
| FR6 | Documentation in non-production only | 36.1 |
| FR7 | Full route coverage | 36.2-36.6 |
| FR8 | Regenerator tool for new routes | 36.7 |
| FR9 | Smart Zod schema introspection | 36.7 |
| FR10 | PR-reviewed scaffold output | 36.7 |

## Technical Notes

- Uses existing `@hono/zod-openapi` dependency in `apps/api/package.json`
- Scalar via `@scalar/hono-api-reference`
- Bearer JWT auth in security scheme
- All routes under `/api/*` prefix
- NODE_ENV check hides docs in production

## Stories

- [Story 36.1](story-36.1.md): Infrastructure & Config
- [Story 36.2](story-36.2.md): Auth & Health Routes
- [Story 36.3](story-36.3.md): Sync & POS Routes
- [Story 36.4](story-36.4.md): Sales & Accounting Routes
- [Story 36.5](story-36.5.md): Inventory & Settings Routes
- [Story 36.6](story-36.6.md): Remaining Routes
- [Story 36.7](story-36.7.md): OpenAPI Regenerator
- [Story 36.8](story-36.8.md): Extract OpenAPI Spec to JSON File
- [Story 36.9](story-36.9.md): Auto-Generation Proof-of-Concept (Health + Auth)
- [Story 36.10](story-36.10.md): Expand Auto-Generation to All Routes

## Definition of Done

- [x] `/swagger` serves Scalar UI in non-production
- [x] `/swagger.json` returns valid OpenAPI 3.0 spec
- [x] All route files have `openapi()` metadata
- [x] `npm run generate:openapi-scaffold` works with Zod introspection
- [x] Regenerator skips existing openapi() wrapped routes
- [x] `npm run typecheck -w @jurnapod/api` passes
- [x] `npm run build -w @jurnapod/api` succeeds

## Retrospective

See [epic-36.retrospective.md](epic-36.retrospective.md) for full PARTY MODE retrospective including:
- Team consensus on what went well and what could be improved
- Action items with owners and priorities
- Lessons learned for future epics
- Agent Coordination Protocol establishment