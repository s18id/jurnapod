# Epic 70: Hardening — Accessibility, Internationalization, Testing, CI, Rollout

**Status:** ready-for-dev (backoffice unfreeze authorized by Ahmad on 2026-05-21)
**Sprint/Timebox:** Weeks 11–12 (of Backoffice Frontend Program)
**Theme:** Final program hardening for the redesigned backoffice: WCAG 2.2 AA accessibility, English/Indonesian internationalization, Playwright + axe coverage, typed-contract smoke tests, CI gates, CSP/browser hardening, bundle/performance verification, and rollout runbooks.
**Primary Modules:** `apps/backoffice`, `.github/workflows`, `docs/`
**Predecessor:** Epics 65–69 complete with no unresolved P0/P1 blockers
**Exit Gate:** Backoffice lint/typecheck/build/tests/e2e/a11y gates pass; English + Indonesian locale packs load; CSP and bundle-size gates are documented and enforced; rollout runbook is complete; adversarial review returns GO.

---

## 1) Charter

### 1.1 Program Alignment

Epic 70 closes the Backoffice Frontend Redesign & Hardening Program by proving that the redesigned React/Vite/Mantine backoffice is production-ready. It converts the research report's hardening guidance into verifiable release gates: accessibility, internationalization, browser security, test coverage, CI, performance, and rollout evidence.

This epic is a hardening and validation epic. It MUST NOT introduce new domain features. It MAY fix defects discovered by the hardening gates when those fixes are necessary to pass the release criteria.

### 1.2 What We Know

- The backoffice already has Playwright scripts: `qa:e2e`, `qa:e2e:axe`, and `qa:ct`.
- The repo uses Mantine and Playwright with `@axe-core/playwright` available in the backoffice workspace.
- The frontend research requires WCAG 2.2 AA, English + Indonesian localization, typed API client contract smoke tests, CI seriousness equivalent to backend gates, and static-SPA deployment behind Nginx.
- The production guide deploys backoffice static assets under `public_html/backoffice`; rollout evidence MUST include static deployment and rollback instructions.
- Backend ACL remains authoritative. Frontend permission checks are a UX mirror only.

### 1.3 Non-Goals

- No new backend API endpoints.
- No new purchasing, accounting, inventory, sales, or admin feature scope.
- No SSR migration.
- No POS app changes.
- No external OIDC/SSO integration.
- No broad design-system rewrite beyond defects required for WCAG 2.2 AA.
- No sales, dine-in, customer admin, or POS support domain screens — deferred to a future approved backoffice domain program.

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Statement | Story |
|----|-----------|-------|
| FR70-1 | The backoffice MUST meet WCAG 2.2 AA for the redesigned shell, navigation, tables, drawers, dialogs, forms, notifications, and dashboards | 70-1 |
| FR70-2 | Keyboard-only users MUST be able to complete login, navigation, EntityTable filtering, import/export, role editing, and financial review flows | 70-1 |
| FR70-3 | Focus states MUST be visible and MUST NOT be obscured by sticky headers, drawers, dialogs, or notification banners | 70-1 |
| FR70-4 | All form controls MUST have programmatic labels, accessible descriptions, and actionable validation messages | 70-1 |
| FR70-5 | The backoffice MUST set the document `lang` attribute and provide English and Indonesian locale packs | 70-2 |
| FR70-6 | UI strings, validation text, navigation labels, table headings, notification messages, and error messages MUST be externalized | 70-2 |
| FR70-7 | Date, number, currency, percentage, and relative-time rendering MUST use locale-aware formatters | 70-2 |
| FR70-8 | Critical flows MUST have Playwright e2e coverage across Chromium, Firefox, and WebKit | 70-3 |
| FR70-9 | Dense primitives (`EntityTable`, `FilterBar`, `DetailDrawer`, `AsyncJobDrawer`, `PermissionMatrix`, `ReviewPanel`) MUST have component or unit tests | 70-3 |
| FR70-10 | Typed API client contract smoke tests MUST verify representative route families against generated contracts or backend fixtures | 70-3 |
| FR70-11 | CI MUST run backoffice lint, typecheck, build, unit tests, Playwright e2e, axe accessibility checks, and bundle-size checks | 70-4 |
| FR70-12 | CSP/browser defense headers MUST be documented and verified for the static SPA deployment | 70-4 |
| FR70-13 | Bundle-size and route-chunk budgets MUST be captured and enforced | 70-4 |
| FR70-14 | A production rollout and rollback runbook MUST exist for static backoffice deployment | 70-5 |
| FR70-15 | Release evidence MUST include screenshots/log excerpts for accessibility, i18n, e2e, CI, CSP, and bundle gates | 70-6 |

