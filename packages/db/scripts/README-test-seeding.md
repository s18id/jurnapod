# Test Data Seeding

This directory contains comprehensive test data seeding scripts for Jurnapod database testing.

## Quick Start

```bash
# First run the basic seed (required)
npm run db:seed

# Then generate comprehensive test data
npm run db:seed:test-data
```

## Available Seeding Scripts

### Core Seeding
- **`db:seed`** - Basic company, user, role setup (required first)
- **`db:seed:test-data`** - Comprehensive test data (this document)
- **`db:seed:test-data:simple`** - Minimal test data for quick testing
- **`db:verify:test-data`** - Verify seeded data integrity

### Specialized Seeding
- **`db:seed:test-accounts`** - Random chart of accounts only
- **`db:seed:test-items`** - Random items and pricing only
- **`db:seed:settings`** - Company settings from environment

## Comprehensive Test Data Script

The `seed-test-data.mjs` script creates realistic test data for:

- ✅ **Additional users** (with roles and outlet assignments)
- ✅ **Additional outlets** (branch locations)  
- ✅ **Chart of accounts** (if not exists - asset, liability, equity, revenue, expense accounts)
- ✅ **Item catalog** (products/services with groups and pricing)
- ✅ **POS transactions** (with items, payments, and journal entries)
- ✅ **Sales invoices** (with line items and customer data)
- ✅ **Sales orders** (draft to completed workflow)
- ✅ **Cash/bank transactions** (receipts, payments, transfers)
- ✅ **Journal entries** (proper double-entry accounting)
- ✅ **Audit logs** (user activity tracking)

### Data Relationships

The script respects all database constraints:
- **Tenant isolation** - All data scoped to target company
- **Foreign keys** - Proper relationships between entities
- **Financial integrity** - Balanced journal entries using `DECIMAL(18,2)`
- **Offline-first POS** - Unique `client_tx_id` for sync safety
- **Accounting rules** - Proper debit/credit posting

## Configuration

Control data generation with environment variables:

```bash
# Target company (required - must exist from db:seed)
JP_COMPANY_CODE=JP

# Data volumes
JP_TEST_USERS_COUNT=5
JP_TEST_OUTLETS_COUNT=2
JP_TEST_ACCOUNTS_COUNT=50
JP_TEST_ITEMS_COUNT=30
JP_TEST_POS_TRANSACTIONS_COUNT=100
JP_TEST_SALES_INVOICES_COUNT=25
JP_TEST_SALES_ORDERS_COUNT=15
JP_TEST_CASH_TRANSACTIONS_COUNT=20

# Date range
JP_TEST_DAYS_BACK=30

# Pricing
JP_TEST_PRICE_MIN=5000
JP_TEST_PRICE_MAX=150000
```

## Examples

### Minimal Test Data
```bash
# Use the simple preset for quick testing
npm run db:seed:test-data:simple

# Or customize small dataset for unit testing
JP_TEST_USERS_COUNT=2 \
JP_TEST_ITEMS_COUNT=10 \
JP_TEST_POS_TRANSACTIONS_COUNT=20 \
npm run db:seed:test-data
```

### Large Test Dataset
```bash
# Comprehensive dataset for integration testing
JP_TEST_USERS_COUNT=20 \
JP_TEST_OUTLETS_COUNT=5 \
JP_TEST_ITEMS_COUNT=100 \
JP_TEST_POS_TRANSACTIONS_COUNT=500 \
JP_TEST_SALES_INVOICES_COUNT=100 \
npm run db:seed:test-data
```

### Multi-Company Testing
```bash
# Seed data for multiple companies
JP_COMPANY_CODE=COMP1 npm run db:seed:test-data
JP_COMPANY_CODE=COMP2 npm run db:seed:test-data
```

## Generated Test Data

### Users & Access
- **Test users** with email/password: `TestPass123!`
- **Role assignments** (Admin, Accountant, Cashier)
- **Outlet assignments** for proper access control

### Sample Output
```
🎉 Test data seeding completed successfully!

📊 Summary:
  • Company: Jurnapod Demo (JP)
  • Outlets: 3 total (2 new)
  • Users: 5 new
  • Accounts: 50 total
  • Item groups: 5
  • Items: 30
  • POS transactions: 100
  • Sales invoices: 25
  • Sales orders: 15
  • Cash/bank transactions: 20
  • Audit logs: 175

🔑 Sample test credentials:
  • testuser1@xyz3.test / TestPass123! (ADMIN)
  • testuser2@abc7.test / TestPass123! (CASHIER)
  • testuser3@def2.test / TestPass123! (ACCOUNTANT)
```

## Data Quality

The script ensures:

- **Realistic data** - Proper Indonesian accounting terminology
- **Date distribution** - Transactions spread over specified period
- **Amount variation** - Random but realistic pricing
- **Status variety** - Draft, confirmed, completed states
- **Relationship integrity** - All foreign keys properly linked

## Testing Integration

Perfect for:
- **API integration tests** - Realistic data for endpoint testing
- **UI testing** - Rich dataset for frontend development
- **Performance testing** - Scalable data volumes
- **Accounting verification** - Proper double-entry validation

## Safety

- **Transaction safety** - Full rollback on any error
- **Non-destructive** - Only adds data, never modifies existing
- **Company scoped** - Cannot affect other companies' data
- **Idempotent** - Safe to run multiple times

## Cleanup

No built-in cleanup - use database restore or manual deletion:

```sql
-- Example: Clean test data (BE VERY CAREFUL)
DELETE FROM audit_logs WHERE company_id = ? AND created_at >= '2026-01-01';
DELETE FROM pos_transactions WHERE company_id = ? AND client_tx_id LIKE 'test_%';
-- ... etc for each table
```

Better approach: Use separate test databases or backup/restore.