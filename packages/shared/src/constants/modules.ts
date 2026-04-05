// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Access modules — used in RBAC authorization checks.
 * These are the resources/domains that can have permissions assigned.
 */
export const ACCESS_MODULE_CODES = [
  "users", "roles", "companies", "outlets",
  "accounts", "journals", "cash_bank",
  "sales", "payments", "inventory", "purchasing",
  "reports", "settings", "pos",
] as const;

export type AccessModuleCode = typeof ACCESS_MODULE_CODES[number];

/**
 * Feature modules — used in company_modules enablement table.
 * These represent optional features that can be enabled/disabled per company.
 */
export const FEATURE_MODULE_CODES = [
  "platform", "pos", "sales", "inventory",
  "accounting", "treasury", "reporting",
] as const;

export type FeatureModuleCode = typeof FEATURE_MODULE_CODES[number];