### Non-Functional Requirements

| NFR | Statement | Validation |
|-----|-----------|------------|
| NFR70-1 | No unresolved P0/P1 issues MAY remain in backoffice release scope | Risk register + review gate |
| NFR70-2 | Automated axe checks MUST pass for all critical route families with zero serious/critical violations | `qa:e2e:axe` output |
| NFR70-3 | Bundle size MUST remain within the program budget established in Epic 65; if no baseline exists, Epic 70 MUST create the baseline before enforcing deltas | Vite build report |
| NFR70-4 | Playwright critical flows MUST be deterministic with no quarantine-only pass condition | CI logs |
| NFR70-5 | No raw `fetch`/`axios` calls MAY exist in domain code outside the typed API client boundary | Code audit / lint gate |
| NFR70-6 | No native `Date` business logic MAY be introduced; business timestamps MUST remain epoch milliseconds at frontend logic boundaries | Code audit |
| NFR70-7 | No new POS/offline sync behavior MAY change in this epic | POS smoke/e2e gate if touched |

---

## 3) Story Breakdown

### Story 70-1 — WCAG 2.2 AA accessibility audit and remediation

**Status:** ready-for-dev
**Type:** release hardening
**Risk:** High
**Dependencies:** Epics 65–69 UI surfaces complete

Perform a full accessibility audit of the redesigned shell and critical flows. Remediate issues in Mantine composition, custom data-grid primitives, staged forms, drawers, dialogs, notifications, permission matrix, and dashboards.

**Acceptance Criteria:**
- Given keyboard-only navigation, login → dashboard → user list → role editor → save review can be completed without a mouse.
- Given EntityTable focus movement, tab order is logical and visible focus is never hidden behind sticky headers.
- Given a dialog or drawer opens, focus is trapped inside it and returns to the triggering element on close.
- Given validation errors exist, each control exposes error text programmatically and a form-level summary links to invalid fields.
- Given a notification appears, screen readers receive an appropriate live-region announcement.
- Given `npm run qa:e2e:axe -w @jurnapod/backoffice` runs, serious and critical axe violations are zero for critical routes.

---

### Story 70-2 — Internationalization framework and English/Indonesian locale packs

**Status:** planned
**Type:** release hardening
**Risk:** Medium
**Dependencies:** Epics 65–69 route strings stabilized

Implement the i18n framework and first locale packs:
- Locale provider at the app root.
- English (`en`) and Indonesian (`id`) message catalogs.
- `lang` attribute update on locale switch.
- Locale-aware date, number, currency, percentage, and relative-time helpers.
- String extraction from shell, navigation, admin, inventory, operations, purchasing, accounting, notifications, and validation surfaces.

**Acceptance Criteria:**
- Given locale `en`, all critical navigation, table headings, forms, notifications, and validation messages render in English.
- Given locale `id`, all critical navigation, table headings, forms, notifications, and validation messages render in Indonesian.
- Given the locale changes, `document.documentElement.lang` updates to the selected locale.
- Given an Indonesian locale is active, IDR currency formats with Indonesian separators and symbol placement.
- Given missing translation keys exist, the build/test gate fails or emits a blocking diagnostic.
- Unit tests cover formatter output for date, money, decimal, and relative-time examples.

---

### Story 70-3 — Test pyramid completion: unit, component, e2e, accessibility, contract smoke

