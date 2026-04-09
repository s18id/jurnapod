/**
 * Scaffold Generator
 *
 * Generates OpenAPI scaffold suggestions for undocumented routes.
 */

import type { RouteInfo } from './scanner.js';

/**
 * Generate a suggested openapi() block for a route
 */
function generateOpenApiBlock(route: RouteInfo): string {
  const method = route.method.toUpperCase();
  const path = route.path;

  // Build request schema section
  let requestSection = '';
  if (route.zodSchemas.requestBody) {
    requestSection = `
  request: {
    body: {
      content: {
        'application/json': {
          schema: ${route.zodSchemas.requestBody},
        },
      },
    },
  },`;
  }

  // Build responses section
  const responses = Array.from(route.zodSchemas.responses.entries());
  let responsesSection = `
  responses: {`;

  if (responses.length > 0) {
    for (const [code, description] of responses) {
      responsesSection += `
    ${code}: {
      description: '${description}',
    },`;
    }
  } else {
    // Default responses
    responsesSection += `
    200: {
      description: 'Success',
    },`;
    if (method !== 'GET') {
      responsesSection += `
    400: {
      description: 'Validation error',
    },`;
    }
    responsesSection += `
    401: {
      description: 'Unauthorized',
    },`;
    if (method !== 'GET') {
      responsesSection += `
    403: {
      description: 'Forbidden',
    },`;
    }
  }

  responsesSection += `
  },`;

  return `/*
openapi({
  method: '${method.toLowerCase()}',
  path: '${path}',${requestSection}${responsesSection}
})
*/`;
}

/**
 * Generate a file header comment for scaffold output
 */
function generateFileHeader(routes: RouteInfo[]): string {
  const files = [...new Set(routes.map(r => r.relativePath))];

  return `// =============================================================================
// OpenAPI Scaffold Suggestions
// Generated: ${new Date().toISOString()}
// =============================================================================
//
// This file contains OpenAPI scaffold suggestions for routes that don't have
// documentation yet. Review these suggestions and copy the appropriate openapi()
// blocks to the corresponding route handlers.
//
// Routes analyzed: ${routes.length}
// Files needing attention: ${files.length}
//
// =============================================================================

`;
}

/**
 * Generate scaffold suggestions for undocumented routes
 */
export function generateScaffold(routes: RouteInfo[]): string {
  const output: string[] = [];

  output.push(generateFileHeader(routes));

  // Group routes by file
  const routesByFile = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    const existing = routesByFile.get(route.relativePath) || [];
    existing.push(route);
    routesByFile.set(route.relativePath, existing);
  }

  // Generate scaffold for each file
  for (const [filePath, fileRoutes] of routesByFile) {
    output.push(`\n// -----------------------------------------------------------------------------
// File: ${filePath}
// -----------------------------------------------------------------------------`);
    output.push(`// ${fileRoutes.length} undocumented route(s) found\n`);

    for (const route of fileRoutes) {
      const method = route.method.toUpperCase();
      const path = route.path;
      const lineInfo = `Line ${route.lineNumber}`;

      output.push(`// Generated scaffold for ${method} ${path} (${lineInfo})`);
      output.push(generateOpenApiBlock(route));
      output.push('');
    }
  }

  // Add summary
  output.push(`
// =============================================================================
// Summary
// =============================================================================
//
// Total undocumented routes: ${routes.length}
//
// Next steps:
// 1. Review the scaffolds above
// 2. Copy the openapi() blocks to the appropriate route handlers
// 3. Customize the descriptions and response schemas as needed
// 4. Run 'npm run generate:openapi-scaffold --check' to verify all routes are documented
//
// =============================================================================
`);

  return output.join('\n');
}
