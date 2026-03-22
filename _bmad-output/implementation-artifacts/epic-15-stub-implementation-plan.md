# Epic 15: Stub Route Implementation Plan

**Goal:** Implement business logic for all 25+ stub routes created in Epic 14's Hono migration

**Duration:** 6 weeks (5 sprints)  
**Risk Level:** HIGH (financial systems involved)  
**Dependencies:** Epic 14 (Hono migration) completed

---

## SPRINT OVERVIEW

| Sprint | Duration | Focus | Risk | Stories |
|--------|----------|-------|------|---------|
| **1** | 2 days | Auth Routes (Foundation) | 🟡 MEDIUM | 3 stories |
| **2** | 3 days | Sync Infrastructure | 🟡 MEDIUM | 3 stories |
| **3** | 3 days | Core Entity Reads | 🟢 LOW | 3 stories |
| **4** | 5 days | Sales Transactions | 🔴 HIGH | 3 stories |
| **5** | 4 days | Complex Flows | 🟢 LOW | 3 stories |

**Total:** 17 days, 15 stories, 25+ route implementations

---

## SPRINT 1: AUTH ROUTES MIGRATION
**Duration:** 2 days  
**Goal:** Migrate authentication foundation with 100% test coverage  
**Risk:** MEDIUM - Affects all authenticated routes

### Story 15.1.1: Login Route Migration
**Effort:** 4 hours  
**Priority:** P0 - Blocks all authenticated access

#### Implementation Details
- **Legacy:** `apps/api/app/api/auth/login/route.ts` (183 lines)
- **Target:** `apps/api/src/routes/auth.ts` (POST /auth/login)
- **Complexity:** High - throttling, audit logging, token issuance

#### Tasks
- [ ] Analyze legacy login implementation (throttling, audit, tokens)
- [ ] Implement Zod validation schema for login request
- [ ] Migrate IP + email based throttling logic
- [ ] Implement audit logging for SUCCESS/FAIL outcomes
- [ ] Add access token + refresh token cookie handling
- [ ] Write 10+ unit tests covering all code paths
- [ ] Write integration tests for full request cycle

#### Acceptance Criteria
- [ ] AC-1: Hono handler matches legacy behavior exactly
- [ ] AC-2: Request validation rejects invalid payloads (400)
- [ ] AC-3: Throttling increases delays after failed attempts
- [ ] AC-4: Audit logs created for all outcomes
- [ ] AC-5: Response includes access_token and Set-Cookie header
- [ ] AC-6: Unit tests achieve ≥90% coverage
- [ ] AC-7: Integration tests pass against running server
- [ ] AC-8: Database pool cleanup hook present

#### Files Modified
- `apps/api/src/routes/auth.ts` - Replace login stub
- `apps/api/src/routes/auth.test.ts` - Create comprehensive tests

---

### Story 15.1.2: Logout Route Migration
**Effort:** 2 hours  
**Priority:** P0 - Security requirement

#### Implementation Details
- **Legacy:** `apps/api/app/api/auth/logout/route.ts` (24 lines)
- **Target:** `apps/api/src/routes/auth.ts` (POST /auth/logout)
- **Complexity:** Low - token revocation, cookie clearing

#### Tasks
- [ ] Analyze legacy logout implementation
- [ ] Implement token revocation (best effort, non-blocking)
- [ ] Add refresh token cookie clearing
- [ ] Write 5+ unit tests covering edge cases

#### Acceptance Criteria
- [ ] AC-1: Hono handler revokes token if present
- [ ] AC-2: Always clears refresh token cookie
- [ ] AC-3: Returns success even if no token (idempotent)
- [ ] AC-4: All unit tests pass
- [ ] AC-5: Database pool cleanup hook present

#### Files Modified
- `apps/api/src/routes/auth.ts` - Add logout handler
- `apps/api/src/routes/auth.test.ts` - Add logout tests

---

### Story 15.1.3: Refresh Route Migration
**Effort:** 3 hours  
**Priority:** P0 - Token management

#### Implementation Details
- **Legacy:** `apps/api/app/api/auth/refresh/route.ts` (83 lines)
- **Target:** `apps/api/src/routes/auth.ts` (POST /auth/refresh)
- **Complexity:** Medium - token rotation, error handling

