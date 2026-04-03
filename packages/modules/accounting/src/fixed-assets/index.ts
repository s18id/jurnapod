// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Assets Subdomain - Public API
 *
 * This module provides the public surface for the fixed-assets subdomain
 * within the accounting module.
 */

// Types & Interfaces
export * from "./interfaces/index.js";

// Errors
export * from "./errors.js";

// Services
export { CategoryService } from "./services/index.js";
export { AssetService } from "./services/index.js";
export { DepreciationService } from "./services/index.js";
export { LifecycleService } from "./services/index.js";

// Repositories
export { FixedAssetRepository } from "./repositories/index.js";
