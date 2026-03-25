<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0004: RESTful URL Design Conventions

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** Ahmad Faruk (Signal18 ID)
**Epic:** Epic 14 (Hono migration, URL standardization)

---

## Context

Before Epic 14, the API had inconsistent URL patterns accumulated over multiple epics:

- Mixed `camelCase` and `snake_case` in path segments.
- Inconsistent verb usage (`/activate`, `/setStatus`, `/doPost`).
- Some outlet-scoped resources lived at the top level (`/stock`), others were nested.
- No rule for when to use `PUT` vs `PATCH` vs a sub-resource action.

With 25+ route modules and growing, the inconsistency was causing client-side friction and making the route table hard to reason about.

---

## Decision

All API routes follow four conventions, applied consistently across all modules.

### 1. kebab-case for all URL segments

Path segments use lowercase kebab-case. No camelCase, no snake_case in paths.

```
✓  /sales/credit-notes
✓  /outlets/:outletId/stock/adjustments
✓  /cash-bank-transactions
✗  /salesCreditNotes
✗  /sales/creditNotes
✗  /cash_bank_transactions
```

Query parameters remain snake_case to match JSON payload conventions:
```
?outlet_id=1&date_from=2026-01-01&limit=50
```

### 2. RESTful nesting for outlet-scoped resources

Resources that belong to a specific outlet are nested under `/outlets/:outletId/`:

```
GET  /api/outlets/:outletId/stock
POST /api/outlets/:outletId/stock/adjustments
GET  /api/outlets/:outletId/stock/movements
```

Resources that operate across outlets (or where outlet is a filter, not a scope) live at the domain root:

```
GET  /api/sales/invoices?outlet_id=1    # outlet is a filter
POST /api/sync/push                     # cross-outlet operation
GET  /api/sync/pull?outlet_id=1
```

**Rule**: If the resource requires a specific outlet to exist (stock levels, table sessions), use path nesting. If outlet is optional or the operation spans outlets, use a query param.

### 3. PATCH for state-change operations

Partial updates and state transitions use `PATCH` with an explicit body:

```
PATCH /api/users/:id        { "is_active": false }
PATCH /api/outlets/:id      { "is_active": true }
PATCH /api/sales/invoices/:id/status   { "status": "VOID" }
```

Sub-resource actions that are not CRUD operations use a noun path segment after the ID:

```
POST /api/sales/invoices/:id/post      # post to GL
POST /api/sales/invoices/:id/void      # void a posted invoice
POST /api/dinein/sessions/:id/finalize-batch
POST /api/dinein/sessions/:id/close
```

`PUT` is not used — partial updates via `PATCH` are preferred for auditability.

### 4. /sync/ as a special cross-outlet prefix

POS sync routes live under `/sync/` and are not outlet-nested because they operate on behalf of a device that may serve multiple outlets, or where outlet context comes from the payload:

```
POST /api/sync/push
GET  /api/sync/pull
GET  /api/sync/health
POST /api/sync/check-duplicate
GET  /api/sync/stock
```

---

## Alternatives Considered

### Flat top-level routes

Rejected. `/stock` and `/outlets/:outletId/stock` would both need to exist, or the outlet ID would always be a query param. Query params are appropriate for filters but not for resource scoping — URL path makes the scope explicit and enforces the access check at the routing layer.

### Verb-based paths (RPC style)

Rejected (e.g., `/postInvoice`, `/voidOrder`). RPC-style URLs are inconsistent with HTTP method semantics and make the route table harder to navigate. Sub-resource noun paths (`/invoices/:id/post`, `/invoices/:id/void`) provide the same clarity with a consistent structure.

### snake_case in paths

Rejected for paths. snake_case is kept for JSON fields and query params where it matches database column names. Using kebab-case in paths aligns with web conventions and avoids confusion between path segments and query params.

---

## Consequences

### Positive

- Route table is navigable and predictable — new developers can locate endpoints by domain (`/sales/`, `/inventory/`, `/dinein/`).
- Outlet access checks can be enforced at the routing layer for `/outlets/:outletId/*` paths — no need for per-handler outlet extraction.
- Client code generation (hc client, OpenAPI) produces clean method names from kebab-case paths.

### Negative / Trade-offs

- Path parameter `outletId` is camelCase (Hono convention for `:paramName`) while query params are snake_case — this asymmetry is minor but notable.
- Existing clients built against pre-Epic 14 URLs required updates when the `/stock` → `/outlets/:outletId/stock/*` migration happened.
- Sub-resource action paths (`/invoices/:id/post`) look non-standard to developers expecting pure CRUD. The tradeoff is clarity over strict REST purity.

---

## References

- `apps/api/src/server.ts` — route registration
- `apps/api/src/routes/stock.ts` — outlet-scoped nesting example
- `apps/api/src/routes/sales/invoices.ts` — sub-resource action example
- `apps/api/src/routes/sync/` — cross-outlet sync prefix
- Epic 14.2.2: Standardize stock routes
- Epic 14.2.4: Standardize state-change verbs
