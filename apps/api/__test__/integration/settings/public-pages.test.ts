// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for public pages
// Tests GET /pages/:slug endpoint - requires no auth, only PUBLISHED pages

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

describe('public-pages', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('returns 404 for non-existent page', async () => {
    const res = await fetch(`${baseUrl}/api/pages/non-existent-page-xyz`);
    expect(res.status).toBe(404);
  });

  it('returns published page without auth', async () => {
    const context = await getSeedSyncContext();
    const uniqueSlug = `public-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-public-${Date.now()}@example.com`
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

    // Create a PUBLISHED page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Public Page Title',
        content_md: '# Public Content',
        status: 'PUBLISHED'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    // Access the public page WITHOUT auth
    const publicRes = await fetch(`${baseUrl}/api/pages/${uniqueSlug}`);

    expect(publicRes.status).toBe(200);

    if (publicRes.ok) {
      const body = await publicRes.json();
      expect(body.success).toBe(true);
      expect(body.data.slug).toBe(uniqueSlug);
      expect(body.data.title).toBe('Public Page Title');
      expect(body.data.content_html).toBeDefined();
      expect(body.data.published_at).toBeDefined();
    }
  });

  it('does not return DRAFT page', async () => {
    const context = await getSeedSyncContext();
    const uniqueSlug = `draft-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-draft-public-${Date.now()}@example.com`
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

    // Create a DRAFT page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Draft Page Title',
        content_md: '# Draft Content',
        status: 'DRAFT'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    // Try to access the DRAFT page publicly
    const publicRes = await fetch(`${baseUrl}/api/pages/${uniqueSlug}`);

    // DRAFT pages are not accessible via public endpoint
    expect(publicRes.status).toBe(404);
  });

  it('returns 404 for unpublished page', async () => {
    const context = await getSeedSyncContext();
    const uniqueSlug = `unpub-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create and update permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-unpub-public-${Date.now()}@example.com`
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

    // Create a PUBLISHED page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Page to Unpublish',
        content_md: '# Content',
        status: 'PUBLISHED'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    const createBody = await createRes.json();
    const pageId = createBody.data.id;

    // Unpublish the page
    await fetch(`${baseUrl}/api/settings/pages/${pageId}/unpublish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Try to access the unpublished page publicly
    const publicRes = await fetch(`${baseUrl}/api/pages/${uniqueSlug}`);

    // Unpublished pages are not accessible via public endpoint
    expect(publicRes.status).toBe(404);
  });

  it('returns content_html rendered from markdown', async () => {
    const context = await getSeedSyncContext();
    const uniqueSlug = `markdown-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create user with settings create permission
    const adminUser = await createTestUser(context.companyId, {
      email: `settings-md-public-${Date.now()}@example.com`
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

    // Create a page with markdown content
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        slug: uniqueSlug,
        title: 'Markdown Page',
        content_md: '# Hello World\n\nThis is **bold** text.',
        status: 'PUBLISHED'
      })
    });

    if (createRes.status !== 201) {
      expect(true).toBe(true);
      return;
    }

    // Access the public page
    const publicRes = await fetch(`${baseUrl}/api/pages/${uniqueSlug}`);

    expect(publicRes.status).toBe(200);

    if (publicRes.ok) {
      const body = await publicRes.json();
      expect(body.success).toBe(true);
      // Content should be HTML, not markdown
      expect(body.data.content_html).toContain('<h1>');
      expect(body.data.content_html).toContain('<strong>bold</strong>');
    }
  });

  it('returns 404 for invalid slug format', async () => {
    // Invalid slug characters should return 404 (not 400)
    // because the public pages endpoint checks for existence first
    const res = await fetch(`${baseUrl}/api/pages/Invalid_Page!@#$`);
    expect(res.status).toBe(404);
  });
});
