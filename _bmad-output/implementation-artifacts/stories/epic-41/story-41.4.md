# Story 41.4: Router Cleanup

> **Epic:** 41 - Backoffice Auth Token Centralization  
> **Priority:** P1  
> **Estimate:** 4h  
> **Status:** ✅ Done

---

## Story

As a **developer**,  
I want the router to not forward `accessToken` to pages,  
So that pages cannot depend on receiving tokens from the router.

---

## Context

The router (`apps/backoffice/src/app/router.tsx`) stored tokens in state and passed them to every route screen, enabling the prop drilling pattern.

---

## Acceptance Criteria

### AC1: Stop Token Forwarding
- [x] RouteScreen no longer passes accessToken to pages
- [x] Session/auth gate checks preserved
- [x] Router still maintains token internally for auth flow

### AC2: Keep Auth Boundary
- [x] Router still handles login/logout
- [x] Token storage unchanged
- [x] 401 refresh flow unchanged

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/app/router.tsx` | Removed token forwarding from RouteScreen |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story |
| 2026-04-13 | 1.1 | Completed implementation |
