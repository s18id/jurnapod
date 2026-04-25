// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Accounting domain fixture types.
 */

export type FiscalYearFixture = {
  id: number;
  company_id: number;
  code: string;
  year: number;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
};

export type FiscalPeriodFixture = {
  id: number;
  fiscalYearId: number;
  periodNumber: number;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
};

export type APReconciliationSettingsFixture = {
  companyId: number;
  accountIds: number[];
};
