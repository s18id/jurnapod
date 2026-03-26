# Epic 7: Operational Hardening & Production Readiness

**Goal:** Address critical technical debt from Epic 6 that blocks production scalability, complete the remaining TDB backlog, and deliver one new feature area to maintain forward momentum.

**Business Value:**
- Import sessions survive server restarts and multi-instance deployments
- Batch operations are recoverable from partial failures
- Remaining open TDB items cleared to reduce long-term maintenance burden
- New feature capability unlocked for users

**Success Metrics:**
- Import session storage migrated to MySQL (multi-instance safe)
- Batch failure recovery implemented with transactional guarantees
- TDB open P2 items: 0 (all four TD-026 through TD-029 resolved)
- TDB open P3 items: ≤2 (from current 4)
- Test count: ≥950 (from current 881)
- Integration tests included in original story ACs — no deferral

---

## Epic 7 Action Items from Epic 6 Retrospective

These process improvements must be applied starting from Story 7.1:

| # | Action Item | Owner | Priority |
|---|-------------|-------|----------|
| 1 | QA involvement from day one of each story | Quinn | P1 |
| 2 | Integration tests written in original story AC — not retrofitted | All devs | P1 |
| 3 | "No new TD without tracking" — add to registry immediately | Winston | P1 |
| 4 | TD health check template produced in Story 7.1 | Bob | P2 |
| 5 | Clearer epic scope boundaries for capacity planning | Bob/Alice | P2 |

---

## Story 7.1: TDB Registry Fix + TD Health Check Template

**Context:**

The Technical Debt Registry has two issues to fix before Epic 7 begins:
1. TD-016 through TD-019 incorrectly marked `Open` — resolved in Story 6.7
2. New debt from Epic 6 retro assigned conflicting IDs — reassigned as TD-026 through TD-029

Additionally, the Epic 6 retro action item #4 calls for a per-epic TD health check template.

**Acceptance Criteria:**

**AC1: Registry Corrections**
- Update TD-016 through TD-019 status to `RESOLVED` with reference to Story 6.7
- Add TD-026 through TD-029 with correct IDs, descriptions, and resolution plans
- Update summary statistics table

**AC2: TD Health Check Template**
- Create `docs/adr/td-health-check-template.md`
- Template covers: open P1/P2 items audit, new debt introduced this epic, registry update checklist
- Add reference to template in TECHNICAL-DEBT.md process section
- Template should be runnable before every epic retrospective

**AC3: Epic 6 Retro Process Items**
- Document "No new TD without tracking" rule in TECHNICAL-DEBT.md process section
- Add TD debt checklist to story template (`_bmad-output/implementation-artifacts/stories/story-template.md` or equivalent)

**Estimated Effort:** 0.5 day
**Risk Level:** None (process/documentation only)

---

## Story 7.2: Import Session Persistence (MySQL)

**Context:**

TD-026: Import sessions are stored in an in-memory `Map` in `apps/api/src/routes/import.ts`. This has three production risks:
- Sessions are lost on server restart (users mid-import lose progress)
- Sessions are not shared across instances (multi-instance deployments fail)
- Memory leak risk if cleanup timer misfires

**Decision:** MySQL session table (not Redis) — no new infrastructure dependency; horizontal scaling can be revisited when required.

**Acceptance Criteria:**

**AC1: Session Table Migration**
- Create migration: `import_sessions` table with `session_id`, `company_id`, `payload` (JSON), `created_at`, `expires_at`
- InnoDB engine, `DECIMAL(18,2)` for any money fields in payload
- Index on `(company_id, session_id)` and `expires_at` for cleanup queries
- Migration must be rerunnable/idempotent (use `information_schema` check — no `IF NOT EXISTS` in ALTER)

**AC2: Session Service**
- Create `apps/api/src/lib/import/session-store.ts`
- Interface: `createSession()`, `getSession()`, `updateSession()`, `deleteSession()`, `cleanupExpired()`
- 30-minute TTL enforced via `expires_at` column — no in-memory timer
- Company ID required on all operations (tenant isolation)

**AC3: Route Migration**
- Replace in-memory `uploadSessions` Map in `import.ts` with session service
- Remove runtime warning about session count threshold (no longer needed)
- Maintain identical API surface — no breaking changes to import endpoints

**AC4: Cleanup Job**
- Background cleanup of expired sessions on API startup (and optionally on cron schedule)
- Log count of cleaned sessions at INFO level

**AC5: Integration Tests**
- Session survives simulated restart (new service instance reads existing session from DB)
- Concurrent sessions from different company IDs remain isolated
- Expired session returns 404 / appropriate error
- Cleanup removes only expired sessions

**Estimated Effort:** 2 days
**Risk Level:** Medium (touches import flow — regression risk on upload/validate/apply pipeline)
**Dependencies:** Story 7.1 (registry updated before new TD work starts)

---

## Story 7.3: Batch Failure Recovery & Session Hardening

**Context:**

