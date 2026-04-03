# @jurnapod/modules-reporting

Financial and operational reporting for Jurnapod ERP.

## Overview

The `@jurnapod/modules-reporting` package provides:

- **Financial statements** — Trial balance, P&L, balance sheet
- **Sales reports** — Revenue by item, outlet, period
- **Operational reports** — Stock movement, cash flow
- **Report builder** — Configurable report definitions
- **Classification engine** — Account classification for reporting

## Installation

```bash
npm install @jurnapod/modules-reporting
```

## Usage

### Trial Balance

```typescript
import { TrialBalanceReport } from '@jurnapod/modules-reporting/reports';

const report = new TrialBalanceReport(db);

const result = await report.generate({
  companyId: 1,
  fiscalYearId: 2024,
  asOfDate: new Date('2024-12-31'),
  currency: 'IDR'
});

console.log(result.totalDebit === result.totalCredit); // true
```

### Profit & Loss

```typescript
import { ProfitLossReport } from '@jurnapod/modules-reporting/reports';

const report = new ProfitLossReport(db);

const result = await report.generate({
  companyId: 1,
  fiscalYearId: 2024,
  periodStart: new Date('2024-01-01'),
  periodEnd: new Date('2024-12-31'),
  comparePreviousPeriod: true
});

// result.revenue: [{ account, amount }, ...]
// result.expenses: [{ account, amount }, ...]
// result.netIncome: number
```

### Sales by Item

```typescript
import { SalesByItemReport } from '@jurnapod/modules-reporting/reports';

const report = new SalesByItemReport(db);

const result = await report.generate({
  companyId: 1,
  outletIds: [1, 2, 3],
  periodStart: new Date('2024-01-01'),
  periodEnd: new Date('2024-01-31'),
  groupBy: 'item' | 'category' | 'outlet'
});
```

## Report Types

| Report | Description |
|--------|-------------|
| `TrialBalanceReport` | All accounts with debit/credit balances |
| `ProfitLossReport` | Revenue, expenses, and net income |
| `BalanceSheetReport` | Assets, liabilities, and equity |
| `SalesByItemReport` | Sales grouped by item/category/outlet |
| `CashFlowReport` | Cash inflows and outflows |
| `StockMovementReport` | Inventory movements |

## Architecture

```
packages/modules-reporting/
├── src/
│   ├── index.ts                    # Main exports
│   ├── reports/
│   │   ├── services.ts             # Report generation
│   │   ├── types.ts               # Report types
│   │   ├── db.ts                  # Data queries
│   │   └── helpers.ts             # Formatting
│   ├── classification/             # Account classification
│   └── contracts/                  # Report interfaces
```

## Related Packages

- [@jurnapod/modules-accounting](../accounting) - Journal data
- [@jurnapod/modules-sales](../sales) - Sales data
- [@jurnapod/db](../../packages/db) - Database connectivity
- [@jurnapod/shared](../../packages/shared) - Shared schemas