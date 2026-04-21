---
project_name: 'jurnapod'
user_name: 'Ahmad'
date: '2026-03-28T00:00:00Z'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow', 'lessons_learned']
status: 'complete'
optimized_for_llm: true
---

# Project Context for AI Agents

_Critical rules and patterns. Read before implementing. Follow ALL rules exactly._

---

## Technology Stack & Versions

| Component | Tech | Notes |
|-----------|------|-------|
| Monorepo | npm workspaces | v0.2.2 |
| Runtime | Node.js >=22 | Repository requires Node 22 |
| Language | TypeScript ^5.7.3 | Strict mode, ESM only |
| API | Hono ^4.0.0, `@hono/node-server` ^1.19.11 | |
| Validation | Zod ^3.24.1, `@hono/zod-openapi` ^0.14.8 | |
| Database | mysql2 ^3.15.x | Promise API only |
| Date/Time | `@js-temporal/polyfill` ^0.5.1 | Never native Date for business logic |
| Auth | `@node-rs/argon2` ^2.0.2, `jose` ^6.1.2 | |
| Offline | Dexie ^4.x, IndexedDB | POS offline-first |
| Sync | Outbox pattern | Idempotent via `client_tx_id` |
| Capacitor | 8.0.1 (all packages pinned) | POS only |

### Path Aliases
- API imports: `@/` (e.g., `@/lib/db`) — never relative paths
- Cross-package: `@jurnapod/*` (e.g., `@jurnapod/shared`)
- Build order: `@jurnapod/offline-db` before POS/Backoffice

---

## Language-Specific Rules

### TypeScript
- Strict mode enabled; all packages compile without errors
- **Boundary rule**: Re-validate all data at API boundaries with Zod; TypeScript types don't survive serialization
- Keep workspace TypeScript versions aligned

### Date/Time
- **CRITICAL**: Never use native `Date` for business logic; use `@js-temporal/polyfill`
- MySQL → Temporal: `Temporal.Instant.fromEpochMilliseconds(row.ts)`
- Temporal → MySQL: `instant.epochMilliseconds` (BIGINT)
- BigInt → JSON: `BigInt(val).toString()`

### Money
- Never use `FLOAT`/`DOUBLE`; use `DECIMAL(18,2)` in SQL, `number` in TS
- Calculation: `Math.round((a + b) * 100) / 100`; never raw arithmetic
- SQL aggregation: `CAST(SUM(amount) AS DECIMAL(18,2))`

### Null Handling
- Prefer `undefined` over `null` in TypeScript
- Repository functions return `undefined`, never `null`
- Zod nullable pattern: `z.string().nullable().transform(v => v ?? undefined)`

---

## Framework-Specific Rules

### Hono API (apps/api)
- All routes use Zod validation on bodies/params/queries
- Auth guard: `app.use("/route", authGuard, ...handlers)`
- All mutations require `company_id` scoping; `outlet_id` where applicable
- Never bypass Zod validation for performance without profiling

### React (apps/backoffice, apps/pos)
- Functional components with hooks only
- **POS offline rule**: Never await network before writing to IndexedDB
- Mantine for backoffice, Ionic for POS
- Be strict about company/outlet scoping in admin/reporting screens

### Backoffice API Client (`apps/backoffice/src/lib/api-client.ts`)

**Token Resolution Order (canonical):**
1. Explicit string arg — legacy compat bridge, avoid using
2. `options.accessToken` — migration aid only, do not use in new code
3. `getStoredAccessToken()` from auth storage — canonical new path (default for all new code)

**Functions:**
| Function | Purpose | Use Case |
|----------|---------|----------|
| `apiRequest<T>()` | Standard JSON responses | Most API calls, handles 401 refresh/retry |
| `apiStreamingRequest()` | Streaming/blob responses | Exports, file downloads |
| `uploadWithProgress()` | XHR upload with progress | File uploads with progress tracking |
| `applyWithProgress()` | XHR JSON POST with progress | Import apply with progress tracking |

**Rules:**
- Never pass `accessToken` explicitly in new code — use canonical storage path
- XHR wrappers (`uploadWithProgress`, `applyWithProgress`) use XMLHttpRequest only where needed (progress events) and return Promises
- Keep error handling semantics in XHR wrappers aligned with `apiRequest()` (documented in code)
- See `apps/backoffice/__test__/unit/lib-api-client.test.ts` for behavioral tests

### Sync Patterns
- `/sync/push`: Fully transactional (doc + journal in same tx)
- `/sync/pull`: Delta sync via `updated_after` timestamp
- `client_tx_id` idempotency; returns `OK`/`DUPLICATE`/`ERROR`
- Max 3 retries with exponential backoff, then `FAILED`
- Do not mutate finalized transactions; use VOID/REFUND

### Module System (Epic 39)

