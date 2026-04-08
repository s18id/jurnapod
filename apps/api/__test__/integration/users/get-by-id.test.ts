// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for users.get-by-id
// Tests GET /users/:id endpoint.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb } from '../../helpers/db';
import { resetFixtureRegistry, getTestAccessToken, getSeedSyncContext } from '../../fixtures';

let baseUrl: string;
let accessToken: string;
let cashierUserId: number;

describe('users.get-by-id', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const context = await getSeedSyncContext();
    cashierUserId = context.cashierUserId;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  it('rejects request without auth', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`);
    expect(res.status).toBe(401);
  });

  it('returns user by valid ID', async () => {
    const res = await fetch(`${baseUrl}/api/users/${cashierUserId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(cashierUserId);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await fetch(`${baseUrl}/api/users/999999999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid user ID format', async () => {
    const res = await fetch(`${baseUrl}/api/users/invalid`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
  });
});