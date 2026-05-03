# Epic 53 Retrospective — Datetime API Consolidation Execution

**Date:** TBD
**Epic:** 53 — Datetime API Consolidation Execution
**Status:** ✅ Complete
**Theme:** Drift prevention — execute namespaced toUtcIso/fromUtcIso API

---

## Story Summary

| Story | Title | Status |
|-------|-------|--------|
| 53.1 | Core API Surface + Route Validation | done |
| 53.2 | Accounting + Inventory Package Migration | done |
| 53.3 | Platform + Purchasing + Other Module Migration | done |
| 53.4 | API Lib + Sync + Cross-cutting Touch-ups | done |
| 53.5 | Test Updates + Z$ Assertions | done |
| 53.6 | Cleanup — Remove Deprecated Wrappers | done |

---

## What Went Well

**1. Namespaced `toUtcIso`/`fromUtcIso` API fully executed as designed**
All 6 stories implemented the charter-defined API design: `UtcIsoSchema = z.string().datetime()` (strict Z-only, no offset), `toUtcIso` namespace with `.dateLike()`, `.epochMs()`, `.businessDate()`, `.asOfDateRange()`, `.dateRange()`, and `fromUtcIso` namespace with `.epochMs()`, `.mysql()`, `.businessDate()`, `.localDisplay()`, `.dateOnly()`. No deviation from the approved plan.

**2. Deprecated wrappers provided safe backward-compat transition**
Story 53-1 added ~23 deprecated wrapper aliases (`toRfc3339`, `toRfc3339Required`, `toMysqlDateTime`, `toMysqlDateTimeFromDateLike`, `toDateOnly`, `normalizeDate`, `asOfDateToUtcRange`, `toDateTimeRangeWithTimezone`, etc.) calling the new API. Stories 53-2 through 53-4 migrated all consumers at their own pace. Story 53-6 removed all wrappers cleanly — zero production usage remained at removal time.

**3. Route validation corrected across 8 files**
Story 53-1 fixed 8 route/schema files that used `{offset: true}` or lacked datetime validation: `routes/reports.ts` (3 fields), `schemas/pos-sync.ts` (12 fields), `schemas/reservations.ts` (10 fields), `schemas/reservation-groups.ts` (9 fields), `routes/purchasing/purchase-invoices.ts`, `routes/purchasing/goods-receipts.ts`, `routes/cash-bank-transactions.ts`, and `sync-core/src/types/index.ts`. All changed to strict `UtcIsoSchema`.

**4. Parallel story execution realized**
Charter defined parallel execution order: Stories 53-2, 53-3, and 53-4 executed in parallel after 53-1 completed. All 6 stories completed with `done` status in sprint-status.yaml.

**5. All 8 module packages migrated**
`modules-accounting`, `modules-inventory`, `modules-inventory-costing`, `modules-platform`, `modules-purchasing`, `modules-reporting`, `modules-reservations`, and `modules-sales` — all migrated. Local datetime helpers replaced: `cogs.ts` local `toBusinessDate`, `sync-push.ts` local `toDateOnly`, `sales.ts` local `toDateOnly`, reservations `time/timestamp.ts` local `toUnixMs`/`fromUnixMs`.

**6. Comprehensive test updates**
Story 53-5 updated `datetime.test.ts` and `normalize.test.ts` with new API calls; added Z$ assertions (`toMatch(/Z$/)`) to integration tests covering audit, reports, cash-bank, purchasing, sales, and reservations; cleaned `.toISOString()` patterns from test fixtures.

**7. All Success Criteria met**
Per sprint-status.yaml: (1) all datetime conversions use namespaced API — confirmed; (2) route validation uses `UtcIsoSchema` — confirmed via 53-1; (3) raw `.toISOString()` patterns replaced — confirmed via 53-4 bulk migration; (4) old function names removed — confirmed via 53-6 blast radius grep; (5) build passes all packages + API; (6) full test suite passes; (7) sprint-status.yaml up to date.

## What Could Improve

**1. Nullable caller handling required manual intervention**
The charter risk register flagged "Nullable `toRfc3339(` callers missed — code returns `string|null` but new API throws" as Medium severity. Story 53-4 handled the 4 known nullable callers (`lib/companies.ts`, `lib/static-pages.ts`, `lib/static-pages-admin.ts`, `company-service.ts`) with `{ nullable: true }` option. This pattern — passing `{ nullable: true }` to `toUtcIso.dateLike()` for nullable inputs — was not centrally documented as a migration guideline and required per-file manual review. A single migration guideline note for nullable patterns in the charter would have reduced per-story review overhead.

**2. Import dedup pass was an unexpected sub-task**
Story 53-4 task 4.8 ("Import dedup pass: grep for `toUtcIso,toUtcIso` and fix") was not part of the original bulk migration targets but had to be executed as a separate sub-task. The sed-based rename created import duplications that required a dedicated cleanup pass. This was predictable given the sed approach and could have been scoped proactively.

**3. POS deployment-order risk remained open at epic close**
The charter risk register listed "Route schema change from `{offset: true}` to strict Z-only breaks POS clients" as Medium severity with mitigation "Deployment order: POS app update first, then server." This risk was documented but no explicit evidence in story completion reports that it was resolved or formally handed off to the deployment team. This is a deployment/rollback plan concern rather than a code quality issue.

## Action Items (Max 2)

1. **[Owner: dev]** Add nullable-caller migration guideline to the datetime consolidation plan document (`_bmad-output/planning-artifacts/datetime-api-consolidation-plan.md`) — document that `toUtcIso.dateLike(x, { nullable: true })` is the canonical pattern for nullable datetime fields. *Success criterion: guideline added to planning doc.*

2. **[Owner: dev]** Formally hand off POS deployment-order risk to the deployment team — create a brief note in the epic closeout documenting that POS clients sending offset datetime must be updated before the server ships the `UtcIsoSchema` strict validation. *Success criterion: hand-off documented in epic closeout notes.*

## Deferred Items

1. **POS client offset-sending compatibility** — Not resolved in-code. POS clients sending `{offset: true}` datetime strings will receive HTTP 400 after this change. Requires POS app update deployed before or alongside the server change. No code change possible in this epic (POS is in scope freeze).

---

*Retrospective complete. Epic 53 closed.*
