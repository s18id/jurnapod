# 🌱 Database Test Seeding Solution

A comprehensive database seeding solution for Jurnapod that creates realistic test records across all major tables while respecting constraints and relationships.

## 📁 Files Created

```
packages/db/scripts/
├── seed-test-data.mjs           # Main comprehensive seeding script
├── test-seed-simple.mjs         # Simple test with minimal data  
├── verify-test-data.mjs         # Data verification and integrity check
└── README-test-seeding.md       # Complete documentation
```

## 🚀 Quick Start

```bash
# 1. Run basic seed first (creates company, owner, roles)
npm run db:seed

# 2. Generate comprehensive test data  
npm run db:seed:test-data

# 3. Verify data was created correctly
npm run db:verify:test-data

# Alternative: Quick test with minimal data
npm run db:seed:test-data:simple
```

## 📊 What Gets Created

The seeding script generates realistic test data for:

| Category | Tables | Features |
|----------|--------|----------|
| **👥 Users & Access** | `users`, `user_role_assignments`, `user_outlets` | Test users with proper roles and outlet access |
| **🏪 Locations** | `outlets` | Additional branch locations |
| **💰 Accounting** | `accounts` | Complete chart of accounts (if needed) |
| **📦 Inventory** | `item_groups`, `items`, `item_prices` | Product catalog with hierarchical groups and pricing |
| **🛒 POS Sales** | `pos_transactions`, `pos_transaction_items`, `pos_transaction_payments` | Complete sales with line items and payments |
| **📄 Formal Sales** | `sales_invoices`, `sales_invoice_lines` | Professional invoicing with customer data |
| **📋 Orders** | `sales_orders`, `sales_order_lines` | Order workflow (draft → confirmed → completed) |
| **💳 Financial** | `cash_bank_transactions`, `journal_batches`, `journal_lines` | Cash movements and proper double-entry accounting |
| **📝 Audit** | `audit_logs` | User activity tracking for compliance |

## 🔧 Configuration

Control data generation with environment variables:

```bash
# Target company (must exist from db:seed)
JP_COMPANY_CODE=JP

# Data volumes
JP_TEST_USERS_COUNT=5              # Test users to create
JP_TEST_OUTLETS_COUNT=2            # Additional outlets  
JP_TEST_ACCOUNTS_COUNT=50          # Accounts (if none exist)
JP_TEST_ITEMS_COUNT=30             # Items in catalog
JP_TEST_POS_TRANSACTIONS_COUNT=100 # POS sales
JP_TEST_SALES_INVOICES_COUNT=25    # Formal invoices
JP_TEST_SALES_ORDERS_COUNT=15      # Sales orders
JP_TEST_CASH_TRANSACTIONS_COUNT=20 # Cash/bank movements

# Time and pricing
JP_TEST_DAYS_BACK=30               # Spread transactions over N days
JP_TEST_PRICE_MIN=5000             # Minimum item price (IDR)
JP_TEST_PRICE_MAX=150000           # Maximum item price (IDR)
```

## 🛡️ Safety & Quality

### Database Safety
- ✅ **Transaction Safety** - Full rollback on any error
- ✅ **Tenant Isolation** - All data scoped to target company  
- ✅ **Non-Destructive** - Only adds data, never modifies existing
- ✅ **Constraint Compliance** - Respects all foreign keys and business rules

### Financial Integrity
- ✅ **Proper Money Types** - Uses `DECIMAL(18,2)` for all monetary values
- ✅ **Balanced Journals** - Double-entry accounting with balanced debits/credits
- ✅ **Valid Status Enums** - Uses correct status values (`DRAFT`, `APPROVED`, `POSTED`, `VOID`)
- ✅ **Formula Compliance** - Ensures `grand_total = subtotal + tax_amount`

### Offline-First Safety  
- ✅ **Unique Transaction IDs** - Uses `client_tx_id` for POS sync safety
- ✅ **Idempotent Operations** - Safe for retry scenarios
- ✅ **Proper Status Flow** - Respects business workflow states

## 🎯 Usage Examples

### Development Testing
```bash
# Quick test with minimal data
npm run db:seed:test-data:simple

# Standard development dataset
npm run db:seed:test-data
```

### Integration Testing
```bash
# Large dataset for comprehensive testing
JP_TEST_USERS_COUNT=20 \
JP_TEST_OUTLETS_COUNT=5 \
JP_TEST_ITEMS_COUNT=100 \
JP_TEST_POS_TRANSACTIONS_COUNT=500 \
npm run db:seed:test-data
```

### Multi-Company Testing
```bash
# Seed data for multiple companies
JP_COMPANY_CODE=COMP1 npm run db:seed:test-data
JP_COMPANY_CODE=COMP2 npm run db:seed:test-data  
JP_COMPANY_CODE=COMP3 npm run db:seed:test-data
```

### Performance Testing
```bash
# Generate large volume for performance testing
JP_TEST_ITEMS_COUNT=500 \
JP_TEST_POS_TRANSACTIONS_COUNT=10000 \
JP_TEST_SALES_INVOICES_COUNT=2000 \
npm run db:seed:test-data
```

## 📈 Sample Output

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

## 🔍 Data Verification

The verification script provides comprehensive validation:

```bash
npm run db:verify:test-data
```

**Verification includes:**
- Table-by-table record counts
- Sample data from key entities  
- Journal balance validation (accounting integrity)
- Data quality assessment
- Foreign key relationship checks

## 🏗️ Architecture Compliance

The seeding solution follows Jurnapod's architectural principles:

- **Modular ERP** - Respects module boundaries and permissions
- **Tenant Isolation** - All data properly scoped by `company_id`
- **Offline-First POS** - Safe transaction handling with unique client IDs
- **Accounting-Centric** - Journal entries as source of financial truth
- **MySQL/MariaDB Compatible** - Works on both database engines

## 🔄 Integration with Testing

Perfect for:

- **API Integration Tests** - Realistic data for endpoint testing
- **Frontend Development** - Rich datasets for UI testing
- **Performance Testing** - Scalable data volumes  
- **Accounting Verification** - Proper double-entry validation
- **User Acceptance Testing** - Complete business workflows

## 🧹 Cleanup

No built-in cleanup provided - recommended approaches:

1. **Separate Test Database** (Recommended)
   ```bash
   # Use different database for testing
   DB_NAME=jurnapod_test npm run db:seed:test-data
   ```

2. **Database Backup/Restore**
   ```bash
   # Backup before seeding
   mysqldump jurnapod > backup.sql
   # Restore when needed
   mysql jurnapod < backup.sql
   ```

3. **Manual Cleanup** (Use with extreme caution)
   ```sql
   -- Example pattern - VERIFY COMPANY ID FIRST
   DELETE FROM audit_logs WHERE company_id = ? AND created_at >= '2026-01-01';
   DELETE FROM pos_transactions WHERE company_id = ? AND client_tx_id LIKE 'test_%';
   ```

## ✨ Benefits

- **🔐 Production-Safe** - Designed with safety constraints and validation
- **📏 Scalable** - Configurable data volumes from minimal to massive  
- **🎯 Realistic** - Proper Indonesian business terminology and workflows
- **🔧 Flexible** - Environment-driven configuration for different scenarios
- **📊 Verifiable** - Built-in verification and integrity checking
- **🏃‍♂️ Fast** - Optimized bulk operations with proper indexing

This solution provides everything needed for comprehensive database testing while maintaining the safety and integrity expected in a production ERP system!