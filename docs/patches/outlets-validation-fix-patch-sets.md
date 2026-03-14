# Outlet Validation Fix Patch Sets

This document contains the detailed patch sets to fix the validation issues identified in the outlets code review.

## Summary of Issues

| Priority | Issue | Impact |
|----------|-------|--------|
| P1 | Silent validation bypass on new profile fields | Invalid/oversized values are silently dropped instead of returning 400 |
| P1 | Shared Zod contract drift at API boundary | Routes not using shared schemas, causing inconsistent behavior |
| P2 | Empty PATCH body returns success | Misleading no-op responses |
| P2 | Unrelated file in outlets commit | Commit hygiene issue |

---

## Patch Set 1: Enforce Shared Zod Contracts at API Boundary

**Files:**
- `packages/shared/src/schemas/outlets.ts`
- `apps/api/app/api/outlets/route.ts`
- `apps/api/app/api/outlets/[outletId]/route.ts`

### Changes to `packages/shared/src/schemas/outlets.ts`

```typescript
// Make company_id optional in create request (defaults to auth company)
export const OutletCreateRequestSchema = z.object({
  company_id: NumericIdSchema.optional(),  // Changed: was required
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  city: z.string().trim().max(96).optional(),
  address_line1: z.string().trim().max(191).optional(),
  address_line2: z.string().trim().max(191).optional(),
  postal_code: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(191).optional().nullable(),  // Added nullable
  timezone: z.string().trim().max(64).optional()
});

// Update request: ensure all optional fields consistently allow null for clearing
export const OutletUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    city: z.string().trim().max(96).optional().nullable(),
    address_line1: z.string().trim().max(191).optional().nullable(),
    address_line2: z.string().trim().max(191).optional().nullable(),
    postal_code: z.string().trim().max(20).optional().nullable(),
    phone: z.string().trim().max(32).optional().nullable(),
    email: z.string().trim().email().max(191).optional().nullable(),
    timezone: z.string().trim().max(64).optional().nullable(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
```

### Changes to `apps/api/app/api/outlets/route.ts`

```typescript
// REMOVE these helper functions (no longer needed):
// - parseStringOptional()
// - parseEmailOptional()

// ADD imports
import { 
  OutletCreateRequestSchema,
  OutletFullResponseSchema 
} from "@jurnapod/shared";
import { ZodError } from "zod";

// In POST handler, replace manual validation with Zod:
export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      
      // Parse with shared schema (throws ZodError on invalid)
      const parsed = OutletCreateRequestSchema.parse(body);
      
      // Handle company_id override (SUPER_ADMIN only)
      let targetCompanyId = parsed.company_id ?? auth.companyId;
      if (targetCompanyId !== auth.companyId) {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          allowedRoles: ["SUPER_ADMIN"]
        });
        const isSuperAdmin = access?.isSuperAdmin ?? false;
        if (!isSuperAdmin) {
          return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
        }
      }

      // Normalize optional strings: empty string -> undefined
      const normalizedData = {
        company_id: targetCompanyId,
        code: parsed.code.trim().toUpperCase(),
        name: parsed.name.trim(),
        city: parsed.city?.trim() || undefined,
        address_line1: parsed.address_line1?.trim() || undefined,
        address_line2: parsed.address_line2?.trim() || undefined,
        postal_code: parsed.postal_code?.trim() || undefined,
        phone: parsed.phone?.trim() || undefined,
        email: parsed.email?.trim() || undefined,
        timezone: parsed.timezone?.trim() || undefined,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      };

      const outlet = await createOutlet(normalizedData);
      return successResponse(outlet, 201);
    } catch (error) {
      if (error instanceof ZodError) {
        // Return detailed validation errors
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        return errorResponse("VALIDATION_ERROR", `Invalid request: ${issues}`, 400);
      }
      // ... rest of error handling
    }
  },
  // ... auth middleware
);
```

### Changes to `apps/api/app/api/outlets/[outletId]/route.ts`

