# Story 69-1: ReviewPanel and Staged Forms Pattern

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 69 --story 69-1 --status done --title reviewpanel-staged-forms` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **backoffice financial user**,  
I want **a reusable ReviewPanel component with staged form sections, autosave, and before/after diff**,  
So that **high-risk financial mutations are reviewed, validated, and confirmed before submission**.

## Context

Epic 69 delivers the highest-risk domain surfaces: finance and purchasing. All purchasing and accounting domain forms (Stories 69-2 through 69-4) depend on this foundation component. Epic 65 (EntityTable, typed API client, TanStack Query) and Epic 66 (Core Admin, permission model) are complete. Backoffice unfreeze for Epic 69 was approved by Ahmad on 2026-05-19. Implementation MUST still satisfy the story-level decision gates before code changes begin.

The ReviewPanel MUST enforce WCAG 2.2 error prevention guidance for legal/financial/data submissions. It MUST integrate with the existing Mantine + React Router backoffice stack.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** What are the 1-3 core success paths?
- [x] **Error paths identified:** What failure modes must be handled (validation, auth, not-found, conflict)?
- [x] **Edge cases identified:** Boundary conditions, empty states, race conditions, concurrent access
- [x] **Test fixture needs identified:** What canonical fixtures or seeded data are required?
- [x] **Integration test scope defined:** Which tests need real DB vs which are pure unit tests?
- [x] **Negative auth test role selected:** For permission-gated routes, use `CASHIER` or a dedicated low-privilege test role (NOT `OWNER`/`SUPER_ADMIN`). N/A for Story 69-1 because it is a UI foundation component with no API permission-gated route tests.

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Multi-section form renders with completion badges | Happy | Unit |
| Unsaved-changes guard blocks navigation on dirty form | Happy | Unit + Integration |
| Autosave restores draft after page reload | Happy | Unit |
| Before/after diff shows only changed fields in human-readable format | Happy | Unit |
| Final review step displays summary and confirmation checkbox | Happy | Unit |
| Invalid section shows red badge and prevents form submit | Error | Unit |
| Autosave conflict (simultaneous guard trigger) resolves cleanly | Edge | Unit |
| Empty form shows all sections as incomplete | Edge | Unit |
| Keyboard-only user completes section progression via Tab/Enter/Space and stepper controls | Accessibility | Component |
| Badge state changes and validation errors are announced to screen readers | Accessibility | Component |
| Focus moves to first invalid field on validation failure and remains trapped in confirmation dialog | Accessibility | Component |
| Section panels expose `aria-expanded`; badges/alerts/dialogs expose labels and descriptions | Accessibility | Unit + Component |
| Money values in diff output preserve configured decimal precision and do not truncate cents | Financial | Unit |
| Money fields reject negative amounts and reject zero when the field rules prohibit zero | Financial | Unit |
| Final review shows high-value warning when monetary delta exceeds configured threshold | Financial | Unit + Component |
| Draft older than TTL is ignored on restore | Draft Persistence | Unit |
| Submit success, logout, company switch, outlet switch, and explicit discard remove matching drafts | Draft Persistence | Unit |
| Malformed JSON draft is caught, warning is shown, and form starts clean | Draft Persistence | Unit |
| Multi-tab `storage` event conflict is handled deterministically | Draft Persistence | Unit |
| Mismatched draft schema version is rejected | Draft Persistence | Unit |
| Diff engine handles 3+ levels of nested objects | Diff Engine | Unit |
| Diff engine distinguishes array reorder from add/remove and handles empty array/null/undefined | Diff Engine | Unit |
| Diff engine detects added, deleted, changed, and unchanged fields | Diff Engine | Unit |
| Diff engine handles circular references with deterministic error and no infinite loop | Diff Engine | Unit |
| Diff engine formats dates and money as human-readable values | Diff Engine | Unit |
| Section-level validation catches cross-field errors | Validation | Unit |
| Restored drafts are re-validated against current rules and invalid restored data shows errors | Validation | Unit + Component |
| Pending async validation blocks section completion | Validation | Unit |
| localStorage disabled causes warning banner, autosave no-op, and submit remains available | Error | Unit + Component |
| Quota exceeded with no expired drafts shows warning and does not block submit | Error | Unit |
| Unsaved guard handles in-flight autosave before navigation proceeds or cancels | Edge | Unit |
| Reverted form values do not produce false dirty-state blocking | Edge | Unit |
| `review_panel_v1` shadow mode does not render in production routes; enabled mode renders | Feature Flag | Unit |
| Rapid field changes within 30 seconds do not trigger overlapping autosave writes | Edge | Unit |
| Component unmount removes all `beforeunload` and navigation adapter event listeners | Edge | Unit |

**Sign-off:** Initial QA reviewer: `bmad-qa` on 2026-05-19.

**Final QA Re-review Sign-off:** GO — All E58-A1 and E33 blockers resolved with N/A rationale. Autosave debounce and listener cleanup scenarios verified present. No P0/P1 findings. One P2 checklist formatting item noted and resolved. Approved for implementation kickoff. Reviewer: `bmad-qa` on 2026-05-19.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [x] Producer error classes are enumerated for this story.
- [x] Consumer catch paths validate `instanceof` checks for each producer error class.
- [x] Consumer catch paths include `error.name` fallback handling for cross-package boundary mismatches.
- [x] Error response mapping is deterministic across `instanceof` and `error.name` detection paths.
- [x] Any missing fallback path is recorded and blocked before implementation starts.

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| `ValidationError` | `@jurnapod/shared` | `apps/backoffice` | N/A | N/A — Story 69-1 does not consume shared package domain errors or call API endpoints; validation errors are local UI validation states only. Future consuming stories MUST complete this matrix for real API/domain errors. |
| `ApiError` | `apps/backoffice/src/lib/api-client.ts` | `apps/backoffice` | N/A | N/A — Story 69-1 is a foundation UI component and does not perform API calls. Future consuming stories MUST verify `ApiError` handling where API mutations are introduced. |

**Hard gate:** Domain errors MUST be handled deterministically across module boundaries. Consumer code MUST NOT rely on `instanceof` only when cross-package loading can break prototype identity.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** List all modules this story reads/writes
- [x] **Cross-module decisions identified:** List each decision that spans module boundaries
- [x] **Winston sign-off obtained:** Each decision must have Winston's explicit written sign-off in the story file
- [x] **Decisions recorded:** Each decision is written in the `Decisions` table below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Guarded localStorage vs IndexedDB for draft persistence | `apps/backoffice` | localStorage is acceptable only for small JSON-only drafts when keys are user-scoped, tenant-scoped, scope-aware, versioned, TTL-bound, and cleaned up on submit/logout/company switch. Drafts MUST NOT contain secrets, tokens, passwords, or irreversible sensitive payloads. Draft keys MUST include `companyId`, `userId`, optional `outletId`, `formType`, `entityId` or generated `draftId`, and schema version. | IndexedDB (MAY be used later for attachments, large structured drafts, or payloads that exceed localStorage quota); server-side drafts (rejected for 69-1 foundation because it would introduce backend scope) | Winston Sign-Off: GO — Approved. localStorage draft persistence is acceptable for Story 69-1 only with the documented user/tenant/outlet/form/entity-or-draft scoped keys, generated draft IDs, schema version, TTL, cleanup triggers, quota handling, restore mismatch refusal, JSON-only payloads, and explicit exclusion of secrets, tokens, passwords, files, and attachments. |
| 2 | Composed unsaved-changes guard using active-router adapter + `beforeunload` | `apps/backoffice` | The active backoffice router is hash/custom navigation, so React Router `useBlocker` alone would miss current SPA navigation. The guard MUST compose: active-router navigation adapter for hash/shell/link navigation, browser `beforeunload` for hard reload/close, and React Router `useBlocker` only when RouterBridge/cutover is active. | `useBlocker` only (rejected: incomplete for current hash router); `beforeunload` only (rejected: misses SPA navigation) | Winston Sign-Off: GO — Approved. The unsaved-changes guard MUST compose the active hash/custom router navigation adapter with browser beforeunload protection; React Router useBlocker MAY be used only when RouterBridge/cutover is active and MUST NOT be the sole navigation blocker. |

**Hard gate:** Implementation MUST NOT begin until all rows in the table above have Winston's sign-off. Stories without this section completed will be returned to planning.

---

## API Contract Verification (MANDATORY for UI Stories)

> **Purpose:** Verify all API endpoints return expected contract shapes BEFORE starting UI implementation.
> *"Endpoint exists" ≠ "Endpoint is complete"*

### Pre-Implementation Checklist

- [ ] Call each API endpoint directly (e.g., via curl, Postman, or API client)
- [ ] Verify response shape matches API contract in story or shared package
- [ ] Verify required fields are present and not null/placeholder
- [ ] Verify authentication/authorization works as expected
- [ ] Verify error responses (400, 401, 403, 404, 500) are properly shaped
- [ ] Document any API gaps discovered in the table below

### API Endpoint Verification Results

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|---------|-------|
| N/A (foundation component) | — | — | N/A | This story builds UI primitives; API verification is deferred to Stories 69-2 and 69-3 |

### API Gaps Found (Document Here)

| Gap | Impact | Resolution |
|-----|--------|-----------|
| None identified | — | — |

---

## Acceptance Criteria

**AC1: Sectioned Form Layout**
**Given** a multi-section form (e.g., AP invoice)
**When** the form renders
**Then** each section displays a completion badge (red for incomplete, yellow for in-progress, green for complete)

**AC2: Unsaved-Changes Guard**
**Given** the user has typed in a field and the form is dirty
**When** the user attempts to navigate away via browser back/forward, link click, or route change
**Then** a confirmation dialog blocks navigation and offers "Stay" or "Leave" options

**AC3: Autosave Draft Restoration**
**Given** autosave is enabled and the user has entered data
**When** the page reloads after an accidental close or crash
**Then** the form state is restored from a user-scoped, tenant-scoped localStorage draft within 1 second

**AC4: Before/After Diff**
**Given** an edit form with existing data
**When** the user reaches the final review step
**Then** a human-readable diff shows old and new values for all changed fields; unchanged fields are collapsed or omitted

**AC5: Final Review Step**
**Given** all sections are complete and valid
**When** the user proceeds to the final step
**Then** a summary displays: affected entity links, scope badges (company, outlet, period), and a "Save and log change" button

**AC6: Inline Validation**
**Given** a field with validation rules
**When** the field loses focus (on blur)
**Then** inline validation feedback appears immediately; section-level validation runs on section completion

**AC7: Unit Test Coverage**
**Given** the ReviewPanel component and hooks
**When** unit tests execute
**Then** dirty state detection, autosave serialization, diff calculation, and blocker integration are all verified

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

> Not applicable — this story creates new components, not a migration.

## Test Coverage Criteria

- [ ] Coverage target: 90% of component logic (hooks, diff engine, guard logic)
- [ ] Happy paths to test:
  - [ ] Multi-section form renders with correct badges
  - [ ] Autosave persists and restores only matching user/company/outlet/form/schema drafts
  - [ ] Before/after diff shows only changed fields
  - [ ] Final review step renders summary
  - [ ] Keyboard-only navigation completes section progression
  - [ ] Screen reader announcements cover badge state changes and validation errors
  - [ ] `review_panel_v1` enabled mode renders ReviewPanel in approved routes
- [ ] Error paths to test:
  - [ ] Invalid section prevents form submission
  - [ ] Autosave serialization failure is handled gracefully
  - [ ] Diff engine handles null/undefined old values
  - [ ] localStorage quota failure shows a warning and does not block form submission
  - [ ] Draft restore refuses mismatched user/company/outlet/schema drafts
  - [ ] Unsaved guard blocks current hash-router navigation, browser back/forward, shell link navigation, and hard reload/close
  - [ ] localStorage disabled/private browsing shows warning banner, autosave no-ops, and submit remains available
  - [ ] Quota exceeded with no expired drafts shows warning and stops autosave without blocking submit
  - [ ] Malformed draft JSON is caught, warning shown, and form starts clean
  - [ ] Negative amount and prohibited-zero money fields are rejected
  - [ ] Pending async validation blocks section completion
  - [ ] `review_panel_v1` shadow mode does not render ReviewPanel in production routes
  - [ ] Confirmation dialog traps focus and exposes accessible labels/descriptions
  - [ ] Focus moves to first invalid field after section validation failure
- [ ] Financial-grade edge paths to test:
  - [ ] Money precision is preserved in diff output and cents are not truncated
  - [ ] High-value monetary delta shows warning state in final review
  - [ ] Financial field values restored from draft match persisted values exactly after validation
  - [ ] Cross-field validation catches interdependent field errors
- [ ] Draft persistence edge paths to test:
  - [ ] TTL-expired draft is ignored on restore
  - [ ] Draft cleanup occurs on submit success, logout, company switch, outlet switch, and explicit discard
  - [ ] Multi-tab `storage` event conflict follows documented behavior
  - [ ] Generated `draftId` prevents collisions between multiple new-entity drafts
- [ ] Diff engine edge paths to test:
  - [ ] 3+ level nested object changes are reported at the correct path
  - [ ] Arrays distinguish reorder from add/remove
  - [ ] Added, deleted, changed, and unchanged fields are categorized correctly
  - [ ] Circular references produce deterministic error and no infinite loop
  - [ ] Date and money values are type-formatted for human readability
- [ ] Guard edge paths to test:
  - [ ] In-flight autosave resolves cleanly before navigation proceeds or cancels
  - [ ] Programmatic navigation and user-initiated navigation both trigger guard when dirty
  - [ ] Same-route hash changes follow documented guard behavior
  - [ ] Touched form reverted to original values does not block navigation
  - [ ] Rapid field changes within 30 seconds are debounced/deduplicated and do not trigger overlapping autosave writes
  - [ ] Component unmount removes all `beforeunload`, `storage`, and navigation adapter event listeners

## Test Fixtures

**Complete this section if the story introduces new data patterns, extraction/migration work, or canonical patterns.**

> Reference: [AGENTS.md](../../AGENTS.md) - "Canonical Test Fixtures" and "Extraction Story Checklist" sections

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures
- [ ] Existing canonical fixtures reviewed for reuse potential
- [ ] Fixture location determined by ownership model

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createMockReviewPanelState()` — deterministic multi-section form state for unit tests
  - [ ] `createMockDiffPayload()` — old/new value pairs for diff engine tests
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [ ] Existing tests audited against new canonical patterns
- [ ] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Scaffold `ReviewPanel` component with sectioned card layout
- [ ] Implement section completion state machine (incomplete → in-progress → complete)
- [ ] Implement `useFormAutosave` hook (guarded localStorage, 30s interval, section completion trigger, TTL/schema version, cleanup on submit/logout/company switch)
- [ ] Implement `useUnsavedChangesGuard` hook (active-router navigation adapter + `beforeunload`; React Router `useBlocker` only when RouterBridge/cutover is active)
- [ ] Implement inline validation hook (field-level on blur, section-level on complete)
- [ ] Implement `DiffEngine` utility (old/new comparison, human-readable output)
- [ ] Implement final review step UI (summary, scope badges, confirmation checkbox)
- [ ] Write unit tests for all hooks and utilities
- [ ] Write Playwright component tests for ReviewPanel interactions
- [ ] Document component API and usage examples

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/components/ReviewPanel/ReviewPanel.tsx` | Main ReviewPanel component |
| `apps/backoffice/src/components/ReviewPanel/ReviewSection.tsx` | Individual section card |
| `apps/backoffice/src/components/ReviewPanel/ReviewStepper.tsx` | Section progression indicator |
| `apps/backoffice/src/components/ReviewPanel/DiffView.tsx` | Before/after diff display |
| `apps/backoffice/src/components/ReviewPanel/index.ts` | Public exports |
| `apps/backoffice/src/hooks/useFormAutosave.ts` | Autosave draft hook |
| `apps/backoffice/src/hooks/useUnsavedChangesGuard.ts` | Navigation blocker hook |
| `apps/backoffice/src/hooks/useFormValidation.ts` | Inline validation hook |
| `apps/backoffice/src/lib/diff-engine.ts` | Diff calculation utility |
| `apps/backoffice/__test__/unit/components/ReviewPanel.test.ts` | Unit tests |
| `apps/backoffice/__test__/unit/hooks/useFormAutosave.test.ts` | Hook tests |
| `apps/backoffice/__test__/unit/hooks/useUnsavedChangesGuard.test.ts` | Hook tests |
| `apps/backoffice/__test__/unit/lib/diff-engine.test.ts` | Utility tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/components/index.ts` | Modify | Export ReviewPanel |
| `apps/backoffice/src/hooks/index.ts` | Modify | Export new hooks |

