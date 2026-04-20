# Story 48.8: File Structure Baseline & Gap Register

**Status:** done

## Story

As a **platform engineer**,  
I want a baseline JSON that captures known structure violations and a gap register that lists them,  
So that CI ratchet enforcement (Story 48.9) can distinguish new violations from pre-existing debt.

---

## Context

Story 48.8 establishes the baseline state of structure compliance. The baseline JSON captures all existing violations at the time of rule creation. CI ratchet (Story 48.9) will FAIL only on violations that are NOT in the baseline — existing violations are tolerated debt.

**No origin/main dependency**: This baseline is repository-local, established on the current branch without comparing against remote branches.

---

## Acceptance Criteria

**AC1: Gap Register Document Created**
Create `file-structure-gap-register-epic-48.md` listing all currently-known structure violations in active scope.

**AC2: Baseline JSON Created**
Create `file-structure-baseline.json` machine-readable list of all known violations (file path + rule ID + description).

**AC3: Baseline Is Stable**
The baseline does not change unless a deliberate cleanup story removes violations. New violations added after this point are flagged by CI.

**AC4: Deferred Scope Listed Separately**
Gap register must distinguish violations in active scope from violations in deferred scope (`apps/backoffice`, `apps/pos`).

---

## Tasks / Subtasks

- [x] Scan `apps/api/src` for structure violations (backup files, misplaced tests, source outside src/)
- [x] Scan `packages/*` for structure violations
- [x] Scan `packages/modules/*` for structure violations
- [x] Document violations with rule ID, file path, and description
- [x] Create machine-readable `file-structure-baseline.json`
- [x] Separate active-scope violations from deferred-scope violations
- [x] Mark baseline as stable (will not auto-update)

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `_bmad-output/planning-artifacts/file-structure-gap-register-epic-48.md` | Create | Gap register listing all known violations |
| `_bmad-output/planning-artifacts/file-structure-baseline.json` | Create | Machine-readable baseline for CI ratchet |
| `_bmad-output/implementation-artifacts/stories/epic-48/story-48.8.md` | Create | This story file |

---

## Validation Evidence

```bash
# Gap register exists and has content
wc -l _bmad-output/planning-artifacts/file-structure-gap-register-epic-48.md
# Expected: non-zero line count

# Baseline JSON is valid
npx tsx -e "const b=JSON.parse(require('fs').readFileSync('_bmad-output/planning-artifacts/file-structure-baseline.json','utf-8')); console.log('Violations in baseline:', b.violations.length)""
# Expected: count of known violations

# Structure conformance script runs without error
npx tsx scripts/validate-structure-conformance.ts --baseline _bmad-output/planning-artifacts/file-structure-baseline.json
# Expected: 0 new violations (only baseline violations reported as tolerated)
```

---

## Dev Notes

- Baseline is intentionally all-known-violations at time of creation. This is a snapshot, not a commitment to fix.
- The "tolerated debt" approach means CI will not fail on known violations — only NEW violations fail.
- Deferred scope violations are listed for visibility but are not subject to CI failure.
- Baseline file must be manually updated when violations are intentionally fixed.

---

## Risk Disposition

- R48-007 (structure drift): **mitigating** — baseline captures existing violations; CI will detect new ones
- R48-008 (parser drift): **P2** — if file path patterns in rules change, baseline may become stale. mitigated by requiring manual baseline updates.
