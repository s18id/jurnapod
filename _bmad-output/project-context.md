---
project_name: 'jurnapod'
user_name: 'Ahmad'
date: '2026-03-27T00:00:00Z'
sections_completed: ['technology_stack', 'language_specific_rules', 'framework_specific_rules', 'testing_rules', 'code_quality_rules', 'development_workflow_rules', 'lessons_learned']
existing_patterns_found: 18
status: 'complete'
rule_count: 65
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Core Platform
- **Monorepo**: npm workspaces, project `jurnapod` v0.2.2
- **Runtime**: Node.js >=22 (repository engines now require Node 22)
- **Language**: TypeScript ^5.7.3 (consistent across all packages—flag and fix drift)
- **Module System**: ESM only (`"type": "module"` in all packages)
- **Base Config**: `tsconfig.base.json` with strict mode, ES2022 target, Bundler resolution

### API Layer
- **Framework**: Hono ^4.0.0 with `@hono/node-server` ^1.19.11
- **Validation/OpenAPI**: Zod ^3.24.1, `@hono/zod-openapi` ^0.14.8
- **Database**: mysql2 ^3.15.x (promise API only)
- **Date/Time**: `@js-temporal/polyfill` ^0.5.1 (business logic dates—never native Date)
- **Auth**: `@node-rs/argon2` ^2.0.2 (password hashing), `jose` ^6.1.2 (JWT)
- **Real-time**: `ws` ^8.19.0 (WebSocket support)

### Frontend Applications
- **Backoffice**: React ^18.3.1, Vite ^5.4.21, Mantine ^7.17.1
  - **Build strategy**: Route-level lazy loading plus manual vendor chunks keep the main app bundle small and avoid Vite large-chunk warnings
- **POS**: React ^18.3.1, Vite ^5.4.15, Ionic React ^8.8.1, Capacitor 8.0.1
  - **CRITICAL**: Keep all Capacitor packages pinned to the same published version (`@capacitor/android`, `app`, `device`, `ios`, `network`, `cli`, `core` all at `8.0.1` today)
- **Routing**: `react-router-dom` ^7.13.1 (POS only)

### Shared Infrastructure
- **Contracts**: `packages/shared` exports Zod schemas used across all apps
- **Path Aliases**:
  - `@/lib/*` and `@/services/*` for API (enforced—no relative paths like `../../../`)
  - `@jurnapod/*` for cross-package imports (mapped in `tsconfig.base.json`)
- **Build Order**: `@jurnapod/offline-db` must build before POS/Backoffice dev/build

### Offline & Sync
- **Client Storage**: Dexie ^4.x with IndexedDB
- **Outbox Pattern**: Local-first writes, sync via queue
- **Sync Core**: Vitest ^1.6.1 (this package only—do not introduce Vitest elsewhere)

### Testing
| Scope | Runner | Notes |
|-------|--------|-------|
| API Unit | Node test runner + tsx | Must close DB pool in `test.after()` |
| API Integration | Node test runner | API-driven setup only; no direct DB writes for fixtures |
| Backoffice/POS E2E | Playwright ^1.55.x | `@playwright/experimental-ct-react` for component tests |
| POS Unit | Node test runner + tsx | `fake-indexeddb` ^6.2.5 for IndexedDB mocking |
| sync-core | Vitest ^1.6.1 | Exception to Node runner rule |

### Database & Persistence
- **Engines**: MySQL 8.0.44+ and MariaDB (dual compatibility required)
- **Storage Engine**: InnoDB required
- **Money**: `DECIMAL(18,2)` columns only—never `FLOAT`/`DOUBLE`
- **Migrations**: Rerunnable/idempotent DDL only; use `information_schema` checks for portability (no `IF EXISTS` in ALTER)

### Critical Compatibility Rules for AI Agents
1. Keep all Capacitor packages synchronized to the same published version
2. Use `@js-temporal/polyfill` for all business date logic
3. DB pool cleanup is mandatory in API tests—tests hang without it
4. Only sync-core uses Vitest; all other packages use Node test runner
5. Maintain TypeScript version consistency across all packages
6. POS/Backoffice pre-build depends on offline-db—respect the dependency chain

## Critical Implementation Rules

### Language-Specific Rules

