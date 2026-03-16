---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments: [
  '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/prd.md',
  '/home/ahmad/jurnapod/_bmad-output/planning-artifacts/architecture.md'
]
workflowComplete: true
dateCompleted: 2026-03-15
---

# jurnapod - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for jurnapod, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**POS (Point of Sale):**
- FR1: Cashiers can ring up sales with items and quantities
- FR2: Cashiers can apply discounts to transactions
- FR3: Cashiers can process multiple payment methods
- FR4: POS works offline without network connectivity
- FR5: POS syncs transactions when connectivity is restored
- FR6: System prevents duplicate transactions during sync

**Accounting / GL:**
- FR7: All POS transactions post to journal entries automatically
- FR8: Users can create manual journal entries
- FR9: Users can view journal batch history
- FR10: Users can run trial balance reports
- FR11: Users can view general ledger reports

**User Management:**
- FR12: Users can log in with email and password
- FR13: Users have role-based access control (RBAC)
- FR14: Admins can create and manage user accounts
- FR15: Admins can assign roles to users

**Company & Outlet Management:**
- FR16: Users can manage company settings
- FR17: Users can manage multiple outlets
- FR18: Users can configure outlet-specific settings

**Settings & Configuration:**
- FR19: Users can configure tax rates
- FR20: Users can configure payment methods
- FR21: Users can enable/disable modules per company

**Reporting:**
- FR22: Users can view sales reports by date range
- FR23: Users can export reports for accountants
- FR24: Users can view POS transaction history

**Items & Catalog:**
- FR25: Users can manage items/products
- FR26: Users can set prices per outlet
- FR27: System supports multiple item types (product, service, ingredient, recipe)

### NonFunctional Requirements

**Performance:**
- POS transaction processing: < 1 second response time
- Sync operations: Complete within 30 seconds when online
- Report generation: < 5 seconds for standard reports
- API response time: < 500ms for standard CRUD operations

**Security:**
- All data encrypted in transit (TLS 1.2+)
- Passwords hashed with Argon2id (default) or bcrypt
- JWT tokens with configurable expiry
- Role-based access control enforced at API level
- Audit trail for all financial data changes

**Data Integrity & Reliability:**
- ACID compliance on all journal transactions
- InnoDB with proper transaction isolation
- Idempotent sync prevents duplicate transactions
- No partial writes - transactions are atomic
- Immutable journal entries with correction entries

**Scalability:**
- Support multiple outlets per company
- Support multiple users per outlet
- Database designed for 10x growth

**Usability:**
- New cashier can be trained in < 30 minutes
- POS optimized for tablet touch interface
- Backoffice responsive on desktop

**Availability:**
- 99.9% uptime during business hours (defined as 6 AM - 11 PM local time, 7 days/week)
- POS works offline with local storage (up to 7 days of transactions queued)
- Graceful degradation when connectivity returns
- RTO: 4 hours for critical failures
- RPO: 1 hour for data recovery

**Offline Sync Protocol:**
- Conflict Resolution: Last-write-wins for non-financial, flag for manual review for financial
- Duplicate detection: client_tx_id (UUID v4) prevents duplicates
- Sync Queue: FIFO with priority for older transactions
- Retry Policy: Exponential backoff with max 5 retries
- Offline Duration: Supports up to 7 days offline (configurable)

**Testing:**
- 80%+ test coverage on critical paths (auth, sync, journal posting)
- Automated test cases for offline/network flakiness scenarios

**Accessibility:**
- WCAG 2.1 AA compliance for backoffice
- Responsive design for POS (tablet) and backoffice (desktop)

**Integration:**
- REST API for third-party integrations (future)
- JSON data format standard
- Data export capability for accounting purposes

### Additional Requirements (from Architecture)

- Monorepo structure with shared packages
- TypeScript + Zod for type safety
- MySQL 8.0+ for data persistence
- Idempotent sync via client_tx_id (UUID v4)
- POS must work offline with reliable sync
- GL at center - every transaction flows to accounting
- Multi-tenant: company_id and outlet_id scoping

### UX Design Requirements