#### Tasks
- [ ] Analyze legacy refresh implementation
- [ ] Implement token rotation logic
- [ ] Handle invalid/expired tokens (401 + clear cookie)
- [ ] Write 8+ unit tests for all scenarios

#### Acceptance Criteria
- [ ] AC-1: Hono handler rotates tokens correctly
- [ ] AC-2: Returns new access_token and rotated refresh token
- [ ] AC-3: Invalid tokens return 401 with cookie cleared
- [ ] AC-4: All error cases clear the cookie
- [ ] AC-5: All unit tests pass
- [ ] AC-6: Database pool cleanup hook present

#### Files Modified
- `apps/api/src/routes/auth.ts` - Add refresh handler
- `apps/api/src/routes/auth.test.ts` - Add refresh tests

### Sprint 1 Success Criteria
- [ ] All 3 auth routes migrated and tested
- [ ] 100% backward compatibility maintained
- [ ] Zero behavior changes from user perspective
- [ ] Test coverage ≥90% for all auth routes
- [ ] Migration patterns documented for future sprints

---

## SPRINT 2: SYNC INFRASTRUCTURE
**Duration:** 3 days  
**Goal:** Complete sync route migration for POS operations  
**Risk:** MEDIUM - Critical for POS functionality

### Story 15.2.1: Sync Health & Check-Duplicate Completion
**Effort:** 2 hours  
**Priority:** P1 - POS connectivity

#### Status
- Health route already partially implemented
- Check-duplicate route already partially implemented
- Need completion and testing

#### Tasks
- [ ] Verify `apps/api/src/routes/sync/health.ts` completeness
- [ ] Verify `apps/api/src/routes/sync/check-duplicate.ts` completeness
- [ ] Add comprehensive integration tests
- [ ] Document any remaining gaps

#### Acceptance Criteria
- [ ] AC-1: Health endpoint returns system status
- [ ] AC-2: Check-duplicate validates client_tx_id uniqueness
- [ ] AC-3: Integration tests cover all scenarios
- [ ] AC-4: Database pool cleanup hooks present

---

### Story 15.2.2: Sync Push Route Implementation
**Effort:** 8 hours  
**Priority:** P0 - Revenue flow from POS  
**Risk:** HIGH - Financial data, idempotency critical

#### Implementation Details
- **Target:** `apps/api/src/routes/sync/push.ts` (POST /sync/push)
- **Complexity:** HIGH - Batch processing, deduplication, partial failures

#### Tasks
- [ ] Analyze legacy push route implementation
- [ ] Implement batch transaction processing
- [ ] Add client_tx_id deduplication logic
- [ ] Handle partial batch failures atomically
- [ ] Write comprehensive tests (15+ cases)
- [ ] Add performance tests (1000+ transactions/batch)

#### Acceptance Criteria
- [ ] AC-1: Accepts batch of transactions from POS
- [ ] AC-2: Deduplicates based on client_tx_id
- [ ] AC-3: Returns per-transaction status (OK, DUPLICATE, ERROR)
- [ ] AC-4: Partial failures don't commit successful items
- [ ] AC-5: Audit trail for all sync operations
- [ ] AC-6: 100% test coverage for deduplication logic
- [ ] AC-7: Load test passes (1000+ transactions/batch)
- [ ] AC-8: Concurrency test passes (multiple POS devices)

#### Special QA Requirements
- Idempotency testing: Same payload 10x → 1 transaction created
- Stress testing: Handle peak POS sync loads
- Rollback testing: Verify atomic batch behavior

---

### Story 15.2.3: Sync Pull Route Implementation
**Effort:** 6 hours  
**Priority:** P1 - POS data synchronization

#### Implementation Details
- **Target:** `apps/api/src/routes/sync/pull.ts` (POST /sync/pull)
- **Complexity:** MEDIUM - Incremental sync, pagination

#### Tasks
- [ ] Analyze legacy pull route implementation
- [ ] Implement incremental sync (last_sync_timestamp)
- [ ] Add company/outlet scoping filters
- [ ] Add pagination support (limit/offset)
- [ ] Write 10+ unit tests

#### Acceptance Criteria
- [ ] AC-1: Returns transactions since provided timestamp
- [ ] AC-2: Respects company_id scoping
- [ ] AC-3: Respects outlet_id scoping where applicable
- [ ] AC-4: Supports pagination
- [ ] AC-5: All tests pass with ≥80% coverage
- [ ] AC-6: Database pool cleanup hook present

