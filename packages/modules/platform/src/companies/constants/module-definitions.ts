// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Module definitions for the platform.
 * These are foundational constants that define available modules.
 */
export const MODULE_DEFINITIONS = [
  {
    code: "platform",
    name: "Platform",
    description: "Core platform services"
  },
  {
    code: "pos",
    name: "POS",
    description: "Point of sale"
  },
  {
    code: "sales",
    name: "Sales",
    description: "Sales invoices"
  },
  {
    code: "payments",
    name: "Payments",
    description: "Payment processing and management"
  },
  {
    code: "inventory",
    name: "Inventory",
    description: "Stock movements and recipes"
  },
  {
    code: "purchasing",
    name: "Purchasing",
    description: "Purchasing and payables"
  },
  {
    code: "reports",
    name: "Reports",
    description: "Reporting and analytics"
  },
  {
    code: "settings",
    name: "Settings",
    description: "Settings and configuration"
  },
  {
    code: "accounts",
    name: "Accounts",
    description: "Chart of accounts"
  },
  {
    code: "journals",
    name: "Journals",
    description: "Journal entries and posting"
  }
] as const;

export type ModuleCode = (typeof MODULE_DEFINITIONS)[number]["code"];

/**
 * Default module configuration for new companies.
 */
export const COMPANY_MODULE_DEFAULTS = [
  { code: "platform", enabled: true, config: {} },
  { code: "pos", enabled: true, config: { payment_methods: ["CASH"] } },
  { code: "sales", enabled: true, config: {} },
  { code: "inventory", enabled: true, config: { level: 0 } },
  { code: "purchasing", enabled: false, config: {} },
  { code: "reports", enabled: true, config: {} },
  { code: "settings", enabled: true, config: {} },
  { code: "accounts", enabled: true, config: {} },
  { code: "journals", enabled: true, config: {} }
] as const;
