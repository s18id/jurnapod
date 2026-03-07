# ADR-0003 Step 1 Implementation: POS App Boundary Verification

**Status**: ✅ COMPLETED  
**Date**: 2026-03-06  
**Related ADR**: ADR-0003: POS App Boundary and Capacitor-Ready Architecture

## Objective

Verify and document that `apps/pos` is properly maintained as an independent app boundary, separate from Backoffice, as specified in ADR-0003 Follow-Up Action #1.

## Implementation Status

### ✅ Directory Structure

The monorepo correctly maintains POS as a separate application:

```
apps/
  ├── api/           # API server
  ├── backoffice/    # Admin ERP & reports
  └── pos/           # Offline-first cashier app ✓
```

### ✅ POS Package Identity

**Location**: `apps/pos/package.json`

- **Package name**: `@jurnapod/pos`
- **Type**: `module` (ESM)
- **Private**: `true` (monorepo workspace)
- **Build tool**: Vite (optimized for modern PWA)

**Key Scripts**:
- `dev`: Development server
- `build`: Production build
- `preview`: Preview production build
- `qa:e2e`: End-to-end tests with Playwright
- `qa:lhci`: Lighthouse CI for PWA quality
- `test`: Offline-first logic tests

### ✅ Independent Dependencies

POS has its own dependency manifest, independent of Backoffice:

**Core Dependencies**:
- `react` + `react-dom`: UI framework
- `dexie`: IndexedDB wrapper for offline storage
- `zod`: Schema validation (shared with API contract)

**Dev Dependencies**:
- `vite`: Build tool
- `@vitejs/plugin-react`: React support
- `@playwright/test`: E2E testing
- `lighthouse`: PWA quality audits
- `fake-indexeddb`: Testing offline storage
- `typescript`: Type safety

### ✅ Offline-First Architecture

POS implements local-first persistence as required by ADR-0003:

**Offline Module Structure** (`apps/pos/src/offline/`):
- `db.ts`: Dexie database schema and connection
- `outbox.ts`: Outbox pattern for pending sync
- `outbox-drainer.ts`: Outbox processing logic
- `outbox-leader.ts`: Multi-tab coordination
- `outbox-sender.ts`: Sync push transport
- `outbox-drain-scheduler.ts`: Automatic and manual sync scheduling
- `sales.ts`: Sale transaction creation
- `sync-pull.ts`: Master data pull from server
- `runtime.ts`: Runtime state management
- `auth-session.ts`: Authentication token storage
- `types.ts`: TypeScript contracts

### ✅ Cashier-Focused Entry Point

**Location**: `apps/pos/src/main.tsx`

The POS entry point is completely independent from Backoffice and implements:

1. **Authentication Flow**
   - Local credential login
   - Google OAuth integration
   - Token-based session management
   - Outlet access verification

2. **Cashier UI**
   - Product catalog with search
   - Shopping cart management
   - Checkout with payment methods
   - Sync status badge
   - Offline cache validation

3. **Sync Orchestration**
   - Manual sync pull (master data)
   - Manual sync push (transactions)
   - Automatic background sync
   - Multi-tab coordination via leader election

4. **Offline-First Operations**
   - All sales transactions write to IndexedDB first
   - Outbox queue for pending sync
   - Network status awareness
   - Cache validation before checkout

### ✅ PWA Configuration

**Manifest**: `apps/pos/public/manifest.webmanifest`  
**Service Worker**: `apps/pos/public/sw.js`  
**HTML Entry**: `apps/pos/index.html`

POS is configured as a Progressive Web App:
- Installable on mobile and desktop
- Works offline after initial cache
- Theme color and app icons configured

### ✅ Independent Build & Deploy

**Build Command**: `npm run build:pos`  
**Dev Command**: `npm run dev:pos`  
**Deploy Target**: `public_html/pos/`

POS can be built, tested, and deployed independently without affecting Backoffice.

### ✅ Quality Assurance

POS has independent QA workflows:

- **E2E Tests**: `npm run qa:pos:e2e`
- **Real Device Tests**: `npm run qa:pos:e2e:real`
- **Lighthouse CI**: `npm run qa:pos:lhci`
- **Full QA Suite**: `npm run qa:pos:full`

