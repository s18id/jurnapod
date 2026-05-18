// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.role-permissions (Story 66-2).
// Exercises real DB-backed API contracts for GET/PUT /roles/:id/permissions.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, getTestBaseUrl, releaseReadLock } from '../../helpers/setup';
import {
  assignUserGlobalRole,
  createTestCompany,
  createTestRole,
  createTestUser,
  getOrCreateTestCashierForPermission,
  getRoleIdByCode,
  getSeedSyncContext,
  getTestAccessToken,
  loginForTest,
  resetFixtureRegistry,
  setModulePermission,
} from '../../fixtures';

let baseUrl: string;
let ownerToken: string;
let cashierToken: string;
let companyBOwnerToken: string;
let customRoleId: number;
let customRoleCode: string;
let systemRoleId: number;

type ApiListResponse<T> = { success: true; data: T[] };
type RoleRow = { id: number; code: string; name: string };
type PermissionEntry = { module: string; resource: string; mask: number };

describe('roles.permissions', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    ownerToken = await getTestAccessToken(baseUrl);

    const seedCtx = await getSeedSyncContext();
    const cashier = await getOrCreateTestCashierForPermission(
      seedCtx.companyId,
      process.env.JP_COMPANY_CODE ?? 'JP',
      baseUrl,
    );
    cashierToken = cashier.accessToken;

    const customRole = await createTestRole(baseUrl, ownerToken, 'RolePerms');
    customRoleId = customRole.id;
    customRoleCode = customRole.code;

    const companyB = await createTestCompany({ name: 'Role Permission Isolation Company' });
    const ownerRoleId = await getRoleIdByCode('OWNER');
    const companyBOwnerPassword = 'RolePermsOwnerB123!';
    const companyBOwner = await createTestUser(companyB.id, {
      email: `role-perms-owner-b+${companyB.id}@example.com`,
      name: 'Role Permissions Owner B',
      password: companyBOwnerPassword,
    });
    await assignUserGlobalRole(companyBOwner.id, ownerRoleId);
    companyBOwnerToken = await loginForTest(
      baseUrl,
      companyB.code,
      companyBOwner.email,
      companyBOwnerPassword,
    );

    const rolesRes = await fetch(`${baseUrl}/api/roles`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(rolesRes.status).toBe(200);
    const rolesBody = (await rolesRes.json()) as ApiListResponse<RoleRow>;
    const cashierRole = rolesBody.data.find((role) => role.code === 'CASHIER');
    expect(cashierRole).toBeDefined();
    systemRoleId = cashierRole?.id ?? 0;
  });

  afterAll(async () => {
    try {
      resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  it('rejects role permission reads without authentication', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`);
    expect(res.status).toBe(401);
  });

  it('returns permission entries for a visible custom role', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiListResponse<PermissionEntry>;
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('denies role permission reads to a low-privilege CASHIER token', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      headers: { Authorization: `Bearer ${cashierToken}` },
    });

    expect(res.status).toBe(403);
  });

  it('does not expose company A role permissions to an authenticated company B owner', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      headers: { Authorization: `Bearer ${companyBOwnerToken}` },
    });

    expect([403, 404]).toContain(res.status);
  });

  it('does not allow company B to replace company A role permissions', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${companyBOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [{ module: 'platform', resource: 'roles', mask: 1 }],
      }),
    });

    expect([403, 404]).toContain(res.status);
  });

  it('replaces custom-role permissions transactionally with canonical module/resource masks', async () => {
    const updateRes = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [
          { module: 'platform', resource: 'roles', mask: 63 },
          { module: 'inventory', resource: 'items', mask: 15 },
          { module: 'purchasing', resource: 'orders', mask: 1 },
        ],
      }),
    });

    expect(updateRes.status).toBe(200);
    const updateBody = (await updateRes.json()) as {
      success: true;
      data: { role: RoleRow & { company_id: number | null; is_global: boolean; role_level: number }; permissions: PermissionEntry[] };
    };
    expect(updateBody.data.role).toEqual(
      expect.objectContaining({
        id: customRoleId,
        code: customRoleCode,
        name: expect.any(String),
        company_id: expect.any(Number),
        is_global: false,
        role_level: expect.any(Number),
      }),
    );
    expect(updateBody.data.permissions).toEqual([
      { module: 'inventory', resource: 'items', mask: 15 },
      { module: 'platform', resource: 'roles', mask: 63 },
      { module: 'purchasing', resource: 'orders', mask: 1 },
    ]);
    for (const permission of updateBody.data.permissions) {
      expect(permission).toEqual({
        module: expect.any(String),
        resource: expect.any(String),
        mask: expect.any(Number),
      });
    }

    const readRes = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(readRes.status).toBe(200);
    const readBody = (await readRes.json()) as ApiListResponse<PermissionEntry>;
    expect(readBody.data).toContainEqual({ module: 'platform', resource: 'roles', mask: 63 });
    expect(readBody.data).toContainEqual({ module: 'inventory', resource: 'items', mask: 15 });
    expect(readBody.data).toContainEqual({ module: 'purchasing', resource: 'orders', mask: 1 });
    expect(readBody.data).toEqual(updateBody.data.permissions);
  });

  it('rejects duplicate permission entries in replacement payloads', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [
          { module: 'platform', resource: 'roles', mask: 1 },
          { module: 'platform', resource: 'roles', mask: 63 },
        ],
      }),
    });

    expect(res.status).toBe(400);
  });

  it('accepts empty canonical replacement while preserving unknown legacy module rows', async () => {
    const seedCtx = await getSeedSyncContext();
    const legacyModule = `legacy_role_permissions_${customRoleId}`;
    const legacyResource = 'legacy_resource';

    await setModulePermission(seedCtx.companyId, customRoleId, legacyModule, legacyResource, 31);

    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permissions: [] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: true; data: { permissions: PermissionEntry[] } };
    expect(body.data.permissions).toEqual([]);

    const readRes = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(readRes.status).toBe(200);
    const readBody = (await readRes.json()) as ApiListResponse<PermissionEntry>;
    expect(readBody.data).toEqual([]);

    const legacyRow = await getTestDb()
      .selectFrom('module_roles')
      .where('company_id', '=', seedCtx.companyId)
      .where('role_id', '=', customRoleId)
      .where('module', '=', legacyModule)
      .where('resource', '=', legacyResource)
      .select(['module', 'resource', 'permission_mask'])
      .executeTakeFirst();

    expect(legacyRow).toEqual({
      module: legacyModule,
      resource: legacyResource,
      permission_mask: 31,
    });
  });

  it('forbids system-role permission mutation', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${systemRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [{ module: 'platform', resource: 'roles', mask: 0 }],
      }),
    });

    expect(res.status).toBe(403);
  });

  it('requires platform.roles.MANAGE for writes', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cashierToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [{ module: 'platform', resource: 'roles', mask: 1 }],
      }),
    });

    expect(res.status).toBe(403);
  });

  it('rejects invalid module and mask payloads at the API boundary', async () => {
    const res = await fetch(`${baseUrl}/api/roles/${customRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [{ module: 'reports', resource: 'legacy', mask: 255 }],
      }),
    });

    expect(res.status).toBe(400);
  });
});
