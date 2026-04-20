# Story 48.7: Canonical File Structure Rules (v1)

**Status:** done

## Story

As a **platform engineer**,  
I want a documented canonical file structure standard so that file placement is predictable and reviewable,  
So that structure drift does not accumulate without detection and the codebase remains navigable.

---

## Context

Story 48.7 establishes a v1 canonical file structure standard for the active scope (`apps/api` + active packages). This is a policy document that defines expected file placement rules. Enforcement via CI ratchet (Story 48.9) ensures new violations are caught while existing violations are tracked as tolerated debt in the baseline.

**Deferment note**: `apps/backoffice` and `apps/pos` are temporarily deferred from enforcement per architecture program scope freeze. Policy applies to them now; enforcement will be added when the freeze lifts.

---

## Acceptance Criteria

**AC1: Canonical Structure Rules Documented**
Create `file-structure-standard-v1.md` defining:
- Active scope (enforced now) vs deferred scope (policy only)
- Canonical directory layout for `apps/api/src`
- Canonical directory layout for `packages/*` and `packages/modules/*`
- Naming conventions (kebab-case, PascalCase, camelCase)
- File classification by role (route, lib, service, adapter, test, etc.)

**AC2: Deferment Policy Explicit**
Document that `apps/backoffice` and `apps/pos` are excluded from enforcement until scope freeze lifts.

**AC3: Structure Rules Are Specific and Reviewable**
Rules must be specific enough that a script can evaluate compliance. Each rule must have:
- A rule ID (e.g., `FS-API-001`)
- A human-readable description
- An enum: `required` | `forbidden` | `preferred`

---

## Tasks / Subtasks

- [x] Draft structure rules for `apps/api/src` (routes, lib, middleware, startup, scripts, types)
- [x] Draft structure rules for `packages/*` (flat src with index re-exports)
- [x] Draft structure rules for `packages/modules/*` (domain modules)
- [x] Define naming conventions (kebab-case routes, camelCase utils, PascalCase types/services)
- [x] Document deferment for `apps/backoffice` and `apps/pos`
- [x] Number rules with FS-{scope}-{NNN} scheme
- [x] Create gap register baseline (Story 48.8) as companion artifact

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `_bmad-output/planning-artifacts/file-structure-standard-v1.md` | Create | Canonical structure rules v1 |
| `_bmad-output/planning-artifacts/file-structure-gap-register-epic-48.md` | Create | Gap register (baseline violations) |
| `_bmad-output/planning-artifacts/file-structure-baseline.json` | Create | Baseline JSON for ratchet CI |
| `_bmad-output/implementation-artifacts/stories/epic-48/story-48.7.md` | Create | This story file |

---

## Validation Evidence

```bash
# Structure rules document exists and is well-formed
ls -la _bmad-output/planning-artifacts/file-structure-standard-v1.md
# Expected: file exists, non-empty

# Gap register documents current violations
ls -la _bmad-output/planning-artifacts/file-structure-gap-register-epic-48.md
# Expected: file exists with baseline violations listed

# Baseline JSON is valid JSON and machine-readable
npx tsx -e "JSON.parse(require('fs').readFileSync('_bmad-output/planning-artifacts/file-structure-baseline.json', 'utf-8')); console.log('✅ Valid JSON')"
# Expected: output shows valid JSON
```

---

## Dev Notes

- Structure rules are intentionally conservative — they capture what exists rather than prescribing a radical reorganization.
- "Defer" means: rules apply as policy guidance, but CI will not fail on violations in deferred scope.
- Rule IDs use FS-{scope}-{NNN} where scope ∈ {API, PKG, MOD, ALL}
- No origin/main dependency: baseline is repository-local, established on this branch.

---

## Risk Disposition

- R48-007 (structure drift): **mitigating** — Story 48.7 documents rules; 48.8 establishes baseline; 48.9 enforces via CI ratchet
