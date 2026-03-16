---
epic: 8
story: 8.1
title: Extract useItems Hook with Caching
priority: P0
status: Ready
estimate: 2-3 hours
dependencies: None
---

# Story 8.1: Extract useItems Hook with Caching

## User Story

As a **developer**,  
I want to **extract a reusable useItems hook with caching**,  
So that **both Items and Prices pages can share item data efficiently**.

## Acceptance Criteria

**Given** the existing items data fetching logic in items-prices-page.tsx  
**When** I extract it into a standalone `useItems()` hook  
**Then** the hook returns `{ items, loading, error, refresh, itemMap }`

**Given** the useItems hook is implemented  
**When** multiple components use the hook  
**Then** data is cached and shared between components (not re-fetched)

**Given** cached item data  
**When** the `refresh()` function is called  
**Then** data is re-fetched from the API and cache is updated

**Given** the hook is used  
**When** the component unmounts  
**Then** no memory leaks occur (proper cleanup)

## Technical Implementation

### Files to Create

1. **`apps/backoffice/src/hooks/use-items.ts`** - Main hook implementation
2. **`apps/backoffice/src/hooks/use-items.test.ts`** - Unit tests

### Hook Interface

```typescript
interface UseItemsReturn {
  items: Item[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  itemMap: Map<number, Item>;
}

export function useItems(): UseItemsReturn;
```

### Implementation Details

1. **State Management Options:**
   - Option A: React Context + useReducer
   - Option B: Zustand store (if already in project)
   - Option C: Simple module-level cache with React state

2. **Caching Strategy:**
   - Cache items in module-level variable or state management store
   - Cache key: `items-${companyId}-${outletId}` (if scoped)
   - TTL: 5 minutes (configurable)
   - Clear cache on refresh() call

3. **Data Fetching:**
   - Use existing CacheService or direct API calls
   - Endpoint: GET /api/inventory/items
   - Include proper error handling

4. **Derived Data:**
   - itemMap: Computed from items array using useMemo
   - O(1) lookup by item ID

### Code Structure

```typescript
// apps/backoffice/src/hooks/use-items.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './use-auth'; // or current auth context

interface Item {
  id: number;
  sku: string;
  name: string;
  type: string;
  item_group_id: number | null;
  is_active: boolean;
  // ... other fields
}

interface UseItemsReturn {
  items: Item[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  itemMap: Map<number, Item>;
}

// Module-level cache
let itemsCache: Item[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useItems(): UseItemsReturn {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>(itemsCache || []);
  const [loading, setLoading] = useState(!itemsCache);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    // Check cache validity
    if (itemsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
      setItems(itemsCache);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch from API or CacheService
      const data = await fetchItemsFromAPI();
      itemsCache = data;
      cacheTimestamp = Date.now();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const refresh = useCallback(async () => {
    itemsCache = null; // Clear cache
    await fetchItems();
  }, [fetchItems]);

  const itemMap = useMemo(() => {
    return new Map(items.map(item => [item.id, item]));
  }, [items]);

  return { items, loading, error, refresh, itemMap };
}
```

### Testing Requirements

1. **Unit Tests:**
   - Hook returns correct initial state (loading: true)
   - Hook fetches and caches items
   - Multiple components share same cached data
   - refresh() clears cache and re-fetches
   - Error state handled correctly
   - itemMap provides O(1) lookup

2. **Test File Structure:**
```typescript
// apps/backoffice/src/hooks/use-items.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { renderHook, waitFor } from '@testing-library/react';
import { useItems } from './use-items';

test('useItems returns loading state initially', async () => {
  const { result } = renderHook(() => useItems());
  assert.strictEqual(result.current.loading, true);
});

// ... more tests
```

## Files to Modify

None - this is a new file creation story.

## Dependencies

- ✅ Existing auth context/hook for user token
- ✅ Existing API client or CacheService
- ✅ React 18+ (for concurrent features if needed)

## Definition of Done

- [ ] Hook created at `apps/backoffice/src/hooks/use-items.ts`
- [ ] Hook returns correct interface { items, loading, error, refresh, itemMap }
- [ ] Caching works (second component using hook doesn't trigger new fetch)
- [ ] refresh() function clears cache and re-fetches
- [ ] Unit tests written and passing
- [ ] No memory leaks (proper cleanup)
- [ ] TypeScript types are complete
- [ ] Hook can be used in both ItemsPage and PricesPage

## Notes

- This is a **foundational story** - other stories depend on it
- Keep caching simple initially; can enhance later if needed
- Ensure cache is scoped to company (if multi-tenant considerations)
- Consider cache invalidation on item mutations (future enhancement)
