#!/usr/bin/env tsx
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * API Contract Diff Checker
 *
 * Loads the baseline OpenAPI spec, the stable endpoint list, generates the
 * current OpenAPI spec, and compares only stable endpoints.
 *
 * Exit codes:
 *   0 = PASS (no issues or only additive changes with changelog entry)
 *   1 = FAIL (breaking changes detected)
 *   2 = WARN (additive changes without changelog entry)
 *   3 = ERROR (missing baseline files, generation failure)
 *
 * Usage:
 *   npx tsx scripts/check-api-contract-diff.ts
 */

import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ─── Path resolution ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const API_DIR = resolve(ROOT, "apps/api");
const BASELINE_PATH = resolve(ROOT, "docs/api-contracts/openapi-0.3-stability-baseline.json");
const STABLE_ENDPOINTS_PATH = resolve(ROOT, "docs/api-contracts/stable-endpoints.json");
const CHANGELOG_PATH = resolve(ROOT, "docs/api-contracts/CHANGELOG.md");

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OpenAPISpec {
  openapi: string;
  info: { version: string; title: string };
  servers?: Array<{ url: string }>;
  paths?: Record<string, PathItem>;
  components?: OpenAPIComponents;
}

interface OpenAPIComponents {
  schemas?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

type JsonSchema = Record<string, unknown>;

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
}

interface Operation {
  operationId?: string;
  summary?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: Record<string, unknown>;
  }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: JsonSchema }>;
  };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: JsonSchema }> }>;
  security?: Array<Record<string, string[]>>;
}

interface StableEndpointsDoc {
  version: string;
  stableEndpoints: string[];
}

interface EndpointKey {
  method: string;
  path: string;
}

interface BreakingChange {
  endpoint: string;
  severity: "breaking";
  message: string;
}

interface AdditiveChange {
  endpoint: string;
  severity: "additive";
  message: string;
}

type Change = BreakingChange | AdditiveChange;

// ─── Path normalization ────────────────────────────────────────────────────────

/**
 * Normalize OpenAPI path params from `{id}` to `:id` for comparison.
 * OpenAPI uses `{param}` syntax; Hono/Express-style uses `:param`.
 */
function normalizePathParams(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

/**
 * Strip leading `/api` server prefix from paths for comparison.
 * The baseline may or may not include the prefix depending on how it was generated.
 */
function stripApiPrefix(path: string): string {
  return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

/**
 * Normalize a method+path endpoint key for comparison.
 * - Method is uppercased
 * - Path params normalized to `:param` form
 * - Leading `/api` prefix stripped
 */
function normalizeEndpoint(method: string, path: string): EndpointKey {
  let normalizedPath = normalizePathParams(path);
  // If no `/api` prefix exists, leave as-is; otherwise strip it
  normalizedPath = stripApiPrefix(normalizedPath);
  return {
    method: method.toUpperCase(),
    path: normalizedPath,
  };
}

/**
 * Parse a stable endpoint string like "POST /api/auth/login" into a normalized EndpointKey.
 */
function parseStableEndpoint(entry: string): EndpointKey {
  const parts = entry.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new Error(`Invalid stable endpoint entry: "${entry}". Expected format: "METHOD /path"`);
  }
  return normalizeEndpoint(parts[0], parts.slice(1).join(" "));
}

// ─── Spec generation ───────────────────────────────────────────────────────────

/**
 * Generate the current OpenAPI spec by running the export helper in the API project.
 * Uses tsx to resolve `@/` aliases and TypeScript imports.
 */
function generateCurrentSpec(): OpenAPISpec {
  const exportScript = resolve(API_DIR, "scripts/export-openapi-spec.ts");

  if (!existsSync(exportScript)) {
    console.error(`ERROR: Export script not found: ${exportScript}`);
    process.exit(3);
  }

  // Write spec to a temp file to avoid execSync buffer truncation issues
  // with large JSON output (spec can be 500KB+).
  const tmpFile = resolve(ROOT, ".tmp-openapi-current.json");

  try {
    execSync(`npx tsx ${exportScript} > ${tmpFile}`, {
      cwd: API_DIR,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString("utf-8") ?? "";
    console.error("ERROR: Failed to generate current OpenAPI spec.");
    if (stderr) console.error(stderr);
    process.exit(3);
  }

  if (!existsSync(tmpFile)) {
    console.error("ERROR: Spec generation produced no output file.");
    process.exit(3);
  }

  let raw: string;
  try {
    raw = readFileSync(tmpFile, "utf-8");
  } catch (err) {
    console.error("ERROR: Failed to read generated spec file:", (err as Error).message);
    process.exit(3);
  }

  // Clean up temp file (best effort, non-fatal)
  try {
    unlinkSync(tmpFile);
  } catch {
    // best effort
  }

  // Find the JSON object in the output (handle any startup noise)
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) {
    console.error("ERROR: No JSON object found in spec generation output.");
    console.error("Raw output:", raw.slice(0, 500));
    process.exit(3);
  }

  try {
    return JSON.parse(raw.slice(jsonStart)) as OpenAPISpec;
  } catch (err) {
    console.error("ERROR: Failed to parse generated spec as JSON.");
    console.error("Raw output snippet:", raw.slice(jsonStart, jsonStart + 500));
    process.exit(3);
  }
}

// ─── Endpoint extraction ───────────────────────────────────────────────────────

/**
 * Extract all endpoint keys from an OpenAPI spec's paths.
 * Each path may have multiple methods (get, post, etc.).
 */
function extractEndpoints(spec: OpenAPISpec): Map<string, EndpointKey> {
  const endpoints = new Map<string, EndpointKey>();
  if (!spec.paths) return endpoints;

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"] as const) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (op && typeof op === "object") {
        const key = normalizeEndpoint(method, path);
        endpoints.set(`${key.method} ${key.path}`, key);
      }
    }
  }

  return endpoints;
}