```typescript
// REMOVE helper functions:
// - parseStringOptional()
// - parseEmailOptional()  
// - parseBooleanOptional()

// ADD import
import { 
  OutletUpdateRequestSchema,
  OutletFullResponseSchema 
} from "@jurnapod/shared";

// In PATCH handler:
export const PATCH = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const companyId = await resolveCompanyId(request, _auth);
      const body = await request.json();
      
      // Parse with shared schema
      const parsed = OutletUpdateRequestSchema.parse(body);
      
      // Build update data from parsed fields (undefined fields will be skipped in lib)
      const updateData: Parameters<typeof updateOutlet>[0] = {
        companyId,
        outletId,
        actor: {
          userId: _auth.userId,
          ipAddress: readClientIp(request)
        },
        ...parsed  // Zod already filtered invalid values
      };

      const outlet = await updateOutlet(updateData);
      return successResponse(outlet);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        return errorResponse("VALIDATION_ERROR", `Invalid request: ${issues}`, 400);
      }
      // ... rest of error handling
    }
  },
  // ... auth middleware
);
```

---

## Patch Set 2: Reject No-Op PATCH Clearly

**Files:**
- `apps/api/app/api/outlets/[outletId]/route.ts`
- `apps/backoffice/src/features/outlets-page.tsx`

### API Changes

In the PATCH handler, after parsing, check if there are actual changes:

```typescript
// After parsing and building updateData
// Check if there are any fields to update (excluding companyId, outletId, actor)
const updatableFields = ['name', 'city', 'address_line1', 'address_line2', 'postal_code', 'phone', 'email', 'timezone', 'is_active'];
const hasChanges = updatableFields.some(field => updateData[field as keyof typeof updateData] !== undefined);

if (!hasChanges) {
  return errorResponse("VALIDATION_ERROR", "At least one field must be provided", 400);
}
```

### Backoffice Changes

In `outlets-page.tsx`, before calling API:

```typescript
// In handleSubmit for edit mode:
} else if (dialogMode === "edit" && editingOutlet) {
  const updateData: OutletUpdateInput = {};
  
  // ... build updateData logic ...
  
  // Check if there are any actual changes
  const hasChanges = Object.keys(updateData).length > 0;
  
  if (!hasChanges) {
    setSuccessMessage("No changes to save");
    closeDialog();
    return;
  }
  
  await updateOutlet(editingOutlet.id, updateData, accessToken);
  // ...
}
```

---

## Patch Set 3: Add Integration Tests

**File:** `apps/api/tests/integration/outlets.integration.test.mjs`

### Add test block after existing CRUD tests:

```javascript
// ========================================
// Test: Outlet profile fields CRUD
// ========================================
const profileOutletCode = `PROF${runId}`.slice(0, 32).toUpperCase();
const createProfileRes = await fetch(`${baseUrl}/api/outlets`, {
  method: "POST",
  headers: ownerHeader,
  body: JSON.stringify({
    code: profileOutletCode,
    name: `Profile Test Outlet ${runId}`,
    city: "Jakarta",
    address_line1: "Jl. Sudirman No. 1",
    address_line2: "Floor 10",
    postal_code: "10220",
    phone: "+62 21 1234 5678",
    email: "jakarta@test.com",
    timezone: "Asia/Jakarta"
  })
});

assert.equal(createProfileRes.status, 201);
const profileOutlet = await createProfileRes.json();
assert.equal(profileOutlet.success, true);
assert.equal(profileOutlet.data.city, "Jakarta");
assert.equal(profileOutlet.data.address_line1, "Jl. Sudirman No. 1");
assert.equal(profileOutlet.data.email, "jakarta@test.com");
assert.equal(profileOutlet.data.timezone, "Asia/Jakarta");
assert.equal(profileOutlet.data.is_active, true);

const profileOutletId = profileOutlet.data.id;

// ========================================
// Test: PATCH profile fields including clear-to-null
// ========================================
const patchProfileRes = await fetch(`${baseUrl}/api/outlets/${profileOutletId}`, {
  method: "PATCH",
  headers: ownerHeader,
  body: JSON.stringify({
    city: "Surabaya",
    email: null,  // Clear email
    is_active: false
  })
});

assert.equal(patchProfileRes.status, 200);
const patchedOutlet = await patchProfileRes.json();
assert.equal(patchedOutlet.data.city, "Surabaya");
assert.equal(patchedOutlet.data.email, null);
assert.equal(patchedOutlet.data.is_active, false);

// ========================================
// Test: Invalid email returns 400
// ========================================
const invalidEmailRes = await fetch(`${baseUrl}/api/outlets`, {
  method: "POST",
  headers: ownerHeader,
  body: JSON.stringify({
    code: `INV${runId}`.slice(0, 32).toUpperCase(),
    name: `Invalid Email Outlet ${runId}`,
    email: "not-an-email"
  })
});

assert.equal(invalidEmailRes.status, 400);

// ========================================
// Test: PATCH with invalid email returns 400
// ========================================
const patchInvalidEmailRes = await fetch(`${baseUrl}/api/outlets/${profileOutletId}`, {
  method: "PATCH",
  headers: ownerHeader,
  body: JSON.stringify({
    email: "also-invalid"
  })
});

assert.equal(patchInvalidEmailRes.status, 400);

// ========================================
// Test: Empty PATCH returns 400
// ========================================
const emptyPatchRes = await fetch(`${baseUrl}/api/outlets/${profileOutletId}`, {
  method: "PATCH",
  headers: ownerHeader,
  body: JSON.stringify({})
});

assert.equal(emptyPatchRes.status, 400);

// Cleanup
await fetch(`${baseUrl}/api/outlets/${profileOutletId}`, {
  method: "DELETE",
  headers: ownerHeader
});
```

