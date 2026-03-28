# Epics Index

Central index for all Jurnapod epics.

---

## Epic List

Epics 1-14 (14 total, 13 completed, 1 planned)

---

## Epic 1: Kysely ORM Migration

Setup Kysely ORM infrastructure, migrate initial routes, and continue with complex financial and relational data patterns.

### Story 1.1: Kysely Setup and Type Generation
### Story 1.2: DbClient Integration
### Story 1.3: Tax Rates Route Migration
### Story 1.4: Roles Route Migration
### Story 1.5: Accounts Route Migration
### Story 1.6: ADR Update and Documentation
### Story 1.7: Journals Route Migration
### Story 1.8: Account Types Route Migration
### Story 1.9: Epic 1 Documentation

**Path:** [epic-1](../implementation-artifacts/stories/epic-1/epic-1.md)

---

## Epic 2: Sync Routes & POS Offline-First

Implement sync push/pull with layered architecture and offline-first guarantees.

### Story 2.1: Sync Push Layered Architecture
### Story 2.2: Sync Pull Layered Architecture
### Story 2.3: Sync Push Kysely Migration
### Story 2.4: Sync Pull Kysely Migration
### Story 2.5: Reports Routes Migration
### Story 2.6: TD-001 COGS Posting N+1 Fix
### Story 2.7: TD-002 COGS Calculation N+1 Fix
### Story 2.8: TD-003 Recipe Composition N+1 Fix
### Story 2.9: Epic 2 Documentation

**Path:** [epic-2](../implementation-artifacts/stories/epic-2/epic-2.md)

---

## Epic 3: Master Data Domain Extraction

Extract master data modules from monolith into focused domain modules.

### Story 3.1: Item Groups Domain Extraction
### Story 3.2: Items Domain Extraction
### Story 3.3: Item Prices Domain Extraction
### Story 3.4: Supplies Domain Extraction
### Story 3.5: Fixed Assets Domain Extraction
### Story 3.6: Sync Master Data Finalization

**Path:** [epic-3](../implementation-artifacts/stories/epic-3/epic-3.md)

---

## Epic 4: Technical Debt Cleanup & Process Improvement

Address retro action items and improve development processes.

### Story 4.1: Extract Shared Master Data Utilities
### Story 4.2: Backfill Fixed Assets Route Tests
### Story 4.3: Document Epic 3 Product Enablement
### Story 4.4: Update Story Template and Sync Checklist

**Path:** [epic-4](../implementation-artifacts/stories/epic-4/epic-4.md)

---

## Epic 5: Import/Export Infrastructure

Build reusable import/export frameworks with UI components.

### Story 5.1: Import Infrastructure Core
### Story 5.2: Export Infrastructure Core
### Story 5.3: Item Price Import UI
### Story 5.4: Item Price Export UI

**Path:** [epic-5](../implementation-artifacts/stories/epic-5/epic-5.md)

---

## Epic 6: Technical Debt Consolidation & Modernization

Address accumulated debt, extract monoliths, improve type safety.

### Story 6.1a: Invoice Types Extraction
### Story 6.1b: Payment Types Extraction
### Story 6.1c: Order Types Extraction
### Story 6.1d: Credit Note Extraction
### Story 6.1e: Shared Utilities Consolidation
### Story 6.2a: Service Sessions Types
### Story 6.2b: Service Sessions Lifecycle
### Story 6.2c: Service Sessions Lines
### Story 6.2d: Service Sessions Checkpoint
### Story 6.3: Type Safety Audit
### Story 6.4: Deprecation Cleanup
### Story 6.5a: Reservations Types
### Story 6.5b: Reservations CRUD
### Story 6.5c: Reservations Utils Availability
### Story 6.5d: Reservations Status
### Story 6.6: ADR Documentation
### Story 6.7: Epic 5 Follow-Up

**Path:** [epic-6](../implementation-artifacts/stories/epic-6/epic-6.md)

---

## Epic 7: Operational Hardening & Production Readiness

Production reliability improvements and comprehensive test coverage.

### Story 7.1: TDB Registry Fix Health Check Template
### Story 7.2: Import Session Persistence MySQL
### Story 7.3: Batch Failure Recovery Session Hardening
### Story 7.4: Fixed Assets Route Test Coverage
### Story 7.5: Streaming Parser Optimization
### Story 7.6: FK Validation Batch Optimization
### Story 7.7: Export Settings Route Test Coverage
### Story 7.8: Export Large Dataset Protection

**Path:** [epic-7](../implementation-artifacts/stories/epic-7/epic-7.md)

---

## Epic 8: Production Scale & POS Variant Sync

Scale improvements and POS variant synchronization capabilities.

