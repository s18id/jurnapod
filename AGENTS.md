# AGENTS.md

> **Important**: Never commit unless explicitly asked.

---

## Agent Routing

> All delegation goes through `./opencode/agents/` subagents. Use `bmad-master` for quick-flow solo-dev work on small, well-bounded tasks.

| When you need... | Use this agent |
|------------------|----------------|
| **File exploration / mapping** | `bmad-explorer` |
| Story implementation (from spec) | `bmad-dev` |
| Quick code change / bug fix | `bmad-master` |
| Solo dev on a small task | `bmad-master` |
| Code review / adversarial review | `bmad-review` |
| Edge case review | `bmad-review` |
| Product management | `bmad-pm` |
| Architecture / tech design | `bmad-architect` |
| Sprint planning / story creation | `bmad-sm` |
| Business analysis / product discovery | `bmad-analyst` |
| QA / test generation | `bmad-qa` |
| UX design | `bmad-ux-designer` |
| Technical writing / documentation | `bmad-tech-writer` |

> **Exploration Rule (MANDATORY):** All file exploration tasks — including `grep`, `map`, `find`, `ls`, `tree`, `count`, content search, line counting, and any file/directory navigation — MUST be delegated to `bmad-explorer`. Do NOT perform file system operations directly.

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
7. **Build packages before apps** — When modifying `packages/` code, always `npm run build -w @jurnapod/<package>` before building or testing dependent `apps/`

### Architecture Cleanup Policy (MANDATORY)

**A) Cleanup mandatory when touching sprint scope.**
Any code change that falls within active sprint scope MUST include a cleanup pass for:
- Resolved TODO/FIXME comments in the modified area
- Outdated comments or dead code paths made unreachable by the change
- Misplaced files (e.g., library logic in `routes/`, source files outside `src/`) discovered during the change
Cleanup is not optional. Unchecked cleanup debt is a sprint-trackable P1/P2 item.

**B) Fixture flow mode policy.**
- **Full Fixture Mode (default):** Fixture setup MUST use canonical production package flow so production invariants and test invariants remain identical.
- **Partial Fixture Mode (global exception):** Fixture setup MAY use decomposed domain parts only when those parts are provided by the same production package that owns the domain invariant. Partial mode MUST be explicitly declared with scope, rationale, and owner.
- Fixture setup MUST NOT introduce a parallel business-write path.

**C) No new business DB triggers.**
Agents and contributors MUST NOT introduce new database triggers that enforce business logic. All business invariants MUST be enforced in application code where they are testable, reviewable, and version-controllable. Existing triggers MUST NOT be extended with new business logic.

**D) Reserved.**
Section D is reserved for future global policy additions.

**E) Agent-safe documentation language.**
All documentation, policy statements, and specifications MUST use RFC-style keywords: `MUST`, `MUST NOT`, `SHOULD`, `MAY`. Terms such as "should", "might", "could", "consider", "recommend", or "prefer" are forbidden in policy statements — they create ambiguity for agents executing against these documents. Where nuance is required, it MUST be expressed as an explicit conditional with a concrete example.

---

## Architecture Program Baseline (MANDATORY — S48 to S61)

All agents and contributors must follow the approved correctness-first architecture baseline:

- **Baseline document:** `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`
- **Priority rule:** `Correctness > Safety > Speed`
- **Scope rule:** No net-new feature scope in this program unless explicitly approved as emergency/regulatory exception.

### Mandatory Per-Sprint Loop

For every sprint in S48–S61:

1. **Kickoff Gate** — score SOLID/DRY/KISS (`Unknown/Pass/Fail`)
2. **Mid-Sprint Checkpoint** — re-score and escalate unresolved P1 risks
3. **Pre-Close Quality Gate** — attach evidence and run adversarial review gate
4. **Retro Carry-Over** — max 2 action items, each with owner + deadline + success criterion

### SOLID/DRY/KISS Enforcement

The sprint checklist in the baseline document is mandatory and must be applied in kickoff, midpoint, and pre-close for every sprint (S48–S61). Any failed checklist item must be tracked as explicit sprint work with severity.

### Sprint Closure Gate

- Sprint cannot be closed with unresolved **P0/P1** items in sprint scope.
- Program changes require explicit re-baseline approval (scope/risk/schedule impact).

