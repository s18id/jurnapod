#!/usr/bin/env node
/**
 * API-based E2E Tests for Invoice Payment Default Feature
 * More reliable than UI tests, based on MANUAL_TESTING_GUIDE.md
 * 
 * Run with: node e2e-tests/payment-defaults-api.spec.mjs
 */

const API_BASE = process.env.API_BASE || "http://localhost:3001/api";

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
  const { response, data } = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      company_code: "JP",
      email: "ahmad@signal18.id",
      password: "ChangeMe123!"
    })
  });

  if (!response.ok || !data.access_token) {
    throw new Error(`Login failed: ${data.error?.message || response.statusText}`);
  }

  return data.access_token;
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

// Test 1: API Authentication
async function testAuthentication() {
  const token = await login();
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token received');
  }
}

// Test 2: Fetch Payment Method Mappings
async function testFetchMappings(token, outletId) {
  const { response, data } = await apiRequest(
    `/outlet-payment-method-mappings?outlet_id=${outletId}`,
    {},
    token
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch mappings: ${data.error?.message}`);
  }

  if (!data.mappings || !Array.isArray(data.mappings)) {
    throw new Error('Invalid response format');
  }

  // Check for is_invoice_default field
  if (data.mappings.length > 0) {
    const hasDefaultField = 'is_invoice_default' in data.mappings[0];
    if (!hasDefaultField) {
      throw new Error('is_invoice_default field not present in response');
    }
  }

  return data.mappings;
}

// Test 3: Set Invoice Default
async function testSetInvoiceDefault(token, outletId, mappings) {
  if (mappings.length === 0) {
    throw new Error('No payment methods available to test');
  }

  // Set first method as invoice default
  const updatedMappings = mappings.map((m, idx) => ({
    method_code: m.method_code,
    account_id: m.account_id,
    label: m.label,
    is_invoice_default: idx === 0
  }));

  const { response, data } = await apiRequest(
    `/outlet-payment-method-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({
        outlet_id: outletId,
        mappings: updatedMappings
      })
    },
    token
  );

  if (!response.ok) {
    throw new Error(`Failed to save mappings: ${data.error?.message}`);
  }
}

// Test 4: Verify Default Persists
async function testDefaultPersists(token, outletId) {
  const mappings = await testFetchMappings(token, outletId);
  
  const defaultMethod = mappings.find(m => m.is_invoice_default === true);
  if (!defaultMethod) {
    throw new Error('Invoice default not persisted after save');
  }
  
  console.log(`\n   ✓ Default method: ${defaultMethod.method_code}`);
}

// Test 5: Multiple Defaults Validation
async function testMultipleDefaultsValidation(token, outletId, mappings) {
  if (mappings.length < 2) {
    console.log('\n   ⚠️ Skipping - need at least 2 methods');
    return;
  }

  // Try to set multiple defaults
  const invalidMappings = mappings.map(m => ({
    method_code: m.method_code,
    account_id: m.account_id,
    label: m.label,
    is_invoice_default: true // All true (invalid!)
  }));

  const { response, data } = await apiRequest(
    `/outlet-payment-method-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({
        outlet_id: outletId,
        mappings: invalidMappings
      })
    },
    token
  );

  if (response.ok) {
    throw new Error('API should have rejected multiple defaults but didn\'t');
  }

  if (!data.error?.code || data.error.code !== 'MULTIPLE_INVOICE_DEFAULTS') {
    throw new Error(`Wrong error code: ${data.error?.code}`);
  }

  console.log('\n   ✓ Correctly rejected with error: MULTIPLE_INVOICE_DEFAULTS');
}

// Test 6: Unset Default
async function testUnsetDefault(token, outletId, mappings) {
  // Set all to false
  const updatedMappings = mappings.map(m => ({
    method_code: m.method_code,
    account_id: m.account_id,
    label: m.label,
    is_invoice_default: false
  }));

  const { response, data } = await apiRequest(
    `/outlet-payment-method-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({
        outlet_id: outletId,
        mappings: updatedMappings
      })
    },
    token
  );

  if (!response.ok) {
    throw new Error(`Failed to unset defaults: ${data.error?.message}`);
  }

  // Verify no defaults
  const verifyMappings = await testFetchMappings(token, outletId);
  const hasDefault = verifyMappings.some(m => m.is_invoice_default === true);
  
  if (hasDefault) {
    throw new Error('Default still exists after unsetting');
  }
}

// Test 7: Change Default
async function testChangeDefault(token, outletId, mappings) {
  if (mappings.length < 2) {
    console.log('\n   ⚠️ Skipping - need at least 2 methods');
    return;
  }

  // Set second method as default
  const updatedMappings = mappings.map((m, idx) => ({
    method_code: m.method_code,
    account_id: m.account_id,
    label: m.label,
    is_invoice_default: idx === 1
  }));

  const { response, data } = await apiRequest(
    `/outlet-payment-method-mappings`,
    {
      method: "PUT",
      body: JSON.stringify({
        outlet_id: outletId,
        mappings: updatedMappings
      })
    },
    token
  );

  if (!response.ok) {
    throw new Error(`Failed to change default: ${data.error?.message}`);
  }

  // Verify change
  const verifyMappings = await testFetchMappings(token, outletId);
  const defaultMethod = verifyMappings.find(m => m.is_invoice_default === true);
  
  if (!defaultMethod || defaultMethod.method_code !== mappings[1].method_code) {
    throw new Error('Default was not changed correctly');
  }

  console.log(`\n   ✓ Changed default to: ${defaultMethod.method_code}`);
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API-based E2E Tests for Invoice Payment Default\n');
  console.log('============================================================\n');

  try {
    let token;
    let outletId = 1;
    let mappings;

    await test('Test 1: API Authentication', async () => {
      token = await login();
    });

    await test('Test 2: Fetch Payment Method Mappings', async () => {
      mappings = await testFetchMappings(token, outletId);
      console.log(`\n   ✓ Found ${mappings.length} payment method(s)`);
    });

    await test('Test 3: Set Invoice Default', async () => {
      await testSetInvoiceDefault(token, outletId, mappings);
    });

    await test('Test 4: Verify Default Persists', async () => {
      await testDefaultPersists(token, outletId);
    });

    await test('Test 5: Multiple Defaults Validation', async () => {
      await testMultipleDefaultsValidation(token, outletId, mappings);
    });

    await test('Test 6: Unset Default', async () => {
      await testUnsetDefault(token, outletId, mappings);
    });

    await test('Test 7: Change Default', async () => {
      await testChangeDefault(token, outletId, mappings);
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
      console.log('\n💡 These tests verify the backend API is working correctly.');
      console.log('   For full E2E including UI, run manual tests from MANUAL_TESTING_GUIDE.md');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n💥 Test suite failed with error:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
