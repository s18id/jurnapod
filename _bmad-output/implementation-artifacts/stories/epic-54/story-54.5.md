# Story 54.5: AP Period-Close Enforcement Hardening

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** backlog

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-purchasing`, `modules-accounting`
**Sprint:** 54

---

## Problem Statement

Epic 47 implemented AP period-close guardrails (block postings to closed periods with override). This story hardens the enforcement to prove:
1. Closed periods correctly block new AP transactions
2. Override path requires high privilege and is audited
3. Backdated entries crossing period boundaries are blocked
4. Timezone-aware period boundaries are correct

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** Period-close bypass can post to closed periods silently. Second-pass review is **MANDATORY**.

**Second-pass checklist:**
- [ ] Posting to closed period is rejected
- [ ] Override path requires high privilege
- [ ] Override is audited
- [ ] Backdated entries crossing period boundaries are blocked
- [ ] Timezone-aware period boundary is correct
- [ ] No `Date.now()` or `Math.random()` introduced during fix
- [ ] 3× consecutive green evidence
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Posting to closed AP period is rejected
- **Given** AP period 2026-01 is closed
- **When** a user attempts to post an invoice dated 2026-01-15
- **Then** the post is rejected with 400 and error "Period is closed"

**AC2:** Override path requires high privilege
- **Given** AP period 2026-01 is closed
- **When** a CASHIER attempts to post with `override_period_close = true`
- **Then** the post is rejected with 403
- **When** a COMPANY_ADMIN attempts the same
- **Then** the post succeeds and is audited

**AC3:** Override is audited
- **Given** a COMPANY_ADMIN overrides a closed period to post an invoice
- **When** the post succeeds
- **Then** an audit log entry is created with:
  - `operation: "PERIOD_CLOSE_OVERRIDE"`
  - `user_id`, `company_id`, `period_id`
  - `reason` (required field)

**AC4:** Backdated entries crossing period boundaries are blocked
- **Given** current date is 2026-03-15; period 2026-01 is closed
- **When** a user attempts to post an invoice dated 2026-01-31 (backdated)
- **Then** the post is rejected even if the user has override privilege

**AC5:** Timezone-aware period boundary is correct
- **Given** company timezone is "Asia/Jakarta" (UTC+7)
- **When** period 2026-01 closes at 2026-01-31 23:59:59 Jakarta time
- **Then** an invoice dated 2026-01-31 22:00:00 Jakarta time is blocked
- **And** an invoice dated 2026-02-01 00:00:00 Jakarta time is allowed

**AC6:** Integration tests written and 3× consecutive green

**AC7:** Code review GO required

---

## Test Coverage Criteria

- [ ] Happy paths:
  - [ ] Post to open period succeeds
  - [ ] COMPANY_ADMIN override succeeds with audit
- [ ] Error paths:
  - [ ] 400: Post to closed period (no override)
  - [ ] 403: CASHIER override attempt rejected
  - [ ] 400: Backdated entry to closed period rejected
  - [ ] 400: Invoice at period boundary blocked correctly

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-period-close-enforcement.test.ts` | Create | Period-close enforcement tests |

## Estimated Effort

2 days

## Risk Level

Medium (P1 — period-close bypass allows posting to closed books)

## Dev Notes

- Period-close logic exists from Epic 47 — verify current implementation
- Timezone: use `resolveBusinessTimezone` from `@jurnapod/shared`
- Audit: use existing audit log infrastructure
- Override privilege: check against `module_roles` for `purchasing.period_close` MANAGE permission

## Dependencies

- Epic 47 (period close guardrails implemented)
- Stories 54.1 and 54.2

## Validation Evidence

```bash
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-period-close-enforcement.test.ts"
```
