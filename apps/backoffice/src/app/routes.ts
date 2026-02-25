import type { RoleCode } from "../lib/session";

export type AppRoute = {
  path: string;
  label: string;
  allowedRoles: readonly RoleCode[];
};

export const APP_ROUTES: readonly AppRoute[] = [
  // === MASTER DATA ===
  {
    path: "/items-prices",
    label: "Items & Prices",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/chart-of-accounts",
    label: "Chart of Accounts",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/account-types",
    label: "Account Types",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/transactions",
    label: "Transaction Input",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/sync-queue",
    label: "Sync Queue",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/sync-history",
    label: "Sync History",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/pwa-settings",
    label: "PWA Settings",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  
  // === SALES ===
  {
    path: "/sales-invoices",
    label: "Sales Invoices",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/sales-payments",
    label: "Sales Payments",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  
  // === POS ===
  {
    path: "/pos-transactions",
    label: "POS Transactions",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/pos-payments",
    label: "POS Payments",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  
  // === REPORTS ===
  {
    path: "/daily-sales",
    label: "Daily Sales",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
  },
  {
    path: "/journals",
    label: "Journals & Trial Balance",
    allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"]
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

export function userCanAccessRoute(userRoles: readonly RoleCode[], route: AppRoute): boolean {
  return route.allowedRoles.some((role) => userRoles.includes(role));
}