TD-027 through TD-029 from Epic 6 retro:
- **TD-027:** Batch processing has no partial-failure visibility — caller can't distinguish "batch 3 of 10 failed" from total failure
- **TD-028:** Session timeout edge case — a session expiring mid-apply leaves imported data in an inconsistent state
- **TD-029:** No partial resume — if an import of 10,000 rows fails at row 8,000, the entire import must restart

**Acceptance Criteria:**

**AC1: Batch Progress Tracking (TD-027)**
- `BatchResult` type extended with `batchesCompleted`, `batchesFailed`, `rowsProcessed`, `rowsFailed`
- Caller receives per-batch outcome — distinguishable partial failure from total failure
- Progress persisted to `import_sessions` table (leverage Story 7.2 schema)

**AC2: Session Expiry Guard (TD-028)**
- Before executing `apply`, validate session is not expired
- If session expires mid-apply, transaction rolls back cleanly
- Return structured error: `SESSION_EXPIRED` with rows-processed count so user can restart informed

**AC3: Partial Resume (TD-029)**
- After successful apply, record `last_successful_batch` in session row
- If apply is re-invoked on same session ID, skip already-committed batches
- Resume from checkpoint batch with consistent transaction boundaries
- Limit: resume only within session TTL window; expired sessions cannot resume

**AC4: Integration Tests**
- Import of N rows fails at batch K — verify rows 1..K-1 committed, rows K..N not committed (or all rolled back depending on mode)
- Session expiry mid-apply triggers clean rollback
- Resume from checkpoint skips committed batches and continues correctly

**Estimated Effort:** 2 days
**Risk Level:** Medium (batch processor changes affect all import operations)
**Dependencies:** Story 7.2 (session table must exist)

---

## Story 7.4: Fixed-Assets Route Test Coverage Backfill

**Context:**

TD-006: Fixed-assets CRUD endpoints have thin test coverage compared to items and item-groups, identified in the Epic 3 retrospective but deferred.

**Acceptance Criteria:**

**AC1: Route Coverage**
- Add unit tests for all fixed-assets CRUD routes: list, get, create, update, delete
- Cover: happy path, validation errors, not-found, company-scoped isolation

**AC2: Integration Tests**
- Add API-level integration test for create → get → update → delete flow
- Consistent with patterns established in Story 6.7 import integration tests

**AC3: No Regressions**
- All existing 881+ tests continue to pass

**Estimated Effort:** 1 day
**Risk Level:** Low (tests only — no production code changes)
**Dependencies:** None

---

## Story 7.5: Streaming Parser Optimization

**Context:**

TD-008 (CSV) and TD-009/registry (Excel): Both parsers load entire files into memory before processing. The 50MB file limit mitigates impact today, but large files near the limit consume 100-150MB (CSV) or 150-250MB (Excel) during parsing.

**Acceptance Criteria:**

**AC1: Streaming CSV Parser**
- Replace `Papa.parse(fileContent, ...)` with Papa.parse stream mode using Node.js streams
- Memory footprint for a 50MB CSV file stays under 20MB during parsing
- Maintain identical validation and row-extraction behaviour

**AC2: Streaming Excel Parser**
- Replace `XLSX.read(file, ...)` bulk load with `xlsx-stream-reader` or equivalent incremental approach
- Process sheets row-by-row rather than loading full workbook object
- Maintain identical column mapping and type conversion behaviour

**AC3: No Regression**
- All existing import integration tests pass with streaming parsers
- File size limit (50MB) enforcement unchanged

**Estimated Effort:** 2 days
**Risk Level:** Medium (parser changes affect all import formats)
**Dependencies:** Story 7.2 (session store decoupled from in-memory Map before touching parser internals)

---

## Story 7.6: FK Validation Batch Optimization

**Context:**

TD-012: The `validateForeignKeys` interface processes rows sequentially, creating potential N+1 database queries if any validator queries the DB per row (e.g., validating item group IDs, outlet IDs). Currently no validator makes DB calls per row, but the pattern allows it — and future implementers may not notice the trap.

**Acceptance Criteria:**

**AC1: Batch Validation Helper**
- Create `batchValidateForeignKeys()` utility in `apps/api/src/lib/import/validator.ts`
- Groups FK lookups by table, queries with `IN` clause: `SELECT id FROM table WHERE company_id = ? AND id IN (?)`
- Returns `Map<id, boolean>` for O(1) per-row lookup after single query
- Document the pattern with inline comments warning against per-row DB calls

**AC2: Existing Validators Updated**
- Update item group and outlet FK validators to use batch helper
- Verify no per-row DB queries remain in validator chain

**AC3: Tests**
- Unit test: batch helper issues one query for N rows, not N queries
- Integration test: import with FK validation passes/fails correctly after batch optimization

**Estimated Effort:** 1 day
**Risk Level:** Low (optimization only — identical validation results expected)
**Dependencies:** None

---

## Story 7.7: Export & Settings Route Test Coverage

**Context:**

`apps/api/src/routes/export.ts` is 513 lines handling critical export flows (CSV, Excel, large dataset streaming) with **zero test coverage**. Story 6.7 added 19 integration tests for the import side — the export side was left unmatched. Four settings route files (640+ combined lines) also have no test pairs.

