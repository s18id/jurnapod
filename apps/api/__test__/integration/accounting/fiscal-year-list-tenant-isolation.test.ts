// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, getTestBaseUrl, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import {
  assignUserGlobalRole,
  createTestCompany,
  createTestAccount,
  createTestFiscalYear,
  createTestUser,
  getRoleIdByCode,
  loginForTest,
  resetFixtureRegistry,
} from '../../fixtures';

const testPassword = 'FiscalYearTenantIso123!';

type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

describe('accounts fiscal years tenant isolation', { timeout: 60000 }, () => {
  let baseUrl: string;
  let companyAId: number;
  let companyBId: number;
  let companyAToken: string;
  let companyBFiscalYearCode: string;
  let companyAAccountId: number;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const companyA = await createTestCompany({
      name: 'Fiscal Year Tenant Isolation A',
      code: makeTag('FYTA'),
    });
    const companyB = await createTestCompany({
      name: 'Fiscal Year Tenant Isolation B',
      code: makeTag('FYTB'),
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    const ownerRoleId = await getRoleIdByCode('OWNER');
    const companyAOwner = await createTestUser(companyAId, {
      email: `${makeTag('fytaowner')}@example.com`,
      name: 'Fiscal Year Tenant Isolation Owner A',
      password: testPassword,
    });
    await assignUserGlobalRole(companyAOwner.id, ownerRoleId);
    companyAToken = await loginForTest(baseUrl, companyA.code, companyAOwner.email, testPassword);

    const companyAAccount = await createTestAccount({
      companyId: companyAId,
      code: makeTag('FYTACCT', 32),
      name: 'Fiscal Year Tenant Isolation Account A',
      typeName: 'ASSET',
    });
    companyAAccountId = companyAAccount.id;

    const companyBFiscalYear = await createTestFiscalYear(companyBId, {
      year: 2098,
      startDate: '2098-01-01',
      endDate: '2098-12-31',
      status: 'OPEN',
    });
    companyBFiscalYearCode = companyBFiscalYear.code;
  }, 60000);

  afterAll(async () => {
    try {
      resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  }, 30000);

  it('rejects caller-supplied company_id for another tenant', async () => {
    const res = await fetch(
      `${baseUrl}/api/accounts/fiscal-years?company_id=${companyBId}&include_closed=true`,
      {
        headers: { Authorization: `Bearer ${companyAToken}` },
      },
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('COMPANY_MISMATCH');
    expect(JSON.stringify(body)).not.toContain(companyBFiscalYearCode);
  });

  it('allows the authenticated tenant to list fiscal years when company_id matches', async () => {
    await createTestFiscalYear(companyAId, {
      year: 2099,
      startDate: '2099-01-01',
      endDate: '2099-12-31',
      status: 'OPEN',
    });

    const res = await fetch(`${baseUrl}/api/accounts/fiscal-years?company_id=${companyAId}`, {
      headers: { Authorization: `Bearer ${companyAToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: true; data: Array<{ company_id: number; code: string }> };
    expect(body.success).toBe(true);
    expect(body.data.every((fiscalYear) => fiscalYear.company_id === companyAId)).toBe(true);
    expect(body.data.map((fiscalYear) => fiscalYear.code)).not.toContain(companyBFiscalYearCode);
  });

  it('keeps numeric account detail route accessible after fiscal-year route specificity fix', async () => {
    const res = await fetch(`${baseUrl}/api/accounts/${companyAAccountId}`, {
      headers: { Authorization: `Bearer ${companyAToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: true; data: { id: number; company_id: number } };
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(companyAAccountId);
    expect(body.data.company_id).toBe(companyAId);
  });
});