#### TypeScript Configuration
- Strict mode enabled via `tsconfig.base.json` (`"strict": true`)
- Target: `ES2022`, Module: `ESNext`, Resolution: `Bundler`
- All packages must compile without errors—CI blocks on type errors
- **Boundary rule**: Re-validate all data at API boundaries with Zod; TypeScript types do not survive serialization
- Keep workspace TypeScript versions aligned across packages

#### Import/Export Conventions
- **API imports**: Use `@/` path alias (e.g., `import { getDbPool } from "@/lib/db"`) — never relative paths like `../../../../lib/`
  - *Note*: `@/` requires explicit path mapping; some test contexts need `tsconfig-paths/register`
- **POS/Backoffice imports**: Use workspace-relative paths or `@jurnapod/*` aliases—**do not use `@/`**
- **Cross-package imports**: Use `@jurnapod/*` workspace aliases (e.g., `import { z } from "@jurnapod/shared"`)
- **Default exports avoided** in shared contracts; prefer named exports for Zod schemas
- **Enforcement**: ESLint `@typescript-eslint/no-restricted-imports` blocks relative imports in API package

#### Date/Time Handling
- **CRITICAL**: Never use native `Date` for business logic; use `@js-temporal/polyfill` (server-side)
  - *Client-side*: Use native `Date` with `date-fns` unless Temporal polyfill is explicitly loaded
- **Interoperability pattern**:
  - MySQL → Temporal: `Temporal.Instant.fromEpochMilliseconds(row.reservation_start_ts)`
  - Temporal → MySQL: `instant.epochMilliseconds` (store as BIGINT)
- Canonical reservation time: unix milliseconds in `BIGINT` columns (`reservation_start_ts`, `reservation_end_ts`)
- **Validation rule**: Always enforce `reservation_end_ts > reservation_start_ts` before persistence
- **BigInt JSON gotcha**: BigInt cannot serialize to JSON; convert to string: `BigInt(val).toString()`
- Date-only filtering must resolve timezone in order `outlet -> company`; no UTC fallback

#### Money Handling
- Never use `FLOAT` or `DOUBLE` for monetary values
- Use `DECIMAL(18,2)` in SQL; use `number` in TypeScript (no custom money wrapper needed)
- **Calculation rule**: Never do raw arithmetic on money. Use: `Math.round((a + b) * 100) / 100`
  - `toFixed(2)` returns string—use only for display formatting
- **SQL aggregation**: Cast results: `CAST(SUM(amount) AS DECIMAL(18,2))` to prevent float drift
- **Test requirement**: Unit tests must verify monetary calculations round-trip correctly through database
- Be explicit about rounding and avoid hidden drift

#### Null Handling
- Prefer `undefined` over `null` for optional fields in TypeScript
- **Repository rule**: All repository layer functions must return `undefined`, never `null`
- `NULL` in MySQL maps to `null` in query results (mysql2 returns `null`, not `undefined`)
- **Zod pattern for nullable DB columns**: `z.string().nullable().transform(v => v ?? undefined)`
- Coalesce `NULL` to `undefined` at the boundary before returning from repositories

#### Error Handling
- Prefer `neverthrow` Result types for fallible operations; avoid throwing for expected failures
- Use `ResultAsync` for async operations that may fail
- Prefer precise typed guards over loose `unknown` checks
- Keep duplicate-key, foreign-key, auth, and tenant-scope error mapping stable

### Framework-Specific Rules

#### Hono API (apps/api)
- Route handlers use `c.json()` / `c.jsonT()` for typed JSON responses
- All routes must have Zod validation on request bodies, params, and query strings
- Use `@hono/zod-openapi` for OpenAPI contract generation
- Auth guard middleware composes on routes: `app.use("/route", authGuard, ...handlers)`
- Response envelope follows standardized format (see ADR-0006)
- All mutations require `company_id` scoping; `outlet_id` scoping where applicable
- Never bypass Zod validation for performance—profile first
- Prefer shared contracts from `packages/shared`
- Do not bypass auth or tenant guards for convenience

