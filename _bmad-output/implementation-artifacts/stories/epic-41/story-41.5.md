# Story 41.5: XHR Wrapper Functions

> **Epic:** 41 - Backoffice Auth Token Centralization  
> **Priority:** P1  
> **Estimate:** 6h  
> **Status:** ✅ Done

---

## Story

As a **developer**,  
I want XHR-based operations to use centralized token resolution,  
So that upload progress tracking doesn't require manual token handling.

---

## Context

XHR-based operations (uploads, applies) need progress tracking which `fetch` doesn't support natively. Previously these required manual token handling.

### Solution

Created wrapper functions that combine XHR progress tracking with centralized token resolution.

---

## Acceptance Criteria

### AC1: uploadWithProgress
- [x] Function created for FormData uploads with progress callback
- [x] Token resolved internally using resolveToken()
- [x] Replaces manual XHR setup in use-import.ts

### AC2: applyWithProgress
- [x] Function created for JSON POST with progress callback
- [x] Token resolved internally using resolveToken()
- [x] Replaces manual XHR setup in use-import.ts

### AC3: use-import.ts Updated
- [x] useUpload uses uploadWithProgress
- [x] useApply uses applyWithProgress
- [x] useGetTemplate uses apiStreamingRequest

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/lib/api-client.ts` | Added uploadWithProgress, applyWithProgress |
| `apps/backoffice/src/hooks/use-import.ts` | Uses new wrapper functions |

---

## API

### uploadWithProgress
```typescript
export function uploadWithProgress<T>(
  path: string,
  body: FormData,
  onProgress?: (percentage: number) => void
): Promise<T>
```

### applyWithProgress
```typescript
export function applyWithProgress<T>(
  path: string,
  jsonBody: Record<string, unknown>,
  onProgress?: (progress: ApplyProgress) => void
): Promise<T>
```

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story |
| 2026-04-13 | 1.1 | Completed implementation |
