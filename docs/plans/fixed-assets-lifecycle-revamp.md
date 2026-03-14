# Fixed Assets Lifecycle Revamp - Design Document

**Version:** 1.0  
**Status:** In Progress  
**Phase:** Design → Implementation  
**Recommendation:** Use Mantine UI library for backoffice components

---

## 1. Executive Summary

This document defines the architecture and implementation plan for extending the fixed-assets module from a simple depreciation system to a full accounting lifecycle system. The revamp treats GL journals as the financial source of truth, with fixed-asset tables providing operational projections and audit trails.

### Scope (v1 - This Release)
- ✅ Acquisition posting (capitalization)
- ✅ Depreciation (existing, enhanced)
- ✅ Transfer (outlet/cost-center)
- ✅ Impairment (write-down)
- ✅ Disposal (sale/scrap with gain/loss)
- ✅ Void/reversal flows
- ✅ Event timeline with journal linkage

### Out of Scope (Phase 2)
- Revaluation/surplus model

---

## 2. Data Model

### 2.1 Core Tables (Existing)

```sql
-- fixed_assets: registry of all assets
-- fixed_asset_categories: depreciation rules and account mappings
-- asset_depreciation_plans: depreciation schedule (existing)
-- asset_depreciation_runs: depreciation runs (existing)
```

### 2.2 New Tables

#### fixed_asset_events
Immutable event log for all lifecycle actions. Each event links to a journal batch for audit.

```sql
CREATE TABLE IF NOT EXISTS fixed_asset_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  asset_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(32) NOT NULL,  -- ACQUISITION, DEPRECIATION, TRANSFER, IMPAIRMENT, DISPOSAL, VOID
  event_date DATE NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  journal_batch_id BIGINT UNSIGNED DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'POSTED',  -- POSTED, VOIDED
  idempotency_key VARCHAR(64) NOT NULL,
  event_data JSON NOT NULL,  -- type-specific payload
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NOT NULL,
  voided_by BIGINT UNSIGNED DEFAULT NULL,
  voided_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fixed_asset_events_company_key (company_id, idempotency_key),
  KEY idx_fixed_asset_events_asset (asset_id),
  KEY idx_fixed_asset_events_company_date (company_id, event_date),
  KEY idx_fixed_asset_events_journal (journal_batch_id),
  CONSTRAINT fk_fixed_asset_events_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_fixed_asset_events_asset FOREIGN KEY (asset_id) REFERENCES fixed_assets(id),
  CONSTRAINT fk_fixed_asset_events_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_fixed_asset_events_journal FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id),
  CONSTRAINT chk_fixed_asset_events_type CHECK (event_type IN ('ACQUISITION', 'DEPRECIATION', 'TRANSFER', 'IMPAIRMENT', 'DISPOSAL', 'VOID'))
) ENGINE=InnoDB;
```

#### fixed_asset_books
Running book value per asset (updated after each event).

```sql
CREATE TABLE IF NOT EXISTS fixed_asset_books (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  asset_id BIGINT UNSIGNED NOT NULL,
  cost_basis DECIMAL(18,2) NOT NULL DEFAULT 0,
  accum_depreciation DECIMAL(18,2) NOT NULL DEFAULT 0,
  accum_impairment DECIMAL(18,2) NOT NULL DEFAULT 0,
  carrying_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  as_of_date DATE NOT NULL,
  last_event_id BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fixed_asset_books_asset (asset_id),
  CONSTRAINT fk_fixed_asset_books_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_fixed_asset_books_asset FOREIGN KEY (asset_id) REFERENCES fixed_assets(id),
  CONSTRAINT chk_fixed_asset_books_non_negative CHECK (cost_basis >= 0 AND accum_depreciation >= 0 AND accum_impairment >= 0 AND carrying_amount >= 0)
) ENGINE=InnoDB;
```

#### fixed_asset_disposals
Details for disposal events (proceeds, cost removed, gain/loss).

```sql
CREATE TABLE IF NOT EXISTS fixed_asset_disposals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  asset_id BIGINT UNSIGNED NOT NULL,
  proceeds DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_removed DECIMAL(18,2) NOT NULL DEFAULT 0,
  depr_removed DECIMAL(18,2) NOT NULL DEFAULT 0,
  impairment_removed DECIMAL(18,2) NOT NULL DEFAULT 0,
  disposal_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  gain_loss DECIMAL(18,2) NOT NULL,  -- positive = gain, negative = loss
  disposal_type VARCHAR(16) NOT NULL,  -- SALE, SCRAP
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fixed_asset_disposals_event (event_id),
  KEY idx_fixed_asset_disposals_asset (asset_id),
  CONSTRAINT fk_fixed_asset_disposals_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_fixed_asset_disposals_event FOREIGN KEY (event_id) REFERENCES fixed_asset_events(id),
  CONSTRAINT fk_fixed_asset_disposals_asset FOREIGN KEY (asset_id) REFERENCES fixed_assets(id),
  CONSTRAINT chk_fixed_asset_disposals_type CHECK (disposal_type IN ('SALE', 'SCRAP'))
) ENGINE=InnoDB;
```

