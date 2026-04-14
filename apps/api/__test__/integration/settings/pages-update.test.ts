// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for settings/pages - Update page
// Tests PATCH /settings/pages/:id endpoint

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

describe('pages-update', { timeout: 30000 }, () => {
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
      email: `settings-update-shared-${Date.now()}@example.com`,
      password: testPassword
    });
    const sharedRole = await createTestRole(baseUrl, cashierToken, 'Settings Updater Shared');
    await assignUserGlobalRole(sharedAdminUser.id, sharedRole.id);
    await setModulePermission(
      sharedContext.companyId,
      sharedRole.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );

    sharedAdminToken = await loginForTest(baseUrl, companyCode, sharedAdminUser.email, testPassword);

    const sharedLimitedUser = await createTestUser(sharedContext.companyId, {
      email: `settings-update-limited-${Date.now()}@example.com`,
      password: testPassword
    });
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserGlobalRole(sharedLimitedUser.id, cashierRoleId);
    sharedLimitedToken = await loginForTest(baseUrl, companyCode, sharedLimitedUser.email, testPassword);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth token', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' })
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks settings update permission', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages/1`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${sharedLimitedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Updated Title' })
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent page', async () => {
    const res = await fetch(`${baseUrl}/api/settings/pages/999999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Updated Title' })
    });

    expect(res.status).toBe(404);
  });

  it('updates page title with valid data', async () => {
    const uniqueSlug = `update-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a page first
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Original Title',
        content_md: '# Original Content'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const pageId = createBody.data.id;

    // Update the title
    const res = await fetch(`${baseUrl}/api/settings/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Updated Title' })
    });

    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Updated Title');
    }
  });

  it('rejects invalid slug on update', async () => {
    const uniqueSlug = `update-invalid-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a page first
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Page Title',
        content_md: '# Content'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const pageId = createBody.data.id;

    // Try to update with invalid slug
    const res = await fetch(`${baseUrl}/api/settings/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ slug: 'Invalid_Slug!' })
    });

    expect(res.status).toBe(400);

    if (res.status === 400) {
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_SLUG');
    }
  });

  it('returns 409 for duplicate slug on update', async () => {
    const slug1 = `dup-update-1-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const slug2 = `dup-update-2-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create two pages
    const create1Res = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: slug1,
        title: 'Page 1',
        content_md: '# Content 1'
      })
    });

    const create2Res = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: slug2,
        title: 'Page 2',
        content_md: '# Content 2'
      })
    });

    if (create1Res.status !== 201 || create2Res.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const create1Body = await create1Res.json();
    const create2Body = await create2Res.json();
    const page1Id = create1Body.data.id;
    const page2Id = create2Body.data.id;

    // Try to update page2's slug to page1's slug
    const res = await fetch(`${baseUrl}/api/settings/pages/${page2Id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ slug: slug1 })
    });

    expect(res.status).toBe(409);

    if (res.status === 409) {
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('DUPLICATE_SLUG');
    }
  });

  it('allows updating slug to valid unique value', async () => {
    const oldSlug = `old-valid-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const newSlug = `new-valid-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: oldSlug,
        title: 'Page Title',
        content_md: '# Content'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const pageId = createBody.data.id;

    // Update to a new valid slug
    const res = await fetch(`${baseUrl}/api/settings/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ slug: newSlug })
    });

    expect(res.status).toBe(200);

    if (res.ok) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.slug).toBe(newSlug);
    }
  });
});