---

## Temporary Scope Freeze (Architecture-First)

> **Effective immediately — supersedes all other scope guidance during freeze.**

**In-scope:**
- `apps/api` — API correctness, routing, validation, auth, tenant scoping
- Shared/core packages required for API correctness (`packages/db`, `packages/shared`, `packages/auth`, `packages/modules/*`)

**Out-of-scope (temporary freeze):**
- `apps/backoffice` — frozen except emergency / regulatory / security fixes explicitly approved
- `apps/pos` — frozen except emergency / regulatory / security fixes explicitly approved

**Priority order (unchanged):** `Correctness > Safety > Speed`

**Rule:** No net-new features in frozen apps unless approved via explicit exception (emergency/regulatory/security). All other work proceeds normally against `apps/api` and required packages.

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
| **P0/P1** | Incorrect ledger balances, duplicate posting, duplicate POS transaction, tenant data leakage, auth bypass, ACL permission bypass |
| **P1** | Missing validation on money movement, posting, sync, import, auth, or tenant/outlet scoping |
| **P1** | Missing/broken tests for critical accounting, sync, auth, or migration logic |
| **P2/P3** | Concrete risks in readability, maintainability, consistency, operability |

> ⚠️ Do not dismiss findings as "minor" by default. Every review finding must map to a concrete risk or be explicitly marked out-of-scope.

### Global Invariants

- Accounting/GL stays at center — journals are the financial source of truth
- POS remains offline-first with `client_tx_id` idempotency
- Operational data must enforce `company_id` and `outlet_id`
- Finalized records use `VOID`/`REFUND`, not silent mutation
- ACL uses resource-level permissions (`module.resource`) per Epic 39

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
- ACL / permission checks (resource-level permissions)
- Imports and migrations
- Financial reports

Flag code that filters `audit_logs` by `result` instead of `success`.

### Permission Test Role Selection (MANDATORY)

For negative authorization tests (expected 401/403), do not use roles that legitimately satisfy access (e.g., OWNER/SUPER_ADMIN/other valid role for target resource).

- ✅ Use `CASHIER` or a dedicated custom low-privilege test role with explicit missing permissions
- ❌ Invalid test pattern: expecting denial while authenticating as a role that should be allowed

---

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation, pure function utilities) may use unit tests without database.

### Test Data Setup Integrity (MANDATORY)

For integration tests, **raw SQL `INSERT`/`UPDATE` for test setup is a P0 blocker** when a canonical library/fixture function already exists.

- ✅ Required: Use canonical helpers from `apps/api/src/lib/test-fixtures.ts` (or package-level equivalents)
- ❌ Forbidden: Ad-hoc setup writes in tests that bypass domain/library invariants

If existing helper is too broad or missing required behavior:
1. Refactor helper into smaller reusable parts
2. Add a canonical fixture/helper for that setup path
3. Reuse it across tests (DRY)

Allowed raw SQL in tests remains limited to:
- teardown/cleanup
- read-only verification
- schema introspection

### ACL Cleanup Policy (P0 Blocker)

**Canonical system roles are immutable reference data in persistent test DBs.** Deleting or modifying `module_roles` rows for system roles (`SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`, `CASHIER`) with `company_id=NULL` corrupts the seeded ACL baseline and breaks all subsequent tests.

**P0 Rules:**
- ❌ **BLOCKER**: Any cleanup/deletion by `role_id` alone on `module_roles` — this wipes canonical rows shared across all companies
- ✅ **Required**: ACL cleanup must scope by `company_id` AND `role_id` (e.g., `WHERE company_id = ? AND role_id IN (?)`)
- ✅ **Required**: Integration tests should mutate **custom test roles**, not seeded system roles
- ✅ **Required**: Use exact inserted row IDs when cleanup scope is ambiguous

**Recovery commands for corrupted ACL:**
```bash
npm run db:migrate -w @jurnapod/db
npm run db:seed -w @jurnapod/db
npm run db:seed:test-accounts -w @jurnapod/db
```

---

## Canonical Test Directory Structure

All tests MUST use the `__test__/unit` and `__test__/integration` directory structure:

```
__test__/
├── unit/           # True unit tests (no real DB, mocked dependencies)
└── integration/    # Tests with real DB, HTTP calls, or external services
```

### Classification Criteria

