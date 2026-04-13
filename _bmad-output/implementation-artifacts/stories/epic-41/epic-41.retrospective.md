# Epic 41 Retrospective: Backoffice Auth Token Centralization

> **Retrospective Format:** BMAD Party Mode (Multi-Agent Discussion)
> **Facilitated:** 2026-04-14
> **Agents:** Winston (Architect), Amelia (Developer), John (PM), Mary (Analyst), Murat (Test Architect), Paige (Tech Writer)

---

## Overview

| Field | Value |
|-------|-------|
| **Epic** | 41 — Backoffice Auth Token Centralization |
| **Completed** | 2026-04-13 |
| **Duration** | Single sprint |
| **Total Estimate** | 48h |
| **Stories Completed** | 6/6 |
| **Goal** | Centralize bearer token resolution inside `apiRequest()` to eliminate `accessToken` prop drilling through Router → Pages → Components → Hooks |

---

## Metrics

| Story | Title | Estimate | Priority | Status |
|-------|-------|----------|----------|--------|
| 41.1 | API Client Token Resolution | 8h | P0 | ✅ Done |
| 41.2 | Hook Token Migration | 12h | P0 | ✅ Done |
| 41.3 | Page/Component Token Migration | 16h | P0 | ✅ Done |
| 41.4 | Router Cleanup | 4h | P1 | ✅ Done |
| 41.5 | XHR Wrapper Functions | 6h | P1 | ✅ Done |
| 41.6 | Final Verification | 2h | P1 | ✅ Done |
| **Total** | | **48h** | | ✅ All Done |

**Files Modified:** `apps/backoffice/src/lib/api-client.ts`, `apps/backoffice/src/app/router.tsx`, 11 hook files, 4 page/component files

**Hooks Migrated (11):** use-journals, use-sales-invoices, use-outlet-account-mappings, use-modules, use-sales-orders, use-reservations, use-outlet-tables, use-table-board, use-export, use-variants, use-import

---

## What Went Well

### 1. Architecturally Sound Token Resolution Order
The three-tier fallback — `(1) explicit string arg → (2) options.accessToken → (3) getStoredAccessToken()` — is a textbook boundary layer design. Auth concern is now resolved at exactly the right layer: the HTTP client boundary. Anything closer to the UI is too late; anything deeper is too coupled.

### 2. Backward Compatibility Preserved
The optional overloaded arg pattern (`apiRequest(url, body, token?)`) meant zero breaking changes. Legacy callers continue to work; new callers use the clean zero-arg convention. This enabled incremental migration without a coordinated big-bang cutover.

### 3. 401 Refresh/Retry Logic Preserved
The original token-refresh cycle survived the refactor untouched. Preserving runtime auth behavior while completely changing how tokens are sourced is a subtle but critical win.

### 4. Clean Story Sequencing
Story 41.1 (API client foundation) was correctly sequenced first, unblocking all subsequent stories. The P0/P1 split front-loaded structural risk: even if the sprint had hit capacity issues, the critical architecture would have been in place.

### 5. Zero Regressions Across 6 Stories
TypeScript, ESLint, and build checks passed on every story. Strict TypeScript mode acted as a safety net for the mechanical 11-hook migration — any missed parameter would surface as a type error immediately.

### 6. XHR Wrapper Design
`uploadWithProgress()` and `applyWithProgress()` use `XMLHttpRequest` only where needed (progress events) and return Promises for clean integration — the right call over using fetch everywhere (no progress API) or XHR everywhere (loses clean fetch API). Minimal XHR surface area with maximum ergonomics.

### 7. Formal Verification Story (41.6)
Story 41.6 as a dedicated close-out story enforced a QA mindset at epic close rather than quietly finishing. This is good practice for refactoring epics where regressions are a risk.

### 8. Router Cleanup Timing
Story 41.4 (router cleanup) was sequenced after 41.2 and 41.3, ensuring all consumers were already self-sufficient before removing the token forwarding at the source. Correct order: migrate consumers first, clean the source last.

---

## What Could Be Improved

### 1. No Behavioral Regression Tests Written (P1 — Tech Debt)
The completion reports show typecheck/lint/build passing, but no runtime behavioral tests were written. Key untested scenarios:
- `apiRequest()` resolving token from storage when no explicit arg is provided
- The 401 refresh-and-retry cycle executing correctly with the new token source
- `uploadWithProgress` and `applyWithProgress` firing progress callbacks correctly

Typechecks cannot catch these. This is the most significant gap from the epic.

### 2. Story 41.5 Scope Overlap with 41.1
`uploadWithProgress` and `applyWithProgress` were already implemented in Story 41.1 and re-described in 41.5. Story boundaries weren't entirely crisp. In future epics, be sharper about not letting implementation bleed across story scopes — it complicates status tracking.

