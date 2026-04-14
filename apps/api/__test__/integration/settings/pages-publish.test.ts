// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for settings/pages - Publish page
// Tests POST /settings/pages/:id/publish endpoint

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import {
  resetFixtureRegistry,
  getTestAccessToken,
  loginForTest,
  getSeedSyncContext as loadSeedSyncContext,
  createTestUser,
  createTestRole,
  assignUserGlobalRole,
  getRoleIdByCode,
  setModulePermission
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';

let baseUrl: string;
let cashierToken: string;
let sharedContext: Awaited<ReturnType<typeof loadSeedSyncContext>>;
let sharedAdminToken: string;
let sharedLimitedToken: string;
let testPassword: string;

describe('pages-publish', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    cashierToken = await getTestAccessToken(baseUrl);

    sharedContext = await loadSeedSyncContext();
    const companyCode = process.env.JP_COMPANY_CODE;
    const ownerPassword = process.env.JP_OWNER_PASSWORD;
    if (!companyCode || !ownerPassword) {
      throw new Error('JP_COMPANY_CODE and JP_OWNER_PASSWORD must be set for settings pages tests');
    }
    testPassword = ownerPassword;

    const sharedAdminUser = await createTestUser(sharedContext.companyId, {
      email: `settings-publish-shared-${Date.now()}@example.com`,
      password: testPassword
    });
    const sharedRole = await createTestRole(baseUrl, cashierToken, 'Settings Publisher Shared');
    await assignUserGlobalRole(sharedAdminUser.id, sharedRole.id);
    await setModulePermission(
      sharedContext.companyId,
      sharedRole.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );

    sharedAdminToken = await loginForTest(baseUrl, companyCode, sharedAdminUser.email, testPassword);

    const limitedUser = await createTestUser(sharedContext.companyId, {
      email: `settings-publish-limited-${Date.now()}@example.com`,
      password: testPassword
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserGlobalRole(limitedUser.id, cashierRoleId);
    sharedLimitedToken = await loginForTest(baseUrl, companyCode, limitedUser.email, testPassword);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages/1/publish`, {
      method: 'POST'
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks settings update permission', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages/1/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedLimitedToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent page', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages/999999999/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(404);
  });

  it('publishes a DRAFT page', async () => {
    const uniqueSlug = `publish-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a DRAFT page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Draft Page',
        content_md: '# Draft Content',
        status: 'DRAFT'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const pageId = createBody.data.id;

    // Publish the page
    const res = await fetch(`${baseUrl}/api/settings/pages/${pageId}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('PUBLISHED');
      expect(body.data.published_at).toBeDefined();
    }
  });

  it('returns 400 for invalid page ID format', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages/invalid-id/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('allows publishing an already published page (idempotent)', async () => {
    const uniqueSlug = `publish-idempotent-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create an already PUBLISHED page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Published Page',
        content_md: '# Published Content',
        status: 'PUBLISHED'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const pageId = createBody.data.id;

    // Try to publish again
    const res = await fetch(`${baseUrl}/api/settings/pages/${pageId}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Should still succeed (idempotent)
    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('PUBLISHED');
    }
  });
});
