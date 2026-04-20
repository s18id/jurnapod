# Epic 49 API-Lib Boundary Migration Queue

> **Epic:** 49 — Test Determinism + CI Reliability  
> **Prepared From:** Sprint 48 boundary mapping discussion  
> **Status:** Approved queue (intake completed in Story 49.1; execution starts in 49.2 touch chain)  
> **Scope:** `apps/api/src/lib/**` ownership normalization into `packages/*` by sprint touch chain

---

## Purpose

Create an execution-ready migration queue so `apps/api/src/lib/**` follows explicit ownership boundaries:

- API lib keeps **orchestration/adapters only**
- Domain/business invariants move to **`packages/modules/*`**
- Shared/infra concerns move to **`packages/shared` / `packages/db` / `packages/auth` / `packages/sync-core` / `packages/telemetry` / `packages/notifications`**

This queue is sprint-coupled: enforcement happens when related sprint scope touches the area.

---

## Touch Enforcement Rule (MANDATORY)

When a file in `apps/api/src/lib/**` is touched:

1. **If it belongs to current sprint domain:** extract/move in the same sprint task.
2. **If touched before target sprint:** allow only minimal correctness fix + open explicit exception (owner + deadline + success criterion).
3. **No new domain invariant logic may be introduced in API lib.**
4. **No package may import from `apps/*`.**

Severity model for violations:

- **P1:** domain logic kept/added in API lib during target sprint
- **P2:** pre-existing legacy still in API lib but untouched
- **P3:** naming/layout hygiene issues without ownership impact

---

## Queue A — Immediate Handoff (48-6 → 49.1 intake, 49.2+ execution)

These are preconditions to make later sprint extractions predictable.

| Queue ID | Item | Current API lib area | Target location | Owner | Target Sprint | Severity |
|---|---|---|---|---|---|---|
| Q49-001 | Canonical fixture extraction | `apps/api/src/lib/test-fixtures.ts` | `packages/db/test-fixtures.ts` (+ API re-export adapter only if needed) | @bmad-dev | 49.1 intake / 49.2 execution | P1 |
| Q49-002 | DB/audit infra extraction | `db.ts`, `audit.ts`, `audit-logs.ts`, `batch.ts` | `packages/db` | @bmad-dev | 49.1 intake / 49.2 execution | P1 |
| Q49-003 | Shared utility boundary cleanup | `date-helpers.ts`, `pagination.ts`, `retry.ts`, `response.ts`, `request-meta.ts`, `correlation-id.ts`, `shared/*` | `packages/shared` | @bmad-dev | 49.1 intake / 49.2 execution | P1 |
| Q49-004 | Purchasing module skeleton | `purchasing/*` (future extraction target) | create `packages/modules/purchasing` package scaffold | @bmad-architect + @bmad-dev | 49.1 intake / 49.2 execution | P1 |
| Q49-005 | Auth/platform extraction prep | `auth*`, `users.ts`, `companies.ts`, `outlets.ts`, `settings*.ts` | `packages/auth`, `packages/modules/platform` | @bmad-architect | 49.1 intake / 49.2 execution | P1 |

---

## Queue B — Sprint-Coupled Extraction Map (49–61)

