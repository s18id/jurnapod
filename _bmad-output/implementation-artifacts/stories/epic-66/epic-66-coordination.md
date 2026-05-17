# Epic 66 Implementation Coordination

**Status:** planning-only  
**Scope approval:** Not approved for implementation. `apps/backoffice` remains frozen for Epic 66 until Ahmad explicitly lifts the freeze for Epic 66 scope.  
**Date:** 2026-05-17

---

## Current Readiness

| Gate | Result | Evidence |
|------|--------|----------|
| Epic 65 foundation complete | ✅ PASS | `epic-65: done` in `sprint-status.yaml`; commit `e8c6f046` |
| Epic 66 story specs created | ✅ PASS | `story-66-1.md` through `story-66-5.md` |
| Backoffice unfreeze for Epic 66 | ❌ HOLDING | Explicit user approval required before implementation |
| API contract verification | ❌ HOLDING | Each Story 66 spec contains endpoint verification table |
| Kickoff validation | ❌ HOLDING | Run only after implementation approval |

---

## Coordination Rules

- Epic 66 implementation MUST NOT begin until Ahmad explicitly approves Epic 66 execution.
- `apps/backoffice` changes remain limited to planning artifacts until approval is granted.
- `apps/pos` MUST NOT be modified.
- Backend ACL enforcement MUST remain authoritative and MUST NOT be weakened by frontend UX work.
- UI permission checks MUST use canonical `module.resource` requirements.
- Domain screens outside core admin (`users`, `roles`, `companies`, `outlets`, `audit`) MUST NOT be implemented in Epic 66.
- New UI code, when approved, MUST consume Epic 65 primitives: `EntityTable`, `FilterBar`, `DetailDrawer`, `ScopeBadge`, typed API client, TanStack Query, shell, and route guard foundations.

---

## Planned Story Order

| Story | Title | Dependency | Status |
|-------|-------|------------|--------|
| 66-1 | User Management — List, Create, Edit, Role Assignment, Outlet Scoping | Epic 65 | backlog |
| 66-2 | Role Management — Presets, Permission Matrix Editor, Change Review | 66-1 pattern | backlog |
| 66-3 | Company and Outlet Management with ScopeBadge | Epic 65 | backlog |
| 66-4 | Permission-Aware Navigation and Route Guards | 66-1, 66-2 | backlog |
| 66-5 | Audit Log Explorer | 66-4 | backlog |

---

## Epic 65 Follow-Ups Affecting Epic 66

| Severity | Item | Epic 66 Impact | Required Handling |
|----------|------|----------------|-------------------|
| P2 | OpenAPI schema freshness gate | User/role/company/outlet typed contracts can drift | API contract verification MUST run before Story 66-1 implementation |
| P2 | `@/lib/*` path precedence risk | New backoffice lib files can collide with API alias precedence | New lib file names MUST be checked against `apps/api/src/lib/` before implementation |
| P3 | Transitional route permission cast | Story 66-4 must formalize route permission metadata | Story 66-4 MUST remove the transitional cast before completion |

---

## Kickoff Validation Commands

Run only after Epic 66 implementation approval:

```bash
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

---

## Planning Artifacts

| Artifact | Path |
|----------|------|
| Epic charter | `_bmad-output/implementation-artifacts/stories/epic-66/epic-66.md` |
| User management story | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-1.md` |
| Role management story | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-2.md` |
| Company/outlet story | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-3.md` |
| Permission navigation story | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-4.md` |
| Audit explorer story | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-5.md` |

---

_Last Updated: 2026-05-17_
