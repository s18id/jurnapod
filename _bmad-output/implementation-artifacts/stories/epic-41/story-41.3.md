# Story 41.3: Page/Component Token Migration

> **Epic:** 41 - Backoffice Auth Token Centralization  
> **Priority:** P0  
> **Estimate:** 16h  
> **Status:** ✅ Done

---

## Story

As a **developer**,  
I want pages and components to not require `accessToken` props,  
So that auth tokens don't leak through the UI layer.

---

## Context

Multiple pages and components had `accessToken` in their props, requiring the router to pass tokens through every route.

### Pages/Components Requiring Migration

| File | Type |
|------|------|
| FixedAssetsPage.tsx | Page |
| CategoryCreateModal.tsx | Component |
| AssetCreateModal.tsx | Component |
| queue-status-badge.tsx | Component |

---

## Acceptance Criteria

### AC1: Remove accessToken from Page Props
- [x] FixedAssetsPage no longer requires accessToken prop
- [x] All apiRequest calls updated to not pass token

### AC2: Remove accessToken from Component Props
- [x] CategoryCreateModal no longer requires accessToken prop
- [x] AssetCreateModal no longer requires accessToken prop
- [x] queue-status-badge no longer requires accessToken prop

### AC3: Update Component Usage
- [x] FixedAssetsPage updated to not pass accessToken to sub-components

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/backoffice/src/features/fixed-assets/FixedAssetsPage.tsx` | Removed accessToken prop |
| `apps/backoffice/src/features/fixed-assets/components/CategoryCreateModal.tsx` | Removed accessToken prop |
| `apps/backoffice/src/features/fixed-assets/components/AssetCreateModal.tsx` | Removed accessToken prop |
| `apps/backoffice/src/components/queue-status-badge.tsx` | Removed accessToken prop |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story |
| 2026-04-13 | 1.1 | Completed implementation |
