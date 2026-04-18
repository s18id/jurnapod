# ADR-0001: Backoffice Auth Token Centralization in `apiRequest`

**Date:** 2026-04-13  
**Status:** Accepted  
**Deciders:** Ahmad, Architect

## Decision Summary

Centralize backoffice bearer token resolution inside `apiRequest()` so UI layers no longer pass `accessToken` through Router → Pages → Components → Hooks.

Target API shape:

```ts
apiRequest(path, init?, options?)
```

Where `apiRequest` resolves auth internally by default from canonical auth storage and preserves current 401 refresh+retry behavior.

During migration, existing callers passing token explicitly remain supported (backward-compatible bridge).

---

## Context and Problem Statement

The backoffice currently forwards `accessToken` as a prop and function parameter across multiple layers:

- Router state stores token and passes to every route screen
- Page components require `accessToken` props
- Child components and hooks accept/pass token
- Most `apiRequest()` calls pass token as the third argument

This has created architectural and maintenance issues:

1. **Large plumbing surface area**
   - Repo scan shows heavy token spread (`accessToken` appears across ~80 files in `apps/backoffice/src`, with hundreds of occurrences)
   - Every new feature repeats token wiring

2. **Type safety drift risk**
   - Session token source and `SessionUser` model are separate concepts
   - Passing token through user-centric props encourages accidental shape assumptions and coupling

3. **Boundary leakage**
   - Authentication concern leaks into presentational and domain UI layers
   - Hooks/components become less reusable because auth transport details are embedded in signatures

4. **Refactor friction**
   - Changing auth behavior (refresh semantics, token source) currently requires touching many files

### Current Auth Storage and Request Behavior (Observed)

From current implementation:

- `auth-storage.ts`
  - Access token is **memory-only** (`inMemoryAccessToken`), no localStorage persistence
  - E2E override supported through `window.__E2E_ACCESS_TOKEN__`
- `session.ts`
  - `login` / `loginWithGoogle` store token in memory and fetch user profile
  - `refreshAccessToken()` POSTs `/auth/refresh` with `credentials: "include"` and stores new token
- `auth-refresh.ts`
  - `requestRefreshToken()` deduplicates concurrent refresh requests via `refreshPromise`
- `api-client.ts`
  - Uses explicit `accessToken` argument for `Authorization` header
  - On 401, calls `requestRefreshToken()` and retries once

This architecture already has a canonical token source (auth-storage), but the UI still redundantly threads token as input.

---

## Decision

### 1) Centralize token resolution in `apiRequest`

`apiRequest` becomes the canonical auth boundary for outbound API calls.

Default behavior:

1. Build request headers
2. Resolve token internally (see resolution order below)
3. Attach `Authorization: Bearer <token>` when available
4. Execute fetch with `credentials: "include"`
5. On 401, run refresh flow and retry once (unchanged behavior)

### 2) Canonical token resolution order

Resolution order inside `apiRequest`:

1. **Explicit request override** (temporary migration bridge)
   - If caller supplies token explicitly (legacy third arg or `options.accessToken`), use it first
2. **Pre-existing Authorization header**
   - If `init.headers` already includes `authorization`, do not overwrite
3. **Auth storage token**
   - Use `getStoredAccessToken()` (includes E2E override and in-memory token)
4. **No token available**
   - Send request without bearer token; refresh still handled on 401 via cookie

401 path:

- If response is 401 and call is not retry attempt:
  - call `requestRefreshToken()`
  - if refresh returns token, retry exactly once with refreshed token
  - if refresh fails, throw existing `ApiError`

This preserves current behavior contract (refresh + one retry).

### 3) Backward compatibility contract

`apiRequest` supports both signatures during migration:

```ts
// Legacy
apiRequest(path, init?, accessToken?)

// New
apiRequest(path, init?, options?)
```

`options` includes:

- `accessToken?: string` (temporary override)
- `skipAuth?: boolean` (optional for public endpoints where auth header must never be attached)

No immediate breaking change to existing callers.

---

## Decision Rationale

1. **Single responsibility and cleaner boundaries**
   - Auth transport concern belongs in API client layer, not UI composition

2. **Lower migration risk**
   - Keeps refresh mechanics unchanged and centralized
   - Legacy signature avoids big-bang refactor

3. **Type stability**
   - Removes pressure to co-locate token with `SessionUser` data model

4. **Future extensibility**
   - Enables adding token introspection, tracing, diagnostics, and auth policies in one place

Alternatives considered:

- **Keep prop drilling**: rejected due to maintenance cost and coupling
- **React Context token provider**: helps UI but still leaks auth concern into hooks unless every call site migrates; API-boundary centralization is cleaner and simpler
- **Global fetch interceptor only**: less explicit than `apiRequest` and can conflict with current typed error handling

