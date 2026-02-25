/**
 * E2E Tests for Invoice Payment Default Feature
 * Based on MANUAL_TESTING_GUIDE.md
 * 
 * Run with: node e2e-tests/payment-defaults.spec.mjs
 */

import { chromium } from 'playwright';

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const CREDENTIALS = {
  companyCode: 'JP',
  email: 'ahmad@signal18.id',
  password: 'ChangeMe123!'
};

// Test utilities
let browser;
let context;
let page;
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

async function apiRequest(path, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const data = await response.json();
  return { response, data };
}

async function apiLogin() {
  const { response, data } = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      company_code: CREDENTIALS.companyCode,
      email: CREDENTIALS.email,
      password: CREDENTIALS.password
    })
  });

  if (!response.ok || !data.access_token) {
    throw new Error(`API login failed: ${data.error?.message || response.statusText}`);
  }

  return data.access_token;
}

async function ensureBackofficeReady() {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/@vite/client`);
      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();

      const isJs = contentType.includes("javascript") || body.startsWith("import ");
      const isHtml = body.includes("<!DOCTYPE html>") || body.includes("<html");

      if (response.ok && isJs && !isHtml) {
        return;
      }
    } catch {
      // ignore and retry
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Backoffice dev server not ready (Vite client not served as JS)");
}

async function ensurePaymentMethods() {
  const token = await apiLogin();

  const { response: accountsResponse, data: accountsData } = await apiRequest(
    `/accounts?company_id=1&is_payable=true`,
    {},
    token
  );

  if (!accountsResponse.ok || !Array.isArray(accountsData.data) || accountsData.data.length === 0) {
    throw new Error("No payable accounts found for payment mappings");
  }

  const defaultAccountId = accountsData.data[0].id;
  const outletId = 1;

  const mappingsPayload = {
    outlet_id: outletId,
    mappings: [
      {
        method_code: "CASH",
        account_id: defaultAccountId,
        label: "CASH",
        is_invoice_default: true
      },
      {
        method_code: "QRIS",
        account_id: defaultAccountId,
        label: "QRIS",
        is_invoice_default: false
      }
    ]
  };

  const { response: saveResponse, data: saveData } = await apiRequest(
    `/outlet-payment-method-mappings`,
    {
      method: "PUT",
      body: JSON.stringify(mappingsPayload)
    },
    token
  );

  if (!saveResponse.ok) {
    throw new Error(`Failed to seed payment methods: ${saveData.error?.message || "unknown"}`);
  }
}

async function setup() {
  console.log('🚀 Starting E2E Test Suite for Invoice Payment Default\n');
  await ensureBackofficeReady();
  await ensurePaymentMethods();
  browser = await chromium.launch({ 
    headless: process.env.HEADLESS !== 'false',
    slowMo: 100 // Slow down by 100ms for visibility
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  page = await context.newPage();
  
  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`❌ Browser console error: ${msg.text()}`);
    }
  });
}

async function teardown() {
  if (page) await page.close();
  if (context) await context.close();
  if (browser) await browser.close();
}

async function login() {
  console.log('📝 Logging in...');
  await page.goto(BASE_URL);

  await page.waitForSelector('[data-testid="login-company-code"]', { timeout: 15000 });

  // Fill login form
  await page.fill('[data-testid="login-company-code"]', CREDENTIALS.companyCode);
  await page.fill('[data-testid="login-email"]', CREDENTIALS.email);
  await page.fill('[data-testid="login-password"]', CREDENTIALS.password);

  // Submit
  await page.click('button[type="submit"], button:has-text("Sign in")');

  // Wait for session to establish
  await page.waitForTimeout(1500);
}

async function navigateToSettings() {
  console.log('🔧 Navigating to Settings...');
  await page.goto(`${BASE_URL}/#/account-mappings`);
  await page.waitForSelector('h1:has-text("Account Mapping Settings")', { timeout: 15000 });
}

