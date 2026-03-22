# Fixture Policy Exception Handling Process

## Purpose

Standardize how the team handles fixture policy exceptions in API integration tests. This ensures exceptions are tracked, reviewed, and don't become habit (习惯).

---

## Background

The standard fixture policy for API integration tests requires using API endpoints to create test data. Direct database manipulation bypasses the API contract and can lead to:
- Tests that pass but don't reflect real usage
- Broken contracts when API behavior changes
- False confidence in edge case coverage

However, legitimate exceptions exist. This document provides a process for requesting, approving, and tracking these exceptions.

---

## Standard Rule

**Rule**: All test fixture data must be created via API endpoints, not direct database manipulation.

Exception to this rule must follow the process below.

---

## When Exceptions Are Needed

### Scenario 1: API Endpoint Doesn't Exist Yet
When implementing a new API endpoint, the endpoint being tested doesn't exist yet.

**Example**: Story creates `POST /items/{id}/variants` but the endpoint doesn't exist during test creation.

### Scenario 2: Setup Data Is Too Complex
When the data setup requires complex relationships that cannot be created via existing APIs.

**Example**: Creating an item with multiple variants, price mappings, and recipe compositions in the correct state requires dozens of API calls with specific ordering.

### Scenario 3: Existing API Doesn't Expose Needed Data State
When existing APIs don't expose the exact data configuration needed for a specific test scenario.

**Example**: Testing item soft-delete requires a previously deleted item, but no API exposes "deleted" status.

---

## Exception Request Template

```markdown
## Fixture Policy Exception Request

**Story**: [story-id]
**Date**: [date]
**Requested by**: [agent name]
**Test file**: [file path]

### Standard Rule Being Exceptioned
[What the normal fixture policy says]

### Why This Exception Is Needed
[Detailed explanation of why the rule can't be followed]

### Alternative Approaches Considered
[What other options were evaluated and why they were rejected]

### How Exception Will Be Temporary
[How this will be fixed or eliminated]

### Approval
- [ ] Approved by: [name] - [date]
- [ ] Rejected by: [name] - [date]

### Review Date
[Date to revisit if exception is still needed]
```

---

## Exception Tracking Log

| Story ID | Date Requested | Date Approved/Rejected | Review Status | Review Date | Notes |
|----------|----------------|------------------------|---------------|-------------|-------|
| — | — | — | — | — | — |

---

## Process

### Step 1: Exception Request Created BEFORE Writing Tests
1. Identify that an exception is needed during test planning
2. Fill out the Exception Request Template above
3. Do NOT write tests until exception is processed

### Step 2: Posted to Project Channel for Visibility
1. Post completed exception request to the project channel
2. Tag relevant stakeholders for awareness
3. Wait 24 hours for objections or feedback

### Step 3: Reviewed in Next Retrospective for Pattern Analysis
1. Bring exception log to weekly retrospective
2. Review all active exceptions
3. Analyze for patterns indicating infrastructure gaps

### Step 4: Exception Expires After 30 Days Unless Reviewed
1. Each exception has a review date (max 30 days from approval)
2. Before expiration, evaluate:
   - Is the exception still needed?
   - Has infrastructure improved to eliminate the need?
   - Should the exception be renewed or closed?

---

## Pattern Analysis Questions

In each retrospective, review exceptions to identify:

1. **Repeated Patterns**
   - Are we repeatedly needing exceptions for the same reason?
   - Does this indicate a test infrastructure gap?

2. **Infrastructure Gaps**
   - Should we create helper functions to simplify fixture creation?
   - Would a test data factory pattern solve the issue?

3. **API Gaps**
   - Should the API provide better setup endpoints?
   - Would a "seed" or "reset" endpoint help?

4. **Process Improvements**
   - Can we improve the exception process itself?
   - Are exceptions being requested at the right time?

---

## Example Exception Requests

### Example 1: New Endpoint Being Created

```markdown
## Fixture Policy Exception Request

**Story**: 4-10-item-batch-update-api
**Date**: 2026-03-21
**Requested by**: Dev Agent
**Test file**: apps/api/src/__tests__/items/batch-update.test.ts

### Standard Rule Being Exceptioned
All test fixtures must be created via existing API endpoints.

### Why This Exception Is Needed
The batch update endpoint `PATCH /items/batch` is being created in this story. The endpoint does not exist yet, so we cannot create test items via this endpoint.

### Alternative Approaches Considered
1. Create items individually via `POST /items` - Rejected: Batch update should handle multiple items created this way, but doesn't test the batch-specific logic
2. Create test items in test database directly - Chosen as exception (see below)

### How Exception Will Be Temporary
Once batch update endpoint is stable, we will add integration tests using the actual API flow.

### Approval
- [ ] Approved by: — - —
- [ ] Rejected by: — - —

### Review Date
2026-04-20
```

### Example 2: Complex Setup Data

```markdown
## Fixture Policy Exception Request

**Story**: 4-5-cogs-integration
**Date**: 2026-03-18
**Requested by**: QA Agent
**Test file**: apps/api/src/__tests__/accounting/cogs.test.ts

### Standard Rule Being Exceptioned
All test fixtures must be created via existing API endpoints.

### Why This Exception Is Needed
Testing COGS journal entries requires a fully configured item with:
- Recipe with ingredient costs
- Active price mapping for outlet
- COGS account mapping
- Historical usage data

Creating all of this via APIs requires ~50 setup calls and still doesn't guarantee the exact state needed.

### Alternative Approaches Considered
1. Create helper functions for complex setups - Considered but still requires many API calls
2. Use API with test database seed script - Would work but seed scripts are not portable
3. Direct database insertion - Chosen for test reliability and speed

### How Exception Will Be Temporary
We will create a test data factory module that encapsulates the database insertions. This module will be reviewed and can later be converted to API calls if endpoints are added.

### Approval
- [ ] Approved by: — - —
- [ ] Rejected by: — - —

### Review Date
2026-04-17
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's a Problem | Correct Approach |
|--------------|-------------------|------------------|
| Exception requested after tests written | Circumvents review process | Request exception before writing tests |
| Exception never expires | Technical debt accumulates | Set 30-day review date |
| Exceptions not logged | No visibility, no pattern detection | Always log in tracking table |
| Exception used as shortcut | Defeats purpose of policy | Only use for legitimate scenarios |

---

## Related Documents

- [API Integration Testing Guidelines](./api-integration-testing-guidelines.md)
- [Test Architecture Overview](./test-architecture.md)
- [Retrospective Template](../templates/retrospective-template.md)

---

*Last Updated: 2026-03-21*
*Owner: Dev Team*
*Review Cadence: Monthly*
