// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
export * from "./audit";
export * from "./audit-service";
export * from "./companies";
export * from "./feature-flags";
export * from "./settings";
export * from "./customers";
// Test fixtures (owner-package fixtures for platform domain)
export * from "./test-fixtures/index.js";
// Standalone DB functions (reusable by test fixtures)
export { insertCustomer } from "./services/platform-db.js";
//# sourceMappingURL=index.js.map