## Estimated Effort

5 days

## Risk Level

High

## Dev Notes

- **Unfreeze Authorization:** Backoffice unfreeze for Epic 69 was approved by Ahmad on 2026-05-19. This story MUST still satisfy all decision gates before implementation begins.
- **localStorage key format:** `jp:draft:v1:{companyId}:{userId}:{outletId|global}:{formType}:{entityId|draftId}`. `draftId` MUST be generated for new unsaved entities to avoid collisions between multiple drafts.
- **Draft scope guardrails:** Draft metadata MUST include `companyId`, `userId`, optional `outletId`, `formType`, `entityId` or `draftId`, `schemaVersion`, `createdAt`, and `updatedAt`. Restore MUST refuse drafts when any scope field or schema version does not match the current context.
- **Draft TTL and cleanup:** Drafts MUST expire after a documented TTL. Submit success, logout, company switch, outlet switch, and explicit discard MUST remove matching drafts. Quota cleanup MAY remove expired drafts before current drafts.
- **Draft security:** Drafts MUST NOT store passwords, access tokens, refresh tokens, secrets, or files/attachments. JSON-only financial form data MAY be stored when scoped and TTL-bound. Attachments or large drafts MUST use another persistence strategy.
- **Autosave interval:** 30 seconds AND on `beforeunload` event
- **Diff engine:** MUST handle nested objects and arrays; use a structured diff format (not raw JSON) per NFR69-4
- **Mantine version:** Use existing Mantine v7.x hooks; verify `useBeforeUnload` availability
- **Navigation guard:** Use the active backoffice navigation model. Current hash/custom navigation MUST be protected through a navigation adapter. Browser hard reload/close MUST be protected through `beforeunload`. React Router `useBlocker` MAY be added only when the RouterBridge/cutover is active.
- **Accessibility:** All badges, alerts, and dialogs MUST have ARIA labels and keyboard navigation
- **Cleanup Policy (MANDATORY):** Any code change in this story MUST include a cleanup pass for resolved TODO/FIXME comments, outdated comments, and dead code paths in the modified area.

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? No (foundation component; audit is the responsibility of consuming stories)

