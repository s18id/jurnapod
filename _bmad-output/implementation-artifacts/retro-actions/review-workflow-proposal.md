# Proposal: Add Regression Test Generation to Review Workflow

## Summary

Extend the `bmad-review-adversarial-general` skill to auto-generate failing regression test skeletons when P1/P0 findings are confirmed.

---

## Current State

The adversarial review workflow (`workflow.md`) currently has three steps:

1. **Step 1: Receive Content** — Load content to review
2. **Step 2: Adversarial Analysis** — Find at least ten issues
3. **Step 3: Present Findings** — Output as Markdown list

**Gap**: Findings are presented but no automated mechanism exists to ensure they don't regress.

---

## Proposed Change

### Option A: Automatic Test Generation (Recommended)

Add **Step 4** to the workflow:

```markdown
### Step 4: Generate Regression Tests (P1/P0 Only)

For each P1 or P0 finding confirmed in Step 3:

1. **Classify the bug type:**
   - Race condition → Use Race Condition Test Template
   - Security boundary (cross-tenant) → Use Integration Test Template
   - Logic error → Use Unit Test Template
   - Data integrity → Use Integration Test Template

2. **Generate test skeleton:**
   - Load template from `regression-test-template.md`
   - Replace placeholders with finding-specific details
   - Add TODO markers for implementation
   - Save to appropriate `__test__/` location

3. **Output the test file path** in findings report:
   ```
   - **P1**: Missing ownership check in deleteImage() - allows cross-tenant deletion
     - File: `apps/api/src/lib/item-images.ts:142`
     - Regression test: `apps/api/__test__/integration/item-images/ownership.regression.test.ts`
   ```

**Halt Conditions:**
- HALT if test skeleton cannot be generated (unknown bug type)
- HALT if target test directory does not exist
```

### Option B: Optional Test Generation Flag

Add a conditional step based on user preference:

```markdown
### Step 4: Generate Regression Tests (Optional)

If user requests `--generate-tests` or if `GENERATE_REGRESSION_TESTS=true`:

For each P1/P0 finding, generate regression test skeleton per Option A.
```

---

## Implementation Details

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `.opencode/skills/bmad-review-adversarial-general/workflow.md` | Add Step 4 | Insert regression test generation step |
| `.opencode/skills/bmad-review-adversarial-general/SKILL.md` | Reference template | Add link to regression-test-template.md |

### Template Reference

The workflow should reference:
```
Template location: _bmad-output/implementation-artifacts/retro-actions/regression-test-template.md
```

### Output Format

Updated findings list format:

```markdown
## Findings

### P0 Findings

- **P0**: [Critical issue description]
  - Location: `file:line`
  - Impact: [Description of risk]
  - Regression test: `path/to/regression.test.ts` (auto-generated)

### P1 Findings

- **P1**: [High priority issue description]
  - Location: `file:line`
  - Impact: [Description of risk]
  - Regression test: `path/to/regression.test.ts` (auto-generated)

### P2/P3 Findings

- [Lower priority issues...]
```

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Adversarial Review                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Step 1       │───▶│ Step 2       │───▶│ Step 3       │  │
│  │ Receive      │    │ Analyze      │    │ Present      │  │
│  │ Content      │    │ (Find 10+)   │    │ Findings     │  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘  │
│                                                  │          │
│                    ┌─────────────────────────────┘          │
│                    ▼                                        │
│           ┌─────────────────┐                               │
│           │ P1/P0 Finding?  │                               │
│           └────────┬────────┘                               │
│                    │                                        │
│         ┌─────────┴─────────┐                               │
│         │                   │                               │
│         ▼                   ▼                               │
│    ┌──────────┐       ┌──────────┐                          │
│    │   YES    │       │    NO    │                          │
│    └────┬─────┘       └────┬─────┘                          │
│         │                  │                                │
│         ▼                  ▼                                │
│  ┌──────────────┐    ┌──────────┐                          │
│  │ Step 4       │    │  Done    │                          │
│  │ Generate     │    │          │                          │
│  │ Regression   │    │          │                          │
│  │ Test         │    │          │                          │
│  └──────────────┘    └──────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Benefits

1. **Prevents Regression**: Tests are created before fix, ensuring TDD approach
2. **Saves Time**: Developers don't need to figure out test structure from scratch
3. **Consistency**: All regression tests follow same pattern and location conventions
4. **Coverage**: Ensures P1/P0 bugs always have corresponding regression tests
5. **Audit Trail**: Test file path in findings creates clear traceability

---

## Example Output

### Before (Current)

```markdown
## Findings

- **P1**: Race condition in sort_order calculation allows duplicate values
  - Location: `apps/api/src/lib/uploader/adapters/item-image-adapter.ts:89`
  - Issue: Non-atomic MAX+1 calculation in concurrent uploads

- **P1**: Missing ownership check in deleteImage allows cross-tenant deletion
  - Location: `apps/api/src/lib/item-images.ts:142`
  - Issue: No verification that user owns the item before deleting image
```

### After (Proposed)

```markdown
## Findings

- **P1**: Race condition in sort_order calculation allows duplicate values
  - Location: `apps/api/src/lib/uploader/adapters/item-image-adapter.ts:89`
  - Issue: Non-atomic MAX+1 calculation in concurrent uploads
  - Regression test: `apps/api/__test__/integration/uploader/item-image-sort-order.regression.test.ts` ✅
    - Generated: 2026-04-09
    - Type: Concurrency/Race Condition

- **P1**: Missing ownership check in deleteImage allows cross-tenant deletion
  - Location: `apps/api/src/lib/item-images.ts:142`
  - Issue: No verification that user owns the item before deleting image
  - Regression test: `apps/api/__test__/integration/item-images/ownership.regression.test.ts` ✅
    - Generated: 2026-04-09
    - Type: Security/Cross-tenant
```

---

## Migration Path

### Phase 1: Documentation (Immediate)
- ✅ Create `regression-test-template.md` (completed)
- ✅ Document templates and examples (completed)

### Phase 2: Workflow Integration (Next)
- Update `workflow.md` to include Step 4
- Add template loading logic to skill
- Test with sample findings

### Phase 3: Automation (Future)
- Auto-detect bug type from finding description
- Auto-populate file paths and function names
- Generate tests with 80%+ content filled in

---

## Open Questions

1. **Should P2 findings also get regression tests?**
   - Recommendation: No, focus on P0/P1 to avoid noise
   - Exception: Security-related P2s should be treated as P1

2. **What if test directory doesn't exist?**
   - Option A: Create directory automatically
   - Option B: Output test to `_bmad-output/` for manual placement
   - Recommendation: Option A with confirmation

3. **Should tests be generated for existing bugs (retroactive)?**
   - Recommendation: Yes, for active epics (like Epic 37)
   - Use retro-actions folder for tracking

---

## Recommendation

**Adopt Option A (Automatic Test Generation)** with the following implementation:

1. Update `workflow.md` to add Step 4
2. Load templates from `regression-test-template.md`
3. Output test file paths in findings
4. Generate skeletons for all P0/P1 findings

This ensures the adversarial review process produces not just findings, but also the infrastructure to prevent their recurrence.