---

## 3. API Contracts

### 3.1 Command Endpoints

All endpoints follow command-style pattern with idempotency.

#### POST /accounts/fixed-assets/:id/acquisition
Capitalize an asset (create journal entry).

```typescript
// Request
{
  outlet_id?: number;
  event_date: string;  // YYYY-MM-DD
  cost: number;  // DECIMAL(18,2)
  useful_life_months: number;
  salvage_value?: number;
  expense_account_id: number;
  accum_depr_account_id?: number;  // if repurposing existing
  notes?: string;
  idempotency_key?: string;  // auto-generated if omitted
}

// Response
{
  success: true,
  data: {
    event_id: number,
    journal_batch_id: number,
    book: { cost_basis, carrying_amount }
  }
}
```

#### POST /accounts/fixed-assets/:id/depreciation/run
Run depreciation for a period (enhanced from existing).

```typescript
// Request
{
  period_year: number;
  period_month: number;  // 1-12
  run_date?: string;  // defaults to end of period
  idempotency_key?: string;
}

// Response
{
  success: true,
  data: {
    event_id: number,
    journal_batch_id: number,
    amount: number,
    duplicate: boolean
  }
}
```

#### POST /accounts/fixed-assets/:id/transfer
Transfer asset between outlets/cost centers.

```typescript
// Request
{
  from_outlet_id: number;
  to_outlet_id: number;
  transfer_date: string;
  notes?: string;
  idempotency_key?: string;
}

// Response
{
  success: true,
  data: {
    event_id: number,
    journal_batch_id: number,  // zero-amount, for audit trail
    from_outlet: string,
    to_outlet: string
  }
}
```

#### POST /accounts/fixed-assets/:id/impairment
Write down asset value.

```typescript
// Request
{
  impairment_date: string;
  impairment_amount: number;  // amount to write down
  reason: string;
  expense_account_id: number;
  idempotency_key?: string;
}

// Response
{
  success: true,
  data: {
    event_id: number,
    journal_batch_id: number,
    book: { carrying_amount, accum_impairment }
  }
}
```

#### POST /accounts/fixed-assets/:id/disposal
Dispose asset (sale or scrap).

```typescript
// Request
{
  disposal_date: string;
  disposal_type: 'SALE' | 'SCRAP';
  proceeds?: number;  // required for SALE
  disposal_cost?: number;  // incidental costs
  cash_account_id: number;  // where proceeds go
  notes?: string;
  idempotency_key?: string;
}

// Response
{
  success: true,
  data: {
    event_id: number,
    journal_batch_id: number,
    disposal: {
      proceeds: number,
      cost_removed: number,
      gain_loss: number
    },
    book: { carrying_amount: 0 }
  }
}
```

#### POST /accounts/fixed-assets/events/:eventId/void
Void a posted event (creates reversal journal).

```typescript
// Request
{
  void_reason: string;
  idempotency_key?: string;
}

// Response
{
  success: true,
  data: {
    void_event_id: number,
    original_event_id: number,
    journal_batch_id: number
  }
}
```

### 3.2 Read Endpoints

#### GET /accounts/fixed-assets/:id/ledger
Event timeline with journal links.

```typescript
// Response
{
  success: true,
  data: {
    asset_id: number,
    events: [
      {
        id: number,
        event_type: string,
        event_date: string,
        journal_batch_id: number | null,
        status: string,
        event_data: object
      }
    ]
  }
}
```

#### GET /accounts/fixed-assets/:id/book
Current book value details.

```typescript
// Response
{
  success: true,
  data: {
    asset_id: number,
    cost_basis: number,
    accum_depreciation: number,
    accum_impairment: number,
    carrying_amount: number,
    as_of_date: string,
    last_event_id: number
  }
}
```

---

## 4. Posting Mappings

### 4.1 FA_ACQUISITION
| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | Fixed Asset (Balance Sheet) | Cost | - |
| 2 | AP / Cash / Clearing | - | Cost |

### 4.2 FA_DEPRECIATION (existing, enhanced)
| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | Depreciation Expense | Amount | - |
| 2 | Accumulated Depreciation | - | Amount |

### 4.3 FA_TRANSFER
Zero-amount journal for audit trail:
| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | Fixed Asset (from outlet) | 0 | 0 |

*(Outlet field updated directly; journal links audit trail)*

### 4.4 FA_IMPAIRMENT
| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | Impairment Expense | Amount | - |
| 2 | Accumulated Impairment | - | Amount |

### 4.5 FA_DISPOSAL
**Sale:**
| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | Cash/Bank | Proceeds | - |
| 2 | Accumulated Depreciation | Depr Removed | - |
| 3 | Accumulated Impairment | Impair Removed | - |
| 4 | Fixed Asset | - | Cost |
| 5 | Gain on Disposal (or Loss) | -/proceeds | -/cost |

**Scrap:**
| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | Accumulated Depreciation | Depr Removed | - |
| 2 | Accumulated Impairment | Impair Removed | - |
| 3 | Fixed Asset | - | Cost |
| 4 | Loss on Disposal | Remaining Book | - |