**8 Canonical Modules:** platform, pos, sales, inventory, accounting, treasury, purchasing, reservations

**Resource-Level ACL:** Permissions use `module.resource` format (e.g., `platform.users`, `accounting.journals`)

**Permission Bits:** READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32

**Required Modules:** platform, accounting
**Optional Modules:** sales, pos, inventory, treasury, reservations

Check module enablement before exposing features.

---

## Testing Rules

### Canonical Test Directory Structure

All tests MUST use the `__test__/unit` and `__test__/integration` directory structure:

```
__test__/
├── unit/           # True unit tests (no real DB, mocked dependencies)
└── integration/    # Tests with real DB, HTTP calls, or external services
```

**Classification:**
- **Unit** (`__test__/unit/`): No DB, mocked deps, pure logic
- **Integration** (`__test__/integration/`): Real DB, HTTP, external services

**e2e tests** remain in `apps/{app}/e2e/` - separate category.

### Test Runner

All packages and apps use **vitest** with `globals: true`:

```typescript
// vitest.config.ts
export default defineConfig({
  resolve: { extensions: ['.js', '.ts', '.tsx'] },
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

All packages support:
- `npm test` - Run all tests
- `npm run test:unit` - Unit tests only
- `npm run test:integration` - Integration tests only
- `npm run test:single -- <file>` - Specific test file

### Test Log Rule (MANDATORY)

**Always run tests in the background with PID file tracking.** This ensures tests keep running even if the AI agent times out.

```bash
# CORRECT: Background test with PID file
nohup npm test -w @jurnapod/api > logs/test-results.log 2>&1 & echo $! > logs/test.pid
# Wait for completion
while kill -0 $(cat logs/test.pid) 2>/dev/null; do sleep 5; done
# Read results from log:
cat logs/test-results.log | grep -E "^(FAIL|Test Files|Tests)" | head -40

# WRONG: Foreground test (times out on long runs)
npm test -w @jurnapod/api
```

**Workflow:**
1. Run `nohup ... > logfile.log 2>&1 & echo $! > logs/test.pid` — capture PID
2. Poll `kill -0 $(cat logs/test.pid)` while tests run
3. When done, inspect log file with grep/cat — never rely on terminal output
4. Keep log files out of git (they're in `.gitignore`)

### Epic Kickoff Pre-Flight Gate (MANDATORY)

Before starting the first story of any epic, run and record these pre-flight checks:

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
```

If checks fail:
- Do **not** start story implementation until blockers are triaged.
- Classify each finding as either:
  1. **Blocking pre-existing issue** (must fix before epic starts), or
  2. **Tracked follow-up** (explicitly documented in epic risks/debt with owner).

### Incidental Fix Scope Policy

When a story encounters unrelated pre-existing issues:

- **Allow in-scope incidental fix** when all are true:
  - Change is small and low-risk (e.g., lint error, typo, clear guardrail bug)
  - It blocks validation or safe completion of current story/epic
  - The fix is documented in story dev notes and epic closeout notes

- **Defer to follow-up** when any are true:
  - Requires architectural redesign or broad refactor
  - Touches multiple domains outside current acceptance criteria
  - Cannot be validated quickly with focused tests

For deferred items, create a tracked action item with owner + priority (P0/P1/P2/P3).

### Canonical beforeAll seedCtx Pattern

When using `getSeedSyncContext()` in integration tests, always cache it in `beforeAll`
to eliminate async call overhead in `it()` blocks:

```typescript
// 1. Import with alias — the actual async load function
import { getSeedSyncContext as loadSeedSyncContext } from '../../../fixtures';

// 2. Suite-level variable to hold the cached context
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

// 3. Zero-overhead wrapper — just returns the cached value
const getSeedSyncContext = async () => seedCtx;

// 4. In beforeAll — call the load function ONCE
beforeAll(async () => {
  seedCtx = await loadSeedSyncContext();
});

// 5. In it() blocks — use the wrapper (no async overhead)
it('some test', async () => {
  const ctx = await getSeedSyncContext();  // ← synchronous return
  // use ctx.companyId, ctx.outletId, etc.
});
```

**Why two functions?**
- `loadSeedSyncContext()` — the actual async function that queries DB if not cached. Called once in `beforeAll`.
- `getSeedSyncContext()` — the zero-overhead wrapper that just returns the cached `seedCtx` value. Called in every `it()` block.

**Rules:**
- Never call `loadSeedSyncContext()` inside an `it()` block — always use the wrapper
- Always set deterministic passwords (`process.env.JP_OWNER_PASSWORD`) on login-capable test users
- Use `resetFixtureRegistry()` in `afterAll()` to clean up

### test-fixtures.ts Library
**Location**: `apps/api/src/lib/test-fixtures.ts`

