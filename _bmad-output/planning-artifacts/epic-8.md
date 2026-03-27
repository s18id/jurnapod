# Epic 8: Production Scale & POS Variant Sync

**Status:** COMPLETE (2026-03-28)  
**Stories:** 8/9 complete (8 completed + 1 deferred to Epic 9)  
**Note:** Story 8.4 (Redis Session Migration) was already deferred to Epic 9 at epic start  
**Deferred:** Story 8.10 (Load Testing) → Epic 9

---

**Goal:** Scale the import/export infrastructure for production workloads while delivering the Q3 2026 roadmap item: Variant-Level Sync for POS. This epic takes a hybrid approach — establishing performance foundations in Phase 1, then building product capabilities on top of that foundation in Phase 2.

**Theme:** Hybrid approach — Performance foundation + Variant capability

**Business Value:**
- Imports survive interruptions and can resume from checkpoints
- Export operations handle backpressure gracefully under heavy load
- Long-running operations provide persistent progress tracking
- POS users can select and manage product variants with independent pricing
- Variant stock levels are accurately tracked and synced across POS devices
- System performance is observable and tested under realistic load

**Success Metrics:**
- Import resume success rate >99% for interrupted imports
- Export memory usage remains <50MB even for 100K row datasets
- Test count: ≥1,300 (from current ~1,100)
- Variant sync coverage: 100% (prices, selection, stock, push)
- Load testing framework validates system under 2x expected peak load
- Performance monitoring provides alerting for all critical paths

---

## Epic 8 Action Items from Epic 7 Retrospective

These process improvements must be applied starting from Story 8.1:

| # | Action Item | Owner | Priority |
|---|-------------|-------|----------|
| 1 | Integration tests written alongside implementation — not after | All devs | P1 |
| 2 | Performance tests required for any performance-related story | Bob | P1 |
| 3 | Load testing validation must pass before marking stories complete | Quinn | P1 |
| 4 | Clear separation between "performance infrastructure" and "product features" | John (PM) | P2 |
| 5 | POS variant sync must include end-to-device testing on real hardware | Quinn | P2 |

---

## Phase 1: Production Performance (Sprint 1-2)

---

## Story 8.1: Import Resume/Checkpoint for Interrupted Imports

**Context:**

TD-013: The import framework processes data in batches, but if an import of 10,000 rows fails at row 8,000, the entire import must restart. This is unacceptable for production workloads where imports may take hours and failures should be recoverable.

Building on the session persistence work from Story 7.2 (MySQL-backed import sessions) and batch progress tracking from Story 7.3, we now implement full checkpoint/resume capability.

**Acceptance Criteria:**

**AC1: Checkpoint Tracking**
- After each successfully committed batch, record `last_successful_batch_number` and `rows_committed` in the import session row
- Checkpoint includes: batch number, row count, timestamp, and validation hash
- Validation hash ensures data integrity when resuming (detects file modification)

**AC2: Resume Capability**
- On import apply, check if session has existing checkpoints
- If resuming: skip already-committed batches, start from `last_successful_batch_number + 1`
- Resume only valid within session TTL window (30 minutes from last activity)
- Clear error message if resume window expired: "Import session expired. Please restart from beginning."

**AC3: Validation on Resume**
- Verify uploaded file hash matches checkpoint hash (detect file changes)
- If hash mismatch: reject resume, require fresh upload
- Log resume attempts at INFO level with checkpoint details

**AC4: Partial Failure Handling**
- When batch K fails: batches 1..K-1 remain committed, batch K..N not processed
- Return structured error with: `failed_at_batch`, `rows_committed`, `can_resume: true/false`
- Client can call apply again with same session ID to resume (if within TTL)

**AC5: Integration Tests**
- Test: Import 1000 rows, simulate failure at batch 5, verify batches 1-4 committed
- Test: Resume from checkpoint completes successfully
- Test: Hash mismatch detection rejects resume
- Test: Expired session cannot resume (returns 410 Gone)
- Test: Multiple resumes on same session work correctly

