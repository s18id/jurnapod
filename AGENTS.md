# AGENTS.md

> **Important**: Never commit unless explicitly asked.

---

## Agent Routing

| When you need... | Use this agent |
|------------------|----------------|
| Implement a story (from spec) | `bmad-dev-story` |
| Quick code change / bug fix | `bmad-quick-dev` |
| Solo dev on a task | `bmad-quick-flow-solo-dev` |
| Code review | `bmad-code-review` |
| Edge case review | `bmad-review-edge-case-hunter` |
| Test strategy / plan | `bmad-testarch-test-design` |
| Generate unit/integration tests | `bmad-qa-generate-tests` |
| Generate e2e tests | `bmad-qa-generate-e2e-tests` |
| New feature requirements (PRD) | `bmad-create-prd` |
| Architecture / tech design | `bmad-create-architecture` |
| Break down requirements into stories | `bmad-create-epics-and-stories` |
| Product management | `bmad-pm` |
| Sprint planning | `bmad-sprint-planning` |
| Sprint status | `bmad-sprint-status` |
| Document existing project | `bmad-document-project` |
| Technical writing | `bmad-tech-writer` |

---

## Standardized Document Paths

| Artifact | Path |
|----------|------|
| Sprint tracking | `_bmad-output/implementation-artifacts/sprint-status.yaml` |
| Stories | `_bmad-output/implementation-artifacts/stories/epic-{N}/story-{N}.{M}.md` |
| Story completion notes | `_bmad-output/implementation-artifacts/stories/epic-{N}/story-{N}.{M}.completion.md` |
| Tech specs | `docs/tech-specs/{name}.md` |
| ADRs | `docs/adr/adr-{NNN}-{slug}.md` |
| Sprint planning artifacts | `_bmad-output/planning-artifacts/` |

---

## Product

- **Product**: Jurnapod
- **Tagline**: From cashier to ledger.
- **Type**: Modular ERP monorepo
- **Financial center**: Accounting/GL is the source of truth
- **POS**: Offline-first, safe under retries and unstable networks

---

## Repo-Wide Operating Principles

1. **Accounting/GL at the center** — Final business documents must reconcile to journal effects
2. **POS offline-first** — Write locally first, sync via outbox
3. **POS idempotency** — Use `client_tx_id` to prevent duplicates
4. **Tenant isolation** — All data scoped to `company_id` and `outlet_id`
5. **Finalized records are immutable** — Use `VOID` and `REFUND`, not silent mutation
6. **Shared contracts** — Stay aligned across apps and packages

---

## Canonical Sync Contract (MANDATORY)

All sync operations must use these field names:

| Direction | Field | Description |
|-----------|-------|-------------|
| Pull request cursor | `since_version` | Request data since this version |
| Pull response cursor | `data_version` | Version of returned data |

**Rules:**
- ❌ Do **NOT** use alias fields like `sync_data_version`
- ❌ Do **NOT** depend on legacy tables `sync_data_versions` or `sync_tier_versions`
- ✅ Use `sync_versions` table as single storage authority:
  - Data-sync version row: `tier IS NULL`
  - Tiered sync rows: explicit `tier` value (`MASTER`, `OPERATIONAL`, `REALTIME`, `ADMIN`, `ANALYTICS`)

---

## Database Compatibility

