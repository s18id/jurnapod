# ADR-0003 Step 2 Implementation: Port/Adapter Architecture

**Status**: ✅ COMPLETED  
**Date**: 2026-03-06  
**Related ADR**: ADR-0003: POS App Boundary and Capacitor-Ready Architecture

## Objective

Refactor POS internals toward port/adapter boundaries to make the codebase Capacitor-ready without requiring large refactors later (ADR-0003 Follow-Up Action #2).

## Implementation Overview

This implementation introduces a **Ports and Adapters (Hexagonal) Architecture** to separate business logic from platform-specific implementations. This ensures POS can support multiple platforms (web, Capacitor/native) without rewriting core logic.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                     UI Layer (React)                     │
│                   apps/pos/src/main.tsx                  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  Bootstrap Layer                         │
│            apps/pos/src/bootstrap/web.tsx                │
│         (Platform-specific initialization)               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ Injects platform adapters
                       │
┌──────────────────────▼──────────────────────────────────┐
│               Business Logic Layer                       │
│              apps/pos/src/services/                      │
│        RuntimeService, SyncService (Platform-agnostic)   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ Depends on port interfaces
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   Port Interfaces                        │
│                apps/pos/src/ports/                       │
│   PosStoragePort, NetworkPort, SyncTransport             │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ Implemented by platform adapters
                       │
┌──────────────────────▼──────────────────────────────────┐
│                Platform Adapters                         │
│              apps/pos/src/platform/web/                  │
│   WebStorageAdapter, WebNetworkAdapter, etc.             │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                 Platform APIs                            │
│      Browser: IndexedDB, navigator, fetch                │
│      Future: Capacitor plugins, native APIs              │
└─────────────────────────────────────────────────────────┘
```

## Files Created

### 1. Port Interfaces (`apps/pos/src/ports/`)

Port interfaces define the contracts between business logic and platform implementations.

#### `storage-port.ts`
- **Interface**: `PosStoragePort`
- **Purpose**: Abstract local persistence operations
- **Operations**:
  - Product cache CRUD
  - Sale and sale items CRUD
  - Payment CRUD
  - Outbox queue management
  - Sync metadata management
  - Transaction support

**Key benefit**: Business logic doesn't depend on IndexedDB, Dexie, or any specific storage implementation.

#### `network-port.ts`
- **Interface**: `NetworkPort`
- **Purpose**: Abstract network connectivity detection
- **Operations**:
  - `isOnline()`: Check current network status
  - `onStatusChange()`: Subscribe to network status changes

**Key benefit**: Business logic doesn't depend on `navigator.onLine` or browser events.

#### `sync-transport.ts`
- **Interface**: `SyncTransport`
- **Purpose**: Abstract sync communication with server
- **Operations**:
  - `pull()`: Pull master data from server
  - `push()`: Push transactions to server
- **Types**: `SyncPullRequest`, `SyncPullResponse`, `SyncPushRequest`, `SyncPushResponse`

**Key benefit**: Business logic doesn't depend on `fetch` API or HTTP specifics.

#### `index.ts`
- Exports all port interfaces as a single module

### 2. Platform Adapters (`apps/pos/src/platform/web/`)

Platform adapters implement port interfaces using platform-specific APIs.

#### `storage.ts`
- **Class**: `WebStorageAdapter`
- **Implements**: `PosStoragePort`
- **Uses**: Dexie (IndexedDB wrapper)
- **Purpose**: Provide web storage implementation using IndexedDB

**Key features**:
- All storage operations go through the port interface
- Dexie is encapsulated within the adapter
- Future platforms can provide different implementations (e.g., SQLite for Capacitor)

#### `network.ts`
- **Class**: `WebNetworkAdapter`
- **Implements**: `NetworkPort`
- **Uses**: `navigator.onLine`, `window` events
- **Purpose**: Provide web network detection

**Key features**:
- Encapsulates browser-specific network detection
- Future platforms can detect network using native APIs

#### `sync-transport.ts`
- **Class**: `WebSyncTransportAdapter`
- **Implements**: `SyncTransport`
- **Uses**: `fetch` API
- **Purpose**: Provide web HTTP transport for sync

**Key features**:
- Encapsulates fetch API calls
- Future platforms can use native HTTP clients

#### `index.ts`
- Exports factory functions for creating web adapters

### 3. Business Logic Services (`apps/pos/src/services/`)

Services contain platform-agnostic business logic and depend only on port interfaces.

#### `runtime-service.ts`
- **Class**: `RuntimeService`
- **Dependencies**: `PosStoragePort`, `NetworkPort`
- **Purpose**: Platform-agnostic runtime state management

**Operations**:
- Checkout config resolution
- Payment method validation
- Outbox count queries
- Network status monitoring
- Product catalog retrieval
- Offline snapshot generation

**Key benefit**: No direct dependencies on `window`, `navigator`, `document`, or IndexedDB.

#### `sync-service.ts`
- **Class**: `SyncService`
- **Dependencies**: `PosStoragePort`, `SyncTransport`
- **Purpose**: Platform-agnostic sync orchestration

**Operations**:
- Pull master data from server
- Update local cache
- Manage sync metadata
- Retrieve sync config

**Key benefit**: No direct dependencies on `fetch` or browser APIs.

#### `index.ts`
- Exports all services and their types

### 4. Bootstrap Layer (`apps/pos/src/bootstrap/`)

Bootstrap layer wires platform adapters with business logic services.

#### `web.tsx`
- **Function**: `createWebBootstrapContext()`
- **Purpose**: Initialize POS with web platform adapters
- **Returns**: `WebBootstrapContext` containing database, runtime service, and sync service

**Responsibilities**:
1. Initialize database (Dexie)
2. Create platform adapters (web implementations)
3. Inject adapters into services
4. Register service worker
5. Render React app

**Key benefit**: Platform-specific initialization is isolated. Future `bootstrap/capacitor.tsx` can provide different adapters without changing business logic.

## Architecture Compliance with ADR-0003

### ✅ Rule 1 — Separate core from platform

Business logic (`services/`) does NOT directly depend on:
- ❌ `window` — abstracted by `NetworkPort`
- ❌ `document` — not used in business logic
- ❌ `navigator` — abstracted by `NetworkPort`
- ❌ service worker APIs — handled by bootstrap
- ❌ Capacitor plugins — not yet needed
- ❌ IndexedDB implementation details — abstracted by `PosStoragePort`

### ✅ Rule 2 — Use ports and adapters

Platform-sensitive behavior is abstracted:
- ✅ Local storage/persistence → `PosStoragePort`
- ✅ Network status → `NetworkPort`
- ✅ Sync transport → `SyncTransport`
- 🔄 Receipt printing → not yet needed (deferred to Step 5)
- 🔄 Device identity → not yet needed (deferred to Step 5)

### ✅ Rule 3 — Keep sync orchestration outside UI

Sync flow lives in `services/sync-service.ts`, not in React components.

### ✅ Rule 4 — Use local-first persistence

All persistence operations go through `PosStoragePort`, which enforces local-first patterns.

### ✅ Rule 6 — Bootstrap by platform

Platform-specific bootstrapping is in `bootstrap/web.tsx`. Future `bootstrap/capacitor.tsx` can provide different adapters.

## Migration Strategy

This implementation uses a **gradual migration** approach:

1. **Phase 1 (Completed)**: Create ports and adapters alongside existing code
2. **Phase 2 (Future)**: Gradually migrate UI components to use services instead of direct offline module calls
3. **Phase 3 (Future)**: When Capacitor is needed, create `bootstrap/capacitor.tsx` and platform-specific adapters

**Current state**: Port/adapter infrastructure is in place. Existing code in `apps/pos/src/offline/` and `apps/pos/src/main.tsx` continues to work. New code should prefer using services.

## File Structure Summary

```
apps/pos/src/
├── ports/                        # ✅ NEW - Port interfaces
│   ├── storage-port.ts           # PosStoragePort interface
│   ├── network-port.ts           # NetworkPort interface
│   ├── sync-transport.ts         # SyncTransport interface
│   └── index.ts                  # Port exports
├── platform/                     # ✅ NEW - Platform adapters
│   └── web/                      # Web platform implementations
│       ├── storage.ts            # WebStorageAdapter
│       ├── network.ts            # WebNetworkAdapter
│       ├── sync-transport.ts     # WebSyncTransportAdapter
│       └── index.ts              # Web adapter exports
├── services/                     # ✅ NEW - Business logic services
│   ├── runtime-service.ts        # RuntimeService (platform-agnostic)
│   ├── sync-service.ts           # SyncService (platform-agnostic)
│   └── index.ts                  # Service exports
├── bootstrap/                    # ✅ NEW - Platform bootstrapping
│   └── web.tsx                   # Web platform bootstrap
├── offline/                      # ✅ EXISTING - Current implementation
│   ├── db.ts                     # Dexie database schema
│   ├── runtime.ts                # Runtime utilities
│   ├── sync-pull.ts              # Sync pull logic
│   ├── outbox*.ts                # Outbox pattern
│   └── sales.ts                  # Sale operations
└── main.tsx                      # ✅ EXISTING - App entry point
```

## Testing and Verification

### ✅ TypeScript Compilation
```bash
npm run typecheck -w @jurnapod/pos
```
**Status**: ✅ PASSING

All port interfaces, adapters, and services are properly typed with no compilation errors.

### Code Quality Checklist
- [x] Port interfaces have clear documentation
- [x] Adapters implement all required port methods
- [x] Services have no direct platform dependencies
- [x] Bootstrap layer properly wires dependencies
- [x] TypeScript compilation passes with no errors
- [x] All new code follows copyright headers

## Benefits Achieved

### 1. Capacitor-Ready Architecture
- Adding Capacitor support now only requires:
  - Creating `bootstrap/capacitor.tsx`
  - Creating `platform/capacitor/` adapters
  - No changes to business logic

### 2. Improved Testability
- Services can be unit tested with mock ports
- No need to mock IndexedDB or browser APIs
- Test different platform behaviors independently

### 3. Clear Separation of Concerns
- Business logic is isolated from platform details
- Platform changes don't affect business logic
- Multiple platforms can coexist easily

### 4. Maintainability
- Port interfaces document platform requirements
- Platform-specific code is clearly isolated
- Easy to understand what each layer does

## Future Work

### Step 3: Keep local persistence behind repository abstractions
**Status**: ✅ ACHIEVED by this implementation

`PosStoragePort` provides the repository abstraction required by Step 3.

### Step 5: Introduce device/network/printing abstractions
**Status**: 🔄 PARTIALLY COMPLETE

- ✅ Network abstraction (`NetworkPort`)
- 🔄 Printing abstraction (deferred until needed)
- 🔄 Device identity abstraction (deferred until needed)

### Step 6: Capacitor installation
**Status**: 📋 DEFERRED

When Android delivery becomes near-term:
1. Install `@capacitor/core` and `@capacitor/cli`
2. Create `bootstrap/capacitor.tsx`
3. Create `platform/capacitor/` adapters
4. Test on real devices

## Conclusion

**Step 2 of ADR-0003 is COMPLETE.**

POS now has a **Capacitor-ready port/adapter architecture**:

- ✅ Business logic separated from platform
- ✅ Port interfaces defined for storage, network, and sync
- ✅ Web platform adapters implemented
- ✅ Bootstrap layer for platform-specific initialization
- ✅ TypeScript compilation passing
- ✅ Existing code continues to work

The architecture is now ready for future Capacitor adoption with minimal refactoring.

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-06  
**Next Review**: When Step 5 (printer/device abstractions) or Step 6 (Capacitor installation) begins