**Technical Notes:**
- Leverage `import_sessions` table from Story 7.2
- Add columns: `checkpoint_data` (JSON), `file_hash` (VARCHAR 64)
- Use SHA-256 hash of file buffer for integrity check
- Consider batch size tuning for optimal checkpoint frequency

**Dependencies:** Story 7.2 (MySQL session persistence), Story 7.3 (batch progress tracking)

**Estimated Effort:** 2 days
**Priority:** P0
**Risk Level:** Medium (modifies critical import flow)

---

## Story 8.2: Export Streaming Backpressure Handling

**Context:**

TD-014: The streaming export implementation yields data chunks as fast as the database provides them. Under heavy load or with slow HTTP consumers, this can cause memory buildup. While Node.js streams have some built-in buffering, explicit backpressure handling is needed for production reliability.

Building on the streaming export foundation from Story 7.5, we now add proper backpressure management.

**Acceptance Criteria:**

**AC1: Backpressure Detection**
- Monitor `writable.write()` return value when streaming to HTTP response
- When `write()` returns false, pause data generation until `'drain'` event
- Implement timeout for drain event (30 seconds) — error if consumer stalled

**AC2: Memory Limit Enforcement**
- Add configurable in-memory buffer limit (default: 10MB)
- When buffer exceeds limit: pause generation, wait for drain
- Log warning at WARN level when backpressure triggered

**AC3: Consumer Slow-Down Handling**
- If consumer consistently slower than producer for >60 seconds: throttle database query rate
- Implement query pacing: max 1000 rows/second when backpressure active
- Provide metrics: `backpressure_events_total`, `backpressure_duration_ms`

**AC4: Error Recovery**
- If consumer disconnects mid-stream: abort database query, release connection
- Log disconnection at INFO level with rows streamed count
- Ensure no connection pool exhaustion from aborted exports

**AC5: Performance Tests**
- Test: Export 100K rows with simulated slow consumer (100ms per chunk)
- Verify memory stays below 50MB throughout
- Verify no "Buffer overflow" errors
- Test: Consumer disconnection aborts cleanly within 5 seconds

**Technical Notes:**
- Modify `apps/api/src/lib/export/streaming.ts`
- Use `pipeline()` from `node:stream/promises` for proper cleanup
- Consider adding `highWaterMark` option to stream configuration
- Metrics should be compatible with existing OpenTelemetry setup

**Dependencies:** Story 7.5 (streaming export optimization)

**Estimated Effort:** 1.5 days
**Priority:** P1
**Risk Level:** Low (optimization enhancement)

---

## Story 8.3: Progress Persistence for Long-Running Operations

**Context:**

TD-015: Progress callbacks for import/export operations only exist in memory. If the server restarts during a large operation, progress is lost. For operations that may take 30+ minutes, users need persistent progress tracking that survives restarts.

This story implements progress persistence in the database, building on the session infrastructure from Story 7.2.

**Acceptance Criteria:**

**AC1: Progress Table Schema**
- Create `operation_progress` table: `operation_id`, `operation_type`, `company_id`, `total_units`, `completed_units`, `status`, `started_at`, `updated_at`, `details` (JSON)
- Index on `(company_id, operation_id)` and `(status, updated_at)` for cleanup
- Support multiple operation types: `import`, `export`, `batch_update`

**AC2: Progress Update API**
- Create `apps/api/src/lib/progress/progress-store.ts`
- Interface: `startProgress()`, `updateProgress()`, `getProgress()`, `completeProgress()`, `failProgress()`
- Updates write to database every 5 seconds (configurable) or on significant milestones (10%, 25%, 50%, 75%, 90%, 100%)

**AC3: Progress Query Endpoint**
- Add `GET /api/operations/:operationId/progress` endpoint
- Returns: `{ total, completed, percentage, status, eta_seconds, started_at, updated_at }`
- Support Server-Sent Events (SSE) for real-time progress updates
- Company-scoped: users can only query their own operations

