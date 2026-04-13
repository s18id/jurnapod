# Story 41.1 Completion Report

**Story:** API Client Token Resolution  
**Epic:** 41 - Backoffice Auth Token Centralization  
**Status:** ✅ DONE  
**Completed:** 2026-04-13

---

## Summary

Extended `apiRequest()` to resolve tokens internally from canonical auth storage, creating supporting functions for streaming and XHR-based requests.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/lib/api-client.ts` | Added token resolution, streaming request, XHR wrappers |

---

## Implementation Details

### apiRequest<T>()
- Extended to accept overloaded third argument (string | ApiRequestOptions)
- Token resolved internally from canonical auth storage
- Preserves 401 refresh + retry semantics

### apiStreamingRequest()
- New function for exports and blob responses
- Returns raw `Response` object
- Token resolved using same resolution order

### uploadWithProgress()
- New wrapper for FormData uploads
- XHR-based for progress tracking
- Token resolved internally

### applyWithProgress()
- New wrapper for JSON POST with progress
- XHR-based for progress tracking
- Token resolved internally

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Build | ✅ Successful |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial implementation |
