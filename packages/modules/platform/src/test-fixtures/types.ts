// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Platform domain fixture types.
 */

export type CompanyFixture = {
  id: number;
  code: string;
  name: string;
  timezone?: string | null;
  currency_code?: string;
};

export type OutletFixture = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  timezone?: string | null;
};
