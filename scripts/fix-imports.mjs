#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Check Import Paths After File Moves
 *
 * Usage:
 *   node scripts/fix-imports.mjs --check    Report issues, exit non-zero if found
 *
 * What it checks:
 *  1. api/src files should use @/ aliases (not relative paths like ../../lib/)
 *  2. packages internal files should use relative imports (not @/ aliases)
 *  3. Cross-package imports use @jurnapod/package-name
 *
 * Note: --fix is intentionally omitted. Auto-fixing import paths requires
 * careful AST-aware rewriting and is hard to validate safely.
 * Use the reported hints to fix issues manually.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const mode = args.includes('--check') ? 'check' : 'usage';

if (mode === 'usage') {
  console.log(`Usage: node scripts/fix-imports.mjs --check

  --check   Report import issues, exit 1 if any found

Examples:
  node scripts/fix-imports.mjs --check    Audit only
`);
  process.exit(0);
}

// --- Path Constants ---
const API_SRC = join(ROOT, 'apps/api/src');
const PACKAGES_SRC = join(ROOT, 'packages');

/**
 * Compute the @/ alias path for a file in apps/api/src
 * e.g., apps/api/src/lib/metrics/health.ts + ../../lib/db.js -> @/lib/db.js
 */
function computeAliasPath(fromFile, importPath) {
  const fromDir = dirname(fromFile);
  const resolved = resolve(fromDir, importPath);
  const apiSrcAbs = API_SRC;

  if (resolved.startsWith(apiSrcAbs)) {
    const rel = resolved.slice(apiSrcAbs.length).replace(/^\//, '');
    return `@/${rel}`;
  }
  return null; // Outside api/src, can't use @/ alias
}

/**
 * Compute the relative path for a package-internal import
 * e.g., packages/modules/sales/src/service.ts + @/lib/db -> ../../../../apps/api/src/lib/db (NOT recommended)
 * For package-internal: should be relative within the package
 */
function computeRelativePath(fromFile, importPath) {
  const fromDir = dirname(fromFile);
  const rel = relative(fromDir, importPath);
  return `./${rel.replace(/^\.\//, '')}`;
}

function scanContent(content, filePath) {
  const issues = [];

  // Match all import statements
  // import x from 'path' or import { x } from 'path' or import * as x from 'path'
  const importRegex = /import\s+(?:(\*\s+as\s+\w+)|(\{[^}]+\})|(\w+))?\s*from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const [fullMatch, namespace, named, defaultImport, importPath] = match;
    const lineNum = content.substring(0, match.index).split('\n').length;

    // Skip node_modules, skip URLs
    if (importPath.startsWith('node:') || importPath.startsWith('http') || importPath.includes('node_modules')) continue;

    const isInApi = filePath.startsWith(API_SRC);
    const isInPackage = filePath.startsWith(PACKAGES_SRC);

    // --- Case 1: API file uses relative path to another api path ---
    if (isInApi) {
      // Check if it's a relative path that goes to api src
      if (importPath.startsWith('.')) {
        const fromDir = dirname(filePath);
        const resolved = resolve(fromDir, importPath);

        if (resolved.startsWith(API_SRC)) {
          const aliasForm = `@/${relative(API_SRC, resolved).replace(/^\//, '')}`;
          issues.push({
            file: relative(ROOT, filePath),
            line: lineNum,
            type: 'api-relative-should-be-alias',
            from: fullMatch,
            to: `import ${named || defaultImport || namespace} from '${aliasForm}'`,
            hint: 'Use @/ alias instead of relative path',
          });
        }
      }

      // Check for cross-package relative paths like ../../../packages/db/
      if (importPath.startsWith('../') && importPath.includes('packages/')) {
        issues.push({
          file: relative(ROOT, filePath),
          line: lineNum,
          type: 'cross-package-relative',
          from: fullMatch,
          to: '(use @jurnapod/package-name for cross-package imports)',
          hint: 'Use @jurnapod/package-name',
        });
      }
    }

    // --- Case 2: Package file uses @/ alias ---
    if (isInPackage) {
      if (importPath.startsWith('@/')) {
        // This is an @/ alias from api, can't use in package
        issues.push({
          file: relative(ROOT, filePath),
          line: lineNum,
          type: 'package-alias-should-be-relative',
          from: fullMatch,
          to: '(resolve to relative path manually)',
          hint: '@/ aliases are only for apps/api. Use relative or @jurnapod/package-name in packages.',
        });
      }

      // Check for internal package imports via @jurnapod/package-name that should be relative
      const pkgName = getPackageName(filePath);
      const jurnapodSelf = `@jurnapod/${pkgName}`;
      if (importPath.startsWith(jurnapodSelf)) {
        const internalPath = importPath.slice(jurnapodSelf.length + 1); // +1 for the /
        const fromDir = dirname(filePath);
        // Try to find the actual file
        const possiblePaths = [
          join(PACKAGES_SRC, pkgName.replace('modules-', 'modules/'), 'src', internalPath),
          join(PACKAGES_SRC, pkgName, 'src', internalPath),
        ];
        const actualPath = possiblePaths.find(p => {
          try { return readFileSync(p, 'utf-8') !== null; } catch { return false; }
        });
        if (actualPath) {
          const relPath = computeRelativePath(filePath, actualPath);
          issues.push({
            file: relative(ROOT, filePath),
            line: lineNum,
            type: 'package-internal-should-be-relative',
            from: fullMatch,
            to: `import ${named || defaultImport || namespace} from '${relPath}'`,
            hint: 'Same-package imports should use relative paths',
          });
        }
      }
    }
  }

  return issues;
}

function getPackageName(filePath) {
  const rel = filePath.replace(PACKAGES_SRC, '').split('/').filter(Boolean);
  if (rel[0] === 'modules') {
    return `modules-${rel[1]}`;
  }
  return rel[0];
}

function walkDir(dir, callback) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.includes('node_modules') && !entry.name.includes('dist') && !entry.name.includes('.git') && !entry.name.includes('.next')) {
          walkDir(fullPath, callback);
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        callback(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }
}

// --- Main ---
const allIssues = [];

console.log(`Scanning codebase for import issues...`);
console.log(`Mode: ${mode}\n`);

walkDir(join(ROOT, 'apps'), (filePath) => {
  try {
    const content = readFileSync(filePath, 'utf-8');
    allIssues.push(...scanContent(content, filePath));
  } catch {
    // Skip unreadable files
  }
});

walkDir(PACKAGES_SRC, (filePath) => {
  try {
    const content = readFileSync(filePath, 'utf-8');
    allIssues.push(...scanContent(content, filePath));
  } catch {
    // Skip unreadable files
  }
});

if (allIssues.length === 0) {
  console.log('No import issues found.');
  process.exit(0);
}

console.log(`Found ${allIssues.length} import issue(s):\n`);

for (const issue of allIssues) {
  console.log(`${issue.file}:${issue.line} [${issue.type}]`);
  console.log(`  FROM: ${issue.from}`);
  if (issue.to !== issue.from) {
    console.log(`  TO:   ${issue.to}`);
  }
  console.log(`  Hint: ${issue.hint}`);
  console.log();
}

console.log(`\nImport issues must be fixed manually. Review the hints above for each file.`);
process.exit(1);