- All schema/SQL must run on **MySQL 8.0+** and **MariaDB**
- Keep migrations **rerunnable/idempotent** (MySQL-family DDL is non-atomic)
- Avoid `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (not portable)
- Use `information_schema` existence checks + guarded `ALTER TABLE`

---

## Canonical Reservation Time Schema

- **Storage**: Unix milliseconds in `BIGINT` columns
  - `reservation_start_ts` — Source of truth for reporting and date-range filtering
  - `reservation_end_ts` — Source of truth for calendar windows and overlap checks
- **API compatibility**: `reservation_at` derived from `reservation_start_ts` (not canonical)
- **Overlap rule**: `a_start < b_end && b_start < a_end` — `end == next start` is **non-overlap**
- **Timezone resolution order**: `outlet.timezone` → `company.timezone` (no UTC fallback)
- **Query/index rule**: Never wrap indexed timestamp columns in SQL functions; apply functions only on constants

---

## Import Path Conventions

- Use `@/` alias for imports from `apps/api/src/`:
  - `@/lib/db` → `apps/api/src/lib/db`
  - `@/lib/auth-guard` → `apps/api/src/lib/auth-guard`
- ❌ Do **NOT** use relative paths like `../../../../src/lib/`
- Packages should use **relative imports** (no `@/` alias)

---

## Review Guidelines

### Severity Classification

| Severity | Issue Examples |
|----------|----------------|
| **P0/P1** | Incorrect ledger balances, duplicate posting, duplicate POS transaction, tenant data leakage, auth bypass |
| **P1** | Missing validation on money movement, posting, sync, import, auth, or tenant/outlet scoping |
| **P1** | Missing/broken tests for critical accounting, sync, auth, or migration logic |
| **P2/P3** | Concrete risks in readability, maintainability, consistency, operability |

> ⚠️ Do not dismiss findings as "minor" by default. Every review finding must map to a concrete risk or be explicitly marked out-of-scope.

### Global Invariants

- Accounting/GL stays at center — journals are the financial source of truth
- POS remains offline-first with `client_tx_id` idempotency
- Operational data must enforce `company_id` and `outlet_id`
- Finalized records use `VOID`/`REFUND`, not silent mutation

### Money and Persistence

- ❌ **Never** use `FLOAT` or `DOUBLE` for money
- ✅ Use `DECIMAL(19,4)` or `BIGINT` (cents)
- Business-critical writes must be transactionally safe

### Contracts and Validation

- Prefer shared TypeScript + Zod contracts in `packages/shared`
- Flag breaking payload or schema changes not reflected across all consumers
- Flag missing validation at API and sync boundaries

### Testing Expectations

Focused tests required when changing:
- Accounting posting / journal balancing
- POS sync / idempotency
- Auth / tenant scoping
- Imports and migrations
- Financial reports

Flag code that filters `audit_logs` by `result` instead of `success`.

---

## Definition of Done (MANDATORY)

Before marking ANY story as DONE:

### Implementation
- [ ] All Acceptance Criteria implemented with evidence
- [ ] No breaking changes without cross-package alignment

### Testing
- [ ] Unit tests written and passing
- [ ] Integration tests for API boundaries
- [ ] Database pool cleanup hooks present

### Quality
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] `npm run build -w @jurnapod/api` passes
- [ ] Code review completed with no blockers
- [ ] AI review conducted (`bmad-code-review` agent)

### Documentation
- [ ] Schema changes documented (if applicable)
- [ ] API changes reflected in contracts
- [ ] Dev Notes include files modified/created

---

## Per-Package Documentation

Each package has its own `AGENTS.md` with:
- Package-specific commands
- Architecture patterns
- Module organization
- Coding standards
- Review checklists

| Package | AGENTS.md Location |
|---------|-------------------|
| `@jurnapod/auth` | `packages/auth/AGENTS.md` |
| `@jurnapod/db` | `packages/db/AGENTS.md` |
| `@jurnapod/pos-sync` | `packages/pos-sync/AGENTS.md` |
| `@jurnapod/backoffice-sync` | `packages/backoffice-sync/AGENTS.md` |
| `@jurnapod/sync-core` | `packages/sync-core/AGENTS.md` |
| `@jurnapod/shared` | `packages/shared/AGENTS.md` |
| `@jurnapod/notifications` | `packages/notifications/AGENTS.md` |
| `@jurnapod/offline-db` | `packages/offline-db/AGENTS.md` |
| `@jurnapod/telemetry` | `packages/telemetry/AGENTS.md` |
| `@jurnapod/modules-accounting` | `packages/modules/accounting/AGENTS.md` |
| `@jurnapod/modules-inventory` | `packages/modules/inventory/AGENTS.md` |
| `@jurnapod/modules-inventory-costing` | `packages/modules/inventory-costing/AGENTS.md` |
| `@jurnapod/modules-platform` | `packages/modules/platform/AGENTS.md` |
| `@jurnapod/modules-reporting` | `packages/modules/reporting/AGENTS.md` |
| `@jurnapod/modules-reservations` | `packages/modules/reservations/AGENTS.md` |
| `@jurnapod/modules-sales` | `packages/modules/sales/AGENTS.md` |
| `@jurnapod/modules-treasury` | `packages/modules/treasury/AGENTS.md` |