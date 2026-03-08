# POS Service Mode Workflow - Planning Documents

**Status:** Design Complete, Ready for Implementation  
**Date:** 2026-03-08

---

## Overview

This directory contains comprehensive planning documentation for the POS service mode workflow redesign. The goal is to implement a clear, safe, and intuitive workflow for both takeaway and dine-in operations, aligned with ADR-0005 and ADR-0006 principles.

---

## Key Documents

### 1. [Implementation Plan](./pos-service-mode-workflow-implementation.md)
**Primary planning document** covering the complete workflow redesign.

**Contents:**
- Architecture principles and objectives
- Service mode landing page design
- Takeaway and dine-in flow specifications
- Data models and persistence strategy
- Implementation phases (1-5)
- Success metrics and rollout strategy

**Key Decisions:**
- ✅ All orders persist to offline DB (offline-first safety)
- ✅ Takeaway: ephemeral by policy; Dine-in: durable operational state
- ✅ Money as integer minor units (no floats)
- ✅ Numeric IDs for all entities (matches runtime)
- ✅ ~90% of features already implemented

**Status:** Complete ✅

---

### 2. [Navigation Guards Specification](./pos-navigation-guards-spec.md)
Detailed specification for route guards and confirmation modals.

**Contents:**
- Guard triggers and conditions
- Service switch scenarios (Takeaway ↔ Dine-in)
- Outlet switch and logout guards
- Modal component specifications
- Edge case handling
- Accessibility requirements

**Key Features:**
- Route change confirmation (save/discard/cancel)
- Service type switch with table selector
- Table release on logout/outlet switch
- Browser navigation guard (beforeunload)

**Status:** Complete ✅

---

### 3. [Schema Extensions Specification](./pos-schema-extensions-spec.md)
Database schema analysis and extension requirements.

**Contents:**
- Current schema status (version 9)
- Table structure verification
- Optional extensions (source_flow, settlement_flow)
- Item cancellations audit trail (deferred)
- Migration strategy
- Data integrity constraints

**Key Findings:**
- ✅ All required tables exist (outlet_tables, reservations, active_orders, active_order_lines)
- ✅ No schema changes needed for MVP
- ⏸️ Optional extensions deferred to Phase 5

**Status:** Complete ✅

---

### 4. [Sync Contracts Specification](./pos-sync-contracts-spec.md)
Sync pull/push contract extensions for tables and reservations.

**Contents:**
- Current sync architecture baseline
- Pull contract extension (tables, reservations)
- Push contract status (already sufficient)
- Idempotency guarantees
- Conflict resolution strategies
- Error handling and retry logic

**Key Findings:**
- ✅ Push sync already supports service context (no changes)
- ✅ Pull sync needs tables/reservations extension (minimal)
- ✅ Conflict resolution: server wins, preserve local orders
- ⏸️ Active order snapshots push deferred (not needed)

**Status:** Complete ✅

---

### 5. [Active Order Sync Specification](./pos-active-order-sync-spec.md)
Detailed design for syncing open dine-in snapshots and immutable update history across terminals.

**Contents:**
- Durable snapshot + update-log model
- Local and server schema extensions
- Push/pull contract extensions
- Optimistic merge conflict policy with stale-edit warnings
- Idempotency and rollout/testing requirements

**Key Decisions:**
- ✅ Use optimistic merge + stale-edit warning (no hard lock in MVP)
- ✅ Keep finalized sale sync path unchanged (`client_tx_id`)
- ✅ Add immutable `order_updates` stream with idempotent `update_id`

**Status:** Draft ✅

---

## Implementation Checklist

### Design Phase ✅ COMPLETE
- [x] Implementation plan with phases
- [x] Navigation guards specification
- [x] Schema extensions specification
- [x] Sync contracts specification
- [x] Current implementation audit
- [x] Gap analysis and missing features

### Build Phase 🔨 READY TO START
- [ ] Implement service mode landing page (`/service-mode` route)
- [ ] Implement navigation guard hook and modals
- [ ] Extend sync-pull.ts with tables/reservations ingestion
- [ ] Add route guards to ProductsPage, Router, OutletSwitcher
- [ ] Implement cancel items UI with reason capture
- [ ] Add validation rules for dine-in table requirement
- [ ] Create comprehensive test suite (unit/integration/E2E)

### Rollout Phase 🚀 PENDING
- [ ] Server-side sync pull endpoint extension
- [ ] Feature flag configuration per outlet
- [ ] Pilot outlet selection and monitoring
- [ ] Success metrics dashboard
- [ ] Rollback plan validation

---

## Key Decisions Summary

### Persistence Strategy
**Decision:** All orders persist to offline DB for recovery safety  
**Rationale:** Offline-first principle, prevents data loss  
**Policy:** Takeaway = ephemeral (auto-close); Dine-in = durable (explicit close)

### Money Type
**Decision:** Integer minor units only (no REAL/DOUBLE)  
**Rationale:** Prevents floating-point drift, aligns with accounting invariants  
**Example:** Store 5500 for $55.00

### ID Types
**Decision:** Numeric IDs for all entities (table_id, outlet_id, etc.)  
**Rationale:** Matches existing runtime implementation  
**Consistency:** TypeScript `number`, SQL `INTEGER`

### Schema Changes
**Decision:** No schema changes required for MVP  
**Rationale:** Version 9 already has all required tables and fields  
**Extensions:** Optional source_flow/settlement_flow deferred to Phase 5

