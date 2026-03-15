---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish"]
inputDocuments: ["/home/ahmad/jurnapod/README.md"]
workflowType: 'prd'
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 1
classification:
  projectType: "API Backend + Web App (PWA)"
  domain: "ERP / Business Software"
  complexity: "medium"
  projectContext: "brownfield"
---

# Product Requirements Document - jurnapod

**Author:** Ahmad
**Date:** 2026-03-15

## Executive Summary

**Jurnapod** is a modular ERP monorepo designed to bridge the gap between point-of-sale operations and accounting. With "From cashier to ledger" as its guiding principle, the system places Accounting/GL at the center, enabling seamless flow from POS transactions to financial records.

**Target Users:** Small to medium businesses, retail outlets, and service providers who need a simple yet comprehensive ERP solution that grows with their needs.

**Problem Solved:** Existing ERP solutions are either too complex, force mandatory upgrades, or lack modularity. Businesses need accounting software that's custom-tailored to their specific needs—simple enough for immediate use, but extendable as they grow.

### What Makes This Special

Jurnapod differentiates through:

- **Modular & Extendable:** Users enable only the modules they need (POS, Sales, Accounting, Inventory, Purchasing) and add more as their business grows
- **Simplicity First:** Built for ease of use—from cashier to ledger, without the complexity of traditional ERP systems
- **Custom-Tailored:** Unlike forced-upgrade solutions, Jurnapod adapts to business needs rather than forcing businesses to adapt to software limitations
- **Offline-First POS:** Reliable transaction sync with idempotent client-side transaction IDs ensures data integrity even on unstable networks

## Project Classification

- **Project Type:** API Backend + Web App (PWA)
- **Domain:** ERP / Business Software
- **Complexity:** Medium
- **Project Context:** Brownfield (existing system)

## Success Criteria

### User Success

- **It works** - Users can complete their tasks reliably
- **Easy to use** - Minimal learning curve, intuitive interface for cashiers and small business owners
- **Helps small business** - Solves real problems that small business owners face daily

### Business Success

- **Reliable POS-to-ledger flow** - Seamless accounting integration from cashier to ledger
- **Module adoption** - Businesses can start simple and add modules as they grow
- **No forced upgrades** - Users retain control over their software evolution

### Technical Success

- **No critical bugs** - Stable, production-ready system
- **Offline-first reliability** - POS works even with unstable networks through idempotent sync
- **Data integrity** - No duplicate transactions, complete audit trail

## Product Scope

### MVP - Minimum Viable Product

- Core POS with offline sync and idempotent transaction IDs
- Basic Accounting/GL posting (journal batches and lines)
- Company & outlet management
- User authentication and authorization
- Basic reporting (journals, trial balance)

### Growth Features (Post-MVP)

- Sales module (service invoices, payment in, light AR)
- Inventory module (stock movements, recipe/BOM)
- Purchasing module (PO, GRN, AP)
- Advanced reporting (P&L, Balance Sheet)

### Vision (Future)

- Full modular ERP suite
- Multi-company support
- Advanced analytics
- Third-party integrations

## User Journeys

### Owner Journey - Business Overview

**Persona:** Maya, 35-year-old owner of a small cafe with 2 outlets

**Situation:** Maya runs a growing cafe business. She started with one location and recently opened a second. She's tech-savvy but doesn't have time for complex software. She needs to understand her business health at a glance.

**Opening Scene:**
Maya arrives at her main cafe at 7 AM, before the morning rush. She opens her laptop and logs into Jurnapod Backoffice. The dashboard immediately shows her:
- Today's sales: $1,247 (up 12% from yesterday)
- Transactions: 89
- Top item: Cappuccino (23 sold)
- Alerts: 1 inventory low warning

**Rising Action:**
1. **Dashboard Review** - Maya sees the business health at a glance
2. **Drill into Sales** - She checks which items are selling well this week
3. **Financial Overview** - She reviews the P&L to see profit margins
4. **Staff Check** - Reviews who's working today and their performance
5. **Inventory Alert** - Checks the low stock warning for milk

**Climax:**
The moment of clarity - Maya sees that her signature latte is margin-positive despite the recent milk price increase. She notices the second outlet is underperforming and decides to check their inventory. She exports the weekly report to share with her accountant.

**Resolution:**
Maya closes the day confident about her business. She made three quick decisions that will improve operations:
- Reorder milk before weekend rush
- Schedule additional staff at the underperforming outlet
- Promote the high-margin cappuccino