| Function | Purpose |
|----------|---------|
| `createTestCompanyMinimal()` | Company with unique code |
| `createTestOutletMinimal(companyId)` | Outlet for company |
| `createTestUser(companyId)` | User for company |
| `createTestItem(companyId)` | Item for company |
| `createTestVariant(itemId)` | Variant for item |
| `getRoleIdByCode(roleCode)` | System role ID by code |
| `assignUserGlobalRole(userId, roleId)` | Global role assignment |
| `assignUserOutletRole(userId, roleId, outletId)` | Outlet-scoped role |
| `setModulePermission(companyId, roleId, module, mask)` | Module permission |
| `setupUserPermission({userId, companyId, roleCode, module, permission})` | Complete setup |
| `cleanupTestFixtures()` | Clean up all fixtures |
| `resetFixtureRegistry()` | Reset registry without deleting |

```typescript
// ✅ Correct - library functions
const company = await createTestCompanyMinimal();
await setupUserPermission({userId, companyId, roleCode: "OWNER", module: "inventory", permission: "create"});

// ❌ Incorrect - ad-hoc SQL for setup
await pool.execute(`INSERT INTO user_role_assignments...`);
```

**Fixture Flow Modes (MANDATORY):**
- **Full Fixture Mode (default):** Test setup MUST use canonical production package flow (API route or canonical package helper) so production invariants and test invariants remain identical.
- **Partial Fixture Mode (exception):** Test setup MAY use decomposed domain parts only when those parts are provided by the same production package that owns the domain invariant and full flow is unnecessary for the target assertion. Partial mode MUST be declared with scope, rationale, and owner in story notes.
- Fixture setup MUST NOT create a parallel business-write path.

### Integration Tests
- Create fixtures through canonical production package flow (API endpoints or canonical package helpers)
- Partial fixture mode allowed only via decomposed domain parts provided by the same production package that owns the domain invariant, with explicit justification
- Ad-hoc SQL allowed only for teardown, read-only verification

### ESLint Test Rules
| Rule | Purpose |
|------|---------|
| `no-hardcoded-ids` | Ban `company_id=1` patterns |
| `no-raw-sql-insert-items` | Ban `INSERT INTO items`; use `createItem()` |

---

## Code Quality Rules

### Naming
- Files: kebab-case (utilities), PascalCase (React components)
- Functions/variables: camelCase; Types/classes: PascalCase; Constants: SCREAMING_SNAKE_CASE
- Database columns: snake_case

### Security & Validation
- Never log passwords, tokens, PII
- Validate all external input with Zod
- Enforce `company_id` and `outlet_id` scoping on every data access
- Use parameterized queries only

### File Organization
- API: `routes/` (HTTP), `services/`, `lib/` (DB/logic)
- React: `components/`, `hooks/`, `pages/`
- Tests: `__test__/unit/` or `__test__/integration/` (canonical structure)

### API Response Patterns
- Standardized envelope (ADR-0006)
- Status codes: 200/201/400/401/403/404/500
- Error responses: machine-readable `code` + human-readable `message`

---

## Development Workflow

### Definition of Done
- [ ] All acceptance criteria implemented with evidence
- [ ] Unit tests written and passing
- [ ] No known technical debt (or tracked in sprint-status.yaml)
- [ ] Code review + AI review with no blockers
- [ ] Feature deployable (no feature flags hiding incomplete work)

### Story Done Authority (MANDATORY)
The implementing developer MUST NOT mark their own story done. Done requires:
- Reviewer GO (code review approval with no blockers)
- Story owner explicit sign-off

No story may be marked DONE based solely on self-attestation of the implementing developer.

### Branch & Commit
- Naming: `feature/`, `fix/`, `chore/`, `epic-N/`
- PR titles reference story IDs for traceability
- **No commit unless explicitly requested by user**

---

## Repo-Wide Invariants (NEVER Violate)

1. **Accounting/GL at center**: All business documents reconcile to journal effects
2. **Financial writes**: Transactionally safe and auditable
3. **POS offline-first**: Write locally, sync via outbox
4. **POS sync idempotent**: via `client_tx_id`; duplicate ≠ duplicate financial effects
5. **Tenant isolation**: All data enforces `company_id`; `outlet_id` where applicable
6. **Immutable financial records**: Use VOID/REFUND, never edit finalized records
7. **Audit logs canonical**: Filter by `success` not `result`
8. **Shared contracts**: TS/Zod contracts in `packages/shared` must stay aligned
9. **Reservation timezone**: No UTC fallback; resolve in order: outlet → company
10. **Resource-level ACL**: Permissions use `module.resource` format per Epic 39

### Temporary Scope Override (Architecture-First Freeze)

> **Active freeze — all agents must respect or obtain explicit approval.**