/**
 * Extract detailed endpoint info from the spec for comparison.
 */
function getEndpointDetail(spec: OpenAPISpec, method: string, path: string): Operation | undefined {
  if (!spec.paths) return undefined;

  // Try to find the path. OpenAPI paths use {param} syntax.
  const pathItem = spec.paths[path];
  if (!pathItem) return undefined;

  const op = (pathItem as Record<string, unknown>)[method.toLowerCase()];
  return (op as Operation) ?? undefined;
}

/**
 * Find the OpenAPI path for a normalized endpoint by searching through all paths.
 */
function findSpecPath(spec: OpenAPISpec, method: string, normalizedPath: string): string | undefined {
  if (!spec.paths) return undefined;

  // Direct lookup
  if (spec.paths[normalizedPath]) {
    const op = (spec.paths[normalizedPath] as Record<string, unknown>)[method.toLowerCase()];
    if (op) return normalizedPath;
  }

  // Also try with /api prefix
  const withApi = `/api${normalizedPath === "/" ? "" : normalizedPath}`;
  if (spec.paths[withApi]) {
    const op = (spec.paths[withApi] as Record<string, unknown>)[method.toLowerCase()];
    if (op) return withApi;
  }

  // Search through all paths with param normalization
  for (const specPath of Object.keys(spec.paths)) {
    if (normalizePathParams(specPath) === normalizedPath || normalizePathParams(specPath) === withApi) {
      const op = (spec.paths[specPath] as Record<string, unknown>)[method.toLowerCase()];
      if (op) return specPath;
    }
  }

  return undefined;
}

// ─── Schema comparison helpers ─────────────────────────────────────────────────

interface SchemaFields {
  fields: Map<string, string>;
  required: Set<string>;
}

function readJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) return undefined;

  return pointer
    .slice(2)
    .split("/")
    .reduce<unknown>((current, segment) => {
      if (current == null || typeof current !== "object") return undefined;
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      return (current as Record<string, unknown>)[key];
    }, root);
}

function mergeObjectSchemas(schemas: JsonSchema[], spec: OpenAPISpec, seen: Set<string>): JsonSchema {
  const merged: JsonSchema = { type: "object", properties: {}, required: [] };
  const mergedProperties = merged.properties as Record<string, unknown>;
  const mergedRequired = merged.required as string[];

  for (const schema of schemas) {
    const resolved = resolveSchema(spec, schema, seen);
    if (!resolved) continue;

    const properties = resolved.properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
      Object.assign(mergedProperties, properties);
    }

    if (Array.isArray(resolved.required)) {
      for (const field of resolved.required) {
        if (typeof field === "string" && !mergedRequired.includes(field)) {
          mergedRequired.push(field);
        }
      }
    }
  }

  return merged;
}

