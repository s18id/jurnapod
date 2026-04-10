# Regression Test Generation Template

> **Purpose**: Auto-generate failing test skeletons when P1/P0 findings are confirmed during adversarial review.
>
> **Scope**: This template provides standardized test structures for regression tests that prevent re-introduction of critical bugs.

---

## When to Use This Template

**Trigger**: After `bmad-review-adversarial-general` confirms P1 findings
**Action**: Generate regression test skeletons before fixing the bug
**Goal**: Tests fail before fix, pass after fix — classic TDD for regression prevention

---

## Test File Structure Template

### 1. Unit Test Structure (For Pure Logic Bugs)

```typescript
// __test__/unit/{module}/{feature}.regression.test.ts
// Regression test for: {FINDING_ID} - {Brief description}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Test Setup
// =============================================================================

describe('{Module}.{Feature} - Regression: {FINDING_TITLE}', () => {
  beforeEach(() => {
    // Reset mocks and state
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // Regression: {FINDING_ID}
  // =============================================================================

  describe('REGRESSION-{FINDING_ID}: {Issue Description}', () => {
    it('should {expected behavior} when {condition} (P1)', async () => {
      // Arrange: Setup the failing condition
      // TODO: Add setup code here

      // Act: Execute the function under test
      // TODO: Add execution code here

      // Assert: Verify the fix works
      // TODO: Add assertions here
      // Example: expect(result).toBe(expected);
      // Example: await expect(promise).rejects.toThrow(expectedError);
    });

    it('should NOT {bug behavior} when {condition} (P1)', async () => {
      // Negative test to ensure bug doesn't reoccur
      // TODO: Add setup code here

      // TODO: Add execution code here

      // TODO: Add assertions that bug behavior is prevented
    });
  });
});
```

### 2. Integration Test Structure (For DB/HTTP Bugs)

```typescript
// __test__/integration/{module}/{feature}.regression.test.ts
// Regression test for: {FINDING_ID} - {Brief description}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { 
  createTestCompany, 
  createTestUser, 
  createTestItem,
  getTestAccessToken,
  resetFixtureRegistry 
} from '../../fixtures';

let baseUrl: string;
let accessToken: string;

describe('{Module}.{Feature} - Regression: {FINDING_TITLE}', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // =============================================================================
  // Regression: {FINDING_ID}
  // =============================================================================

  describe('REGRESSION-{FINDING_ID}: {Issue Description}', () => {
    it('should {expected behavior} when {condition} (P1)', async () => {
      // Arrange: Create test data via fixtures
      // const company = await createTestCompany({ code: 'TEST01', name: 'Test' });
      // const item = await createTestItem(company.id, { sku: 'TEST-001', name: 'Test Item' });

      // Act: Make HTTP request or DB operation
      // const res = await fetch(`${baseUrl}/api/...`, { ... });

      // Assert: Verify expected outcome
      // expect(res.status).toBe(200);
      // const body = await res.json();
      // expect(body.data).toHaveProperty('...');
    });

    it('should enforce {security boundary} across {scope} (P1)', async () => {
      // Cross-tenant or cross-resource security test
      // Verify that company_id/outlet_id scoping is enforced
    });
  });
});
```

### 3. Race Condition Test Structure (For Concurrency Bugs)