### Cashier Journey - Point of Sale

**Persona:** Rio, 22-year-old cashier at a busy cafe outlet

**Situation:** Rio works the counter during morning rush. He needs to ring up orders quickly, handle payments, and keep the line moving—even when the internet goes down.

**Opening Scene:**
Rio arrives at 6:30 AM and logs into the POS app on the tablet. The app loads instantly—even offline. He sees today's specials and confirms his register is ready.

**Rising Action:**
1. **Customer Order** - Customer orders a latte and a croissant
2. **Item Search** - Rio searches for "latte" or taps the drink category
3. **Add to Cart** - Taps latte ($4.50), croissant ($3.00), customizes milk (oat +$0.70)
4. **Apply Discount** - Customer has a loyalty discount (5% off)
5. **Payment** - Customer pays with cash; Rio enters amount received, system calculates change
6. **Receipt** - Digital receipt sent to customer's email, printed slip for record

**Climax:**
Transaction completes in under 30 seconds. The sale syncs to the server (or queues offline if no connection). Rio calls out "Latte and croissant!" and serves the next customer.

**Resolution:**
By noon, Rio has processed 127 transactions. When the internet flickered twice, the POS kept working seamlessly. End of day, he views his sales summary on the tablet.

### Journey Requirements Summary

The Owner journey reveals these required capabilities:

- **Dashboard** - Business health at a glance with key metrics
- **Sales Reports** - Transaction history, item performance, trends
- **Financial Reports** - P&L, Balance Sheet, Trial Balance, Journals
- **User Management** - Create and manage staff accounts with roles
- **Outlet Management** - Multi-outlet visibility and control
- **Inventory Overview** - Stock levels and alerts
- **Data Export** - Download reports for accountants and analysis
- **Settings Configuration** - Tax rates, payment methods, business settings

The Cashier journey reveals these required capabilities:

- **POS Interface** - Fast item search, favorites, categories
- **Offline Operation** - Works without internet connectivity
- **Payment Processing** - Cash, card, digital payments
- **Receipt Generation** - Digital and printed receipts
- **Discount Handling** - Percentage, fixed, promotional discounts
- **Void/Refund** - Manager-approved void and refund at POS
- **Shift Management** - Start/end shift, drawer reconciliation

## Domain-Specific Requirements

### Compliance & Regulatory

- Financial reporting standards compliance
- Audit trail requirements (who did what, when)
- Data retention for accounting purposes (7+ years)
- Tax compliance (configurable tax rates per jurisdiction)

### Technical Constraints

- Transaction integrity - no partial writes, all financial operations must be atomic
- Role-based access control (RBAC) per role definitions
- Multi-company/multi-outlet data isolation
- Monetary values use DECIMAL(18,2) - no FLOAT/DOUBLE for money
- Idempotent sync for offline POS

### Integration Requirements

- Payment processor integration (future)
- Tax calculation services (future)
- ODS/Excel import for data migration

### Risk Mitigations

- Duplicate transaction prevention via client_tx_id (UUID v4)
- Audit logging for all data changes
- Void/Refund workflows instead of silent corrections
- Immutable journal entries with correction entries

### Chart of Accounts Structure

**Standard COA for Retail/Service Business:**

| Account Type | Default Account | Code Range |
|--------------|-----------------|------------|
| **Assets** | | 1000-1999 |
| Cash | Cash on Hand | 1000 |
| Bank | Bank Account | 1100 |
| Accounts Receivable | Trade Receivables | 1200 |
| **Liabilities** | | 2000-2999 |
| Accounts Payable | Trade Payables | 2000 |
| Sales Tax Payable | VAT/GST Output | 2100 |
| **Equity** | | 3000-3999 |
| Owner's Equity | Owner's Capital | 3000 |
| Retained Earnings | Retained Earnings | 3100 |
| **Revenue** | | 4000-4999 |
| Sales Revenue | Product Sales | 4000 |
| Service Revenue | Service Income | 4100 |
| **Cost of Goods Sold** | | 5000-5999 |
| COGS | Cost of Goods Sold | 5000 |
| **Expenses** | | 6000-6999 |
| Rent Expense | Rent | 6000 |
| Utilities | Utilities | 6100 |
| Salaries | Wages & Salaries | 6200 |

### POS Transaction GL Mapping (FR7)

