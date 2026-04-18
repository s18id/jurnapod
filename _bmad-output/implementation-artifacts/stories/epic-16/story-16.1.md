# Story 16.1: Alert Retry with Exponential Backoff

**Epic:** Epic 16
**Story Number:** 16.1
**Status:** review
**Estimated Time:** 3 hours
**Priority:** P2

---

## Summary

Implement exponential backoff retry logic for alert webhook dispatch to address TD-031. Create retry utility and update `dispatchAlert()` to use it.

## Context

TD-031 from Epic 8: "Alert retry logic - webhook dispatch lacks exponential backoff"

The current `dispatchAlert()` method in `alert-manager.ts` has no retry strategy - it makes a single fetch call and returns `false` on any failure. This can cause missed notifications during temporary network issues.

Based on the TD-031 spike (story 15.5), the solution is to:
1. Create a reusable retry utility (`lib/retry.ts`)
2. Update `dispatchAlert()` to use exponential backoff

## Technical Approach

### 1. Create `lib/retry.ts`

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number }
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < options.maxRetries - 1) {
        await sleep(options.baseDelay * Math.pow(2, attempt));
      }
    }
  }
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 2. Update `dispatchAlert()` in `alert-manager.ts`

- Import the retry utility
- Wrap the fetch call with exponential backoff
- Max 3 retries, base delay 1000ms (1s → 2s → 4s)
- Backward compatible via configuration-based enablement

## Acceptance Criteria

- [x] Retry utility created in `lib/retry.ts`
- [x] `dispatchAlert()` uses retry with exponential backoff
- [x] Max 3 retries, base delay 1000ms (1s → 2s → 4s)
- [x] Backward compatible (config-based enablement)
- [x] Unit tests created for retry utility
- [x] All tests pass

## Dependencies

- Epic 15 (specifically TD-031 spike in story 15.5)

## Files to Modify

- `apps/api/src/lib/retry.ts` (NEW)
- `apps/api/src/lib/alerts/alert-manager.ts` (update dispatchAlert)
- `apps/api/src/lib/retry.test.ts` (NEW)

---

## Dev Agent Record

**Implementation Date:** 2026-03-29  
**Agent:** bmad-dev  
**Time Spent:** ~45 minutes

### Files Created/Modified

| File | Change |
|------|--------|
| `apps/api/src/lib/retry.ts` | NEW - Retry utility with `withRetry()` and `sleep()` |
| `apps/api/src/lib/alerts/alert-manager.ts` | Updated `dispatchAlert()` to use retry |
| `apps/api/src/lib/retry.test.ts` | NEW - Unit tests for retry utility |

### Implementation Details

**Retry delays:**
- Attempt 1: Immediate
- Attempt 2: Wait 1000ms (base * 2^0)
- Attempt 3: Wait 2000ms (base * 2^1)
- Attempt 4: Wait 4000ms (base * 2^2)
- Total worst case: 7 seconds

### Test Results

| Test File | Result |
|-----------|--------|
| `src/lib/retry.test.ts` | ✅ 10/10 tests pass |

### Validation

```bash
npm run typecheck -w @jurnapod/api  # ✅ Pass
npm run build -w @jurnapod/api      # ✅ Pass
npm run lint -w @jurnapod/api       # ⚠️ Pre-existing lint errors (not related to changes)
npm run test:unit:single -w @jurnapod/api src/lib/retry.test.ts  # ✅ 10/10 tests pass
```

---

*Story file created: 2026-03-29*  
*Story file updated: 2026-03-29*