**AC4: Progress Recovery on Restart**
- On API startup, scan for in-progress operations (`status = 'running'`)
- Mark stale operations (>2 hours without update) as `failed`
- Resume progress tracking for active operations

**AC5: Integration Tests**
- Test: Progress persists across simulated server restart
- Test: Progress query returns correct percentages
- Test: SSE stream receives updates in real-time
- Test: Stale operations marked as failed on startup
- Test: Company isolation — cannot query other company's progress

**Technical Notes:**
- Progress updates should be async (fire-and-forget) to avoid blocking operations
- Use connection pool for progress updates (don't block operation's connection)
- Consider Redis for progress if latency becomes issue (defer to Epic 9)

**Dependencies:** Story 7.2 (session persistence pattern)

**Estimated Effort:** 2 days
**Priority:** P1
**Risk Level:** Medium (new infrastructure component)

---

## Story 8.9: Performance Monitoring & Alerting

**Context:**

With production-scale operations coming online, we need observability into system performance. This story establishes metrics collection, dashboards, and alerting for the import/export and sync subsystems.

**Acceptance Criteria:**

**AC1: Metrics Collection**
- Add metrics for import operations:
  - `import_duration_seconds` (histogram by entity type, status)
  - `import_rows_total` (counter by entity type)
  - `import_batches_total` (counter by status: success, failed)
  - `import_resumes_total` (counter)
- Add metrics for export operations:
  - `export_duration_seconds` (histogram by format, status)
  - `export_rows_total` (counter by format)
  - `export_backpressure_events_total` (counter)
- Add metrics for sync operations:
  - `sync_push_duration_seconds` (histogram by entity type)
  - `sync_pull_duration_seconds` (histogram by entity type)
  - `sync_conflicts_total` (counter)

**AC2: Alerting Rules**
- Define alert thresholds in code (not just UI):
  - Import failure rate >5% for 5 minutes → P2 alert
  - Export average duration >30 seconds for 10 minutes → P2 alert
  - Sync conflict rate >1% for 5 minutes → P1 alert
  - Backpressure events >10/minute → P2 alert
  - Memory usage >500MB → P1 alert
- Alerts sent to configured webhook (Slack/PagerDuty compatible)

**AC3: Health Check Endpoint Enhancement**
- Extend `/health` endpoint with subsystem status:
  - Database connection pool status
  - Import queue depth (if applicable)
  - Export stream health
  - Sync queue health
- Return 503 if any critical subsystem unhealthy

**AC4: Performance Dashboard Specification**
- Document required dashboards (Grafana/DataDog):
  - Import/Export throughput and latency
  - Error rates by operation type
  - Resource utilization (memory, connections)
  - Sync queue depth and processing rate
- Provide PromQL/MetricsQL queries for each panel

**AC5: Log Correlation**
- Ensure all performance logs include:
  - `operation_id` (from progress tracking)
  - `company_id` (for tenant isolation debugging)
  - `duration_ms`
  - `rows_processed`
- Logs structured as JSON for log aggregation systems

**Technical Notes:**
- Build on existing OpenTelemetry setup from ADR-0008
- Use `prom-client` for metrics (already in dependencies)
- Store alert rules in `ops/alerts/` directory
- Dashboard specs in `ops/dashboards/` as JSON or Terraform

**Dependencies:** Story 8.3 (operation IDs for correlation)

**Estimated Effort:** 2 days
**Priority:** P1
**Risk Level:** Low (observability only)

---

## Story 8.10: Load Testing Framework for Import/Export

**Context:**

Before production deployment at scale, we need confidence the system can handle expected load. This story creates a load testing framework that validates import/export performance under realistic conditions.

**Acceptance Criteria:**

**AC1: Load Test Scenarios**
- Create `tests/load/` directory with k6 or Artillery test definitions
- Scenarios defined:
  - Import 10K, 50K, 100K row CSV files
  - Export 10K, 50K, 100K row datasets
  - Concurrent imports (5, 10, 20 simultaneous)
  - Concurrent exports (5, 10 simultaneous)
  - Mixed workload (imports + exports simultaneously)

