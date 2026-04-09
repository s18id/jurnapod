# Story 36.10 Coordination File - STRICT RULES

## ⚠️ CRITICAL RULES FOR AGENTS

### DO NOT:
1. **DO NOT use `git stash`** - Ever. This causes data loss.
2. **DO NOT delete files without confirming** - Check with user first.
3. **DO NOT run `git clean`** - This removes untracked files.
4. **DO NOT force push** - Never use `--force` or `-f`.

### DO:
1. **Use `edit` and `write` tools** - Make changes directly.
2. **Commit frequently** - Small, atomic commits.
3. **Update this coordination file** - Mark your batch as "in_progress" when starting, "done" when complete.
4. **Check current state** - Read files before modifying.
5. **Test after changes** - Run typecheck before marking done.

---

## Current State (Updated)

Based on git stash recovery, the following is ALREADY COMPLETE:

### ✅ COMPLETED:
- **Health routes** - `registerHealthRoutes` in `health.ts`
- **Auth routes** - `registerAuthRoutes` in `auth.ts`
- **Batch 1 (Sync + POS)** - All 8 files have registration functions
- **Batch 2 (Sales)** - All 5 files have registration functions
- **openapi-aggregator.ts** - Already imports and registers all above

### 🔄 REMAINING BATCHES:
- **Batch 3:** Accounting + Inventory (5 files)
- **Batch 4:** Outlet + Settings (7 files)
- **Batch 5:** Remaining routes (10+ files)
- **Final:** Delete openapi.jsonc + verify

---

## Batch Assignments (REMAINING ONLY)

### Batch 3: Accounting + Inventory Routes
**Status:** `in_progress`  
**Files to modify:**
1. `apps/api/src/routes/accounts.ts` - Add `registerAccountRoutes(app)`
2. `apps/api/src/routes/journals.ts` - Add `registerJournalRoutes(app)`
3. `apps/api/src/routes/inventory.ts` - Add `registerInventoryRoutes(app)`
4. `apps/api/src/routes/recipes.ts` - Add `registerRecipeRoutes(app)`
5. `apps/api/src/routes/supplies.ts` - Add `registerSupplyRoutes(app)`
6. `apps/api/src/routes/stock.ts` - ✅ FIXED type errors

**Update openapi-aggregator.ts:**
Add these lines:
```typescript
import { registerAccountRoutes } from "./accounts.js";
import { registerJournalRoutes } from "./journals.js";
import { registerInventoryRoutes } from "./inventory.js";
import { registerRecipeRoutes } from "./recipes.js";
import { registerSupplyRoutes } from "./supplies.js";

// Add in registration section:
registerAccountRoutes(app);
registerJournalRoutes(app);
registerInventoryRoutes(app);
registerRecipeRoutes(app);
registerSupplyRoutes(app);
```

### Batch 4: Outlet + Settings Routes
**Status:** `todo`  
**Files to modify:**
1. `apps/api/src/routes/outlets.ts` - Add `registerOutletRoutes(app)`
2. `apps/api/src/routes/stock.ts` - Add `registerStockRoutes(app)`
3. `apps/api/src/routes/settings-modules.ts` - Add `registerSettingsModuleRoutes(app)`
4. `apps/api/src/routes/settings-module-roles.ts` - Add `registerSettingsModuleRoleRoutes(app)`
5. `apps/api/src/routes/settings-config.ts` - Add `registerSettingsConfigRoutes(app)`
6. `apps/api/src/routes/tax-rates.ts` - Add `registerTaxRateRoutes(app)`
7. `apps/api/src/routes/settings-pages.ts` - Add `registerSettingsPageRoutes(app)`

**Update openapi-aggregator.ts:**
Add imports and registration calls (append to existing).

### Batch 5: Remaining Routes
**Status:** `todo`  
**Files to modify:**
1. `apps/api/src/routes/companies.ts` - Add `registerCompanyRoutes(app)`
2. `apps/api/src/routes/users.ts` - Add `registerUserRoutes(app)`
3. `apps/api/src/routes/roles.ts` - Add `registerRoleRoutes(app)`
4. `apps/api/src/routes/dinein.ts` - Add `registerDineInRoutes(app)`
5. `apps/api/src/routes/audit.ts` - Add `registerAuditRoutes(app)`
6. `apps/api/src/routes/reports.ts` - Add `registerReportRoutes(app)`
7. `apps/api/src/routes/export.ts` - Add `registerExportRoutes(app)`
8. `apps/api/src/routes/import.ts` - Add `registerImportRoutes(app)`
9. `apps/api/src/routes/progress.ts` - Add `registerProgressRoutes(app)`
10. `apps/api/src/routes/admin-runbook.ts` - Add `registerAdminRunbookRoutes(app)`
11. `apps/api/src/routes/admin-dashboards/*.ts` - Add registration functions

