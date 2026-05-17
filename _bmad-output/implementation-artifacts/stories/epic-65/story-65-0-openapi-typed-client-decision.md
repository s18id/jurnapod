# Story 65-0 — OpenAPI Generator Evaluation and Typed-Client Decision

**Status:** complete (decision gate)
**Date:** 2026-05-17
**Story:** 65-0
**Type:** Spike / Decision Gate

---

## 1) Evaluation Summary

### 1.1 Existing OpenAPI Infrastructure

The API has extensive OpenAPI support via `@hono/zod-openapi`:

- **Route definitions:** 217+ `createRoute()` calls across all route files, each defining full OpenAPI 3.0 schemas for request params, bodies, and response shapes.
- **Spec aggregation:** `apps/api/src/routes/openapi-aggregator.ts` registers all route modules into an `OpenAPIHono` instance and exports the full OpenAPI 3.0 document.
- **Spec export:** `apps/api/scripts/export-openapi-spec.ts` can write the spec to stdout as JSON.
- **Route families registered:** 35+ modules including auth, users, roles, companies, outlets, inventory, journals, accounts, sales, purchasing, sync, POS, settings, reports, import/export, audit, health, tax-rates, recipes, supplies, dinein, admin-runbook, admin-dashboards, and more.

### 1.2 Generator Options Considered

| Approach | Viability | Notes |
|----------|-----------|-------|
| `openapi-typescript` + `openapi-fetch` | Viable | Well-maintained, produces clean types from any OpenAPI 3.0/3.1 spec. The generated client uses `fetch` under the hood, aligning with existing backoffice patterns. |
| `@hey-api/openapi-ts` | Viable | Full-featured codegen with axios/fetch clients. Higher complexity but more customization. |
| `openapi-generator-cli` (Java) | Overkill | Requires Java runtime, larger generated output, harder to integrate into Vite pipeline. |
| Hand-crafted typed client with Zod wrappers | Fallback viable | Full control, no generation dependency, but manual maintenance burden across 35+ route families. |
| `@hono/zod-openapi` client generation | Not supported | Hono does not provide a client generator; the `createRoute` definitions are server-side only. |

**Decision: Story 65-2 MUST use `openapi-typescript` + `openapi-fetch` as the primary typed-client path.**

### 1.3 Why `openapi-typescript` + `openapi-fetch`

1. **Minimal abstraction** — Generated output is pure TypeScript types (paths, operations, request/response schemas). No runtime codegen complexity.
2. **Fetch-native** — The `openapi-fetch` client wraps native `fetch`, aligning with the existing `apiRequest()` / `apiStreamingRequest()` pattern in `apps/backoffice/src/lib/api-client.ts`.
3. **Auth interceptor** — The existing 401→refresh→retry pattern in `api-client.ts` can be wrapped around the generated client without changing the refresh flow.
4. **Zero lock-in** — If the generator proves insufficient, the generated type file can serve as the typed contract surface for a hand-crafted wrapper.
5. **Lightweight** — devDependencies are slim (openapi-typescript, openapi-fetch ~50KB combined).

---

## 2) Endpoint Family Evaluation

Evaluated against the OpenAPI route families relevant to Epic 65 and Epics 66–69.

### 2.1 MVP Endpoint Families (Epic 65 Required)

| Family | Routes | OpenAPI Coverage | Typed? | Gaps | Severity |
|--------|--------|------------------|--------|------|----------|
| **auth** | POST /auth/login, POST /auth/logout, POST /auth/refresh | Full `createRoute` definitions with typed request/response schemas | ✅ | None | — |
| **users** | GET/POST /users, GET/PATCH /users/:id | Full `createRoute` definitions | ✅ | None | — |
| **roles** | GET /roles, GET/POST /roles/:id/permissions | Full `createRoute` definitions | ✅ | None | — |
| **companies** | GET /companies, GET/POST /companies/:id | Full `createRoute` definitions | ✅ | None | — |
| **outlets** | GET /outlets, GET/POST /outlets/:id | Full `createRoute` definitions | ✅ | None | — |
| **inventory/items** | GET/POST /inventory/items, GET/PATCH /inventory/items/:id | Full `createRoute` definitions | ✅ | None | — |
| **operations** | GET /sync/queue, GET /sync/history, GET /import/progress | Partial — sync push/pull have full definitions, but progress/queue routes use standard Hono without full OpenAPI definitions | ⚠️ | `progress` and `sync-history` routes lack explicit response schemas in some operations | P2 |