**AC2: Performance Baselines**
- Define acceptable thresholds:
  - 10K import: <30 seconds
  - 50K import: <2 minutes
  - 100K import: <5 minutes
  - 10K export: <15 seconds
  - 50K export: <1 minute
  - 100K export: <3 minutes
  - Concurrent operations: no >2x latency degradation

**AC3: Resource Monitoring**
- During load tests, monitor and report:
  - Peak memory usage
  - Database connection utilization
  - HTTP response times (p50, p95, p99)
  - Error rate
- Fail test if any resource exceeds limits

**AC4: CI Integration**
- Add `npm run test:load` command
- Run load tests against staging environment (not production)
- Load tests run on schedule (weekly) or on-demand
- Results published to test report artifact

**AC5: Load Test Data Generation**
- Create utility to generate realistic test data:
  - Items with SKUs, prices, variants
  - Import CSV/Excel files of specified row count
  - Export filter combinations
- Test data should be deterministic (same seed = same data)

**Technical Notes:**
- Recommend k6 for HTTP-based load testing (good TypeScript support)
- Alternative: Artillery.io for simpler scenarios
- Staging environment must mirror production specs
- Consider using testcontainers for isolated database per load test

**Dependencies:** Story 8.1, 8.2, 8.3 (all performance infrastructure in place)

**Estimated Effort:** 2 days
**Priority:** P1
**Risk Level:** Low (testing infrastructure)

---

## Phase 2: POS Variant-Level Sync (Sprint 3-4)

---

## Story 8.5: Variant Price Sync Enhancement

**Context:**

The Q3 2026 roadmap requires Variant-Level Sync for POS — products with multiple variants (size, color, etc.) each having independent pricing. Building on the item-prices domain isolation from Epic 3, we extend sync to support variant-level prices.

**Acceptance Criteria:**

**AC1: Variant Price Schema**
- Extend `item_prices` table to support `variant_id` column (nullable, FK to `item_variants`)
- Migration must handle existing data (variant_id = NULL for base prices)
- Unique constraint: `(company_id, item_id, variant_id, outlet_id, effective_from)` — allows NULL variant_id
- Index on `(company_id, variant_id)` for variant price lookups

**AC2: Variant Price API**
- Extend price CRUD to include `variant_id` parameter
- `GET /api/items/:id/variants/:variantId/prices` — list variant-specific prices
- Price resolution priority: variant-specific > item-default > global-default
- Validation: variant must belong to item (company-scoped)

**AC3: Sync Schema Update**
- Extend sync pull/push contracts in `packages/shared/src/contracts/`
- Add `variantPrices` entity type to sync registry
- Sync record format: `{ itemId, variantId, outletId, price, effectiveFrom, effectiveTo }`
- Maintain backward compatibility (existing POS without variant support continues to work)

**AC4: Price Resolution Logic**
- Create `resolvePrice(itemId, variantId?, outletId?, date?)` function
- Resolution order:
  1. Variant-specific price for outlet (if variantId provided)
  2. Item-default price for outlet
  3. Global-default price
- Cache resolved prices for 60 seconds (configurable)

**AC5: Integration Tests**
- Test: Variant price overrides item price in POS
- Test: Missing variant price falls back to item price
- Test: Sync push/pull roundtrip preserves variant prices
- Test: Company isolation — variant prices don't leak
- Test: Effective date ranges work for variant prices

**Technical Notes:**
- Leverage existing item-prices domain from Epic 3
- Variant prices follow same validation rules as item prices
- Consider price matrix UI for managing multiple variant/outlet combinations

**Dependencies:** Epic 3 (item-prices domain isolation), Story 8.8 (for sync push)

**Estimated Effort:** 2 days
**Priority:** P0
**Risk Level:** Medium (schema change affecting POS)

---

## Story 8.6: Variant Selection in POS Cart

