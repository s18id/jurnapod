// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesAuthorizationError } from '@jurnapod/modules-sales';
import { ApiAccessScopeChecker } from '../../../src/lib/modules-sales/access-scope-checker';

const {
  userHasOutletAccessMock,
  canManageCompanyDefaultsMock,
  checkAccessMock,
} = vi.hoisted(() => ({
  userHasOutletAccessMock: vi.fn(),
  canManageCompanyDefaultsMock: vi.fn(),
  checkAccessMock: vi.fn(),
}));

vi.mock('@/lib/auth.js', () => ({
  userHasOutletAccess: userHasOutletAccessMock,
}));

vi.mock('@/lib/auth-client.js', () => ({
  authClient: {
    rbac: {
      canManageCompanyDefaults: canManageCompanyDefaultsMock,
      checkAccess: checkAccessMock,
    },
  },
}));

describe('modules-sales.access-scope-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps invoice update permission to sales.invoices update', async () => {
    const checker = new ApiAccessScopeChecker();
    canManageCompanyDefaultsMock.mockResolvedValueOnce(true);

    await checker.assertCompanyAccess({
      actorUserId: 10,
      companyId: 1,
      permission: 'sales:update_invoice',
    });

    expect(canManageCompanyDefaultsMock).toHaveBeenCalledWith(
      10,
      1,
      'sales',
      'update',
      'invoices'
    );
  });

  it('maps credit note permissions to sales.invoices boundaries', async () => {
    const checker = new ApiAccessScopeChecker();
    userHasOutletAccessMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce({ hasPermission: true });

    await checker.assertOutletAccess({
      actorUserId: 11,
      companyId: 1,
      outletId: 2,
      permission: 'credit_notes:create',
    });

    expect(checkAccessMock).toHaveBeenCalledWith({
      userId: 11,
      companyId: 1,
      outletId: 2,
      module: 'sales',
      permission: 'create',
      resource: 'invoices',
    });
  });

  it('throws non-forbidden Error for unsupported permission mapping', async () => {
    const checker = new ApiAccessScopeChecker();

    await expect(checker.assertCompanyAccess({
      actorUserId: 1,
      companyId: 1,
      permission: 'sales:unknown_perm',
    })).rejects.toThrow('Unsupported sales permission mapping: sales:unknown_perm');
  });

  it('throws SalesAuthorizationError when outlet access is missing', async () => {
    const checker = new ApiAccessScopeChecker();
    userHasOutletAccessMock.mockResolvedValueOnce(false);

    await expect(checker.assertOutletAccess({
      actorUserId: 22,
      companyId: 1,
      outletId: 99,
      permission: 'sales:read_invoice',
    })).rejects.toBeInstanceOf(SalesAuthorizationError);
  });
});
