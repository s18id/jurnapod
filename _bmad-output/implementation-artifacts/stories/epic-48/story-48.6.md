# Story 48.6: Type/Lint Debt Containment (Touched-Hotspots Only)

**Status:** ready-for-dev

## Story

As a **platform engineer**,  
I want the files touched by Stories 48-2 through 48-4 to have reduced `any`/lint debt,  
So that future correctness fixes in these areas are not obscured by type noise.

---

## Context

The fiscal close correctness hardening (48-2) and AP reconciliation hardening (48-2) touched specific files. Story 48-6 applies targeted debt containment — not a broad refactor — to the touched scope only, per the sprint plan constraint: "Keep this bounded (no broad refactor)."

Current state: `npm run lint -w @jurnapod/api` shows **0 errors / 180 warnings** (the 34 pre-existing errors from kickoff have been resolved or classified as P2/touched-scope). The goal of 48-6 is to reduce warnings in the specifically touched files and prevent new `any` debt from being introduced.

**Dependencies:** Story 48-2 (done), 48-5 (CI gate enforcement — provides policy enforcement)

---

## Acceptance Criteria

**AC1: No New `any` Introduced in Touched Scope**
Files modified by Stories 48-2 and 48-4 (fiscal close, AP reconciliation, test fixtures) must not add new `@typescript-eslint/no-explicit-any` warnings. Verify by running lint and confirming no new warnings in these files.

**AC2: Touched Files Have Reduced Warnings (Optional)**
Where safe and unambiguous, replace `any` with specific types in the following files (priority order):
1. `apps/api/src/lib/fiscal-years.ts` (fiscal close approve path)
2. `apps/api/src/lib/purchasing/ap-reconciliation.ts` (date/timezone handling)
3. `apps/api/src/lib/purchasing/ap-reconciliation-snapshots.ts` (snapshot creation)
4. `apps/api/src/lib/test-fixtures.ts` (fixture helpers)

**AC3: No New Lint Warnings in Touched Scope**
Any new lint warnings introduced in touched scope must be fixed or explicitly tolerated with a comment. No silent additions.

**AC4: Pre-existing Warnings Outside Touched Scope Remain**
Do not fix pre-existing warnings outside the touched scope. Keep changes scoped to avoid scope creep.

---

## Tasks / Subtasks

- [ ] Identify all files touched by Stories 48-2 and 48-4 (fiscal close, AP reconciliation, test fixtures)
- [ ] Run lint and collect current warning count per touched file
- [ ] For each touched file, fix unambiguous `any` → specific type (do not guess types)
- [ ] Add eslint-disable-next-line comments for cases where `any` is genuinely required (with TODO to fix later)
- [ ] Verify no new warnings introduced in touched scope
- [ ] Document all tolerance decisions in story completion note

---

## Technical Constraints

- **Bounded scope:** Only files touched by 48-2/48-4 are in scope. Do not fix warnings in other files.
- **No type guessing:** If a type cannot be confidently determined, leave the `any` with a comment, don't guess.
- **No breaking changes:** Changes must not alter runtime behavior or API contracts.
- **Pre-existing warnings:** The 180 pre-existing warnings outside touched scope are tracked separately and are not in scope for this story.

---

## Files to Modify (Touched Scope)

| File | Scope Reason | Warning Count (approx) |
|------|-------------|------------------------|
| `apps/api/src/lib/fiscal-years.ts` | 48-2 fiscal close | 1 |
| `apps/api/src/lib/purchasing/ap-reconciliation.ts` | 48-2 AP reconciliation | 0 |
| `apps/api/src/lib/purchasing/ap-reconciliation-snapshots.ts` | 48-2 AP reconciliation | 0 |
| `apps/api/src/lib/test-fixtures.ts` | 48-2 fixture | 2 |
| `packages/modules/accounting/src/fiscal-year/service.ts` | 48-2 fiscal close | 0 |

---

## Validation Evidence

```bash
# Check warnings in touched files
cd apps/api
npx eslint src/lib/fiscal-years.ts src/lib/purchasing/ap-reconciliation.ts src/lib/purchasing/ap-reconciliation-snapshots.ts src/lib/test-fixtures.ts --format json | jq '[.[] | select(.messages | length > 0) | {file: .filePath, warnings: [.messages[] | select(.severity == 2)]}]'

# Expected: 0 new warnings introduced in touched scope
# Typecheck and lint must still pass after changes
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
```

---

## Dev Notes

- The current lint status (0 errors, 180 warnings) is already a significant improvement from the kickoff state (34 errors). 48-6 ensures this status is maintained and the touched scope is cleaned up where unambiguous.
- Do not chase every warning — only fix where the type is obvious and safe. Unknown types should get a `// TODO: type properly` comment and move on.
- The test files (e.g., `fiscal-year-close.test.ts`) are not in scope for lint cleanup unless they were modified as part of 48-2 implementation.

---

## Risk Disposition

- R48-006 (any debt): This story addresses the containment aspect. The 180 pre-existing warnings outside touched scope are not a story-48-6 target (deferred to future sprints). Story 48-6 target is **mitigating** → **closed** after touched-scope warnings are at zero new additions.