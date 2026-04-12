// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * OpenAPI Aggregator
 *
 * Aggregates routes from multiple sources and generates an OpenAPI spec.
 * This replaces the static JSONC file approach with auto-generated specs.
 *
 * Story 36.9: Proof-of-Concept for OpenAPI Auto-Generation with Health + Auth Routes
 * Story 36.10: Batch 1 - Sync + POS routes
 * Story 36.10: Batch 2 - Sales routes
 * Story 36.10: Batch 3 - Accounting + Inventory routes
 * Story 36.10: Batch 4 - Outlet + Settings routes
 * Story 36.10: Batch 5 - Remaining routes (companies, users, roles, dinein, audit, reports, export, import, progress, admin-runbook, admin-dashboards)
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { registerHealthRoutes } from "./health.js";
import { registerAuthRoutes } from "./auth.js";
import { registerSyncHealthRoutes } from "./sync/health.js";
import { registerCheckDuplicateRoutes } from "./sync/check-duplicate.js";
import { registerSyncPushRoutes } from "./sync/push.js";
import { registerSyncPullRoutes } from "./sync/pull.js";
import { registerSyncStockRoutes } from "./sync/stock.js";
import { registerPosItemRoutes } from "./pos-items.js";
import { registerPosCartRoutes } from "./pos-cart.js";
import { registerSalesRoutes } from "./sales.js";
import { registerSalesOrderRoutes } from "./sales/orders.js";
import { registerSalesInvoiceRoutes } from "./sales/invoices.js";
import { registerSalesPaymentRoutes } from "./sales/payments.js";
import { registerSalesCreditNoteRoutes } from "./sales/credit-notes.js";
import { registerAccountRoutes } from "./accounts.js";
import { registerInventoryRoutes } from "./inventory.js";
import { registerImageRoutes } from "./inventory-images.js";
import { registerRecipeRoutes } from "./recipes.js";
import { registerSupplyRoutes } from "./supplies.js";
import { registerJournalRoutes } from "./journals.js";
import { registerSettingsModuleRoutes } from "./settings-modules.js";
import { registerSettingsModuleRoleRoutes } from "./settings-module-roles.js";
import { registerSettingsConfigRoutes } from "./settings-config.js";
import { registerTaxRateRoutes } from "./tax-rates.js";
import { registerSettingsPageRoutes } from "./settings-pages.js";
import { registerOutletRoutes } from "./outlets.js";
import { registerCompanyRoutes } from "./companies.js";
import { registerUserRoutes } from "./users.js";
import { registerRoleRoutes } from "./roles.js";
import { registerDineInRoutes } from "./dinein.js";
import { registerAuditRoutes } from "./audit.js";
import { registerReportRoutes } from "./reports.js";
import { registerExportRoutes } from "./export.js";
import { registerImportRoutes } from "./import.js";
import { registerProgressRoutes } from "./progress.js";
import { registerAdminRunbookRoutes } from "./admin-runbook.js";
import { registerAdminDashboardRoutes } from "./admin-dashboards/index.js";
import { registerTrialBalanceRoutes } from "./admin-dashboards/trial-balance.js";
import { registerReconciliationRoutes } from "./admin-dashboards/reconciliation.js";
import { registerPeriodCloseRoutes } from "./admin-dashboards/period-close.js";
import { registerSyncDashboardRoutes } from "./admin-dashboards/sync.js";

// Create OpenAPIHono instance for spec generation
const app = new OpenAPIHono();

// Register routes with OpenAPIHono
registerHealthRoutes(app);
registerAuthRoutes(app);
registerSyncHealthRoutes(app);
registerCheckDuplicateRoutes(app);
registerSyncPushRoutes(app);
registerSyncPullRoutes(app);
registerSyncStockRoutes(app);
registerPosItemRoutes(app);
registerPosCartRoutes(app);
registerSalesRoutes(app);
registerSalesOrderRoutes(app);
registerSalesInvoiceRoutes(app);
registerSalesPaymentRoutes(app);
registerSalesCreditNoteRoutes(app);
registerAccountRoutes(app);
registerInventoryRoutes(app);
registerImageRoutes(app);
registerRecipeRoutes(app);
registerSupplyRoutes(app);
registerJournalRoutes(app);
registerSettingsModuleRoutes(app);
registerSettingsModuleRoleRoutes(app);
registerSettingsConfigRoutes(app);
registerTaxRateRoutes(app);
registerSettingsPageRoutes(app);
registerOutletRoutes(app);
registerCompanyRoutes(app);
registerUserRoutes(app);
registerRoleRoutes(app);
registerDineInRoutes(app);
registerAuditRoutes(app);
registerReportRoutes(app);
registerExportRoutes(app);
registerImportRoutes(app);
registerProgressRoutes(app);
registerAdminRunbookRoutes(app);
registerAdminDashboardRoutes(app);
registerTrialBalanceRoutes(app);
registerReconciliationRoutes(app);
registerPeriodCloseRoutes(app);
registerSyncDashboardRoutes(app);

// Generate the base OpenAPI spec
const baseSpec = app.getOpenAPIDocument({
  openapi: "3.0.0",
  info: {
    version: "0.3.0",
    title: "Jurnapod API",
    description: "From cashier to ledger. Modular ERP API.",
  },
  servers: [
    {
      url: "/api",
      description: "API",
    },
  ],
});

// Add security schemes to the spec
export const openAPISpec = {
  ...baseSpec,
  components: {
    ...baseSpec.components,
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};
