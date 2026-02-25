/**
 * E2E Tests for Invoice Payment Default Feature
 * Based on MANUAL_TESTING_GUIDE.md
 * 
 * Run with: node e2e-tests/payment-defaults.spec.mjs
 */

import { chromium } from 'playwright';

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
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

async function setup() {
  console.log('🚀 Starting E2E Test Suite for Invoice Payment Default\n');
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
  
  // Fill login form
  await page.fill('input[name="company_code"], input[placeholder*="Company"]', CREDENTIALS.companyCode);
  await page.fill('input[type="email"], input[name="email"]', CREDENTIALS.email);
  await page.fill('input[type="password"], input[name="password"]', CREDENTIALS.password);
  
  // Submit
  await page.click('button[type="submit"], button:has-text("Login")');
  
  // Wait for navigation
  await page.waitForURL(/.*/, { timeout: 10000 });
  await page.waitForTimeout(1000);
}

async function navigateToSettings() {
  console.log('🔧 Navigating to Settings...');
  
  // Look for Settings link/button - try multiple selectors
  const settingsSelectors = [
    'a:has-text("Settings")',
    'button:has-text("Settings")',
    'a[href*="settings"]',
    '[data-test="settings-link"]'
  ];
  
  for (const selector of settingsSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.click();
        await page.waitForTimeout(1000);
        return;
      }
    } catch (e) {
      // Try next selector
    }
  }
  
  // If direct link doesn't work, try navigating directly
  await page.goto(`${BASE_URL}/settings/account-mappings`);
  await page.waitForTimeout(1000);
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
  const heading = await page.$('h2:has-text("POS Payment Methods"), h3:has-text("Payment Methods")');
  if (!heading) {
    throw new Error('Payment Methods section not found');
  }
  
  // Check for Invoice Default column
  const invoiceDefaultHeader = await page.$('th:has-text("Invoice Default")');
  if (!invoiceDefaultHeader) {
    throw new Error('Invoice Default column not found in table');
  }
}

// Test 2: Configure Invoice Default
async function testConfigureInvoiceDefault() {
  await navigateToSettings();
  
  // Find CASH method row
  const cashRow = await page.$('tr:has-text("CASH")');
  if (!cashRow) {
    throw new Error('CASH payment method not found');
  }
  
  // Find checkbox in CASH row
  const checkbox = await cashRow.$('input[type="checkbox"]');
  if (!checkbox) {
    throw new Error('Invoice Default checkbox not found for CASH');
  }
  
  // Check the checkbox
  await checkbox.check();
  
  // Click Save button
  const saveButton = await page.$('button:has-text("Save Payment Mappings")');
  if (!saveButton) {
    throw new Error('Save Payment Mappings button not found');
  }
  await saveButton.click();
  
  // Wait for save to complete
  await page.waitForTimeout(2000);
  
  // Reload and verify
  await page.reload();
  await page.waitForTimeout(1000);
  
  const reloadedCheckbox = await page.$('tr:has-text("CASH") input[type="checkbox"]');
  const isChecked = await reloadedCheckbox.isChecked();
  
  if (!isChecked) {
    throw new Error('Invoice Default checkbox not persisted after reload');
  }
}

// Test 3: Multiple Defaults Validation
async function testMultipleDefaultsValidation() {
  await navigateToSettings();
  
  // Ensure we have at least 2 payment methods
  // If only CASH exists, add QRIS first
  const qrisRow = await page.$('tr:has-text("QRIS")');
  if (!qrisRow) {
    console.log('   Adding QRIS payment method...');
    await page.fill('input[placeholder*="code"], input[placeholder*="Method"]', 'QRIS');
    await page.fill('input[placeholder*="label"], input[placeholder*="Label"]', 'QRIS Payment');
    
    const addButton = await page.$('button:has-text("Add Method")');
    if (addButton) {
      await addButton.click();
      await page.waitForTimeout(1000);
      
      // Select an account for QRIS
      const qrisAccountSelect = await page.$('tr:has-text("QRIS") select');
      if (qrisAccountSelect) {
        const options = await qrisAccountSelect.$$('option');
        if (options.length > 1) {
          await qrisAccountSelect.selectOption({ index: 1 });
        }
      }
    }
  }
  
  // Check both CASH and QRIS
  await page.check('tr:has-text("CASH") input[type="checkbox"]');
  await page.check('tr:has-text("QRIS") input[type="checkbox"]');
  
  // Try to save
  const saveButton = await page.$('button:has-text("Save Payment Mappings")');
  await saveButton.click();
  
  // Wait for error message
  await page.waitForTimeout(2000);
  
  // Look for error message
  const errorMessage = await page.textContent('body');
  if (!errorMessage.includes('Only one payment method') && !errorMessage.includes('invoice default')) {
    throw new Error('Expected validation error message not shown');
  }
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
  await page.goto(`${BASE_URL}/sales/payments`);
  await page.waitForTimeout(2000);
  
  // Check Account dropdown in Create Payment form
  const accountSelect = await page.$('select:near(:text("Account")), select[name*="account"]');
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
  
  const checkboxes = await page.$$('input[type="checkbox"]');
  for (const cb of checkboxes) {
    await cb.uncheck();
  }
  
  await page.click('button:has-text("Save Payment Mappings")');
  await page.waitForTimeout(2000);
  
  // Navigate to Sales Payments
  await page.goto(`${BASE_URL}/sales/payments`);
  await page.waitForTimeout(2000);
  
  // Look for warning banner
  const warningText = await page.textContent('body');
  if (!warningText.includes('No invoice default') && !warningText.includes('no default')) {
    throw new Error('Warning banner not shown when no default is configured');
  }
  
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
  await page.goto(`${BASE_URL}/sales/payments`);
  await page.waitForTimeout(2000);
  
  // Get current selected account
  const accountSelect = await page.$('select:near(:text("Account")), select[name*="account"]');
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
