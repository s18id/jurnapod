# Story 35.6: Final Lint Validation

## Story Details

| Field | Value |
|-------|-------|
| **Epic** | Epic 35 |
| **Status** | pending |
| **Estimate** | 4h |
| **Priority** | P1 |
| **Dependencies** | Story 35.1, 35.2, 35.3, 35.4, 35.5 |

## Context

After all route library extractions are complete, perform final validation to ensure:
1. All 27 lint errors are resolved
2. TypeScript compilation succeeds
3. Build succeeds

## Validation Steps

### Step 1: Run Full Lint

```bash
npm run lint --workspaces --if-present
```

**Expected:** All workspaces pass with 0 errors.

### Step 2: Run TypeScript Check

```bash
npm run typecheck --workspaces --if-present
```

**Expected:** All workspaces pass with no type errors.

### Step 3: Run Build

```bash
npm run build
```

**Expected:** All packages and apps build successfully.

### Step 4: Verify Adapter Shims Deleted

Check that no adapter shims remain in `apps/api/src/lib/`:

```bash
# These should NOT exist after Epic 35:
ls apps/api/src/lib/accounting/   # Should be empty or only re-exports
ls apps/api/src/lib/cash-bank*    # Should not exist
ls apps/api/src/lib/sales*        # Should not exist (or only re-exports)
```

### Step 5: Update Epic Index

Mark Epic 35 as "done" in `_bmad-output/planning-artifacts/epics.md`.

## Acceptance Criteria

| # | Criteria | Verification |
|---|----------|--------------|
| 1 | `npm run lint -w @jurnapod/api` passes | 0 errors |
| 2 | `npm run lint --workspaces --if-present` passes | All workspaces pass |
| 3 | `npm run typecheck -w @jurnapod/api` passes | No type errors |
| 4 | `npm run build` succeeds | Build completes |
| 5 | No adapter shims in `apps/api/src/lib/` | Directory checks |
| 6 | Epic 35 marked as "done" | epics.md updated |

## Epic Completion Checklist

- [x] Epic 35 sprint plan created
- [ ] Story 35.1 complete (accounts.ts)
- [ ] Story 35.2 complete (platform routes)
- [ ] Story 35.3 complete (reporting routes)
- [ ] Story 35.4 complete (treasury route)
- [ ] Story 35.5 complete (sales routes)
- [ ] Story 35.6 complete (validation)
- [ ] Epic index updated to "done"
