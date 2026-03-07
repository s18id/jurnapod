# ADR-0003: POS App Boundary and Capacitor-Ready Architecture

- Status: Accepted
- Date: 2026-03-06
- Deciders: Jurnapod product and engineering
- Tags: pos, architecture, offline-first, pwa, capacitor

## Context

Jurnapod is a modular ERP monorepo centered on Accounting/GL, with the following major app surfaces:

- `apps/api`
- `apps/backoffice`
- `apps/pos`

A design question emerged around whether POS should remain a separate app or be merged into Backoffice, especially given a future plan to ship an Android app using Capacitor.

This question changed materially once the requirement became explicit that POS must be **offline-first**.

An offline-first POS is not just another admin screen. It requires:

- local-first transaction persistence
- outbox queue management
- sync retry and recovery
- idempotent transaction submission
- online/offline awareness
- transaction durability across crashes/reloads
- potential future device and native integration

The repository direction already reflects this distinction:

- `apps/pos` is defined as an offline-first cashier app
- POS transactions are expected to be written locally first
- sync is expected to be idempotent using `client_tx_id`
- final POS transactions are append-only and corrected via `VOID` or `REFUND`

Because of these characteristics, POS has a different operational and technical profile from Backoffice.

## Decision

Jurnapod will keep **POS as a separate application boundary** from Backoffice.

The application layout remains:

```txt
apps/
  api/
  backoffice/
  pos/
```

In addition, POS will be implemented as a **PWA that is Capacitor-ready**, meaning:

- POS must run well as web/PWA first
- business logic must not depend directly on browser APIs
- platform capabilities must be abstracted behind ports/adapters
- local persistence and sync orchestration must be separated from UI
- Capacitor is not required on day one, but the architecture must make later adoption low-friction

## Decision Drivers

The main decision drivers are:

1. **Offline-first is mandatory**
   POS must continue operating even when connectivity is lost or unstable.

2. **POS has a different UX profile**
   POS is transaction-focused, touch-oriented, speed-sensitive, and operational. Backoffice is configuration-heavy, reporting-heavy, and desktop-oriented.

3. **POS needs local durability**
   Transactions must be committed locally before server sync.

4. **Sync must be robust and idempotent**
   Replays, retries, and reconnection scenarios must not create duplicate final records.

5. **Android support is likely**
   Capacitor support is easier and safer when POS is already isolated as its own app boundary.

6. **Future native/device integration is plausible**
   Printing, scanner integration, kiosk mode, or native bridges should not leak into Backoffice concerns.

## Options Considered

### Option A — Merge POS into Backoffice
Keep only:
- `apps/api`
- `apps/backoffice`

Implement POS as a module or route inside Backoffice.

#### Pros
- fewer top-level apps
- simpler superficial app inventory
- potentially shared routing and shell

#### Cons
- offline-first concerns leak into Backoffice
- POS UX risks becoming constrained by admin layout patterns
- browser/native integration concerns spread across a broader app surface
- testing and failure isolation become worse
- future Android packaging becomes less focused

### Option B — Keep POS as a separate app boundary
Keep:
- `apps/api`
- `apps/backoffice`
- `apps/pos`

#### Pros
- clear separation of concerns
- clean offline-first architecture
- easier sync hardening and testing
- safer path to Android via Capacitor
- device/native integration stays isolated
- POS UX can be optimized independently

#### Cons
- one more app surface to maintain
- requires discipline in sharing logic through packages instead of copy-paste

## Decision Outcome

Option B is accepted.

POS remains separate from Backoffice.

This is the best fit for an offline-first cashier product and provides the cleanest migration path toward Android packaging via Capacitor.

## Architectural Consequences

### POS remains its own app surface
`apps/pos` owns:

- cashier routes and screens
- POS shell/layout
- POS bootstrap
- POS-specific UI workflows
- platform wiring

### Backoffice remains focused on administrative concerns
`apps/backoffice` owns:

- setup and configuration
- reports
- accounting workflows
- inventory and operational administration
- user, company, and outlet management

### Shared logic must live in packages
Reusable logic should be shared through packages, not by merging app boundaries.

Likely shared layers include:

- contracts and schemas
- domain logic
- pricing and tax logic where truly cross-surface
- API client abstractions
- UI primitives and tokens
- auth/session abstractions where appropriate

## Capacitor-Ready Implementation Rules

