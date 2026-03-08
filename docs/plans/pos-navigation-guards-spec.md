# POS Navigation Guards and Confirmation Modals Specification

**Status:** Design  
**Date:** 2026-03-08  
**Context:** Service mode workflow implementation - navigation safety  
**Related Docs:** `pos-service-mode-workflow-implementation.md`

---

## Overview

This document specifies the navigation guard system and confirmation modals required to prevent data loss and enforce workflow integrity in the POS app. Guards protect against accidental navigation away from unsaved work and ensure proper lifecycle management for takeaway and dine-in orders.

---

## Guard Triggers and Conditions

### 1. Route Change Guard
**When:** User attempts to navigate to a different route (excluding allowed transitions)  
**Condition:** Active order exists with unsaved changes OR finalized dine-in order exists

#### Allowed Transitions (No Guard)
```typescript
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  '/service-mode': ['/products', '/tables'],
  '/products': ['/cart', '/checkout', '/tables'],
  '/tables': ['/products', '/cart'],
  '/cart': ['/products', '/checkout', '/tables'],
  '/checkout': ['/service-mode'], // After completion
  '/reservations': ['/products', '/tables']
};
```

#### Blocked Transitions (Show Confirmation)
- Any navigation to `/settings`, `/login`, `/logout`
- Any navigation not in allowed list above
- Browser back button when active order exists
- Outlet switcher when active order exists

---

### 2. Service Type Switch Guard
**When:** User clicks Takeaway/Dine-in toggle in ProductsPage  
**Condition:** Active order exists with items

#### Switch Scenarios

##### Scenario A: Takeaway → Dine-In
```typescript
// Current state: TAKEAWAY order with items
// User clicks: Dine-In button
// Guard shows: "Save as Dine-In Order" modal

interface SaveAsDineInModalOptions {
  action: 'save-to-dinein' | 'discard' | 'cancel';
  selectedTableId?: number; // Required if action = 'save-to-dinein'
}
```

**Modal Content:**
```
You have an active takeaway order

Items: 3 items • Total: $45.00

Save this order to a table for dine-in?

[Select Table] (dropdown showing AVAILABLE tables)

[Save to Table] (primary, disabled until table selected)
[Discard Order] (destructive)
[Cancel] (secondary)
```

**Behavior:**
- **Save to Table:**
  - Set `service_type = 'DINE_IN'`
  - Set `table_id = selectedTableId`
  - Mark table as `OCCUPIED`
  - Set `is_finalized = true`
  - Update snapshot via `upsertActiveOrderSnapshot`
  - Navigate to `/products`
- **Discard Order:**
  - Call `closeActiveOrder(order_id, 'CANCELLED')`
  - Clear cart via `clearCart()`
  - Set `service_type = 'DINE_IN'`
  - Navigate to `/tables`
- **Cancel:**
  - Stay on current page
  - No state changes

##### Scenario B: Dine-In → Takeaway (Finalized Order)
```typescript
// Current state: DINE_IN order with table, finalized
// User clicks: Takeaway button
// Guard shows: Block modal (cannot convert finalized dine-in)
```

**Modal Content:**
```
Cannot convert to takeaway

This dine-in order is finalized to Table T01.

To change service type, you must:
• Complete and close the current order, or
• Cancel the order from the Cart page

[OK]
```

##### Scenario C: Dine-In → Takeaway (Unfinalised Order)
```typescript
// Current state: DINE_IN order with table, NOT finalized
// User clicks: Takeaway button
// Guard shows: "Convert to Takeaway" modal
```

**Modal Content:**
```
Convert dine-in order to takeaway?

Current table: T01
Items: 2 items • Total: $30.00

This will release the table.

[Convert to Takeaway] (primary)
[Keep as Dine-In] (secondary)
```

**Behavior:**
- **Convert:**
  - Set `service_type = 'TAKEAWAY'`
  - Set `table_id = null`, `reservation_id = null`, `guest_count = null`
  - Release table (status → `AVAILABLE`)
  - Set `is_finalized = false`
  - Update snapshot
  - Stay on `/products`
- **Keep:**
  - No state changes
  - Stay on `/products`

---

### 3. Outlet Switch Guard
**When:** User selects different outlet in OutletContextSwitcher  
**Condition:** Active order exists (any service type)

**Current Implementation:** Already exists in Router.tsx:321-323  
**Enhancement Needed:** Add service-aware messaging and table release

**Enhanced Modal Content:**
```
Switch to Outlet: [New Outlet Name]

You have an active [TAKEAWAY/DINE-IN] order:
• Items: 3 items
• Total: $45.00
[• Table: T01] (if dine-in)

Switching outlets will close this order.

[Close Order & Switch] (destructive)
[Cancel] (secondary)
```

