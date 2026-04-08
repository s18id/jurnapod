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

### Sync Patterns
- `/sync/push`: Fully transactional (doc + journal in same tx)
- `/sync/pull`: Delta sync via `updated_after` timestamp
- `client_tx_id` idempotency; returns `OK`/`DUPLICATE`/`ERROR`
- Max 3 retries with exponential backoff, then `FAILED`
- Do not mutate finalized transactions; use VOID/REFUND

### Module System
- Optional: `sales`, `pos`, `inventory`, `purchasing`; Required: `platform`, `accounting`
- Check module enablement before exposing features

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

### Integration Tests
- Create fixtures through API endpoints only
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
| `sprint-status.yaml` | Story status tracking |

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

_Last Updated: 2026-04-06_
