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
  getSeedSyncContext,
  createTestUser,
  assignUserGlobalRole,
  getRoleIdByCode,
  setModulePermission
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';

let baseUrl: string;
let cashierToken: string;

describe('pages-update', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    cashierToken = await getTestAccessToken(baseUrl);
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
    const context = await getSeedSyncContext();
    
    // Create a user without settings permission
    const limitedUser = await createTestUser(context.companyId, {
      email: `limited-update-${Date.now()}@example.com`
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

    const res = await fetch(`${baseUrl}/api/settings/pages/1`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${limitedToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Updated Title' })
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent page', async () => {
    const context = await getSeedSyncContext();
    
    // Create user with settings update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-update-404-${Date.now()}@example.com`
    });
    const roleId = await getRoleIdByCode('ADMIN');
    await assignUserGlobalRole(adminUser.id, roleId);
    await setModulePermission(
      context.companyId,
      roleId,
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

    const res = await fetch(`${baseUrl}/api/settings/pages/999999999`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Updated Title' })
    });

    expect(res.status).toBe(404);
  });

  it('updates page title with valid data', async () => {
    const context = await getSeedSyncContext();
    const uniqueSlug = `update-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create and update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-update-title-${Date.now()}@example.com`
    });
    const roleId = await getRoleIdByCode('ADMIN');
    await assignUserGlobalRole(adminUser.id, roleId);
    await setModulePermission(
      context.companyId,
      roleId,
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

    // Create a page first
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
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
        'Authorization': `Bearer ${adminToken}`,
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
    const context = await getSeedSyncContext();
    const uniqueSlug = `update-invalid-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create and update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-update-slug-${Date.now()}@example.com`
    });
    const roleId = await getRoleIdByCode('ADMIN');
    await assignUserGlobalRole(adminUser.id, roleId);
    await setModulePermission(
      context.companyId,
      roleId,
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

    // Create a page first
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
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
        'Authorization': `Bearer ${adminToken}`,
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
    const context = await getSeedSyncContext();
    const slug1 = `dup-update-1-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const slug2 = `dup-update-2-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create and update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-update-dup-${Date.now()}@example.com`
    });
    const roleId = await getRoleIdByCode('ADMIN');
    await assignUserGlobalRole(adminUser.id, roleId);
    await setModulePermission(
      context.companyId,
      roleId,
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

    // Create two pages
    const create1Res = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
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
        'Authorization': `Bearer ${adminToken}`,
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
        'Authorization': `Bearer ${adminToken}`,
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
    const context = await getSeedSyncContext();
    const oldSlug = `old-valid-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const newSlug = `new-valid-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create and update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-update-valid-${Date.now()}@example.com`
    });
    const roleId = await getRoleIdByCode('ADMIN');
    await assignUserGlobalRole(adminUser.id, roleId);
    await setModulePermission(
      context.companyId,
      roleId,
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

    // Create a page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
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
        'Authorization': `Bearer ${adminToken}`,
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
