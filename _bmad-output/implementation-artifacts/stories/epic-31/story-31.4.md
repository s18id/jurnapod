# Story 31.4: Thin `routes/users.ts` and `routes/companies.ts`

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.4 |
| Title | Thin `routes/users.ts` and `routes/companies.ts` |
| Status | pending |
| Type | Route Thinning |
| Sprint | 1 of 2 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As an API Developer,
I want `routes/users.ts` and `routes/companies.ts` to be thin HTTP adapters,
So that business logic lives in packages and routes only handle HTTP validation, auth, and response.

---

## Background

After Stories 31.1 and 31.2, `routes/users.ts` and `routes/companies.ts` must be refactored to delegate to `@jurnapod/modules-platform`. Currently these routes may still contain business logic — this story ensures they are pure adapters.

---

## Acceptance Criteria

1. `routes/users.ts` contains only HTTP concerns: validation, auth check, response formatting
2. `routes/companies.ts` contains only HTTP concerns: validation, auth check, response formatting
3. All database operations delegated to `@jurnapod/modules-platform`
4. Route files do not import `getDbPool`, `pool.execute`, or SQL helpers
5. `npm run typecheck -w @jurnapod/api` passes
6. `npm run build -w @jurnapod/api` passes
7. Auth flow (login, logout, token refresh) still works end-to-end

---

## Technical Notes

### What "Thin" Means

**Thin route example:**
```typescript
// routes/users.ts
import { listUsers, createUser } from "@jurnapod/modules-platform";

router.get("/", authGuard, async (c) => {
  const { companyId } = auth.fromContext(c);
  const users = await listUsers({ companyId });
  return c.json({ users });
});

router.post("/", authGuard, async (c) => {
  const { companyId } = auth.fromContext(c);
  const body = await c.req.json();
  const user = await createUser({ companyId, ...body });
  return c.json({ user }, 201);
});
```

**Anti-patterns to remove:**
- `pool.execute()` in routes
- SQL strings in routes
- Direct `getDbPool()` calls
- Business logic (role checks, permission evaluation) in routes

### Auth Flow Preservation

The auth routes (`routes/auth.ts`) must continue working:
- Login → validate credentials → return JWT
- Logout → invalidate token
- Token refresh → validate + refresh

---

## Tasks

- [ ] Audit `routes/users.ts` for business logic
- [ ] Audit `routes/companies.ts` for business logic
- [ ] Refactor to delegate to `@jurnapod/modules-platform`
- [ ] Remove SQL/helpers from routes
- [ ] Verify auth flow still works
- [ ] Run typecheck + build
- [ ] Integration test: user CRUD via API
- [ ] Integration test: company CRUD via API

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dependencies

- Story 31.1 (Users extraction) — must be complete
- Story 31.2 (Companies extraction) — must be complete
