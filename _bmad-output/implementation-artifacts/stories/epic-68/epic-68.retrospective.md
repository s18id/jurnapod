# Epic 68 Retrospective — Backoffice Async Workflows: Operations, SSE, Notifications, Audit

**Epic:** 68  
**Status:** done  
**Date:** 2026-05-19  
**Facilitator:** bmad-review

---

## Step 0 — Validation Gate

| Gate | Result | Evidence |
|------|--------|----------|
| Sprint status validation | ✅ PASS | `npx tsx scripts/validate-sprint-status.ts` returned healthy status after `epic-68: done` and `epic-68-retrospective: done` |
| Story completion authority | ✅ PASS | Stories 68-0 through 68-5 each have reviewer GO and owner sign-off |
| Completion reports | ✅ PASS | `story-68-0.completion.md` through `story-68-5.completion.md` exist |
| Scope freeze | ✅ PASS | `apps/pos` remained untouched; `apps/backoffice` changes confined to Epic 68 scope |
| P0/P1 unresolved count | ✅ PASS | 0 unresolved P0/P1 findings at epic close |

---

## 1) Epic Objective and Outcome Summary

### Objective

Deliver backoffice async workflow infrastructure: operations monitoring (async jobs), real-time connectivity investigation (SSE), notification system (toast/inbox/banner), audit timeline explorer, and layered dashboards (global admin overview, domain summaries, personal work panel).

### Outcome

**All 6 stories completed, signed off, and verified.**

- **68-0 SSE Connectivity Verification** — Contract artifact documenting backend operations endpoints, SSE/polling feasibility, auth/proxy findings, and WebSocket `/ws` P0 auth bypass
- **68-1 AsyncJobDrawer** — Global async job monitoring drawer with `platform.operations` ACL migration
- **68-2 Operations Center** — Dedicated operations page with list, filter, status grouping, and detail view
- **68-3 Notification System** — Toast (auto-dismiss), inbox (persistent with deep-links), banner (blocking with acknowledge)
- **68-4 Audit Timeline** — Reverse-chronological audit log explorer with diff preview; `platform.audit` ACL resource introduced (E66-A1 resolution)
- **68-5 Layered Dashboards** — Global Admin Overview (health, metrics), Domain Dashboards (inventory/accounting/purchasing summaries), My Work panel (failed jobs, pending approvals, drafts)

### Delivery Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 6/6 (100%) |
| Unit tests added | 6 (dashboard card states, health status, permission visibility) |
| Integration tests added | 9 (dashboard summary endpoint ACL + data validation) |
| ACL migrations | 2 (`platform.operations`, `platform.audit`) |
| P0 findings resolved | 0 |
| P1 findings resolved | 0 |
| P2 findings resolved | 0 |
| Review cycles required | 1 (68-5 reviewed GO on first pass) |

---

## 2) Story Completion Table

| # | Story | Tests | Key Outcomes | Risk |
|---|-------|-------|-------------|------|
| 68.0 | SSE Connectivity Verification | — | Contract artifact: 4 backend operations endpoints inventoried; SSE auth gap documented; `/ws` P0 bypass discovered and banned; polling confirmed as safe default | High |
| 68.1 | AsyncJobDrawer | — | Global drawer with live status; `platform.operations` ACL migration; per-role visibility | Medium |
| 68.2 | Operations Center | — | Filtered list (status/type); status grouping; detail drawer with metadata | Medium |
| 68.3 | Notification System | — | Toast (5s auto-dismiss), inbox (persistent), banner (blocking); deep-link support | Medium |
| 68.4 | Audit Timeline | — | Reverse-chronological sorting; diff preview (top 3 fields); `platform.audit` ACL (E66-A1 closed) | Medium |
| 68.5 | Layered Dashboards | 15 (6 unit + 9 integration) | API-gap pattern for unverifiable sources; per-card refresh intervals; outlet-scoped inventory summary; old dashboard deprecation | High |

---

## 3) What Went Well

1. **Contract-first investigation prevented implementation waste** — Story 68-0 explicitly investigated backend endpoint contracts before any UI was built. This confirmed: (a) SSE is not viable with bearer token auth via native `EventSource`, (b) `/ws` has a P0 auth bypass and is permanently banned, (c) polling is the safe default. Without 68-0, Stories 68-1 through 68-5 might have been spec'd against incorrect SSE assumptions.