### Sprint 2 Success Criteria
- [ ] All sync routes fully functional
- [ ] POS sync operations work end-to-end
- [ ] Idempotency and deduplication verified
- [ ] Performance targets met

---

## SPRINT 3: CORE ENTITY READ OPERATIONS
**Duration:** 3 days  
**Goal:** Migrate read-only endpoints for foundational entities  
**Risk:** LOW - Read-only operations, safe to test

### Story 15.3.1: Accounts Routes
**Effort:** 3 hours  
**Priority:** P1 - Required for sales transactions

#### Routes
- GET /accounts - List accounts with filtering
- GET /accounts/:id - Single account details

#### Tasks
- [ ] List accounts with filtering (type, active status)
- [ ] Get single account details
- [ ] Ensure company-scoped queries only
- [ ] Write 6+ test cases

#### Acceptance Criteria
- [ ] AC-1: List returns filtered accounts for company
- [ ] AC-2: Get returns single account if authorized
- [ ] AC-3: Company scoping prevents data leakage
- [ ] AC-4: All tests pass

---

### Story 15.3.2: Items Routes
**Effort:** 3 hours  
**Priority:** P1 - Required for sales transactions

#### Routes
- GET /items - List items with filtering
- GET /items/:id - Single item with pricing

#### Tasks
- [ ] List items with filtering (category, active)
- [ ] Get single item with current pricing
- [ ] Ensure company-scoped queries
- [ ] Write 6+ test cases

#### Acceptance Criteria
- [ ] AC-1: List returns filtered items for company
- [ ] AC-2: Get returns item with pricing data
- [ ] AC-3: Company scoping enforced
- [ ] AC-4: All tests pass

---

### Story 15.3.3: Tax Rates & Roles Routes
**Effort:** 4 hours  
**Priority:** P2 - Supporting data

#### Routes
- GET /tax-rates - List with effective date filtering
- GET /roles - List with permission details

#### Tasks
- [ ] Tax rates: List with effective date filtering
- [ ] Roles: List with permission details
- [ ] Write 8+ combined test cases

#### Acceptance Criteria
- [ ] AC-1: Tax rates filtered by effective dates
- [ ] AC-2: Roles include permission details
- [ ] AC-3: Company scoping enforced
- [ ] AC-4: All tests pass

### Sprint 3 Success Criteria
- [ ] All core entity reads functional
- [ ] Company scoping verified across all routes
- [ ] Foundation ready for transaction operations

---

## SPRINT 4: SALES TRANSACTION LAYER ⚠️ CRITICAL
**Duration:** 5 days (extended for safety)  
**Goal:** Migrate sales operations with GL posting  
**Risk:** HIGH - Financial impact, audit requirements

### Sprint 4 Special Protocols
- **Shadow Mode:** Run Hono alongside legacy for 1 week
- **Financial Audit:** All operations tagged with migration marker
- **Rollback Plan:** Immediate fallback capability + data consistency check
- **Stakeholder Communication:** Business approval for extended timeline

### Story 15.4.1: Invoice Routes
**Effort:** 12 hours  
**Priority:** P0 - Core revenue flow  
**Risk:** CRITICAL - GL posting implications

#### Routes
- GET /sales/invoices - List with filtering
- POST /sales/invoices - Create with GL posting

#### Critical Requirements
- **Transaction Boundaries:** Invoice + Journal Lines atomic
- **GL Posting:** Verify debits = credits
- **Audit Trail:** All operations logged
- **Rollback Safety:** Feature flag for emergency rollback

#### Tasks
- [ ] Analyze legacy invoice routes thoroughly
- [ ] Implement GET with company scoping
- [ ] Implement POST with atomic GL posting
- [ ] Add comprehensive validation (15+ test cases)
- [ ] Add load testing (100 invoices/minute)
- [ ] Implement shadow mode comparison

#### Acceptance Criteria
- [ ] AC-1: POST creates invoice with valid GL journal
- [ ] AC-2: Failed posting rolls back invoice creation
- [ ] AC-3: Journal lines match invoice totals (debits = credits)
- [ ] AC-4: Company scoping enforced
- [ ] AC-5: All existing tests pass (no regression)
- [ ] AC-6: 15+ new tests for edge cases
- [ ] AC-7: Load test: 100 invoices/minute sustained
- [ ] AC-8: Shadow mode: outputs match legacy exactly