**Status:** planned
**Type:** release hardening
**Risk:** High
**Dependencies:** Epics 65–69 flows complete

Complete the frontend test pyramid:
- Vitest unit tests for pure helpers, permission checks, formatters, route guards, reducers/state machines, and API mappers.
- Playwright component tests for dense reusable primitives.
- Playwright e2e tests for critical flows across Chromium, Firefox, and WebKit.
- Axe checks embedded in e2e route smoke pack.
- Contract smoke tests against typed API client route families.

**Acceptance Criteria:**
- Given the unit suite runs, helpers for permissions, routing, i18n, formatting, and workflow state machines pass.
- Given component tests run, `EntityTable`, `FilterBar`, `DetailDrawer`, `AsyncJobDrawer`, `PermissionMatrix`, and `ReviewPanel` pass interaction tests.
- Given e2e runs across Chromium, Firefox, and WebKit, critical flows pass: login/session refresh, route guard denial, user role edit, inventory import validation, operations job progress, AP invoice review, journal post review.
- Given axe checks run, critical pages have zero serious/critical violations.
- Given typed API contract smoke tests run, representative auth, admin, inventory, operations, purchasing, accounting, and audit requests match the expected contract shape.

---

### Story 70-4 — CI gates, CSP/browser hardening, bundle/performance budgets

**Status:** planned
**Type:** infrastructure
**Risk:** Medium
**Dependencies:** 70-1 through 70-3 partially available

Extend CI and deployment hardening:
- Add required/advisory backoffice CI jobs for lint, typecheck, build, unit tests, Playwright e2e, axe, and bundle budget.
- Add or verify standardized workspace scripts: `test:unit`, `test:single`, and `build:report`.
- Add a bundle report artifact.
- Define CSP/browser hardening ownership for the static SPA deployment, update the rollout runbook with Nginx/header requirements, and verify those headers in staging/production.
- Add lint/check for raw `fetch`/`axios` outside the typed API client boundary.
- Add route chunk audit to prove lazy-loaded route modules.

**Acceptance Criteria:**
- Given a PR modifies `apps/backoffice`, CI runs backoffice lint, typecheck, build, test, e2e, axe, and bundle checks.
- Given CI uses story validation commands, the `test:unit`, `test:single`, and `build:report` scripts exist and execute from the backoffice workspace.
- Given bundle size exceeds the approved budget, the bundle gate fails or emits a blocking diagnostic according to the configured threshold.
- Given route chunks are inspected, domain route bundles are split and login does not include large domain pages.
- Given CSP header verification runs, required directives are present for the static SPA deployment and the runbook identifies the owner of Nginx/header configuration changes as the DevOps/infra owner, or the backoffice squad lead when no separate infra owner exists.
- Given domain code contains raw `fetch` outside `lib/api`, lint/check fails.

---

### Story 70-5 — Production rollout, rollback, observability, and runbook

**Status:** planned
**Type:** release readiness
**Risk:** Medium
**Dependencies:** 70-4 CI gates defined

Create production rollout documentation and release evidence for static SPA deployment:
- Build/deploy command sequence.
- Pre-deploy smoke checklist.
- Post-deploy health checks.
- Rollback procedure using the existing backup directory pattern from `docs/PRODUCTION.md`.
- Known-risk checklist for auth, CORS, CSP, WebSocket/SSE, cache invalidation, and stale service-worker assets.
- Operator-facing release notes.

**Acceptance Criteria:**
- Given a release engineer reads the runbook, they can deploy the backoffice static assets without extra context.
- Given rollback is required, the runbook provides exact commands and verification steps.
- Given service-worker cache is active, the runbook includes cache-busting and stale-client recovery instructions.
- Given production health verification runs, API health, auth refresh, operations progress, and static asset serving are checked.
- Given deployment completes, the runbook records artifacts: build hash, bundle report, e2e result, axe result, and rollback point.

---

### Story 70-6 — Program closeout, adversarial review, and release sign-off