### Idempotency
- [ ] Idempotency key field: N/A
- [ ] Duplicate handling: N/A

### Feature Flags
- [ ] Feature flag required? Yes
- [ ] Flag name: `review_panel_v1`
- [ ] Rollout modes: `shadow` → `10` → `50` → `100`
- [ ] Shadow mode behavior: Component renders behind a development-only route until `10` rollout

### Validation Rules
- [ ] `company_id` must match authenticated company (enforced by tenant-scoped localStorage keys)
- [ ] `user_id` must match authenticated user (enforced by user-scoped localStorage keys)
- [ ] `outlet_id` must match selected outlet when the form is outlet-scoped
- [ ] Draft schema version must match the current ReviewPanel draft schema version

### Error Handling
- [ ] Retryable errors: Autosave retry on `QuotaExceededError` (clear old drafts)
- [ ] Non-retryable errors: localStorage disabled (show warning banner)
- [ ] Error response format: `{ success: false, error_message: string }` (for API calls from consuming stories)

### Health Check
- [ ] Health check required? No

## File List

- `story-69-1.md` (this file)
- `ReviewPanel.tsx` (new)
- `useFormAutosave.ts` (new)
- `useUnsavedChangesGuard.ts` (new)
- `diff-engine.ts` (new)

## Validation Evidence

- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/review-panel.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/useFormAutosave.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/useUnsavedChangesGuard.test.ts` passes
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib/diff-engine.test.ts` passes
- `npm run qa:ct -w @jurnapod/backoffice -- --grep "ReviewPanel|StagedForm|Diff"` passes
- `npm run typecheck -w @jurnapod/backoffice` passes
- `npm run lint -w @jurnapod/backoffice` passes

## Dependencies

- Epic 65 (Core Admin — EntityTable, typed API client, TanStack Query) — MUST be complete
- Epic 66 (Backoffice Frontend Foundation) — MUST be complete
- Explicit backoffice unfreeze authorization — ✅ obtained from Ahmad on 2026-05-19

## Shared Contract Changes (MANDATORY for Constants/Types)

### Blast Radius Check (E33-A1)
- [x] Grep for all usages of the changed constant/type in other packages
- [x] Grep for all usages in test files
- [x] Run consuming package tests — all must pass
- [x] Document any consumer files that needed updates

**Result:** N/A — Story 69-1 introduces no shared constants/types and does not modify packages under `packages/*`. `apps/backoffice/src/components/index.ts` is an app-local barrel export, not a cross-package shared contract. Backoffice unit/type/build gates remain required for validation.

### Constant Change Verification (E33-A4)
- [x] Update all test expectations that reference the constant
- [x] Verify no hardcoded assertion values remain from old constants
- [x] Cross-reference with canonical fixtures

