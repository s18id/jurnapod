# Story 69-3-b Readiness Coordination

**Story:** 69-3-b Chart of Accounts Screens  
**Date:** 2026-05-20  
**Coordinator:** Primary BMAD build agent  
**Status:** readiness review in progress

## Scope

Review `_bmad-output/implementation-artifacts/stories/epic-69/story-69-3-b.md` after Story 69-3-a completion and the account update API blocker fix.

## Implementation Gate

Story 69-3-b MUST NOT start backoffice UI implementation until:

- Architecture readiness GO is recorded.
- QA kickoff/readiness GO is recorded.
- Ahmad explicitly authorizes the 69-3-b backoffice unfreeze.

## Known Context

- Story 69-3-a is done and signed off.
- Account update API blocker is fixed and reviewed GO.
- Actual update method is `PUT /api/accounts/:id`, not PATCH.
- Account balances are not returned by account list/detail endpoints.
- Account detail does not return journal-line history.

## Delegated Reviews

| Reviewer | Focus | Status |
|----------|-------|--------|
| bmad-architect | Contract readiness, scope constraints, route/file convention alignment | NO-GO — P1 unfreeze, permission route metadata, typed schema alignment, unsupported legacy hooks |
| bmad-qa | Test readiness, fixture policy, negative auth, validation commands | NO-GO — P1 unfreeze, live API plan, permission personas, history scope, PUT method tests |

## Decision Log

| Date | Decision | Owner |
|------|----------|-------|
| 2026-05-20 | Started 69-3-b readiness review after account update blocker fix. | Primary BMAD build agent |
| 2026-05-20 | Readiness reviews returned NO-GO; story corrections required before implementation may start. | bmad-architect / bmad-qa |

## Open P1 Gates

| Gate | Required Resolution | Status |
|------|---------------------|--------|
| Backoffice unfreeze | Ahmad MUST explicitly authorize Story 69-3-b backoffice account screens and tests. | open |
| Route permission metadata | `/chart-of-accounts` route metadata MUST require `accounting.accounts.READ`; create/edit controls MUST use CREATE/UPDATE. | open |
| Typed API alignment | Implementation MUST either align typed schema for `/accounts/tree` and `PUT /accounts/:id`, or document temporary `apiRequest` bridge using shared contracts. | open |
| Unsupported legacy hooks | Existing unsupported account usage/reactivate/delete paths MUST be removed or scoped out when touched. | open |
| History scope | Story MUST either scope out history or verify journal query + `accounting.journals.READ`. | corrected in story — scoped out for 69-3-b |
| Test plan | Story MUST define live API, permission personas, PUT method lock, and PID/log validation. | corrected in story |