**Update openapi-aggregator.ts:**
Add imports and registration calls.

### Final: Cleanup
**Status:** `todo`  
**Depends on:** All batches complete

**Tasks:**
1. Add to `openapi-aggregator.ts`:
   ```typescript
   components: {
     securitySchemes: {
       BearerAuth: {
         type: "http",
         scheme: "bearer",
         bearerFormat: "JWT",
       },
     },
   },
   ```
2. Delete `apps/api/openapi.jsonc`
3. Run `npm run typecheck -w @jurnapod/api`
4. Verify `/swagger.json` returns complete spec

---

## Status Tracking

| Batch | Status | Agent | Notes |
|-------|--------|-------|-------|
| Batch 1 | ✅ done | - | Sync + POS - 8 files complete |
| Batch 2 | ✅ done | - | Sales - 5 files complete |
| Batch 3 | ✅ done | - | Accounting + Inventory - accounts.ts, inventory.ts, recipes.ts, supplies.ts registered |
| Batch 4 | ✅ done | - | Outlet + Settings - settings-modules.ts, settings-module-roles.ts, settings-config.ts, tax-rates.ts, settings-pages.ts registered |
| Batch 5 | ✅ done | - | Remaining routes - 11 files complete |
| Final | ✅ done | - | Security schemes added, openapi.jsonc deleted |

## Files Status (Auto-Detected)

### ✅ All Files Have Registration:
- health.ts, auth.ts
- sync/*.ts, pos-items.ts, pos-cart.ts
- sales/*.ts
- journals.ts, outlets.ts, stock.ts
- accounts.ts, inventory.ts, recipes.ts, supplies.ts
- settings-modules.ts, settings-module-roles.ts, settings-config.ts, tax-rates.ts, settings-pages.ts
- **Batch 5:** companies.ts, users.ts, roles.ts, dinein.ts, audit.ts, reports.ts, export.ts, import.ts, progress.ts, admin-runbook.ts
- **admin-dashboards:** index.ts, trial-balance.ts, reconciliation.ts, period-close.ts, sync.ts

### ✅ OpenAPI Aggregator Updated:
All route registration functions imported and called in openapi-aggregator.ts

---

## Implementation Pattern

For each route file:

```typescript
// 1. Add imports at top
import { createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

// 2. Keep existing Hono routes
export const xxxRoutes = new Hono();

// 3. Add registration function at bottom
export const registerXxxRoutes = (app: OpenAPIHono) => {
  app.openapi(
    createRoute({
      method: "get", // or post, put, patch, delete
      path: "/xxx",
      operationId: "getXxx",
      summary: "Summary",
      description: "Description",
      tags: ["TagName"],
      security: [{ BearerAuth: [] }], // if auth required
      request: {
        // params, query, body schemas
      },
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: ExistingSchema, // reuse existing Zod schemas
            },
          },
        },
        // Add error responses as needed
      },
    }),
    async (c) => {
      // Handler logic
      return c.json({ ... });
    }
  );
};
```

---

## Agent Checklist Before Starting

- [ ] Read this coordination file completely
- [ ] Read the route files you'll modify
- [ ] Read current `openapi-aggregator.ts`
- [ ] Mark your batch as "in_progress" in Status Tracking
- [ ] Implement route registration functions
- [ ] Update `openapi-aggregator.ts` with imports and registrations
- [ ] Run `npm run typecheck -w @jurnapod/api`
- [ ] Mark your batch as "done" in Status Tracking
- [ ] Report completion to user

## Agent Checklist - What NOT To Do

- [ ] Do NOT use `git stash`
- [ ] Do NOT delete files without confirmation
- [ ] Do NOT modify other batches' files
- [ ] Do NOT skip typecheck
- [ ] Do NOT mark done without testing
