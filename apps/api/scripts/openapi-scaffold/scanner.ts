/**
 * Route Scanner
 *
 * Scans TypeScript route files and extracts route information
 * including HTTP methods, paths, and openapi() annotations.
 */

import { readFile, readdir } from 'fs/promises';
import { join, relative, extname } from 'path';
import { parse } from '@typescript-eslint/typescript-estree';

export interface RouteInfo {
  filePath: string;
  relativePath: string;
  lineNumber: number;
  method: string;
  path: string;
  hasOpenApi: boolean;
  openapiAnnotation?: string;
  zodSchemas: {
    requestBody?: string;
    params?: string;
    query?: string;
    responses: Map<number, string>;
  };
  handlerDescription?: string;
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

/**
 * Recursively get all TypeScript files in a directory
 */
async function getTsFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and non-route directories
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.') && entry.name !== '__test__') {
          const subFiles = await getTsFiles(fullPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && (extname(entry.name) === '.ts' || extname(entry.name) === '.tsx')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory might not exist, return empty array
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
  }

  return files;
}

/**
 * Check if a node has an openapi(...) call
 */
function checkForOpenApiCall(node: any): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'openapi'
  ) {
    return true;
  }

  return false;
}

/**
 * Extract path from a route argument
 */
function extractPath(arg: any): string | null {
  if (!arg) return null;

  // String literal path
  if (arg.type === 'Literal' && typeof arg.value === 'string') {
    return arg.value;
  }

  // Template literal with no expressions
  if (arg.type === 'TemplateLiteral' &&
      arg.quasis.length === 1 &&
      arg.expressions.length === 0) {
    return arg.quasis[0].value.cooked || arg.quasis[0].value.raw;
  }

  return null;
}

/**
 * Check if a callee is a route handler pattern like:
 * - route.get("/", handler)
 * - app.post("/api/users", handler)
 * - someHonoInstance.delete('/:id', handler)
 */
function analyzeCallee(callee: any, parentObjectName: string | null): { isRoute: boolean; method?: string; path?: string } {
  if (!callee || callee.type !== 'MemberExpression') {
    return { isRoute: false };
  }

  const prop = callee.property;
  const obj = callee.object;

  // Check if property is an HTTP method
  if (prop.type !== 'Identifier') {
    return { isRoute: false };
  }

  const method = prop.name.toLowerCase();
  if (!HTTP_METHODS.includes(method)) {
    return { isRoute: false };
  }

  // Check if the object looks like a Hono route instance
  // Common patterns: route, app, router, someHonoInstance, *Routes
  if (obj.type === 'Identifier') {
    const objName = obj.name;
    // Skip if it looks like a middleware or utility function being called
    if (objName === 'middleware' || objName === 'router' || objName === 'route' || objName === 'app') {
      // This is likely a Hono route
      return { isRoute: true, method };
    }
    // Also match names ending with Routes like invoiceRoutes, userRoutes, etc.
    if (objName.endsWith('Routes') || objName.endsWith('Route')) {
      return { isRoute: true, method };
    }
  }

  return { isRoute: false };
}

/**
 * Process a CallExpression node to see if it's a route handler
 */
function processCallExpression(node: any, filePath: string, relativePath: string, content: string): RouteInfo | null {
  const callee = node.callee;

  if (!callee || callee.type !== 'MemberExpression') {
    return null;
  }

  const prop = callee.property;
  const obj = callee.object;

  // Check if property is an HTTP method
  if (prop.type !== 'Identifier') {
    return null;
  }

  const method = prop.name.toLowerCase();
  if (!HTTP_METHODS.includes(method)) {
    return null;
  }

  // Check if object is a Hono route instance
  if (obj.type !== 'Identifier') {
    return null;
  }

  const objName = obj.name;
  // Match route instances: route, app, *Routes, *Route
  if (!objName.endsWith('Routes') && !objName.endsWith('Route') &&
      objName !== 'route' && objName !== 'app' && objName !== 'router') {
    return null;
  }

  // Extract path from first argument
  if (!node.arguments || node.arguments.length === 0) {
    return null;
  }

  const firstArg = node.arguments[0];
  const path = extractPath(firstArg);

  if (!path) {
    return null;
  }

  // Check for openapi annotation on the call
  const hasOpenApi = checkForOpenApiCall(node);

  // Get line number
  const lineNumber = node.loc?.start?.line || 0;

  // Try to extract handler description from preceding comments
  let handlerDescription: string | undefined;
  if (node.leadingComments && node.leadingComments.length > 0) {
    for (const comment of node.leadingComments) {
      // Look for route-specific comments (lines with HTTP method or route description)
      const commentText = comment.value;
      if (commentText.includes('@') || commentText.includes('Route') || commentText.includes(method.toUpperCase())) {
        // Try to extract a description
        const lines = commentText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim().replace(/^\*?\s*/, '');
          if (trimmed.length > 0 && !trimmed.startsWith('@') && !trimmed.startsWith('/**') && !trimmed.startsWith('*')) {
            handlerDescription = trimmed;
            break;
          }
        }
      }
    }
  }

  // Extract Zod schemas from the handler body (simplified)
  const zodSchemas = extractZodSchemasFromContext(content, lineNumber, method);

  return {
    filePath,
    relativePath,
    lineNumber,
    method,
    path,
    hasOpenApi,
    zodSchemas,
    handlerDescription
  };
}