#### React (apps/backoffice, apps/pos)
- Use functional components with hooks only; class components are not used
- Mantine UI components preferred in backoffice; Ionic components in POS
- State: prefer local `useState`/`useReducer` over global stores; context for cross-cutting concerns only
- **POS offline rule**: Never await network before writing local state—write to IndexedDB first
- Data fetching: use React Query or similar for server state; Dexie for local state
- Component files: co-locate tests (`Component.test.tsx`) alongside source
- Prefer explicit, traceable financial UX over hidden behavior in backoffice workflows
- Reporting should derive from journal/accounting logic, not duplicated ad hoc state
- Be strict about company/outlet scoping in admin and reporting screens

#### Dexie / IndexedDB (offline storage)
- Schema version migrations must be additive only (add tables/columns; never remove)
- All POS tables must have `companyId` + `outletId` index for tenant isolation
- Use Dexie transactions for multi-record writes
- **Outbox table**: `sync_outbox` with `id`, `client_tx_id`, `payload`, `status`, `attempts`, `last_error`
- Outbox status transitions: `PENDING → SENT → (OK | FAILED)` — never regress

#### Sync Patterns
- POS sync is idempotent via `client_tx_id` (UUID v4); server returns `OK`, `DUPLICATE`, or `ERROR`
- Never retry sync indefinitely—max 3 attempts with exponential backoff; then mark `FAILED`
- `/sync/push` must be fully transactional: business document + journal entry in same DB transaction
- `/sync/pull` uses delta sync via `updated_after` timestamp parameter
- Dine-in sessions: finalize checkpoints sync canonical state to `pos_order_snapshot_lines`
- Outbox transitions must remain safe and understandable to operators
- Do not allow direct mutation of finalized transactions; use VOID/REFUND style corrections

#### Module System
- Optional modules: `sales`, `pos`, `inventory`, `purchasing`
- Required modules: `platform`, `accounting`
- Always check module enablement before exposing features (guard routes and UI)
- Company-specific module configs cascade: company → outlet

### Testing Rules

#### API Unit Tests (Node test runner + tsx)
- **CRITICAL**: All tests using `getDbPool()` must close the pool in `test.after()`:
  ```typescript
  test.after(async () => { await closeDbPool(); });
  ```
  Without this, tests hang indefinitely after completion.
- Test files live alongside source: `src/lib/feature.test.ts`
- Use `test.describe()` for grouping; `test.it()` / `test("name", async () => {})` for cases
- DB setup via factory functions; never make real HTTP calls for unit tests
- Run from repo root and prefer single-file verification before full-suite execution

#### API Integration Tests
- **Fixture policy**: Create/mutate fixtures through API endpoints only
- Direct DB writes are **allowed only** for teardown cleanup and read-only verification
- No hardcoded IDs; use unique per-run identifiers
- Use `finally` blocks for deterministic cleanup

#### Sync Route Tests (push, pull)
- **Idempotency**: Must test `client_tx_id` deduplication (send same payload twice → second returns `DUPLICATE`)
- **Retry handling**: Test `FAILED` → retry → `OK` flow
- **Auth**: Test unauthenticated → 401, wrong company → 403
- **Error path**: Malformed payload → `ERROR` with validation message
- Sync changes must verify retries/conflicts and auth boundaries

#### POS Offline Tests
- Use `fake-indexeddb` for IndexedDB mocking
- Test outbox transitions: `PENDING → SENT → OK/FAILED`
- Test offline → online transition: queued items sync correctly
- Test `client_tx_id` uniqueness enforcement
- Cover duplicate-send safety explicitly for offline/sync changes

#### Test Naming & Organization
- File: `src/**/*.test.ts` (unit), `tests/integration/*.integration.test.mjs` (integration)
- Use descriptive names: `test("rejects negative quantity", ...)`
- Group related cases: `test.describe("validation", () => { ... })`

#### Coverage Expectations
- Critical paths require tests: auth, sync, posting, mutations, tenant scoping
- Happy path + at least one error path per mutation
- New financial logic requires COGS rounding, money round-trip tests
- Changes in accounting, sync, auth, tenant scoping, migrations, and reports require focused tests
- Do not mark stories done without passing-test evidence and review completion

#### Running Tests
- **Single file first**: Always run a single test file before running the full suite
  ```bash
  npm run test:single <path-to-test-file>
  ```
- **Filter output**: Use `tail` / `grep` on test output to isolate failures
- **Full suite**: Run full test only after single-file verification passes

### Code Quality & Style Rules