**Context:**

POS users need to select product variants (e.g., "Large Coffee" vs "Medium Coffee") and see the correct variant price in the cart. This story implements the UI/UX for variant selection.

**Acceptance Criteria:**

**AC1: Variant Data Model**
- Create `item_variants` table: `id`, `company_id`, `item_id`, `sku`, `name`, `attributes` (JSON), `is_active`
- Attributes store variant dimensions: `{ size: "Large", color: "Red" }`
- SKU must be unique per company (variant has its own SKU)
- Index on `(company_id, item_id)` and `(company_id, sku)`

**AC2: POS Cart Integration**
- When adding item to cart, if item has variants: show variant picker modal
- Variant picker displays: name, attributes, price (resolved), stock indicator
- Selected variant stored in cart line: `variant_id` field
- Cart displays variant name alongside item name

**AC3: Price Display**
- Cart line shows variant-specific price
- If variant has no specific price: show item default with visual indicator
- Price updates immediately when variant changed
- Discounts apply to variant price (not item default)

**AC4: API Endpoints**
- `GET /api/pos/items/:id/variants` — list variants for item (with current prices)
- `POST /api/pos/cart/line` — accepts optional `variant_id`
- Cart calculation uses variant price resolution from Story 8.5

**AC5: E2E Tests**
- Test: Add variant item to cart shows variant picker
- Test: Variant selection updates cart total correctly
- Test: Variant change in cart updates price
- Test: Checkout with variant item uses correct price
- Test: Receipt shows variant details

**Technical Notes:**
- POS offline mode: variants must sync to local IndexedDB
- Variant images: defer to future epic (use item image for now)
- Variant barcodes: SKU scanning should resolve to variant

**Dependencies:** Story 8.5 (variant price resolution)

**Estimated Effort:** 2.5 days
**Priority:** P0
**Risk Level:** Medium (user-facing feature)

---

## Story 8.7: Variant Stock Tracking in POS

**Context:**

Each product variant may have independent stock levels. This story implements variant-level inventory tracking that integrates with the POS cart and prevents overselling.

**Acceptance Criteria:**

**AC1: Variant Stock Schema**
- Extend `inventory` table to support `variant_id` column (nullable, FK to `item_variants`)
- Migration: existing inventory rows get variant_id = NULL (base item stock)
- Unique constraint: `(company_id, item_id, variant_id, outlet_id, warehouse_id?)`
- Index on `(company_id, variant_id, outlet_id)` for stock lookups

**AC2: Stock Management**
- Stock operations (receipt, adjustment, transfer) support optional `variant_id`
- If variant_id provided: affect variant stock only
- If variant_id null: affect base item stock (aggregated across variants)
- Stock levels displayed in backoffice by variant

**AC3: POS Stock Checking**
- When adding variant to cart: check variant-specific stock level
- If variant stock < quantity: show "Insufficient stock" warning
- Real-time stock indicator in variant picker (In Stock / Low Stock / Out of Stock)
- Configurable low stock threshold per variant

**AC4: Stock Reservation**
- Cart reservations reserve variant stock (not item stock)
- Reservation released on: checkout completion, cart abandonment (TTL), manual removal
- Conflict handling: if stock becomes unavailable during checkout, notify user

**AC5: Integration Tests**
- Test: Variant stock deducted correctly on sale
- Test: Variant stock check prevents overselling
- Test: Stock reservation works for variants
- Test: Variant stock sync to POS (pull)
- Test: Variant stock adjustment sync (push)

**Technical Notes:**
- Stock calculations must account for both variant and base item levels
- Consider aggregated stock view: item total = sum of variant stocks + base stock
- Offline POS: use last-known stock with warning if stale (>5 minutes)

**Dependencies:** Story 8.6 (variant data model), existing inventory system

**Estimated Effort:** 2 days
**Priority:** P1
**Risk Level:** Medium (affects inventory accuracy)

---

## Story 8.8: Variant Sync Push Support

**Context:**

