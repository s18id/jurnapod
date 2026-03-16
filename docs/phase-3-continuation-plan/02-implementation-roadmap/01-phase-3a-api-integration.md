# Phase 3A: Complete API Integration (Priority: HIGH)

## 1. Fix Authentication Integration

- [ ] **Fix auth guard usage in backoffice endpoints**
  - Issue: `companyId` property doesn't exist on `AccessGuardOptions`
  - Solution: Use proper auth guard pattern from existing endpoints
  - Files: `apps/api/app/api/sync/backoffice/*/route.ts`

## 2. Complete Backoffice API Endpoints

- [ ] **Create all tier endpoints** (`realtime`, `operational`, `master`, `admin`, `analytics`)
  - Pattern: Follow POS endpoint structure
  - Auth: OWNER/ADMIN/ACCOUNTANT only (no CASHIER)
  - Validation: Company-scoped access (not outlet-scoped)

## 3. Update API Server Integration

- [ ] **Add backoffice module to sync-modules.ts**
  - Register BackofficeSyncModule alongside POS module
  - Configure appropriate frequencies
  - Add to health checks

## 4. Add Backoffice Dependencies

- [ ] **Update API package.json**
  - Add `"@jurnapod/backoffice-sync": "0.1.0"`
  - Update import paths
