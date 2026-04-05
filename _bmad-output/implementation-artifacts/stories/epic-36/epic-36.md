# Epic 36: Import/Export Infrastructure Extraction

**Status:** Draft (Proposed)  
**Owner:** Architecture / Platform  
**Created:** 2026-04-05  
**Target Window:** Sprint 32–33  
**Estimated Effort:** 40–46 hours (realistic range within 32–48h)

---

## 1) Goal

Extract the import/export infrastructure (~6,000 LOC) from `apps/api/src/lib/` and route-level orchestration into `@jurnapod/modules-platform`, so API routes become thin HTTP adapters and business workflows are reusable, testable, and package-bounded.

---

## 2) Background

Story 31-5 identified a large and architecturally coupled scope spanning parser/validator/session/batch logic (import), query/stream/generator logic (export), and workflow orchestration currently embedded in routes:

- `apps/api/src/lib/import/*`
- `apps/api/src/lib/export/*`
- `apps/api/src/routes/import.ts`
- `apps/api/src/routes/export.ts`

This is too large and risky for a single story. The extraction must also resolve boundary violations and brittleness first:

- `import/batch-operations.ts` currently imports `@/lib/db` (API alias coupling).
- `export/query-builder.ts` uses manual SQL placeholder interpolation in execution path.
- Route files contain business orchestration (mapping, validation flow, apply flow, streaming decisions), preventing true thin-adapter architecture.

Epic 36 isolates this as a dedicated migration effort to reduce production risk and unblock downstream detachment work.

---

## 3) Scope

### In Scope

1. Extract all import infrastructure from API lib into `@jurnapod/modules-platform/import-export/import/*`.
2. Extract all export infrastructure from API lib into `@jurnapod/modules-platform/import-export/export/*`.
3. Move orchestration workflows from routes into package façade services.
4. Introduce dependency-injected service pattern:
   - `serviceFn(input, deps: { db: KyselySchema })`
   - No internal `getDb()` inside package business functions.
5. Keep HTTP concerns in API routes only (auth, request parsing, response shaping, status codes).
6. Add parity tests for extracted flows (import upload/validate/apply and export generation/streaming behavior).

### Out of Scope

- New import/export product features.
- Schema changes unrelated to extraction safety.
- Changes to POS sync contracts.
- Rewriting unrelated inventory/business rules.

---

## 4) Stories Breakdown

> **Note:** Epic 31 retrospective found that import/export infrastructure spans ~6,000 LOC across 15+ files. Stories 36.2 and 36.3 have been split into 2 stories each to maintain story scope under 3,000 LOC.

| Story | Title | Scope Summary | Estimate |
|---|---|---|---|
| **36.1** | DB Decoupling & Dependency Inversion Foundations | Remove API alias coupling (`@/lib/db`) from import/export internals; adopt explicit `deps.db` signatures and shared dependency types. | **6–8h** |
| **36.2a** | Extract Import Parsers & Validators | Move `lib/import/parsers.ts`, `lib/import/validator.ts` into modules-platform with public exports and tests. ~1,200 LOC. | **4–6h** |
| **36.2b** | Extract Import Session Store & Batch Operations | Move `lib/import/session-store.ts`, `lib/import/batch-operations.ts`, `lib/import/batch-processor.ts`. ~1,800 LOC. | **6–8h** |
| **36.3a** | Extract Export Query Builder & Safe Query Construction | Move `lib/export/query-builder.ts`; replace brittle placeholder interpolation with safe query construction pattern. ~1,400 LOC. | **6–8h** |
| **36.3b** | Extract Export Formatters & Streaming | Move `lib/export/formatter.ts`, `lib/export/generators.ts`, `lib/export/streaming.ts` with streaming parity tests. ~1,600 LOC. | **6–8h** |
| **36.4** | Lift Route Orchestration into Package Services | Move workflow logic from `routes/import.ts` and `routes/export.ts` into façade services (upload/validate/apply/template/export/columns). | **8–10h** |
| **36.5** | API Adapter Conversion & Contract Parity | Refactor API routes to thin adapters; preserve existing API contracts and response envelopes; wire dependency injection from route layer. | **4–6h** |
| **36.6** | Migration Hardening, Rollout, and **Immediate Adapter Deletion** | Add regression/integration coverage, instrumentation, rollback guardrails, and **immediately remove legacy API lib usage** after cutover verification. **No lingering shims.** | **4–6h** |

**Total:** **40–50h** (adjusted for story splits)

### Scope Notes Based on Epic 31 Findings
- **36.2a + 36.2b** combined: ~3,000 LOC (import core)
- **36.3a + 36.3b** combined: ~3,000 LOC (export core)
- Each split story is independently deliverable with typecheck validation

---

## 5) Target Architecture

```text
packages/modules/platform/src/
  import-export/
    index.ts
    contracts.ts               # shared DTO/contracts for import/export workflows
    deps.ts                    # service dependency types (db, clock, logger optional)

    import/
      index.ts
      parsers.ts
      validator.ts
      session-store.ts
      batch-operations.ts
      batch-processor.ts
      workflows/
        upload-import.ts
        validate-import.ts
        apply-import.ts
        generate-template.ts

    export/
      index.ts
      formatter.ts
      generators.ts
      streaming.ts
      query-builder.ts
      workflows/
        run-export.ts
        list-export-columns.ts

apps/api/src/routes/
  import.ts  # thin adapter: auth + parse + call service + map response
  export.ts  # thin adapter: auth + parse + call service + map response
```

### Service Boundary Pattern

- Business services in package accept dependencies explicitly:
  - `runImportValidate(input, deps: { db: KyselySchema })`
  - `runExport(input, deps: { db: KyselySchema })`