**Unit Test** (`__test__/unit/`):
- No real database access
- All dependencies mocked or stubbed
- Tests pure function logic
- Examples: date helpers, retry logic, validation utilities, permission logic

**Integration Test** (`__test__/integration/`):
- Real database access (Kysely, mysql2)
- HTTP server calls (full route testing)
- File system operations
- External service calls
- Examples: route handlers with DB, service/repository tests

### e2e Tests

e2e tests remain in their own location (separate category):
- `apps/backoffice/e2e/`
- `apps/pos/e2e/`

### Test Runner Standard

All packages and apps use **vitest** as the test runner with `globals: true`:

```typescript
// vitest.config.ts
export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
});
```

### Test Scripts

All packages support these standardized scripts:
- `npm test` - Run all tests
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run test:single -- <file>` - Run specific test file

---

## Canonical Test Fixtures

When canonical data patterns are established (timestamps, status IDs, enum values, etc.), create canonical test fixtures to ensure consistency across the test suite.

### When to Create Canonical Fixtures

- When establishing new timestamp handling patterns (e.g., `reservation_start_ts` vs `reservation_at`)
- When introducing new status ID conventions (e.g., `status_id` vs `status` fields)
- When standardizing enum or constant values across packages
- When extracting shared patterns from multiple tests into a single source of truth

### Process

1. **Establish the canonical fixture** in a shared location (e.g., `packages/db/test-fixtures.ts` or `packages/shared/test/fixtures.ts`)
2. **Audit existing tests** against the new canonical pattern before marking the story complete
3. **Update any tests** that deviate from the canonical pattern
4. **Document the fixture** with clear examples of correct usage

### Fixture Flow Policy (MANDATORY — S48 to S61)

- **Full Fixture Mode (default):** Fixture setup **MUST** use the canonical production package flow so production invariants and test invariants remain identical.
- **Partial Fixture Mode (global exception):** Partial fixture setup **MAY** be used only via decomposed domain parts provided by the same production package that owns the domain invariant. It **MUST** be explicitly declared in story notes with scope, rationale, and owner.
- Fixture setup **MUST NOT** introduce a parallel business-write path.

### Example: Timestamp Handling

```typescript
// Canonical: Use Unix milliseconds in BIGINT columns
export const CANONICAL_TIMESTAMPS = {
  reservationStart: 1712304000000,  // 2024-04-05 00:00:00 UTC
  reservationEnd: 1712390400000,   // 2024-04-06 00:00:00 UTC
  // NOT: new Date() or Date.now() — use fixed values for reproducibility
} as const;
```

### Example: Status ID Conventions

```typescript
// Canonical: status_id for foreign key, status for display
export const CANONICAL_STATUS = {
  active: { id: 1, code: 'ACTIVE', label: 'Active' },
  voided: { id: 2, code: 'VOID', label: 'Voided' },
  refunded: { id: 3, code: 'REFUND', label: 'Refunded' },
} as const;
```

---

## Extraction Story Checklist

When performing extraction or package migration stories (moving code from `apps/api/src/lib` to `packages/*`):

### Pre-Extraction
- [ ] Identify all consumers of the code being extracted
- [ ] Establish canonical test fixtures for any new patterns introduced
- [ ] Ensure shared contracts are defined in `packages/shared`

### Route Flipping
- [ ] Flip routes to use package imports
- [ ] Verify all consumers updated to new import paths

### Post-Extraction (MANDATORY)
- [ ] **Immediately delete the adapter shim** in `apps/api/src/lib/{domain}/`
  - Do NOT leave shims lingering — they accumulate consumers over time
  - If the shim is still referenced somewhere, that indicates consumer debt that needs resolution
- [ ] Audit existing tests against any new canonical patterns
- [ ] Run full test suite to verify no regressions
- [ ] Update any remaining tests that still use old patterns

---

## Sprint Status Updates (MANDATORY — E45-A1 / E46-A1 / E46-A4)

`sprint-status.yaml` is a **shared state file** tracking all epic and story completion across the project. It must **never be replaced wholesale**. Every edit must be append-only.

**Append-Only Rule (E45-A1):**
- ✅ READ the file before editing
- ✅ APPEND only the new epic/stories section
- ✅ PRESERVE all existing epic entries (Epics 1–N)
- ❌ NEVER rewrite the file with partial content
- ❌ NEVER use `replaceAll` on epic section markers

**Preferred Method (E46-A1):**
- Use `npx tsx scripts/update-sprint-status.ts --epic N --story N-X --status done` (the canonical utility)
- Story input **MUST** use dash notation: `N-X` or `N-X-a`; title segment **MUST** be passed separately via `--title` (e.g., `--story 6-1-a --title platform-acl`; dot/short forms are invalid)
- Bucket after `N-X-` **MUST** be exactly one letter (`a-z`); malformed keys in format `N-X[alpha]` **MUST** be normalized to `N-X-[alpha]` (e.g., `--story 6-1a --title platform-acl` -> `6-1-a-platform-acl`)
- If `--story` matches multiple existing keys, command **MUST** fail unless `--multi` is passed intentionally
- If update fails due malformed historical keys, you **MUST** run cleaner first: `npx tsx scripts/clean-sprint-status.ts --epic N --fix`
- This prevents overwrite by design

**Mandatory Validation (E46-A4):**
- Before closing any epic: run `npx tsx scripts/validate-sprint-status.ts`
- The retrospective workflow (Step 0) enforces this check before the retro begins
- If validation fails, restore with: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`

**Malformed Historical Keys:**
- Use `npx tsx scripts/clean-sprint-status.ts --epic N` (dry run) to scan for malformed story keys
- Use `npx tsx scripts/clean-sprint-status.ts --epic N --fix` (apply) to rename or remove them

**Impact of violation:** Replacing the file destroys completion tracking for ALL prior epics. This is a P1 process failure.

---

## Retrospective Action Item Constraint (MANDATORY — E46-A2)

Every epic retrospective generates action items. To ensure follow-through:

**MAX 2 action items per retrospective:**
- ✅ Cap generated action items at 2 per epic retro
- ✅ Each must have an explicit owner (agent name or role)
- ✅ Each must have a deadline ("next retro" or specific epic number)
- ✅ Each must have a success criterion
- ❌ Do NOT generate more than 2 — prioritize ruthlessly
- ❌ Do NOT accept "TBD" for owner or deadline

**If more than 2 candidates are identified:**
- Pick the 2 highest-impact items for this retro
- Move remaining candidates to `action-items.md` as backlog items (not discarded)
- In the retro output, note which items were moved to backlog and why

**Why 2?** Three consecutive retrospectives (Epics 43, 44, 45) generated un-addressed action items. Fewer items, committed with explicit ownership, beats a long list that never gets done.

---

## Definition of Done (MANDATORY)

Before marking ANY story as DONE:

### Implementation
- [ ] All Acceptance Criteria implemented with evidence
- [ ] No breaking changes without cross-package alignment

### Story Done Authority (MANDATORY)

The implementing developer MUST NOT mark their own story done. Done requires:
- Reviewer GO (code review approval with no blockers)
- Story owner explicit sign-off

No story may be marked DONE based solely on self-attestation of the implementing developer.

### ACL Implementation (Epic 39)
- [ ] Resource-level permissions use `module.resource` format
- [ ] `requireAccess()` supports `resource` parameter
- [ ] Permission bits match canonical values (READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32)
- [ ] Permission masks match canonical values (CRUD=15, CRUDA=31, CRUDAM=63)
- [ ] Routes updated to use new module codes (no old codes like "users", "roles", "reports")
- [ ] Database migration adds `resource` column to `module_roles` table

### Testing
- [ ] Unit tests written and passing (in `__test__/unit/`)
- [ ] Integration tests for API boundaries (in `__test__/integration/`)
- [ ] Database pool cleanup hooks present

### Quality
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] `npm run build -w @jurnapod/api` passes
- [ ] Code review completed with no blockers
- [ ] AI review conducted (`bmad-code-review` agent)

### Observability
- [ ] All tenant-scoped metrics include `company_id` label
- [ ] Dashboard queries filter by authenticated tenant context

### Documentation
- [ ] Schema changes documented (if applicable)
- [ ] API changes reflected in contracts
- [ ] Dev Notes include files modified/created

---

## Canonical ACL & Permission Model (Epic 39)

### 8 Canonical Modules

| Module | Description |
|--------|-------------|
| `platform` | Users, roles, companies, outlets, settings |
| `pos` | Point of sale transactions and configuration |
| `sales` | Invoices, orders, payments |
| `inventory` | Items, stock movements, costing |
| `accounting` | Journals, accounts, fiscal years |
| `treasury` | Cash/bank transactions, accounts |
| `purchasing` | Suppliers, purchase orders, receipts, AP invoices/payments/credits |
| `reservations` | Bookings, tables |

### Permission Bits

| Bit | Name | Value | Purpose |
|-----|------|-------|---------|
| 1 | READ | 1 | View data and records |
| 2 | CREATE | 2 | Create new records |
| 4 | UPDATE | 4 | Modify existing records |
| 8 | DELETE | 8 | Remove records |
| 16 | ANALYZE | 16 | Reports, dashboards, analytics |
| 32 | MANAGE | 32 | Setup, configuration, administration |

### Permission Masks

| Mask | Value | Binary | Permissions |
|------|-------|--------|-------------|
| READ | 1 | `0b000001` | View only |
| WRITE | 6 | `0b000110` | CREATE + UPDATE |
| CRUD | 15 | `0b001111` | READ + CREATE + UPDATE + DELETE |
| CRUDA | 31 | `0b011111` | CRUD + ANALYZE |
| CRUDAM | 63 | `0b111111` | Full permissions |

### Resource-Level ACL Format

Permissions use `module.resource` format (e.g., `platform.users`, `accounting.journals`).

**Resource Categories:**
- **Operational**: CREATE, READ, UPDATE permissions (daily transactions)
- **Structural**: MANAGE, READ permissions (configuration, setup)
- **Analytical**: ANALYZE, READ permissions (reports, dashboards)

### Strict ACL Enforcement (Migration 0158)

As of Epic 39 completion, the ACL system enforces **mandatory resource-level permissions**:

| Rule | Status | Description |
|------|--------|-------------|
| `resource` NOT NULL | ✅ Enforced | Migration 0158 enforces `module_roles.resource IS NOT NULL` |
| No wildcard fallback | ✅ Enforced | `resource=NULL` does NOT grant resource-level access |
| Explicit resource required | ✅ Required | All `requireAccess()` calls must specify `resource` parameter |
| Module-only permissions | ❌ Removed | Legacy module-level-only permissions are no longer valid |

**Implementation Notes:**
- The `module_roles` table requires explicit `resource` values for all permission entries
- Routes using `requireAccess()` without a `resource` parameter will fail at runtime
- Migration 0158 expanded any remaining legacy null-resource entries to explicit resource values
- Test fixtures must specify explicit resources; no implicit grants exist

**Validation:**
```typescript
// ✅ Correct - explicit resource
requireAccess({ module: 'inventory', resource: 'items', permission: 'READ' })

// ❌ Invalid - missing resource (will fail)
requireAccess({ module: 'inventory', permission: 'READ' })
```

### Role Permission Matrix

| Role | platform | accounting | inventory | treasury | sales | pos | purchasing | reservations |
|------|----------|------------|-----------|----------|-------|-----|------------|--------------|
| SUPER_ADMIN | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| OWNER | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| COMPANY_ADMIN | CRUDA (31) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| ADMIN | READ (1) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) |
| ACCOUNTANT | READ (1) | CRUDA (31) | READ (1) | READ (1) | READ (1) | READ (1) | CRUDA (31) | 0 |
| CASHIER | 0 | 0 | 0 | 0 | 0 | CRUDA (31) | 0 | CRUDA (31) |

**Key Rules:**
- `reports` module removed — use `ANALYZE` on source modules (e.g., `sales.ANALYZE` for sales reports)
- MANAGE on `platform` for COMPANY_ADMIN: configuration, NOT company creation (SUPER_ADMIN only)
- MANAGE on `accounting.inventory.treasury` for COMPANY_ADMIN: fiscal year setup, costing method, bank accounts

### Module Resource Breakdown

**platform**: users, roles, companies, outlets, settings
**accounting**: journals, accounts, fiscal_years, reports
**inventory**: items, stock, costing
**treasury**: transactions, accounts
**sales**: invoices, orders, payments
**pos**: transactions, config
**purchasing**: suppliers, exchange_rates, orders, receipts, invoices, payments, credits, reports
**reservations**: bookings, tables

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
