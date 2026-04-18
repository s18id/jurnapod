# Story 43.4: Document Canonical beforeAll seedCtx Pattern

**Status:** done
**Priority:** P2

## Story

As a **developer**,
I want **the canonical `beforeAll` seedCtx fixture pattern to be documented**,
So that **future test authors follow the same pattern and avoid per-test async overhead**.

## Context

Epic 42 established a canonical pattern for caching `getSeedSyncContext()` in `beforeAll` to eliminate async call overhead in `it()` blocks. The pattern is implemented across 30 test files but not formally documented in `project-context.md`.

The pattern is:
1. Import `getSeedSyncContext as loadSeedSyncContext`
2. Declare `let seedCtx` at suite level
3. Declare `const getSeedSyncContext = async () => seedCtx` — zero-overhead wrapper
4. In `beforeAll`: `seedCtx = await loadSeedSyncContext()`
5. Inside `it()` blocks: use the wrapper (no async overhead)

This story documents this pattern so future test authors follow it consistently.

---

## Acceptance Criteria

**AC1: project-context.md Testing Rules section updated**
**Given** `project-context.md`
**When** the Testing Rules section is read
**Then** it contains the canonical `beforeAll` seedCtx pattern with example code
**And** explains the two-function pattern (`loadSeedSyncContext` vs `getSeedSyncContext`)

**AC2: Pattern documented correctly**
**Given** a new test author reads the Testing Rules
**When** they need to use `getSeedSyncContext` in a test file
**Then** they know to add the wrapper pattern in `beforeAll`, not call it per-test

---

## Technical Details

### Pattern to Document

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

### Why Two Functions?

- `loadSeedSyncContext()` — the actual async function that queries DB if not cached. Called once in `beforeAll`.
- `getSeedSyncContext()` — the zero-overhead wrapper that just returns the cached `seedCtx` value. Called in every `it()` block.

This separation allows the wrapper to be used in `it()` blocks without creating new Promises.

---

## Test Coverage Criteria

N/A — documentation only.

---

## Tasks / Subtasks

- [x] Read current `project-context.md` Testing Rules section
- [x] Identify where to add the seedCtx pattern documentation
- [x] Write the pattern with example code
- [x] Verify the documentation renders correctly

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `_bmad-output/project-context.md` | Modify | Add canonical beforeAll seedCtx pattern to Testing Rules |

---

## Estimated Effort

1 hour

## Risk Level

Low — documentation only.

## Dev Notes

**Location:** The Testing Rules section in `project-context.md` (or a new "Canonical Test Fixtures" subsection if no Testing Rules exists).

**Related:** This pattern is already in use across 30 test files. The documentation is for discoverability — not to change any existing code.

---

## Validation Evidence

```bash
# Verify project-context.md contains the pattern
grep -A 20 "seedCtx" _bmad-output/project-context.md
```

---

## Dependencies

Epic 42 story 42.5 (beforeAll seedCtx caching rollout)

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added
- [x] No deprecated functions used
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced
- [x] N/A — documentation only