---

## 5. Backoffice UI Design (Mantine)

### 5.1 Page Structure

```
/fixed-assets
├── AssetListPage (mantine Table + Filters)
│   ├── Filters: outlet, status, category, active/inactive
│   ├── Bulk actions
│   └── Quick view drawer
├── AssetDetailPage (mantine Tabs)
│   ├── Overview Tab: asset info, current book value
│   ├── Lifecycle Tab: event timeline
│   ├── Depreciation Tab: schedule + run form
│   └── Actions Panel: acquisition, transfer, impairment, disposal
└── AssetWizard (mantine Modals/Steps)
    ├── AcquisitionWizard
    ├── TransferWizard
    ├── ImpairmentWizard
    └── DisposalWizard
```

### 5.2 Component Library (Mantine)

- **Tables:** `@mantine/core/Table` with sorting/filtering
- **Forms:** `@mantine/form` for state management
- **Modals:** `@mantine/core/Modal` for wizards
- **Notifications:** `@mantine/notifications` for feedback
- **Dates:** `@mantine/dates` for date pickers
- **Numbers:** `@mantine/core/NumberInput` for currency
- **Badges:** `@mantine/core/Badge` for status

### 5.3 Key UI Patterns

1. **Status Badges:** Green = POSTED, Red = VOIDED
2. **Journal Links:** Clickable badge → opens journal batch detail
3. **Preview Dialogs:** Show journal impact before submit
4. **Validation Feedback:** Inline errors with mantine notifications
5. **Loading States:** Mantine `LoadingOverlay` during API calls

---

## 6. Implementation Checklist

### Phase 1: Contracts + Schema
- [ ] Add shared Zod schemas (`packages/shared/src/schemas/fixed-assets.ts`)
- [ ] Add migration `0029_fixed_asset_events.sql`
- [ ] Add migration `0030_fixed_asset_books.sql`
- [ ] Add migration `0031_fixed_asset_disposals.sql`

### Phase 2: Domain Service + Posting
- [ ] Add `fixed-assets-lifecycle.ts` service
- [ ] Add posting mappers for new doc types
- [ ] Add book update logic in service

### Phase 3: API Endpoints
- [ ] Add `/acquisition` route
- [ ] Add `/transfer` route
- [ ] Add `/impairment` route
- [ ] Add `/disposal` route
- [ ] Add `/events/:eventId/void` route
- [ ] Add `/ledger` read endpoint
- [ ] Add `/book` read endpoint

### Phase 4: Backoffice UI
- [ ] Install Mantine packages
- [ ] Create AssetListPage component
- [ ] Create AssetDetailPage with tabs
- [ ] Create AcquisitionWizard modal
- [ ] Create TransferWizard modal
- [ ] Create ImpairmentWizard modal
- [ ] Create DisposalWizard modal

### Phase 5: Testing
- [ ] Integration tests for each command
- [ ] Financial correctness tests
- [ ] Migration rerun tests

---

## 7. Error Handling

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| INVALID_REQUEST | 400 | Malformed request body |
| NOT_FOUND | 404 | Asset/event not found |
| CONFLICT | 409 | Duplicate idempotency_key |
| FORBIDDEN | 403 | Outlet access denied |
| INVALID_REFERENCE | 400 | Invalid account/outlet reference |
| FISCAL_YEAR_CLOSED | 400 | Event date outside open fiscal year |
| ASSET_ALREADY_DISPOSED | 400 | Cannot perform action on disposed asset |
| EVENT_ALREADY_VOIDED | 400 | Cannot void already-voided event |

---

## 8. Idempotency Rules

- Every command accepts optional `idempotency_key`
- If omitted, server generates UUID
- Duplicate key returns existing event + `duplicate: true`
- Void operations use separate idempotency key space

---

## 9. Audit Trail Requirements

1. Every event stores `created_by` (user_id)
2. Every event links to `journal_batch_id`
3. Void events store `voided_by` and `voided_at`
4. All mutations logged via existing audit system
5. Asset history immutable - corrections via reversal events only

---

## 10. Migration Strategy

### Backward Compatibility
- Keep existing CRUD endpoints functional
- Keep existing depreciation logic path
- New endpoints are additive

### Rollout Sequence
1. Deploy schema migrations (dark)
2. Deploy API (dark)
3. Enable UI features incrementally
4. Deprecate legacy mutation patterns in v1.1

---

## 11. Acceptance Criteria

- [ ] Acquisition creates journal and updates book value
- [ ] Depreciation runs post journals (existing, enhanced)
- [ ] Transfer updates outlet and creates audit journal
- [ ] Impairment posts journal and updates book
- [ ] Disposal calculates gain/loss correctly
- [ ] Void creates reversal journal
- [ ] Ledger shows full event timeline
- [ ] Book shows current carrying amount
- [ ] All endpoints enforce company/outlet scoping
- [ ] Duplicate idempotent requests return existing result
- [ ] UI uses Mantine components throughout