**MVP Assessment:** All 7 MVP endpoint families are sufficiently typed in the OpenAPI spec for `openapi-typescript` to generate usable client types. The operations gap is P2 (minor schema gaps) and can be addressed by adding Zod schemas to the progress/queue routes in a follow-up.

### 2.2 Deferred Endpoint Families (Epics 66–69)

| Family | Consuming Epic | OpenAPI Coverage | Gaps | Severity | Action |
|--------|---------------|------------------|------|----------|--------|
| **sales/invoices** | Epic 69 | Full `createRoute` definitions (list, create, get, update, post, void) | None | — | Ready for typed client in Epic 69 |
| **sales/orders** | Epic 69 | Full definitions (list, create, get, update, convert, cancel) | None | — | Ready for typed client in Epic 69 |
| **sales/payments** | Epic 69 | Full definitions (list, get, update, post, create) | None | — | Ready for typed client in Epic 69 |
| **sales/credit-notes** | Epic 69 | Full definitions | None | — | Ready for typed client in Epic 69 |
| **purchasing/suppliers** | Epic 69 | Full definitions via `purchasing/openapi.ts` | None | — | Ready for typed client in Epic 69 |
| **purchasing/invoices** | Epic 69 | Full definitions via `purchasing/openapi.ts` | None | — | Ready for typed client in Epic 69 |
| **purchasing/receipts** | Epic 69 | Full definitions via `purchasing/openapi.ts` | None | — | Ready for typed client in Epic 69 |
| **purchasing/payments** | Epic 69 | Full definitions via `purchasing/openapi.ts` | None | — | Ready for typed client in Epic 69 |
| **purchasing/credits** | Epic 69 | Full definitions via `purchasing/openapi.ts` | None | — | Ready for typed client in Epic 69 |
| **accounting/journals** | Epic 69 | Full `createRoute` definitions (GET /journals, GET /journals/:id, POST /journals/:id/{post,void}) | None | — | Ready for typed client in Epic 69 |
| **accounting/accounts** | Epic 69 | Full `createRoute` definitions (list, get, create, account-types) | None | — | Ready for typed client in Epic 69 |
| **inventory/prices** | Epic 67 | `createRoute` definitions exist in inventory route file | May be partial for price history/import endpoints | P2 | Audit in Epic 67; likely ready |
| **inventory/costing** | Epic 67 | Routes in `inventory-costing` module | Needs OpenAPI registration audit | P2 | Audit in Epic 67 |
| **import** | Epic 67 | Partial `createRoute` definitions | Import routes are not fully registered in openapi-aggregator | P2 | Register + audit in Epic 67 |
| **export** | Epic 67 | Partial `createRoute` definitions | Export routes are not fully registered | P2 | Register + audit in Epic 67 |
| **audit** | Epic 68 | `createRoute` definitions exist but may be partial | Audit endpoints registered but response schemas may need review | P3 | Audit in Epic 68 |
| **reports** | Epic 69 | Full `createRoute` definitions for most report endpoints | Some older report routes may use standard Hono without OpenAPI | P2 | Audit + register in Epic 69 |
| **admin/dashboards** | Epic 68 | Full `createRoute` definitions (trial-balance, reconciliation, period-close, sync) | None | — | Ready for typed client in Epic 68 |
| **sync** | Epic 68 | Full `createRoute` definitions (push, pull, check-duplicate, health) | None currently identified | — | Ready for typed client in Epic 68 |

### 2.3 Excluded Families (Outside Epic 65–70 Scope)