- **In-scope:** `apps/api` + shared/core packages (`packages/db`, `packages/shared`, `packages/auth`, `packages/modules/*`)
- **Frozen:** `apps/backoffice`, `apps/pos` — no new work except explicit emergency / regulatory / security exception
- **Priority:** `Correctness > Safety > Speed` (unchanged)

### Critical Anti-Patterns
- **Never** `FLOAT`/`DOUBLE` for money
- **Never** native `Date` for business logic
- **Never** bypass Zod validation
- **Never** mutate `POSTED`/`COMPLETED` records
- **Never** use hardcoded IDs (`company_id=1`)
- **Never** ad-hoc SQL in tests for setup
- **Never** relative import paths
- **Never** UTC fallback for timezone
- **Never** retry sync indefinitely (max 3)

---

## Architecture Cleanup Policy (MANDATORY)

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

## Migration Rules
- Rerunnable/idempotent DDL only; use `information_schema` checks (no `IF EXISTS` in ALTER)
- Run on MySQL 8.0+ AND MariaDB
- Additive changes only (never remove columns/indexes)

---

## Story & Epic Tracking

| File | Purpose |
|------|---------|
| `epics.md` | Central index (titles only for plugin parsing) |
| `epic-{N}.md` | Full definition with goals, stories, success criteria |
| `epic-{N}.retrospective.md` | Lessons learned |
| `story-{N}.{M}.md` | Story specification |
| `story-{N}.{M}.completion.md` | Story completion report |
| `sprint-status.yaml` | Story status tracking |
| `action-items.md` | Cross-epic action items tracker |

### Templates

| Template | Location | Purpose |
|----------|----------|---------|
| Story Spec | `docs/templates/story-spec-template.md` | Story specification with AC, API verification |
| Story Completion | `docs/templates/story-completion-template.md` | Story completion report |

### Epic Documentation Requirements
Every epic MUST have: definition, retrospective, story tracking in sprint-status.yaml

---

## Epic 13: Library Migration Patterns

**1. Batch Operations**: Collect changes → execute bulk
```typescript
const updates = [], inserts = [];
for (const row of rows) { exists ? updates.push({...}) : inserts.push({...}); }
await batchUpdateItems(updates, connection);
await batchInsertItems(companyId, inserts, connection);
```

**2. Validation Separation**: Sync (no DB) vs Async (requires DB) validation

**3. Adapter Pattern**: Bridge external interface to internal types

**4. Permission Utility**: Reusable `canManageCompanyDefaults(userId, companyId, module, permission)` function

---

## Epic 15: Connection Guard Pattern

**5. Connection Guard (`withKysely()`)**: Use wrapper to prevent connection leaks in library functions

```typescript
import { withKysely } from "@/lib/db";

export async function myQuery(companyId: number) {
  return withKysely(async (db) => {
    return db
      .selectFrom("items")
      .where("company_id", "=", companyId)
      .execute();
  });
}
```

| Pattern | Use Case |
|---------|----------|
| `withKysely()` | Simple read/write operations, single query functions |
| `newKyselyConnection()` | Multi-statement transactions requiring explicit control |

**1. Batch Operations**: Collect changes → execute bulk
```typescript
const updates = [], inserts = [];
for (const row of rows) { exists ? updates.push({...}) : inserts.push({...}); }
await batchUpdateItems(updates, connection);
await batchInsertItems(companyId, inserts, connection);
```

**2. Validation Separation**: Sync (no DB) vs Async (requires DB) validation

**3. Adapter Pattern**: Bridge external interface to internal types

**4. Permission Utility**: Reusable `canManageCompanyDefaults(userId, companyId, module, permission)` function

---

## Lessons Learned

| Lesson | Rule |
|--------|------|
| **Story completion = tests written, not deferred** | Integration tests must be in original AC |
| **Epic retro → next epic follow-up** | Address previous retro items in current planning |
| **TD tracking mandatory** | Add to TECHNICAL-DEBT.md immediately when created |
| **Use library functions in tests** | Centralizes schema changes; tests break less |
| **DB pool cleanup mandatory** | Tests hang without it |
| **QA from day one** | Validate regressions during story, not after |
| **API-first requires contract verification** | "Endpoint exists" ≠ "Endpoint is complete" - verify before building UI |
| **Documentation depth independent of bug count** | Completion reports should be consistent regardless of difficulty |
| **Permission design ≠ permission implementation** | Route-level checks ≠ per-button visibility |

---

## Directory Paths

```
_bmad-output/
├── planning-artifacts/
│   └── epics.md                    # Central index (titles only)
└── implementation-artifacts/
    ├── sprint-status.yaml          # Story tracking
    └── stories/epic-{N}/
        ├── epic-{N}.md            # Definition
        ├── epic-{N}.retrospective.md
        └── story-{N}.{M}.md      # Story files
```

---

_Last Updated: 2026-04-15_