**Status:** planned
**Type:** gate
**Risk:** High (program closure gate)
**Dependencies:** Stories 70-1 through 70-5 and Epics 65–69 complete

Perform final program closeout:
- Verify all program-level FR/NFR coverage.
- Run final quality gates.
- Run adversarial review with P0/P1/P2/P3 severity table.
- Record release evidence and any deferred P2/P3 items.
- Confirm zero unresolved P0/P1 before program sign-off.

**Acceptance Criteria:**
- Given the final gate runs, lint, typecheck, build, unit tests, e2e, axe, bundle, and CSP checks pass.
- Given the adversarial review completes, it returns GO with no unresolved P0/P1 findings.
- Given deferred findings exist, each is P2/P3 and includes owner, deadline, and success criterion.
- Given program sign-off occurs, the completion report links to evidence from all six epics and the production runbook.

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R70-001 | P1 | WCAG remediation may reveal structural issues in custom table/dialog primitives | Fix the primitives directly; do not patch each consumer independently |
| R70-002 | P1 | i18n extraction may miss strings embedded in validation schemas or table column definitions | Add missing-key detection and route-level locale smoke tests |
| R70-003 | P1 | Playwright suite may be flaky under multi-browser CI | Use deterministic fixture data, explicit waits on app state, and no arbitrary sleeps |
| R70-004 | P1 | CSP may block required assets or WebSocket/SSE progress | Validate CSP in staging with operations progress and auth refresh flows before production |
| R70-005 | P2 | Bundle budget may be exceeded by admin primitives and locale packs | Use route-level code splitting, analyze chunks, and lazy-load heavy domain modules |
| R70-006 | P2 | Static SPA service-worker cache may serve stale assets after deployment | Add cache-busting and stale-client recovery to the runbook |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Backoffice unfreeze authorized | Written authorization | ✅ Authorized by Ahmad on 2026-05-21 (Option A) |
| 2 | Epics 65–69 complete with no unresolved P0/P1 blockers | sprint-status.yaml + review evidence | ✅ Epics 65–69 marked done in sprint-status.yaml |
| 3 | Critical redesigned route list finalized | Program plan | ⚠️ Assigned to Story 70-1 before implementation starts |
| 4 | Bundle baseline captured in Epic 65 or early Epic 70 | Vite report artifact | ⚠️ Assigned to Story 70-4; kickoff build warning tracked as P2 |
| 5 | Staging environment available for CSP/WebSocket/SSE verification | Deployment checklist | ⚠️ Assigned to Stories 70-4 and 70-5 |
| 6 | SOLID/DRY/KISS kickoff gate scored | Manual review | ✅ Scored during kickoff; SOLID Unknown, DRY Pass, KISS Pass |

### 5.1 Kickoff Evidence — 2026-05-21

| Gate | Evidence | Result |
|------|----------|--------|
| Scope freeze override | Ahmad selected Option A for Epic 70 backoffice unfreeze | ✅ Pass |
| Backoffice lint | `npm run lint -w @jurnapod/backoffice` | ✅ Pass |
| API lint | `npm run lint -w @jurnapod/api` | ✅ Pass with existing warnings: 163 `no-explicit-any`, 0 errors |
| Shared library build | `npm run build:libs` | ✅ Pass |
| API typecheck | `npm run typecheck -w @jurnapod/api` | ✅ Pass |
| Backoffice typecheck | `npm run typecheck -w @jurnapod/backoffice` | ✅ Pass |
| Backoffice build | `npm run build -w @jurnapod/backoffice` | ✅ Pass with P2 chunk-size warning |
| Sprint tracking | Epic 70 appended to `sprint-status.yaml` using append-only process and canonical update utility for story entries | ✅ Pass |

### 5.2 SOLID / DRY / KISS Kickoff Score — 2026-05-21

| Area | Score | Rationale |
|------|-------|-----------|
| SOLID | Unknown | Available kickoff evidence did not include a code-level audit of backoffice primitives/routes. Story 70-1 MUST audit shared primitives before remediation. |
| DRY | Pass | The epic requires shared primitive remediation and MUST NOT patch each consumer independently. |
| KISS | Pass | The epic is hardening-only and MUST NOT introduce net-new domain features. |

