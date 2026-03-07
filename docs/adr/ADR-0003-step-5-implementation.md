# ADR-0003 Step 5 Implementation: Device/Network/Printing Abstractions

**Status**: ✅ COMPLETED  
**Date**: 2026-03-06  
**Related ADR**: ADR-0003: POS App Boundary and Capacitor-Ready Architecture

## Objective

Introduce device/network/printing abstractions before native integration work begins (ADR-0003 Follow-Up Action #5, Rule 2).

## Summary

Step 5 completes the platform abstraction layer by adding printer and device identity ports. Combined with the network abstraction from Step 2, POS now has all required platform abstractions for Capacitor adoption.

## Platform Abstractions Status

| Abstraction | Port Interface | Web Adapter | Status |
|-------------|----------------|-------------|--------|
| Storage | `PosStoragePort` | `WebStorageAdapter` | ✅ Step 2 |
| Network | `NetworkPort` | `WebNetworkAdapter` | ✅ Step 2 |
| Sync Transport | `SyncTransport` | `WebSyncTransportAdapter` | ✅ Step 2 |
| Printer | `PrinterPort` | `WebPrinterAdapter` | ✅ Step 5 |
| Device Identity | `DeviceIdentityPort` | `WebDeviceIdentityAdapter` | ✅ Step 5 |

**All platform-sensitive behaviors are now abstracted behind port interfaces.**

## Implementation Details

### 1. PrinterPort Interface

**File**: `apps/pos/src/ports/printer-port.ts`  
**Purpose**: Abstract receipt, invoice, and report printing across platforms.

#### Key Types

```typescript
export interface PrinterPort {
  printReceipt(input: PrintReceiptInput, options?: Partial<PrintOptions>): Promise<PrintResult>;
  printInvoice(input: PrintInvoiceInput, options?: Partial<PrintOptions>): Promise<PrintResult>;
  printReport(input: PrintReportInput, options?: Partial<PrintOptions>): Promise<PrintResult>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): Promise<PrinterCapabilities>;
}
```

#### Print Formats Supported

- **Receipt**: POS transaction receipts (80mm thermal or web print)
- **Invoice**: Formal billing documents (A4 format)
- **Report**: Tabular reports (landscape A4)

#### Output Modes

- `print`: Trigger native print dialog
- `pdf`: Generate PDF document
- `preview`: Show print preview without printing

#### Platform Flexibility

```typescript
// Web: Uses window.print() and HTML generation
const webPrinter = createWebPrinterAdapter();
await webPrinter.printReceipt(receiptData);

// Capacitor (future): Uses native printer or thermal printer plugin
const nativePrinter = createCapacitorPrinterAdapter();
await nativePrinter.printReceipt(receiptData);
```

### 2. WebPrinterAdapter Implementation

**File**: `apps/pos/src/platform/web/printer.ts`  
**Size**: ~480 lines  
**Purpose**: Implement printing using browser window.print() and HTML rendering.

#### Key Features

1. **HTML Receipt Generation**
   - 80mm thermal-style receipts
   - Monospace font for classic receipt look
   - Dashed borders and clean formatting
   - Mobile-friendly responsive design

2. **HTML Invoice Generation**
   - A4 format formal invoices
   - Company and customer information
   - Itemized billing table
   - Payment terms and notes

3. **HTML Report Generation**
   - Landscape A4 tables
   - Dynamic headers and rows
   - Summary sections
   - Date range filtering

4. **Print Dialog Handling**
   - Opens new window with formatted HTML
   - Triggers browser print dialog
   - Auto-closes after printing
   - Preview mode support

#### Example Usage

```typescript
const printer = new WebPrinterAdapter();

// Print receipt
const result = await printer.printReceipt({
  transaction_id: "TX-001",
  transaction_date: "2026-03-06T10:30:00",
  outlet_name: "Main Store",
  items: [
    { name: "Coffee", quantity: 2, unit_price: 25000, discount_amount: 0, line_total: 50000 }
  ],
  payments: [
    { method: "CASH", amount: 50000 }
  ],
  totals: {
    subtotal: 50000,
    discount_total: 0,
    tax_total: 0,
    grand_total: 50000,
    paid_total: 50000,
    change_total: 0
  }
});

if (result.success) {
  console.log("Receipt printed successfully");
}
```

### 3. DeviceIdentityPort Interface

**File**: `apps/pos/src/ports/device-identity-port.ts`  
**Purpose**: Abstract device identification and metadata across platforms.

#### Key Types

```typescript
export interface DeviceIdentityPort {
  getDeviceInfo(): Promise<DeviceInfo>;
  getDeviceId(): Promise<string>;
  setDeviceName(name: string): Promise<void>;
  getDeviceName(): Promise<string | null>;
  isRegistered(): Promise<boolean>;
  registerDevice(input): Promise<DeviceRegistration>;
}

export interface DeviceInfo {
  device_id: string;
  device_name?: string;
  platform: DevicePlatform; // 'web' | 'android' | 'ios' | 'desktop'
  os_name?: string;
  os_version?: string;
  app_version?: string;
  manufacturer?: string;
  model?: string;
  screen_width?: number;
  screen_height?: number;
  has_camera?: boolean;
  has_nfc?: boolean;
  has_biometric?: boolean;
}
```

#### Use Cases

- **Device Registration**: Register POS terminals with server
- **Audit Logging**: Track which device performed actions
- **License Management**: Limit activations per device
- **Feature Detection**: Enable/disable features based on capabilities
- **Analytics**: Track device types and platforms

### 4. WebDeviceIdentityAdapter Implementation

**File**: `apps/pos/src/platform/web/device-identity.ts`  
**Size**: ~180 lines  
**Purpose**: Implement device identification using browser fingerprinting.

#### Key Features

1. **Stable Device ID Generation**
   - Combines user agent, screen properties, timezone
   - Hashes fingerprint using SHA-256
   - Adds random UUID component
   - Persists in localStorage
   - Format: `web-{hash8}-{uuid8}`

2. **Device Metadata Collection**
   - OS detection from user agent
   - Browser detection
   - Screen dimensions
   - Camera availability (via MediaDevices API)
   - NFC support (NDEFReader API)
   - Biometric support (WebAuthn)

3. **Device Registration**
   - Local registration in localStorage
   - Tracks registration date and last seen
   - Associates device with outlet
   - User-friendly device naming

#### Example Usage

```typescript
const deviceIdentity = new WebDeviceIdentityAdapter();

// Get device info
const info = await deviceIdentity.getDeviceInfo();
console.log(info);
// {
//   device_id: "web-a1b2c3d4-e5f6g7h8",
//   platform: "web",
//   os_name: "Windows",
//   model: "Chrome",
//   screen_width: 1920,
//   screen_height: 1080,
//   has_camera: true,
//   has_nfc: false,
//   has_biometric: true
// }

// Register device
await deviceIdentity.registerDevice({
  device_name: "Cashier Station 1",
  outlet_id: 10
});
```

### 5. PrintService

**File**: `apps/pos/src/services/print-service.ts`  
**Purpose**: Orchestrate printing operations with data retrieval.

#### Key Methods

```typescript
export class PrintService {
  constructor(
    private printer: PrinterPort,
    private storage: PosStoragePort
  ) {}

  // Print receipt for a completed sale
  async printSaleReceipt(input: PrintSaleReceiptInput): Promise<PrintResult>

  // Check printer availability
  async isPrinterAvailable(): Promise<boolean>

  // Get printer capabilities
  async getPrinterCapabilities(): Promise<PrinterCapabilities>
}
```

#### High-Level Workflow

1. Service receives `sale_id`
2. Service retrieves sale, items, and payments from storage
3. Service formats data into print structure
4. Service calls printer port to print
5. Service returns result

**UI never deals with data retrieval or formatting logic.**

### 6. Bootstrap Integration

Updated `bootstrap/web.tsx` to include new adapters:

```typescript
export interface WebBootstrapContext {
  db: PosOfflineDb;
  runtime: RuntimeService;
  sync: SyncService;
  print: PrintService;  // ✅ NEW
}

export function createWebBootstrapContext(): WebBootstrapContext {
  const printerAdapter = createWebPrinterAdapter();  // ✅ NEW
  const deviceIdentityAdapter = createWebDeviceIdentityAdapter();  // ✅ NEW
  
  const print = new PrintService(printerAdapter, storageAdapter);  // ✅ NEW

  return { db, runtime, sync, print };
}
```

## Architecture Benefits

### 1. Platform Independence ✅

Business logic does NOT depend on:
- ❌ `window.print()`
- ❌ Browser HTML rendering
- ❌ `localStorage` for device ID
- ❌ `navigator.mediaDevices`
- ❌ Browser fingerprinting APIs

Business logic ONLY depends on:
- ✅ `PrinterPort` interface
- ✅ `DeviceIdentityPort` interface
- ✅ Domain print models (`PrintReceiptInput`, etc.)

### 2. Future Capacitor Support ✅

When Capacitor is needed, create native adapters:

```typescript
// Future: apps/pos/src/platform/capacitor/printer.ts
export class CapacitorPrinterAdapter implements PrinterPort {
  async printReceipt(input: PrintReceiptInput): Promise<PrintResult> {
    // Use @capacitor-community/bluetooth-printer
    // Or native Android/iOS print APIs
    // Or thermal printer plugins
  }
}

// Future: apps/pos/src/platform/capacitor/device-identity.ts
export class CapacitorDeviceIdentityAdapter implements DeviceIdentityPort {
  async getDeviceInfo(): Promise<DeviceInfo> {
    // Use @capacitor/device API
    const info = await Device.getInfo();
    const id = await Device.getId();
    return { device_id: id.identifier, ... };
  }
}
```

**No business logic changes required!**

### 3. Testability ✅

Services can be tested with mock ports:

```typescript
const mockPrinter: PrinterPort = {
  printReceipt: async () => ({ success: true, message: "Mock print" }),
  printInvoice: async () => ({ success: true }),
  printReport: async () => ({ success: true }),
  isAvailable: async () => true,
  getCapabilities: async () => ({ supports_thermal: false, ... })
};

const printService = new PrintService(mockPrinter, mockStorage);
const result = await printService.printSaleReceipt({ sale_id: "123", ... });
```

**No browser APIs, no window.print(), just pure logic.**

### 4. Feature Detection ✅

Device capabilities can be queried:

```typescript
const capabilities = await deviceIdentity.getDeviceInfo();

if (capabilities.has_camera) {
  // Enable barcode scanning
}

if (capabilities.has_nfc) {
  // Enable NFC payments
}

if (capabilities.has_biometric) {
  // Enable fingerprint login
}
```

### 5. Multi-Platform Printing ✅

Same print logic works across platforms:

```typescript
// Works on web (window.print)
await context.print.printSaleReceipt({ sale_id: "TX-001", ... });

// Will work on Android (native printer)
await context.print.printSaleReceipt({ sale_id: "TX-001", ... });

// Will work on iOS (AirPrint)
await context.print.printSaleReceipt({ sale_id: "TX-001", ... });
```

## Compliance with ADR-0003 Rule 2

### ✅ Platform-Sensitive Behaviors Abstracted

| Behavior | Port Interface | Status |
|----------|----------------|--------|
| Local storage/persistence | `PosStoragePort` | ✅ Step 2 |
| Network status | `NetworkPort` | ✅ Step 2 |
| Receipt printing | `PrinterPort` | ✅ Step 5 |
| Device identity | `DeviceIdentityPort` | ✅ Step 5 |
| Sync transport | `SyncTransport` | ✅ Step 2 |

**All examples from ADR-0003 Rule 2 are now implemented.**

## File Structure

```
apps/pos/src/
├── ports/                         # ✅ 5 port interfaces
│   ├── storage-port.ts            # Step 2
│   ├── network-port.ts            # Step 2
│   ├── sync-transport.ts          # Step 2
│   ├── printer-port.ts            # ✅ NEW - Step 5
│   ├── device-identity-port.ts    # ✅ NEW - Step 5
│   └── index.ts
├── platform/web/                  # ✅ 5 web adapters
│   ├── storage.ts                 # Step 2
│   ├── network.ts                 # Step 2
│   ├── sync-transport.ts          # Step 2
│   ├── printer.ts                 # ✅ NEW - Step 5 (~480 lines)
│   ├── device-identity.ts         # ✅ NEW - Step 5 (~180 lines)
│   └── index.ts
├── services/                      # ✅ 6 business services
│   ├── runtime-service.ts         # Step 2
│   ├── sync-service.ts            # Step 2
│   ├── sync-orchestrator.ts       # Step 4
│   ├── outbox-service.ts          # Step 4
│   ├── print-service.ts           # ✅ NEW - Step 5
│   └── index.ts
└── bootstrap/
    └── web.tsx                    # ✅ UPDATED - Includes new services
```

## Implementation Metrics

| Metric | Value |
|--------|-------|
| New port interfaces | 2 |
| New web adapters | 2 |
| New services | 1 |
| Lines of code added | ~800 |
| TypeScript compilation | ✅ PASSING |
| Total ports | 5 |
| Total services | 6 |

## Verification Checklist

- [x] PrinterPort interface created
- [x] DeviceIdentityPort interface created
- [x] WebPrinterAdapter implemented
- [x] WebDeviceIdentityAdapter implemented
- [x] PrintService created
- [x] Bootstrap updated with new adapters
- [x] All ports exported from index
- [x] TypeScript compilation passes
- [x] No business logic depends on browser APIs

## Future Capacitor Adapters

When Android/iOS support is needed:

### CapacitorPrinterAdapter
**Plugins to consider**:
- `@capacitor-community/bluetooth-printer` — Thermal printer support
- `@capacitor-community/print` — Native print dialog
- `@capacitor-community/pdf-generator` — Generate PDF receipts

### CapacitorDeviceIdentityAdapter
**Plugins to use**:
- `@capacitor/device` — Device info and UUID
- `@capacitor/app` — App version and build number
- Native device APIs for hardware capabilities

## Conclusion

**Step 5 of ADR-0003 is COMPLETE.**

All platform-sensitive behaviors are now abstracted:

- ✅ Storage (`PosStoragePort`)
- ✅ Network (`NetworkPort`)
- ✅ Sync transport (`SyncTransport`)
- ✅ Printer (`PrinterPort`)
- ✅ Device identity (`DeviceIdentityPort`)

The POS app now has complete platform abstraction for:
- Web/PWA (current)
- Capacitor/Android (ready)
- Capacitor/iOS (ready)
- Desktop (future)

**Capacitor adoption requires ZERO business logic changes.** Only need to:
1. Install Capacitor
2. Create native adapters
3. Update bootstrap

---

**Document Version**: 1.0  
**Last Updated**: 2026-03-06  
**New Ports**: 2 (PrinterPort, DeviceIdentityPort)  
**New Adapters**: 2 (WebPrinterAdapter, WebDeviceIdentityAdapter)  
**Lines of Code**: ~800