**Behavior:**
- **Close Order & Switch:**
  - If dine-in: release table (status → `AVAILABLE`)
  - Call `closeActiveOrder(order_id, 'CANCELLED')`
  - Clear cart via `clearCart()`
  - Update `scope.outlet_id`
  - Navigate to `/service-mode`
- **Cancel:**
  - No state changes
  - Dropdown reverts to current outlet

---

### 4. Logout Guard
**When:** User clicks logout  
**Condition:** Active order exists

**Modal Content:**
```
Logout with active order?

You have an unsaved [TAKEAWAY/DINE-IN] order:
• Items: 3 items
• Total: $45.00

Logging out will close this order.

[Close Order & Logout] (destructive)
[Cancel] (secondary)
```

**Behavior:**
- **Close Order & Logout:**
  - If dine-in: release table
  - Call `closeActiveOrder(order_id, 'CANCELLED')`
  - Clear cart and session
  - Navigate to `/login`
- **Cancel:**
  - Stay on current page

---

### 5. Browser Navigation Guard
**When:** User presses back/forward button or closes tab  
**Condition:** Active order exists with unsaved changes

**Implementation:** `window.onbeforeunload`

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasActiveOrder && !isFinalized) {
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasActiveOrder, isFinalized]);
```

**Note:** Modern browsers show generic message; cannot customize text.

---

## Implementation Architecture

### Guard Hook: `useNavigationGuard`

```typescript
interface NavigationGuardConfig {
  enabled: boolean;
  hasActiveOrder: boolean;
  isFinalized: boolean;
  serviceType: 'TAKEAWAY' | 'DINE_IN';
  tableId: number | null;
  itemCount: number;
  grandTotal: number;
  currentRoute: string;
  onConfirm: (action: GuardAction) => void | Promise<void>;
}

interface GuardAction {
  type: 'allow' | 'save-to-dinein' | 'convert-to-takeaway' | 'discard' | 'cancel';
  targetRoute?: string;
  tableId?: number;
}

function useNavigationGuard(config: NavigationGuardConfig) {
  const [guardModal, setGuardModal] = useState<GuardModalState | null>(null);
  const navigate = useNavigate();

  // Intercept navigation
  const guardedNavigate = useCallback((to: string) => {
    if (!config.enabled || !config.hasActiveOrder) {
      navigate(to);
      return;
    }

    const allowed = isTransitionAllowed(config.currentRoute, to);
    if (allowed) {
      navigate(to);
      return;
    }

    // Show guard modal
    setGuardModal({
      type: 'route-change',
      targetRoute: to,
      // ... context
    });
  }, [config, navigate]);

  // Handle modal actions
  const handleGuardAction = useCallback(async (action: GuardAction) => {
    await config.onConfirm(action);
    setGuardModal(null);
    if (action.type === 'allow' && action.targetRoute) {
      navigate(action.targetRoute);
    }
  }, [config, navigate]);

  return {
    guardedNavigate,
    guardModal,
    handleGuardAction
  };
}
```

---

### Modal Component: `NavigationGuardModal`

```typescript
interface NavigationGuardModalProps {
  type: 'route-change' | 'service-switch' | 'outlet-switch' | 'logout';
  orderContext: {
    serviceType: 'TAKEAWAY' | 'DINE_IN';
    tableId: number | null;
    itemCount: number;
    grandTotal: number;
  };
  targetContext?: {
    route?: string;
    serviceType?: 'TAKEAWAY' | 'DINE_IN';
    outletName?: string;
  };
  availableTables?: Array<{ table_id: number; code: string; name: string }>;
  onAction: (action: GuardAction) => void;
  onClose: () => void;
}