No comprehensive UX spec found - UX work is derived from existing UI plans in docs/plans/

## FR Coverage Map

| Epic | FRs Covered |
|------|-------------|
| Epic 1: Foundation | FR12, FR13, FR16, FR17, FR18 |
| Epic 2: POS | FR1, FR2, FR3, FR4, FR5, FR6 |
| Epic 3: Accounting | FR7, FR8, FR9, FR10, FR11 |
| Epic 4: Items & Catalog | FR25, FR26, FR27 |
| Epic 5: Settings | FR19, FR20, FR21 |
| Epic 6: Reporting | FR22, FR23, FR24 |
| Epic 7: Sync Infrastructure | (Technical Debt) |

## Epic List

Epic 1: Foundation - Auth, Company & Outlet Management
Epic 2: POS - Offline-first Point of Sale
Epic 3: Accounting - GL Posting & Reports
Epic 4: Items & Catalog - Product Management
Epic 5: Settings - Tax, Payment, Module Configuration
Epic 6: Reporting - Sales Reports & Exports
Epic 7: Sync Infrastructure - Technical Debt Fixes

---

## Epic 1: Foundation - Auth, Company & Outlet Management

Users can authenticate securely (email/password + Google SSO) with RBAC, manage companies and configure multiple outlets with outlet-specific settings.

**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17, FR18

### Story 1.1: User Login with Email/Password and Google SSO

As a **system user**,
I want to **log in with email/password or Google SSO**,
So that **I can access the backoffice securely**.

**Acceptance Criteria:**

**Given** a registered user with email and password  
**When** they enter valid credentials on the login page  
**Then** they are authenticated and redirected to dashboard  
**And** a JWT token is issued

**Given** invalid credentials  
**When** they attempt to login  
**Then** an error message is displayed  
**And** no token is issued

**Given** a user with Google account  
**When** they click "Login with Google" and complete OAuth flow  
**Then** they are authenticated and redirected to dashboard  
**And** a JWT token is issued (linked to their Google email)

**Given** a Google email not registered in the system  
**When** they complete Google OAuth  
**Then** they are prompted to complete registration or contact admin

---

### Story 1.2: JWT Token Management & Refresh

As an **authenticated user**,
I want my **session to persist securely with token refresh**,
So that **I don't have to log in repeatedly**.

**Acceptance Criteria:**

**Given** a valid JWT token  
**When** user makes an API request with the token  
**Then** the request is authenticated successfully

**Given** an expired JWT token  
**When** user makes an API request  
**Then** a 401 Unauthorized response is returned

**Given** a valid refresh token  
**When** user requests a new access token  
**Then** a new JWT access token is issued  
**And** the refresh token rotation occurs

**Given** an invalid or revoked refresh token  
**When** user requests a new access token  
**Then** authentication fails and login is required

---

### Story 1.3: RBAC - Role Definitions & Permissions

As a **system administrator**,
I want to **define roles with specific permissions**,
So that **users have appropriate access levels**.

**Acceptance Criteria:**

**Given** system administrator  
**When** they create a new role with permissions  
**Then** the role is saved to database  
**And** permissions can be assigned to the role

**Given** predefined roles (Admin, Manager, Cashier, Accountant)  
**When** system is initialized  
**Then** default roles exist with appropriate permission sets

**Given** a user with Admin role  
**When** they access any API endpoint  
**Then** access is granted for all operations

**Given** a user with Cashier role  
**When** they attempt to access user management endpoints  
**Then** access is denied with 403 Forbidden

**Given** role-permission assignments  
**When** checking access for a user  
**Then** all permissions from user's roles are evaluated

---

### Story 1.4: Admin User Management (CRUD)

As a **company admin**,
I want to **create, view, update, and deactivate user accounts**,
So that **I can manage my team access**.

**Acceptance Criteria:**

**Given** a company admin  
**When** they create a new user with email, name, role, and outlet assignment  
**Then** the user is created with pending status  
**And** a temporary password is generated (or invitation sent)

**Given** a company admin  
**When** they view the user list  
**Then** all active users in their company are displayed  
**And** user details (name, email, role, outlet, status) are shown