2. **E66-A1 finally closed after 2-epic deferral** — The `platform.audit` ACL resource was deferred from Epic 66 and 67. Epic 68-4 delivered migration `0211_acl_platform_audit.sql`, updated all audit routes to `platform.audit.READ`, updated the AGENTS.md ACL matrix, and added integration tests. The action item is formally closed.

3. **API-gap pattern prevents false confidence** — Story 68-5 introduced an explicit `{apiGap: true, message: string}` state for dashboard cards where no verified source exists (pending approvals, recent stock movements, reconciliation counts). This is safer than hardcoding `0` or omitting the card entirely.

4. **Reviewer GO on first pass for 68-5** — The layered dashboards story passed adversarial review on the first cycle with no P0/P1 findings. Key factors: strict outlet_id validation for inventory summary, thin route adapters, per-card refresh intervals, and proper deprecation handling for legacy admin endpoints.

5. **Notification system layers are composable** — Toast, inbox, and banner are separate layers that can be triggered independently. The inbox persists across sessions; banners block until acknowledged. This matches the severity escalation pattern (info → warning → blocking).

---

## 4) What Didn't Go Well — Root Cause Analysis

### 4.1 SSE auth gap discovered late in the program

**Symptom:** Native `EventSource` cannot send `Authorization: Bearer` headers. SSE requires either fetch-based streaming (custom implementation) or cookie-based auth with proxy/CORS verification. No staging evidence exists for either path.

**Root cause:** The backoffice async workflow epic assumed SSE was a viable transport for real-time updates. The limitation of native `EventSource` (no custom headers) is a well-known browser constraint, but it was not verified before the epic was planned. The contract artifact (68-0) caught this before implementation, but the epic scope had already been framed around SSE.

**Mitigation:** Polling is the safe default throughout. All dashboard cards use configurable refresh intervals (30s–300s). The SSE investigation is documented in the contract artifact for future reference if staging evidence becomes available.

**Lesson:** Before planning an epic around a browser transport (SSE, WebSocket, WebRTC), verify the auth model compatibility with the project's token storage strategy (bearer tokens in `localStorage`). Do not assume transports work with existing auth patterns.

### 4.2 E67-A2 action item still open after 2-epic deferral

**Symptom:** "Add rendered component interaction tests for ExportDialog and ImportWizard" (E67-A2) was due at Epic 68 pre-close. It was not addressed.

**Root cause:** Epic 68 scope (async workflows, operations, notifications, audit, dashboards) does not include import/export dialog components. The action item was correctly out-of-scope but should have been explicitly reassigned.

**Mitigation:** E67-A2 remains open and must be assigned to a future epic that touches import/export UI.

**Lesson:** Action items with deadlines that pass without in-scope work must be explicitly reassigned or closed with justification. Do not let action items silently age.

---

## 5) Epic 67 Action Item Follow-Through

| # | Action Item | Owner | Deadline | Status | Evidence |
|---|-------------|-------|----------|--------|----------|
| E66-A1 | Introduce dedicated `platform.audit` ACL resource | Architecture team | Epic 67 kickoff | ✅ **CLOSED** | Migration `0211_acl_platform_audit.sql` delivered in Story 68-4; routes updated; AGENTS.md matrix updated; integration tests added |
| E66-A2 | Align generated OpenAPI query parameter types with runtime Zod validation for generic audit list filters | API platform team | Epic 68 pre-close | 📋 **DEFERRED** | Out of scope for Epic 68. No OpenAPI generation work was performed. |
| E67-A2 | Add rendered component interaction tests for ExportDialog and ImportWizard | QA | Epic 68 pre-close | 📋 **STILL OPEN** | Out of scope for Epic 68. Must be assigned to a future epic touching import/export UI. |

---

## 6) Risk/Findings Resolution Summary

