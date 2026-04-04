// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Telemetry Package - SLO Configuration and Types
 * 
 * This package provides SLO definitions, telemetry types, and validation
 * for the Jurnapod observability infrastructure.
 * 
 * Runtime components (AlertManager, etc.) are exported from "./runtime"
 * to avoid type conflicts with the base telemetry types.
 */

export * from "./slo.js";
export * from "./metrics.js";
export * from "./slo-config.js";
export * from "./alert-config.js";
export * from "./correlation.js";
export * from "./labels.js";