export function NavigationGuardModal({
  type,
  orderContext,
  targetContext,
  availableTables,
  onAction,
  onClose
}: NavigationGuardModalProps): JSX.Element {
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  const renderContent = () => {
    switch (type) {
      case 'route-change':
        return <RouteChangeContent />;
      case 'service-switch':
        return <ServiceSwitchContent />;
      case 'outlet-switch':
        return <OutletSwitchContent />;
      case 'logout':
        return <LogoutContent />;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {renderContent()}
      </div>
    </div>
  );
}
```

---

## Integration Points

### 1. Router.tsx
```typescript
// Add guard configuration to PosAppStateContext
const guardConfig: NavigationGuardConfig = {
  enabled: true,
  hasActiveOrder: !!currentActiveOrderId,
  isFinalized: activeOrderContext.is_finalized,
  serviceType: activeOrderContext.service_type,
  tableId: activeOrderContext.table_id,
  itemCount: cartLines.length,
  grandTotal: cartTotals.grand_total,
  currentRoute: location.pathname,
  onConfirm: handleGuardAction
};

const { guardedNavigate, guardModal, handleGuardAction } = useNavigationGuard(guardConfig);

// Provide guardedNavigate to all child components
```

### 2. ProductsPage.tsx
```typescript
// Replace direct service type setters with guarded versions
const handleServiceTypeChange = (newType: OrderServiceType) => {
  if (newType === activeOrderContext.service_type) return;

  if (cartLines.length > 0) {
    // Show guard modal
    showServiceSwitchGuard({
      from: activeOrderContext.service_type,
      to: newType,
      isFinalized: activeOrderContext.is_finalized
    });
  } else {
    // No items, allow direct switch
    setServiceType(newType);
  }
};
```

### 3. OutletContextSwitcher
```typescript
// Enhance existing outlet switch with guard
const handleOutletChange = (newOutletId: number) => {
  if (newOutletId === scope.outlet_id) return;

  if (hasActiveOrder) {
    showOutletSwitchGuard({
      currentOutlet: scope.outlet_id,
      targetOutlet: newOutletId,
      orderContext: { /* ... */ }
    });
  } else {
    // No active order, allow direct switch
    setScope({ ...scope, outlet_id: newOutletId });
  }
};
```

### 4. Navigation Links
```typescript
// Replace direct navigate calls with guarded version
import { useGuardedNavigate } from './hooks/useNavigationGuard';

function SomeComponent() {
  const guardedNavigate = useGuardedNavigate();

  return (
    <button onClick={() => guardedNavigate('/settings')}>
      Settings
    </button>
  );
}
```

---

## Edge Cases and Error Handling

### 1. Table Unavailable During Save
**Scenario:** User selects table T01, but it becomes OCCUPIED before save completes

**Handling:**
```typescript
try {
  const occupied = await runtime.setOutletTableStatus(scope, tableId, 'OCCUPIED');
  if (!occupied) {
    throw new Error('Table is no longer available');
  }
  // ... continue save
} catch (error) {
  showError('Selected table is no longer available. Please choose another.');
  // Reload table list
  // Keep modal open for retry
}
```

### 2. Concurrent Order on Table
**Scenario:** Another device creates order on table T01 while modal is open

**Handling:**
```typescript
// Check for conflicts before save
const conflicts = await runtime.listActiveOrders(scope, 'OPEN', { finalizedOnly: true });
const hasConflict = conflicts.some(order => order.table_id === selectedTableId);

if (hasConflict) {
  showError('Another order is already active on this table.');
  // Reload table list
  return;
}
```

### 3. Network Failure During Close
**Scenario:** Logout/switch attempted but order close fails offline

**Handling:**
```typescript
try {
  await runtime.closeActiveOrder(scope, orderId, 'CANCELLED');
} catch (error) {
  // Offline or storage error - still allow logout/switch
  // Order will be cleaned up on next sync
  console.warn('Failed to close order, will sync later:', error);
}

// Continue with logout/switch
clearCart();
navigate('/login');
```

### 4. Multiple Rapid Guard Triggers
**Scenario:** User clicks multiple navigation buttons rapidly

**Handling:**
```typescript
// Guard modal state with mutex
const [guardInFlight, setGuardInFlight] = useState(false);

const guardedNavigate = (to: string) => {
  if (guardInFlight) return; // Ignore subsequent triggers
  
  setGuardInFlight(true);
  // ... show modal
};

const handleGuardAction = async (action: GuardAction) => {
  try {
    await executeAction(action);
  } finally {
    setGuardInFlight(false);
  }
};
```

---

## Testing Requirements

### Unit Tests

```typescript
describe('useNavigationGuard', () => {
  it('allows navigation when no active order', () => {
    const { guardedNavigate } = useNavigationGuard({ hasActiveOrder: false });
    guardedNavigate('/settings');
    expect(navigate).toHaveBeenCalledWith('/settings');
  });

  it('blocks navigation to settings with active order', () => {
    const { guardedNavigate, guardModal } = useNavigationGuard({ hasActiveOrder: true });
    guardedNavigate('/settings');
    expect(guardModal).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('allows navigation within allowed transitions', () => {
    const { guardedNavigate } = useNavigationGuard({ 
      hasActiveOrder: true,
      currentRoute: '/products'
    });
    guardedNavigate('/cart');
    expect(navigate).toHaveBeenCalledWith('/cart');
  });
});

describe('NavigationGuardModal - Service Switch', () => {
  it('shows table selector for takeaway → dine-in', () => {
    const { getByText, getByLabelText } = render(
      <NavigationGuardModal
        type="service-switch"
        orderContext={{ serviceType: 'TAKEAWAY', itemCount: 3, grandTotal: 4500 }}
        targetContext={{ serviceType: 'DINE_IN' }}
        availableTables={mockTables}
      />
    );
    expect(getByText('Save this order to a table for dine-in?')).toBeInTheDocument();
    expect(getByLabelText('Select Table')).toBeInTheDocument();
  });

  it('blocks finalized dine-in → takeaway', () => {
    const { getByText } = render(
      <NavigationGuardModal
        type="service-switch"
        orderContext={{ serviceType: 'DINE_IN', isFinalized: true, tableId: 1 }}
        targetContext={{ serviceType: 'TAKEAWAY' }}
      />
    );
    expect(getByText('Cannot convert to takeaway')).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
describe('Navigation Guard Integration', () => {
  it('prevents outlet switch with active order', async () => {
    // Arrange: Create active order
    await createActiveOrder({ serviceType: 'TAKEAWAY', items: [mockItem] });

    // Act: Attempt outlet switch
    const outletSwitcher = screen.getByRole('combobox', { name: /outlet/i });
    fireEvent.change(outletSwitcher, { target: { value: '2' } });

    // Assert: Modal shown, outlet not changed
    expect(screen.getByText(/Switch to Outlet/i)).toBeInTheDocument();
    expect(mockSetScope).not.toHaveBeenCalled();
  });

  it('releases table when converting dine-in to takeaway', async () => {
    // Arrange: Finalized dine-in order on table 1
    await createActiveOrder({ 
      serviceType: 'DINE_IN', 
      tableId: 1,
      isFinalized: false,
      items: [mockItem] 
    });

    // Act: Switch to takeaway
    fireEvent.click(screen.getByRole('button', { name: /Takeaway/i }));
    fireEvent.click(screen.getByRole('button', { name: /Convert to Takeaway/i }));

    // Assert: Table released
    const tables = await runtime.getOutletTables(scope);
    expect(tables.find(t => t.table_id === 1)?.status).toBe('AVAILABLE');
  });
});
```

### E2E Tests

```typescript
test('prevents data loss on accidental navigation', async ({ page }) => {
  // Login and create order
  await page.goto('/login');
  await login(page);
  await page.goto('/products');
  await page.click('[data-product-id="1"]');
  await page.click('[data-product-id="1"]'); // 2 items

  // Attempt navigation to settings
  await page.click('[href="/settings"]');

  // Expect guard modal
  await expect(page.getByText('You have an unsaved order')).toBeVisible();
  await expect(page.getByText('2 items')).toBeVisible();

  // Cancel navigation
  await page.click('button:has-text("Cancel")');

  // Verify still on products page with cart intact
  await expect(page).toHaveURL('/products');
  await expect(page.getByText('2 items')).toBeVisible();
});

test('saves takeaway to dine-in via guard modal', async ({ page }) => {
  // Create takeaway order
  await page.goto('/products');
  await page.click('[data-product-id="1"]');

  // Switch to dine-in
  await page.click('button:has-text("Dine-in")');

  // Guard modal appears
  await expect(page.getByText('Save this order to a table')).toBeVisible();

  // Select table and save
  await page.selectOption('select', { label: 'T01 (Table 1)' });
  await page.click('button:has-text("Save to Table")');

  // Verify conversion
  await expect(page.getByText('Table selected: T01')).toBeVisible();
  await expect(page.getByText('1 item')).toBeVisible();
});
```

---

## Accessibility Requirements

### Keyboard Navigation
- Modal opens: focus moves to first interactive element
- Escape key: closes modal (equivalent to "Cancel" action)
- Tab: cycles through modal actions
- Enter: activates focused button

### Screen Reader Announcements
```typescript
<div role="alertdialog" aria-labelledby="guard-title" aria-describedby="guard-description">
  <h2 id="guard-title">You have an active takeaway order</h2>
  <p id="guard-description">
    Items: 3 items • Total: $45.00. 
    Save this order to a table for dine-in?
  </p>
  {/* Actions */}
</div>
```

### Focus Trap
```typescript
import { FocusTrap } from '@headlessui/react';

export function NavigationGuardModal({ ... }) {
  return (
    <FocusTrap>
      <div role="alertdialog">
        {/* Modal content */}
      </div>
    </FocusTrap>
  );
}
```

---

## Performance Considerations

### Modal State Management
- Use single modal container in Router.tsx (avoid multiple instances)
- Lazy-load modal content based on guard type
- Memoize table list to prevent re-fetches

### Guard Check Optimization
```typescript
// Cache transition map for fast lookups
const TRANSITION_MAP = new Map([
  ['/service-mode', new Set(['/products', '/tables'])],
  ['/products', new Set(['/cart', '/checkout', '/tables'])],
  // ...
]);

function isTransitionAllowed(from: string, to: string): boolean {
  return TRANSITION_MAP.get(from)?.has(to) ?? false;
}
```

---

**End of Specification**
