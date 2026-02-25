# Chart of Accounts (COA) Management

Complete documentation for the Chart of Accounts management system in Jurnapod.

## Overview

The COA management system provides a complete CRUD interface for managing the company's chart of accounts with support for:
- Hierarchical account structure (parent-child relationships)
- Soft deletion (deactivation)
- Multi-company support
- Role-based access control (OWNER, ADMIN, ACCOUNTANT)
- Account type classification
- Report grouping (Neraca/Balance Sheet, Laba Rugi/P&L)

## Architecture

### Database Layer

**Table:** `accounts`

```sql
CREATE TABLE accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL,
  type_name VARCHAR(191) NULL,
  normal_balance CHAR(1) NULL COMMENT 'D=Debit, K=Kredit',
  report_group VARCHAR(8) NULL COMMENT 'NRC=Neraca, LR=Laba Rugi',
  parent_account_id BIGINT UNSIGNED NULL,
  is_group TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY (company_id, code),
  KEY (parent_account_id),
  KEY (company_id, is_active),
  
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (parent_account_id) REFERENCES accounts(id)
) ENGINE=InnoDB;
```

**Migration:** `packages/db/migrations/0016_add_accounts_is_active.sql`

### Business Logic Layer

**Location:** `packages/modules/accounting/src/accounts-service.ts`

The `AccountsService` class provides framework-agnostic business logic:

#### Core Methods

- **`listAccounts(filters)`** - List accounts with filtering
- **`getAccountById(accountId, companyId)`** - Get single account
- **`createAccount(data)`** - Create new account
- **`updateAccount(accountId, data, companyId)`** - Update existing account
- **`deactivateAccount(accountId, companyId)`** - Soft delete
- **`reactivateAccount(accountId, companyId)`** - Restore inactive account
- **`getAccountTree(companyId, includeInactive?)`** - Build hierarchical tree
- **`isAccountInUse(accountId, companyId)`** - Check usage
- **`validateAccountCode(code, companyId, excludeAccountId?)`** - Check uniqueness
- **`validateParentAccount(parentId, accountId, companyId)`** - Prevent cycles

#### Business Rules

1. **Account codes must be unique per company**
   - Validated on create and update
   - Case-sensitive comparison

2. **Cannot deactivate accounts in use**
   - Accounts with journal lines cannot be deactivated
   - Accounts with active children cannot be deactivated
   - Throws `AccountInUseError`

3. **Circular references are prevented**
   - Cannot set parent to self
   - Cannot set parent to any descendant
   - Throws `CircularReferenceError`

4. **Parent account validation**
   - Parent must belong to same company
   - Parent must exist
   - Throws `ParentAccountCompanyMismatchError`

#### Custom Error Classes

- `AccountCodeExistsError` - Duplicate account code
- `CircularReferenceError` - Circular parent-child reference
- `AccountInUseError` - Account has journal lines or children
- `AccountNotFoundError` - Account doesn't exist
- `ParentAccountCompanyMismatchError` - Parent from different company

### API Layer

**Base Path:** `/api/accounts`

#### Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/accounts` | List accounts with filtering | Yes |
| POST | `/api/accounts` | Create new account | Yes |
| GET | `/api/accounts/:id` | Get single account | Yes |
| PUT | `/api/accounts/:id` | Update account | Yes |
| DELETE | `/api/accounts/:id` | Deactivate account | Yes |
| POST | `/api/accounts/:id/reactivate` | Reactivate account | Yes |
| GET | `/api/accounts/tree` | Get hierarchical tree | Yes |
| GET | `/api/accounts/:id/usage` | Check if in use | Yes |

**Authorization:** All endpoints require OWNER, ADMIN, or ACCOUNTANT role.

#### Request/Response Examples

##### List Accounts

**Request:**
```http
GET /api/accounts?company_id=1&is_active=true&search=cash
```

**Query Parameters:**
- `company_id` (required) - Company ID
- `is_active` (optional) - Filter by active status
- `report_group` (optional) - Filter by NRC or LR
- `parent_account_id` (optional) - Filter by parent
- `search` (optional) - Search by code or name

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "company_id": 1,
      "code": "1110",
      "name": "Cash",
      "type_name": "ASSET",
      "normal_balance": "D",
      "report_group": "NRC",
      "parent_account_id": 2,
      "is_group": false,
      "is_active": true,
      "created_at": "2026-02-25T10:00:00Z",
      "updated_at": "2026-02-25T10:00:00Z"
    }
  ]
}
```

##### Create Account

**Request:**
```http
POST /api/accounts
Content-Type: application/json

