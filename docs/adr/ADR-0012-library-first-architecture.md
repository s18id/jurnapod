# ADR-0012: Library-First Architecture for API Routes

## Status

Accepted

## Context

API routes were mixing HTTP handling with database operations, leading to:

- Inconsistent patterns across routes
- Difficult to test routes (required database setup)
- Duplicated SQL queries
- Routes that were too large and complex

## Decision

All database operations must go through library modules in `lib/`.

Routes are thin HTTP handlers that:

1. Validate input (Zod schemas)
2. Call library functions
3. Format responses
4. Handle HTTP-specific errors

## Consequences

### Positive

- Routes are simple and testable
- Business logic is reusable
- Consistent error handling
- Easier to migrate to Kysely later

### Negative

- More files to maintain
- Additional layer of abstraction
- Need discipline to not add SQL to routes

## Implementation

Epic 12 standardized all routes to use libraries:

- Created missing libraries (settings-modules, sync/check-duplicate)
- Extended existing libraries (export)
- Refactored 7 routes to use libraries

## References

- Epic 12: Standardize Library Usage for All Routes
- `apps/api/src/lib/TEMPLATE.md`