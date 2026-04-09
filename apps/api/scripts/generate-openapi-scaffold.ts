#!/usr/bin/env node
/**
 * OpenAPI Scaffold Generator
 *
 * Scans route files for routes missing openapi() metadata
 * and generates scaffold suggestions for PR review.
 */

import { parseArgs } from 'util';
import { scanRoutes } from './openapi-scaffold/scanner.js';
import { generateScaffold } from './openapi-scaffold/generator.js';

async function main() {
  const args = parseArgs({
    options: {
      'check': { type: 'boolean', default: false },
      'output': { type: 'string', default: 'stdout' },
      'verbose': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const routesDir = './src/routes';

  if (args.values.verbose) {
    console.error(`[openapi-scaffold] Scanning routes in: ${routesDir}`);
  }

  const routes = await scanRoutes(routesDir);
  const documented = routes.filter(r => r.hasOpenApi);
  const undocumented = routes.filter(r => !r.hasOpenApi);

  if (args.values.verbose) {
    console.error(`[openapi-scaffold] Found ${routes.length} routes total`);
    console.error(`[openapi-scaffold] ${documented.length} documented, ${undocumented.length} undocumented`);
  }

  if (args.values.check) {
    if (undocumented.length > 0) {
      console.error(`Found ${undocumented.length} routes without OpenAPI docs:`);
      for (const route of undocumented) {
        console.error(`  - ${route.method.toUpperCase()} ${route.path} (${route.filePath}:${route.lineNumber})`);
      }
      process.exit(1);
    }
    console.log('All routes have OpenAPI documentation');
    return;
  }

  if (undocumented.length === 0) {
    console.log('No undocumented routes found. All routes have OpenAPI metadata.');
    return;
  }

  const scaffold = generateScaffold(undocumented);
  console.log(scaffold);

  if (args.values.verbose) {
    console.error(`\n[openapi-scaffold] Generated scaffold for ${undocumented.length} undocumented routes`);
  }
}

main().catch((error) => {
  console.error('Error running OpenAPI scaffold generator:', error);
  process.exit(1);
});
