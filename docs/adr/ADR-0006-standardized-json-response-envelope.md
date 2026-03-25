<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0006: Standardized JSON Response Envelope

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** Ahmad Faruk (Signal18 ID)

---

## Context

API clients (POS offline sync, Backoffice SPA) need to distinguish successful responses from errors reliably without relying solely on HTTP status codes. HTTP status alone is insufficient because:

- Fetch API in browsers does not throw on 4xx/5xx — callers must inspect the status code explicitly.
- Network errors and timeouts produce no body — a `success: false` field makes partial failures distinguishable from total failures.
- Multiple error conditions can map to the same HTTP status (e.g., `FORBIDDEN` vs `MODULE_DISABLED` both return 403) — a machine-readable `code` field is needed.

Before this convention was established, some routes returned `{ error: "..." }`, others `{ message: "..." }`, and success responses had no consistent wrapper.

---

## Decision

All API responses use a discriminated union envelope:

```typescript
// Success
{
  "success": true,
  "data": <T>
}

// Error
{
  "success": false,
  "error": {
    "code": "<SCREAMING_SNAKE_CASE>",
    "message": "<human-readable string>"
  }
}
```

The `success` field is always present and is always a boolean literal — never a string, never `1`/`0`. This makes TypeScript narrowing work cleanly:

```typescript
const res = await api.post("/sync/push", body);
const json = await res.json();

if (!json.success) {
  // json.error is typed: { code: string, message: string }
  console.error(json.error.code);
} else {
  // json.data is typed: SyncPushResponse
}
```

### Response helpers

All handlers use two helper functions from `lib/response.ts` — direct `Response.json()` calls in route handlers are not allowed:

```typescript
// Success
export function successResponse<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

// Error
export function errorResponse(
  code: string,
  message: string,
  status = 400
): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}
```

### Standard error codes

| Code | HTTP Status | Meaning |
|------|------------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Authenticated but not authorized |
| `INVALID_REQUEST` | 400 | Validation failure (Zod or business rule) |
| `NOT_FOUND` | 404 | Resource does not exist in this tenant |
| `CONFLICT` | 409 | State conflict (already posted, duplicate) |
| `INSUFFICIENT_STOCK` | 409 | Stock validation failed |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled exception |

Domain-specific codes extend this list as needed (e.g., `INVOICE_ALREADY_POSTED`, `IDEMPOTENCY_CONFLICT`). All codes are `SCREAMING_SNAKE_CASE`.

### Global error handler

Unhandled exceptions caught by Hono's `onError` hook return the `INTERNAL_SERVER_ERROR` envelope — raw exception messages are never sent to clients:

```typescript
app.onError((error: unknown) => {
  console.error("Unhandled API error", error);
  return Response.json({
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error" }
  }, { status: 500 });
});
```

### TypeScript types

The envelope types are defined in `lib/response.ts` and used in `packages/shared` for client-side consumption:

```typescript
export type SuccessPayload<T> = {
  success: true;
  data: T;
  error?: never;
};

export type ErrorPayload = {
  success: false;
  data?: never;
  error: { code: string; message: string };
};

export type ApiResponse<T> = SuccessPayload<T> | ErrorPayload;
```

---

## Alternatives Considered

### HTTP status codes only (no envelope)

Rejected. The POS offline sync client distinguishes `OK` / `DUPLICATE` / `ERROR` outcomes per transaction in a batch push. HTTP status alone cannot express per-item status within a batch response.

### `{ status: "ok" | "error", ... }` with string status

Rejected. A string discriminant is not narrowable in TypeScript without an explicit type guard, and `"ok"` vs `true` is a convention choice with no functional difference. A boolean `success` field is simpler and more explicit.

### Problem Details (RFC 7807)

Evaluated. RFC 7807 (`application/problem+json`) is well-suited for public APIs, but introduces a different `Content-Type` header and a different field schema (`type`, `title`, `status`, `detail`) that would require all clients to handle two response formats. Given that Jurnapod is a private API consumed only by its own frontends, the simpler `{ success, error: { code, message } }` shape was preferred.

---

## Consequences

### Positive

- All clients have a single response parsing pattern regardless of route or status code.
- TypeScript discriminated union: after checking `success`, the type narrows to `{ data: T }` or `{ error: { code, message } }` — no optional chaining needed.
- Error codes let clients handle specific conditions (e.g., show a "duplicate transaction" message vs a generic "error") without parsing `message` strings.
- Unhandled exceptions are always swallowed at the boundary — raw stack traces never leak to clients.

### Negative / Trade-offs

- All non-204 responses carry a `success` wrapper even for simple reads (`GET /health`). This is minimal overhead.
- Clients that prefer standard HTTP semantics (e.g., some HTTP libraries that auto-parse errors from status codes) need adaptation.
- Adding a new standard error code requires a convention update — codes are not enforced by a schema today.

---

## References

- `apps/api/src/lib/response.ts` — `successResponse()`, `errorResponse()`, `ApiResponse<T>`
- `apps/api/src/server.ts` — global `onError` handler
- `packages/shared/` — shared response types for frontend consumption
