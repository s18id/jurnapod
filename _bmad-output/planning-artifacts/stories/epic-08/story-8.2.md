---
epic: 8
story: 8.2
title: Extract useItemGroups Hook
priority: P0
status: Ready
estimate: 1-2 hours
dependencies: Story 8.1 (pattern to follow)
---

# Story 8.2: Extract useItemGroups Hook

## User Story

As a **developer**,  
I want to **extract a reusable useItemGroups hook**,  
So that **item group data can be shared across pages**.

## Acceptance Criteria

**Given** the existing item groups fetching logic  
**When** I extract it into `useItemGroups()` hook  
**Then** the hook returns `{ itemGroups, loading, error, refresh, groupMap }`

**Given** the useItemGroups hook  
**When** used in Items or Prices page  
**Then** group data is available for filtering and display

**Given** a groupMap derived from itemGroups  
**When** looking up a group by ID  
**Then** O(1) lookup time is achieved

## Technical Implementation

### Files to Create

1. **`apps/backoffice/src/hooks/use-item-groups.ts`** - Main hook implementation
2. **`apps/backoffice/src/hooks/use-item-groups.test.ts`** - Unit tests

### Hook Interface

```typescript
interface ItemGroup {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  // ... other fields
}

interface UseItemGroupsReturn {
  itemGroups: ItemGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  groupMap: Map<number, ItemGroup>;
}

export function useItemGroups(): UseItemGroupsReturn;
```

### Implementation Approach

Similar pattern to Story 8.1, but for item groups:

1. **Module-level cache** for item groups data
2. **TTL-based caching** (5 minutes)
3. **Computed groupMap** using useMemo
4. **Shared across components**

### Code Structure

```typescript
// apps/backoffice/src/hooks/use-item-groups.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './use-auth';

interface ItemGroup {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  // ... other fields
}

interface UseItemGroupsReturn {
  itemGroups: ItemGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  groupMap: Map<number, ItemGroup>;
}

// Module-level cache
let groupsCache: ItemGroup[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function useItemGroups(): UseItemGroupsReturn {
  const { user } = useAuth();
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>(groupsCache || []);
  const [loading, setLoading] = useState(!groupsCache);
  const [error, setError] = useState<string | null>(null);

  const fetchItemGroups = useCallback(async () => {
    if (groupsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
      setItemGroups(groupsCache);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchItemGroupsFromAPI();
      groupsCache = data;
      cacheTimestamp = Date.now();
      setItemGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch item groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItemGroups();
  }, [fetchItemGroups]);

  const refresh = useCallback(async () => {
    groupsCache = null;
    await fetchItemGroups();
  }, [fetchItemGroups]);

  const groupMap = useMemo(() => {
    return new Map(itemGroups.map(group => [group.id, group]));
  }, [itemGroups]);

  return { itemGroups, loading, error, refresh, groupMap };
}
```

## Files to Modify

None - new file creation.

## Dependencies

- ✅ Story 8.1 (follow same pattern)
- ✅ Existing auth context
- ✅ API endpoint for item groups

## Definition of Done

- [ ] Hook created at `apps/backoffice/src/hooks/use-item-groups.ts`
- [ ] Hook returns correct interface
- [ ] Caching works correctly
- [ ] groupMap provides O(1) lookup
- [ ] Unit tests written and passing
- [ ] Pattern consistent with useItems hook

## Notes

- Very similar to Story 8.1 - use as template
- Item groups change less frequently than items, so caching is valuable
- Used for: Group filtering, displaying group names in tables, hierarchical display