---

## Patch Set 4: Schema Consistency Pass

Ensure the shared schema types match exactly:

```typescript
// packages/shared/src/schemas/outlets.ts

// All string fields should have consistent optional + nullable behavior
// For fields that can be cleared: .optional().nullable()
// For fields that just aren't required: .optional()

export const OutletCreateRequestSchema = z.object({
  company_id: NumericIdSchema.optional(),  // Defaults to auth company
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  city: z.string().trim().max(96).optional(),
  address_line1: z.string().trim().max(191).optional(),
  address_line2: z.string().trim().max(191).optional(),
  postal_code: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(191).optional().nullable(),
  timezone: z.string().trim().max(64).optional()
});

export const OutletUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    city: z.string().trim().max(96).optional().nullable(),
    address_line1: z.string().trim().max(191).optional().nullable(),
    address_line2: z.string().trim().max(191).optional().nullable(),
    postal_code: z.string().trim().max(20).optional().nullable(),
    phone: z.string().trim().max(32).optional().nullable(),
    email: z.string().trim().email().max(191).optional().nullable(),
    timezone: z.string().trim().max(64).optional().nullable(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
```

---

## Patch Set 5: Commit Hygiene

### Issue
`docs/plans/supplies-operations-rollout-plan.md` was committed in the outlets change.

### Solution
Create a new commit that removes this file from the outlets change:

```bash
# Option 1: If the file should stay in the repo, move to separate commit
git revert <outlets-commit> --no-commit
git checkout HEAD -- docs/plans/supplies-operations-rollout-plan.md
git commit -m "chore: revert supplies-operations-rollout-plan from outlets commit"

# Option 2: If file belongs elsewhere, move it
git mv docs/plans/supplies-operations-rollout-plan.md docs/plans/other-location/
git commit -m "chore: move supplies-operations-rollout-plan to appropriate location"
```

---

## Execution Order

1. **Patch Set 1** - Enforce shared Zod contracts (critical)
2. **Patch Set 2** - Reject no-op PATCH (important)
3. **Patch Set 3** - Add integration tests (validates fixes)
4. **Patch Set 4** - Schema consistency (recommended)
5. **Patch Set 5** - Commit hygiene (cleanup)

---

## Verification Commands

```bash
# TypeScript type checking
npm run typecheck -w @jurnapod/api
npm run typecheck -w @jurnapod/shared  
npm run typecheck -w @jurnapod/backoffice

# Integration tests
node --test apps/api/tests/integration/outlets.integration.test.mjs

# Manual verification checklist
# - POST outlet with invalid email => expect 400
# - POST outlet with valid profile fields => expect 201 + correct values
# - PATCH outlet with empty body => expect 400
# - PATCH outlet with valid changes => expect 200 + updated values
# - PATCH outlet to clear email (null) => expect 200 + email is null
```

---

## Success Criteria

- [ ] All profile fields validated via shared Zod schema
- [ ] Invalid values return 400 with clear error messages
- [ ] Empty PATCH body returns 400
- [ ] Integration tests pass
- [ ] No silent field dropping
- [ ] Commit history is clean
