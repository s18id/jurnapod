# Integration Test Fixture Policy

## Purpose

This document outlines the fixture policy for HTTP integration tests in the API project. The goal is to ensure tests accurately reflect real API behavior, avoid test-specific database pollution, and maintain consistent contract validation.

## Core Policy

### Setup and Mutation: Use API Endpoints

All HTTP integration tests must create and mutate fixtures through **public API endpoints**, not direct SQL writes.

**Why:**
- Tests real authentication, authorization, and input validation
- Validates contract correctness end-to-end
- Catches routing/permission issues early

**Allowed for setup:**
- `POST /api/users` → create user
- `POST /api/roles` → create role
- `POST /api/outlets` → create outlet
- `POST /api/users/:id/roles` → assign role

**Not allowed:**
- `INSERT INTO users ...`
- `INSERT INTO roles ...`
- `INSERT INTO user_role_assignments ...`

### Teardown: DB Cleanup Allowed

Direct DB writes are permitted only in `finally` blocks for deterministic cleanup.

**Allowed:**
```javascript
finally {
  await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [userId]);
  await db.execute("DELETE FROM users WHERE id = ?", [userId]);
}
```

### Read-Only Verification: DB Allowed

When no API endpoint exists for verification, direct DB reads are permitted (e.g., audit log persistence checks).

## Fixture Best Practices

1. **Use unique identifiers:** Include `runId` or timestamp in fixture codes to avoid collisions.
   ```javascript
   const roleCode = `TEST_ROLE_${Date.now().toString(36)}`;
   ```

2. **Deterministic cleanup:** Always clean up in `finally`, even if tests fail early.

3. **Prefer company-scoped fixtures:** Avoid creating global/system roles in tests. Use company-specific roles instead.

## Audit Logs: Canonical Field

- `audit_logs.success` is **canonical** for filtering and logic.
- `audit_logs.result` is for display/compatibility only.
- New queries must use `success` (`1` / `0`) instead of `result = 'SUCCESS'`.

**Example:**
```javascript
// Correct
await db.execute("SELECT ... WHERE success = 1");

// Avoid
await db.execute("SELECT ... WHERE result = 'SUCCESS'");
```

## Quick Checklist for PR Authors

- [ ] Setup uses API endpoints, not direct SQL
- [ ] Fixtures have unique identifiers (`runId`)
- [ ] Cleanup happens in `finally` block
- [ ] Audit log queries use `success`, not `result`

## Related Documents

- `apps/api/AGENTS.md` - Integration test fixture policy
- `packages/db/AGENTS.md` - Canonical vs compatibility columns
- `AGENTS.md` (root) - Repo-wide testing expectations
