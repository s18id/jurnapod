---
epic: 8
story: 8.8
title: Update Routing and Add Cross-Navigation
priority: P0
status: Ready
estimate: 1-2 hours
dependencies: Stories 8.3, 8.4
---

# Story 8.8: Update Routing and Add Cross-Navigation

## User Story

As a **developer**,  
I want to **update routes and add navigation between Items and Prices**,  
So that **users can move seamlessly between related features**.

## Acceptance Criteria

### Route Configuration

**Given** the new pages exist  
**When** I navigate to `/items`  
**Then** the Items page renders (no 404)

**Given** I navigate to `/prices`  
**When** the route is accessed  
**Then** the Prices page renders

**Given** the old `/items-prices` route  
**When** accessed  
**Then** it redirects to `/items` (temporary redirect, not permanent)

### Cross-Navigation

**Given** I'm on the Items page  
**When** I look at the header/actions  
**Then** I see a "Manage Prices" button linking to `/prices`

**Given** I'm on the Prices page  
**When** I look at the header/actions  
**Then** I see a "View Items" button linking to `/items`

### Navigation Menu

**Given** navigation menu is updated  
**When** viewed in the sidebar  
**Then** "Items" and "Prices" appear as separate menu items (not "Items & Prices")

**Given** the menu items  
**When** displayed  
**Then** they have appropriate icons (e.g., Package for Items, Tag for Prices)

### Deep Linking

**Given** deep linking is supported  
**When** I share `/prices?outlet=123`  
**Then** recipient sees prices filtered to that outlet

**Given** URL with query params  
**When** page loads  
**Then** filters are pre-populated from params

## Technical Implementation

### Files to Create/Modify

1. **`apps/backoffice/src/app/routes.ts`** - Add new routes
2. **`apps/backoffice/src/app/router.tsx`** - Add route handlers
3. **`apps/backoffice/src/features/pages.tsx`** - Export new pages
4. **`apps/backoffice/src/components/navigation/`** - Update sidebar menu

### Route Configuration

```typescript
// apps/backoffice/src/app/routes.ts

export const routes: RouteConfig[] = [
  // ... existing routes
  
  // NEW: Items page
  {
    path: '/items',
    label: 'Items',
    icon: 'Package', // Lucide icon name
    requiredModule: 'inventory',
    allowedRoles: ['OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT'],
  },
  
  // NEW: Prices page
  {
    path: '/prices',
    label: 'Prices',
    icon: 'Tag', // Lucide icon name
    requiredModule: 'inventory',
    allowedRoles: ['OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT'],
  },
  
  // LEGACY: Redirect old route (keep temporarily)
  {
    path: '/items-prices',
    redirect: '/items',
    label: 'Items & Prices (Legacy)',
    requiredModule: 'inventory',
    allowedRoles: ['OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT'],
    hidden: true, // Don't show in menu
  },
];
```

### Router Handler

```typescript
// apps/backoffice/src/app/router.tsx

import { ItemsPage } from '../features/items-page';
import { PricesPage } from '../features/prices-page';

export function Router({ currentPath, user }: RouterProps) {
  // ... existing routes
  
  if (currentPath === '/items') {
    return <ItemsPage user={user} />;
  }
  
  if (currentPath === '/prices') {
    return <PricesPage user={user} />;
  }
  
  // Handle legacy redirect
  if (currentPath === '/items-prices') {
    // Redirect to /items
    window.history.replaceState(null, '', '/items');
    return <ItemsPage user={user} />;
  }
  
  // ... rest of router
}
```

### Page Exports

```typescript
// apps/backoffice/src/features/pages.tsx

// ... existing exports

// NEW: Export items and prices pages
export { ItemsPage } from './items-page';
export { PricesPage } from './prices-page';
```

### Cross-Navigation Buttons

In Items Page:
```tsx
// apps/backoffice/src/features/items-page.tsx

<PageCard
  title="Items"
  description="Manage your product catalog"
  actions={
    <Group>
      <Button 
        variant="light" 
        leftSection={<IconTag size={16} />}
        component="a"
        href="#/prices"
      >
        Manage Prices
      </Button>
      <Button 
        leftSection={<IconPlus size={16} />}
        onClick={() => setCreateModalOpen(true)}
      >
        Create Item
      </Button>
      <Button 
        variant="default"
        leftSection={<IconDownload size={16} />}
        onClick={handleExport}
      >
        Export
      </Button>
    </Group>
  }
>
  {/* ... */}
</PageCard>
```

In Prices Page:
```tsx
// apps/backoffice/src/features/prices-page.tsx

<PageCard
  title="Prices"
  description="Manage pricing across outlets"
  actions={
    <Group>
      <Button 
        variant="light" 
        leftSection={<IconPackage size={16} />}
        component="a"
        href="#/items"
      >
        View Items
      </Button>
      <Button 
        leftSection={<IconPlus size={16} />}
        onClick={() => setCreateModalOpen(true)}
      >
        Create Price
      </Button>
      <Button 
        variant="default"
        leftSection={<IconDownload size={16} />}
        onClick={handleExport}
      >
        Export
      </Button>
    </Group>
  }
>
  {/* ... */}
</PageCard>
```

### Query Parameter Support

In Prices Page for outlet filtering:
```tsx
// apps/backoffice/src/features/prices-page.tsx

import { useSearchParams } from 'react-router-dom'; // or current router

export function PricesPage({ user }: PricesPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Read outlet from URL
  const outletIdFromUrl = searchParams.get('outlet');
  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    outletIdFromUrl ? parseInt(outletIdFromUrl, 10) : user.default_outlet_id
  );
  
  // Update URL when outlet changes
  const handleOutletChange = (outletId: number) => {
    setSelectedOutletId(outletId);
    setSearchParams({ outlet: String(outletId) });
  };
  
  // ... rest of component
}
```

### Navigation Menu Update

Remove old menu item, add new ones:
```typescript
// In navigation/sidebar component

// REMOVE this:
// { path: '/items-prices', label: 'Items & Prices', icon: 'Package' }

// ADD these:
{ path: '/items', label: 'Items', icon: 'Package' },
{ path: '/prices', label: 'Prices', icon: 'Tag' },
```

## Dependencies

- ✅ Stories 8.3 and 8.4 (pages must exist)
- ✅ Existing routing system
- ✅ Mantine Button component
- ✅ Lucide icons (or current icon library)

## Definition of Done

- [ ] Route `/items` works and shows Items page
- [ ] Route `/prices` works and shows Prices page
- [ ] Old `/items-prices` redirects to `/items`
- [ ] Sidebar menu shows "Items" and "Prices" separately
- [ ] Items page has "Manage Prices" link
- [ ] Prices page has "View Items" link
- [ ] Deep linking with query params works
- [ ] Navigation is intuitive and smooth

## Migration Notes

### For Users
- Old bookmarks to `/items-prices` will still work (redirect)
- New bookmarks should use `/items` or `/prices`
- After 1-2 months, can remove legacy redirect

### For Developers
- Update any internal links from `/items-prices` to appropriate new route
- Documentation should reference new routes
- API endpoints remain unchanged

## Testing Checklist

- [ ] Direct navigation to `/items` works
- [ ] Direct navigation to `/prices` works
- [ ] Redirect from `/items-prices` works
- [ ] Sidebar menu items work
- [ ] Cross-navigation buttons work
- [ ] Deep linking with outlet param works
- [ ] Back button works correctly
- [ ] Refresh on sub-page works

## Notes

- This is the **integration story** - ties everything together
- Clean routing makes the split feel natural
- Cross-navigation maintains connection between related features
- Legacy redirect ensures no broken bookmarks