#### Naming Conventions
- **Files**: kebab-case for utilities/scripts, PascalCase for React components
- **Functions/variables**: camelCase
- **Types/classes/interfaces**: PascalCase
- **Constants**: SCREAMING_SNAKE_CASE
- **Database columns**: snake_case
- **Test files**: `*.test.ts` (unit), `*.integration.test.mjs` (integration)

#### File Organization
- **API**: Routes in `src/routes/`, services in `src/services/`, lib utilities in `src/lib/`
- **React**: Components in `src/components/`, hooks in `src/hooks/`, pages in `src/pages/`
- **Shared packages**: Flat structure with domain-named subdirectories in `src/`
- Co-locate tests next to source files

#### Linting & Formatting
- ESLint enforces code quality; CI fails on warnings (`--max-warnings=0`)
- No enforced prettier config currently; use editor defaults matching project style
- TypeScript strict mode required; do not disable strict checks without Arch/QA approval
- Keep changes domain-focused; avoid broad cleanup unrelated to the story
- Prefer correctness, auditability, and tenant isolation over cosmetic refactors

#### Documentation
- New route handlers require JSDoc or `@hono/zod-openapi` metadata
- Complex business logic requires inline comments explaining the "why"
- README files document setup and app-specific patterns (not repeated in project-context)
- Avoid comments that restate obvious code; document the "why" for complex business logic

#### API Response Patterns
- Always use standardized response envelope (see ADR-0006)
- HTTP status codes: 200 success, 201 created, 400 validation error, 401 unauthenticated, 403 forbidden, 404 not found, 500 server error
- Error responses include machine-readable `code` and human-readable `message`

#### Security & Validation
- Never log sensitive data (passwords, tokens, PII)
- Validate all external input with Zod before processing
- Enforce `company_id` and `outlet_id` scoping on every data access
- Use parameterized queries only (no string concatenation for SQL)
- Do not introduce hidden financial behavior, silent mutation, or cross-tenant leakage risks

#### Architectural Boundaries
- Keep shared schemas/contracts in `packages/shared` and update all affected consumers together
- Preserve existing architectural boundaries instead of rebuilding monolith-style utilities/routes

### Development Workflow & Critical Rules

#### Branch & Commit Conventions
- Branch naming: `feature/description`, `fix/description`, `chore/description`, `epic-N/description`
- Commit messages: concise, imperative mood, reference story IDs where applicable
- PR titles must reference story IDs for traceability
- **No commit unless explicitly requested by user**
- Use hard timeouts on long-running validation commands
- Run targeted checks first, then broader validation

#### Definition of Done
All stories require before marking DONE:
- [ ] All acceptance criteria implemented with evidence
- [ ] Unit tests written and passing
- [ ] No known technical debt (or debt items formally created in sprint-status.yaml)
- [ ] No breaking changes without cross-package alignment
- [ ] Code review completed with no blockers
- [ ] AI review conducted (bmad-code-review agent)
- [ ] Feature is deployable (no feature flags hiding incomplete work)
- [ ] No hardcoded values or secrets in code
- Update both story files and `sprint-status.yaml` when statuses change
- Fix P1/P2 review findings before moving work to done
- Keep completion notes with files changed and validation evidence

#### Repo-Wide Invariants (NEVER violate)
1. **Accounting/GL at center**: All business documents must reconcile to journal effects
2. **Financial writes**: Must be transactionally safe and auditable
3. **POS offline-first**: Write locally first, then sync via outbox
4. **POS sync idempotent**: via `client_tx_id`; duplicate payloads cannot create duplicate financial effects
5. **Tenant isolation**: All data must enforce `company_id`; `outlet_id` where applicable
6. **Immutable financial records**: Use VOID/REFUND correction flows; never edit finalized records
7. **Audit logs**: `audit_logs.success` is canonical; filter by `success` not `result`. Non-success logs exist for forensics—never filter them from existence
8. **Shared contracts**: TypeScript/Zod contracts in `packages/shared` must stay aligned across all apps/packages
9. **Reservation timezone**: No UTC fallback; resolve timezone in order `outlet -> company`