### 3. All Stories Completed Same Day — No Actual Time Tracking
All six stories were completed on 2026-04-13. We have no signal on actual flow time vs. estimated time. Future completion reports should record actual hours alongside estimates for estimation calibration.

### 4. Hook AC Not Enumerated Explicitly in Story 41.2
The 11 hooks were listed in the completion report but not explicitly named in the acceptance criteria. If a hook had been missed, the AC would technically still pass. For bulk migrations, enumerate every target in the AC.

### 5. XHR Wrappers Are Parallel Implementations — Divergence Risk
`uploadWithProgress` and `applyWithProgress` are parallel to `apiRequest`. Future enhancements to `apiRequest` (new error handling, request ID tracing, retry policy changes) won't automatically apply to the XHR wrappers. This should be documented with an alignment note in the code.

---

## Key Lessons Learned

| Lesson | Rule |
|--------|------|
| **Boundary-first migration** | For cross-cutting refactors, establish the canonical implementation first, then migrate consumers outward — never the reverse |
| **Optional arg for compat** | Overloaded optional arg is the right bridge pattern for incremental deprecation; use it for any future auth or config migration |
| **Refactoring stories need runtime tests** | AC should explicitly require behavioral regression tests, not just typecheck/build — static checks cannot validate runtime auth flows |
| **Source last, consumers first** | Always migrate consumers before cleaning the source layer (router token forwarding removed only after pages/hooks already migrated) |
| **Explicit AC for bulk migrations** | List every target file/function in story AC for bulk migrations, not just in the completion report |
| **Parallel XHR implementations need alignment notes** | Document any parallel implementations (vs. the canonical path) with explicit notes about keeping them aligned |
| **Verification story is a good practice** | A dedicated close-out story enforces a formal quality gate for refactoring epics |
| **Add @deprecated JSDoc early** | Deprecate the legacy calling convention in JSDoc immediately so IDEs surface warnings to future developers |

---

## Action Items

| # | Action | Owner | Priority | Target |
|---|--------|-------|----------|--------|
| AI-1 | Write behavioral regression test: `apiRequest()` token resolution path (mock `getStoredAccessToken`, verify header) | Dev | P1 | Next sprint |
| AI-2 | Write behavioral regression test: 401 refresh-and-retry cycle with new token source | Dev | P1 | Next sprint |
| AI-3 | Write behavioral regression test: `uploadWithProgress` progress callback fires correctly | Dev | P2 | Next sprint |
| AI-4 | Add `@deprecated` JSDoc to explicit `accessToken` arg and `options.accessToken` in `api-client.ts` | Dev | P2 | Next sprint |
| AI-5 | Update `project-context.md` with "Backoffice API Client" section documenting the resolution order and when to use each function (`apiRequest` vs `apiStreamingRequest` vs `uploadWithProgress` vs `applyWithProgress`) | Tech Writer | P2 | Next sprint |
| AI-6 | Add alignment note in `api-client.ts` XHR wrappers: "Keep error handling semantics aligned with `apiRequest()`" | Dev | P3 | Next sprint |
| AI-7 | Set sunset milestone for removing explicit `accessToken` arg from all production call sites | PM | P3 | Epic 45 |
| AI-8 | For future bulk migration stories: enumerate every target file/function explicitly in story acceptance criteria | SM | P2 | Process — effective immediately |

---

## Architectural Decisions Validated

### Token Resolution Order (ADR Candidate)
```
1. Explicit string arg (legacy backward compat)
2. options.accessToken (intentional override, testing)
3. getStoredAccessToken() (canonical new path — default for all new code)
```
**Rationale:** Progressive adoption — callers migrate naturally without a forced cutover. Also debuggable: resolution is explicit and traceable.

### XHR Wrappers for Progress Tracking
**Decision:** Use `XMLHttpRequest` only for progress-tracked operations; `fetch` for everything else.
**Rationale:** `fetch` has no upload progress API. Using XHR everywhere loses ergonomics. Minimal XHR surface area with Promise wrappers is the right balance.

---

## Agent Discussion Highlights

- **Winston (Architect):** "Every boundary decision you make today is tech debt or compounding value tomorrow. This one is compounding value."
- **Murat (Test Architect):** "Auth code without behavioral tests is a liability that compounds. Open a tech debt story before it ages."
- **Amelia (Developer):** "Add those `@deprecated` annotations — future-you will thank present-you."
- **Paige (Tech Writer):** "Completion reports are great for traceability but not discoverable day-to-day. The developer guide needs a living section on the API client."
- **John (PM):** "Book ~6h of tech debt in the next sprint to address the test coverage gap. Don't let it age."
- **Mary (Analyst):** "Enumerate every target in the AC for bulk migrations — closes the loophole of 'passes AC but missed a hook.'"

---

*Retrospective conducted via BMAD Party Mode — 2026-04-14*