POS should be designed to be compatible with later Capacitor adoption without needing large refactors.

### Rule 1 — Separate core from platform
Business logic must not directly depend on:

- `window`
- `document`
- `navigator`
- service worker APIs
- Capacitor plugins
- IndexedDB implementation details

### Rule 2 — Use ports and adapters
Platform-sensitive behavior must be abstracted.

Examples include:

- local storage/persistence
- network status
- receipt printing
- device identity
- sync transport

Example interfaces:

```ts
export interface PosStoragePort {
  saveDraft(tx: PosDraft): Promise<void>;
  saveCompleted(tx: CompletedTx): Promise<void>;
  listPendingSync(): Promise<CompletedTx[]>;
  markSynced(clientTxId: string): Promise<void>;
}
```

```ts
export interface NetworkPort {
  isOnline(): boolean;
  onStatusChange(cb: (online: boolean) => void): () => void;
}
```

```ts
export interface PrinterPort {
  printReceipt(input: ReceiptPrintInput): Promise<void>;
}
```

```ts
export interface SyncTransport {
  pull(input: PullRequest): Promise<PullResponse>;
  push(input: PushRequest): Promise<PushResponse>;
}
```

### Rule 3 — Keep sync orchestration outside UI
Sync flow must live in a dedicated service or package, not inside screen components.

Responsibilities include:

- reading pending outbox entries
- pushing transactions
- marking sent/failed
- retry policy
- backoff policy
- version/cursor management
- reconnection handling

### Rule 4 — Use local-first persistence
POS transactions must be written to local storage before any server sync attempt.

Local storage should contain, at minimum:

- completed transactions
- pending sync queue
- relevant master data cache
- sync metadata
- local snapshots required for historical consistency

### Rule 5 — Service worker is support infrastructure, not business truth
Service worker may handle:

- app shell caching
- static asset caching
- navigation fallback

It must not be the primary source of truth for POS transactional state.

### Rule 6 — Bootstrap by platform
POS should support platform-specific bootstrapping with shared app logic.

Example direction:

- `bootstrap/web.tsx`
- `bootstrap/capacitor.tsx` (future)

Each bootstrap composes the same app with different adapters.

## Recommended Package Boundaries

Suggested direction:

```txt
apps/pos/
  src/
    app/
    pages/
    components/
    features/
    bootstrap/
      web.tsx
    platform/
      web/
        network.ts
        printer.ts
        storage.ts
      index.ts

packages/
  pos-core/
    cart/
    checkout/
    pricing/
    receipts/
    shift/
    sync/
    ports/

  offline-db/
    dexie/

  sync-engine/

  device-bridge/
    contracts.ts
    web.ts
    capacitor.ts
```

This structure is illustrative. Exact filenames may evolve, but the boundaries should remain.

## Why Capacitor Is Not Required Immediately

Capacitor should not be installed merely as a symbolic step.

Immediate installation is not required if the team is still focused on:

- cashier flow validation
- sync reliability
- offline hardening
- core POS domain behavior

Capacitor becomes appropriate once one or more of the following become near-term priorities:

- Android packaging and internal distribution
- native printer integration
- scanner or hardware integration
- kiosk-style deployment
- native plugins or storage bridges
- real device QA workflows

The architecture should prepare for Capacitor from the start, but the dependency and native project setup can be deferred until justified.

## Consequences

### Positive
- offline-first concerns are isolated to the POS app
- Backoffice remains simpler and cleaner
- future Android packaging is lower risk
- testing of sync and persistence is more focused
- POS UX can be optimized independently
- device/native integration remains contained

### Negative
- an additional app surface must be maintained
- package boundaries must be enforced carefully
- shared logic needs intentional extraction

## Non-Goals

This ADR does not decide:

- exact Capacitor install timing
- exact Android plugin stack
- exact local database engine beyond the current local-first requirement
- exact routing library or frontend state management library

Those decisions can be taken later as implementation ADRs.

## Follow-Up Actions

1. Keep `apps/pos` as an independent app boundary.
2. Refactor POS internals toward port/adapter boundaries where needed.
3. Keep local persistence behind repository abstractions.
4. Keep sync orchestration outside UI components.
5. Introduce device/network/printing abstractions before native integration work begins.
6. Revisit Capacitor installation when Android delivery becomes near-term.

## References

- `README.md`
- `AGENTS.md`
- POS sync and offline-first conventions already established in the repository