/**
 * Extract Zod schemas from context around the route handler
 */
function extractZodSchemasFromContext(content: string, lineNumber: number, method: string): RouteInfo['zodSchemas'] {
  const lines = content.split('\n');
  const contextStart = Math.max(0, lineNumber - 30);
  const contextEnd = Math.min(lines.length, lineNumber + 100);
  const context = lines.slice(contextStart, contextEnd).join('\n');

  const schemas: RouteInfo['zodSchemas'] = {
    responses: new Map()
  };

  // Only extract request body schemas for mutation methods
  const isMutationMethod = ['post', 'put', 'patch', 'delete'].includes(method.toLowerCase());

  // Look for Schema definitions in the context
  // Common patterns: SomeSchema, SomeRequestSchema, SomeQuerySchema, etc.
  const schemaDefPattern = /const\s+(\w+(?:Request|Response|Query|Params|Schema))\s*[:=]/g;
  let match;
  while ((match = schemaDefPattern.exec(context)) !== null) {
    const schemaName = match[1];
    if (isMutationMethod && (schemaName.includes('Request') || schemaName.includes('Body') || schemaName.includes('Create') || schemaName.includes('Update'))) {
      schemas.requestBody = schemaName;
    } else if (schemaName.includes('Query')) {
      schemas.query = schemaName;
    } else if (schemaName.includes('Params') || schemaName.includes('Param')) {
      schemas.params = schemaName;
    }
  }

  // Also look for Schema usage in .parse( calls
  // Only for mutation methods, as GET routes typically don't have request bodies
  const schemaUsePattern = /(\w+Schema)\.parse\(/g;
  while ((match = schemaUsePattern.exec(context)) !== null) {
    const schemaName = match[1];
    // Skip request body schema for GET routes - they shouldn't have bodies
    if (isMutationMethod && !schemas.requestBody && (schemaName.includes('Request') || schemaName.includes('Body') || schemaName.includes('Create') || schemaName.includes('Update'))) {
      schemas.requestBody = schemaName;
    } else if (!isMutationMethod && schemaName.includes('Query')) {
      schemas.query = schemaName;
    } else if (!isMutationMethod && (schemaName.includes('Params') || schemaName.includes('Param') || schemaName.includes('Id'))) {
      schemas.params = schemaName;
    }
  }

  // Detect common response status codes
  const statusCodes = [
    { pattern: /status\s*[:\=]\s*['"]?(\d{3})/, extract: (m: string) => parseInt(m, 10) },
    { pattern: /\.status\((\d{3})\)/, extract: (m: string) => parseInt(m, 10) },
    { pattern: /return.*?(\d{3})/, extract: (m: string) => parseInt(m, 10) }
  ];

  for (const { pattern, extract } of statusCodes) {
    const re = new RegExp(pattern.source, 'gi');
    let m;
    while ((m = re.exec(context)) !== null) {
      const code = extract(m[1]);
      if (code >= 100 && code < 600 && !schemas.responses.has(code)) {
        let description = 'Response';
        if (code === 200) description = 'Success';
        else if (code === 201) description = 'Created';
        else if (code === 400) description = 'Validation error';
        else if (code === 401) description = 'Unauthorized';
        else if (code === 403) description = 'Forbidden';
        else if (code === 404) description = 'Not found';
        else if (code >= 500) description = 'Server error';

        schemas.responses.set(code, description);
      }
    }
  }

  // Add common responses based on HTTP method if none detected
  if (schemas.responses.size === 0) {
    if (method === 'get') {
      schemas.responses.set(200, 'Success');
    } else {
      schemas.responses.set(200, 'Success');
      schemas.responses.set(400, 'Validation error');
    }
    schemas.responses.set(401, 'Unauthorized');
    schemas.responses.set(403, 'Forbidden');
  }

  return schemas;
}

/**
 * Recursively traverse AST and find route handlers
 */
function traverseAst(node: any, result: RouteInfo[], filePath: string, relativePath: string, content: string): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (node.type === 'CallExpression') {
    const route = processCallExpression(node, filePath, relativePath, content);
    if (route) {
      result.push(route);
    }
  }

  // Recursively traverse all properties
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent' || key === 'comments') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        traverseAst(item, result, filePath, relativePath, content);
      }
    } else if (value && typeof value === 'object') {
      traverseAst(value, result, filePath, relativePath, content);
    }
  }
}

/**
 * Scan a directory for route files and extract route information
 */
export async function scanRoutes(dirPath: string): Promise<RouteInfo[]> {
  const allRoutes: RouteInfo[] = [];
  const files = await getTsFiles(dirPath);

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(dirPath, filePath);

      // Parse TypeScript to AST
      const ast = parse(content, {
        jsx: true,
        range: true,
        loc: true,
        comment: true,
        typescript: true,
      });

      const routes: RouteInfo[] = [];
      traverseAst(ast, routes, filePath, relativePath, content);

      allRoutes.push(...routes);
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  return allRoutes;
}