| Sprint | Related scope touched | API lib areas to migrate when touched | Target package(s) |
|---|---|---|---|
| **49** | Determinism + CI reliability | Fixtures, shared infra/utilities, telemetry/util basics | `packages/db`, `packages/shared`, `packages/telemetry`, `packages/notifications` |
| **50** | Ledger correctness | `accounts.ts`, `journals.ts`, `journal-handlers.ts`, `depreciation-posting.ts`, `accounting-import.ts` | `packages/modules/accounting` |
| **51** | Fiscal correctness | `fiscal-years.ts`, `period-close-workspace.ts`, `taxes.ts`, `tax-rates.ts`, `taxes-kysely.ts` | `packages/modules/accounting` |
| **52** | AP lifecycle correctness | `purchasing/*` (PO/GR/PI/AP payment/credits), AP guardrail paths | `packages/modules/purchasing` (+ accounting interfaces) |
| **53** | AP recon/snapshot correctness | `purchasing/ap-reconciliation*`, `accounting/ap-exceptions.ts`, reconciliation metrics | `packages/modules/purchasing` + `packages/modules/accounting` |
| **54** | AR + treasury correctness | `sales-posting.ts`, `customers.ts`, `credit-notes/*`, `service-sessions/*`, `treasury-adapter.ts`, reservations crossover | `packages/modules/sales`, `packages/modules/treasury`, `packages/modules/reservations` |
| **55** | Inventory/costing correctness | `inventory/*`, `items/*`, `item-groups/*`, `item-prices/*`, `item-variants.ts`, `stock.ts`, `supplies/*` | `packages/modules/inventory`, `packages/modules/inventory-costing` |
| **56** | POS core consolidation | POS-facing sync adapters in API lib | `packages/sync-core`, `packages/pos-sync` |
| **57** | Tenant + ACL correctness | `auth*`, `users.ts`, `companies.ts`, `outlets.ts`, `platform-settings*`, `settings*.ts` | `packages/auth`, `packages/modules/platform` |
| **58** | Sync contract hardening | `sync/*`, `sync-modules.ts`, `table-sync.ts` | `packages/sync-core` |
| **59** | Reporting/projections correctness | `reports.ts`, `report-context.ts`, `report-error-handler.ts`, `report-telemetry.ts`, admin dashboards read-model helpers | `packages/modules/reporting`, `packages/telemetry`, `packages/shared` |
| **60** | Boundary enforcement in CI | Any remaining API-lib ownership drift | CI gate hard-fail on new and unresolved scoped violations |
| **61** | Consolidation + final audit | Final unresolved legacy API-lib domain ownership | Program closeout and residual debt disposition |

---

## Keep-in-API-Lib Allowlist (Adapter/Transport Only)

These areas are allowed to remain in API lib unless they accumulate domain invariants:

- `env.ts`
- `routes.ts`
- `static-pages.ts`, `static-pages-admin.ts`
- `pdf-generator.ts`, `invoice-template.ts`
- `uploader/*`
- thin composition adapters like `accounting-services.ts`, `auth-adapter.ts`

If any keep-allowlist file grows to include domain invariants, it must be reclassified and extracted.

---

## Architect Decisions Required (Open)

| Decision ID | Topic | Needed By |
|---|---|---|
| AD-49-001 | Ownership of `import/*` (shared package vs dedicated package) | Story 49.2 kickoff |
| AD-49-002 | Ownership of `export/*` (reporting vs shared infra) | Story 49.2 kickoff |
| AD-49-003 | `alerts/*` ownership (`telemetry` vs `notifications`) | Story 49.2 kickoff |
| AD-49-004 | `packages/modules/purchasing` API contracts and boundaries | Story 49.2 kickoff |

---

## Queue Completion Criteria

Queue item can be marked complete only when:

1. Code moved to target package
2. API callers updated
3. Package build passes (`npm run build -w @jurnapod/<package>`)
4. Related integration tests pass
5. No new boundary violations introduced in `apps/api/src/lib/**`
6. Evidence linked in story completion notes

---

## Companion Artifacts

| Artifact | Path |
|---|---|
| Story 49.1 spec | `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md` |
| Story 49.1 execution checklist | `_bmad-output/planning-artifacts/epic-49-1-execution-checklist.md` |
| Q49-001 execution pass 1 | `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md` |
| Epic 49 sprint plan | `_bmad-output/planning-artifacts/epic-49-sprint-plan.md` |
| File structure standard v1 | `_bmad-output/planning-artifacts/file-structure-standard-v1.md` |
| Structure baseline | `_bmad-output/planning-artifacts/file-structure-baseline.json` |
| Structure conformance validator | `scripts/validate-structure-conformance.ts` |
