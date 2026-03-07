# Platform Ports

This directory defines **port interfaces** for the POS application's hexagonal architecture.

## What are Ports?

Ports are **contracts** (TypeScript interfaces) that define how business logic interacts with external systems (storage, network, device capabilities, etc.) without depending on specific implementations.

### Benefits

1. **Platform Independence**: Business logic doesn't know if it's running on web, mobile, or desktop
2. **Testability**: Easy to mock ports for unit tests
3. **Flexibility**: Swap implementations without changing business logic
4. **Future-Proofing**: Add new platforms (Capacitor, Electron, React Native) without rewriting core logic

## Available Ports

### AppStatePort
**Purpose**: App lifecycle events (active, inactive, background)  
**File**: `app-state-port.ts`  
**Web Adapter**: `document.visibilitychange`  
**Mobile Adapter**: `@capacitor/app` plugin

```typescript
export interface AppStatePort {
  onActive(callback: () => void): () => void;
  onInactive(callback: () => void): () => void;
  onBackground(callback: () => void): () => void;
}
```

**Use Cases**:
- Trigger sync when app resumes
- Pause background tasks when app goes to background
- Save state before app is suspended

### NetworkPort
**Purpose**: Network connectivity detection and monitoring  
**File**: `network-port.ts`  
**Web Adapter**: `navigator.onLine`, `online`/`offline` events  
**Mobile Adapter**: `@capacitor/network` plugin (future)

```typescript
export interface NetworkPort {
  isOnline(): boolean;
  verifyConnectivity(options?: {...}): Promise<boolean>;
  onStatusChange(callback: (online: boolean) => void): () => void;
}
```

**Use Cases**:
- Show offline badge when network unavailable
- Defer sync requests when offline
- Auto-retry requests when network returns

### DeviceIdentityPort
**Purpose**: Device identification and metadata  
**File**: `device-identity-port.ts`  
**Web Adapter**: Browser fingerprinting + localStorage  
**Mobile Adapter**: `@capacitor/device` plugin (future)

```typescript
export interface DeviceIdentityPort {
  getDeviceInfo(): Promise<DeviceInfo>;
  getDeviceId(): Promise<string>;
  setDeviceName(name: string): Promise<void>;
  getDeviceName(): Promise<string | null>;
  isRegistered(): Promise<boolean>;
  registerDevice(input: {...}): Promise<DeviceRegistration>;
}
```

**Use Cases**:
- Generate stable device ID for sync deduplication
- Register POS terminals with server
- Track which device created transactions

### PrinterPort
**Purpose**: Receipt and invoice printing  
**File**: `printer-port.ts`  
**Web Adapter**: `window.print()` with HTML generation  
**Mobile Adapter**: Bluetooth/USB thermal printer plugin (future)

```typescript
export interface PrinterPort {
  printReceipt(input: PrintReceiptInput, options?: Partial<PrintOptions>): Promise<PrintResult>;
  printInvoice(input: PrintInvoiceInput, options?: Partial<PrintOptions>): Promise<PrintResult>;
  printReport(input: PrintReportInput, options?: Partial<PrintOptions>): Promise<PrintResult>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): Promise<{...}>;
}
```

**Use Cases**:
- Print receipts after sale completion
- Generate PDF invoices
- Print end-of-day reports

### PosStoragePort
**Purpose**: Offline data persistence  
**File**: `storage-port.ts`  
**Web Adapter**: IndexedDB via Dexie  
**Mobile Adapter**: IndexedDB or SQLite (future)

```typescript
export interface PosStoragePort {
  // Product catalog
  getProductsByOutlet(input: {...}): Promise<ProductCacheRow[]>;
  upsertProducts(products: ProductCacheRow[]): Promise<void>;
  
  // Sales transactions
  createSale(sale: SaleRow): Promise<void>;
  getSale(sale_id: string): Promise<SaleRow | undefined>;
  updateSaleStatus(sale_id: string, status: string, sync_status?: string): Promise<void>;
  
  // Outbox for sync
  createOutboxJob(job: OutboxJobRow): Promise<void>;
  listPendingOutboxJobs(limit?: number): Promise<OutboxJobRow[]>;
  updateOutboxJob(job_id: string, updates: Partial<OutboxJobRow>): Promise<void>;
  
  // ... more methods
}
```

