// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export type FeatureFlagKey =
  | "pos.enabled"
  | "sales.enabled"
  | "cashbank.enabled"
  | "inventory.enabled"
  | "purchasing.enabled"
  | "recipes.enabled";

export * from "./audit";
export * from "./audit-service";
export * from "./companies";
export * from "./feature-flags";
export * from "./settings";
export * from "./customers";

export type { AccessScopeChecker } from "./users/interfaces/access-scope-checker.js";