function resolveSchema(spec: OpenAPISpec, schema: JsonSchema | undefined, seen = new Set<string>()): JsonSchema | undefined {
  if (!schema) return undefined;

  const ref = schema.$ref;
  if (typeof ref === "string") {
    if (seen.has(ref)) return schema;
    seen.add(ref);
    const target = readJsonPointer(spec, ref);
    if (target && typeof target === "object" && !Array.isArray(target)) {
      return resolveSchema(spec, target as JsonSchema, seen);
    }
    return schema;
  }

  if (Array.isArray(schema.allOf)) {
    return mergeObjectSchemas(
      schema.allOf.filter((entry): entry is JsonSchema => typeof entry === "object" && entry !== null && !Array.isArray(entry)),
      spec,
      seen,
    );
  }

  return schema;
}

function schemaTypeSignature(spec: OpenAPISpec, schema: JsonSchema | undefined): string {
  const resolved = resolveSchema(spec, schema);
  if (!resolved) return "unknown";

  if (typeof resolved.$ref === "string") return `ref:${resolved.$ref}`;

  const typeValue = resolved.type;
  const type = Array.isArray(typeValue)
    ? typeValue.filter((value): value is string => typeof value === "string").sort().join("|")
    : typeof typeValue === "string"
      ? typeValue
      : resolved.properties ? "object" : "unknown";

  const format = typeof resolved.format === "string" ? `:${resolved.format}` : "";

  if (Array.isArray(resolved.enum)) {
    const enumValues = resolved.enum.map((value) => String(value)).sort().join("|");
    return `${type}${format}:enum(${enumValues})`;
  }

  if (type === "array") {
    const items = resolved.items;
    const itemType = items && typeof items === "object" && !Array.isArray(items)
      ? schemaTypeSignature(spec, items as JsonSchema)
      : "unknown";
    return `array<${itemType}>`;
  }

  return `${type}${format}`;
}

function collectSchemaFields(spec: OpenAPISpec, schema: JsonSchema | undefined, prefix = ""): SchemaFields {
  const fields = new Map<string, string>();
  const required = new Set<string>();
  const resolved = resolveSchema(spec, schema);
  if (!resolved) return { fields, required };

  const properties = resolved.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return { fields, required };
  }

  const requiredNames = Array.isArray(resolved.required)
    ? resolved.required.filter((value): value is string => typeof value === "string")
    : [];

  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    if (!propertySchema || typeof propertySchema !== "object" || Array.isArray(propertySchema)) {
      continue;
    }

    const fieldPath = prefix ? `${prefix}.${propertyName}` : propertyName;
    fields.set(fieldPath, schemaTypeSignature(spec, propertySchema as JsonSchema));
    if (requiredNames.includes(propertyName)) {
      required.add(fieldPath);
    }

    const nested = collectSchemaFields(spec, propertySchema as JsonSchema, fieldPath);
    for (const [nestedPath, nestedType] of nested.fields) {
      fields.set(nestedPath, nestedType);
    }
    for (const nestedPath of nested.required) {
      required.add(nestedPath);
    }
  }

  return { fields, required };
}

function getJsonSchemaFromContent(content: Record<string, { schema?: JsonSchema }> | undefined): JsonSchema | undefined {
  if (!content) return undefined;
  return content["application/json"]?.schema ?? Object.values(content).find((entry) => entry.schema)?.schema;
}

function compareSchemaFields(params: {
  endpoint: string;
  label: string;
  mode: "request" | "response";
  baselineSpec: OpenAPISpec;
  currentSpec: OpenAPISpec;
  baselineSchema?: JsonSchema;
  currentSchema?: JsonSchema;
}): Change[] {
  const changes: Change[] = [];
  const { endpoint, label, mode, baselineSpec, currentSpec, baselineSchema, currentSchema } = params;

  if (baselineSchema && !currentSchema) {
    changes.push({ endpoint, severity: "breaking", message: `${label} schema removed from ${endpoint}` });
    return changes;
  }

  if (!baselineSchema && currentSchema) {
    changes.push({ endpoint, severity: "additive", message: `${label} schema added to ${endpoint}` });
    return changes;
  }

  if (!baselineSchema || !currentSchema) return changes;

  const baselineFields = collectSchemaFields(baselineSpec, baselineSchema);
  const currentFields = collectSchemaFields(currentSpec, currentSchema);

  for (const [fieldPath, baselineType] of baselineFields.fields) {
    const currentType = currentFields.fields.get(fieldPath);
    if (!currentType) {
      changes.push({ endpoint, severity: "breaking", message: `${label} field "${fieldPath}" removed from ${endpoint}` });
      continue;
    }

    if (currentType !== baselineType) {
      changes.push({
        endpoint,
        severity: "breaking",
        message: `${label} field "${fieldPath}" type changed from ${baselineType} to ${currentType}`,
      });
    }
  }

  for (const [fieldPath] of currentFields.fields) {
    if (!baselineFields.fields.has(fieldPath)) {
      const isNewRequiredRequestField = mode === "request" && currentFields.required.has(fieldPath);
      changes.push({
        endpoint,
        severity: isNewRequiredRequestField ? "breaking" : "additive",
        message: `${label} field "${fieldPath}" added to ${endpoint}${isNewRequiredRequestField ? " as required" : ""}`,
      });
    }
  }

  if (mode === "request") {
    for (const fieldPath of currentFields.required) {
      if (!baselineFields.required.has(fieldPath)) {
        changes.push({
          endpoint,
          severity: "breaking",
          message: `${label} field "${fieldPath}" became required in ${endpoint}`,
        });
      }
    }
  }

  return changes;
}

