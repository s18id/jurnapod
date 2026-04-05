# ADR-0019: SubledgerBalanceProvider Sign Convention

**Date:** 2026-04-05
**Status:** Accepted
**Deciders:** Ahmad, Architect

## Context

Epic 32 requires GL vs subledger reconciliation for multiple account types (CASH, INVENTORY, RECEIVABLES, PAYABLES). Different subledger systems may have different sign conventions.

## Decision

We establish a **canonical sign rule** for all subledger providers:

### Canonical Sign Rule

- **Debit = positive**
- **Credit = negative**

This matches standard accounting convention and ensures consistent reconciliation.

### SignedAmount Type

```typescript
export type SignedAmount = number & { readonly __brand: "SignedAmount_DebitPositive" };

export interface SignedAmountBreakdown {
  debitAmount: number;   // >= 0
  creditAmount: number;  // >= 0  
  signedNetAmount: SignedAmount; // debitAmount - creditAmount
}
```

### SubledgerBalanceProvider Interface

```typescript
export interface SubledgerBalanceProvider {
  readonly subledgerType: SubledgerTypeCode;
  
  getBalance(query: SubledgerBalanceQuery): Promise<SubledgerBalanceResult>;
  
  checkReadiness?(): Promise<void>;
}

export interface SubledgerBalanceQuery {
  companyId: number;
  outletId?: number;
  asOfEpochMs: number;
  fiscalYearId?: number;
  periodId?: number;
  accountId?: number;
  includeDrilldown?: boolean;
  drilldownLimit?: number;
}

export interface SubledgerBalanceResult {
  companyId: number;
  outletId?: number;
  subledgerType: SubledgerTypeCode;
  asOfEpochMs: number;
  accountId?: number;
  signedBalance: SignedAmount;
  breakdown: SignedAmountBreakdown;
  dataVersion?: number;
  drilldown?: ReconciliationDrilldown;
}
```

### Drilldown for Explainability

Each provider must support drilldown to explain variances:

```typescript
export interface ReconciliationDrilldownLine {
  sourceType: "JOURNAL_ENTRY" | "JOURNAL_LINE" | "SUBLEDGER_TX" | "ADJUSTMENT" | "OPENING_BALANCE";
  sourceId: string;
  postedAtEpochMs: number;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  signedImpact: SignedAmount;
  runningSignedBalance?: SignedAmount;
  dimensions?: Readonly<Record<string, string | number>>;
}
```

### Subledger Types

MVP: CASH, INVENTORY, RECEIVABLES, PAYABLES
Extensible: `CUSTOM:${string}` for future types

## Consequences

**Positive:**
- Consistent sign convention across all providers
- Drilldown enables variance explanation
- Extensible for future subledger types

**Negative:**
- Providers must normalize sign convention
- Existing code may use different convention

**Neutral:**
- Audit trail preserved in drilldown