---

### Story 15.4.2: Order Routes
**Effort:** 10 hours  
**Priority:** P0 - POS integration

#### Routes
- GET /sales/orders - List with filtering
- POST /sales/orders - Create orders

#### Tasks
- [ ] Analyze legacy order routes
- [ ] Implement GET with filtering
- [ ] Implement POST with validation
- [ ] Add order state management
- [ ] Write comprehensive tests

#### Acceptance Criteria
- [ ] AC-1: Orders created with proper state
- [ ] AC-2: Integration with invoice conversion
- [ ] AC-3: Company scoping enforced
- [ ] AC-4: All tests pass

---

### Story 15.4.3: Payment Routes
**Effort:** 10 hours  
**Priority:** P0 - Financial completion

#### Routes
- GET /sales/payments - List with filtering
- POST /sales/payments - Process payments

#### Special Requirements
- Payment method validation
- Bank reconciliation implications
- Refund handling capability

#### Tasks
- [ ] Analyze legacy payment routes
- [ ] Implement payment processing
- [ ] Add payment method validation
- [ ] Handle refund scenarios
- [ ] Write comprehensive tests

#### Acceptance Criteria
- [ ] AC-1: Payments processed with GL posting
- [ ] AC-2: Payment methods validated
- [ ] AC-3: Refunds handled correctly
- [ ] AC-4: Bank reconciliation data preserved
- [ ] AC-5: All tests pass

### Sprint 4 Success Criteria
- [ ] All sales routes functional with GL posting
- [ ] Shadow mode validation completed
- [ ] No financial data integrity issues
- [ ] Rollback plan tested and ready

---

## SPRINT 5: COMPLEX FLOWS & REPORTING
**Duration:** 4 days  
**Goal:** Migrate remaining route groups  
**Risk:** LOW - Non-critical operations

### Story 15.5.1: Dine-In Routes
**Effort:** 12 hours  
**Priority:** P2 - Restaurant operations

#### Routes
- Tables, Sessions, Orders integration

#### Complexity
- Table state management (available, occupied, reserved)
- Session lifecycle (open → ordering → payment → closed)
- Integration with sales orders

#### Tasks
- [ ] Analyze dine-in workflow
- [ ] Implement table management
- [ ] Add session lifecycle
- [ ] Integrate with sales orders
- [ ] Write comprehensive tests

#### Acceptance Criteria
- [ ] AC-1: Table states managed correctly
- [ ] AC-2: Session lifecycle enforced
- [ ] AC-3: Integration with sales works
- [ ] AC-4: All tests pass

---

### Story 15.5.2: Report Routes
**Effort:** 10 hours  
**Priority:** P2 - Analytics and compliance

#### Routes
- GL reports, Trial Balance, P&L, Daily Sales

#### Requirements
- Date range filtering
- Aggregated calculations
- Export formats (JSON, CSV)

#### Tasks
- [ ] Analyze legacy report generation
- [ ] Implement date range filtering
- [ ] Add aggregation logic
- [ ] Support multiple export formats
- [ ] Write report accuracy tests

#### Acceptance Criteria
- [ ] AC-1: Reports generate accurate data
- [ ] AC-2: Date filtering works correctly
- [ ] AC-3: Export formats supported
- [ ] AC-4: Performance acceptable for large datasets

---

### Story 15.5.3: Journal Routes
**Effort:** 8 hours  
**Priority:** P1 - GL operations

#### Routes
- GET /journals - List journal entries
- POST /journals - Manual journal entries

#### Requirements
- Batch posting operations
- Void/correction workflows

#### Tasks
- [ ] Analyze journal operations
- [ ] Implement batch posting
- [ ] Add void/correction logic
- [ ] Write comprehensive tests

#### Acceptance Criteria
- [ ] AC-1: Journal entries created correctly
- [ ] AC-2: Batch operations atomic
- [ ] AC-3: Void/correction workflows work
- [ ] AC-4: All tests pass

### Sprint 5 Success Criteria
- [ ] All remaining routes functional
- [ ] Complex workflows operational
- [ ] Epic 15 complete