**Result:** N/A — No constants are introduced or changed by this story.

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `apps/backoffice/src/components/index.ts` | N/A | App-local barrel export only; validated by backoffice typecheck/build rather than shared-contract blast-radius audit. |

## Technical Debt Review

Complete before marking story done. If any box is checked, add a TD item to [TECHNICAL-DEBT.md](../adr/TECHNICAL-DEBT.md) before closing.

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [ ] No `as any` casts added without justification and TD item
- [ ] No deprecated functions used without a migration plan
- [ ] No N+1 query patterns introduced
- [ ] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [ ] Integration tests included in this story's AC (not deferred)
- [ ] All new debt items added to registry before story closes

## Notes

- **Story Done Authority (MANDATORY):** The implementing developer MUST NOT mark their own story done. Done requires:
  - Reviewer GO (code review approval with no blockers)
  - Story owner explicit sign-off
- **Definition of Done (MANDATORY):**
  - All acceptance criteria implemented with evidence
  - Unit tests written and passing in `__test__/unit/`
  - `npm run typecheck -w @jurnapod/backoffice` passes
  - `npm run build -w @jurnapod/backoffice` passes
  - Code review completed with no blockers
  - AI review conducted (`bmad-review` agent)
  - Story completion report created (`story-69-1.completion.md`) with all AC evidence and second-pass reviewer sign-off
- **Backoffice Freeze:** Backoffice unfreeze for Epic 69 was approved by Ahmad on 2026-05-19. All preflight gates (lint, typecheck, build) MUST pass before kickoff.