- API routes remain responsible for:
  - authentication/authorization middleware,
  - HTTP payload parsing/validation,
  - response/status mapping.

---

## 6) Migration Path

### Phase 1 — Foundation
1. Introduce package dependency interfaces and façade skeletons.
2. Decouple DB access from API aliases (`getDb()`, `@/lib/db`) in extract-target files.
3. **Create canonical test fixtures** for import/export patterns (lessons from Epic 31).

### Phase 2 — Core Extraction (Split by Function)
4. **36.2a:** Migrate import parsers + validators + tests.
5. **36.2b:** Migrate import session store + batch operations + tests.
6. **36.3a:** Migrate export query builder + safe query construction + tests.
7. **36.3b:** Migrate export formatters + streaming + tests.
8. Replace unsafe query execution path in export query layer.

### Phase 3 — Orchestration Lift
9. Move route-embedded orchestration into package workflow services.
10. Keep API route behavior stable by adapting old handler signatures to new façade services.

### Phase 4 — Cutover & **Immediate Cleanup**
11. Flip routes to package-only calls.
12. Run integration/parity checks and performance sanity checks (especially large CSV streaming paths).
13. **Immediately delete legacy API lib usages** once parity passes — **do NOT leave adapter shims** (lessons from Epic 31).

### Rollback Strategy
- Keep old route code path available behind temporary internal switch **only during the cutover story (36.5)**.
- Revert route wiring (not data/schema) if parity regression is detected.
- **After 36.6 verification: immediate deletion of legacy code** — no lingering shims.

---

## 7) Dependencies

### Depends On
- Epic 31 baseline detachment conventions and package boundary rules.
- Existing platform module build/test pipeline (`@jurnapod/modules-platform`).

### Parallelizable With
- Epic 31 Story 31-6 (notifications consolidation).
- Epic 31 Story 31-7 (route thinning enforcement in other areas).

### Blocks / Required By
- Story 31-8B (deletion verification and final dead-code cleanup) depends on Epic 36 completion.

### Lessons Applied from Epic 31
| Lesson | Application in Epic 36 |
|--------|------------------------|
| Infrastructure extraction needs dedicated epic planning | Epic 36 created specifically for import/export (not a single story) |
| Story scope should be <3,000 LOC | Split 36.2 and 36.3 into 4 stories (36.2a/b, 36.3a/b) |
| Immediate adapter deletion after extraction | Story 36.6 mandates immediate deletion, no lingering shims |
| Canonical patterns need canonical test fixtures | Phase 1 includes creating test fixtures for import/export patterns |
| Parity tests required for behavioral equivalence | Success criteria includes parity tests for cutover verification |

---

## 8) Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Story scope too large (36.2, 36.3 were ~6,000 LOC combined) | High | **Split into 4 stories** (36.2a, 36.2b, 36.3a, 36.3b) — each <3,000 LOC (Epic 31 lesson). |
| Behavioral drift during orchestration lift | High | Contract/parity tests on upload/validate/apply/export endpoints before and after cutover. |
| SQL execution regressions in export path | High | Replace manual interpolation with safe query binding pattern; add edge-case tests for filters and dates. |
| Hidden API coupling via alias imports | High | Story 36.1 explicit dependency inversion first; lint/import-boundary checks in CI. |
| Performance degradation on large exports/import batches | Medium | Keep streaming thresholds; benchmark representative datasets; preserve chunked paths. |
| Session/checkpoint resume behavior regressions | High | Dedicated tests for TTL, checkpoint resume, file hash mismatch, partial failure responses. |
| Long-running migration across teams | Medium | Phase-based sequencing and independent story deliverables with clear entry/exit criteria. |
| **Adapter shims accumulate consumers** | High | **Immediate deletion in Story 36.6** — do not leave shims (Epic 31 lesson). |

---

## 9) Success Criteria

- [ ] No import/export business logic remains in `apps/api/src/routes/import.ts` and `apps/api/src/routes/export.ts` beyond HTTP adapter responsibilities.
- [ ] Import/export infrastructure lives under `@jurnapod/modules-platform` with clear public APIs.
- [ ] No package import depends on `apps/api/**` or API alias paths.
- [ ] Export query execution no longer relies on brittle custom placeholder interpolation.
- [ ] Existing API contracts (payload/response envelope/status behavior) remain backward-compatible.
- [ ] Integration tests pass for import upload/validate/apply/template and export data/columns/streaming flows.
- [ ] Workspace typecheck/build/lint pass for API + modules-platform.
- [ ] **Legacy API lib code deleted immediately after cutover** — no lingering adapter shims (Epic 31 lesson).
- [ ] **Canonical test fixtures exist** for import/export patterns.
- [ ] **Parity tests** verify behavioral equivalence between old and new implementations.

---

## 10) Key Architecture Decisions (Captured)

1. **Dependency Injection over Singleton DB Access**  
   Business services receive `deps.db`; package code does not call internal `getDb()`.

2. **Thin Adapter Route Principle**  
   HTTP concerns stay in API routes; orchestration/business workflows move to package services.

3. **Façade-First Public API**  
   Import/export features exposed through workflow façades to stabilize API-layer integration and reduce surface coupling.

4. **Safety-First Query Execution**  
   Replace fragile manual SQL interpolation in export pipeline with parameter-safe execution approach.

5. **Phased Cutover with Parity Checks**  
   Extract core first, then orchestration, then cutover/cleanup with rollback guardrails.

6. **Story Scope Control**  
   Split large infrastructure extraction (~6,000 LOC) into 4 deliverable stories (max ~3,000 LOC each) based on Epic 31 retrospective findings.

7. **Immediate Adapter Deletion**  
   Delete legacy code **immediately** after verification — do not leave adapter shims that accumulate consumers (Epic 31 lesson).
