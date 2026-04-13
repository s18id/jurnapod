# Story 41.1: API Client Token Resolution

> **Epic:** 41 - Backoffice Auth Token Centralization  
> **Priority:** P0  
> **Estimate:** 8h  
> **Status:** ✅ Done

---

## Story

As a **developer**,  
I want `apiRequest()` to resolve tokens internally,  
So that UI layers no longer need to pass `accessToken` through props and hooks.

---

## Context

The backoffice API client (`apps/backoffice/src/lib/api-client.ts`) required explicit `accessToken` arguments on every call. This caused prop drilling through pages, components, and hooks.

### Why This Matters

1. **Maintenance**: Token passed on ~100+ API calls across the codebase
2. **Type Safety**: Easy to forget passing token or pass wrong one
3. **Boundary Leakage**: Auth concerns leaked to UI layers

---

## Acceptance Criteria

### AC1: Token Resolution in apiRequest
- [x] `apiRequest()` resolves token from canonical auth storage when not explicitly passed
- [x] Token resolution order: explicit arg > options.accessToken > getStoredAccessToken()
- [x] 401 refresh + retry semantics preserved

### AC2: Streaming Request Support
- [x] Create `apiStreamingRequest()` for exports and blob responses
- [x] Token resolved internally using same resolution order

### AC3: XHR Upload Wrapper
- [x] Create `uploadWithProgress()` for FormData uploads with progress tracking
- [x] Token resolved internally using same resolution order

### AC4: XHR Apply Wrapper
- [x] Create `applyWithProgress()` for JSON POST with progress tracking
- [x] Token resolved internally using same resolution order

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/lib/api-client.ts` | Added token resolution, streaming request, XHR wrappers |

---

## Dev Notes

### Token Resolution Order (Canonical)
```typescript
function resolveToken(third?: string | ApiRequestOptions): string | undefined {
  // 1. Explicit string arg (legacy compat) - use even if empty
  if (typeof third === 'string') return third;
  
  // 2. options.accessToken override - use even if empty  
  if (third && typeof third === 'object' && 'accessToken' in third) {
    return third.accessToken;
  }
  
  // 3. getStoredAccessToken() - fallback
  if (!third || !third.skipAuth) {
    return getStoredAccessToken() ?? undefined;
  }
  
  return undefined;
}
```

### Wrapper Function Signature
```typescript
export function uploadWithProgress<T>(
  path: string,
  body: FormData,
  onProgress?: (percentage: number) => void
): Promise<T>

export function applyWithProgress<T>(
  path: string, 
  jsonBody: Record<string, unknown>,
  onProgress?: (progress: ApplyProgress) => void
): Promise<T>
```

---

## Related Stories

- Story 41.2: Hook Token Migration
- Story 41.3: Page/Component Token Migration

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story |
| 2026-04-13 | 1.1 | Completed implementation |