// ─── Comparison logic ──────────────────────────────────────────────────────────

/**
 * Compare two OpenAPI operations for breaking changes.
 * Returns a list of changes found.
 */
function compareOperations(
  endpoint: string,
  baselineOp: Operation | undefined,
  currentOp: Operation | undefined,
  baselineSpec: OpenAPISpec,
  currentSpec: OpenAPISpec,
): Change[] {
  const changes: Change[] = [];

  // Missing endpoint
  if (!currentOp) {
    changes.push({
      endpoint,
      severity: "breaking",
      message: `Endpoint ${endpoint} removed or no longer exists in current spec`,
    });
    return changes;
  }

  if (!baselineOp) {
    changes.push({
      endpoint,
      severity: "additive",
      message: `New stable endpoint ${endpoint} detected (was not in baseline)`,
    });
    return changes;
  }

  // Compare required parameters
  const baselineParams = (baselineOp.parameters ?? []).filter((p) => p.required && p.in === "path");
  const currentParams = (currentOp.parameters ?? []).filter((p) => p.required && p.in === "path");

  for (const bp of baselineParams) {
    const found = currentParams.find((cp) => cp.name === bp.name);
    if (!found) {
      changes.push({
        endpoint,
        severity: "breaking",
        message: `Required path parameter "${bp.name}" removed from ${endpoint}`,
      });
    }
  }

  for (const cp of currentParams) {
    const found = baselineParams.find((bp) => bp.name === cp.name);
    if (!found) {
      changes.push({
        endpoint,
        severity: "additive",
        message: `New required path parameter "${cp.name}" added to ${endpoint}`,
      });
    }
  }

  // Compare request body requirement changes
  const baselineReqBody = baselineOp.requestBody;
  const currentReqBody = currentOp.requestBody;

  if (baselineReqBody && !currentReqBody) {
    changes.push({
      endpoint,
      severity: "breaking",
      message: `Request body removed from ${endpoint}`,
    });
  } else if (!baselineReqBody && currentReqBody) {
    changes.push({
      endpoint,
      severity: "additive",
      message: `Request body added to ${endpoint}`,
    });
  }

  changes.push(...compareSchemaFields({
    endpoint,
    label: "Request body",
    mode: "request",
    baselineSpec,
    currentSpec,
    baselineSchema: getJsonSchemaFromContent(baselineReqBody?.content),
    currentSchema: getJsonSchemaFromContent(currentReqBody?.content),
  }));

  // Compare response codes
  const baselineResponseCodes = Object.keys(baselineOp.responses ?? {}).filter((c) => c !== "default");
  const currentResponseCodes = Object.keys(currentOp.responses ?? {}).filter((c) => c !== "default");

  for (const code of baselineResponseCodes) {
    if (!currentResponseCodes.includes(code)) {
      changes.push({
        endpoint,
        severity: "breaking",
        message: `Response status code ${code} removed from ${endpoint}`,
      });
    }
  }

  for (const code of currentResponseCodes) {
    if (!baselineResponseCodes.includes(code)) {
      changes.push({
        endpoint,
        severity: "additive",
        message: `New response status code ${code} added to ${endpoint}`,
      });
    }
  }

  for (const code of baselineResponseCodes.filter((responseCode) => currentResponseCodes.includes(responseCode))) {
    changes.push(...compareSchemaFields({
      endpoint,
      label: `Response ${code}`,
      mode: "response",
      baselineSpec,
      currentSpec,
      baselineSchema: getJsonSchemaFromContent(baselineOp.responses?.[code]?.content),
      currentSchema: getJsonSchemaFromContent(currentOp.responses?.[code]?.content),
    }));
  }

  // Compare security requirements
  const baselineSecurity = baselineOp.security ?? [];
  const currentSecurity = currentOp.security ?? [];

  const hadAuth = baselineSecurity.length > 0;
  const hasAuth = currentSecurity.length > 0;

  if (hadAuth && !hasAuth) {
    changes.push({
      endpoint,
      severity: "breaking",
      message: `Security/auth requirement removed from ${endpoint}`,
    });
  } else if (!hadAuth && hasAuth) {
    changes.push({
      endpoint,
      severity: "additive",
      message: `Security/auth requirement added to ${endpoint}`,
    });
  }

  return changes;
}

