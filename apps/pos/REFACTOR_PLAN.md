# 📱 POS Phone-First Capacitor-Ready Refactor Plan

**Status**: Planning Phase  
**Last Updated**: 2026-03-07  
**Owner**: Ahmad Faruk (Signal18 ID)

---

## Table of Contents

1. [Current Structure Audit](#1-current-structure-audit)
2. [Coupling & Problems Identified](#2-coupling--problems-identified)
3. [Proposed Target Folder Tree](#3-proposed-target-folder-tree)
4. [File-by-File Migration Plan](#4-file-by-file-migration-plan)
5. [Pages / Features / Shared / Platform Mapping](#5-pages--features--shared--platform-mapping)
6. [Native/Mobile Concerns Isolation](#6-nativemobile-concerns-isolation)
7. [Business Logic Outside UI](#7-business-logic-outside-ui)
8. [Smallest Safe Implementation Sequence](#8-smallest-safe-implementation-sequence)
9. [First 5 Concrete Edits](#9-first-5-concrete-edits)

---

## 1. Current Structure Audit

### Architecture Overview

```
apps/pos/
├── src/
│   ├── main.tsx                    # 1135-line monolithic UI component
│   ├── bootstrap/web.tsx           # Web platform composition
│   ├── platform/web/               # Browser adapters (IndexedDB, fetch, print)
│   ├── ports/                      # Port interfaces (hexagonal architecture)
│   ├── services/                   # Business logic services
│   └── offline/                    # Offline-first core (outbox, sales, sync)
```

### Key Strengths

- ✅ **Hexagonal architecture**: Clean port/adapter separation
- ✅ **Offline-first**: IndexedDB, outbox pattern, service worker
- ✅ **Idempotent sync**: `client_tx_id` deduplication
- ✅ **Multi-tab coordination**: Leader election via Web Locks API
- ✅ **Comprehensive tests**: Unit tests for offline layer
- ✅ **PWA-ready**: Service worker, manifest, installable

### Critical Issues

- ❌ **Monolithic UI**: All UI in single 1135-line file
- ❌ **Business logic in UI**: Cart, money, validation mixed with rendering
- ❌ **No routing**: Single-page scroll, hard to navigate on mobile
- ❌ **Desktop-first layout**: Fixed 680px width, no responsive design
- ❌ **No component library**: Inline styles, difficult to maintain
- ❌ **No Capacitor support**: No native plugin abstraction

---

## 2. Coupling & Problems Identified

### A. UI/Business Logic Coupling

**Location**: `main.tsx:40-554`

**Problems**:
- Money calculations embedded in UI (`normalizeMoney`, `formatMoney`, `computeCartTotals`)
- OAuth flow logic in UI component (lines 231-334)
- Cart management in UI event handlers (`upsertCartLine`)
- Sale completion orchestration in UI (`runCompleteSale`)

**Impact**: Cannot reuse cart/checkout logic outside this component. Hard to test business rules.

### B. Monolithic Component Structure

**Location**: `main.tsx` (1135 lines)

```
Lines 1-89:     Utility functions (money, auth, badge colors)
Lines 115-231:  Login component (email/password + Google OAuth)
Lines 231-334:  OAuth callback handling
Lines 335-1135: Main App component with:
  - Product search
  - Cart management
  - Checkout form
  - Sync controls
  - Payment processing
  - Receipt printing
```

**Problem**: Cannot navigate between login/checkout/products on mobile. No deep linking. Hard to maintain.

### C. No Mobile Navigation

**Current**: Single scrolling page with conditional rendering

```tsx
{authToken ? (
  <div>
    {/* All checkout UI in one scroll */}
    <SyncBadge />
    <ProductSearch />
    <Cart />
    <CheckoutForm />
  </div>
) : (
  <LoginForm />
)}
```

**Problem**: Poor UX on phone. Cashier must scroll past cart to see products. No back button. No tab bar.

### D. Platform Adapter Leakage

**Location**: `main.tsx:401-402`

```tsx
// ❌ Direct browser API usage in UI
const intervalId = window.setInterval(scheduleRefresh, POLL_INTERVAL_MS);
document.addEventListener("visibilitychange", onVisibilityChange);
```

**Problem**: If we add Capacitor, these should use App plugin for state detection.

### E. Hardcoded Configuration

**Scattered constants**:
```tsx
const POLL_INTERVAL_MS = 1500;
const CASHIER_USER_ID = 1;
const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_STATE_KEY = "jurnapod.pos.oauth.state";
```

**Problem**: No central config. Hard to adjust for mobile vs desktop.

---

## 3. Proposed Target Folder Tree

```
apps/pos/
├── capacitor.config.ts              # [NEW] Capacitor configuration
├── android/                         # [NEW] Android native project
├── ios/                             # [NEW] iOS native project
├── src/
│   ├── main.tsx                     # [SLIM] Entry point only, no UI
│   │
│   ├── bootstrap/
│   │   ├── web.tsx                  # [KEEP] Web platform bootstrap
│   │   └── mobile.tsx               # [NEW] Capacitor platform bootstrap
│   │
│   ├── platform/
│   │   ├── web/                     # [KEEP] Browser adapters
│   │   │   ├── device-identity.ts
│   │   │   ├── network.ts
│   │   │   ├── printer.ts
│   │   │   ├── storage.ts
│   │   │   └── sync-transport.ts
│   │   └── mobile/                  # [NEW] Capacitor adapters
│   │       ├── device-identity.ts   # Use @capacitor/device
│   │       ├── network.ts           # Use @capacitor/network
│   │       ├── printer.ts           # Use native printing
│   │       ├── storage.ts           # Use CapacitorSQLite or IndexedDB
│   │       └── app-state.ts         # [NEW] Use @capacitor/app
│   │
│   ├── ports/                       # [KEEP] Port interfaces
│   │   ├── app-state-port.ts        # [NEW] App lifecycle port
│   │   └── ...                      # Existing ports
│   │
│   ├── services/                    # [EXPAND] Business logic services
│   │   ├── cart-service.ts          # [NEW] Cart operations + validation
│   │   ├── auth-service.ts          # [NEW] OAuth + token management
│   │   ├── money-service.ts         # [NEW] Money calculations + formatting
│   │   └── ...                      # Existing services
│   │
│   ├── offline/                     # [KEEP] Offline-first core
│   │   └── ...                      # No changes needed
│   │
│   ├── pages/                       # [NEW] Route-level components
│   │   ├── LoginPage.tsx            # Login screen
│   │   ├── CheckoutPage.tsx         # Main cashier flow
│   │   ├── ProductsPage.tsx         # Product catalog browser
│   │   ├── CartPage.tsx             # Cart review + edit
│   │   ├── SettingsPage.tsx         # [NEW] Outlet/sync settings
│   │   └── index.ts
│   │
│   ├── features/                    # [NEW] Feature-scoped components
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── GoogleAuthButton.tsx
│   │   │   └── useAuthCallback.ts   # OAuth callback logic
│   │   ├── cart/
│   │   │   ├── CartList.tsx
│   │   │   ├── CartLine.tsx
│   │   │   ├── CartSummary.tsx
│   │   │   └── useCart.ts           # Cart state + operations
│   │   ├── checkout/
│   │   │   ├── CheckoutForm.tsx
│   │   │   ├── PaymentMethodPicker.tsx
│   │   │   ├── QuickAmountButtons.tsx
│   │   │   └── useCheckout.ts       # Sale completion logic
│   │   ├── products/
│   │   │   ├── ProductGrid.tsx
│   │   │   ├── ProductCard.tsx
│   │   │   ├── ProductSearch.tsx
│   │   │   └── useProducts.ts       # Catalog + search
│   │   └── sync/
│   │       ├── SyncBadge.tsx
│   │       ├── SyncControls.tsx
│   │       └── useSync.ts           # Sync state polling
│   │
│   ├── shared/                      # [NEW] Shared UI primitives
│   │   ├── components/
│   │   │   ├── Button.tsx           # Phone-optimized button (min 44px tap)
│   │   │   ├── Input.tsx            # Touch-friendly input
│   │   │   ├── Card.tsx             # Container component
│   │   │   ├── Badge.tsx            # Status badges
│   │   │   ├── Modal.tsx            # Full-screen mobile modal
│   │   │   └── TabBar.tsx           # [NEW] Bottom navigation
│   │   ├── hooks/
│   │   │   ├── useAppState.ts       # [NEW] App lifecycle (via port)
│   │   │   ├── useNetwork.ts        # Network status
│   │   │   └── useDebounce.ts       # [NEW] Search debouncing
│   │   ├── utils/
│   │   │   ├── money.ts             # [MOVE] Money utils from main.tsx
│   │   │   ├── validation.ts        # [NEW] Shared validation
│   │   │   └── constants.ts         # [NEW] Config constants
│   │   └── types/
│   │       └── ui.types.ts          # Shared UI types
│   │
│   ├── router/                      # [NEW] Routing layer
│   │   ├── Router.tsx               # Route configuration
│   │   ├── routes.ts                # Route definitions
│   │   └── navigation.ts            # Navigation helpers
│   │
│   └── vite-env.d.ts
```

---

## 4. File-by-File Migration Plan

### Phase 1: Extract Business Logic (No UI changes)

**Goal**: Separate business logic from UI without breaking current app

| Current File | New File | What to Extract |
|-------------|----------|-----------------|
| `main.tsx:40-78` | `shared/utils/money.ts` | `normalizeMoney()`, `formatMoney()`, `computeCartTotals()` |
| `main.tsx:80-89` | `services/auth-service.ts` | `buildGoogleAuthUrl()`, OAuth state management |
| `main.tsx:459-487` | `services/cart-service.ts` | `upsertCartLine()`, cart validation logic |
| `main.tsx:489-554` | `services/cart-service.ts` | `runCompleteSale()` orchestration |
| `main.tsx:91-113` | `shared/utils/ui-helpers.ts` | `badgeColors()` |

**Testing**: Existing behavior unchanged. Run `npm test` + `npm run qa:e2e`.

---

### Phase 2: Create Shared UI Components

**Goal**: Build phone-optimized primitives

| Component | File | Props | Notes |
|-----------|------|-------|-------|
| `Button` | `shared/components/Button.tsx` | `variant`, `size`, `onClick`, `disabled` | Min 44px height, large touch target |
| `Input` | `shared/components/Input.tsx` | `type`, `value`, `onChange`, `placeholder` | Auto-zoom disabled, large text |
| `Card` | `shared/components/Card.tsx` | `children`, `padding` | Shadow, rounded corners |
| `Badge` | `shared/components/Badge.tsx` | `status`, `text` | Uses `badgeColors()` |
| `Modal` | `shared/components/Modal.tsx` | `isOpen`, `onClose`, `children` | Full-screen on mobile |
| `TabBar` | `shared/components/TabBar.tsx` | `tabs`, `activeTab`, `onTabChange` | Bottom navigation (iOS/Android) |

**Styling Strategy**: Inline CSS-in-JS with responsive breakpoints

```tsx
const buttonStyle = {
  minHeight: '44px',
  fontSize: '16px', // Prevent iOS auto-zoom
  padding: '12px 24px',
  // ...
};
```

**Testing**: Visual review in dev mode.

---

### Phase 3: Extract Feature Components

**Goal**: Split `main.tsx` into feature-scoped components

#### 3A. Auth Feature

**Extract from**: `main.tsx:115-334`

| Component | Responsibility |
|-----------|---------------|
| `features/auth/LoginForm.tsx` | Email/password form + validation |
| `features/auth/GoogleAuthButton.tsx` | Google OAuth button + redirect |
| `features/auth/useAuthCallback.ts` | Parse OAuth callback, exchange code |

**State**: Login status, error messages  
**Services**: `auth-service.ts`

#### 3B. Products Feature

**Extract from**: `main.tsx:421-431` (search logic) + product grid

| Component | Responsibility |
|-----------|---------------|
| `features/products/ProductSearch.tsx` | Search input with debounce |
| `features/products/ProductGrid.tsx` | Grid of product cards |
| `features/products/ProductCard.tsx` | Single product with add-to-cart |
| `features/products/useProducts.ts` | Catalog state, search filtering |

**State**: Catalog, search term, filtered products

#### 3C. Cart Feature

**Extract from**: `main.tsx` cart rendering

| Component | Responsibility |
|-----------|---------------|
| `features/cart/CartList.tsx` | List of cart lines |
| `features/cart/CartLine.tsx` | Single line with qty/discount edit |
| `features/cart/CartSummary.tsx` | Subtotal, discount, total |
| `features/cart/useCart.ts` | Cart state, add/remove/update |

**State**: Cart lines, totals  
**Services**: `cart-service.ts`

#### 3D. Checkout Feature

**Extract from**: `main.tsx` checkout form

| Component | Responsibility |
|-----------|---------------|
| `features/checkout/CheckoutForm.tsx` | Payment input + complete button |
| `features/checkout/PaymentMethodPicker.tsx` | Dropdown for payment method |
| `features/checkout/QuickAmountButtons.tsx` | Quick amount shortcuts |
| `features/checkout/useCheckout.ts` | Sale completion orchestration |

**State**: Payment method, paid amount, in-flight status  
**Services**: `cart-service.ts`, `print-service.ts`

#### 3E. Sync Feature

**Extract from**: `main.tsx:138-154` (SyncBadge)

| Component | Responsibility |
|-----------|---------------|
| `features/sync/SyncBadge.tsx` | Status indicator |
| `features/sync/SyncControls.tsx` | Manual sync button, last sync time |
| `features/sync/useSync.ts` | Polling, badge state |

**Testing**: Component-level tests for each feature.

---

### Phase 4: Create Pages & Routing

**Goal**: Enable mobile navigation between screens

#### 4A. Install Routing Library

```bash
npm install react-router-dom
```

#### 4B. Create Page Components

| Page | Route | Components Used | Mobile Layout |
|------|-------|-----------------|---------------|
| `LoginPage.tsx` | `/login` | `LoginForm`, `GoogleAuthButton` | Full-screen centered |
| `CheckoutPage.tsx` | `/` (default) | `ProductSearch`, `CartSummary`, `CheckoutForm` | Sticky cart footer + product grid |
| `ProductsPage.tsx` | `/products` | `ProductSearch`, `ProductGrid` | Full-screen product browser |
| `CartPage.tsx` | `/cart` | `CartList`, `CartSummary` | Cart review + edit |
| `SettingsPage.tsx` | `/settings` | `SyncControls`, outlet picker | Settings screen |

#### 4C. Add Bottom Tab Bar

**Component**: `TabBar.tsx`  
**Tabs**: 
- 🏠 Checkout (default)
- 🛒 Cart (badge with item count)
- 📦 Products
- ⚙️ Settings

**Testing**: Navigation flow in dev mode.

---

### Phase 5: Add Platform Abstraction for Capacitor

**Goal**: Prepare for native plugins without importing Capacitor in UI

#### 5A. Add App State Port

**File**: `ports/app-state-port.ts`

```typescript
export interface AppStatePort {
  onActive(callback: () => void): () => void;
  onInactive(callback: () => void): () => void;
  onBackground(callback: () => void): () => void;
}
```

#### 5B. Web Implementation (Existing Behavior)

**File**: `platform/web/app-state.ts`

```typescript
// Uses document.visibilitychange
export function createWebAppStateAdapter(): AppStatePort { ... }
```

#### 5C. Mobile Implementation (Capacitor)

**File**: `platform/mobile/app-state.ts`

```typescript
import { App } from '@capacitor/app';

export function createMobileAppStateAdapter(): AppStatePort {
  return {
    onActive: (cb) => App.addListener('appStateChange', (state) => {
      if (state.isActive) cb();
    }),
    // ...
  };
}
```

#### 5D. Update Other Adapters for Capacitor

| Port | Web Adapter | Mobile Adapter | Capacitor Plugin |
|------|-------------|----------------|------------------|
| `NetworkPort` | `navigator.onLine` | `@capacitor/network` | Network status, listener |
| `DeviceIdentityPort` | Browser fingerprint | `@capacitor/device` | UUID, model, platform |
| `PrinterPort` | `window.print()` | `capacitor-thermal-printer` | Bluetooth/USB receipt printer |
| `StoragePort` | IndexedDB (Dexie) | IndexedDB or `@capacitor-community/sqlite` | Consider SQLite for Android |

**Testing**: Create `bootstrap/mobile.tsx` that uses mobile adapters.

---

### Phase 6: Mobile-Specific Optimizations

**Goal**: Optimize for phone cashier flow

#### 6A. Responsive Layout

**Current**: Fixed 680px width  
**Target**: 
- Mobile: 100% width, vertical stack
- Tablet: Split view (products left, cart right)
- Desktop: Keep current layout

**Breakpoints**:
```tsx
const isMobile = window.innerWidth < 768;
const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
```

#### 6B. Touch Optimizations

- Min 44x44px touch targets
- Larger font sizes (16px+ to prevent iOS auto-zoom)
- Swipe gestures for cart line removal
- Pull-to-refresh for sync

#### 6C. Keyboard Optimizations

- Numeric keypad for payment input
- Auto-focus payment input after adding product
- Dismiss keyboard on sale complete

#### 6D. Performance

- Virtual scrolling for large product catalogs (>100 items)
- Lazy load product images
- Debounce search input (300ms)

**Testing**: Test on real Android/iOS device.

---

## 5. Pages / Features / Shared / Platform Mapping

### Pages (Route-level)

| File | Responsibility | Mobile Layout |
|------|----------------|---------------|
| `LoginPage.tsx` | Authentication entry | Full-screen centered |
| `CheckoutPage.tsx` | Main cashier flow | Product grid + sticky cart |
| `ProductsPage.tsx` | Browse catalog | Full-screen grid |
| `CartPage.tsx` | Review cart | List with swipe-to-delete |
| `SettingsPage.tsx` | Outlet/sync config | Form + sync controls |

### Features (Domain-scoped)

| Feature | Components | Hooks | Services |
|---------|-----------|-------|----------|
| `auth/` | LoginForm, GoogleAuthButton | useAuthCallback | auth-service |
| `cart/` | CartList, CartLine, CartSummary | useCart | cart-service |
| `checkout/` | CheckoutForm, PaymentMethodPicker | useCheckout | cart-service, print-service |
| `products/` | ProductGrid, ProductCard, ProductSearch | useProducts | runtime-service |
| `sync/` | SyncBadge, SyncControls | useSync | sync-orchestrator |

### Shared (Reusable UI)

| Category | Files |
|----------|-------|
| `components/` | Button, Input, Card, Badge, Modal, TabBar |
| `hooks/` | useAppState, useNetwork, useDebounce |
| `utils/` | money.ts, validation.ts, constants.ts |
| `types/` | ui.types.ts |

### Platform (Adapter implementations)

| Platform | Adapters |
|----------|----------|
| `web/` | IndexedDB, fetch, window.print(), navigator.onLine, visibilitychange |
| `mobile/` | Capacitor plugins: Device, Network, App, Printer, SQLite (optional) |

---

## 6. Native/Mobile Concerns Isolation

### Principle: **Never import Capacitor directly in UI or business logic**

#### ✅ Correct Pattern

```typescript
// pages/CheckoutPage.tsx
import { useAppState } from '../shared/hooks/useAppState';

function CheckoutPage() {
  useAppState({
    onActive: () => console.log('App resumed'),
  });
  // ...
}

// shared/hooks/useAppState.ts
import { useContext } from 'react';
import { PlatformContext } from '../context/PlatformContext';

export function useAppState(handlers) {
  const { appState } = useContext(PlatformContext);
  // appState is injected AppStatePort
}

// bootstrap/mobile.tsx
import { createMobileAppStateAdapter } from '../platform/mobile/app-state';

const appState = createMobileAppStateAdapter(); // Uses Capacitor
// Pass to context
```

#### ❌ Incorrect Pattern

```typescript
// pages/CheckoutPage.tsx - WRONG!
import { App } from '@capacitor/app'; // ❌ Direct import in UI

function CheckoutPage() {
  App.addListener('appStateChange', ...); // ❌ Breaks web compatibility
}
```

### Mobile Concerns to Isolate

| Concern | Isolation Boundary | Web Fallback |
|---------|-------------------|--------------|
| App lifecycle | `AppStatePort` | `visibilitychange` |
| Network status | `NetworkPort` | `navigator.onLine` |
| Device info | `DeviceIdentityPort` | Browser fingerprint |
| Printing | `PrinterPort` | `window.print()` |
| Storage | `StoragePort` | IndexedDB (same on mobile) |
| Push notifications | `NotificationPort` [NEW] | Web Push API |
| Biometric auth | `BiometricPort` [NEW] | Password fallback |

### Platform Detection

**File**: `shared/utils/platform.ts`

```typescript
export const isMobile = (): boolean => {
  return /android|ios/i.test(navigator.userAgent) || 
         window.matchMedia('(max-width: 768px)').matches;
};

export const isCapacitor = (): boolean => {
  return !!(window as any).Capacitor;
};
```

**Usage**: Only in bootstrap layer to choose adapters.

---

## 7. Business Logic Outside UI

### Business Logic Layers

#### Layer 1: Services (Pure business logic)

**Location**: `services/`

**Rules**: 
- No React dependencies
- No DOM/browser APIs
- Use ports for side effects
- Fully testable with mocks

**Examples**:

```typescript
// services/cart-service.ts
export class CartService {
  constructor(private storage: StoragePort) {}

  async validateCartLine(line: CartLine): Promise<ValidationResult> {
    // Pure business logic
  }

  async calculateTotals(lines: CartLine[]): Promise<CartTotals> {
    // Pure calculation
  }
}
```

#### Layer 2: Feature Hooks (React integration)

**Location**: `features/*/hooks/`

**Rules**:
- Can use React hooks
- Delegates to services
- Manages local UI state
- No direct IndexedDB/fetch

**Examples**:

```typescript
// features/cart/useCart.ts
export function useCart(context: WebBootstrapContext) {
  const [cart, setCart] = useState<CartState>({});
  
  const addToCart = useCallback((product: Product) => {
    // Call cart-service, update state
    const result = context.cartService.addLine(product);
    setCart(result);
  }, [context]);

  return { cart, addToCart };
}
```

#### Layer 3: UI Components (Presentation)

**Location**: `features/*/`, `pages/`, `shared/components/`

**Rules**:
- Only presentation logic
- No business rules
- No calculations
- Delegates to hooks

**Examples**:

```typescript
// features/cart/CartSummary.tsx
export function CartSummary({ totals }: { totals: CartTotals }) {
  return (
    <Card>
      <div>Subtotal: {formatMoney(totals.subtotal)}</div>
      <div>Total: {formatMoney(totals.grand_total)}</div>
    </Card>
  );
}
```

### Business Logic Extraction Map

| Logic | Current Location | Target Location | Layer |
|-------|-----------------|-----------------|-------|
| Money calculations | `main.tsx:40-78` | `shared/utils/money.ts` | Pure function |
| Cart validation | `main.tsx:459-487` | `services/cart-service.ts` | Service |
| Sale completion | `offline/sales.ts` | Keep (already good) | Offline core |
| OAuth flow | `main.tsx:80-334` | `services/auth-service.ts` | Service |
| Payment validation | `main.tsx:494-498` | `services/cart-service.ts` | Service |
| Sync orchestration | `services/sync-orchestrator.ts` | Keep (already good) | Service |
| Badge color logic | `main.tsx:91-113` | `shared/utils/ui-helpers.ts` | Pure function |

---

## 8. Smallest Safe Implementation Sequence

### Sprint 1: Extract Utilities (1-2 days)

**Goal**: Zero UI changes, extract pure functions

1. **Create `shared/utils/money.ts`**
   - Move `normalizeMoney()`, `formatMoney()`, `computeCartTotals()`
   - Add unit tests

2. **Create `shared/utils/constants.ts`**
   - Move all hardcoded constants
   - Export typed config object

3. **Update `main.tsx` imports**
   - Replace inline functions with imports
   - Verify E2E tests pass

**Risk**: Low (pure functions)  
**Testing**: `npm test && npm run qa:e2e`

---

### Sprint 2: Create Service Classes (2-3 days)

**Goal**: Extract business logic to services

4. **Create `services/auth-service.ts`**
   - `buildGoogleAuthUrl()`
   - `validateOAuthCallback()`
   - `exchangeCodeForToken()`

5. **Create `services/cart-service.ts`**
   - `addLine()`, `updateLine()`, `removeLine()`
   - `validateLine()`
   - `calculateTotals()`
   - `completeSale()` orchestration

6. **Update `main.tsx` to use services**
   - Pass services via context
   - Replace inline logic with service calls

**Risk**: Medium (behavior changes possible)  
**Testing**: Extensive E2E + manual QA

---

### Sprint 3: Build Shared Components (3-4 days)

**Goal**: Phone-optimized UI primitives

7. **Create `shared/components/Button.tsx`**
   - Min 44px height, variants (primary, secondary)

8. **Create `shared/components/Input.tsx`**
   - Disable auto-zoom, large text

9. **Create `shared/components/Card.tsx`**
   - Shadow, padding, mobile-friendly

10. **Create `shared/components/Badge.tsx`**
    - Status colors via `badgeColors()`

11. **Create `shared/components/Modal.tsx`**
    - Full-screen on mobile, centered on desktop

**Risk**: Low (no logic changes)  
**Testing**: Visual review in dev mode

---

### Sprint 4: Extract Feature Components (4-5 days)

**Goal**: Break down `main.tsx`

12. **Auth feature**
    - `features/auth/LoginForm.tsx`
    - `features/auth/GoogleAuthButton.tsx`
    - `features/auth/useAuthCallback.ts`

13. **Products feature**
    - `features/products/ProductGrid.tsx`
    - `features/products/ProductCard.tsx`
    - `features/products/ProductSearch.tsx`
    - `features/products/useProducts.ts`

14. **Cart feature**
    - `features/cart/CartList.tsx`
    - `features/cart/CartLine.tsx`
    - `features/cart/CartSummary.tsx`
    - `features/cart/useCart.ts`

15. **Checkout feature**
    - `features/checkout/CheckoutForm.tsx`
    - `features/checkout/PaymentMethodPicker.tsx`
    - `features/checkout/useCheckout.ts`

16. **Sync feature**
    - `features/sync/SyncBadge.tsx`
    - `features/sync/SyncControls.tsx`
    - `features/sync/useSync.ts`

**Risk**: Medium (component splitting)  
**Testing**: E2E + manual flow testing

---

### Sprint 5: Add Routing (2-3 days)

**Goal**: Enable mobile navigation

17. **Install react-router-dom**
    ```bash
    npm install react-router-dom
    ```

18. **Create pages**
    - `pages/LoginPage.tsx`
    - `pages/CheckoutPage.tsx`
    - `pages/ProductsPage.tsx`
    - `pages/CartPage.tsx`
    - `pages/SettingsPage.tsx`

19. **Create `router/Router.tsx`**
    - Route configuration
    - Protected routes (require auth)

20. **Create `shared/components/TabBar.tsx`**
    - Bottom navigation (mobile)
    - 4 tabs: Checkout, Cart, Products, Settings

21. **Update `main.tsx`**
    - Remove App component
    - Render `<Router />`

**Risk**: High (major navigation change)  
**Testing**: Full flow testing on mobile + desktop

---

### Sprint 6: Platform Abstraction (3-4 days)

**Goal**: Prepare for Capacitor

22. **Create `ports/app-state-port.ts`**

23. **Create `platform/web/app-state.ts`**
    - Uses `visibilitychange`

24. **Update `bootstrap/web.tsx`**
    - Inject app state adapter into services

25. **Create `shared/hooks/useAppState.ts`**
    - React hook wrapper for port

26. **Update UI to use `useAppState()`**
    - Replace `visibilitychange` listeners

**Risk**: Low (web behavior unchanged)  
**Testing**: E2E tests

---

### Sprint 7: Capacitor Setup (2-3 days)

**Goal**: Add Capacitor without breaking web

27. **Install Capacitor**
    ```bash
    npm install @capacitor/core @capacitor/cli
    npx cap init
    ```

28. **Install platform packages**
    ```bash
    npm install @capacitor/android @capacitor/ios
    npm install @capacitor/network @capacitor/device @capacitor/app
    ```

29. **Create `capacitor.config.ts`**

30. **Create `platform/mobile/` adapters**
    - `app-state.ts` (uses `@capacitor/app`)
    - `network.ts` (uses `@capacitor/network`)
    - `device-identity.ts` (uses `@capacitor/device`)

31. **Create `bootstrap/mobile.tsx`**
    - Uses mobile adapters instead of web adapters

32. **Add platform detection in `main.tsx`**
    ```tsx
    const bootstrap = isCapacitor() ? 
      createMobileBootstrapContext : 
      createWebBootstrapContext;
    ```

**Risk**: Medium (new build target)  
**Testing**: Build APK, test on Android device

---

### Sprint 8: Mobile Optimizations (2-3 days)

**Goal**: Optimize for phone cashier

33. **Responsive layout**
    - Media queries for mobile/tablet/desktop
    - Remove fixed 680px width

34. **Touch optimizations**
    - Increase touch targets to 44x44px
    - Add swipe-to-delete for cart lines

35. **Keyboard optimizations**
    - Numeric keypad for payment input
    - Auto-focus after product add

36. **Performance**
    - Debounce search (300ms)
    - Virtual scrolling for product grid

**Risk**: Low (progressive enhancement)  
**Testing**: Manual testing on phone

---

### Sprint 9: Native Printer (Optional, 3-4 days)

**Goal**: Add Bluetooth receipt printer support

37. **Install printer plugin**
    ```bash
    npm install capacitor-thermal-printer
    ```

38. **Create `platform/mobile/printer.ts`**
    - Implement `PrinterPort` with plugin

39. **Update `bootstrap/mobile.tsx`**
    - Use mobile printer adapter

40. **Fallback to web print**
    - If printer not connected, use `window.print()`

**Risk**: Medium (hardware integration)  
**Testing**: Test with real printer device

---

### Sprint 10: Polish & Launch (1-2 days)

41. **App icons & splash screen**
42. **App store metadata**
43. **Performance testing** (Lighthouse)
44. **Security review** (token storage, SQL injection)
45. **Deploy to Google Play / App Store**

---

## 9. First 5 Concrete Edits

### Edit 1: Extract Money Utilities

**File**: `shared/utils/money.ts`  
**Purpose**: Pure functions for money operations

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Money utility functions for currency calculations and formatting.
 * All money values are in IDR (Indonesian Rupiah).
 */

export function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

export interface CartLine {
  product: { price_snapshot: number };
  qty: number;
  discount_amount: number;
}

export interface CartTotals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  paid_total: number;
  change_total: number;
}

export function computeCartTotals(
  lines: CartLine[],
  paidAmount: number
): CartTotals {
  const subtotal = normalizeMoney(
    lines.reduce((sum, line) => sum + line.qty * line.product.price_snapshot, 0)
  );
  const discountTotal = normalizeMoney(
    lines.reduce((sum, line) => sum + line.discount_amount, 0)
  );
  const grandTotal = normalizeMoney(subtotal - discountTotal);
  const paidTotal = normalizeMoney(paidAmount);
  const changeTotal = normalizeMoney(paidTotal - grandTotal);

  return {
    subtotal,
    discount_total: discountTotal,
    tax_total: 0,
    grand_total: grandTotal,
    paid_total: paidTotal,
    change_total: changeTotal
  };
}
```

**Then**: Update `main.tsx` to import from `shared/utils/money.ts`

---

### Edit 2: Extract Constants

**File**: `shared/utils/constants.ts`  
**Purpose**: Centralize configuration

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Application-wide constants and configuration.
 */

export const POLL_INTERVAL_MS = 1500;
export const CASHIER_USER_ID = 1;

export const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const OAUTH_STATE_KEY = "jurnapod.pos.oauth.state";
export const OAUTH_COMPANY_KEY = "jurnapod.pos.oauth.company";

export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1024;

export const MIN_TOUCH_TARGET = 44; // px
export const SEARCH_DEBOUNCE_MS = 300;

export const API_CONFIG = {
  get baseUrl(): string {
    const runtimeConfig = globalThis as { API_BASE_URL?: string };
    const runtimeBaseUrl = runtimeConfig.API_BASE_URL?.trim();
    const envBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
    return runtimeBaseUrl || envBaseUrl || window.location.origin;
  },
  
  get googleClientId(): string {
    return (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined)?.trim() ?? "";
  }
};
```

**Then**: Update `main.tsx` imports

---

### Edit 3: Create Button Component

**File**: `shared/components/Button.tsx`  
**Purpose**: Phone-optimized button primitive

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { MIN_TOUCH_TARGET } from "../utils/constants.js";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
}

export function Button({
  variant = "primary",
  size = "medium",
  disabled = false,
  onClick,
  children,
  type = "button"
}: ButtonProps): JSX.Element {
  const variantStyles = {
    primary: {
      background: "#3b82f6",
      color: "#ffffff",
      border: "none"
    },
    secondary: {
      background: "#f3f4f6",
      color: "#1f2937",
      border: "1px solid #d1d5db"
    },
    danger: {
      background: "#ef4444",
      color: "#ffffff",
      border: "none"
    }
  };

  const sizeStyles = {
    small: {
      padding: "8px 16px",
      fontSize: "14px",
      minHeight: `${MIN_TOUCH_TARGET}px`
    },
    medium: {
      padding: "12px 24px",
      fontSize: "16px",
      minHeight: `${MIN_TOUCH_TARGET}px`
    },
    large: {
      padding: "16px 32px",
      fontSize: "18px",
      minHeight: `${MIN_TOUCH_TARGET + 4}px`
    }
  };

  const baseStyles: React.CSSProperties = {
    borderRadius: "8px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all 0.15s",
    touchAction: "manipulation", // Prevent double-tap zoom
    ...variantStyles[variant],
    ...sizeStyles[size]
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={baseStyles}
    >
      {children}
    </button>
  );
}
```

---

### Edit 4: Create Input Component

**File**: `shared/components/Input.tsx`  
**Purpose**: Touch-friendly input with no auto-zoom

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { MIN_TOUCH_TARGET } from "../utils/constants.js";

export interface InputProps {
  type?: "text" | "number" | "email" | "password" | "search";
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputMode?: "text" | "numeric" | "email" | "search";
}

export function Input({
  type = "text",
  value,
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  inputMode
}: InputProps): JSX.Element {
  const baseStyles: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    fontSize: "16px", // Prevents iOS auto-zoom
    minHeight: `${MIN_TOUCH_TARGET}px`,
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    outline: "none",
    transition: "border-color 0.15s",
    backgroundColor: disabled ? "#f3f4f6" : "#ffffff"
  };

  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode={inputMode}
      style={baseStyles}
      onFocus={(e) => {
        e.target.style.borderColor = "#3b82f6";
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "#d1d5db";
      }}
    />
  );
}
```

---

### Edit 5: Create App State Port

**File**: `ports/app-state-port.ts`  
**Purpose**: Abstract app lifecycle for Capacitor compatibility

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * App State Port
 * 
 * Abstracts application lifecycle events (active, inactive, background).
 * Implemented by web (visibilitychange) and mobile (Capacitor App plugin).
 */

export interface AppStatePort {
  /**
   * Register callback for when app becomes active/visible.
   * Returns unsubscribe function.
   */
  onActive(callback: () => void): () => void;

  /**
   * Register callback for when app becomes inactive/hidden.
   * Returns unsubscribe function.
   */
  onInactive(callback: () => void): () => void;

  /**
   * Register callback for when app moves to background.
   * Returns unsubscribe function.
   */
  onBackground(callback: () => void): () => void;
}

/**
 * Web implementation using document.visibilitychange
 */
export function createWebAppStateAdapter(): AppStatePort {
  return {
    onActive: (callback) => {
      const handler = () => {
        if (document.visibilityState === "visible") {
          callback();
        }
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },

    onInactive: (callback) => {
      const handler = () => {
        if (document.visibilityState === "hidden") {
          callback();
        }
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },

    onBackground: (callback) => {
      // Same as inactive for web
      return createWebAppStateAdapter().onInactive(callback);
    }
  };
}
```

**Then**: Create `platform/web/app-state.ts` that exports this, and update `bootstrap/web.tsx` to inject it into services.

---

## Summary

This refactor plan provides a comprehensive roadmap to transform the POS app from a desktop-focused single-page application into a phone-first, Capacitor-ready mobile application while maintaining:

- ✅ **Web/PWA compatibility** throughout migration
- ✅ **Offline-first guarantees** via existing hexagonal architecture
- ✅ **Clean separation** between business logic and UI
- ✅ **Platform abstraction** via ports (no Capacitor in UI)
- ✅ **Incremental, testable changes** across 10 sprints
- ✅ **Phone-optimized UX** with 44px touch targets, responsive layout

**Next Steps**: Begin Sprint 1 (Extract Utilities) with the first 5 concrete edits outlined above.