**Given** a company admin  
**When** they update a user's role or outlet assignment  
**Then** the changes are saved immediately  
**And** user is notified of role change

**Given** a company admin  
**When** they deactivate a user account  
**Then** the user can no longer log in  
**And** historical records are preserved

**Given** a company admin  
**When** they attempt to create a user for another company  
**Then** the operation is denied

---

### Story 1.5: Company Settings Management (Enhanced)

As a **company admin**,
I want to **manage company-level settings using a flexible configuration system**,
So that **the organization is properly configured with extensible settings**.

**Acceptance Criteria:**

**Given** a company admin  
**When** they view company settings  
**Then** they see core company details (name, address, timezone, locale) AND configuration settings

**Given** a company admin  
**When** they update company settings  
**Then** changes are saved and reflected across the system

**Given** a company admin  
**When** they configure company-specific preferences (currency, date format, tax defaults, receipt header)  
**Then** these preferences apply to all outlets in the company as defaults

**Given** new settings added to the system  
**When** admin configures them  
**Then** they automatically appear in company settings UI

**Given** setting key with JSON value type  
**When** admin saves complex config (e.g., invoice templates, custom fields)  
**Then** the JSON is validated and stored properly

**Given** company settings and outlet settings both exist  
**When** an outlet requests a setting  
**Then** outlet-specific value is used if present, otherwise company default is used

**Technical Implementation:**
- Create `company_settings` table with: id, company_id, key, value, value_type (string, number, boolean, json), created_at, updated_at
- Settings cascade: outlet_setting → company_setting → system default
- API: GET/PATCH /api/companies/:id/settings
- Core company fields remain in `companies` table

---

### Story 1.6: Outlet Management (CRUD)

As a **company admin**,
I want to **create and manage multiple outlets**,
So that **I can operate multiple store locations**.

**Acceptance Criteria:**

**Given** a company admin  
**When** they create a new outlet with name, address, code  
**Then** the outlet is created and assigned to the company

**Given** a company admin  
**When** they view all outlets  
**Then** all outlets for their company are listed

**Given** a company admin  
**When** they update outlet details  
**Then** changes are saved and reflected immediately

**Given** a company admin  
**When** they deactivate an outlet  
**Then** new transactions cannot be created for that outlet  
**And** historical data is preserved

---

### Story 1.7: Outlet-Specific Settings (Enhanced)

As a **store manager**,
I want to **configure settings specific to my outlet using a flexible key-value system**,
So that **each outlet can operate with its own configuration while inheriting company defaults**.

**Acceptance Criteria:**

**Given** a store manager  
**When** they view outlet settings  
**Then** they see both company-level defaults and outlet-specific overrides

**Given** a store manager  
**When** they update outlet-specific settings (receipt printer, default payment method, tax rate)  
**Then** changes are saved to outlet_settings table  
**And** apply only to their outlet  
**And** company settings remain unchanged for other outlets

**Given** a setting not overridden at outlet level  
**When** the outlet applies the setting  
**Then** the company-level default is used (cascading)

**Given** new settings added to the system  
**When** admin configures them  
**Then** they automatically appear in outlet settings UI

**Given** setting key with JSON value type  
**When** manager saves complex config (e.g., printer network settings)  
**Then** the JSON is validated and stored properly

**Technical Implementation:**
- Create `outlet_settings` table with: id, outlet_id, key, value, value_type (string, number, boolean, json), created_at, updated_at
- Settings cascade: outlet → company → system default
- API: GET/PATCH /api/outlets/:id/settings

---

## Epic 2: POS - Offline-first Point of Sale

Cashiers can ring sales with items/quantities, apply discounts, process multiple payment methods - all working offline with automatic sync when connectivity is restored.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

### Story 2.1: POS Cart - Add Items & Quantities

As a **cashier**,
I want to **add items to a sale with quantities**,
So that **I can ring up customer purchases**.

**Acceptance Criteria:**

**Given** a logged-in cashier at POS screen  
**When** they search/select an item and specify quantity  
**Then** the item is added to the cart with line total calculated

**Given** an item with outlet-specific price  
**When** the item is added to cart  
**Then** the outlet's price is used