### ✅ Separation of Concerns

**POS Responsibilities** (as per ADR-0003):
- ✅ Cashier routes and screens
- ✅ POS shell/layout
- ✅ POS bootstrap
- ✅ POS-specific UI workflows
- ✅ Offline-first transaction handling
- ✅ Sync orchestration
- ✅ Local persistence management

**Backoffice Responsibilities** (separate):
- ❌ Setup and configuration (not in POS)
- ❌ Reports (not in POS)
- ❌ Accounting workflows (not in POS)
- ❌ Inventory administration (not in POS)
- ❌ User/company/outlet management (not in POS)

## Compliance with ADR-0003 Requirements

### ✅ Offline-First is Mandatory
- POS writes all transactions to IndexedDB before server sync
- Outbox queue handles pending transactions
- Cache validation prevents checkout when offline cache is missing

### ✅ POS Has Different UX Profile
- Transaction-focused interface
- Touch-friendly cart operations
- Speed-optimized checkout flow
- Real-time sync status display

### ✅ POS Needs Local Durability
- Transactions committed to IndexedDB first
- Outbox pattern ensures eventual consistency
- Multi-tab coordination prevents duplicate syncs

### ✅ Sync is Robust and Idempotent
- `client_tx_id` (UUID v4) ensures idempotency
- Outbox retry mechanism with status tracking
- Leader election prevents concurrent syncs

### ✅ Android Support Path is Clear
- Vite + React PWA foundation is Capacitor-compatible
- No tight coupling to browser APIs in business logic
- Service worker is support infrastructure, not source of truth

## Verification Checklist

- [x] POS is in its own `apps/pos` directory
- [x] POS has its own `package.json` with distinct dependencies
- [x] POS has independent build and deploy scripts
- [x] POS implements offline-first architecture
- [x] POS uses IndexedDB for local persistence
- [x] POS implements outbox pattern for sync
- [x] POS has idempotent sync via `client_tx_id`
- [x] POS is configured as a PWA
- [x] POS has independent QA workflows
- [x] POS does not depend on Backoffice code
- [x] Business logic is separated from UI in `offline/` module
- [x] Sync orchestration is outside UI components

## Recommendations for Next Steps

Following ADR-0003 Follow-Up Actions:

### ✅ Step 1: Keep `apps/pos` as independent app boundary
**Status**: COMPLETE - This document verifies compliance.

### 🔄 Step 2: Refactor POS internals toward port/adapter boundaries
**Status**: PARTIALLY COMPLETE - Current `offline/` module shows good separation, but can be improved:
- Consider extracting platform abstractions as defined in ADR-0003 Rule 2
- Move `offline/` logic into `packages/pos-core/` for better reusability
- Implement explicit port interfaces for storage, network, and sync transport

### 🔄 Step 3: Keep local persistence behind repository abstractions
**Status**: PARTIALLY COMPLETE - IndexedDB is accessed through `db.ts`, but could be more abstract:
- Consider implementing `PosStoragePort` interface as shown in ADR-0003
- Separate Dexie implementation from business logic

### ✅ Step 4: Keep sync orchestration outside UI components
**Status**: COMPLETE - Sync logic is in `offline/` module, not in React components.

### 📋 Step 5: Introduce device/network/printing abstractions
**Status**: NOT STARTED - Required before native integration:
- Implement `NetworkPort` for online/offline detection
- Implement `PrinterPort` for receipt printing
- Implement `SyncTransport` interface

### 📋 Step 6: Revisit Capacitor installation when Android delivery becomes near-term
**Status**: NOT STARTED - Deferred per ADR-0003 guidance.

## Conclusion

**Step 1 of ADR-0003 is COMPLETE and VERIFIED.**

The POS app is properly maintained as an independent application boundary with:
- Clear separation from Backoffice
- Offline-first architecture
- Local-first persistence
- Idempotent sync mechanism
- Independent build and deployment
- PWA foundation ready for future Capacitor adoption

The current implementation successfully isolates POS concerns and provides a solid foundation for the remaining ADR-0003 follow-up actions.

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-06  
**Next Review**: When Step 2 (port/adapter refactoring) begins