// ─── Changelog check ───────────────────────────────────────────────────────────

/**
 * Check if the changelog mentions the given endpoint.
 */
function changelogMentionsEndpoint(changelogContent: string, endpoint: string): boolean {
  // Search for the endpoint string in the changelog (case-insensitive loose match)
  const normalized = endpoint.toLowerCase().replace(/\s+/g, "").replace(/[{}]/g, "");
  const content = changelogContent.toLowerCase();
  return content.includes(normalized) || content.includes(endpoint.toLowerCase());
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  // 1. Check prerequisites
  if (!existsSync(BASELINE_PATH)) {
    console.error(`ERROR: Baseline not found: ${BASELINE_PATH}`);
    console.error("Run the primary agent Phase 2 setup first to create the baseline.");
    process.exit(3);
  }

  if (!existsSync(STABLE_ENDPOINTS_PATH)) {
    console.error(`ERROR: Stable endpoints list not found: ${STABLE_ENDPOINTS_PATH}`);
    console.error("Run the primary agent Phase 2 setup first to create the stable endpoints list.");
    process.exit(3);
  }

  if (!existsSync(CHANGELOG_PATH)) {
    console.error(`ERROR: Changelog not found: ${CHANGELOG_PATH}`);
    console.error("Run the primary agent Phase 2 setup first to create the changelog.");
    process.exit(3);
  }

  // 2. Load baseline and stable endpoints
  let baseline: OpenAPISpec;
  let stableEndpointsDoc: StableEndpointsDoc;

  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as OpenAPISpec;
  } catch (err) {
    console.error("ERROR: Failed to parse baseline OpenAPI spec:", (err as Error).message);
    process.exit(3);
  }

  try {
    stableEndpointsDoc = JSON.parse(readFileSync(STABLE_ENDPOINTS_PATH, "utf-8")) as StableEndpointsDoc;
  } catch (err) {
    console.error("ERROR: Failed to parse stable endpoints list:", (err as Error).message);
    process.exit(3);
  }

  if (!stableEndpointsDoc.stableEndpoints || !Array.isArray(stableEndpointsDoc.stableEndpoints)) {
    console.error("ERROR: stable-endpoints.json must contain a `stableEndpoints` array.");
    process.exit(3);
  }

  // 3. Generate current spec
  console.log("Generating current OpenAPI spec...");
  const current = generateCurrentSpec();
  console.log(`  Generated spec version: ${current.info?.version ?? "unknown"}`);
  console.log(`  Endpoints in current spec: ${Object.keys(current.paths ?? {}).length} paths`);

  // 4. Compare stable endpoints
  const changelogContent = readFileSync(CHANGELOG_PATH, "utf-8");
  const breakingChanges: BreakingChange[] = [];
  const additiveChanges: AdditiveChange[] = [];
  const unmentionedAdditive: AdditiveChange[] = [];

  const stableEndpoints = stableEndpointsDoc.stableEndpoints;

  console.log(`\nChecking ${stableEndpoints.length} stable endpoints...`);

  for (const entry of stableEndpoints) {
    let parsed: EndpointKey;
    try {
      parsed = parseStableEndpoint(entry);
    } catch (err) {
      console.error(`  WARNING: ${(err as Error).message}`);
      continue;
    }

    const baselineSpecPath = findSpecPath(baseline, parsed.method, parsed.path);
    const currentSpecPath = findSpecPath(current, parsed.method, parsed.path);

    const baselineOp = baselineSpecPath
      ? getEndpointDetail(baseline, parsed.method, baselineSpecPath)
      : undefined;
    const currentOp = currentSpecPath
      ? getEndpointDetail(current, parsed.method, currentSpecPath)
      : undefined;

    const changes = compareOperations(`${parsed.method} ${parsed.path}`, baselineOp, currentOp, baseline, current);

    for (const change of changes) {
      if (change.severity === "breaking") {
        breakingChanges.push(change as BreakingChange);
      } else {
        additiveChanges.push(change as AdditiveChange);
        if (!changelogMentionsEndpoint(changelogContent, change.endpoint)) {
          unmentionedAdditive.push(change as AdditiveChange);
        }
      }
    }
  }

  // 4a. Detect stable endpoints with missing schemas in current spec
  // This catches endpoints that lack OpenAPI response schemas for success codes,
  // which would produce silent false negatives in contract comparison.
  const missingSchemaEndpoints: string[] = [];

  for (const entry of stableEndpoints) {
    let parsed: EndpointKey;
    try {
      parsed = parseStableEndpoint(entry);
    } catch {
      continue;
    }

    const currentSpecPath = findSpecPath(current, parsed.method, parsed.path);
    if (!currentSpecPath) continue;

    const currentOp = getEndpointDetail(current, parsed.method, currentSpecPath);
    if (!currentOp) continue;

    const successCodes = Object.keys(currentOp.responses ?? {}).filter(
      (code) => code === "200" || code === "201",
    );

    for (const code of successCodes) {
      const responseBody = currentOp.responses?.[code];
      const hasSchema = !!getJsonSchemaFromContent(responseBody?.content);
      if (!hasSchema) {
        missingSchemaEndpoints.push(`${parsed.method} ${parsed.path} (${code})`);
        break; // one missing schema per endpoint is enough to flag
      }
    }
  }

  // 5. Report results
  console.log("\n─────────────────────────────────────────────");
  console.log("API Contract Diff Results");
  console.log("─────────────────────────────────────────────\n");

  if (breakingChanges.length > 0) {
    console.error(`❌ BREAKING CHANGES (${breakingChanges.length}):`);
    for (const bc of breakingChanges) {
      console.error(`  - ${bc.endpoint}: ${bc.message}`);
    }
    console.error();
  }

  if (additiveChanges.length > 0) {
    console.log(`ℹ️  ADDITIVE CHANGES (${additiveChanges.length}):`);
    for (const ac of additiveChanges) {
      const marker = unmentionedAdditive.includes(ac) ? "⚠️  [NOT IN CHANGELOG]" : "✅";
      console.log(`  ${marker} ${ac.endpoint}: ${ac.message}`);
    }
    console.log();
  }

  if (breakingChanges.length === 0 && additiveChanges.length === 0 && missingSchemaEndpoints.length === 0) {
    console.log("✅ No changes detected in stable endpoints.");
    console.log("Contract is consistent with baseline.\n");
    process.exit(0);
  }

  // Fail on breaking changes
  if (breakingChanges.length > 0) {
    console.error("FAIL: Breaking changes detected. These MUST be resolved or approved.");
    console.error("See docs/api-contracts/stable-contract-rules.md for allowed changes.\n");
    process.exit(1);
  }

  // Fail on stable endpoints with missing schemas in current OpenAPI
  // This prevents silent false negatives where endpoints have descriptions but no schemas.
  if (missingSchemaEndpoints.length > 0) {
    console.error(`❌ STABLE ENDPOINTS MISSING RESPONSE SCHEMAS (${missingSchemaEndpoints.length}):`);
    for (const ep of missingSchemaEndpoints) {
      console.error(`  - ${ep}`);
    }
    console.error("\nFAIL: Stable endpoints MUST have OpenAPI response schemas for success codes.");
    console.error("These endpoints are registered as stable but have no content schema for 200/201 responses.");
    console.error("Add proper response schemas to the endpoint's OpenAPI registration.\n");
    process.exit(1);
  }

  // Warn if additive changes are not in changelog
  if (unmentionedAdditive.length > 0) {
    console.error(
      `WARNING: ${unmentionedAdditive.length} additive change(s) not mentioned in CHANGELOG.md.`,
    );
    console.error("All stable endpoint changes MUST be documented in the changelog.\n");
    process.exit(2);
  }

  // All additive changes are documented
  console.log("✅ All additive changes are documented in CHANGELOG.md.\n");
  process.exit(0);
}

main();