This is the highest-priority quality gap remaining after Epic 7's debt work and aligns with the epic's operational hardening theme.

**Note:** Variant-Level Sync for POS (Q3 2026 roadmap item) is deferred to Epic 8. All prerequisites (item-prices domain isolation from Epic 3) are in place.

**Acceptance Criteria:**

**AC1: Export Route Integration Tests**
- Add `apps/api/src/routes/export.test.ts`
- Cover: export with filters, format selection (CSV vs Excel), column selection
- Cover: large dataset warning (>50K rows → CSV recommendation)
- Cover: company-scoped isolation (company A cannot export company B data)
- Cover: error states (invalid entity type, missing params)
- Mirror the integration test pattern established in Story 6.7 import tests

**AC2: Settings Route Unit Tests**
- Add tests for `settings-config.ts`, `settings-pages.ts`, `settings-modules.ts`, `settings-module-roles.ts`
- Cover: CRUD happy paths, validation errors, authorization checks

**AC3: No Regressions**
- All existing tests pass; test count ≥ 950 confirmed

**Estimated Effort:** 1.5 days
**Risk Level:** Low (tests only — no production code changes)
**Dependencies:** None (can run in parallel with 7.4-7.6)

---

## Technical Debt Addressed in Epic 7

| TD ID | Description | Story | Priority |
|-------|-------------|-------|----------|
| TD-006 | Fixed-assets route test gap | 7.4 | P3 |
| TD-008 | CSV streaming memory optimization | 7.5 | P3 |
| TD-009 | Excel streaming memory optimization | 7.5 | P3 |
| TD-012 | FK validation N+1 risk | 7.6 | P3 |
| TD-026 | Import session in-memory storage | 7.2 | P2 |
| TD-027 | Batch processing partial-failure visibility | 7.3 | P2 |
| TD-028 | Session timeout edge case mid-apply | 7.3 | P2 |
| TD-029 | Batch failure recovery / partial resume | 7.3 | P2 |

**P2 items after Epic 7:** 0 open
**P3 items after Epic 7:** 0 open (TD-013, TD-014, TD-015 remain as P4)

---

## Estimated Timeline

| Story | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 7.1 | TDB Registry Fix + Health Check Template | 0.5 day | None |
| 7.2 | Import Session Persistence (MySQL) | 2 days | 7.1 |
| 7.3 | Batch Failure Recovery & Session Hardening | 2 days | 7.2 |
| 7.4 | Fixed-Assets Test Coverage Backfill | 1 day | None |
| 7.5 | Streaming Parser Optimization | 2 days | 7.2 |
| 7.6 | FK Validation Batch Optimization | 1 day | None |
| 7.7 | Export & Settings Route Test Coverage | 1.5 days | None (parallel with 7.4-7.6) |

**Total Estimated Effort:** 10 days (~2 weeks)

---

## Files to Create/Modify

### New Files
- `apps/api/src/lib/import/session-store.ts` — MySQL-backed session service
- `docs/adr/td-health-check-template.md` — Per-epic TD health check template
- Database migration: `import_sessions` table

### Files to Modify
- `apps/api/src/routes/import.ts` — Replace in-memory Map with session service
- `apps/api/src/lib/import/parsers.ts` — Streaming CSV/Excel parsers
- `apps/api/src/lib/import/validator.ts` — Batch FK validation helper
- `apps/api/src/lib/import/batch-processor.ts` — Progress tracking, resume capability
- `docs/adr/TECHNICAL-DEBT.md` — Ongoing updates per "no new TD without tracking" rule

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Session migration breaks active imports mid-flight | Deploy during low-traffic window; sessions have 30-min TTL so impact window is short |
| Streaming parser behaviour differs from batch parser | Run both parsers against same test files; diff output |
| Batch resume creates duplicate rows if checkpoint logic is wrong | Use DB-level unique constraints on SKU+company_id; idempotent upsert pattern |
| Story 7.7 feature scope creeps and delays debt work | Time-box 7.7; start only after 7.1-7.3 complete |

---

## Quality Gates

- All stories: integration tests in original AC (no deferral — Epic 6 lesson)
- All stories: QA involvement from day one
- All stories: any new debt added to TECHNICAL-DEBT.md before story closes
- Epic close: run TD health check template (deliverable of Story 7.1)
- Epic close: test count ≥ 950

---

## Related Documentation

- [TECHNICAL-DEBT.md](../../docs/adr/TECHNICAL-DEBT.md) — Full debt registry
- [ADR-0010: Import/Export Technical Debt](../../docs/adr/ADR-0010-import-export-technical-debt.md)
- [Epic 6 Retrospective](../implementation-artifacts/epic-6-retro-2026-03-26.md) — Source of action items
- [Epic 6 Planning](./epics.md) — Prior epic for context

---

**Epic 8 Preview:** Variant-Level Sync for POS — product variants with distinct pricing. Prerequisites complete (item-prices domain isolated in Epic 3).

---

*Epic 7 planned via BMAD Party Mode — Ahmad, John (PM), Winston (Architect), Bob (SM), Quinn (QA)*
*Document generated: 2026-03-26*