POS devices must sync variant-related data (prices, stock) back to the server. This story extends the sync push protocol to handle variant-level updates.

**Acceptance Criteria:**

**AC1: Sync Schema Extension**
- Extend `SyncPushRequest` type in `packages/shared/src/contracts/sync.ts`
- Add `variantSales` array: `{ itemId, variantId, quantity, price, timestamp }`
- Add `variantStockAdjustments` array: `{ itemId, variantId, outletId, adjustment, reason }`
- Maintain backward compatibility: old POS without variants sends empty arrays

**AC2: Server-Side Processing**
- Extend sync push handler to process variant sales
- Variant sales update: variant stock levels, revenue reporting, COGS calculation
- Use variant price from sale record (don't re-resolve, preserve historical accuracy)
- Stock adjustments apply to variant level when variantId provided

**AC3: Conflict Resolution**
- If variant not found during sync: log warning, skip record, continue sync
- If variant price mismatch (>5%): flag for review, accept sale with actual price
- If variant stock negative after adjustment: accept but flag as oversell

**AC4: Sync Acknowledgment**
- Server acknowledges processed variant records
- Failed variant records returned in sync response with error code
- POS retries failed records on next sync
- Success clears records from local outbox

**AC5: Integration Tests**
- Test: Variant sale sync updates server stock correctly
- Test: Variant COGS calculation uses variant cost (if configured)
- Test: Conflict handling for deleted variants
- Test: Sync idempotency — same variant sale pushed twice = one transaction
- Test: Offline POS sync recovery after reconnection

**Technical Notes:**
- Variant sync follows same idempotency pattern as regular sync (`client_tx_id`)
- COGS for variants: if variant has no cost, fall back to item cost
- Consider batching variant records for efficiency

**Dependencies:** Story 8.5, 8.6, 8.7 (all variant infrastructure)

**Estimated Effort:** 2 days
**Priority:** P1
**Risk Level:** Medium (affects data consistency)

---

## Story 8.4 (Deferred): Redis Session Migration

**Context:**

Future scale requirements may need distributed session storage. MySQL sessions (Story 7.2) work for current scale but Redis would provide:
- Sub-millisecond session access (vs ~5ms for MySQL)
- Better horizontal scaling for session-heavy workloads
- Pub/sub for real-time progress updates

**Decision:** Defer to Epic 9. MySQL sessions meet current requirements. Redis adds infrastructure complexity that isn't justified yet.

**Trigger for Epic 9:**
- Import session volume exceeds 1000 active sessions sustained
- Session read/write becomes bottleneck in profiling
- Multi-region deployment requires session sharing

---

## Dependencies Map

```
Epic 7 Foundations
├── Story 7.2 (MySQL Sessions) ─────┬──> Story 8.1 (Import Resume)
│                                   ├──> Story 8.3 (Progress Persistence)
│                                   └──> Story 8.9 (Monitoring)
│
├── Story 7.3 (Batch Progress) ─────> Story 8.1 (Import Resume)
│
├── Story 7.5 (Streaming Export) ───> Story 8.2 (Backpressure)
│                                   └──> Story 8.10 (Load Testing)
│
└── Epic 3 (Item-Prices Domain) ────┬──> Story 8.5 (Variant Prices)
                                   ├──> Story 8.6 (Variant Selection)
                                   ├──> Story 8.7 (Variant Stock)
                                   └──> Story 8.8 (Variant Sync)

Story Dependencies Within Epic 8
├── Phase 1 (Sprint 1-2)
│   ├── Story 8.1, 8.2, 8.3 can run in parallel
│   ├── Story 8.9 depends on 8.3 (operation IDs)
│   └── Story 8.10 depends on 8.1, 8.2, 8.3
│
└── Phase 2 (Sprint 3-4)
    ├── Story 8.5 (Variant Prices) must complete first
    ├── Story 8.6 (Variant Selection) depends on 8.5
    ├── Story 8.7 (Variant Stock) depends on 8.6
    └── Story 8.8 (Variant Sync) depends on 8.5, 8.6, 8.7
```

---

## Timeline

### Sprint Breakdown (4 Sprints)

| Sprint | Stories | Focus | Effort |
|--------|---------|-------|--------|
| **Sprint 1** | 8.1, 8.2 | Import resume, Export backpressure | 3.5 days |
| **Sprint 2** | 8.3, 8.9, 8.10 | Progress persistence, Monitoring, Load testing | 6 days |
| **Sprint 3** | 8.5, 8.6 | Variant prices, Variant selection | 4.5 days |
| **Sprint 4** | 8.7, 8.8 | Variant stock, Variant sync push | 4 days |

**Total Estimated Effort:** ~18 days (~4 weeks)
**Buffer:** +20% = ~22 days (allowing for testing and integration)

### Milestones

| Milestone | Target | Criteria |
|-----------|--------|----------|
| M1: Production Performance | End Sprint 2 | All Phase 1 stories complete, load tests passing |
| M2: Variant Foundation | End Sprint 3 | Variant prices and selection working |
| M3: Full Variant Sync | End Sprint 4 | Complete variant sync end-to-end |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **R1: Resume logic creates duplicate rows** | Medium | High | Use unique constraints on SKU+company_id; implement idempotent upsert pattern; test with concurrent resumes |
| **R2: Variant schema changes break existing POS** | Low | Critical | Maintain backward compatibility; feature flag variant support; gradual rollout with canary testing |
| **R3: Backpressure handling hurts performance** | Medium | Medium | Make backpressure configurable; A/B test with/without; monitor latency percentiles |
| **R4: Load tests reveal performance issues** | Medium | High | Start load testing early (Sprint 2); buffer time for optimization; have scaling plan ready |
| **R5: Variant sync conflicts cause data inconsistency** | Medium | High | Implement comprehensive conflict resolution; audit log all conflicts; reconciliation report |
| **R6: Scope creep on variant features** | Medium | Medium | Strict AC definition; defer variant images, barcodes to Epic 9; time-box exploration |

### Fallback Plans

| Scenario | Fallback |
|----------|----------|
| Resume complexity exceeds estimate | Reduce to "restart from checkpoint" only (no mid-batch resume) |
| Variant sync too complex for Sprint 4 | Ship variant selection/pricing first; defer stock sync to Epic 9 |
| Load testing infrastructure delays | Use manual load testing with k6 CLI; defer CI integration |
| Performance issues in load tests | Optimize critical path; defer non-critical metrics from 8.9 |

---

## Success Metrics Verification

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Import resume success rate | >99% | Load test 1000 interrupted imports, measure successful resumes |
| Export memory usage | <50MB for 100K rows | Memory profiling during load tests |
| Test count | ≥1,300 | Run test suite, count total tests |
| Variant sync coverage | 100% | Code coverage report for variant-related files |
| Load test pass rate | 100% at 2x peak load | Load test results artifact |
| Alert response time | <5 minutes | Simulate alert condition, measure detection |

---

## Technical Debt Addressed in Epic 8

| TD ID | Description | Story | Priority |
|-------|-------------|-------|----------|
| TD-013 | No resume/checkpoint for interrupted imports | 8.1 | P4 → P0 |
| TD-014 | Export streaming lacks backpressure handling | 8.2 | P4 → P1 |
| TD-015 | No progress persistence for long-running operations | 8.3 | P4 → P1 |

**Note:** TD-013, TD-014, TD-015 were originally P4 (low priority). Epic 8 elevates them to P0/P1 based on production scale requirements.

---

## Files to Create/Modify

### New Files
- `apps/api/src/lib/progress/progress-store.ts` — Progress persistence service
- `apps/api/src/lib/progress/progress-store.test.ts` — Progress store tests
- `apps/api/src/routes/progress.ts` — Progress query endpoints
- `apps/api/src/lib/metrics/import-metrics.ts` — Import metrics collection
- `apps/api/src/lib/metrics/export-metrics.ts` — Export metrics collection
- `tests/load/import-load-test.js` — k6 load test scenarios
- `tests/load/export-load-test.js` — k6 load test scenarios
- `tests/load/data-generator.ts` — Test data generation utility
- `ops/alerts/alert-rules.yaml` — Alerting rule definitions
- `ops/dashboards/import-export.json` — Grafana dashboard spec
- `apps/api/src/lib/variants/` — Variant domain module
- `apps/api/src/routes/variants.ts` — Variant API routes
- Database migrations: `operation_progress`, `item_variants`, inventory/price variant columns

### Files to Modify
- `apps/api/src/lib/import/batch-processor.ts` — Add checkpoint logic
- `apps/api/src/lib/import/session-store.ts` — Add checkpoint columns
- `apps/api/src/lib/export/streaming.ts` — Add backpressure handling
- `apps/api/src/lib/export/streaming.test.ts` — Add backpressure tests
- `apps/api/src/routes/import.ts` — Add resume support
- `apps/api/src/routes/sync/push.ts` — Add variant sync handling
- `apps/api/src/routes/sync/pull.ts` — Add variant entity type
- `packages/shared/src/contracts/sync.ts` — Add variant sync types
- `apps/pos/src/components/cart/` — Add variant selection UI
- `apps/pos/src/components/item-picker/` — Add variant picker modal
- `apps/backoffice/src/components/items/` — Add variant management UI
- `docs/adr/TECHNICAL-DEBT.md` — Mark TD-013, TD-014, TD-015 as resolved

---

## Quality Gates

### Phase 1 Gates (Before Sprint 3)
- [ ] All Phase 1 stories complete with integration tests
- [ ] Load tests pass at 2x expected peak load
- [ ] Performance monitoring dashboards operational
- [ ] No P1 or P2 alerts firing in staging
- [ ] Import resume success rate >99% in load tests

### Phase 2 Gates (Before Epic Close)
- [ ] All Phase 2 stories complete with E2E tests
- [ ] Variant sync tested end-to-end on physical POS device
- [ ] Backward compatibility verified (old POS works)
- [ ] Test count ≥1,300 confirmed
- [ ] TD-013, TD-014, TD-015 marked resolved in registry

### Epic Close Checklist
- [ ] TD health check template run
- [ ] All success metrics verified
- [ ] Load test report published
- [ ] Performance baseline documented
- [ ] Handoff notes for operations team

---

## Related Documentation

- [TECHNICAL-DEBT.md](../../docs/adr/TECHNICAL-DEBT.md) — Full debt registry
- [ADR-0010: Import/Export Technical Debt](../../docs/adr/ADR-0010-import-export-technical-debt.md) — Source of TD-013, TD-014, TD-015
- [Epic 7 Specification](./epic-7.md) — Foundation stories this builds upon
- [Epic 3 Documentation](../../_bmad-output/implementation-artifacts/stories/epic-4/story-4.3-document-epic-3-product-enablement.md) — Item-prices domain isolation
- [Epic 7 Retrospective](../implementation-artifacts/epic-7-retro-2026-03-28.md) — Source of action items
- [Q3 2026 Roadmap](../../docs/roadmap/Q3-2026.md) — Variant-Level Sync requirement source

---

## Epic 9 Preview: Infrastructure Scale & Advanced Features

**Potential Stories:**
- Story 9.1: Redis Session Migration (deferred from 8.4)
- Story 9.2: Multi-Region Sync Architecture
- Story 9.3: Advanced Variant Features (images, barcodes, attributes)
- Story 9.4: Real-Time Inventory WebSocket Updates

**Trigger Conditions:**
- Session volume exceeds 1000 sustained
- Multi-region deployment required
- Variant adoption >50% of catalog

---

*Epic 8 planned via BMAD Analysis — Ahmad, John (PM), Winston (Architect), Bob (SM), Quinn (QA)*
*Document generated: 2026-03-28*
*Target Start: Sprint following Epic 7 completion*

(End of file)
