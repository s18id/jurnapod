# E2E Tests - Invoice Payment Default

Automated end-to-end tests for the invoice payment default feature, based on `MANUAL_TESTING_GUIDE.md`.

## Prerequisites

1. **Dev servers must be running:**
   - API: http://localhost:3001/api
   - Backoffice: http://localhost:5173

2. **Database:** MySQL with migration 0027 applied

3. **Test data:** At least one payment method configured

## Installation

```bash
cd e2e-tests
npm install
npx playwright install chromium
```

## Running Tests

### Quick run (from project root):
```bash
./run-e2e-tests.sh           # Headless mode
./run-e2e-tests.sh headed    # See browser (slower)
./run-e2e-tests.sh debug     # Debug mode with inspector
```

### Direct run (from e2e-tests directory):
```bash
npm test                # Headless mode
npm run test:headed     # See browser
npm run test:debug      # Debug mode
```

## Test Coverage

Based on `MANUAL_TESTING_GUIDE.md`:

- ✅ **Test 1:** Login and Navigate to Settings
- ✅ **Test 2:** Configure Invoice Default
- ✅ **Test 3:** Multiple Defaults Validation
- ✅ **Test 4:** Sales Payment Auto-Selection
- ✅ **Test 5:** Warning When No Default
- ✅ **Test 6:** Manual Override

## What Tests Verify

### Test 1: Login and Navigation
- User can log in successfully
- Can navigate to Settings → Account Mappings
- "Invoice Default" column is visible in table

### Test 2: Configure Invoice Default
- Can check "Invoice Default" checkbox
- Can save payment mappings
- Default persists after page reload

### Test 3: Multiple Defaults Validation
- Cannot save with multiple defaults checked
- Error message appears
- Validation prevents invalid state

### Test 4: Sales Payment Auto-Selection
- Navigate to Sales → Payments
- Account dropdown is auto-filled with default
- Shows correct account from invoice default setting

### Test 5: Warning When No Default
- Uncheck all defaults and save
- Navigate to Sales → Payments
- Warning banner appears
- Account dropdown is empty

### Test 6: Manual Override
- Default is auto-filled
- User can manually change account
- Override works correctly

## Screenshots

On test failure, screenshots are saved to `screenshots/` directory with timestamp.

## Environment Variables

- `BASE_URL` - Backoffice URL (default: http://localhost:5173)
- `API_URL` - API URL (default: http://localhost:3001/api)
- `HEADLESS` - Run in headless mode (default: true)
- `PWDEBUG` - Enable Playwright debugger (default: false)

Example:
```bash
BASE_URL=http://localhost:3000 npm test
```

## Troubleshooting

### Tests fail with "Cannot connect"
- Ensure dev servers are running
- Check URLs are correct

### Tests fail with "Element not found"
- UI might have changed
- Update selectors in test file
- Run in headed mode to see what's happening: `npm run test:headed`

### Browser doesn't launch
- Install browsers: `npx playwright install chromium`
- Check Playwright installation: `npx playwright --version`

### Login fails
- Check credentials in test file
- Verify user exists in database
- Check company code is correct

## Debugging

### Visual debugging (see browser):
```bash
npm run test:headed
```

### Step-by-step debugging:
```bash
npm run test:debug
```

This opens Playwright Inspector where you can:
- Step through each test action
- Inspect elements
- See screenshots at each step
- View console logs

### Check specific test:
Comment out other tests in `payment-defaults.spec.mjs` and run:
```bash
npm test
```

## CI/CD Integration

To run in CI pipeline:

```yaml
- name: Run E2E tests
  run: |
    # Start dev servers in background
    cd apps/api && npm run dev &
    cd apps/backoffice && npm run dev &
    
    # Wait for servers
    sleep 10
    
    # Run tests
    cd e2e-tests && npm test
```

## Test Data Requirements

- User with email `ahmad@signal18.id` must exist
- Company code `JP` must exist
- At least one outlet assigned to user
- At least one payable account exists
- Database migration 0027 applied

## Maintenance

When UI changes:
1. Update selectors in `payment-defaults.spec.mjs`
2. Run `npm run test:headed` to verify
3. Update this README if test coverage changes

## Performance

Typical run time:
- Headless: ~30-45 seconds
- Headed: ~60-90 seconds (slower due to animations)

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed
- `1` - Test suite error (setup/teardown)

## Related Documentation

- Manual testing guide: `../MANUAL_TESTING_GUIDE.md`
- Implementation docs: `../docs/PAYMENT_METHOD_DEFAULTS_IMPLEMENTATION.md`
- Test results template: `../TEST_RESULTS.md`
