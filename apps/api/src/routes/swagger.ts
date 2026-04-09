// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Swagger Routes
 *
 * Interactive API documentation using Scalar UI and OpenAPI 3.0 spec endpoint.
 * Only available in non-production environments.
 *
 * Story 36.1: OpenAPI Infrastructure & Swagger UI
 * Story 36.8: Extract OpenAPI Spec to JSON File
 * Story 36.9: Proof-of-Concept for OpenAPI Auto-Generation with Health + Auth Routes
 */

import { Hono } from 'hono';
import { Scalar } from '@scalar/hono-api-reference';
import { openAPISpec } from './openapi-aggregator.js';

// =============================================================================
// Swagger Routes
// =============================================================================

const swaggerRoutes = new Hono();

// GET /swagger.json - Returns the auto-generated OpenAPI 3.0 JSON document
swaggerRoutes.get('/swagger.json', (c) => {
  return c.json(openAPISpec);
});

// GET /swagger - Serves the Scalar API Reference UI
swaggerRoutes.get('/swagger', Scalar({
  content: JSON.stringify(openAPISpec),
}));

export { swaggerRoutes };
