#!/usr/bin/env node
/**
 * API-based E2E Tests for Outlet Account Mappings Validation
 * Tests the INVALID_ACCOUNT_MAPPING validation on PUT endpoint
 *
 * Run with: node e2e-tests/outlet-account-mappings-api.spec.mjs
 * 
 * Environment variables:
 *   API_BASE         - API base URL (default: http://localhost:3001/api)
 *   JP_COMPANY_CODE  - Company code for login (default: JP)
 *   JP_OWNER_EMAIL  - Owner email for login
 *   JP_OWNER_PASSWORD - Owner password for login
 */

const API_BASE = process.env.API_BASE || "http://localhost:3001/api";

function readEnv(name, fallback = null) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    if (fallback != null) {
      return fallback;
    }
    throw new Error(`${name} is required for E2E test`);
  }
  return value;
}

const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

async function apiRequest(path, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await response.json();
  return { response, data };
}

async function login() {
  const companyCode = readEnv("JP_COMPANY_CODE", "JP");
  const email = readEnv("JP_OWNER_EMAIL").toLowerCase();
  const password = readEnv("JP_OWNER_PASSWORD");

  const { response, data } = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      company_code: companyCode,
      email,
      password
    })
  });

  if (!data.success || !data.data?.access_token) {
    throw new Error(`Login failed: ${data.error?.message || response.statusText}`);
  }

  return data.data.access_token;
}

async function test(name, fn) {
  const result = { name, status: 'pending', error: null };
  try {
    process.stdout.write(`\n🧪 Test: ${name}... `);
    await fn();
    result.status = 'passed';
    testResults.passed++;
    console.log(`✅ PASSED`);
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    testResults.failed++;
    console.log(`❌ FAILED`);
    console.log(`   Error: ${error.message}`);
  }
  testResults.tests.push(result);
}

// Get valid account IDs for the authenticated user's company
async function getValidAccountIds(token, outletId) {
  const { response, data } = await apiRequest(
    `/settings/outlet-account-mappings?scope=outlet&outlet_id=${outletId}`,
    {},
    token
  );

  if (!data.success) {
    throw new Error(`Failed to fetch mappings: ${data.error?.message}`);
  }

  // Get accounts list - API auto-filters by logged-in user's company
  const accountsRes = await apiRequest("/accounts", {}, token);
  if (!accountsRes.data.success) {
    throw new Error(`Failed to fetch accounts: ${accountsRes.data.error?.message}`);
  }

  return accountsRes.data.data.slice(0, 3).map(a => a.id);
}

// Test 1: Valid account IDs should succeed
async function testValidAccountMappings(token, outletId, validAccountIds) {
  if (validAccountIds.length < 3) {
    console.log('\n   ⚠️ Skipping - need at least 3 accounts');
    return;
  }

  const mappings = [
    { mapping_key: "AR", account_id: validAccountIds[0] },
    { mapping_key: "SALES_REVENUE", account_id: validAccountIds[1] },
    { mapping_key: "SALES_TAX", account_id: validAccountIds[2] }
  ];

  const { response, data } = await apiRequest(
    `/settings/outlet-account-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({
        scope: "outlet",
        outlet_id: outletId,
        mappings
      })
    },
    token
  );

  if (!data.success) {
    throw new Error(`Expected success but got: ${data.error?.message}`);
  }

  console.log('\n   ✓ Valid mappings accepted');
}

// Test 2: Invalid account ID should be rejected
async function testInvalidAccountId(token, outletId, validAccountIds) {
  if (validAccountIds.length < 1) {
    console.log('\n   ⚠️ Skipping - need at least 1 account');
    return;
  }

  const invalidId = 999999999;
  const mappings = [
    { mapping_key: "AR", account_id: invalidId },
    { mapping_key: "SALES_REVENUE", account_id: validAccountIds[0] },
    { mapping_key: "SALES_TAX", account_id: validAccountIds[0] }
  ];

  const { response, data } = await apiRequest(
    `/settings/outlet-account-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({
        scope: "outlet",
        outlet_id: outletId,
        mappings
      })
    },
    token
  );

  if (data.success) {
    throw new Error('API should have rejected invalid account ID but didn\'t');
  }

  if (!data.error?.code || data.error.code !== 'INVALID_ACCOUNT_MAPPING') {
    throw new Error(`Wrong error code: expected INVALID_ACCOUNT_MAPPING, got ${data.error?.code}`);
  }

  console.log('\n   ✓ Correctly rejected with error: INVALID_ACCOUNT_MAPPING');
}

// Test 3: All invalid account IDs should be rejected
async function testAllInvalidAccountIds(token, outletId) {
  const invalidId = 888888888;
  const mappings = [
    { mapping_key: "AR", account_id: invalidId },
    { mapping_key: "SALES_REVENUE", account_id: invalidId + 1 },
    { mapping_key: "SALES_TAX", account_id: invalidId + 2 }
  ];

  const { response, data } = await apiRequest(
    `/settings/outlet-account-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({
        scope: "outlet",
        outlet_id: outletId,
        mappings
      })
    },
    token
  );

  if (data.success) {
    throw new Error('API should have rejected all invalid account IDs but didn\'t');
  }

  if (!data.error?.code || data.error.code !== 'INVALID_ACCOUNT_MAPPING') {
    throw new Error(`Wrong error code: expected INVALID_ACCOUNT_MAPPING, got ${data.error?.code}`);
  }

  console.log('\n   ✓ Correctly rejected all invalid IDs');
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API-based E2E Tests for Outlet Account Mappings\n');
  console.log('============================================================\n');

  try {
    let token;
    let outletId = 1;
    let validAccountIds;

    await test('Test 1: API Authentication', async () => {
      token = await login();
      console.log(`\n   ✓ Logged in successfully`);
    });

    await test('Test 2: Get Valid Account IDs', async () => {
      validAccountIds = await getValidAccountIds(token, outletId);
      console.log(`\n   ✓ Found ${validAccountIds.length} account(s)`);
    });

    await test('Test 3: Valid Account Mappings Succeed', async () => {
      await testValidAccountMappings(token, outletId, validAccountIds);
    });

    await test('Test 4: Invalid Account ID Rejected', async () => {
      await testInvalidAccountId(token, outletId, validAccountIds);
    });

    await test('Test 5: All Invalid Account IDs Rejected', async () => {
      await testAllInvalidAccountIds(token, outletId);
    });

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📝 Total: ${testResults.tests.length}`);
    console.log('='.repeat(60));

    if (testResults.failed > 0) {
      console.log('\n❌ Failed Tests:');
      testResults.tests.filter(t => t.status === 'failed').forEach(t => {
        console.log(`   - ${t.name}`);
        console.log(`     Error: ${t.error}`);
      });
      process.exit(1);
    } else {
      console.log('\n🎉 All API tests passed!');
      console.log('\n💡 These tests verify INVALID_ACCOUNT_MAPPING validation.');
    }
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  }
}

runTests();
