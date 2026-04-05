# Epic 35: Shared Actor Type Unification

**Status:** Pending  
**Owner:** TBD  
**Sprint:** TBD  
**Estimate:** TBD  
**Created:** 2026-04-05

---

## 1) Goal

Unify package-specific actor types into a single shared `Actor` contract in `@jurnapod/shared` so service boundaries are consistent, cross-package refactors are safer, and API wrappers pass a standard actor shape everywhere.

---

## 2) Current Problem

Multiple packages define near-duplicate actor types with inconsistent optionality and fields (`userId`, `outletId`, `ipAddress`), creating avoidable drift and friction when composing modules.

Current duplicate types include:

- `modules-platform`: `CompanyActor`
- `modules-reservations`: `ReservationGroupActor`, `OutletTableActor`
- `modules-sales`: `MutationActor`
- `modules-accounting`: `MutationAuditActor`
- `modules-treasury`: `MutationActor`
- `modules-inventory`: `MutationAuditActor`

---

## 3) Scope

### In Scope

1. Introduce shared `Actor` interface in `@jurnapod/shared`.
2. Export shared actor contract from package entry points.
3. Migrate service signatures in target packages to use shared `Actor`.
4. Update API wrappers/callers to pass canonical actor payload.
5. Remove deprecated local actor type declarations where no longer needed.

### Out of Scope

- Functional behavior changes in domain services.
- Auth model redesign.
- New audit metadata fields beyond current actor contract.

---

## 4) Proposed Shared Contract

```typescript
// packages/shared/src/schemas/common.ts (or schemas/actor.ts)
export interface Actor {
  userId: number;
  outletId?: number | null;
  ipAddress?: string | null;
}
```

### Optional Schema Companion

If runtime validation is needed at boundaries, add:

```typescript
export const ActorSchema = z.object({
  userId: z.number().int().positive(),
  outletId: z.number().int().positive().nullable().optional(),
  ipAddress: z.string().max(45).nullable().optional(),
});
```

---

## 5) Stories Breakdown

| Story | Title | Scope Summary | Estimate |
|---|---|---|---|
| **35.1** | Add `Actor` to shared package | Create shared `Actor` interface in `@jurnapod/shared`, export from `index.ts`, and add optional Zod schema if boundary validation is required. | **2–4h** |
| **35.2** | Migrate `modules-reservations` to shared Actor | Replace `ReservationGroupActor` and `OutletTableActor`, update service signatures and internal usages. **Includes canonical test fixtures** for actor patterns. | **4–6h** |
| **35.3** | Migrate `modules-platform` to shared Actor | Replace `CompanyActor`, update service signatures and compile-time references. | **2–4h** |
| **35.4** | Migrate `modules-sales` to shared Actor | Replace `MutationActor`, update service signatures and compile-time references. | **2–4h** |
| **35.5** | Migrate remaining packages (`accounting`, `treasury`, `inventory`) | Replace `MutationAuditActor` and `MutationActor` variants; align signatures and call sites. | **4–6h** |
| **35.6** | API wrappers, cleanup, and **adapter deletion** | Ensure wrappers extract actor from auth context consistently; **immediately delete deprecated local actor type aliases/interfaces** — do not leave shims. | **2–4h** |

**Total Estimated Effort:** **16–28h**

---

## 6) Target Architecture Decisions

1. **Single Source of Truth for Actor Contract**  
   All modules import `Actor` from `@jurnapod/shared`; local package actor interfaces are deprecated.

2. **Service Boundaries Use Shared Actor**  
   Package services accept `Actor` directly rather than package-specific variants.

3. **API Wrapper Responsibility**  
   API/adapters derive actor data from authenticated context and pass canonical shape to domain services.

4. **Type Unification Without Behavioral Change**  
   This epic is contract consolidation only; no domain logic or authorization semantics should change.

5. **Migration-by-Package Sequencing**  
   Execute migrations package-by-package with full typecheck at each step to reduce blast radius.

---

## 7) Migration & Rollout Plan

### Phase 1 — Shared Contract Foundation
1. Add `Actor` (and optional `ActorSchema`) to `@jurnapod/shared`.
2. Export from public package entry points.
3. **Create canonical test fixtures** for actor patterns (lessons from Epic 31).

### Phase 2 — High-Churn Package Migration
4. Migrate `modules-reservations` first (contains two actor variants and known prior temporary type from Epic 31-3).
5. **Run blast radius analysis** — grep for all files using actor types and verify test expectations (lessons from Epic 33).

### Phase 3 — Remaining Package Migration
6. Migrate `modules-platform` and `modules-sales`.
7. Migrate `modules-accounting`, `modules-treasury`, and `modules-inventory`.

### Phase 4 — Adapter Cleanup & Hardening (IMMEDIATE)
8. Update API wrappers/callers.
9. **Immediately delete deprecated local actor definitions** — do NOT leave adapter shims (lessons from Epic 31).
10. Run workspace typecheck and targeted tests for touched modules.

### Rollback Strategy
- Keep temporary local type aliases (`type LocalActor = Actor`) **only during active migration story windows**.
- Revert per-package migration commits independently if compile/runtime regressions emerge.
- **Post-migration: Shims must be deleted immediately** to prevent consumer accumulation.

---

## 8) Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Optionality mismatch (`outletId` / `ipAddress`) causes compile or behavior drift | Medium | Enforce canonical optional fields in shared type; run targeted tests per module before cleanup. |
| Hidden callers fail to provide required `userId` | High | Add compile-time checks and boundary validation (`ActorSchema`) where actor is constructed. |
| Wide refactor creates cross-package breakage | Medium | Sequence package-by-package with CI typecheck after each story; avoid big-bang migration. |
| Deprecated local types remain and reintroduce drift | Medium | Add cleanup checklist and search-based verification in Story 35.6. |

---

## 9) Dependencies

### Depends On
- Epic 31-3 completion (`ReservationGroupActor` introduced with planned future unification).

### Coordination Required
- Owners of `modules-reservations`, `modules-platform`, `modules-sales`, `modules-accounting`, `modules-treasury`, `modules-inventory` for review and sign-off.

### Lessons Applied from Previous Epics
| Lesson | Source | Application in Epic 35 |
|--------|--------|------------------------|
| Canonical test fixtures for shared patterns | Epic 31 | Story 35.2 includes canonical actor test fixtures |
| Immediate adapter deletion after extraction | Epic 31 | Story 35.6 mandates immediate shim deletion, no lingering |
| Blast radius analysis for shared constants | Epic 33 | Required step in Phase 2 before marking stories complete |
| Dead code audit in consolidation | Epic 33 | Explicit search for unused actor type exports in cleanup phase |

---

## 10) Success Criteria

- [ ] `Actor` contract exists in `@jurnapod/shared` and is publicly exported.
- [ ] All target packages use shared `Actor` in service boundaries.
- [ ] API wrappers pass canonical actor shape consistently.
- [ ] Deprecated package-local actor interfaces are **removed** (not aliased — immediate deletion per Epic 31 lessons).
- [ ] Workspace typecheck/build pass for impacted packages.
- [ ] No functional behavior changes introduced by type unification.
- [ ] **Canonical test fixtures exist** for actor patterns (reference for future tests).
- [ ] **Blast radius analysis completed** — all consuming tests verified for shared actor contract changes.