### 5.3 Kickoff Risk Updates — 2026-05-21

| Risk ID | Severity | Status | Evidence / Required Action |
|---------|----------|--------|----------------------------|
| R70-KO-001 | P1 | Open | Critical redesigned route list MUST be finalized before Story 70-1 implementation begins. |
| R70-KO-002 | P2 | Open | Backoffice build passes but emits chunk-size warning: `pages` chunk `556.83 kB`; Story 70-4 MUST capture bundle baseline and enforce budgets. |
| R70-KO-003 | P1 | Open | CSP/WebSocket/SSE staging verification remains pending; Stories 70-4 and 70-5 MUST identify environment and owner. |
| R70-KO-004 | P3 | Open | API lint pre-flight passes with 163 existing `no-explicit-any` warnings and 0 errors; this is outside Epic 70 scope unless API files are touched. |

### 5.4 Epic 69 Carry-Forward Closeout Checklist

The first implementation story MUST reference and satisfy this checklist before completion:

- Story-level unfreeze evidence MUST be recorded.
- Contract verification MUST be recorded for any API-backed flow exercised by the story.
- Verified audit-link semantics MUST be recorded for any audit or financial evidence UI touched by the story.
- Reviewer GO MUST be recorded with no unresolved P0/P1 findings.
- Story owner sign-off MUST be recorded.
- Sprint-status validation MUST pass after status updates.

---

## 6) Exit Gate

1. **Build Gate:** `npm run lint -w @jurnapod/backoffice`, `npm run typecheck -w @jurnapod/backoffice`, and `npm run build -w @jurnapod/backoffice` pass.
2. **Accessibility Gate:** `npm run qa:e2e:axe -w @jurnapod/backoffice` passes with zero serious/critical violations on critical routes.
3. **i18n Gate:** English and Indonesian locale packs load; missing translation keys fail the test gate; locale-aware formatting tests pass.
4. **Test Gate:** Unit, component, e2e, and contract smoke suites pass across configured browsers.
5. **Security Gate:** CSP/browser hardening checks pass; no raw API bypasses outside the typed client boundary.
6. **Performance Gate:** Bundle-size and route-chunk budgets pass.
7. **Rollout Gate:** Production rollout/rollback runbook is complete and reviewed.
8. **Review Gate:** Adversarial review returns GO; unresolved P0/P1 count is zero.
9. **Program Gate:** Backoffice Frontend Program FR/NFR coverage map is complete with evidence links.

---

## 7) Validation Commands

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Unit tests
npm run test -w @jurnapod/backoffice

# Component tests
npm run qa:ct -w @jurnapod/backoffice

# E2E tests
npm run qa:e2e -w @jurnapod/backoffice

# Accessibility tests
npm run qa:e2e:axe -w @jurnapod/backoffice

# Bundle/chunk report
npm run build:report -w @jurnapod/backoffice

# Global gates that MUST remain green
npm run lint:migrations
npm run lint:fixture-flow
npx tsx scripts/validate-sprint-status.ts --epic 70
```

---

## 8) Required Evidence Artifacts

| Evidence | Required Location |
|----------|-------------------|
| Accessibility result | `_bmad-output/implementation-artifacts/stories/epic-70/story-70.1.completion.md` |
| i18n result | `_bmad-output/implementation-artifacts/stories/epic-70/story-70.2.completion.md` |
| Test pyramid result | `_bmad-output/implementation-artifacts/stories/epic-70/story-70.3.completion.md` |
| CI/security/performance result | `_bmad-output/implementation-artifacts/stories/epic-70/story-70.4.completion.md` |
| Rollout runbook | `docs/runbooks/backoffice-frontend-rollout.md` |
| Program closeout | `_bmad-output/implementation-artifacts/stories/epic-70/story-70.6.completion.md` |

---

_Last Updated: 2026-05-17_