---

## Implementation Plan (Phased)

### Phase 0 — Preparation and Guardrails

1. Document ADR and migration policy (this document)
2. Add temporary telemetry/log signal (dev-only) for legacy signature usage count
3. Identify public endpoints that should use `skipAuth` (if needed)

### Phase 1 — `apiRequest` compatibility bridge

1. Extend `apiRequest` to accept overloaded third argument:
   - `string` (legacy token)
   - `ApiRequestOptions` (new)
2. Implement canonical token resolution order
3. Keep 401 refresh and retry semantics exactly as today
4. Ensure existing tests pass unchanged

### Phase 2 — Leaf migration (hooks/services first)

1. Update hooks and service helpers to stop requiring `accessToken` parameter
2. Replace `apiRequest(..., token)` with `apiRequest(..., options?)` or no third argument
3. Preserve behavior in route transitions and async effects

### Phase 3 — Component and page prop contract cleanup

1. Remove `accessToken` from component/page prop types
2. Remove pass-through token props in intermediate components
3. Keep router auth state only where truly needed (session lifecycle), not for request plumbing

### Phase 4 — Router simplification

1. Remove token forwarding in `RouteScreen` and page rendering
2. Keep only session/authentication gate checks
3. Verify bootstrapping still works (memory token, refresh cookie fallback)

### Phase 5 — Breaking-change completion

1. Mark legacy `apiRequest(..., string)` signature as deprecated
2. Add lint rule/codemod enforcement to block new explicit token pass-through
3. Remove legacy signature in a planned major cleanup PR

---

## Backward Compatibility and Breaking Change Signal

### Temporary compatibility

- Legacy token argument support remains until all call sites are migrated
- Existing behavior and request outcomes must stay identical

### Breaking-change signal

Breaking change is considered active only when all are true:

1. Legacy usage count reaches zero
2. Deprecation warning has shipped for at least one development cycle
3. Migration notes are published in changelog / developer docs

Then remove legacy third-arg token support.

---

## Migration Scope and Sequencing Guidance

Expected scope is broad:

- Pages: ~40+
- Hooks: ~15–20
- Intermediate components: many pass-through contracts

Recommended sequencing to minimize regressions:

1. Migrate hooks with highest fan-out first
2. Then migrate pages that depend on those hooks
3. Finally remove pass-through props in shared layout/router components

This sequence collapses dependency churn and reduces merge conflict risk.

---

## Interface and Boundary Changes

### API Client Boundary

Introduce a typed options object:

```ts
type ApiRequestOptions = {
  accessToken?: string; // temporary migration override
  skipAuth?: boolean;
};
```

`apiRequest` is the **only** layer responsible for:

- token lookup
- auth header attachment
- refresh/retry semantics

### UI Boundaries

Components/hooks must not require `accessToken` unless a documented exception exists.

### Session Boundary

`session.ts` remains source for login/bootstrap lifecycle and token storage updates; request-time auth handling lives in `api-client.ts`.

---

## Consequences

### Positive

- Dramatic reduction in prop drilling and call-site boilerplate
- Clear architectural ownership of auth transport
- Lower risk of type mismatches and accidental token/user coupling
- Easier onboarding and feature development in backoffice

### Negative / Tradeoffs

- Temporary dual-signature complexity in `apiRequest`
- Migration touches many files and can cause noisy diffs
- Requires disciplined cleanup to avoid permanently retaining compatibility shim

### Neutral

- Refresh cookie and 401 retry behavior remains unchanged
- Memory-only token storage model remains unchanged

---

## Risks and Mitigations

1. **Risk:** Hidden unauthenticated requests after removal of explicit token params  
   **Mitigation:** integration tests for representative protected endpoints; verify Authorization presence in request mocks/inspection layers.

2. **Risk:** Double-auth header logic conflicts  
   **Mitigation:** deterministic precedence (explicit override > existing header > storage).

3. **Risk:** Migration stalls with mixed patterns  
   **Mitigation:** add tracking checklist and deprecation warnings; enforce in lint after majority migration.

4. **Risk:** Refresh race conditions  
   **Mitigation:** keep existing `refreshPromise` dedup mechanism unchanged.

---

## Validation / Implementation Readiness Checklist

- [ ] `apiRequest` supports overload + options object
- [ ] Resolution order implemented exactly as specified
- [ ] 401 refresh+retry preserved (single retry)
- [ ] No regressions in login/bootstrap/session refresh flows
- [ ] High-traffic page/hook paths migrated and tested
- [ ] Router no longer passes `accessToken` to route pages
- [ ] Legacy signature deprecation warnings in place

---

## Out of Scope

- Changing storage from memory-only to persistent browser storage
- Altering refresh endpoint contract
- Reworking auth domain model beyond request-token centralization