### Sync Strategy
**Decision:** Extend pull, keep push unchanged  
**Rationale:** Push already supports service context; pull needs tables/reservations  
**Idempotency:** Unchanged (data_version pull, client_tx_id push)

---

## Missing Features (To Implement)

### Critical (P0/P1)
1. **Service Mode Landing Page** - New `/service-mode` route with large touch buttons
2. **Route Change Guards** - Confirmation modals for unsaved work
3. **Service Switch Guards** - Takeaway ↔ Dine-in conversion with table selector
4. **Outlet Switch Enhancement** - Service-aware messaging and table release

### Important (P2)
5. **Cancel Items UI** - Explicit flow for reducing finalized quantities with reason
6. **Dine-in Validation** - Block product addition without table selection
7. **Sync Pull Extension** - Tables and reservations ingestion logic

### Nice-to-Have (P3)
8. **Source/Settlement Flow Fields** - ADR-0006 alignment (deferred Phase 5)
9. **Item Cancellations Audit** - Separate table with full history (deferred Phase 5)

---

## Existing Features (Already Implemented)

### Active Order Persistence ✅
- `upsertActiveOrderSnapshot` (Router.tsx:508)
- `resolveActiveOrder` (runtime-service.ts:749)
- Auto-hydration on app load (Router.tsx:650)

### Table Management ✅
- Full CRUD and status management (runtime-service.ts:540-707)
- Table grid UI with status colors (TablesPage.tsx)
- Table transfer with validation (runtime-service.ts:932)

### Dine-In Lifecycle ✅
- Service type switching (ProductsPage.tsx:99)
- Table context display (ProductsPage.tsx:137)
- Finalize order flow (CartPage.tsx:206)
- Table release on completion (CheckoutPage.tsx:167)

### Reservation Management ✅
- Full lifecycle (ReservationsPage.tsx)
- Reservation-to-order conversion (ReservationsPage.tsx:244)
- Table assignment with status sync (runtime-service.ts:1216)

### Quantity Clamp Enforcement ✅
- `committed_qty` tracking (useCart.ts:27)
- Prevents reductions below finalized quantities (useCart.ts:103)

### Outlet Switching Guards ✅
- Confirmation modal (OutletContextSwitcher)
- Table release on switch (Router.tsx:321)

---

## Implementation Phases

### Phase 1: Foundation and Take-Away Flow
**Scope:** Service mode landing, route guards, takeaway workflow  
**Deliverables:** Working takeaway flow with guarded navigation  
**Duration:** ~1-2 weeks

### Phase 2: Dine-In Foundation
**Scope:** Verify existing table/reservation integration  
**Deliverables:** Confirm dine-in workflow aligns with plan  
**Duration:** ~3-5 days (mostly verification)

### Phase 3: Resume and Order Management
**Scope:** Verify committed_qty enforcement, add cancel items UI  
**Deliverables:** Full occupied table actions with audit trail  
**Duration:** ~1 week

### Phase 4: Table Operations
**Scope:** Verify existing table transfer and reservation flows  
**Deliverables:** Complete dine-in lifecycle documentation  
**Duration:** ~2-3 days (verification + docs)

### Phase 5: Polish and Edge Cases
**Scope:** Error handling, optional extensions, analytics  
**Deliverables:** Production-ready stability and audit readiness  
**Duration:** ~1 week

**Total Estimated Duration:** 4-6 weeks

---

## Testing Strategy

### Unit Tests
- Navigation guard hook behavior
- Service switch logic
- Quantity clamp validation
- Table status conflict resolution

### Integration Tests
- Takeaway flow end-to-end
- Dine-in walk-in flow end-to-end
- Resume order with quantity increases
- Cancel items with reason capture
- Outlet switch with active order

### E2E Tests
- Complete user journeys (login → service mode → order → payment → completion)
- Error scenarios (network failure, conflicts, validation errors)
- Multi-device scenarios (optional, deferred)

---

## Success Metrics

### Operational
- Error reduction: <1% wrong-outlet sales
- Order accuracy: <5% cancellations due to cashier error
- Table turnover: Track avg time open → checkout
- Snapshot finalization rate: >90% before payment

### User Experience
- Tap count: <8 for takeaway, <12 for dine-in
- Confusion events: <10 support tickets/month
- Navigation guard acceptance rate: Track save vs. discard

### Technical
- Sync success rate: >99%
- Offline resilience: 0 data loss during offline periods
- State consistency: 0 orphaned tables or duplicate orders

---

## Next Steps

1. **Review and approval** - Stakeholder sign-off on planning docs
2. **Implementation kickoff** - Assign tasks from implementation checklist
3. **Phase 1 execution** - Build service mode landing and navigation guards
4. **Incremental rollout** - Phase-by-phase deployment with pilot outlets
5. **Monitoring and iteration** - Track success metrics, adjust as needed

---

## Related Documents

- [ADR-0005](../adr/ADR-0005-pos-workflow-redesign-dine-in-reservations.md) - POS Workflow Redesign
- [ADR-0006](../adr/ADR-0006-pos-cashier-service-flows-and-order-lifecycle.md) - Order Lifecycle Model
- [AGENTS.md](../../apps/pos/AGENTS.md) - POS-specific agent guidelines

---

**Planning Status:** ✅ Complete and ready for implementation  
**Last Updated:** 2026-03-08
