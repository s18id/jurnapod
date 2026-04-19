// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

/**
 * Access modules — used in RBAC authorization checks.
 * These are the resources/domains that can have permissions assigned.
 * 
 * 8 Canonical Modules: platform, pos, sales, inventory, accounting, treasury, reservations, purchasing
 */
export const MODULE_CODES = [
  "platform",
  "pos",
  "sales",
  "inventory",
  "accounting",
  "treasury",
  "reservations",
  "purchasing"
] as const;

export type ModuleCode = typeof MODULE_CODES[number];

export const ModuleCodeSchema = z.enum(MODULE_CODES);

/**
 * Feature modules — used in company_modules enablement table.
 * These represent optional features that can be enabled/disabled per company.
 */
export const FEATURE_MODULE_CODES = [
  "platform", "pos", "sales", "inventory",
  "accounting", "treasury", "reservations", "purchasing"
] as const;

export type FeatureModuleCode = typeof FEATURE_MODULE_CODES[number];