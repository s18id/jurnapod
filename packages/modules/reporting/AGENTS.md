# AGENTS.md — @jurnapod/modules-reporting

## Package Purpose

Financial and operational reporting for Jurnapod ERP — trial balance, P&L, balance sheet, sales reports, and custom report generation.

**Core Capabilities:**
- **Financial statements**: Trial balance, P&L, balance sheet
- **Sales reports**: Revenue by item, outlet, period
- **Operational reports**: Stock movement, cash flow
- **Report builder**: Configurable report definitions
- **Classification engine**: Account classification for reporting

**Boundaries:**
- ✅ In: Report generation, data aggregation, classification
- ❌ Out: Journal posting (modules-accounting), transaction processing

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Report Generation

```typescript
import { TrialBalanceReport, ProfitLossReport } from '@jurnapod/modules-reporting/reports';

const report = new TrialBalanceReport(db);

// Generate trial balance
const result = await report.generate({
  companyId: 1,
  fiscalYearId: 2024,
  asOfDate: new Date('2024-12-31'),
  currency: 'IDR'
});

// result.accounts: [{ code, name, debit, credit }, ...]
// result.totalDebit: number
// result.totalCredit: number
```

### Report Contract

```typescript
import type { ReportParams, ReportResult } from '@jurnapod/modules-reporting/contracts';

interface TrialBalanceParams extends ReportParams {
  fiscalYearId: number;
  asOfDate: Date;
}

interface TrialBalanceResult extends ReportResult {
  accounts: AccountBalance[];
  totalDebit: number;
  totalCredit: number;
}
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| Reports | `reports/services.ts` | Report generation services |
| Classification | `classification/index.ts` | Account classification |
| Contracts | `contracts/index.ts` | Report interfaces |
| Types | `reports/types.ts` | Report type definitions |
| DB | `reports/db.ts` | Report data queries |
| Helpers | `reports/helpers.ts` | Report formatting utilities |

### File Structure

```
packages/modules/reporting/
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── reports/
│   │   ├── index.ts               # Report services
│   │   ├── services.ts            # Report generation
│   │   ├── types.ts               # Report types
│   │   ├── db.ts                  # Data queries
│   │   └── helpers.ts             # Formatting
│   │
│   ├── classification/
│   │   └── index.ts               # Account classification
│   │
│   └── contracts/
│       └── index.ts                # Report interfaces
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### Report Calculations

1. **Use DECIMAL for money** — never floating point
2. **Respect fiscal year boundaries** — filter by `fiscal_year_id`
3. **Include sign conventions** — debit positive, credit negative (or vice versa per report)
4. **Verify trial balance balances** — total debits must equal total credits

---

## Review Checklist

When modifying this package:

- [ ] Report calculations use DECIMAL/bigint for money
- [ ] Trial balance debits equal credits
- [ ] P&L only includes current period transactions
- [ ] Balance sheet includes all asset, liability, equity accounts
- [ ] Fiscal year boundaries properly applied
- [ ] Account classification is correct and complete
- [ ] Kysely query builder used (not raw SQL)

---

## Related Packages

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas
- `@jurnapod/modules-accounting` — Journal data source
- `@jurnapod/modules-sales` — Sales data source

For project-wide conventions, see root `AGENTS.md`.