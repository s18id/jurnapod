<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Outlet Expansion Runbook

This runbook documents the step-by-step process to open a new office/outlet in Jurnapod.

**Use when:** Onboarding a new branch location (outlet #2, #3, etc.)  
**Prerequisites:** Existing company, at least one active user with OWNER or COMPANY_ADMIN role  
**Duration:** ~30 minutes (excluding POS device setup)

---

## Terminology Mapping

| This runbook says... | Jurnapod system uses... |
|---------------------|------------------------|
| Branch / New Office | `outlet` |
| Branch Code | `outlets.code` (e.g., `JKT-MAIN`, `SBY-01`) |
| Branch Name | `outlets.name` |

---

## Step 1: Create Outlet

### Via Backoffice UI

1. Log in as OWNER or COMPANY_ADMIN
2. Navigate to **Settings → Outlets** (or `/outlets`)
3. Click **+ Add Outlet**
4. Fill in the form:

| Field | Value | Notes |
|-------|-------|-------|
| Code | `{CITY}-{SITE}` | Uppercase, unique per company. Example: `SBY-01`. Cannot be changed later. |
| Name | Branch name | Human-readable. Example: "Surabaya Outlet 1" |

5. Click **Save**

### Via API

```bash
curl -X POST https://your-api.com/api/outlets \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SBY-01",
    "name": "Surabaya Outlet 1"
  }'
```

**Expected response:** `201 Created` with outlet object including `id`.

---

## Step 2: Assign Users with Outlet Roles

Each user needs access to the new outlet. There are two access patterns:

### Pattern A: Global Role (Company-Wide Access)
User can access all outlets in the company automatically.

**How:** Assign a global role (OWNER, COMPANY_ADMIN, ADMIN, ACCOUNTANT) via `/api/users`.

### Pattern B: Outlet-Scoped Role (Specific Outlet Access)
User can only access specific outlets.

**How:** Assign outlet role via user creation or update:

```bash
# Create user with outlet assignment
curl -X POST https://your-api.com/api/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cashier-sby@example.com",
    "password": "SecurePass123!",
    "role_codes": ["CASHIER"],
    "outlet_ids": [3],
    "outlet_role_assignments": [
      {
        "outlet_id": 3,
        "role_codes": ["CASHIER"]
      }
    ],
    "is_active": true
  }'
```

### Verification

1. Log in as the new user
2. Confirm they see the new outlet in the outlet switcher
3. Confirm they can access POS and sync for that outlet

---

## Step 3: Configure Module Permissions

Ensure the role assigned to users has the right permissions for the new outlet.

### Check Module Roles

1. Go to **Settings → Module Roles** (`/module-roles`)
2. Find the role (e.g., CASHIER)
3. Verify permissions for required modules:

| Module | CASHIER needs | Notes |
|--------|---------------|-------|
| outlets | Read (2) | To view outlet info |
| sales | Read (2) | To process sales |
| inventory | Read (2) | To view stock |
| pos | Read + Create (3) | To run POS |

### Update if Needed

```bash
# Update permission mask (example: add create permission)
curl -X PUT https://your-api.com/api/settings/module-roles/{roleId}/pos \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"permission_mask": 3}'
```

**Permission bitmask:** Create=1, Read=2, Update=4, Delete=8  
**Example:** Read+Create = 1+2 = 3

---

## Step 4: First POS Sync Pull (New Outlet Device)

### On the POS Device

1. Log in as a user with access to the new outlet
2. Open the POS app
3. Trigger a **sync pull** (pull master data)

**Expected:**
- Items and prices download successfully
- Outlet tables (if applicable) sync
- User can select the new outlet in the outlet switcher

### Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Sync fails | Network connectivity | Verify device can reach API endpoint |
| No items downloaded | Wrong outlet selected | Ensure outlet_id matches new outlet |
| User can't see outlet | No outlet role assignment | Re-check Step 2 |
| 403 Forbidden | Missing module permissions | Re-check Step 3 |

---

## Step 5: Smoke Test

Run a minimal end-to-end test to verify the new outlet is fully operational.

### 5.1 POS Transaction Test

1. Select the new outlet in POS
2. Add an item to cart
3. Complete checkout (payment)
4. Verify receipt prints/displays

### 5.2 Journal Verification

1. Go to **Journals & Trial Balance** in backoffice
2. Filter by the new outlet
3. Verify the transaction appears with correct `outlet_id`

### 5.3 Report Verification

1. Go to **Daily Sales**
2. Filter by the new outlet
3. Verify sales total matches the test transaction

### 5.4 Access Verification

1. Log in as a user with outlet-scoped access (Pattern B)
2. Confirm they can ONLY see the assigned outlet
3. Confirm they CANNOT access other company outlets

---

## Rollback (If Needed)

If the new outlet causes issues:

1. **Remove user access:**
   ```bash
   # Update user to remove outlet assignment
   curl -X PATCH https://your-api.com/api/users/{userId} \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"outlet_ids": [], "outlet_role_assignments": []}'
   ```

2. **Deactivate outlet (soft delete):**
   - There is no hard delete for outlets
   - Remove user assignments to effectively "disable" access
   - Future: Add `is_active` flag to outlets (Phase 1)

3. **Audit trail:**
   - All outlet CRUD actions are logged in `audit_logs` table
   - Query: `SELECT * FROM audit_logs WHERE entity_type = 'outlet' AND entity_id = <outletId>`

---

## Checklist Summary

Before declaring the new outlet live:

- [ ] Outlet created with unique code
- [ ] Users assigned with correct roles (global or outlet-scoped)
- [ ] Module permissions configured
- [ ] POS sync pull succeeds on new device
- [ ] Sample transaction completes
- [ ] Journal entry appears with correct outlet_id
- [ ] Daily sales report shows transaction
- [ ] User access verified (correct isolation)

---

## Common Issues

### "User can't see new outlet"
- **Cause:** No outlet role assignment
- **Fix:** Add `outlet_role_assignments` or global role

### "POS sync returns 403"
- **Cause:** User lacks `pos` module permission
- **Fix:** Update module role permission mask

### "Transaction doesn't appear in journal"
- **Cause:** Outlet ID mismatch or sync not complete
- **Fix:** Verify `outlet_id` in request matches correct outlet

### "Duplicate outlet code"
- **Cause:** `code` must be unique per company
- **Fix:** Use different code (e.g., `SBY-02` instead of `SBY-01`)

---

## Future Enhancements

When Phase 1 (Areas) is implemented:
- Assign outlet to an Area during creation
- Filter reports by Area
- Area-level dashboards

See: `docs/plans/areas-phase1-implementation.md`