```typescript
// __test__/integration/{module}/{feature}.concurrency.test.ts
// Regression test for: {FINDING_ID} - Race condition

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { 
  createTestCompany, 
  createTestItem,
  resetFixtureRegistry 
} from '../../fixtures';

describe('{Module}.{Feature} - Concurrency Regression: {FINDING_TITLE}', { timeout: 60000 }, () => {
  beforeAll(async () => {
    // Setup if needed
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // =============================================================================
  // Regression: {FINDING_ID} - Race Condition
  // =============================================================================

  describe('REGRESSION-{FINDING_ID}: {Race condition description}', () => {
    it('should handle concurrent {operations} without {bad outcome} (P1)', async () => {
      // Arrange: Setup concurrent operations
      const concurrency = 10;
      const operations: Promise<any>[] = [];

      // Create test data
      // const company = await createTestCompany({ ... });
      // const item = await createTestItem(company.id, { ... });

      // Act: Execute concurrent operations
      for (let i = 0; i < concurrency; i++) {
        operations.push(
          // Call the function under test concurrently
          // operationPromise(company.id, item.id, { ... })
        );
      }

      const results = await Promise.allSettled(operations);

      // Assert: Verify no race condition occurred
      // - Check for duplicate values
      // - Check for inconsistent state
      // - Verify all operations succeeded or failed appropriately

      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      // Example: All should succeed
      expect(failed).toHaveLength(0);

      // Example: No duplicates in returned IDs
      // const ids = successful.map(r => (r as any).value.id);
      // const uniqueIds = new Set(ids);
      // expect(uniqueIds.size).toBe(ids.length);

      // Example: Verify DB state is consistent
      // const db = getTestDb();
      // const rows = await db.selectFrom('...').where(...).execute();
      // expect(rows).toHaveLength(concurrency);
    });
  });
});
```

---

## Example: Sort-Order Race Condition (Story 37.1)

**Finding**: Concurrent image uploads can result in duplicate `sort_order` values due to non-atomic MAX+1 calculation.

**Location**: `apps/api/src/lib/uploader/adapters/item-image-adapter.ts`
**Bug**: Race condition in `sort_order` calculation — two concurrent uploads can read the same MAX value before either writes.

```typescript
// __test__/integration/uploader/item-image-sort-order.regression.test.ts
// Regression test for: Story 37.1 - Sort-order race condition

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { 
  createTestCompany, 
  createTestItem,
  getTestAccessToken,
  resetFixtureRegistry 
} from '../../fixtures';
import { getTestBaseUrl } from '../../helpers/env';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/db-types.js';

let baseUrl: string;
let accessToken: string;
let db: Kysely<DB>;

describe('item-image-adapter - Regression: Sort-Order Race Condition', { timeout: 60000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    db = getTestDb();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // =============================================================================
  // Regression: Story 37.1 - Sort-Order Race Condition
  // =============================================================================

  describe('REGRESSION-37.1: Concurrent uploads must have unique sort_order', () => {
    it('should assign unique sort_order for concurrent image uploads (P1)', async () => {
      // Arrange: Create test item
      const company = await createTestCompany({
        code: 'TESTCONC',
        name: 'Test Concurrent Company'
      });
      const item = await createTestItem(company.id, {
        sku: 'TEST-CONC-001',
        name: 'Test Concurrent Item',
        type: 'PRODUCT'
      });

      // Create a minimal valid image buffer (1x1 red pixel JPEG)
      const sharp = await import('sharp');
      const svg = `<svg width="1" height="1"><rect fill="#ff0000" width="1" height="1"/></svg>`;
      const imageBuffer = await sharp.default(Buffer.from(svg)).jpeg().toBuffer();

      // Act: Upload 10 images concurrently for the same item
      const concurrency = 10;
      const uploadPromises: Promise<any>[] = [];

      for (let i = 0; i < concurrency; i++) {
        uploadPromises.push(
          fetch(`${baseUrl}/api/inventory/items/${item.id}/images`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
              'X-File-Name': `concurrent-${i}.jpg`,
              'X-Mime-Type': 'image/jpeg'
            },
            body: imageBuffer
          }).then(r => r.json())
        );
      }

      const results = await Promise.all(uploadPromises);

      // Assert: All uploads succeeded
      const successful = results.filter(r => r.success);
      expect(successful).toHaveLength(concurrency);

      // Assert: All sort_order values are unique
      const dbImages = await db
        .selectFrom('item_images')
        .where('item_id', '=', item.id)
        .where('company_id', '=', company.id)
        .select(['id', 'sort_order'])
        .execute();

      expect(dbImages).toHaveLength(concurrency);

      const sortOrders = dbImages.map(img => img.sort_order);
      const uniqueSortOrders = new Set(sortOrders);

      // CRITICAL: No duplicate sort_order values
      expect(uniqueSortOrders.size).toBe(sortOrders.length);

      // Sort orders should be sequential (0, 1, 2, ... 9)
      const sorted = [...sortOrders].sort((a, b) => a - b);
      for (let i = 0; i < concurrency; i++) {
        expect(sorted[i]).toBe(i);
      }
    });

    it('should NOT allow duplicate sort_order from race condition (P1)', async () => {
      // This test specifically targets the MAX+1 race condition
      // Before fix: Two concurrent uploads could both read MAX=0, both write sort_order=1
      // After fix: Each upload gets a unique sort_order via atomic operation or locking

      const company = await createTestCompany({
        code: 'TESTDUP',
        name: 'Test Duplicate Sort Company'
      });
      const item = await createTestItem(company.id, {
        sku: 'TEST-DUP-001',
        name: 'Test Duplicate Sort Item',
        type: 'PRODUCT'
      });

      const sharp = await import('sharp');
      const svg = `<svg width="1" height="1"><rect fill="#ff0000" width="1" height="1"/></svg>`;
      const imageBuffer = await sharp.default(Buffer.from(svg)).jpeg().toBuffer();

      // Simulate the race condition by making nearly simultaneous requests
      const uploadPromises = [
        fetch(`${baseUrl}/api/inventory/items/${item.id}/images`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'X-File-Name': 'race-1.jpg',
            'X-Mime-Type': 'image/jpeg'
          },
          body: imageBuffer
        }),
        fetch(`${baseUrl}/api/inventory/items/${item.id}/images`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'X-File-Name': 'race-2.jpg',
            'X-Mime-Type': 'image/jpeg'
          },
          body: imageBuffer
        })
      ];

      await Promise.all(uploadPromises);

      // Verify no duplicates exist
      const dbImages = await db
        .selectFrom('item_images')
        .where('item_id', '=', item.id)
        .where('company_id', '=', company.id)
        .select(['sort_order'])
        .execute();

      const sortOrders = dbImages.map(img => img.sort_order);
      const uniqueSortOrders = new Set(sortOrders);

      expect(uniqueSortOrders.size).toBe(dbImages.length);
    });
  });
});
```

