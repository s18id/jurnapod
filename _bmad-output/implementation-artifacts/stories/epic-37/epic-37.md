# Epic 37: Email Outbox Infrastructure Extraction

**Status:** pending  
**Owner:** TBD  
**Sprint:** TBD  
**Estimate:** TBD (expected similar range to Epic 36)

---

## 1) Goal

Extract email outbox **domain logic and interfaces** into `@jurnapod/notifications`, while keeping runtime orchestration in API for now (cron/scheduler/worker lifecycle/env wiring).

---

## 2) Background

`apps/api/src/lib/email-outbox.ts` (~122 LOC) currently contains a DB-backed email queue with retry behavior.

Architecturally, the outbox pattern is domain infrastructure (queue model, retry policy, repository contract, and status transitions), not API-specific route/runtime logic. To reduce coupling and improve reuse, domain behavior should move to package boundaries while API retains process runtime responsibilities until a shared job runner exists.

This extraction is a different bounded context from Epic 36 (Import/Export), therefore tracked as its own epic.

---

## 3) Scope

### In Scope

1. Define a canonical outbox domain model in `@jurnapod/notifications`.
2. Extract status transition logic and retry policy into package services.
3. Introduce repository/store port interface for DB operations.
4. Wire package domain service into API via dependency injection.
5. Keep API worker orchestration as thin runtime layer for this phase.
6. Add parity tests for claim/send/retry/fail transitions.

### Out of Scope

- Full worker runtime detachment from API.
- Introducing a new cross-package scheduler/job-runner in this epic.
- New email product features/templates/providers beyond extraction needs.
- DB schema redesign unrelated to extraction safety.

---

## 4) Stories Breakdown

| Story | Title | Scope Summary | Estimate |
|---|---|---|---|
| **37.1** | Define Outbox Domain Model + Interfaces | Define queue lifecycle (`PENDING`, `SENDING`, `SENT`, `FAILED`), entry type(s), retry metadata, and port contract (`outbox-store`) for claim/update operations. | **6–8h** |
| **37.2** | Extract Outbox Domain Service to Notifications Package | Move status transitions and retry policy/backoff logic into package service(s); expose clean API and inject DB executor/store via DI. | **10–12h** |
| **37.3** | API Integration with Thin Runtime Adapter | API implements package port, keeps `processPendingEmails()` orchestration, scheduler bindings, and env wiring; route/worker paths call package domain service. | **8–10h** |
| **37.4** | Parity Hardening, Concurrency Safety, and Cleanup | Add regression tests for atomic claim + retry exhaustion; verify no behavioral drift; remove or deprecate old direct logic paths. | **8–10h** |

**Total:** **32–40h**

---

## 5) Target Architecture

```text
packages/notifications/src/
  outbox/
    index.ts
    types.ts            # QueueStatus, EmailOutboxEntry
    outbox-service.ts   # Domain logic (transitions + orchestration primitives)
    retry-policy.ts     # Retry/backoff policy
    ports/
      outbox-store.ts   # Repository interface/port

apps/api/src/
  lib/
    email-outbox-runtime.ts   # processPendingEmails(), lifecycle glue
  routes/
    ...                       # thin adapter usage where relevant
```

### API Keeps (Phase Boundary)

- `processPendingEmails()` worker/endpoint behavior.
- Cron/scheduler integration.
- Environment configuration and provider wiring.

### Package Owns

- Queue state machine and status transitions.
- Retry policy and next-attempt computation.
- Store/repository contract for persistence interactions.

---

## 6) Interface & Boundary Decisions

1. **Port-and-Adapter Persistence**
   - Package defines `OutboxStore` port; API supplies implementation (DB executor/transaction context) to avoid `apps/api` coupling.

2. **Runtime vs Domain Split**
   - Runtime scheduling/process lifecycle remains in API.
   - Deterministic domain transitions and retry rules move to `@jurnapod/notifications`.

3. **Explicit State Machine Ownership**
   - Package becomes source of truth for legal transitions:
     - `PENDING -> SENDING -> SENT`
     - `PENDING/SENDING -> FAILED` (after retry exhaustion)
     - retry paths return to `PENDING` with updated attempt metadata.

4. **DI-First API**
   - Service signatures accept dependencies (store, clock, optional logger), enabling deterministic tests and future worker extraction.

---

## 7) Migration & Rollout Plan

### Phase 1 — Domain Contract Baseline
1. Add `types.ts`, `retry-policy.ts`, and `ports/outbox-store.ts` in package.
2. Capture current behavior in tests to protect parity.

### Phase 2 — Domain Service Extraction
3. Implement `outbox-service.ts` with transition logic + retry decisions.
4. Export package API via `outbox/index.ts`.

### Phase 3 — API Wiring
5. Implement API adapter/store using existing DB access pattern.
6. Keep runtime worker entrypoint in API, now delegating domain decisions to package.

### Phase 4 — Cutover Validation
7. Run integration/parity tests under concurrent claim scenarios.
8. Remove/deprecate legacy direct logic paths after parity confirmation.

### Rollback Strategy
- Retain old API-local logic behind temporary internal switch during initial rollout.
- Roll back by rewiring runtime to legacy path (no schema rollback required).

---

## 8) Dependencies

### Depends On
- **Story 31-6** completion (mailer extraction baseline).

### Follow-up / Future Dependency
- Dedicated follow-up epic/story for full worker runtime detachment once shared job runner infrastructure is available.

---

## 9) Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Transaction handling drift during extraction | High | Keep claim/update/send-result operations transaction-safe via adapter boundaries and parity tests. |
| Concurrent worker claiming regressions | High | Preserve atomic claim semantics (single-row claim/update guards), add concurrency tests. |
| Retry behavior mismatch (backoff/count) | High | Snapshot existing retry semantics in tests before refactor; verify max-attempt transitions to `FAILED`. |
| Boundary leakage back to API internals | Medium | Enforce package contracts + import boundary checks; no `@/` alias usage inside package. |

---

## 10) Success Criteria

- [ ] Outbox domain model and retry/state logic live under `@jurnapod/notifications/outbox`.
- [ ] API retains only runtime orchestration responsibilities for email outbox processing.
- [ ] Package code does not depend on `apps/api/**` or API alias imports.
- [ ] Existing outbox behavior remains backward-compatible (claim/send/retry/fail semantics).
- [ ] Concurrency and retry exhaustion tests pass.
- [ ] Workspace typecheck/build/tests pass for affected packages and API.

---

## 11) Key Architecture Decisions (Captured)

1. Extract **domain + interface** now; defer **runtime detachment** to a later shared-runner initiative.
2. Keep API as runtime host to minimize migration risk while still achieving package boundary correctness.
3. Use DI and explicit store ports so future worker extraction is largely wiring, not logic migration.
4. Treat queue transition semantics as canonical package behavior to avoid divergence across runtimes.
