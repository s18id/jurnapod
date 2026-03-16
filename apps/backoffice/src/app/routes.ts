// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RoleCode } from "../lib/session";

export type AppRoute = {
  path: string;
  label: string;
  allowedRoles: readonly RoleCode[];
  requiredModule?: string; // Module code that must be enabled
};

export const APP_ROUTES: readonly AppRoute[] = [
  // === CORE ===
  {
    path: "/daily-sales",
    label: "Daily Sales",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/profit-loss",
    label: "Profit & Loss",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/general-ledger",
    label: "General Ledger",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/journals",
    label: "Journals & Trial Balance",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/accounting-worksheet",
    label: "Accounting Worksheet",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },

  // === ACCOUNTING ===
  {
    path: "/account-types",
    label: "Account Types",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/chart-of-accounts",
    label: "Chart of Accounts",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/fiscal-years",
    label: "Fiscal Years",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/account-mappings",
    label: "Account Mappings",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/tax-rates",
    label: "Tax Rates",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/transaction-templates",
    label: "Transaction Templates",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/transactions",
    label: "Transaction Input",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/cash-bank",
    label: "Cash & Bank",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },

  // === SALES ===
  {
    path: "/sales-invoices",
    label: "Sales Invoices",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "sales"
  },
  {
    path: "/sales-payments",
    label: "Sales Payments",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "sales"
  },

  // === POS ===
  {
    path: "/pos-transactions",
    label: "POS Transactions",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "pos"
  },
  {
    path: "/pos-payments",
    label: "POS Payments",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "pos"
  },
  {
    path: "/outlet-tables",
    label: "Outlet Tables",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN"],
    requiredModule: "pos"
  },
  {
    path: "/reservations",
    label: "Reservations",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "pos"
  },
  {
    path: "/sync-queue",
    label: "Sync Queue",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "pos"
  },
  {
    path: "/sync-history",
    label: "Sync History",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "pos"
  },
  {
    path: "/pwa-settings",
    label: "PWA Settings",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "pos"
  },

  // === INVENTORY ===
  {
    path: "/item-groups",
    label: "Item Groups",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory"
  },
  // NEW: Separate Items and Prices pages (replaces items-prices)
  {
    path: "/items",
    label: "Items",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory"
  },
  {
    path: "/prices",
    label: "Prices",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory"
  },
  // LEGACY: Hidden from menu, redirects to /items
  {
    path: "/items-prices",
    label: "Items & Prices (Legacy)",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory"
  },
  {
    path: "/supplies",
    label: "Supplies",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory"
  },
  {
    path: "/fixed-assets",
    label: "Fixed Assets",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory"
  },
  {
    path: "/inventory-settings",
    label: "Inventory Settings",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory"
  },

  // === SETTINGS ===
  {
    path: "/audit-logs",
    label: "Audit Logs",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/companies",
    label: "Companies",
    allowedRoles: ["SUPER_ADMIN", "OWNER"]
  },
  {
    path: "/outlets",
    label: "Outlets (Branches)",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN"]
  },
  {
    path: "/users",
    label: "Users",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN"]
  },
  {
    path: "/roles",
    label: "Roles",
    allowedRoles: ["SUPER_ADMIN", "OWNER"]
  },
  {
    path: "/module-roles",
    label: "Module Roles",
    allowedRoles: ["SUPER_ADMIN", "OWNER"]
  },
  {
    path: "/modules",
    label: "Modules",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/outlet-settings",
    label: "Outlet Settings",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/static-pages",
    label: "Static Pages",
    allowedRoles: ["SUPER_ADMIN"]
  },
  {
    path: "/platform-settings",
    label: "Platform Settings",
    allowedRoles: ["SUPER_ADMIN"]
  }
];

export const DEFAULT_ROUTE_PATH = APP_ROUTES[0].path;

export function normalizeHashPath(hash: string): string {
  const cleaned = hash.replace(/^#/, "").trim();
  if (cleaned.length === 0 || cleaned === "/") {
    return DEFAULT_ROUTE_PATH;
  }
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

export function findRoute(path: string): AppRoute | null {
  return APP_ROUTES.find((route) => route.path === path) ?? null;
}

export function userCanAccessRoute(
  userRoles: readonly RoleCode[],
  route: AppRoute,
  userGlobalRoles?: readonly RoleCode[]
): boolean {
  const allRoles = [...userRoles, ...(userGlobalRoles || [])];
  return route.allowedRoles.some((role) => allRoles.includes(role));
}

export function filterRoutesByModules(
  routes: readonly AppRoute[],
  enabledModules: Record<string, boolean>
): AppRoute[] {
  return routes.filter((route) => {
    if (!route.requiredModule) {
      return true;
    }
    return enabledModules[route.requiredModule] === true;
  });
}