#### Critical Anti-Patterns
- **Never** use `FLOAT`/`DOUBLE` for money (in code or DB)
- **Never** use native `Date` for business logic
- **Never** bypass Zod validation for performance without profiling evidence
- **Never** mutate a `POSTED` or `COMPLETED` record—use correction flows
- **Never** mix outlets or companies in queries—always scope by `company_id` + `outlet_id`
- **Never** retry sync indefinitely—max 3 attempts, then mark `FAILED` and surface to operator
- **Never** log passwords, tokens, or PII
- **Never** wrap indexed timestamp columns in SQL functions; apply functions only on constants
- **Never** use UTC fallback for timezone resolution; resolve in order: outlet → company
- **Never** use relative import paths (`../../../../lib/`); use `@/` alias exclusively

#### Migration Rules
- All migrations must be rerunnable/idempotent (no `IF NOT EXISTS` in `ALTER TABLE ADD COLUMN`)
- Use `information_schema` existence checks before DDL
- Migrations must run on both MySQL 8.0+ and MariaDB
- Additive changes only for schema migrations (never remove columns/indexes)
- **Backfill strategy**: Legacy rows with incomplete data must be backfilled at migration time using effective defaults, then frozen historically
- Avoid breaking shared payload/schema contracts across apps when migrations affect API shape

#### Reservation Time Schema (canonical)
- Canonical reservation time uses unix milliseconds in `BIGINT` columns:
  - `reservation_start_ts` (source of truth for reporting and date-range filtering)
  - `reservation_end_ts` (source of truth for calendar windows and overlap checks)
- Keep API compatibility field `reservation_at`, but derive it from `reservation_start_ts`
- Overlap rule: `a_start < b_end && b_start < a_end`; `end == next start` is non-overlap
- Query/index rule: never wrap indexed timestamp columns in SQL functions
- No UTC fallback for missing reservation timezone resolution

#### Story & Epic Tracking
- Stories tracked in `_bmad-output/implementation-artifacts/stories/epic-{N}/story-{N}.{M}.md`
- Completion notes required: `_bmad-output/implementation-artifacts/stories/epic-{N}/story-{N}.{M}.completion.md`
- Sprint status in `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Epic status transitions: `backlog → in-progress → done`
- Story status transitions: `backlog → ready-for-dev → in-progress → review → done`

---

## Lessons Learned (Epic 6 & Prior)

_This section captures key learnings to inform future development. AI agents should internalize these patterns._

### Epic 6 Lessons (Technical Debt Consolidation)

| Lesson | Evidence | Impact |
|--------|----------|--------|
| **Story completion = tests written, not deferred** | Integration tests retrofitted in 6.7 after original stories completed | Unit tests passing ≠ API-level validation; integration tests must be in original AC |
| **Epic retro → next epic follow-up pattern works** | Epic 5 items addressed in Epic 6 kept user promises | Reduces backlog of known issues; should continue as standard practice |
| **Documentation (ADRs) are essential** | TECHNICAL-DEBT.md registry created in 6.6 | First place to check when onboarding; future developers understand decisions |
| **QA involvement needed from day one** | Technical debt stories impact existing behavior | Validate no regressions during story, not after |
| **"No new TD without tracking" rule** | TD-009-012 created during Epic 6 | All technical debt must be added to registry immediately when created |

### Prior Epic Lessons

| Lesson | Source | Rule |
|--------|--------|------|
| **Infrastructure stories must include API endpoints** | Epic 5 | When story provides "API endpoint pattern," actual endpoint must be included |
| **State management in hooks needs explicit patterns** | Epic 5 | `overrideFilters` pattern (pass parameters directly, not rely on state updates) for async form operations |
| **Date/time handling requires explicit timezone strategy** | Epic 5 | User-selected dates are local; storage uses ISO 8601 with timezone; display formatting at presentation layer |
| **Integration tests should be part of framework epics** | Epic 5 | Deferring creates gaps that compound; even basic API tests should be included |

### Process Rules Derived from Lessons

1. **Integration tests in original AC** - API-level integration tests (upload → validate → apply flow) must be part of acceptance criteria, not retrofitted
2. **QA from day one** - For technical debt stories, QA validates regressions during story, not after
3. **TD tracking mandatory** - Any technical debt created during a story must be added to `docs/adr/TECHNICAL-DEBT.md` immediately
4. **Epic retro → next epic follow-up** - Address previous epic's retrospective items in current epic planning

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

---

_Last Updated: 2026-03-27_
