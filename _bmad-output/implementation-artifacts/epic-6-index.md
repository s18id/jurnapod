# Epic 6: Reporting - Sales Reports & Exports

**Status:** ✅ COMPLETE (Discovered - Already Existed)  
**Stories:** 3/3 Complete  
**Epic Type:** Business Intelligence  
**Dependencies:** Epic 1 (Auth), Epic 2 (POS Data), Epic 3 (Journal Data)

---

## 📋 STORIES

### ✅ Story 6.1: Sales Reports by Date Range
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Reports Library:** `apps/api/src/lib/reports.ts` (1,091 lines)
- **POS Transactions API:** `apps/api/app/api/reports/pos-transactions/route.ts`
- **Daily Sales API:** `apps/api/app/api/reports/daily-sales/route.ts`
- **POS Payments API:** `apps/api/app/api/reports/pos-payments/route.ts`
- **UI Component:** `apps/backoffice/src/features/reports-pages.tsx` (2,032 lines)

**Reports Available:**
1. **POS Transactions** - Transaction history with pagination
2. **Daily Sales** - Daily aggregation by outlet
3. **POS Payments** - Payment method summary
4. **Profit & Loss** - Income statement (LABA RUGI)
5. **Trial Balance** - Balance sheet summary
6. **General Ledger** - Account-level ledger
7. **Journals** - Journal batch listing
8. **Worksheet** - 10-column accounting worksheet
9. **Receivables Ageing** - AR analysis (current, 1-30, 31-60, 61-90, 90+)

**Features:**
- Date range filtering (from/to)
- Outlet scoping (single or all accessible)
- Role-based access control
- Consistent snapshot pagination (`as_of`, `as_of_id`)
- Fiscal year integration
- Cashier-only view restriction
- Trial balance validation (debits = credits)
- Stat tiles and summaries

**Key Files:**
```
apps/api/src/lib/reports.ts
apps/api/app/api/reports/pos-transactions/route.ts
apps/api/app/api/reports/daily-sales/route.ts
apps/backoffice/src/features/reports-pages.tsx
```

---

### ✅ Story 6.2: Export Reports for Accountants
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Scheduled Exports:** `packages/db/migrations/0107_phase3c_advanced_features.sql`
- **Export Scheduler:** `packages/backoffice-sync/src/scheduler/export-scheduler.ts` (340 lines)
- **Export APIs:**
  - `apps/api/app/api/backoffice/exports/scheduled/route.ts`
  - `apps/api/app/api/backoffice/exports/files/route.ts`
  - `apps/api/app/api/backoffice/exports/files/[id]/download/route.ts`
- **CSV Support:** Multiple reports support `?format=csv`
- **PDF Generator:** `apps/api/src/lib/pdf-generator.ts` (127 lines)

**Features:**
- **Scheduled Exports:**
  - DAILY, WEEKLY, MONTHLY, ONCE schedules
  - Formats: CSV, XLSX, JSON
  - Report types: SALES, FINANCIAL, INVENTORY, AUDIT, POS_TRANSACTIONS, JOURNAL
  - Delivery: EMAIL, DOWNLOAD, WEBHOOK
- **CSV Export:** Available on receivables-ageing and other reports
- **PDF Generation:** Used for invoices (extensible to reports)
- **Export Scheduler:** Full polling implementation with job queuing
- **Automatic date range calculation**

**Key Files:**
```
packages/backoffice-sync/src/scheduler/export-scheduler.ts
apps/api/app/api/backoffice/exports/scheduled/route.ts
apps/api/src/lib/pdf-generator.ts
packages/db/migrations/0107_phase3c_advanced_features.sql
```

---

### ✅ Story 6.3: POS Transaction History
**Status:** COMPLETE - DISCOVERED

**Implementation:**
- **Transaction API:** `apps/api/app/api/reports/pos-transactions/route.ts`
- **Reports Library:** `apps/api/src/lib/reports.ts` (listPosTransactions)
- **UI Page:** Part of `apps/backoffice/src/features/reports-pages.tsx`

**Features:**
- Transaction ID, status, date/time
- Gross total, paid total, item count
- Service type (TAKEAWAY, DINE_IN)
- Table and reservation linkage
- Client transaction ID for idempotency
- Pagination with consistent snapshot
- Status filtering (COMPLETED, VOID, REFUND)
- User filtering (cashier-only view)
- Status badges (green/red/orange)
- Date range picker
- Outlet selector
- Money formatting

**Key Files:**
```
apps/api/app/api/reports/pos-transactions/route.ts
apps/api/src/lib/reports.ts
apps/backoffice/src/features/reports-pages.tsx
```

---

## 📊 TECHNICAL SPECIFICATIONS

### Report Architecture
- **Consistent Snapshot:** `as_of`, `as_of_id` for pagination
- **Role-Based Access:** Different views for OWNER/ADMIN/CASHIER
- **Fiscal Year Integration:** Respects fiscal year boundaries
- **Outlet Scoping:** Company-level or outlet-specific

### Export System
- **Scheduling:** Cron-based with configurable intervals
- **Formats:** CSV, XLSX, JSON
- **Delivery:** Email, direct download, webhook
- **Retention:** Files stored with metadata

### Performance
- **Pagination:** Cursor-based for large datasets
- **Indexes:** Optimized for date range queries
- **Caching:** Consistent snapshot reads

### Database Views
```
v_pos_daily_totals
v_pos_transactions
v_journal_lines
v_trial_balance
```

---

## 🔗 DEPENDENCIES

**Requires:**
- Epic 1 (Auth) - Role-based access control
- Epic 2 (POS) - Transaction data
- Epic 3 (Accounting) - Journal data

**Used By:**
- Epic 7 (Sync) - Export scheduling improvements

---

## ✅ DEFINITION OF DONE

- [x] All 3 stories implemented
- [x] 9 report types operational
- [x] Date range filtering
- [x] Export functionality (CSV, scheduled)
- [x] POS transaction history
- [x] Role-based access
- [x] Pagination
- [x] PDF generation capability
- [x] UI components

---

**Epic 6 Status: COMPLETE ✅**  
**Full reporting system operational with 9 report types and export capabilities.**
