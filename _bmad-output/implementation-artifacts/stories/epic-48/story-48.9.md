# Story 48.9: CI Ratchet Gate — Structure Conformance

**Status:** done

## Story

As a **platform engineer**,  
I want CI to fail when new structure violations are introduced (not in baseline),  
So that structure debt does not accumulate without detection while existing debt is tolerated.

---

## Context

Story 48.9 implements the CI ratchet gate that enforces file structure conformance. The gate:
- Scans active scope for structure violations
- Compares against `file-structure-baseline.json`
- **FAILS** only on violations NOT in the baseline
- **PASSES** with warnings for baseline violations (tolerated debt)
- **IGNORES** deferred scope (`apps/backoffice`, `apps/pos`)

This approach ensures:
1. No new violations are introduced without detection
2. Existing violations are not re-flagged (avoiding CI noise)
3. Enforcement is scoped to active development (API + active packages)

---

## Acceptance Criteria

**AC1: Structure Conformance Script Created**
Create `scripts/validate-structure-conformance.ts` that:
- Accepts `--baseline <path>` for baseline JSON location
- Accepts `--scope <path>` for active scope root (defaults to current directory)
- Returns exit code 0 if only baseline violations found
- Returns exit code 1 if new violations found (not in baseline)
- Returns exit code 2 if baseline file not found or invalid

**AC2: CI Job Wired**
Add `structure-conformance` job to `.github/workflows/ci.yml` that:
- Runs in parallel with `sprint-status` job
- Executes the validation script
- Fails CI when new violations are introduced

**AC3: Baseline Violations Reported as Warnings**
When baseline violations are found, they are reported as INFO/WARNING, not failures.

**AC4: New Violations Reported with Context**
New violations (not in baseline) are reported with:
- File path
- Rule ID
- Description
- Suggestion for fix

---

## Tasks / Subtasks

- [x] Implement scanner for structure violations (FS-FORBIDDEN-* rules)
- [x] Implement baseline comparison logic (set difference)
- [x] Implement deferred scope ignore list
- [x] Add exit codes 0 (pass), 1 (new violations), 2 (error)
- [x] Wire CI job into `.github/workflows/ci.yml`
- [x] Test script with current baseline (should pass with 9 tolerated violations)

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/validate-structure-conformance.ts` | Create | Structure conformance validation script |
| `.github/workflows/ci.yml` | Modify | Add structure-conformance CI job |
| `_bmad-output/implementation-artifacts/stories/epic-48/story-48.9.md` | Create | This story file |

---

## Validation Evidence

```bash
# Script should pass with current baseline (9 known violations, 0 new)
npx tsx scripts/validate-structure-conformance.ts \
  --baseline _bmad-output/planning-artifacts/file-structure-baseline.json
# Expected: exit 0 — "9 baseline violations (tolerated), 0 new violations"

# Verify JSON is valid
npx tsx -e "JSON.parse(require('fs').readFileSync('_bmad-output/planning-artifacts/file-structure-baseline.json','utf-8')); console.log('Valid JSON')"
# Expected: Valid JSON

# Verify CI job syntax
npx tsx -e "const y=require('js-yaml'); const c=y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf-8')); console.log('Jobs:', Object.keys(c.jobs).join(', '))"
# Expected: Jobs listed including structure-conformance
```

---

## Dev Notes

- Script uses simple pattern matching (no external parsing) for robustness
- Baseline comparison is set-based: violation is "new" if not in baseline
- Deferred scope is explicitly ignored — no enforcement until freeze lifts
- Script is idempotent — running multiple times produces same result
- Output is CI-friendly: clear pass/fail with actionable messages

---

## Risk Disposition

- R48-007 (structure drift): **closed** — CI ratchet now active, new violations will fail CI
- R48-008 (parser drift): **P2** — if rule patterns change, baseline may need manual update