| ID | Severity | Description | Disposition |
|----|----------|-------------|-------------|
| R68-001 | P0 | `/ws` fallback assigns `userId=1/companyId=1` to any token — auth bypass | ✅ **MITIGATED** — `/ws` permanently banned for Epic 68; documented in contract artifact; not used in any production code |
| R68-002 | P1 | SSE may not work through corporate proxies or with bearer auth | ✅ **CLOSED** — Polling is safe default; SSE requires staging evidence before adoption |
| R68-003 | P1 | Dashboard stubs may present hardcoded `0` as factual data | ✅ **MITIGATED** — API-gap pattern renders explicit "Data source unavailable" state; no hardcoded zeros |
| R68-004 | P2 | Inventory summary without outlet_id may leak cross-outlet data | ✅ **MITIGATED** — `GET /api/dashboard/inventory-summary` requires `outlet_id`; route validates and ACL-checks it |
| R68-005 | P2 | Old `/admin/dashboard/*` routes may confuse users | ✅ **MITIGATED** — Deprecation HTML notice with redirect link to `/#/dashboard`; hash redirect maps old URLs |
| F68-001 | P3 | Legacy admin dashboard route handlers unreachable after deprecation | 📋 **FOLLOW-UP** — Safe to remove in future cleanup story once deprecation behavior is finalized. Tracked in story-68-5 completion report. |

---

## 7) Sprint 68 SOLID/DRY/KISS Gate

### Kickoff Baseline (2026-05-18)

| Principle | Score | Evidence |
|-----------|-------|----------|
| SOLID | Pass | Route-library separation (`dashboard.ts` thin adapter; `dashboard-summaries.ts` owns queries) |
| DRY | Pass | `DashboardCard` reused across global, domain, and my-work panels; `useDashboardData` hook shared |
| KISS | Pass | Polling default avoids SSE complexity; API-gap pattern is explicit rather than hidden |

### Pre-Close Re-Score (2026-05-19)

#### SOLID
- **SRP:** Pass — `dashboard-summaries.ts` owns DB queries; `dashboard.ts` owns HTTP; `useDashboardData` owns fetching; `DashboardCard` owns presentation.
- **OCP:** Pass — New dashboard cards addable via configuration object without modifying card rendering logic.
- **LSP:** Pass — No subtype replacement; hooks compose via function calls.
- **ISP:** Pass — `DashboardSummary` interfaces are focused per domain (inventory, accounting, purchasing).
- **DIP:** Pass — Hooks depend on API client interface, not concrete fetch implementation.

#### DRY
- **Business logic dedup:** Pass — Count queries consolidated in `dashboard-summaries.ts`; no inline SQL in routes.
- **Component dedup:** Pass — `DashboardCard` primitive used for all 9 card variants across 3 panels.
- **Permission dedup:** Pass — `resolveEffectivePermissions()` + `actionGates()` used consistently; no hardcoded role checks.
- **Fixture dedup:** Pass — Integration tests use canonical fixtures (`createTestCompanyMinimal`, `setupUserPermission`).

#### KISS
- **No over-engineering:** Pass — Polling instead of SSE; localStorage for drafts instead of server-side; explicit API-gap states instead of synthetic data.
- **Readable over clever:** Pass — Refresh interval logic uses explicit `getVisibleRefetchInterval()` helper with clear precedence rules.
- **Small interfaces:** Pass — `InventorySummary`, `AccountingSummary`, `PurchasingSummary` each have ≤ 5 fields.
- **Flat over nested:** Pass — Dashboard page renders panels in sequence; no deep nesting.
- **Deferred complexity:** Pass — Domain dashboards (accounting, purchasing) render API-gap notices rather than stubbing fake data.

#### Risk Gate
| Gate | Status |
|------|--------|
| Unresolved P0 count | 0 |
| Unresolved P1 count | 0 |
| Verdict | ✅ **GO** |

---

## 8) Action Items (MAX 2 — E46-A2)

### Action Item 1
**Address E67-A2: Add rendered component interaction tests for ExportDialog and ImportWizard**
**Owner:** QA (bmad-qa)
**Deadline:** Epic 69 pre-close
**Success criterion:** `@testing-library/react` tests exist for `ExportDialog` and `ImportWizard` that verify: dialog open/close, column selection/deselection, format toggle, progress state rendering, error retry, and permission-denied state. All tests pass in CI.

### Action Item 2
**Address E66-A2: Align generated OpenAPI query parameter types with runtime Zod validation**
**Owner:** API platform team (bmad-architect)
**Deadline:** Epic 69 kickoff
**Success criterion:** For all audit list and generic list endpoints, the generated OpenAPI spec's query parameter types match the runtime Zod validation schemas. A verification script (`scripts/validate-openapi-query-params.ts`) exists and passes in CI.

