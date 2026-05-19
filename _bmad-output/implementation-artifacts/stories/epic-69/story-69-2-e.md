# Story 69-2-e: ReviewPanel Domain Interaction Hardening

Status: done

## Story

As a **backoffice financial user**,  
I want **ReviewPanel interaction behavior verified in browser-like component tests before purchasing forms consume it**,  
So that **keyboard, focus, modal, and navigation safety are proven before high-risk purchasing mutations use the foundation**.

## Context

Story 69-1 delivered ReviewPanel foundation and was signed off. Its review GO carried a P2 follow-up: full Playwright/component interaction coverage and hook DOM integration MUST be completed before first domain ReviewPanel consumption. Story 69-2-e closes that follow-up before 69-2-a/69-2-b/69-2-c/69-2-d implement purchasing domain screens.

Backoffice unfreeze for Epic 69 was approved by Ahmad on 2026-05-19.

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] Happy paths identified
- [x] Error paths identified
- [x] Edge cases identified
- [x] Test fixture needs identified
- [x] Integration/component test scope defined
- [x] Negative auth test role selected: N/A — no API authorization tests in this story

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|---------------|
| Keyboard-only user moves through ReviewPanel sections via Tab/Enter/Space | Accessibility | Playwright CT |
| Invalid section completion moves focus to first invalid field | Accessibility | Playwright CT |
| Confirmation modal traps focus and returns focus after close | Accessibility | Playwright CT |
| Unsaved-changes hook blocks current hash/custom navigation and permits confirmed leave | Safety | Playwright CT harness component |
| Reverted dirty form does not block navigation | Safety | Playwright CT harness component |
| `review_panel_v1` shadow mode does not render domain panel in production routes | Feature flag | Playwright CT |

**Readiness note:** QA subagent returned empty output twice on 2026-05-19. Direct readiness review identified that DOM/focus assertions MUST use Playwright CT because backoffice Vitest runs in `node` environment. This story was updated accordingly. QA implementation review remains mandatory before Done.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| N/A | N/A | `apps/backoffice` | N/A | N/A — this story validates UI interaction only and performs no API/domain error consumption. |

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|------------------|-----------|-------------------------|-----------------|
| 1 | Complete ReviewPanel interaction hardening before domain purchasing screens | `apps/backoffice` | Prevents first domain usage from relying only on static/unit coverage | Defer to 69-2-a (rejected: violates Story 69-1 review follow-up) | Winston GO — 69-2-e MUST complete before any purchasing domain screen consumes ReviewPanel. |

## API Contract Verification

No API endpoints are consumed. API contract verification is N/A for this story.

## Acceptance Criteria

**AC1: Keyboard Progression**  
Given a ReviewPanel with multiple sections, when a keyboard-only user navigates with Tab/Enter/Space, then section controls are reachable and activatable without a mouse.

**AC2: Invalid Field Focus**  
Given section validation fails, when the user attempts to complete the section, then focus moves to the first invalid field and the error is announced.

**AC3: Modal Focus Safety**  
Given an unsaved-changes confirmation modal is open, when the user tabs through controls, then focus remains trapped and dismissal returns focus predictably.

**AC4: Hash Router Guard**  
Given a dirty ReviewPanel form, when hash/custom-router navigation is attempted, then navigation is blocked until the user confirms leave.

**AC5: Feature Flag Behavior**  
Given `review_panel_v1` is in shadow mode, when the component is mounted in a production-like route, then domain UI does not render. Given enabled mode, then the panel renders.

## Tasks / Subtasks

- [x] Add Playwright CT interaction tests for ReviewPanel keyboard progression.
- [x] Add Playwright CT interaction tests for invalid-field focus movement.
- [x] Add Playwright CT interaction tests for modal focus trap and return focus.
- [x] Add Playwright CT harness tests for unsaved navigation guard DOM behavior.
- [x] Add Playwright CT feature flag render/hidden tests.
- [x] Update Story 69-1 completion notes if test filenames differ from planned names.

## Files to Create / Modify

| File | Action |
|------|--------|
| `apps/backoffice/components/ReviewPanel.interaction.spec.tsx` | Create Playwright CT interaction coverage |
| `apps/backoffice/components/UnsavedChangesGuardHarness.spec.tsx` | Create Playwright CT hook/guard DOM harness coverage |
| `apps/backoffice/src/components/ReviewPanel/*` | Modify only if tests reveal behavior gaps |
| `apps/backoffice/src/hooks/useUnsavedChangesGuard.ts` | Modify only if tests reveal behavior gaps |

## Validation Commands

```bash
npm run qa:ct -w @jurnapod/backoffice -- --grep "ReviewPanel|UnsavedChangesGuard"
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/ReviewPanel.test.ts
npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/useUnsavedChangesGuard.test.ts
npm run typecheck -w @jurnapod/backoffice
npm run lint -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
```

## Dependencies

- Story 69-1 MUST be done.
- Backoffice unfreeze MUST remain approved for Epic 69.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO and Ahmad owner sign-off.