**Given** items already in the cart  
**When** cashier adds more items  
**Then** all items remain in cart with running total

**Given** an invalid item or out-of-stock item  
**When** cashier attempts to add it  
**Then** an error message is displayed

---

### Story 2.2: POS Cart - Apply Discounts

As a **cashier**,
I want to **apply discounts to transactions**,
So that **customers receive promotional pricing**.

**Acceptance Criteria:**

**Given** items in the cart  
**When** cashier applies a percentage discount  
**Then** discount is calculated and subtracted from subtotal

**Given** items in the cart  
**When** cashier applies a fixed amount discount  
**Then** discount is subtracted from subtotal

**Given** a discount code entered  
**When** system validates the code  
**Then** valid codes are applied, invalid codes show error

**Given** multiple discounts applied  
**When** calculating final total  
**Then** discounts are applied in correct order (percentage first, then fixed)

**Given** discount exceeds transaction total  
**Then** total cannot go below zero

---

### Story 2.3: POS - Process Multiple Payment Methods

As a **cashier**,
I want to **process multiple payment methods for a single transaction**,
So that **customers can pay with cash, card, or combination**.

**Acceptance Criteria:**

**Given** a cart with total  
**When** cashier selects payment method (Cash, Card, QR)  
**Then** payment screen shows amount due

**Given** cash payment with amount given  
**When** cashier enters payment amount  
**Then** change is calculated and displayed

**Given** partial payment  
**When** cashier processes one method and indicates remaining  
**Then** remaining balance is shown for next payment

**Given** full payment with any method  
**When** cashier completes payment  
**Then** transaction is finalized and receipt is generated

---

### Story 2.4: POS - Offline Mode with Local Storage

As a **cashier**,
I want to **continue ringing sales when network is unavailable**,
So that **business operations continue during outages**.

**Acceptance Criteria:**

**Given** no network connectivity  
**When** cashier attempts POS login  
**Then** they can log in using cached credentials

**Given** offline status  
**When** cashier adds items and completes a sale  
**Then** transaction is saved to local storage (Dexie)

**Given** offline transaction  
**When** transaction is created  
**Then** a client_tx_id (UUID v4) is generated for the transaction

**Given** offline with queued transactions  
**When** cashier views queue status  
**Then** count of pending transactions is displayed

**Given** offline mode  
**When** system has 7+ days of queued transactions  
**Then** warning is shown to sync when possible

---

### Story 2.5: POS - Sync Transactions When Online

As a **cashier**,
I want to **automatically sync queued transactions when connectivity returns**,
So that **all sales are recorded in the central database**.

**Acceptance Criteria:**

**Given** queued transactions and network connectivity restored  
**When** POS detects online status  
**Then** sync process begins automatically

**Given** sync in progress  
**When** new sale is completed  
**Then** new transaction is added to queue (not blocking sync)

**Given** transaction syncing  
**When** server receives transaction with client_tx_id  
**Then** duplicate check prevents double-posting

**Given** successful sync  
**When** transaction is acknowledged by server  
**Then** transaction is marked as synced in local storage

**Given** sync failure  
**When** server returns error  
**Then** transaction remains in queue for retry  
**And** error is logged for investigation

---

### Story 2.6: POS - Duplicate Prevention During Sync

As a **system**,
I want to **prevent duplicate transactions during sync**,
So that **financial records remain accurate**.

**Acceptance Criteria:**

**Given** transaction with client_tx_id "ABC-123"  
**When** it is sent to server the first time  
**Then** transaction is created successfully

**Given** duplicate request with same client_tx_id "ABC-123"  
**When** it arrives at server  
**Then** transaction is not duplicated  
**And** original transaction ID is returned