{
  "company_id": 1,
  "code": "1110",
  "name": "Cash",
  "type_name": "ASSET",
  "normal_balance": "D",
  "report_group": "NRC",
  "parent_account_id": 2,
  "is_group": false,
  "is_active": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "company_id": 1,
    "code": "1110",
    "name": "Cash",
    "type_name": "ASSET",
    "normal_balance": "D",
    "report_group": "NRC",
    "parent_account_id": 2,
    "is_group": false,
    "is_active": true,
    "created_at": "2026-02-25T10:00:00Z",
    "updated_at": "2026-02-25T10:00:00Z"
  }
}
```

##### Update Account

**Request:**
```http
PUT /api/accounts/1
Content-Type: application/json

{
  "name": "Cash on Hand",
  "normal_balance": "D"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "company_id": 1,
    "code": "1110",
    "name": "Cash on Hand",
    "type_name": "ASSET",
    "normal_balance": "D",
    "report_group": "NRC",
    "parent_account_id": 2,
    "is_group": false,
    "is_active": true,
    "created_at": "2026-02-25T10:00:00Z",
    "updated_at": "2026-02-25T10:30:00Z"
  }
}
```

##### Get Account Tree

**Request:**
```http
GET /api/accounts/tree?company_id=1&include_inactive=false
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "1000",
      "name": "Assets",
      "is_group": true,
      "is_active": true,
      "children": [
        {
          "id": 2,
          "code": "1100",
          "name": "Current Assets",
          "is_group": true,
          "is_active": true,
          "children": [
            {
              "id": 3,
              "code": "1110",
              "name": "Cash",
              "is_group": false,
              "is_active": true,
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

##### Check Account Usage

**Request:**
```http
GET /api/accounts/1/usage?company_id=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "is_in_use": true,
    "journal_lines_count": 15,
    "active_children_count": 2
  }
}
```

#### Error Responses

**400 Bad Request - Validation Error:**
```json
{
  "success": false,
  "error": "Validation error",
  "details": {
    "code": ["Account code is required"]
  }
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Account not found"
}
```

**409 Conflict - Duplicate Code:**
```json
{
  "success": false,
  "error": "Account code already exists"
}
```

**409 Conflict - Circular Reference:**
```json
{
  "success": false,
  "error": "Circular reference detected: cannot set parent to descendant"
}
```

**409 Conflict - Account In Use:**
```json
{
  "success": false,
  "error": "Account is in use and cannot be deactivated"
}
```

### Frontend Layer

**Location:** `apps/backoffice/src/features/accounts-page.tsx`

#### Components

1. **AccountsPage** - Main page component
   - Page header with title and create button
   - Filter section (search, show inactive, report group)
   - Tree view display
   - Create/edit form
   - Success/error messaging

2. **Tree View** - Recursive tree rendering
   - Expand/collapse functionality
   - Visual indentation for hierarchy
   - Icons for groups (📁) and leaf accounts (📄)
   - Status badges (Active/Inactive, Group)
   - Action buttons (Edit, Deactivate/Reactivate)

3. **Account Form** - Create/edit form
   - All account fields
   - Parent account dropdown
   - Validation with error display
   - Loading states
   - Cancel and Save buttons

#### Hooks

**Location:** `apps/backoffice/src/hooks/use-accounts.ts`

- `useAccounts(companyId, accessToken, filters)` - Fetch list
- `useAccountTree(companyId, accessToken, includeInactive)` - Fetch tree
- `useAccount(accountId, companyId, accessToken)` - Fetch single
- `useAccountUsage(accountId, companyId, accessToken)` - Check usage
- `createAccount(data, accessToken)` - Create mutation
- `updateAccount(accountId, data, accessToken)` - Update mutation
- `deactivateAccount(accountId, accessToken)` - Deactivate mutation
- `reactivateAccount(accountId, accessToken)` - Reactivate mutation

### Shared Types

**Location:** `packages/shared/src/schemas/accounts.ts`

#### Zod Schemas

- `AccountResponseSchema` - Full account entity
- `AccountCreateRequestSchema` - Create request validation
- `AccountUpdateRequestSchema` - Update request validation
- `AccountListQuerySchema` - List query parameters
- `AccountTreeNodeSchema` - Tree node with children

#### TypeScript Types

```typescript
type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
type NormalBalance = "D" | "K"; // D=Debit, K=Kredit
type ReportGroup = "NRC" | "LR"; // NRC=Neraca, LR=Laba Rugi

type AccountResponse = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  type_name: AccountType | null;
  normal_balance: NormalBalance | null;
  report_group: ReportGroup | null;
  parent_account_id: number | null;
  is_group: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AccountCreateRequest = {
  company_id: number;
  code: string;
  name: string;
  type_name?: AccountType | null;
  normal_balance?: NormalBalance | null;
  report_group?: ReportGroup | null;
  parent_account_id?: number | null;
  is_group?: boolean;
  is_active?: boolean;
};

type AccountUpdateRequest = Partial<Omit<AccountCreateRequest, "company_id">>;

type AccountTreeNode = AccountResponse & {
  children: AccountTreeNode[];
};
```

## User Guide

### Accessing COA Management

1. Navigate to **Chart of Accounts** in the backoffice navigation menu
2. Required role: OWNER, ADMIN, or ACCOUNTANT

### Creating an Account

1. Click the **"Create Account"** button
2. Fill in required fields:
   - **Code** (required) - Unique account code (e.g., "1110")
   - **Name** (required) - Account name (e.g., "Cash")
3. Optional fields:
   - **Parent Account** - Select parent for hierarchy
   - **Type** - Select account type (ASSET, LIABILITY, etc.)
   - **Normal Balance** - D (Debit) or K (Kredit)
   - **Report Group** - NRC (Neraca/Balance Sheet) or LR (Laba Rugi/P&L)
   - **Is Group** - Check if this account can have children
4. Click **"Save Account"**

### Editing an Account

1. Find the account in the tree view
2. Click the **"Edit"** button
3. Modify the desired fields
4. Click **"Save Account"**

**Note:** You cannot change the company_id of an account.

### Deactivating an Account

1. Find the account in the tree view
2. Click the **"Deactivate"** button
3. Confirm the deactivation

**Restrictions:**
- Cannot deactivate accounts with journal entries
- Cannot deactivate accounts with active children
- If account is in use, you'll see an error message

### Reactivating an Account

1. Enable **"Show Inactive"** filter
2. Find the inactive account
3. Click the **"Reactivate"** button

### Filtering Accounts

**Search:** Type in the search box to filter by code or name

**Show Inactive:** Toggle to show/hide inactive accounts

**Report Group:**
- **All** - Show all accounts
- **Neraca (NRC)** - Show only balance sheet accounts
- **Laba Rugi (LR)** - Show only P&L accounts

### Tree Navigation

- Click **▶** to expand a group account and see children
- Click **▼** to collapse a group account
- Indentation shows hierarchy levels

## Account Types

### ASSET
Accounts representing company resources (cash, bank, receivables, inventory, fixed assets)

**Examples:**
- 1110 - Cash
- 1120 - Bank - BCA
- 1210 - Accounts Receivable
- 1410 - Equipment

### LIABILITY
Accounts representing obligations (payables, loans, accruals)

**Examples:**
- 2110 - Accounts Payable
- 2120 - Accrued Expenses
- 2210 - Long-term Debt

### EQUITY
Owner's equity accounts (capital, retained earnings)

**Examples:**
- 3110 - Owner's Capital
- 3910 - Retained Earnings

### REVENUE
Income accounts (sales, service revenue)

**Examples:**
- 4110 - Sales Revenue
- 4120 - Service Revenue
- 4910 - Other Income

### EXPENSE
Cost and expense accounts (COGS, operating expenses)

**Examples:**
- 5110 - Cost of Goods Sold
- 6110 - Salaries Expense
- 6210 - Rent Expense
- 6310 - Utilities Expense

## Normal Balance

- **D (Debit)** - Assets, Expenses
- **K (Kredit)** - Liabilities, Equity, Revenue

## Report Groups

- **NRC (Neraca)** - Balance Sheet accounts (Assets, Liabilities, Equity)
- **LR (Laba Rugi)** - Profit & Loss accounts (Revenue, Expenses)

## Integration with Other Modules

### Journal Posting

All journal entries reference accounts by `account_id`. The COA is the foundation for:
- General Ledger reports
- Trial Balance
- Profit & Loss statements
- Balance Sheet

### Outlet Account Mappings

Each outlet can be mapped to specific accounts for automated posting:
- CASH account
- QRIS account
- Sales Revenue account
- Sales Tax account
- Accounts Receivable
- Card/Bank account

See `outlet_account_mappings` table.

### CSV Import

Accounts can be bulk imported via CSV using the accounting import feature:
- `POST /api/accounting/imports`
- DA sheet → COA accounts
- Supports hierarchical structures

## Best Practices

### Account Codes

1. **Use numeric codes** for easier sorting and grouping
2. **Group by category:**
   - 1000-1999: Assets
   - 2000-2999: Liabilities
   - 3000-3999: Equity
   - 4000-4999: Revenue
   - 5000-5999: Cost of Goods Sold
   - 6000-6999: Operating Expenses
   - 7000-7999: Other Expenses
   - 8000-8999: Other Income
3. **Leave gaps** for future accounts (1110, 1120, 1130 instead of 1111, 1112, 1113)

### Account Hierarchy

1. **Create group accounts** for major categories
2. **Nest related accounts** under appropriate groups
3. **Don't nest too deeply** (3-4 levels maximum)
4. **Use consistent naming** across similar account types

### Account Management

1. **Deactivate instead of delete** to preserve history
2. **Review usage** before deactivating accounts
3. **Document account purposes** in the name or description
4. **Regular cleanup** of unused accounts

## Troubleshooting

### "Account code already exists"
The account code must be unique within your company. Choose a different code.

### "Circular reference detected"
You're trying to set an account's parent to one of its own descendants. Choose a different parent.

### "Account is in use and cannot be deactivated"
The account has journal entries or active child accounts. You can:
- View the account usage to see what's using it
- Keep the account active
- Move journal entries to another account (if appropriate)
- Deactivate child accounts first

### "Parent account from different company"
The parent account must belong to the same company. This is a data integrity error.

## API Integration Examples

### Using the API from JavaScript

```javascript
// Create an account
const response = await fetch('/api/accounts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    company_id: 1,
    code: "1110",
    name: "Cash",
    type_name: "ASSET",
    normal_balance: "D",
    report_group: "NRC",
    is_group: false,
    is_active: true
  })
});

const data = await response.json();
console.log(data.success ? data.data : data.error);
```

### Using the Service in Backend Code

```typescript
import { AccountsService } from '@jurnapod/modules-accounting';
import { getDbClient } from './db';

const db = getDbClient();
const accountsService = new AccountsService(db);

// Create account
const account = await accountsService.createAccount({
  company_id: 1,
  code: "1110",
  name: "Cash",
  type_name: "ASSET",
  normal_balance: "D",
  report_group: "NRC",
  is_group: false,
  is_active: true
});

// Get tree
const tree = await accountsService.getAccountTree(1, false);

// Check if in use
const inUse = await accountsService.isAccountInUse(account.id, 1);
```

## Security Considerations

1. **Authorization:** All endpoints enforce role-based access
2. **Company Scoping:** All queries are scoped by company_id
3. **SQL Injection:** All queries use parameterized statements
4. **Validation:** All inputs validated with Zod schemas
5. **Audit Trail:** Consider logging all COA changes to audit_logs

## Performance Notes

1. **Indexes:** Key indexes on (company_id, code) and (company_id, is_active)
2. **Tree Building:** O(n) complexity for tree construction
3. **Large Hierarchies:** Consider pagination for companies with >1000 accounts
4. **Caching:** Consider caching account tree per company

## Future Enhancements

- [ ] Bulk import/export (Excel/CSV)
- [ ] Account templates (predefined COA structures)
- [ ] Account merge functionality
- [ ] Account usage report (which accounts are used in journals)
- [ ] Account balance queries (current balance)
- [ ] Account description field
- [ ] Account tags/categories
- [ ] Account reordering within parent
- [ ] Audit log integration for all changes
- [ ] Account code generation (auto-suggest next code)
- [ ] Drag-and-drop tree reordering
