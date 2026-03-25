<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0003: Hono as API Framework

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** Ahmad Faruk (Signal18 ID)
**Epic:** Epic 14 (Hono Full Utilization), Epic 15 (Stub Route Implementation)

---

## Context

The API originally used Express-style route handlers with manual middleware wiring. As the route count grew past 25 modules, several problems accumulated:

- No standard request/response type — handlers used raw Node.js `req`/`res` objects, making types inconsistent across routes.
- Middleware composition was implicit and order-sensitive.
- Validation lived in ad-hoc per-handler code with no shared pattern.
- No path towards edge/serverless compatibility (Bun, Cloudflare Workers) if ever needed.

The team evaluated Express (status quo), Fastify, and Hono.

---

## Decision

Use **Hono** as the HTTP framework, served via Node.js's built-in `createServer()` with a thin Web Standard Request/Response adapter.

```typescript
// server.ts
import { Hono } from "hono";
import { createServer } from "node:http";

const app = new Hono();

app.use("/api/*", compress());
app.use("/api/*", corsMiddleware);

app.route("/api/sync",       syncRoutes);
app.route("/api/sales",      salesRoutes);
app.route("/api/outlets/:outletId/stock", stockRoutes);
// ...

const server = createServer(async (req, res) => {
  const webReq  = nodeReqToWebRequest(req);
  const webRes  = await app.fetch(webReq);
  writeWebResponseToNode(webRes, res);
});
```

All route handlers work exclusively with the Web Standard `Request` / `Response` objects. The Hono `Context` (`c`) is used for middleware state sharing (auth, telemetry) via `c.set()`/`c.get()`.

---

## Alternatives Considered

### Keep Express

Rejected. Express has no native Web Standard support and its middleware typing is weak. Migrating to typed request/response would have required a heavier wrapper layer.

### Fastify

Not selected. Fastify's plugin model and JSON schema approach are well-suited for large teams, but introduce more surface area than needed for a single-repo product. Hono's route composition via `app.route()` fits the monorepo package structure better.

### Next.js API Routes

Removed. Next.js API routes tied the API to the Next.js build lifecycle and deployment model, which conflicted with the goal of serving the API as an independent Node.js process.

---

## Consequences

### Positive

- All handlers operate on `Request`/`Response` — portable, testable without framework mocks.
- `app.route()` composition maps cleanly to the module hierarchy (`routes/sales/`, `routes/sync/`, etc.).
- Route groups can install middleware independently (telemetry, auth) without affecting other groups.
- Hono's `compress()`, `logger()`, and `zValidator()` middleware integrate without wrapper code.
- Path toward Bun or Cloudflare Workers compatibility exists (deferred — see Epic 14.3.4/14.3.5).

### Negative / Trade-offs

- Node.js adapter requires a manual `Request`/`Response` conversion layer in `server.ts`. This is thin (~30 lines) but is custom code we own.
- WebSocket support needs manual upgrade handling outside Hono's fetch loop.
- `c.set()`/`c.get()` for sharing auth and telemetry context requires TypeScript module augmentation (`declare module "hono"`) to be type-safe — easy to break if the augmentation is omitted in a new route file.

---

## References

- `apps/api/src/server.ts` — entry point and adapter
- Epic 14: Hono Full Utilization (migration)
- Epic 15: Stub Route Implementation (business logic on Hono routes)
- [Hono documentation](https://hono.dev)
