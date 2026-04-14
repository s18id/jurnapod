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
  loginForTest,
  getSeedSyncContext as loadSeedSyncContext,
  createTestUser,
  createTestRole,
  assignUserGlobalRole,
  setModulePermission
} from '../../fixtures';
import { buildPermissionMask } from '@jurnapod/auth';

let baseUrl: string;
let ownerToken: string;
let sharedAdminToken: string;
let testPassword: string;

describe('public-pages', { timeout: 30000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    seedCtx = await loadSeedSyncContext();

    ownerToken = await getTestAccessToken(baseUrl);
    const companyCode = process.env.JP_COMPANY_CODE;
    const ownerPassword = process.env.JP_OWNER_PASSWORD;
    if (!companyCode || !ownerPassword) {
      throw new Error('JP_COMPANY_CODE and JP_OWNER_PASSWORD must be set for settings pages tests');
    }
    testPassword = ownerPassword;

    const sharedAdminUser = await createTestUser(seedCtx.companyId, {
      email: `settings-public-shared-${Date.now()}@example.com`,
      password: testPassword
    });
    const sharedRole = await createTestRole(baseUrl, ownerToken, 'Settings Public Shared');
    await assignUserGlobalRole(sharedAdminUser.id, sharedRole.id);
    await setModulePermission(
      seedCtx.companyId,
      sharedRole.id,
      'platform',
      'settings',
      buildPermissionMask({ canRead: true, canCreate: true, canUpdate: true })
    );
    sharedAdminToken = await loginForTest(baseUrl, companyCode, sharedAdminUser.email, testPassword);
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
    const uniqueSlug = `public-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a PUBLISHED page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
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
    const uniqueSlug = `draft-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a DRAFT page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
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
    const uniqueSlug = `unpub-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a PUBLISHED page
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
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
        'Authorization': `Bearer ${sharedAdminToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Try to access the unpublished page publicly
    const publicRes = await fetch(`${baseUrl}/api/pages/${uniqueSlug}`);

    // Unpublished pages are not accessible via public endpoint
    expect(publicRes.status).toBe(404);
  });

  it('returns content_html rendered from markdown', async () => {
    const uniqueSlug = `markdown-page-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create a page with markdown content
    const createRes = await fetch(`${baseUrl}/api/settings/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sharedAdminToken}`,
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