| POS Action | Debit | Credit |
|------------|-------|--------|
| Cash Sale | Cash (1000) | Sales Revenue (4000) |
| Card Sale | Bank (1100) | Sales Revenue (4000) |
| Tax Collected | Cash/Bank | Sales Tax Payable (2100) |
| Discount Given | Sales Revenue (4000) | Cash/Bank |

## Innovation & Novel Patterns

### Detected Innovation Areas

**Path 1: Modular ERP Innovation**
- Traditional ERPs force full-suite adoption
- jurnapod's innovation: Pay only for what you need, add modules as you grow
- Business model innovation - no forced upgrades

**Path 2: Offline-First POS Innovation**
- Most POS systems require constant connectivity
- jurnapod's innovation: Works offline, syncs when reconnected
- Critical for developing markets, unstable networks, mobile vendors

**Path 3: Accounting-Centric Innovation**
- Most POS systems are separate from accounting software
- jurnapod's innovation: GL at the center - every transaction flows to ledger
- "From cashier to ledger" - seamless financial integration

**Path 4: Simplicity-First Innovation**
- Existing ERPs require training and implementation consultants
- jurnapod's innovation: Ease of use as core principle
- "Simple but enough to cater all you need"

### Market Context & Competitive Landscape

The ERP market is dominated by:
- Complex enterprise systems (SAP, Oracle) - overkill for SMB
- Simple POS systems - disconnected from accounting
- Cloud ERPs - subscription lock-in, forced upgrades

jurnapod's position: Modular simplicity with accounting at the center - a gap in the current market.

### Validation Approach

- MVP: Core POS + Accounting flow
- Measure: Time from POS sale to GL posting
- Test: User can enable/disable modules without upgrade friction

### Risk Mitigation

- Offline sync complexity: Idempotent client_tx_id prevents duplicates
- Accounting accuracy: GL at center ensures every transaction is traceable
- Module complexity: Clear dependencies between modules

## API Backend + Web App (PWA) Specific Requirements

### Project-Type Overview

jurnapod consists of three interconnected applications:
- **API Server**: REST API with JSON
- **POS PWA**: Offline-first Progressive Web App
- **Backoffice**: Web-based admin dashboard

### API Architecture

| Module | Endpoints |
|--------|-----------|
| **Auth** | POST /api/auth/login |
| **POS Sync** | GET /api/sync/pull, POST /api/sync/push |
| **Sales** | POST /api/sales/invoices, POST /api/sales/invoices/:id/post, GET /api/sales/invoices/:id/pdf |
| **Settings** | GET/PUT /api/settings/config, GET/PUT /api/settings/modules, GET/POST /api/settings/tax-rates |
| **Reports** | GET /api/reports/general-ledger, /trial-balance, /profit-loss, /journals, /pos-transactions |
| **Accounting** | POST /api/accounts/imports |

### First Principles Improvements

**API Design:**
- Hybrid approach: REST for CRUD, WebSocket for real-time updates (future)
- Delta-sync: Only changed data to reduce bandwidth

**Authentication:**
- JWT-based for primary auth
- API keys for third-party integrations (future)

**Data Formats:**
- JSON for all API requests/responses
- Decimal(18,2) for monetary values

**Rate Limiting:**
- POS sync endpoints prioritize reliability over speed
- Queue-based processing for bulk operations

### PWA Requirements

- Offline-first for POS (critical)
- Service worker for app shell caching
- IndexedDB for local transaction storage
- Progressive offline for backoffice (future)

### Technical Architecture Considerations

- Monorepo structure with shared packages
- TypeScript + Zod for type safety
- MySQL 8.0+ for data persistence
- Idempotent sync via client_tx_id (UUID v4)

### Implementation Considerations

- POS must work offline with reliable sync
- GL at center - every transaction flows to accounting
- Multi-tenant: company_id and outlet_id scoping

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP + Experience MVP
- Focus on core value proposition: POS + GL = working financial flow
- Emphasize simplicity and ease of use from day one

**Resource Requirements:**
- Core team: Backend developer, Frontend developer
- Database: MySQL 8.0+
- Infrastructure: Can start with single server

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Cashier: Ring up sales via POS
- Owner: View dashboard and basic reports

**Must-Have Capabilities:**
- POS with offline sync (idempotent client_tx_id)
- Basic GL posting (journal batches and lines)
- Company & outlet management
- User authentication and authorization (JWT + RBAC)
- Basic reports (journals, trial balance)

