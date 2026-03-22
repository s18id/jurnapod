# ADR-002: Journal as Source of Truth

**Status:** Accepted  
**Date:** 2026-03-15  
**Deciders:** Epic 3 Team  

---

## Context

Jurnapod is an accounting-centric ERP system where financial accuracy is paramount. We need to establish a single source of truth for all financial data that ensures:

- **Auditability** - Every transaction can be traced back to its origin
- **Consistency** - All reports derive from the same data
- **Immutability** - Historical records cannot be altered
- **Reconciliation** - Easy verification of financial state

### Problem Statement

Financial data can be represented in multiple places:
1. **Journals** - Immutable accounting records
2. **Ledgers** - Aggregated views by account
3. **Balances** - Current state by account/outlet
4. **Reports** - Generated views for users

If these get out of sync, financial integrity is compromised.

---

## Decision

We adopt the **Journal-First Accounting Model** where:

### Core Principle
> **The journal is the only mutable financial record. All other financial views are derived and immutable.**

### Data Flow

```
POS Transaction
      ↓
Journal Entry (CREATED)
      ↓
┌─────────────────────┐
│  Journal Effect      │
│  (immutable copy)   │
└─────────────────────┘
      ↓
┌─────────────────────┐
│  Ledger (derived)    │
│  Account balances    │
└─────────────────────┘
      ↓
┌─────────────────────┐
│  Reports (derived)   │
│  Trial Balance, GL   │
└─────────────────────┘
```

### Key Rules

1. **Journal Creation** - Every financial transaction creates a journal entry
2. **Journal Immutability** - Once created, journals cannot be modified (only VOIDED)
3. **Correction via Reversal** - Errors are corrected by creating reversing entries
4. **Outlet Scoping** - Journals are scoped to outlets for multi-tenant isolation
5. **Timestamp Precision** - Unix milliseconds for all financial timestamps

---

## Consequences

### Positive

1. **Single Source of Truth** - No ambiguity about financial state
2. **Audit Trail** - Complete history of every transaction
3. **Report Consistency** - All reports derive from same source
4. **Parallel Verification** - Easy to reconcile against external systems

### Negative

1. **Performance** - Queries must aggregate from journals
2. **Complexity** - More complex than direct balance updates
3. **Migration** - Existing direct balance updates must be converted

### Mitigation

- **Materialized Views** - For frequently accessed aggregations
- **Indexing** - Proper indexes on journal tables for date range queries
- **Caching** - Balance caches with invalidation on journal changes

---

## Implementation Details

### Journal Entry Structure

```sql
CREATE TABLE journal_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL,
  outlet_id BIGINT,
  reference_type VARCHAR(50),      -- 'sale', 'payment', 'refund', etc.
  reference_id BIGINT,             -- FK to source transaction
  entry_date DATE NOT NULL,
  reservation_start_ts BIGINT,     -- Unix ms for precise timing
  reservation_end_ts BIGINT,
  description TEXT,
  status ENUM('posted', 'voided') DEFAULT 'posted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT,
  
  INDEX idx_company_date (company_id, entry_date),
  INDEX idx_reference (reference_type, reference_id),
  INDEX idx_reservation (reservation_start_ts, reservation_end_ts)
);
```

### Journal Lines

```sql
CREATE TABLE journal_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  journal_entry_id BIGINT NOT NULL,
  account_code VARCHAR(50) NOT NULL,
  debit DECIMAL(18,2) DEFAULT 0,
  credit DECIMAL(18,2) DEFAULT 0,
  description TEXT,
  
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
  CHECK (debit = 0 OR credit = 0),  -- Must be debit OR credit, not both
  CHECK (debit > 0 AND credit = 0 OR debit = 0 AND credit > 0)
);
```

### Derived Tables

```sql
-- Account Balances (derived, refreshed on journal changes)
CREATE TABLE account_balances (
  company_id BIGINT,
  account_code VARCHAR(50),
  outlet_id BIGINT,                  -- NULL for company-wide
  current_balance DECIMAL(18,2) DEFAULT 0,
  as_of_date DATE,
  
  PRIMARY KEY (company_id, account_code, outlet_id)
);
```

---

## Report Derivation

### Trial Balance

```sql
SELECT 
  jl.account_code,
  SUM(jl.debit) as total_debit,
  SUM(jl.credit) as total_credit,
  SUM(jl.debit) - SUM(jl.credit) as balance
FROM journal_entries je
JOIN journal_lines jl ON je.id = jl.journal_entry_id
WHERE je.company_id = ?
  AND je.entry_date BETWEEN ? AND ?
  AND je.status = 'posted'
GROUP BY jl.account_code
ORDER BY jl.account_code;
```

### General Ledger

```sql
SELECT
  je.entry_date,
  je.description,
  je.reference_type,
  jl.account_code,
  jl.debit,
  jl.credit,
  SUM(jl.debit - jl.credit) OVER (
    PARTITION BY jl.account_code 
    ORDER BY je.entry_date, je.id
  ) as running_balance
FROM journal_entries je
JOIN journal_lines jl ON je.id = jl.journal_entry_id
WHERE je.company_id = ?
  AND jl.account_code = ?
  AND je.entry_date BETWEEN ? AND ?
ORDER BY je.entry_date, je.id;
```

---

## References

- Epic 3: Accounting - GL Posting & Reports
- Story 3.1: Automatic Journal Entry from POS
- Story 3.2: Manual Journal Entry Creation
- Story 3.3: Journal Batch History
- Story 3.4: Trial Balance Report
- Story 3.5: General Ledger Report