**Given** offline transaction that was synced  
**When** cashier attempts to sync again (device didn't receive ack)  
**Then** idempotent response is returned, no duplicate created

---

## Epic 3: Accounting - GL Posting & Reports

All POS transactions automatically post to the general ledger as journal entries. Users can create manual journal entries, view batch history, and run financial reports.

**FRs covered:** FR7, FR8, FR9, FR10, FR11

### Story 3.1: Automatic Journal Entry from POS

As a **system**,
I want to **automatically create journal entries from POS transactions**,
So that **every sale is recorded in the general ledger**.

**Acceptance Criteria:**

**Given** a completed POS transaction synced to server  
**When** the transaction is validated  
**Then** journal entries are generated automatically

**Given** a POS sale of $100 cash  
**When** journal entries are created  
**Then** Debit: Cash $100, Credit: Revenue $100 (simplified)

**Given** a POS sale with tax  
**When** journal entries are created  
**Then** tax portion is posted to Liabilities account

**Given** a POS sale with discount  
**When** journal entries are created  
**Then** discount affects Revenue and potentially Cost of Goods Sold

**Given** journal entry creation  
**When** process completes  
**Then** all entries are in a single batch with reference to POS transaction

---

### Story 3.2: Manual Journal Entry Creation

As an **accountant**,
I want to **create manual journal entries**,
So that **I can record non-POS financial transactions**.

**Acceptance Criteria:**

**Given** accountant with appropriate permissions  
**When** they navigate to journal entry form  
**Then** they can enter multiple debit/credit lines

**Given** journal entry with debit and credit lines  
**When** they submit the entry  
**Then** validation ensures debits equal credits

**Given** journal entry where debits ≠ credits  
**When** they attempt to submit  
**Then** error message prevents submission

**Given** journal entry submitted  
**When** it is saved  
**Then** it is assigned a batch number and entry sequence

---

### Story 3.3: Journal Batch History

As an **accountant**,
I want to **view journal batch history**,
So that **I can audit and trace all journal entries**.

**Acceptance Criteria:**

**Given** journal batches in the system  
**When** accountant views batch list  
**Then** batches are shown with date, description, total debits/credits, status

**Given** a specific batch  
**When** accountant clicks to view details  
**Then** all journal entries in that batch are displayed

**Given** journal entry from POS  
**When** accountant views entry details  
**Then** the original POS transaction reference is shown

**Given** search criteria (date range, account, amount)  
**When** accountant searches journal  
**Then** matching entries are returned

---

### Story 3.4: Trial Balance Report

As an **accountant**,
I want to **run a trial balance report**,
So that **I can verify debits equal credits across all accounts**.

**Acceptance Criteria:**

**Given** journal entries posted to accounts  
**When** accountant runs trial balance  
**Then** all accounts with balances are displayed with debit/credit columns

**Given** trial balance calculation  
**When** report is generated  
**Then** total debits equal total credits (if balanced)

**Given** trial balance with date filter  
**When** accountant selects date range  
**Then** balances reflect transactions up to that date

**Given** trial balance out of balance  
**When** report is generated  
**Then** error/warning is displayed indicating imbalance

---

### Story 3.5: General Ledger Report

As an **accountant**,
I want to **view the general ledger by account**,
So that **I can see detailed transactions per account**.

**Acceptance Criteria:**

**Given** GL report request  
**When** accountant selects an account and date range  
**Then** all journal entries affecting that account are displayed

**Given** GL entry detail  
**When** accountant clicks on an entry  
**Then** full entry details including opposing entries are shown

**Given** GL report with running balance  
**When** accountant views the report  
**Then** each entry shows the running balance after that entry

**Given** multiple accounts  
**When** accountant runs GL for all accounts  
**Then** accounts are grouped by account type (Asset, Liability, Equity, Revenue, Expense)

---

## Epic 4: Items & Catalog - Product Management

Users can manage items/products with outlet-specific pricing and support for multiple item types (product, service, ingredient, recipe).

**FRs covered:** FR25, FR26, FR27

### Story 4.1: Item/Product Management (CRUD)

As a **store manager**,
I want to **create and manage items in the catalog**,
So that **products are available for sale at POS**.

**Acceptance Criteria:**

**Given** store manager  
**When** they create a new item with name, SKU, base price, type  
**Then** item is saved and available for POS

**Given** existing items  
**When** manager searches/browses the catalog  
**Then** items are displayed with name, SKU, price, status

**Given** item details  
**When** manager updates item information  
**Then** changes are saved and reflected at POS

**Given** item no longer sold  
**When** manager deactivates the item  
**Then** item is hidden from POS but preserved in historical transactions

---

### Story 4.2: Outlet-Specific Pricing

As a **store manager**,
I want to **set different prices for items per outlet**,
So that **each store can have local pricing**.

**Given** an item with base price $10  
**When** manager sets outlet-specific price of $12 for Outlet A  
**Then** Outlet A sees $12, other outlets see $10

**Given** item price at company level  
**When** outlet has no override  
**Then** company default price is used

**Given** multiple outlets  
**When** manager bulk-updates prices across outlets  
**Then** each outlet gets the specified price

---

### Story 4.3: Multiple Item Types

As a **store manager**,
I want to **manage different item types**,
So that **the system supports products, services, ingredients, and recipes**.

**Acceptance Criteria:**

**Given** item type = "product"  
**When** item is created  
**Then** standard inventory tracking applies

**Given** item type = "service"  
**When** item is created  
**Then** no inventory tracking, just revenue posting

**Given** item type = "ingredient"  
**When** item is created  
**Then** can be used in recipe calculations

**Given** item type = "recipe"  
**When** item is created  
**Then** ingredient quantities are linked  
**And** cost can be calculated automatically

---

## Epic 5: Settings - Tax, Payment, Module Configuration

Admins can configure tax rates, payment methods, and enable/disable modules per company.

**FRs covered:** FR19, FR20, FR21

### Story 5.1: Tax Rate Configuration

As a **company admin**,
I want to **configure tax rates**,
So that **sales transactions calculate tax correctly**.

**Acceptance Criteria:**

**Given** company admin  
**When** they create a tax rate (name, percentage, inclusive/exclusive)  
**Then** tax rate is saved for the company

**Given** multiple tax rates (e.g., VAT, Service Charge)  
**When** POS calculates tax on a sale  
**Then** all applicable taxes are calculated

**Given** tax configuration at company  
**When** outlet has no override  
**Then** company tax rates apply

---

### Story 5.2: Payment Method Configuration

As a **company admin**,
I want to **configure payment methods**,
So that **POS can accept various payment types**.

**Acceptance Criteria:**

**Given** company admin  
**When** they enable/disable payment methods (Cash, Card, QR, Wallet)  
**Then** available methods appear at POS

**Given** payment method settings  
**When** they configure method-specific settings (terminal ID, merchant ID)  
**Then** settings are stored and used during payment processing

---

### Story 5.3: Module Enable/Disable per Company

As a **company admin**,
I want to **enable or disable modules per company**,
So that **companies only see relevant features**.

**Acceptance Criteria:**

**Given** company admin  
**When** they view available modules (POS, Accounting, Inventory)  
**Then** enabled modules are accessible, disabled are hidden

**Given** module disabled  
**When** user tries to access that module  
**Then** access is denied with appropriate message

---

## Epic 6: Reporting - Sales Reports & Exports

Users can view sales reports by date range, export reports for accountants, and review POS transaction history.

**FRs covered:** FR22, FR23, FR24

### Story 6.1: Sales Reports by Date Range

As a **store manager**,
I want to **view sales reports filtered by date range**,
So that **I can analyze sales performance**.

**Acceptance Criteria:**

**Given** sales data in system  
**When** manager selects date range and runs report  
**Then** sales summary is displayed (total sales, transactions, avg transaction value)

**Given** sales report  
**When** manager views the report  
**Then** breakdown by payment method, by hour/day is shown

**Given** multiple outlets  
**When** manager runs report  
**Then** can filter by outlet or view consolidated

---

### Story 6.2: Export Reports for Accountants

As an **accountant**,
I want to **export financial reports**,
So that **I can share data with external accountants**.

**Acceptance Criteria:**

**Given** any financial report  
**When** accountant clicks Export  
**Then** they can choose format (CSV, Excel, PDF)

**Given** exported report  
**When** file is generated  
**Then** it contains relevant data with proper headers

**Given** large dataset export  
**When** accountant requests export  
**Then** export is generated asynchronously  
**And** download link is provided when ready

---

### Story 6.3: POS Transaction History

As a **store manager**,
I want to **view POS transaction history**,
So that **I can look up past sales**.

**Acceptance Criteria:**

**Given** transactions in system  
**When** manager searches/browses transaction history  
**Then** transactions are shown with date, total, payment method, status

**Given** specific transaction  
**When** manager clicks to view details  
**Then** full transaction is displayed (items, quantities, prices, discounts, payments)

**Given** transaction search  
**When** manager searches by receipt number, date, or amount  
**Then** matching transactions are returned

---

## Epic 7: Sync Infrastructure - Technical Debt Fixes

Critical infrastructure fixes required for production readiness of the modular sync system.

### Story 7.1: Fix Sync Version Manager Database Integration

As a **system**,
I want **version tracking to persist to the database**,
So that **version numbers survive server restarts and scale to high-volume outlets**.

**Acceptance Criteria:**

**Given** a company with sync tier versions  
**When** the version manager increments a tier version  
**Then** the version is stored in the `sync_tier_versions` table  
**And** survives server restart

**Given** a high-volume outlet with frequent REALTIME updates  
**When** version increments exceed 4.2 billion  
**Then** no integer overflow occurs (BIGINT supports ~18 quintillion)

**Given** a request for current version  
**When** queryDatabaseVersion() is called  
**Then** the actual database value is returned (not hardcoded)

---

### Story 7.2: Implement Audit Event Persistence

As an **administrator**,
I want **sync operations to be audit-logged persistently**,
So that **I can investigate issues and track system behavior after restarts**.

**Acceptance Criteria:**

**Given** a sync operation (push/pull)  
**When** the operation completes  
**Then** an audit event is written to the database  
**And** includes: timestamp, operation_type, tier, status, duration_ms, company_id

**Given** a server restart  
**When** the system comes back online  
**Then** previous audit events are still queryable from the database

**Given** an audit log query  
**When** filtering by company_id and date range  
**Then** results are returned within 500ms (indexed properly)

---

### Story 7.3: Add Authentication & Rate Limiting to Sync API

As a **security engineer**,
I want **sync API endpoints to require authentication and enforce rate limits**,
So that **the system is protected from abuse and reconnaissance**.

**Acceptance Criteria:**

**Given** an unauthenticated request to `/api/sync/health`  
**When** the request is made  
**Then** the request is rejected with 401 Unauthorized

**Given** an authenticated user  
**When** they make more than 120 REALTIME requests per minute  
**Then** subsequent requests return 429 Too Many Requests  
**And** include RateLimit-Remaining header

**Given** a valid request within limits  
**When** the response is returned  
**Then** it includes headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

---

### Story 7.4: Fix Database Schema & Data Retention

As an **operator**,
I want **database indexes optimized and retention policies enforced**,
So that **the system performs well at scale and data doesn't grow unbounded**.

**Acceptance Criteria:**

**Given** a query on backoffice_sync_queue by company and status  
**When** filtering by company_id and sync_status  
**Then** the query uses composite index (not separate index scans)

**Given** sync_operations records older than 30 days  
**When** the retention job runs  
**Then** those records are automatically purged

**Given** audit logs older than 90 days  
**When** the retention job runs  
**Then** those records are archived or purged

**Given** backoffice_sync_queue records completed more than 7 days ago  
**When** the retention job runs  
**Then** those records are automatically purged

---

## Related Epic Documents

### Backoffice UX Refactoring
**File:** `epics-backoffice-ux.md`  
**Status:** Ready for Implementation  
**Epics:** 8, 9, 10, 11 (Epic 11 Deferred)  
**Scope:** UX improvements for existing backoffice application

**Included Epics:**
- **Epic 8:** Backoffice-Items-Split (P0) - Split 2,195-line Items & Prices page
- **Epic 9:** Backoffice-Users-Simplify (P1) - Redesign complex role management
- **Epic 10:** Backoffice-Consistency-Standards (P2) - Standardize 6-8 problem pages
- **Epic 11:** Backoffice-Performance (P3) - Deferred

**Total Stories:** 19 active stories  
**Total Effort:** ~26-33 hours