### Post-MVP Features

**Phase 2 (Growth):**
- Sales module (service invoices, payment in, light AR)
- Inventory module (stock movements, recipe/BOM)
- Advanced reports (P&L, Balance Sheet)
- User management with roles

**Phase 3 (Expansion):**
- Purchasing module (PO, GRN, AP)
- Multi-company support
- Advanced analytics
- Third-party integrations

### Risk Mitigation Strategy

**Technical Risks:**
- Offline sync complexity: Mitigated with idempotent client_tx_id (UUID v4)
- Transaction integrity: Atomic journal posting with rollback

**Market Risks:**
- Need to validate: POS-to-ledger flow works seamlessly
- Measure: Time from POS sale to GL posting

**Resource Risks:**
- Can launch with smaller feature set if needed
- Core MVP requires basic team (2 devs)

## Functional Requirements

### 1. POS (Point of Sale)

- FR1: Cashiers can ring up sales with items and quantities
- FR2: Cashiers can apply discounts to transactions
- FR3: Cashiers can process multiple payment methods
- FR4: POS works offline without network connectivity
- FR5: POS syncs transactions when connectivity is restored
- FR6: System prevents duplicate transactions during sync

### 2. Accounting / GL

- FR7: All POS transactions post to journal entries automatically
- FR8: Users can create manual journal entries
- FR9: Users can view journal batch history
- FR10: Users can run trial balance reports
- FR11: Users can view general ledger reports

### 3. User Management

- FR12: Users can log in with email and password
- FR13: Users have role-based access control (RBAC)
- FR14: Admins can create and manage user accounts
- FR15: Admins can assign roles to users

### 4. Company & Outlet Management

- FR16: Users can manage company settings
- FR17: Users can manage multiple outlets
- FR18: Users can configure outlet-specific settings

### 5. Settings & Configuration

- FR19: Users can configure tax rates
- FR20: Users can configure payment methods
- FR21: Users can enable/disable modules per company

### 6. Reporting

- FR22: Users can view sales reports by date range
- FR23: Users can export reports for accountants
- FR24: Users can view POS transaction history

### 7. Items & Catalog

- FR25: Users can manage items/products
- FR26: Users can set prices per outlet
- FR27: System supports multiple item types (product, service, ingredient, recipe)

## Non-Functional Requirements

### Performance

- POS transaction processing: < 1 second response time
- Sync operations: Complete within 30 seconds when online
- Report generation: < 5 seconds for standard reports
- API response time: < 500ms for standard CRUD operations

### Security

- All data encrypted in transit (TLS 1.2+)
- Passwords hashed with Argon2id (default) or bcrypt
- JWT tokens with configurable expiry
- Role-based access control enforced at API level
- Audit trail for all financial data changes

### Data Integrity & Reliability

- ACID compliance on all journal transactions
- InnoDB with proper transaction isolation
- Idempotent sync prevents duplicate transactions
- No partial writes - transactions are atomic
- Immutable journal entries with correction entries

### Scalability

- Support multiple outlets per company
- Support multiple users per outlet
- Database designed for 10x growth

### Usability

- New cashier can be trained in < 30 minutes
- POS optimized for tablet touch interface
- Backoffice responsive on desktop

### Availability

- 99.9% uptime during business hours (defined as 6 AM - 11 PM local time, 7 days/week)
- POS works offline with local storage (up to 7 days of transactions queued)
- Graceful degradation when connectivity returns
- RTO: 4 hours for critical failures
- RPO: 1 hour for data recovery

### Offline Sync Protocol

- **Conflict Resolution Strategy**:
  - Non-financial conflicts: Last-write-wins (e.g., item favorites)
  - Financial conflicts: Flag for manual review by accountant
  - Duplicate detection: client_tx_id (UUID v4) prevents duplicates
- **Sync Queue**: FIFO with priority for older transactions
- **Retry Policy**: Exponential backoff with max 5 retries
- **Offline Duration**: Supports up to 7 days offline (configurable)

### Testing

- 80%+ test coverage on critical paths (auth, sync, journal posting)
- Automated test cases for offline/network flakiness scenarios

### Accessibility

- WCAG 2.1 AA compliance for backoffice
- Responsive design for POS (tablet) and backoffice (desktop)

### Integration

- REST API for third-party integrations (future)
- JSON data format standard
- Data export capability for accounting purposes

