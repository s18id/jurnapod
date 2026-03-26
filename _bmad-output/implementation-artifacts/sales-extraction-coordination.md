# Sales Module Extraction Coordination

**Purpose:** Coordinate parallel extraction of sub-modules from sales.ts to prevent conflicts

**CRITICAL RULES:**
1. ALWAYS read this file before starting any work on sales.ts
2. ALWAYS update the lock table BEFORE making any changes
3. NEVER modify sales.ts without acquiring a lock first
4. If your sub-module depends on another, wait for that dependency first

**Lock Status:**
| Sub-module | Status | Agent | Started | Completed |
|------------|--------|-------|---------|-----------|
| invoices | completed | agent-6.1a | 2026-03-26 | 2026-03-26 |
| payments | completed | agent-6.1b | 2026-03-26 | 2026-03-26 |
| orders | completed | agent-6.1c | 2026-03-26 | 2026-03-26 |
| credit-notes | completed | agent-6.1d | 2026-03-26 | 2026-03-26 |
| shared-utils | completed | agent-6.1e | 2026-03-26 | 2026-03-26 |

**Current State (2026-03-26):**
- 6.1a (invoices): COMPLETED - files created in lib/invoices/
- 6.1b (payments): COMPLETED - files created in lib/payments/ and properly wired (index.ts exports from payment-service.ts, routes updated)
- 6.1d (credit-notes): COMPLETED - files created in lib/credit-notes/ and properly wired (sales.ts re-exports, routes updated)
- 6.1c (orders): COMPLETED - files created in lib/orders/ and properly wired (index.ts exports, routes updated)
- 6.1e (shared-utils): COMPLETED - shared utilities extracted to lib/shared/sales-utils.ts, sub-modules updated to use shared utilities, sales.ts became thin re-export layer

**File Locations:**
- `lib/invoices/` - Invoice extraction
- `lib/payments/` - Payment extraction
- `lib/orders/` - Order extraction  
- `lib/credit-notes/` - Credit note extraction

**sales.ts Rules:**
- Do NOT delete functions from sales.ts until Story 6.1e
- Only add re-export statements after creating sub-module files
- Always maintain backward compatibility

**Dependencies:**
- orders (6.1c) depends on invoices (6.1a)
- shared-utils (6.1e) depends on all others
- payments (6.1b) and credit-notes (6.1d) have NO dependencies - can parallel