### Story 8.1: Import Resume Checkpoint
### Story 8.2: Export Streaming Backpressure Handling
### Story 8.3: Progress Persistence
### Story 8.5: Variant Price Sync
### Story 8.6: Variant Selection POS
### Story 8.7: Variant Stock Tracking
### Story 8.8: Variant Sync Push
### Story 8.9: Performance Monitoring
### Story 8.10: Load Testing Framework (deferred)

**Path:** [epic-8](../implementation-artifacts/stories/epic-8/epic-8.md)

---

## Epic 9: Use Library Functions in Tests

Refactor tests to use library functions instead of direct SQL.

### Story 9.1: Audit Library Functions
### Story 9.2: Refactor Company Item Tests
### Story 9.3: Refactor Import Progress Tests
### Story 9.4: Refactor Variant Sync Tests
### Story 9.5: Refactor User Auth Tests
### Story 9.6: Refactor Route Tests
### Story 9.7: Batch Refactor Remaining
### Story 9.8: Add Missing Library Functions
### Story 9.9: Enforce Library Usage

**Path:** [epic-9](../implementation-artifacts/stories/epic-9/epic-9.md)

---

## Epic 10: Fix Critical Hardcoded ID Tests

Fix brittle tests using hardcoded IDs with dynamic fixture creation.

### Story 10.1: Add createOutletBasic
### Story 10.2: Refactor Variant Stock Tests
### Story 10.3: Refactor Services Stock Tests
### Story 10.4: Refactor Routes Stock Tests

**Path:** [epic-10](../implementation-artifacts/stories/epic-10/epic-10.md)

---

## Epic 11: Refactor Remaining Test Files

Replace direct INSERT statements with library functions.

### Story 11.1: Refactor Cost Tracking Tests
### Story 11.2: Refactor COGS Posting Tests
### Story 11.3: Refactor Users Auth Tests
### Story 11.4: Refactor Remaining Tests
### Story 11.5: Replace INSERT items with createItem()

**Path:** [epic-11](../implementation-artifacts/stories/epic-11/epic-11.md)

---

## Epic 12: Standardize Library Usage for All Routes

Establish library-first architecture by moving all database operations from routes to library modules.

### Story 12.1: Create lib/settings-modules.ts Library
### Story 12.2: Refactor settings-modules.ts Route
### Story 12.3: Create lib/sync/check-duplicate.ts Library
### Story 12.4: Refactor sync/check-duplicate.ts Route
### Story 12.5: Extend lib/export/ for Route Queries
### Story 12.6: Refactor export.ts Route
### Story 12.7: Epic 12 Documentation & ADR Update

**Path:** [epic-12](../implementation-artifacts/stories/epic-12/epic-12.md)

---

## Epic 13: Complete Library Migration for Deferred Routes

Finish Epic 12 deferred work - migrate import.ts, inventory.ts, and sync/pull.ts routes to use libraries.

### Story 13.1: Create lib/import/batch-operations.ts
### Story 13.2: Create lib/import/validation.ts
### Story 13.3: Refactor import.ts Route
### Story 13.4: Create lib/inventory/access-check.ts
### Story 13.5: Refactor inventory.ts Route
### Story 13.6: Analyze sync/pull.ts Architecture
### Story 13.7: Create lib/sync/pull/adapter.ts
### Story 13.8: Epic 13 Documentation

**Path:** [epic-13](../implementation-artifacts/stories/epic-13/epic-13.md)

---

## Epic 14: Kysely ORM Migration for Epic 13 Libraries

Migrate Epic 13 library modules from raw SQL to Kysely ORM.

### Story 14.1: Migrate import/validation.ts to Kysely
### Story 14.2: Migrate auth/permissions.ts to Kysely
### Story 14.3: Migrate import/batch-operations.ts - SELECT Operations
### Story 14.4: Migrate import/batch-operations.ts - WRITE Operations
### Story 14.5: Epic 14 Documentation

**Path:** [epic-14](./epic-14.md)

---

## Epic 15: Foundation Hardening & TD Resolution

Resolve TD-030 while hardening foundation with connection safety and test-fixture improvements.

### Story 15.1: Connection Guard for Library Template
### Story 15.2: test-fixtures Unique Naming
### Story 15.3: TD-030 Effective Date Filtering - Migration
### Story 15.4: Epic 15 Documentation + Epic 16 Planning
### Story 15.5: TD-031 Alert Retry Spike (if time permits)

**Path:** [epic-15](./epic-15.md)

---

## Epic 16: Alert System Hardening & Batch Processing

Address TD-031 (alert retry logic) and TD-032 (batch processing backfills).

### Story 16.1: Alert Retry with Exponential Backoff
### Story 16.2: Batch Processing for Backfills
### Story 16.3: Epic 16 Documentation

**Path:** [epic-16](./epic-16.md)

---

**Total: 16 epics | ~119 stories | 14 done, 2 planned**

_Last Updated: 2026-03-28_
