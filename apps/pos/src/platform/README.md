# Platform Adapters

This directory contains platform-specific implementations of port interfaces defined in `src/ports/`.

## Architecture

The POS app uses **hexagonal architecture** (ports and adapters pattern) to isolate business logic from platform-specific code:

```
┌─────────────────────────────────────────┐
│         Business Logic / Services        │
│  (framework-agnostic, fully testable)   │
└──────────────┬──────────────────────────┘
               │ depends on
               ▼
┌─────────────────────────────────────────┐
│              Ports (interfaces)          │
│  AppStatePort, NetworkPort, etc.         │
└──────────────┬──────────────────────────┘
               │ implemented by
               ▼
┌─────────────────────────────────────────┐
│           Adapters (concrete)            │
│   web/      mobile/      (future)        │
└─────────────────────────────────────────┘
```

## Platform Directories

### `web/` - Web/PWA Platform

Adapters for browser-based deployment:
- **app-state.ts**: Uses `document.visibilitychange` for lifecycle events
- **network.ts**: Uses `navigator.onLine` and `online`/`offline` events
- **device-identity.ts**: Uses browser fingerprinting + localStorage
- **printer.ts**: Uses `window.print()` and HTML generation
- **storage.ts**: Uses IndexedDB via Dexie
- **sync-transport.ts**: Uses `fetch` API

### `mobile/` - Capacitor Platform (Future)

Adapters for native Android/iOS deployment:
- **app-state.ts**: Uses `@capacitor/app` plugin for native lifecycle
- **network.ts**: Uses `@capacitor/network` plugin (TODO)
- **device-identity.ts**: Uses `@capacitor/device` plugin (TODO)
- **printer.ts**: Uses Bluetooth/USB thermal printer plugin (TODO)
- **storage.ts**: Same as web (IndexedDB) or SQLite (TODO)
- **sync-transport.ts**: Same as web (`fetch`) (TODO)

## When to Use AppStatePort

### ✅ Use AppStatePort for:

1. **Pausing/resuming background tasks** when app becomes inactive/active
   ```typescript
   useAppState(context.appState, {
     onActive: () => {
       console.log('App resumed, refresh data');
       syncOrchestrator.resumeBackgroundSync();
     },
     onInactive: () => {
       console.log('App backgrounded, pause tasks');
       syncOrchestrator.pauseBackgroundSync();
     }
   });
   ```

2. **Triggering sync on app resume** (avoid stale data)
   ```typescript
   useAppState(context.appState, {
     onActive: () => {
       void runSyncPullNow();
     }
   });
   ```

3. **Saving state before app backgrounds**
   ```typescript
   useAppState(context.appState, {
     onBackground: () => {
       saveCartToDisk(cart);
     }
   });
   ```

### ❌ Do NOT use AppStatePort for:

1. **Regular polling intervals** - Use `setInterval` directly
   ```typescript
   // ✅ CORRECT: Polling is not tied to app lifecycle
   const intervalId = setInterval(refreshState, 1500);
   ```

2. **Network status detection** - Use `NetworkPort` instead
   ```typescript
   // ✅ CORRECT: Use dedicated port
   context.runtime.onNetworkStatusChange((online) => { ... });
   ```

3. **Keyboard events, clicks, etc.** - Use DOM events directly in UI
   ```typescript
   // ✅ CORRECT: UI event handling is fine in components
   document.addEventListener("keydown", handleEscape);
   ```

## Adding a New Platform

To add support for a new platform (e.g., Electron, React Native):

1. **Create platform directory**: `src/platform/<platform-name>/`

2. **Implement required adapters**:
   - Start with `app-state.ts`, `network.ts`, `storage.ts`
   - Use platform-specific APIs

3. **Create bootstrap file**: `src/bootstrap/<platform-name>.tsx`
   ```typescript
   import { create<Platform>AppStateAdapter } from "../platform/<platform-name>/app-state.js";
   // ... other imports
   
   export function create<Platform>BootstrapContext(config) {
     const appStateAdapter = create<Platform>AppStateAdapter();
     // ... compose services
   }
   ```

4. **Update main.tsx** to detect and use correct bootstrap
   ```typescript
   const bootstrap = isPlatformDetected() ? 
     create<Platform>BootstrapContext : 
     createWebBootstrapContext;
   ```

## Testing Adapters

Each adapter should be testable in isolation:

```typescript
// Example: Testing web app state adapter
import { createWebAppStateAdapter } from "./web/app-state.js";

const adapter = createWebAppStateAdapter();
let activeCount = 0;

const unsubscribe = adapter.onActive(() => {
  activeCount++;
});

// Simulate visibility change
Object.defineProperty(document, "visibilityState", { value: "visible" });
document.dispatchEvent(new Event("visibilitychange"));

console.assert(activeCount === 1, "Should trigger onActive callback");
unsubscribe();
```

## Best Practices

1. **Never import platform-specific code in business logic**
   - ❌ `import { App } from '@capacitor/app';` in services
   - ✅ Inject `AppStatePort` via bootstrap context

2. **Keep adapters thin**
   - Adapters should be simple wrappers around platform APIs
   - Business logic belongs in services, not adapters

3. **Provide fallbacks**
   - Mobile adapters should fallback to web implementations when native unavailable
   - See `platform/mobile/app-state.ts` for example

4. **Document platform requirements**
   - List required plugins/dependencies in adapter file comments
   - Note any platform-specific limitations

## Related Documentation

- [Ports README](../ports/README.md) - Port interface contracts
- [Bootstrap README](../bootstrap/README.md) - Bootstrap composition
- [REFACTOR_PLAN.md](../../REFACTOR_PLAN.md) - Overall refactor strategy