---

## Example: Missing Ownership Check (Story 37.2)

**Finding**: `deleteImage()` and `updateImage()` don't verify item ownership before allowing operations.

**Location**: `apps/api/src/lib/item-images.ts` (or related route handler)
**Bug**: Cross-tenant access vulnerability — user from Company A can delete/update images belonging to Company B.

```typescript
// __test__/integration/item-images/ownership.regression.test.ts
// Regression test for: Story 37.2 - Missing ownership check

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, closeTestDb } from '../../helpers/db';
import { 
  createTestCompany, 
  createTestItem,
  createTestUser,
  getTestAccessToken,
  resetFixtureRegistry,
  setupUserPermission
} from '../../fixtures';
import { getTestBaseUrl } from '../../helpers/env';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/db-types.js';

let baseUrl: string;
let db: Kysely<DB>;

describe('item-images - Regression: Missing Ownership Check', { timeout: 30000 }, () => {
  beforeAll(async () => {
    baseUrl = getTestBaseUrl();
    db = getTestDb();
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
  });

  // =============================================================================
  // Regression: Story 37.2 - Missing Ownership Check
  // =============================================================================

  describe('REGRESSION-37.2: Operations must verify item ownership', () => {
    it('should reject deleteImage when image belongs to different company (P1)', async () => {
      // Arrange: Create two separate companies
      const companyA = await createTestCompany({
        code: 'COMP-A',
        name: 'Company A'
      });
      const companyB = await createTestCompany({
        code: 'COMP-B',
        name: 'Company B'
      });

      // Create items in each company
      const itemA = await createTestItem(companyA.id, {
        sku: 'ITEM-A-001',
        name: 'Item A',
        type: 'PRODUCT'
      });
      const itemB = await createTestItem(companyB.id, {
        sku: 'ITEM-B-001',
        name: 'Item B',
        type: 'PRODUCT'
      });

      // Create an image for Company A's item
      const sharp = await import('sharp');
      const svg = `<svg width="1" height="1"><rect fill="#ff0000" width="1" height="1"/></svg>`;
      const imageBuffer = await sharp.default(Buffer.from(svg)).jpeg().toBuffer();

      const tokenA = await getTestAccessToken(baseUrl);

      // Upload image as Company A user
      const uploadRes = await fetch(`${baseUrl}/api/inventory/items/${itemA.id}/images`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenA}`,
          'Content-Type': 'application/octet-stream',
          'X-File-Name': 'owned-by-a.jpg',
          'X-Mime-Type': 'image/jpeg'
        },
        body: imageBuffer
      });
      const uploadBody = await uploadRes.json();
      expect(uploadRes.status).toBe(200);
      const imageId = uploadBody.data.id;

      // Get token for Company B user
      const tokenB = await getTestAccessToken(baseUrl);

      // Act: Try to delete Company A's image as Company B user
      const deleteRes = await fetch(`${baseUrl}/api/inventory/items/${itemA.id}/images/${imageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${tokenB}`,
          'Content-Type': 'application/json'
        }
      });

      // Assert: Should be rejected (403 Forbidden or 404 Not Found)
      expect([403, 404]).toContain(deleteRes.status);

      // Verify image still exists in DB
      const dbImage = await db
        .selectFrom('item_images')
        .where('id', '=', imageId)
        .where('company_id', '=', companyA.id)
        .selectAll()
        .executeTakeFirst();

      expect(dbImage).toBeDefined();
    });

    it('should reject updateImage when image belongs to different company (P1)', async () => {
      // Arrange: Two companies
      const companyA = await createTestCompany({
        code: 'COMP-A2',
        name: 'Company A (Update Test)'
      });
      const companyB = await createTestCompany({
        code: 'COMP-B2',
        name: 'Company B (Update Test)'
      });

      const itemA = await createTestItem(companyA.id, {
        sku: 'ITEM-A2-001',
        name: 'Item A2',
        type: 'PRODUCT'
      });

      // Create image for Company A
      const sharp = await import('sharp');
      const svg = `<svg width="1" height="1"><rect fill="#ff0000" width="1" height="1"/></svg>`;
      const imageBuffer = await sharp.default(Buffer.from(svg)).jpeg().toBuffer();

      const tokenA = await getTestAccessToken(baseUrl);

      const uploadRes = await fetch(`${baseUrl}/api/inventory/items/${itemA.id}/images`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenA}`,
          'Content-Type': 'application/octet-stream',
          'X-File-Name': 'update-test.jpg',
          'X-Mime-Type': 'image/jpeg'
        },
        body: imageBuffer
      });
      const uploadBody = await uploadRes.json();
      const imageId = uploadBody.data.id;
      const originalSortOrder = uploadBody.data.sort_order;

      // Act: Try to update as Company B user
      const tokenB = await getTestAccessToken(baseUrl);
      const updateRes = await fetch(`${baseUrl}/api/inventory/items/${itemA.id}/images/${imageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${tokenB}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sort_order: 999,
          is_primary: true
        })
      });

      // Assert: Should be rejected
      expect([403, 404]).toContain(updateRes.status);

      // Verify image was NOT modified
      const dbImage = await db
        .selectFrom('item_images')
        .where('id', '=', imageId)
        .where('company_id', '=', companyA.id)
        .select(['sort_order', 'is_primary'])
        .executeTakeFirst();

      expect(dbImage).toBeDefined();
      expect(dbImage!.sort_order).toBe(originalSortOrder);
      expect(dbImage!.is_primary).toBe(0); // or original value
    });

    it('should reject operations when item_id does not match image (P1)', async () => {
      // Test that verifies the image belongs to the specified item
      // Prevents: /api/items/123/images/456 where image 456 belongs to item 789

      const company = await createTestCompany({
        code: 'COMP-MISMATCH',
        name: 'Mismatch Test Company'
      });

      const item1 = await createTestItem(company.id, {
        sku: 'ITEM-1-001',
        name: 'Item 1',
        type: 'PRODUCT'
      });
      const item2 = await createTestItem(company.id, {
        sku: 'ITEM-2-001',
        name: 'Item 2',
        type: 'PRODUCT'
      });

      const sharp = await import('sharp');
      const svg = `<svg width="1" height="1"><rect fill="#ff0000" width="1" height="1"/></svg>`;
      const imageBuffer = await sharp.default(Buffer.from(svg)).jpeg().toBuffer();

      const token = await getTestAccessToken(baseUrl);

      // Upload image for item1
      const uploadRes = await fetch(`${baseUrl}/api/inventory/items/${item1.id}/images`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'X-File-Name': 'item1-image.jpg',
          'X-Mime-Type': 'image/jpeg'
        },
        body: imageBuffer
      });
      const uploadBody = await uploadRes.json();
      const imageId = uploadBody.data.id;

      // Try to access image through wrong item endpoint
      const wrongItemRes = await fetch(
        `${baseUrl}/api/inventory/items/${item2.id}/images/${imageId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Should reject even though same company (wrong item)
      expect([403, 404]).toContain(wrongItemRes.status);
    });
  });
});
```

---

## Checklist: Adding to Review Workflow

When `bmad-review-adversarial-general` finds P1/P0 issues:

### Step 1: Identify Test Type
- [ ] **Race condition** → Use Race Condition Test Template
- [ ] **Security boundary** → Use Integration Test Template (cross-tenant)
- [ ] **Logic error** → Use Unit Test Template
- [ ] **Data integrity** → Use Integration Test Template (DB verification)

### Step 2: Generate Skeleton
- [ ] Copy appropriate template section
- [ ] Replace `{FINDING_ID}` with actual finding number (e.g., `REGRESSION-37.1`)
- [ ] Replace `{Issue Description}` with clear description of bug
- [ ] Add `TODO` markers for implementation details

### Step 3: Save Test File
- [ ] Save to appropriate location:
  - Unit: `apps/api/__test__/unit/{module}/{feature}.regression.test.ts`
  - Integration: `apps/api/__test__/integration/{module}/{feature}.regression.test.ts`
- [ ] Use descriptive filename with `.regression.` suffix

### Step 4: Verify Skeleton Fails
- [ ] Run test before fix: `npm run test:single -- __test__/.../feature.regression.test.ts`
- [ ] Confirm test fails (expected behavior for TDD)
- [ ] Document expected failure mode in test comments

### Step 5: Implement Fix
- [ ] Developer implements fix
- [ ] Test should now pass
- [ ] If test still fails, bug is not fully fixed

### Step 6: Add to Regression Suite
- [ ] Ensure test runs in CI: `npm run test:integration`
- [ ] Add to test documentation if needed

---

## Severity Mapping

| Severity | Template Type | Test Scope |
|----------|---------------|------------|
| **P0** | Race Condition + Integration | Full concurrency + cross-tenant tests |
| **P1** | Integration | Cross-tenant security + DB state verification |
| **P1** | Unit | Pure logic validation with mocked dependencies |
| **P2** | Unit | Edge cases and boundary conditions |

---

## Notes for Review Agent

When generating regression test skeletons:

1. **Be specific**: Reference exact file paths and function names from the finding
2. **Include negative tests**: Verify the bug behavior is prevented, not just that correct behavior works
3. **Test cross-tenant**: For auth/ownership bugs, always test Company A accessing Company B data
4. **Race conditions**: Use `Promise.all()` or `Promise.allSettled()` with high concurrency (10+ operations)
5. **Document assumptions**: Add comments explaining what the bug was and how the test verifies the fix

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-09 | Initial template based on Epic 37 findings |
