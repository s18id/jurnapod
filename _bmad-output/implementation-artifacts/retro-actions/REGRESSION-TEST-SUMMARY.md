# Summary: Regression Test Generation for Review Workflow

## What Was Created

### 1. Regression Test Template (`regression-test-template.md`)
**Location**: `_bmad-output/implementation-artifacts/retro-actions/regression-test-template.md`

**Contents**:
- **3 test structure templates**:
  1. Unit Test Structure (for pure logic bugs)
  2. Integration Test Structure (for DB/HTTP bugs)
  3. Race Condition Test Structure (for concurrency bugs)

- **2 complete working examples** from Epic 37:
  1. **Story 37.1**: Sort-order race condition test
     - Tests concurrent uploads for duplicate `sort_order` values
     - Uses 10 concurrent requests to trigger race condition
     - Verifies unique sort orders and sequential values
  
  2. **Story 37.2**: Missing ownership check test
     - Tests cross-tenant access prevention
     - Verifies Company A cannot delete Company B's images
     - Tests item_id mismatch scenarios

- **Implementation checklist** for adding to review workflow
- **Severity mapping** (P0/P1/P2 → test type)
- **Notes for review agents** on generating effective tests

---

### 2. Workflow Proposal (`review-workflow-proposal.md`)
**Location**: `_bmad-output/implementation-artifacts/retro-actions/review-workflow-proposal.md`

**Contents**:
- Analysis of current workflow gap (findings without regression prevention)
- Two implementation options:
  - **Option A**: Automatic test generation (recommended)
  - **Option B**: Optional test generation flag
- Workflow diagram showing decision flow
- Benefits and migration path (3 phases)
- Example output format (before/after comparison)

---

### 3. Updated Skill Workflow (`workflow.md`)
**Location**: `.opencode/skills/bmad-review-adversarial-general/workflow.md`

**Changes**:
- Added **Step 4: Generate Regression Test Skeletons (P1/P0)**
- Updated **Step 3** to include regression test references in findings
- Instructions for bug type classification
- Output format examples

---

### 4. Updated Skill Documentation (`SKILL.md`)
**Location**: `.opencode/skills/bmad-review-adversarial-general/SKILL.md`

**Changes**:
- Added "Regression Test Generation" section
- References template location
- Documents test type mappings
- Explains output format

---

## How It Works

### When Adversarial Review Finds P1/P0 Issues:

```
1. Review identifies P1 finding
   ↓
2. Classify bug type (race/security/logic/data)
   ↓
3. Load appropriate template from regression-test-template.md
   ↓
4. Generate test skeleton with TODO markers
   ↓
5. Save to __test__/.../feature.regression.test.ts
   ↓
6. Output test path in findings report
```

### Example Output:

```markdown
## Findings

- **P1**: Race condition in sort_order calculation allows duplicate values
  - Location: `apps/api/src/lib/uploader/adapters/item-image-adapter.ts:89`
  - Issue: Non-atomic MAX+1 calculation in concurrent uploads
  - Regression test: `apps/api/__test__/integration/uploader/item-image-sort-order.regression.test.ts` (generated)

- **P1**: Missing ownership check in deleteImage allows cross-tenant deletion
  - Location: `apps/api/src/lib/item-images.ts:142`
  - Issue: No verification that user owns the item before deleting image
  - Regression test: `apps/api/__test__/integration/item-images/ownership.regression.test.ts` (generated)
```

---

## Files Modified/Created

| File | Action | Purpose |
|------|--------|---------|
| `_bmad-output/implementation-artifacts/retro-actions/regression-test-template.md` | Created | Complete template with examples |
| `_bmad-output/implementation-artifacts/retro-actions/review-workflow-proposal.md` | Created | Implementation proposal document |
| `.opencode/skills/bmad-review-adversarial-general/workflow.md` | Modified | Added Step 4 for test generation |
| `.opencode/skills/bmad-review-adversarial-general/SKILL.md` | Modified | Added regression test section |

---

## Test Patterns Established

### Race Condition Tests
- Use high concurrency (10+ simultaneous operations)
- Verify no duplicate values in DB
- Check consistent state after concurrent execution
- Use `Promise.all()` or `Promise.allSettled()`

### Security/Ownership Tests
- Create two separate companies
- Verify cross-tenant access is rejected (403/404)
- Verify data remains unchanged after rejected operation
- Test both item-level and company-level boundaries

### Unit Tests
- Mock dependencies (DB, storage, external services)
- Test pure logic without side effects
- Use vitest with `vi.mock()` and `vi.resetModules()`

### Integration Tests
- Use real database via `getTestDb()`
- Use HTTP endpoints via `getTestBaseUrl()`
- Create test data via fixtures
- Clean up with `resetFixtureRegistry()` and `closeTestDb()`

---

## Next Steps

1. **Test the workflow**: Run `bmad-review-adversarial-general` on a sample to verify test generation
2. **Add more templates**: Expand with additional bug type templates as needed
3. **Automate template selection**: Future enhancement to auto-detect bug type from finding description
4. **Track adoption**: Monitor regression test coverage for P1/P0 findings

---

## Benefits

1. **Prevents Regression**: Tests created before fix (TDD approach)
2. **Saves Time**: No need to figure out test structure from scratch
3. **Consistency**: All regression tests follow same patterns
4. **Coverage**: P1/P0 bugs always have regression tests
5. **Traceability**: Clear link between findings and test files
