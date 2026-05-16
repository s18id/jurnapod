# Stable API Contract Rules

**Applies to:** All endpoints classified `stable` in `docs/api-stability-matrix.md`  
**Stability:** `stable`  
**Owner:** API/Platform (change controller)  
**CI gate:** `lint:api-contracts` (via `scripts/check-api-contract-diff.ts`)

This document defines what contributors and agents MAY or MUST NOT change on `stable` endpoints without a version bump or migration plan.

---

## Classification Definitions

### `stable`

Safe for production clients and internal app contracts. **No breaking changes allowed** unless versioned or explicitly migrated.

### `beta`

Usable internally but still allowed to change. **Breaking changes are allowed** with release notes and changelog entry.

### `internal`

Not part of the client-facing contract. **Any changes are allowed** without CI gate.

### `deprecated`

Still available but scheduled for removal. **Only allowed changes** are for removal timeline/compatibility.

---

## Allowed Without Version Bump

The following changes to `stable` endpoints do not require a version bump:

1. Add a new endpoint.
2. Add an optional request field to an existing endpoint.
3. Add a response field, unless the endpoint documents a strict response shape.
4. Add a new error detail field in `error.details`.
5. Relax validation (make required field optional).
6. Add a new `beta` endpoint.
7. Fix documentation errors.
8. Add OpenAPI schema for an existing endpoint that previously lacked it.

---

## Requires Changelog Entry

The following changes to `stable` endpoints MUST be documented in `docs/api-contracts/CHANGELOG.md`:

1. Add a new enum value.
2. Add a new documented error code.
3. Change an undocumented endpoint to `stable`.
4. Deprecate a `stable` endpoint.
5. Add pagination to a previously unpaginated `stable` endpoint.
6. Change endpoint description or documentation that affects client expectations.

---

## Requires Versioning or Migration Plan

The following changes to `stable` endpoints require a **version bump** or **explicit migration plan**:

1. Remove endpoint.
2. Change HTTP method.
3. Change URL path (including path parameter names).
4. Remove a request field.
5. Make an optional request field required.
6. Rename a request field.
7. Remove a response field.
8. Rename a response field.
9. Change a response field type.
10. Change success status code (e.g., `200` → `201`).
11. Change error code semantics.
12. Change idempotency behavior.
13. Change tenant or outlet scoping.
14. Change datetime format.
15. Change money format (string ↔ number).
16. Change pagination or cursor semantics.
17. Change auth requirements (add or remove security).
18. Change permission requirements.

---

## What Counts as Breaking

### Breaking Changes Table

| Change | Breaking? | Requires |
|--------|-----------|----------|
| Remove endpoint | **Yes** | Version bump or migration plan |
| Change method | **Yes** | Version bump |
| Change path | **Yes** | Version bump |
| Remove request field | **Yes** | Version bump |
| Make optional field required | **Yes** | Version bump |
| Rename request field | **Yes** | Version bump |
| Remove response field | **Yes** | Version bump |
| Rename response field | **Yes** | Version bump |
| Change response field type | **Yes** | Version bump |
| Change enum meaning | **Yes** | Version bump |
| Remove enum value | **Yes** | Version bump |
| Change success status code | **Usually Yes** | Version bump |
| Change error code | **Yes** | Version bump |
| Change idempotency behavior | **Yes** | Version bump |
| Change pagination/cursor semantics | **Yes** | Version bump |
| Tighten validation | **Usually Yes** | Version bump |
| Add optional request field | **No** | Changelog entry |
| Add response field | **Usually No** | Changelog entry if strict shape |
| Add new endpoint | **No** | Changelog entry |
| Add enum value | **Maybe** | Depends on client behavior; document |
| Relax validation | **No** | None |
| Fix typo in error message | **No** | None |

---

## Version Bump Process

When a breaking change is required:

1. Create a migration plan describing the change and impact.
2. Update the OpenAPI spec with new version.
3. Add changelog entry in `docs/api-contracts/CHANGELOG.md`.
4. Obtain approval from API owner.
5. Communicate change timeline to clients.
6. Set deprecation timeline if applicable.

---

## Contract Diff CI Gate

The `lint:api-contracts` CI gate runs `scripts/check-api-contract-diff.ts` which:

1. Loads `docs/api-contracts/openapi-0.3-stability-baseline.json`.
2. Loads `docs/api-contracts/stable-endpoints.json`.
3. Generates current OpenAPI spec from running API.
4. Compares only `stable` endpoints for breaking changes.
5. Fails on breaking changes (exit code 1).
6. Warns on additive changes without changelog entry (exit code 2).

Usage:
```bash
npx tsx scripts/check-api-contract-diff.ts
```

Exit codes:
- `0` = PASS (no issues or only additive changes with changelog entry)
- `1` = FAIL (breaking changes detected)
- `2` = WARN (additive changes without changelog entry)
- `3` = ERROR (missing baseline files or generation failure)

---

## Baseline Coverage

The current baseline covers **136 stable endpoints** registered in OpenAPI and mounted in the runtime route inventory.

Known gaps require OpenAPI registration and stable-list promotion before `stable` classification:
- Non-promoted `/api/purchasing/*` routes are classified `beta`.
- Non-stable accounting/reporting runtime routes are classified `beta`.
- Dine-in runtime routes are classified `beta`.
- Cash-bank transaction runtime routes are classified `beta`.

---

## Related Documents

- `docs/api-stability-matrix.md` — Full endpoint classification and inventory
- `docs/api-contracts/openapi-0.3-stability-baseline.json` — OpenAPI baseline
- `docs/api-contracts/stable-endpoints.json` — Stable endpoint list
- `docs/api-contracts/CHANGELOG.md` — Change history
- `docs/api-contracts/sync-contract.md` — Sync contract specifics
- `docs/api-contracts/auth-acl-contract.md` — Auth/ACL specifics
- `docs/api-contracts/error-contract.md` — Error envelope specifics
- `docs/api-contracts/datetime-money-contract.md` — Datetime/money specifics

---

*Last updated: 2026-05-16  
Baseline version: 0.3-stability-baseline*
