// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RoleCode } from "../lib/session";
import { PERMISSION_BITS, type NavPermissionRequirement } from "../lib/auth/permissions";

export type AppRoute = {
  path: string;
  label: string;
  allowedRoles: readonly RoleCode[];
  requiredModule?: string; // Module code that must be enabled
  /**
   * Permission requirement for resource-level access (Epic 39 canonical ACL).
   * When set, the user must have at least this permission mask for the given
   * module.resource combination to see the route in navigation.
   *
   * This is a UX convenience only. Backend deny-by-default remains authoritative.
   * Setting permission metadata to `undefined` means the route relies on
   * legacy role + module checking only.
   */
  permission?: NavPermissionRequirement;
  /**
   * When true, route permission checks MUST use backend-supplied user.permissions only.
   * Role-derived fallback permissions MUST NOT grant this route.
   */
  requiresExplicitPermission?: boolean;
};

export const APP_ROUTES: readonly AppRoute[] = [
  // === CORE ===
  {
    path: "/dashboard",
    label: "Dashboard",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"]
  },
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
    path: "/receivables-ageing",
    label: "Receivables Ageing",
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
  {
    path: "/sales-credit-notes",
    label: "Credit Notes",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "sales"
  },
  {
    path: "/sales-orders",
    label: "Sales Orders",
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
    path: "/reservation-calendar",
    label: "Reservation Calendar",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "pos"
  },
  {
    path: "/table-board",
    label: "Table Board",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"],
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
    requiredModule: "inventory",
    // Backend authority: API enforces inventory.items.READ.
    // This metadata enables client-side nav filtering for inventory module users.
    permission: { module: "inventory", resource: "items", permissionMask: PERMISSION_BITS.READ }
  },
  {
    path: "/prices",
    label: "Prices",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "inventory",
    // Backend authority: prices are governed by the canonical inventory.items resource.
    permission: { module: "inventory", resource: "items", permissionMask: PERMISSION_BITS.READ }
  },
  // LEGACY: Hidden from menu, redirects to /items
  {
    path: "/items-prices",
    label: "Items & Prices",
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
    path: "/purchasing/suppliers",
    label: "Suppliers",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiredModule: "purchasing",
    permission: { module: "purchasing", resource: "suppliers", permissionMask: PERMISSION_BITS.READ }
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
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    // Backend authority: API enforces platform.audit.READ.
    permission: { module: "platform", resource: "audit", permissionMask: PERMISSION_BITS.READ }
  },
  {
    path: "/operations",
    label: "Operations",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    permission: { module: "platform", resource: "operations", permissionMask: PERMISSION_BITS.READ },
    requiresExplicitPermission: true
  },
  {
    path: "/companies",
    label: "Companies",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    // Backend authority: API enforces platform.companies.READ.
    permission: { module: "platform", resource: "companies", permissionMask: PERMISSION_BITS.READ }
  },
  {
    path: "/outlets",
    label: "Outlets (Branches)",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN"],
    // Backend authority: API enforces platform.outlets.READ.
    permission: { module: "platform", resource: "outlets", permissionMask: PERMISSION_BITS.READ }
  },
  {
    path: "/users",
    label: "Users",
    allowedRoles: ["SUPER_ADMIN", "OWNER", "COMPANY_ADMIN", "ADMIN"],
    // Backend authority: API enforces platform.users.READ.
    permission: { module: "platform", resource: "users", permissionMask: PERMISSION_BITS.READ }
  },
  {
    path: "/roles",
    label: "Roles",
    allowedRoles: ["SUPER_ADMIN", "OWNER"],
    // Backend authority: API enforces platform.roles.READ.
    permission: { module: "platform", resource: "roles", permissionMask: PERMISSION_BITS.READ }
  },
  {
    path: "/module-roles",
    label: "Module Roles",
    allowedRoles: ["SUPER_ADMIN", "OWNER"],
    // Backend authority: role-permission assignment management requires platform.roles.MANAGE.
    permission: { module: "platform", resource: "roles", permissionMask: PERMISSION_BITS.MANAGE }
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
  },
  {
    path: "/audit",
    label: "Audit Trail",
    allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
    requiresExplicitPermission: true,
    permission: { module: "platform", resource: "audit", permissionMask: PERMISSION_BITS.READ }
  }
];

export const DEFAULT_ROUTE_PATH = APP_ROUTES[0].path;

const OLD_DASHBOARD_PATH_PATTERN = /^\/admin\/dashboard(?:\/.*)?$/;

export function getDashboardRedirectTarget(path: string): string | null {
  return OLD_DASHBOARD_PATH_PATTERN.test(path) ? "/dashboard" : null;
}

const ROLE_DETAIL_PATH_PATTERN = /^\/roles\/\d+$/;

export function isRoleDetailPath(path: string): boolean {
  return ROLE_DETAIL_PATH_PATTERN.test(path);
}

export function getRouteLookupPath(path: string): string {
  if (isRoleDetailPath(path)) {
    return "/roles";
  }
  return path;
}

export function normalizeHashPath(hash: string): string {
  const cleaned = hash.replace(/^#/, "").trim();
  if (cleaned.length === 0 || cleaned === "/") {
    return DEFAULT_ROUTE_PATH;
  }
  
  // Strip query parameters from the path
  const pathWithoutQuery = cleaned.split('?')[0];
  const dashboardRedirect = getDashboardRedirectTarget(pathWithoutQuery);
  if (dashboardRedirect) {
    return dashboardRedirect;
  }
  return pathWithoutQuery.startsWith("/") ? pathWithoutQuery : `/${pathWithoutQuery}`;
}

export function findRoute(path: string): AppRoute | null {
  const lookupPath = getRouteLookupPath(path);
  if (/^\/items\/\d+$/.test(lookupPath)) {
    return APP_ROUTES.find((route) => route.path === "/items") ?? null;
  }
  return APP_ROUTES.find((route) => route.path === lookupPath) ?? null;
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