---

## IMPLEMENTATION PATTERNS

### Standard Hono Route Template
```typescript
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const route = new Hono();

// Validation schema
const RequestSchema = z.object({
  // ... fields
});

route.post(
  "/",
  zValidator("json", RequestSchema),
  async (c) => {
    const data = c.req.valid("json");
    // ... handler logic
    return c.json({ success: true, data: result });
  }
);
```

### Error Handling Pattern
- Use `HTTPException` from `hono/http-exception`
- Always return `{ success: false, error: { code, message } }` format
- Log errors but don't expose internals

### Legacy to Hono Conversion
```typescript
// BEFORE (Next.js)
export async function POST(request: Request) {
  const payload = await request.json();
  return Response.json({ success: true, data: {...} });
}

// AFTER (Hono)
route.post("/", async (c) => {
  const payload = await c.req.json();
  return c.json({ success: true, data: {...} });
});
```

### Key Replacements
- `request.json()` → `c.req.json()`
- `request.headers.get()` → `c.req.header()`
- `Response.json()` → `c.json()`
- Cookie setting: `c.header('Set-Cookie', value)`

---

## TESTING REQUIREMENTS

### Per-Sprint Testing Standards
- **Unit Tests:** ≥80% coverage (≥90% for auth/sync)
- **Integration Tests:** Full request/response cycle
- **Database Cleanup:** `closeDbPool()` hook in every test file
- **Contract Tests:** Legacy vs Hono output comparison
- **Performance Tests:** Load testing for critical paths

### Test Template Structure
```typescript
import { test } from "node:test";
import { closeDbPool } from "@/lib/db";

test.describe('Route Handler', () => {
  test('success case', async () => {
    // Setup, Execute, Assert
  });
  
  test('error cases', async () => {
    // Test error paths
  });
});

// MANDATORY: Close pool after tests
test.after(async () => {
  await closeDbPool();
});
```

---

## RISK MITIGATION

### Sprint 4 (Sales) - Special Handling
- **Shadow Mode:** Parallel execution for 1 week
- **Output Comparison:** Same inputs → identical GL entries
- **Financial Audit Trail:** Migration markers on all operations
- **Rollback Plan:** Environment toggle + data consistency check

### General Rollback Strategy
- **Environment Variables:** `USE_HONO_ROUTES=true/false`
- **Feature Flags:** Per route group if needed
- **Monitoring:** Immediate alerts on errors/performance degradation
- **Fallback:** Automatic or manual switch to legacy routes

---

## SUCCESS METRICS

### Per-Sprint Metrics
- [ ] All acceptance criteria met
- [ ] Test coverage targets achieved
- [ ] No regression in existing functionality
- [ ] Performance benchmarks met
- [ ] Zero production incidents

### Epic 15 Success Criteria
- [ ] All 25+ stub routes implemented
- [ ] 100% backward compatibility maintained
- [ ] Financial integrity preserved
- [ ] POS sync operations functional
- [ ] Legacy routes can be safely removed

---

## TIMELINE & DEPENDENCIES

### Dependency Chain
```
SPRINT 1 (Auth) → Foundation for all authenticated routes
    ↓
SPRINT 2 (Sync) → POS operations depend on auth
    ↓
SPRINT 3 (Core) → Entity data needed for transactions
    ↓
SPRINT 4 (Sales) → Revenue operations depend on entities
    ↓
SPRINT 5 (Complex) → Advanced features depend on sales
```

### Timeline
- **Week 1:** Sprint 1 (Auth) - Foundation
- **Week 2:** Sprint 2 (Sync) - POS Operations  
- **Week 3:** Sprint 3 (Core) - Data Foundation
- **Week 4-5:** Sprint 4 (Sales) - Revenue (2 weeks for safety)
- **Week 6:** Sprint 5 (Complex) - Remaining

**Total Duration:** 6 weeks with safety buffers

---

## NEXT STEPS

1. **Review and Approve:** Stakeholder sign-off on plan and timeline
2. **Sprint 1 Kickoff:** Begin auth route migration
3. **Create Tracking:** GitHub issues for each story
4. **Setup Monitoring:** Alerts for migration progress and issues
5. **Communication Plan:** Regular updates to stakeholders

**Epic 15 is ready for execution!**