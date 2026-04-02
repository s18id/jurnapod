# ADR-0014: Package Boundary Policy for API Detachment

## Status

Proposed

## Context

The API Detachment initiative requires domain logic to become reusable, testable, and independent from HTTP transport/framework concerns.

Historically, package boundaries were occasionally bypassed (for example, package code reaching into `apps/api` helpers), creating tight coupling that made refactoring, isolated testing, and multi-runtime reuse difficult.

This policy exists to:

- Protect clean package layering in the monorepo
- Prevent cyclic dependencies across domains
- Keep accounting and sync invariants stable during migration
- Ensure domain packages remain framework-agnostic and transport-agnostic
- Enable controlled rollout from API-owned logic to package-owned logic

## Decision

### 1) Layer Hierarchy is Canonical

Imports must follow this direction only (bottom to top):

```text
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

`apps/api` may compose and adapt package APIs for HTTP, but packages must not depend on `apps/api`.

### 2) Import Rules

1. `packages/**` must never import from `apps/**`.
2. `@jurnapod/modules-accounting` must not import `@jurnapod/modules-sales`.
3. `@jurnapod/modules-sales` may depend on `@jurnapod/modules-accounting` (one-way dependency).
4. Domain packages must not import API route/middleware/auth helpers.
5. Domain ACL decisions must use an injected ACL interface/port, not route-layer auth modules.
6. `@jurnapod/pos-sync` may depend on domain modules, but domain modules must not depend on `@jurnapod/pos-sync` or transport concerns in `@jurnapod/sync-core`.
7. `@jurnapod/notifications` receives resolved configuration via injection; module settings/platform remain the source of values.
8. Telemetry inside packages must remain framework-agnostic; Hono middleware adapters stay in `apps/api`.

### 3) Boundary Style

- Use ports/interfaces in domain packages for auth/ACL/config/time/telemetry integration points.
- Keep adapter implementations (Hono middleware, request context extraction, route auth guards) in `apps/api`.
- Keep domain service signatures explicit, with dependencies injected as interfaces.

## Consequences

### Positive

- Clear dependency graph and lower risk of cyclical imports.
- Improved testability (domain logic testable without HTTP app bootstrapping).
- Better reuse across API, sync processors, and potential future workers/CLIs.
- Reduced framework lock-in by confining Hono-specific code to the app layer.
- Stronger migration safety for API detachment and package extraction.

### Negative / Costs

- More interface definitions and dependency wiring at composition boundaries.
- Potential short-term duplication while extracting route-coupled logic.
- Stricter lint/path rules may surface many existing violations that require phased cleanup.
- Additional review discipline required to maintain one-way domain dependencies.

## Anti-Patterns to Avoid (Forbidden Imports)

The following are explicitly forbidden:

1. Any `packages/**` import from `apps/**`.
   - Example: `packages/modules/sales/src/* -> apps/api/src/lib/auth-guard`
2. Any domain package import from API route/middleware helpers.
   - Example: `packages/modules/*/src/* -> apps/api/src/routes/**`
3. `@jurnapod/modules-accounting` importing `@jurnapod/modules-sales`.
4. Domain packages importing sync transport runtime modules.
   - Example: `packages/modules/*/src/* -> @jurnapod/pos-sync` or `@jurnapod/sync-core` transport adapters
5. Notifications package reading platform/settings directly instead of receiving resolved values via injected config provider.
6. Package-level telemetry depending on Hono-specific middleware/request context types.

## Enforcement Mechanism

1. **ESLint boundary rules (mandatory):**
   - Configure `no-restricted-imports` (or equivalent boundaries plugin) with path-group bans:
     - Ban `apps/**` from all `packages/**`
     - Ban `@jurnapod/modules-sales` in accounting package
     - Ban API route/middleware/auth paths in domain packages
     - Ban sync transport packages from domain packages

2. **TypeScript project references and path constraints:**
   - Use explicit `references` and package-level `tsconfig` ownership to encode allowed dependency directions.
   - Do not expose private/internal adapter paths through public exports.
   - Restrict package `exports` to domain-safe entrypoints.

3. **CI gates:**
   - Lint must fail on boundary violations.
   - Typecheck/build pipeline must run per workspace with dependency order consistent with the hierarchy.
   - Architecture review checklist must include boundary verification for changed package imports.

4. **Code review policy:**
   - Any new cross-layer dependency requires ADR update or explicit architecture exception.
   - Exceptions are time-boxed and tracked as technical debt with owner and sunset date.

## Migration Guard: Sync Protocol Invariants

During and after API detachment, the sync protocol/storage invariants are non-negotiable:

1. Pull request cursor field remains `since_version`.
2. Pull response cursor field remains `data_version`.
3. Runtime sync version source of truth remains `sync_versions`.
4. No runtime reintroduction of legacy tables `sync_data_versions` or `sync_tier_versions`.
5. No alias protocol fields (for example `sync_data_version`) without an approved, versioned migration ADR.

These constraints apply to API routes, package interfaces, sync consumers, and migration code.

## Rollout Notes

- Apply enforcement in phases: warn mode for baseline discovery, then fail mode per package group.
- Prioritize boundary hardening for accounting, sales, and sync-related packages first due to highest correctness risk.
- Track remediation tasks per package and close with lint/typecheck evidence.