**Use Cases**:
- Store sales transactions offline
- Cache product catalog for offline access
- Queue outbox jobs for background sync

### SyncTransport
**Purpose**: Communication with sync server  
**File**: `sync-transport.ts`  
**Web Adapter**: `fetch` API  
**Mobile Adapter**: Same (fetch) or native HTTP client (future)

```typescript
export interface SyncTransport {
  pull(request: SyncPullRequest, options?: {...}): Promise<SyncPullResponse>;
  push(request: SyncPushRequest, options?: {...}): Promise<SyncPushResponse>;
}
```

**Use Cases**:
- Pull product catalog from server
- Push completed transactions to server
- Sync configuration changes

## Design Principles

### 1. Platform-Agnostic
Ports must not reference platform-specific types or APIs:

```typescript
// ❌ BAD: Platform-specific type in port
export interface AppStatePort {
  onActive(callback: () => void): PluginListenerHandle; // Capacitor-specific!
}

// ✅ GOOD: Generic return type
export interface AppStatePort {
  onActive(callback: () => void): () => void; // Cleanup function
}
```

### 2. Async by Default
Methods that might need I/O should return `Promise`:

```typescript
// ✅ GOOD: Async for potential I/O
getDeviceId(): Promise<string>;

// ⚠️ OK: Sync if truly instant (cached value)
isOnline(): boolean;
```

### 3. Callback Cleanup
Event listeners must return cleanup functions:

```typescript
export interface NetworkPort {
  // Returns unsubscribe function
  onStatusChange(callback: (online: boolean) => void): () => void;
}
```

This allows React hooks to cleanup properly:
```typescript
useEffect(() => {
  const unsubscribe = networkPort.onStatusChange(callback);
  return unsubscribe; // Cleanup on unmount
}, [networkPort]);
```

### 4. Options Objects
Use options objects for optional/configurable parameters:

```typescript
// ✅ GOOD: Extensible options
verifyConnectivity(options?: {
  baseUrl?: string;
  healthcheckPath?: string;
  timeoutMs?: number;
}): Promise<boolean>;

// ❌ BAD: Positional optional params get messy
verifyConnectivity(
  baseUrl?: string,
  healthcheckPath?: string,
  timeoutMs?: number,
  retryCount?: number,
  ...
): Promise<boolean>;
```

## Adding a New Port

To add a new port interface:

1. **Create the port file**: `src/ports/<name>-port.ts`

2. **Define the interface**:
   ```typescript
   // Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
   // Ownership: Ahmad Faruk (Signal18 ID)
   
   /**
    * <Name>Port
    * 
    * Platform-agnostic interface for <functionality>.
    * Implementations may use <web approach>, <native approach>, etc.
    */
   
   export interface <Name>Port {
     // Methods here
   }
   ```

3. **Export from index.ts**:
   ```typescript
   export type { <Name>Port } from "./<name>-port.js";
   ```

4. **Implement web adapter**: `src/platform/web/<name>.ts`

5. **Wire into bootstrap**: Add to `WebBootstrapContext` in `src/bootstrap/web.tsx`

6. **Document usage**: Add examples to this README

## Testing Ports

Since ports are interfaces, you test them by:

1. **Testing adapter implementations**:
   ```typescript
   // Test web adapter
   import { createWebNetworkAdapter } from "../platform/web/network.js";
   
   const adapter = createWebNetworkAdapter();
   expect(adapter.isOnline()).toBe(navigator.onLine);
   ```

2. **Mocking ports in service tests**:
   ```typescript
   // Mock for testing services
   const mockStorage: PosStoragePort = {
     getProductsByOutlet: async () => [{ ... }],
     createSale: async () => { /* mock */ },
     // ... implement all methods
   };
   
   const service = new SomeService(mockStorage);
   await service.doSomething();
   ```

## Related Documentation

- [Platform Adapters README](../platform/README.md) - Concrete implementations
- [REFACTOR_PLAN.md](../../REFACTOR_PLAN.md) - Overall architecture plan
