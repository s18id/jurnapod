// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// React Router v6 route tree definitions for the Jurnapod backoffice.
//
// NOTE (Batch C): The full React Router switch is deferred. The existing
// AppRouter (hash-based) remains the active routing implementation. These
// definitions serve as the canonical route tree for later batches and are
// used by the guard helpers and hash compatibility bridge.

import { APP_ROUTES } from "@/app/routes";

// ---------------------------------------------------------------------------
// Re-export the existing route definitions as the canonical source
// ---------------------------------------------------------------------------

export { APP_ROUTES };
export type { AppRoute } from "@/app/routes";

// ---------------------------------------------------------------------------
// Route path constants
// ---------------------------------------------------------------------------

/** Canonical v6-style route paths */
export const ROUTE_PATHS = {
  // Public
  LOGIN: "/login",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  INVITE: "/invite",
  VERIFY_EMAIL: "/verify-email",
  PRIVACY: "/privacy/:slug",

  // Authenticated root (shell wrapper)
  ROOT: "/",
  DASHBOARD: "/dashboard",

  // Core
  DAILY_SALES: "/daily-sales",
  PROFIT_LOSS: "/profit-loss",
  RECEIVABLES_AGEING: "/receivables-ageing",
  GENERAL_LEDGER: "/general-ledger",
  JOURNALS: "/journals",
  ACCOUNTING_WORKSHEET: "/accounting-worksheet",

  // Accounting
  ACCOUNT_TYPES: "/account-types",
  CHART_OF_ACCOUNTS: "/chart-of-accounts",
  FISCAL_YEARS: "/fiscal-years",
  ACCOUNT_MAPPINGS: "/account-mappings",
  TAX_RATES: "/tax-rates",
  TRANSACTION_TEMPLATES: "/transaction-templates",
  TRANSACTIONS: "/transactions",
  CASH_BANK: "/cash-bank",

  // Sales
  SALES_INVOICES: "/sales-invoices",
  SALES_PAYMENTS: "/sales-payments",
  SALES_CREDIT_NOTES: "/sales-credit-notes",
  SALES_ORDERS: "/sales-orders",

  // POS
  POS_TRANSACTIONS: "/pos-transactions",
  POS_PAYMENTS: "/pos-payments",
  OUTLET_TABLES: "/outlet-tables",
  RESERVATIONS: "/reservations",
  RESERVATION_CALENDAR: "/reservation-calendar",
  TABLE_BOARD: "/table-board",
  SYNC_QUEUE: "/sync-queue",
  SYNC_HISTORY: "/sync-history",
  PWA_SETTINGS: "/pwa-settings",

  // Inventory
  ITEMS: "/items",
  ITEMS_IMPORT: "/items/import",
  PRICES: "/prices",
  PRICES_IMPORT: "/prices/import",
  ITEM_GROUPS: "/item-groups",
  SUPPLIES: "/supplies",
  FIXED_ASSETS: "/fixed-assets",
  INVENTORY_SETTINGS: "/inventory-settings",
  PURCHASING_SUPPLIERS: "/purchasing/suppliers",
  PURCHASING_ORDERS: "/purchasing/orders",
  PURCHASING_RECEIPTS: "/purchasing/receipts",
  PURCHASING_INVOICES: "/purchasing/invoices",
  PURCHASING_PAYMENTS: "/purchasing/payments",
  PURCHASING_CREDITS: "/purchasing/credits",

  // Settings
  AUDIT_LOGS: "/audit-logs",
  COMPANIES: "/companies",
  OUTLETS: "/outlets",
  USERS: "/users",
  ROLES: "/roles",
  MODULE_ROLES: "/module-roles",
  MODULES: "/modules",
  OUTLET_SETTINGS: "/outlet-settings",
  STATIC_PAGES: "/static-pages",
  PLATFORM_SETTINGS: "/platform-settings",

  // Catch-all
  NOT_FOUND: "*",
} as const;

// ---------------------------------------------------------------------------
// Legacy hash → v6 route map (for compatibility bridge)
// ---------------------------------------------------------------------------

/**
 * Map from legacy hash paths to v6 route paths.
 */
export const HASH_TO_V6_ROUTE: Record<string, string> = {
  "#/admin/dashboard": "/dashboard",
  "#/admin/dashboard/financial": "/dashboard",
  "#/admin/dashboard/sync": "/dashboard",
  "#/items-prices": "/items",
  "#/feature-flags": "/modules",
  "#/feature-settings": "/outlet-settings",
  "#/403": "/items",
};

/**
 * Check if a legacy hash path has a v6 redirect target.
 */
export function getV6RedirectForHash(hash: string): string | null {
  if (HASH_TO_V6_ROUTE[hash]) {
    return HASH_TO_V6_ROUTE[hash];
  }
  const path = hash.replace(/^#/, "");
  if (path && path !== "/" && APP_ROUTES.some((r) => r.path === path)) {
    return path;
  }
  return null;
}
