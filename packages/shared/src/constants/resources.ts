// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Resource codes for fine-grained RBAC within modules.
 * Format: {MODULE}_{RESOURCE} for clear namespacing.
 * 
 * 21 resources across 7 canonical modules.
 */
export const RESOURCE_CODES = {
  // platform: 5 resources
  PLATFORM_USERS: 'users',
  PLATFORM_ROLES: 'roles',
  PLATFORM_COMPANIES: 'companies',
  PLATFORM_OUTLETS: 'outlets',
  PLATFORM_SETTINGS: 'settings',
  // accounting: 4 resources
  ACCOUNTING_JOURNALS: 'journals',
  ACCOUNTING_ACCOUNTS: 'accounts',
  ACCOUNTING_FISCAL_YEARS: 'fiscal_years',
  ACCOUNTING_REPORTS: 'reports',
  // inventory: 3 resources
  INVENTORY_ITEMS: 'items',
  INVENTORY_STOCK: 'stock',
  INVENTORY_COSTING: 'costing',
  // treasury: 2 resources
  TREASURY_TRANSACTIONS: 'transactions',
  TREASURY_ACCOUNTS: 'accounts',
  // sales: 3 resources
  SALES_INVOICES: 'invoices',
  SALES_ORDERS: 'orders',
  SALES_PAYMENTS: 'payments',
  // pos: 2 resources
  POS_TRANSACTIONS: 'transactions',
  POS_CONFIG: 'config',
  // reservations: 2 resources
  RESERVATIONS_BOOKINGS: 'bookings',
  RESERVATIONS_TABLES: 'tables',
} as const;

export type ResourceCode = typeof RESOURCE_CODES[keyof typeof RESOURCE_CODES];