### Backlog Note

The following candidates were identified but **not committed** (exceeds 2-item cap per E46-A2):

- **Remove deprecated `/admin/dashboard/*` route handlers and sub-router mounts** — Legacy handlers are unreachable after deprecation catch-all. Owner: bmad-dev. Priority: P3.
- **Add browser-level EventSource staging evidence for SSE viability** — Capture curl/browser network trace proving SSE works through Nginx with cookie auth. Owner: bmad-dev. Priority: P2.
- **Add real-DB integration tests for notification inbox persistence** — Currently only unit-tested. Owner: bmad-qa. Priority: P2.

---

## 9) Epic 69 Preparation

### Next Epic Overview

Epic 69: **Finance & Purchasing — High-Risk Forms, Review Steps, Evidence UX**

Scope: Financial-grade form patterns for purchasing (suppliers, POs, goods receipts, AP invoices, payments, credits) and accounting (journals, accounts, fiscal period controls, reports). Staged review steps with before/after diff, autosaved drafts, unsaved-changes guards, and audit trail links.

### Critical Carry-Forwards

| # | Item | Owner | Priority | Rationale |
|---|------|-------|----------|-----------|
| 1 | E67-A2: Rendered component tests for ExportDialog/ImportWizard | QA | P2 | Overdue from Epic 67; assign to first story that touches import/export |
| 2 | E66-A2: OpenAPI query parameter alignment | Architecture | P2 | Overdue from Epic 66; affects audit and generic list endpoints in Epic 69 |
| 3 | Verify backend contracts before spec writing (E67 retro lesson) | Architecture | P1 | Epic 69 involves many backend endpoints; verify each before AC |
| 4 | API-gap pattern for unverifiable dashboard data | Dev | P2 | Pattern established in 68-5; apply to any Epic 69 dashboard stubs |

### Preconditions Check

| # | Precondition | Status | Notes |
|---|--------------|--------|-------|
| 1 | Epic 66 (Core Admin) complete | ✅ MET | sprint-status.yaml shows `epic-66: done` |
| 2 | Epic 65 (Frontend Foundation) complete | ✅ MET | sprint-status.yaml shows `epic-65: done` |
| 3 | Backoffice unfreeze authorized | ✅ MET | Epic 68 was executed under backoffice unfreeze; freeze lifts for Epic 69 |
| 4 | Typed API client covers purchasing/accounting | ✅ MET | Epic 65-2 delivered typed API client; all endpoints typed |
| 5 | Epic 47 AP exception worklist endpoint stable | ⚠️ VERIFY | Must verify `GET /api/purchasing/ap-exceptions` exists before 69-5 |

### Pre-Flight Gate Checklist

```bash
npm run lint -w @jurnapod/api
npm run build:libs
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice
npx tsx scripts/validate-sprint-status.ts --epic 69
```

---

## 10) Team Acknowledgements

| Role | Agent | Contribution |
|------|-------|-------------|
| Developer | bmad-dev | Story implementation for 68-1 through 68-5 |
| Reviewer | bmad-review | Adversarial code review; GO on all stories |
| Story Owner | Ahmad | Sign-off on all 6 stories |

---

## 11) Sign-Off

### Epic 67 Action Item Follow-Through Summary

| # | Action Item | Deadline | Status | Notes |
|---|-------------|----------|--------|-------|
| E66-A1 | `platform.audit` ACL resource | Epic 68 kickoff | ✅ CLOSED | Migration 0211 delivered; routes updated; tests added |
| E67-A1 | Verify backend bulk operation contracts | Epic 68 kickoff | ✅ CLOSED | Contract artifact `story-68-0-contract.md` delivered |
| E67-A2 | Rendered component tests for dialogs | Epic 68 pre-close | 📋 DEFERRED | Out of scope; carried to Epic 69 |

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Facilitator | bmad-review | 2026-05-19 | ✅ |
| Story Owner | Ahmad | 2026-05-19 | ✅ |

---

_Last Updated: 2026-05-19T00:00:00Z_
_Retrospective Status: ✅ complete_
