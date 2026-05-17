# Epic 66 Planning Readiness Report

**Epic:** 66 — Core Admin — Users, Roles, Companies, Permissions UX  
**Status:** Planning-ready; implementation blocked by scope-freeze approval  
**Date:** 2026-05-17

---

## Executive Summary

Epic 66 is ready for planning review. Story specs, coordination rules, sprint-status backlog entries, and program index updates are in place. Implementation MUST NOT begin until Ahmad explicitly lifts the `apps/backoffice` freeze for Epic 66 scope.

---

## Readiness Checklist

| Gate | Status | Evidence |
|------|--------|----------|
| Epic 65 foundation complete | ✅ PASS | `epic-65: done` in sprint status; commit `e8c6f046` |
| Epic 66 charter exists | ✅ PASS | `epic-66.md` |
| Epic 66 story specs exist | ✅ PASS | `story-66-1.md` through `story-66-5.md` |
| Epic 66 coordination file exists | ✅ PASS | `epic-66-coordination.md` |
| Sprint status entries exist | ✅ PASS | `epic-66: backlog` and five story backlog entries |
| Sprint status validation | ✅ PASS | `npx tsx scripts/validate-sprint-status.ts` |
| Program/index state updated | ✅ PASS | `epics.md`, `backoffice-frontend-hardening-program.md` |
| API contract verification complete | ❌ BLOCKED | Required before each story implementation |
| Backoffice unfreeze for Epic 66 | ❌ BLOCKED | Explicit Ahmad approval required |

---

## Story Readiness

| Story | Title | Planning Status | Implementation Status |
|-------|-------|-----------------|-----------------------|
| 66-1 | User Management — List, Create, Edit, Role Assignment, Outlet Scoping | Ready for review | Blocked by Epic 66 unfreeze + API verification |
| 66-2 | Role Management — Presets, Permission Matrix Editor, Change Review | Ready for review | Blocked by 66-1 pattern + Epic 66 unfreeze + API verification |
| 66-3 | Company and Outlet Management with ScopeBadge | Ready for review | Blocked by Epic 66 unfreeze + API verification |
| 66-4 | Permission-Aware Navigation and Route Guards | Ready for review | Blocked by 66-1/66-2 patterns + Epic 66 unfreeze + API verification |
| 66-5 | Audit Log Explorer | Ready for review | Blocked by 66-4 + Epic 66 unfreeze + API verification |

---

## Required Approval Before Implementation

Implementation can begin only after explicit user approval in this form or equivalent:

> I approve lifting the `apps/backoffice` freeze for Epic 66 scope only. Proceed with Epic 66 implementation planning and preflight.

Approval MUST specify Epic 66 scope. Approval for Epic 65 does not carry over to Epic 66.

---

## Mandatory Preflight After Approval

After approval and before Story 66-1 implementation, run:

```bash
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

If any gate fails, implementation MUST NOT start until failures are classified as blocking pre-existing issues or tracked follow-ups with owner and severity.

---

## API Contract Verification Queue

Story implementation MUST verify endpoint contracts before UI work starts.

| Area | Required Endpoint Families |
|------|----------------------------|
| Users | user list, create, update, deactivate, current user |
| Roles | role list, role detail, role permissions, role update |
| Companies | company list, detail, create, update, status |
| Outlets | outlet list, detail, create, update, status |
| Effective permissions | current user's module.resource permission entries |
| Audit | audit list, audit detail, actor selector source |

Any API gap MUST be documented in the implementing story before code changes proceed.

---

## Epic 65 Follow-Ups Carried Into Epic 66

| Severity | Follow-Up | Required Handling |
|----------|-----------|-------------------|
| P2 | OpenAPI schema freshness gate | Story 66-1 MUST verify typed contracts before using generated types for user/role/company/outlet surfaces |
| P2 | `@/lib/*` path precedence risk | New backoffice lib files MUST be checked for name collision with `apps/api/src/lib/` |
| P3 | Transitional route permission cast | Story 66-4 MUST remove the cast by formalizing `AppRoute.permission` metadata |

---

## Planning Artifact Inventory

| Artifact | Path |
|----------|------|
| Epic charter | `_bmad-output/implementation-artifacts/stories/epic-66/epic-66.md` |
| Coordination | `_bmad-output/implementation-artifacts/stories/epic-66/epic-66-coordination.md` |
| Readiness report | `_bmad-output/implementation-artifacts/stories/epic-66/epic-66-planning-readiness.md` |
| Story 66-1 | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-1.md` |
| Story 66-2 | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-2.md` |
| Story 66-3 | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-3.md` |
| Story 66-4 | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-4.md` |
| Story 66-5 | `_bmad-output/implementation-artifacts/stories/epic-66/story-66-5.md` |

---

## GO / NO-GO

| Dimension | Decision |
|-----------|----------|
| Planning review | GO |
| Implementation | NO-GO until explicit Epic 66 unfreeze approval |