| Family | Reason |
|--------|--------|
| POS routes (pos-items, pos-cart) | `apps/pos` frozen; out of scope for backoffice hardening program |
| Dine-in routes | Deferred to future approved backoffice domain program |
| Recipes | Deferred — not in Epic 65–70 scope |

---

## 3) Implementation Path for Story 65-2

### 3.1 Generation Step

```bash
# Export the OpenAPI spec
npx tsx apps/api/scripts/export-openapi-spec.ts > apps/backoffice/openapi-spec.json

# Generate types
npx openapi-typescript apps/backoffice/openapi-spec.json -o apps/backoffice/src/lib/api/schema.d.ts
```

### 3.2 Client Wrapper Architecture

The generated types will be consumed by a thin typed client wrapper in `apps/backoffice/src/lib/api/client.ts`:

```typescript
// apps/backoffice/src/lib/api/client.ts
import createClient from "openapi-fetch";
import type { paths } from "./schema";

export const apiClient = createClient<paths>({
  baseUrl: getApiBaseUrl(),
  credentials: "include",
});

// The existing 401→refresh→retry interceptor from lib/api-client.ts
// is preserved as a middleware on the fetch instance.
```

### 3.3 MVP Families for Story 65-2

| Priority | Family | Endpoints |
|----------|--------|-----------|
| P0 | auth | login, logout, refresh |
| P0 | users | list, get, create, update |
| P0 | roles | list, get, permissions |
| P0 | companies | list, get |
| P0 | outlets | list, get |
| P0 | inventory/items | list, get, create, update |
| P0 | operations | sync/queue, sync/history (where typed) |

### 3.4 Deferred Families Assignment

| Batch | Epic | Families | Action |
|-------|------|----------|--------|
| Batch C | 66 (Core Admin) | audit-adjacent platform admin endpoints discovered during user/role/company/outlet implementation | Generate types only when consumed by Epic 66 stories |
| Batch D | 67 (Inventory UX) | prices, costing, import, export | Audit OpenAPI registration; generate types for prices/costing |
| Batch D | 68 (Admin & Audit) | audit, admin/dashboards, sync health, notifications | Generate types for admin/dashboard families |
| Batch E | 69 (Accounting & Sales) | journals, accounts, fiscal_years, invoices, orders, payments, credit_notes, reports | Full type generation for accounting and sales families |

---

## 4) Gap Severity Legend

| Severity | Meaning |
|----------|---------|
| P0 | Blocker — cannot generate typed client for this family without fixing |
| P1 | Major — significant manual work needed to make typed |
| P2 | Minor — partial schema gaps; typed client works for most endpoints |
| P3 | Cosmetic — optional response schema improvements |

---

## 5) Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| R65-001: OpenAPI generator produces broken types for complex union/nested schemas | P1 | Fall back to hand-crafted typed client using exported Zod schemas from `packages/shared`; generate types file is saved as `schema.d.ts` for reference even if auto-generated client isn't used |
| R65-005: API routes using legacy Hono patterns (not `createRoute`) lack OpenAPI types | P2 | Use hand-crafted types for legacy routes; backlog item to convert those routes to `createRoute` |
| Schema drift: OpenAPI spec diverges from runtime if export isn't kept up to date | P2 | A future CI gate MUST run spec export + type generation before typed-client-dependent checks |

---

## 6) Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Use `openapi-typescript` + `openapi-fetch` for typed client generation | Lightweight, fetch-native, minimal abstraction, aligns with existing patterns, no Java dependency | 2026-05-17 |
| Hand-crafted typed client is fallback if generator output is insufficient | Preserves control; generated type file remains as contract surface for manual wrappers | 2026-05-17 |
| MVP families locked as specified in AC | Auth, users, roles, companies, outlets, inventory items, operations are the Epic 65 foundation pages | 2026-05-17 |
| Deferred families assigned per epic dependency order | Purchasing (E66) → Inventory UX (E67) → Admin & Audit (E68) → Accounting & Sales (E69) | 2026-05-17 |

---

_Last Updated: 2026-05-17_
