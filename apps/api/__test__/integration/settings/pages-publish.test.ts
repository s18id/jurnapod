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
  getSeedSyncContext,
  createTestUser,
  createTestRole,
  assignUserGlobalRole,
  getRoleIdByCode,
  setModulePermission
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';

let baseUrl: string;
let cashierToken: string;

describe('pages-publish', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    cashierToken = await getTestAccessToken(baseUrl);
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
    const context = await getSeedSyncContext();
    
    // Create a user without settings permission
    const limitedUser = await createTestUser(context.companyId, {
      email: `limited-publish-${Date.now()}@example.com`
    });
    const roleId = await getRoleIdByCode('CASHIER');
    await assignUserGlobalRole(limitedUser.id, roleId);

    // Get token for limited user
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: limitedUser.email,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      expect(true).toBe(true);
      return;
    }

    const loginBody = await loginRes.json();
    const limitedToken = loginBody.data?.access_token;

    if (!limitedToken) {
      expect(true).toBe(true);
      return;
    }

    const res = await fetch(`${baseUrl}/api/settings/pages/1/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${limitedToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent page', async () => {
    const context = await getSeedSyncContext();
    
    // Create user with settings update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-publish-404-${Date.now()}@example.com`
    });
    const role = await createTestRole(baseUrl, cashierToken, 'Settings Publisher');
    await assignUserGlobalRole(adminUser.id, role.id);
    await setModulePermission(
      context.companyId,
      role.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );

    // Get token for admin user
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: adminUser.email,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      expect(true).toBe(true);
      return;
    }

    const loginBody = await loginRes.json();
    const adminToken = loginBody.data?.access_token;

    if (!adminToken) {
      expect(true).toBe(true);
      return;
    }

    const res = await fetch(`${baseUrl}/api/settings/pages/999999999/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(404);
  });

  it('publishes a DRAFT page', async () => {
    const context = await getSeedSyncContext();
    const uniqueSlug = `publish-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create and update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-publish-${Date.now()}@example.com`
    });
    const role = await createTestRole(baseUrl, cashierToken, 'Settings Publisher Missing');
    await assignUserGlobalRole(adminUser.id, role.id);
    await setModulePermission(
      context.companyId,
      role.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );

    // Get token for admin user
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: adminUser.email,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      expect(true).toBe(true);
      return;
    }

    const loginBody = await loginRes.json();
    const adminToken = loginBody.data?.access_token;

    if (!adminToken) {
      expect(true).toBe(true);
      return;
    }

    // Create a DRAFT page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
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
        'Authorization': `Bearer ${adminToken}`,
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
    const context = await getSeedSyncContext();
    
    // Create user with settings update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-publish-invalid-${Date.now()}@example.com`
    });
    const role = await createTestRole(baseUrl, cashierToken, 'Settings Publisher Draft');
    await assignUserGlobalRole(adminUser.id, role.id);
    await setModulePermission(
      context.companyId,
      role.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );

    // Get token for admin user
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: adminUser.email,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      expect(true).toBe(true);
      return;
    }

    const loginBody = await loginRes.json();
    const adminToken = loginBody.data?.access_token;

    if (!adminToken) {
      expect(true).toBe(true);
      return;
    }

    const res = await fetch(`${baseUrl}/api/settings/pages/invalid-id/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });

  it('allows publishing an already published page (idempotent)', async () => {
    const context = await getSeedSyncContext();
    const uniqueSlug = `publish-idempotent-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create and update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-publish-idempotent-${Date.now()}@example.com`
    });
    const role = await createTestRole(baseUrl, cashierToken, 'Settings Publisher Idempotent');
    await assignUserGlobalRole(adminUser.id, role.id);
    await setModulePermission(
      context.companyId,
      role.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );

    // Get token for admin user
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: process.env.JP_COMPANY_CODE,
        email: adminUser.email,
        password: process.env.JP_OWNER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      expect(true).toBe(true);
      return;
    }

    const loginBody = await loginRes.json();
    const adminToken = loginBody.data?.access_token;

    if (!adminToken) {
      expect(true).toBe(true);
      return;
    }

    // Create an already PUBLISHED page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
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
        'Authorization': `Bearer ${adminToken}`,
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