async function test(name, fn) {
  const result = { name, status: 'pending', error: null };
  try {
    console.log(`\n🧪 Test: ${name}`);
    await fn();
    result.status = 'passed';
    testResults.passed++;
    console.log(`✅ PASSED: ${name}`);
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    testResults.failed++;
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error: ${error.message}`);
    
    // Take screenshot on failure
    try {
      const filename = `error-${Date.now()}.png`;
      await page.screenshot({ path: `e2e-tests/screenshots/${filename}` });
      console.log(`   Screenshot: ${filename}`);
    } catch (e) {
      // Ignore screenshot errors
    }
  }
  testResults.tests.push(result);
}

// Test 1: Login and Navigate to Settings
async function testLoginAndNavigation() {
  await login();
  
  // Check we're logged in (not on login page)
  const url = page.url();
  if (url.includes('login')) {
    throw new Error('Still on login page - login failed');
  }
  
  await navigateToSettings();
  
  // Check for Payment Methods section
  await page.waitForSelector('[data-testid="payment-methods-section"]', { timeout: 15000 });

  // Check for Invoice Default column
  await page.waitForSelector('[data-testid="invoice-default-header"]', { timeout: 15000 });
}

// Test 2: Configure Invoice Default
async function testConfigureInvoiceDefault() {
  await navigateToSettings();
  
  // Find CASH method row
  await page.waitForSelector('[data-testid="payment-method-CASH-invoice-default"]', { timeout: 15000 });
  await page.check('[data-testid="payment-method-CASH-invoice-default"]');
  
  // Click Save button
  await page.click('[data-testid="save-payment-mappings"]');
  
  // Wait for save to complete
  await page.waitForTimeout(2000);
  
  // Reload and verify
  await page.reload();
  await page.waitForTimeout(1000);
  
  const isChecked = await page.isChecked('[data-testid="payment-method-CASH-invoice-default"]');
  
  if (!isChecked) {
    throw new Error('Invoice Default checkbox not persisted after reload');
  }
}

// Test 3: Multiple Defaults Validation
async function testMultipleDefaultsValidation() {
  await navigateToSettings();
  
  // Ensure we have at least 2 payment methods
  // If only CASH exists, add QRIS first
  await page.waitForSelector('[data-testid="payment-method-QRIS-invoice-default"]', { timeout: 15000 });

  // Check both CASH and QRIS (UI should keep only the last one checked)
  await page.check('[data-testid="payment-method-CASH-invoice-default"]');
  await page.check('[data-testid="payment-method-QRIS-invoice-default"]');

  const cashChecked = await page.isChecked('[data-testid="payment-method-CASH-invoice-default"]');
  const qrisChecked = await page.isChecked('[data-testid="payment-method-QRIS-invoice-default"]');

  if (cashChecked && qrisChecked) {
    throw new Error('UI allowed multiple invoice defaults to be checked');
  }

  // Save should succeed with single default
  await page.click('[data-testid="save-payment-mappings"]');
  await page.waitForTimeout(1500);
}

// Test 4: Sales Payment Auto-Selection
async function testSalesPaymentAutoSelection() {
  // First ensure CASH is set as default
  await navigateToSettings();
  await page.check('tr:has-text("CASH") input[type="checkbox"]');
  
  // Uncheck others
  const checkboxes = await page.$$('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const row = await cb.evaluateHandle(el => el.closest('tr'));
    const rowText = await row.evaluate(el => el.textContent);
    if (!rowText.includes('CASH')) {
      await cb.uncheck();
    }
  }
  
  await page.click('button:has-text("Save Payment Mappings")');
  await page.waitForTimeout(2000);
  
  // Navigate to Sales Payments
  console.log('   Navigating to Sales → Payments...');
  await page.goto(`${BASE_URL}/#/sales-payments`);
  await page.waitForTimeout(2000);
  
  // Check Account dropdown in Create Payment form
  const accountSelect = await page.$('select');
  if (!accountSelect) {
    throw new Error('Account select dropdown not found in Create Payment form');
  }
  
  // Get selected value
  const selectedValue = await accountSelect.inputValue();
  if (!selectedValue || selectedValue === '') {
    throw new Error('Account dropdown is empty - auto-selection did not work');
  }
  
  console.log(`   ✓ Account auto-filled with ID: ${selectedValue}`);
}

// Test 5: Warning When No Default
async function testWarningWhenNoDefault() {
  // Go to settings and uncheck all defaults
  await navigateToSettings();

  await page.waitForSelector('[data-testid="payment-methods-table"]', { timeout: 15000 });

  const checkboxes = await page.$$('[data-testid$="-invoice-default"]');
  for (const cb of checkboxes) {
    await cb.uncheck();
  }

  await page.click('[data-testid="save-payment-mappings"]');
  await page.waitForTimeout(2000);
  
  // Navigate to Sales Payments
  await page.goto(`${BASE_URL}/#/sales-payments`);
  await page.waitForTimeout(2000);

  // Look for warning banner
  await page.waitForSelector('[data-testid="invoice-default-warning"]', { timeout: 15000 });
  
  console.log('   ✓ Warning banner displayed correctly');
}

// Test 6: Manual Override
async function testManualOverride() {
  // Ensure default is set
  await navigateToSettings();
  await page.check('tr:has-text("CASH") input[type="checkbox"]');
  await page.click('button:has-text("Save Payment Mappings")');
  await page.waitForTimeout(2000);
  
  // Go to Sales Payments
  await page.goto(`${BASE_URL}/#/sales-payments`);
  await page.waitForTimeout(2000);
  
  // Get current selected account
  const accountSelect = await page.$('select');
  const originalValue = await accountSelect.inputValue();
  
  // Change to different account
  const options = await accountSelect.$$('option');
  if (options.length < 3) {
    console.log('   ⚠️ Skipping - not enough accounts to test override');
    testResults.skipped++;
    return;
  }
  
  // Select a different account
  await accountSelect.selectOption({ index: 2 });
  const newValue = await accountSelect.inputValue();
  
  if (newValue === originalValue) {
    throw new Error('Could not change account - manual override failed');
  }
  
  console.log(`   ✓ Successfully overrode default (${originalValue} → ${newValue})`);
}

// Main test runner
async function runTests() {
  try {
    await setup();
    
    await test('Test 1: Login and Navigate to Settings', testLoginAndNavigation);
    await test('Test 2: Configure Invoice Default', testConfigureInvoiceDefault);
    await test('Test 3: Multiple Defaults Validation (Should Fail)', testMultipleDefaultsValidation);
    await test('Test 4: Sales Payment Auto-Selection', testSalesPaymentAutoSelection);
    await test('Test 5: Warning When No Default', testWarningWhenNoDefault);
    await test('Test 6: Manual Override', testManualOverride);
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`⏭️  Skipped: ${testResults.skipped}`);
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
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n💥 Test suite failed with error:', error);
    process.exit(1);
  } finally {
    await teardown();
  }
}

// Run tests
runTests();
