// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb } from '../../helpers/db';
import { acquireReadLock, getTestBaseUrl, releaseReadLock } from '../../helpers/setup';
import { makeTag } from '../../helpers/tags';
import {
  assignUserGlobalRole,
  createTestAccount,
  createTestCompany,
  createTestUser,
  getRoleIdByCode,
  loginForTest,
  resetFixtureRegistry,
} from '../../fixtures';

const testPassword = 'AccountUpdateBlocker123!';

type ApiResponse<T> = { success: true; data: T };
type ApiErrorResponse = { success: false; error: { code: string; message: string } };
type AccountResponse = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  is_active: boolean;
};

describe('accounts.update', { timeout: 60000 }, () => {
  let baseUrl: string;
  let companyId: number;
  let ownerToken: string;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const company = await createTestCompany({
      name: 'Account Update Blocker Company',
      code: makeTag('AUBC'),
    });
    companyId = company.id;

    const ownerRoleId = await getRoleIdByCode('OWNER');
    const owner = await createTestUser(companyId, {
      email: `${makeTag('aubowner')}@example.com`,
      name: 'Account Update Blocker Owner',
      password: testPassword,
    });
    await assignUserGlobalRole(owner.id, ownerRoleId);
    ownerToken = await loginForTest(baseUrl, company.code, owner.email, testPassword);
  }, 60000);

  afterAll(async () => {
    try {
      resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  }, 30000);

  it('persists PUT account field updates', async () => {
    const account = await createTestAccount({
      companyId,
      code: makeTag('AUPD'),
      name: 'Account Update Before',
      typeName: 'ASSET',
    });
    const updatedCode = makeTag('AUPN');

    const res = await fetch(`${baseUrl}/api/accounts/${account.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: updatedCode,
        name: 'Account Update After',
        is_payable: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<AccountResponse & { is_payable: boolean }>;
    expect(body.success).toBe(true);
    expect(body.data.code).toBe(updatedCode);
    expect(body.data.name).toBe('Account Update After');
    expect(body.data.is_payable).toBe(true);

    const getRes = await fetch(`${baseUrl}/api/accounts/${account.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as ApiResponse<AccountResponse & { is_payable: boolean }>;
    expect(getBody.data.code).toBe(updatedCode);
    expect(getBody.data.name).toBe('Account Update After');
    expect(getBody.data.is_payable).toBe(true);
  });

  it('returns 404 when updating a missing account', async () => {
    const res = await fetch(`${baseUrl}/api/accounts/2147483647`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Missing Account Update' }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rejects PUT is_active false for an in-use account', async () => {
    const parent = await createTestAccount({
      companyId,
      code: makeTag('AUPAR'),
      name: 'Account Update Parent In Use',
      typeName: 'ASSET',
    });
    await createTestAccount({
      companyId,
      code: makeTag('AUCHD'),
      name: 'Account Update Active Child',
      typeName: 'ASSET',
      parentId: parent.id,
    });

    const res = await fetch(`${baseUrl}/api/accounts/${parent.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_active: false }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ACCOUNT_IN_USE');

    const getRes = await fetch(`${baseUrl}/api/accounts/${parent.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as ApiResponse<AccountResponse>;
    expect(getBody.data.is_active).toBe(true);
  });
});
