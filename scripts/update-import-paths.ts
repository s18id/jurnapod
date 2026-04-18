#!/usr/bin/env tsx
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Automated Import Path Update Script
 *
 * Remaps relative import paths to @/ aliases during refactoring.
 *
 * Usage:
 *   tsx scripts/update-import-paths.ts --source <source-dir> --target <target-dir>
 *   tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes
 *   tsx scripts/update-import-paths.ts --source lib --target services --dry-run
 *   tsx scripts/update-import-paths.ts --source lib --target services --force
 *
 * Options:
 *   --source    Source directory that relative imports resolve to
 *   --target    Target directory to scan and update
 *   --dry-run   Show diff without applying changes
 *   --force     Skip confirmation prompt (for CI automation)
 *   --help      Show this help message
 *
 * Examples:
 *   # Convert relative imports in routes to @/ aliases
 *   tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes
 *
 *   # Preview changes without applying
 *   tsx scripts/update-import-paths.ts --source lib --target services --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Configuration ---
const API_SRC_ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..', 'apps/api/src'));

interface CliArgs {
  source?: string;
  target?: string;
  dryRun?: boolean;
  force?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source' && i + 1 < args.length) {
      result.source = args[++i];
    } else if (arg === '--target' && i + 1 < args.length) {
      result.target = args[++i];
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }
  return result;
}

function showHelp() {
  console.log(`
Automated Import Path Update Script

Usage:
  tsx scripts/update-import-paths.ts --source <source-dir> --target <target-dir>
  tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes
  tsx scripts/update-import-paths.ts --source lib --target services --dry-run
  tsx scripts/update-import-paths.ts --source lib --target services --force

Options:
  --source    Source directory that relative imports resolve to (required)
  --target    Target directory to scan and update (required)
  --dry-run   Show diff without applying changes
  --force     Skip confirmation prompt (for CI automation)
  --help      Show this help message

Examples:
  # Convert relative imports in routes to @/ aliases
  tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes

  # Preview changes without applying
  tsx scripts/update-import-paths.ts --source lib --target services --dry-run
`);
}

interface ImportMatch {
  fullMatch: string;
  importPath: string;
  lineNum: number;
  startIndex: number;
  endIndex: number;
}

interface FileChange {
  filePath: string;
  relativePath: string;
  oldContent: string;
  newContent: string;
  importsChanged: number;
}

interface DiffLine {
  type: 'header' | 'context' | 'add' | 'remove';
  content: string;
  lineNum?: number;
}

/**
 * Find all import statements in content
 */
function findImports(content: string): ImportMatch[] {
  const imports: ImportMatch[] = [];

  // Match: import x from 'path' | import { x } from 'path' | import * as x from 'path' | import 'path'
  const importRegex = /import\s+(?:(\*\s+as\s+\w+)|(\{[^}]+\})|(\w+))?\s*from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const [fullMatch, namespace, named, defaultImport, importPath, sideEffectPath] = match;
    const actualPath = importPath || sideEffectPath;
    const lineNum = content.substring(0, match.index).split('\n').length;

    imports.push({
      fullMatch,
      importPath: actualPath,
      lineNum,
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
    });
  }

  return imports;
}

/**
 * Check if an import path is external (node_modules, @jurnapod, http, etc.)
 */
function isExternalImport(importPath: string): boolean {
  return (
    importPath.startsWith('node:') ||
    importPath.startsWith('http') ||
    importPath.startsWith('/') ||
    importPath.includes('node_modules') ||
    importPath.startsWith('@jurnapod/') ||
    importPath.startsWith('@/')
  );
}

/**
 * Resolve a relative import path from a file location
 */
function resolveImport(fromFile: string, importPath: string): string {
  const fromDir = dirname(fromFile);
  return resolve(fromDir, importPath);
}

/**
 * Convert a relative path to @/ alias if it falls under API_SRC_ROOT
 */
function toAliasPath(resolvedPath: string): string | null {
  if (resolvedPath.startsWith(API_SRC_ROOT)) {
    const rel = resolvedPath.slice(API_SRC_ROOT.length).replace(/^\//, '');
    return `@/${rel}`;
  }
  return null;
}

/**
 * Calculate the relative depth needed to go from fromFile to targetDir
 * and return the appropriate @/ alias path
 */
function computeAliasForImport(fromFile: string, importPath: string): string | null {
  const fromDir = dirname(fromFile);
  const resolved = resolve(fromDir, importPath);

  // Only convert if it resolves to within the API src root
  return toAliasPath(resolved);
}

/**
 * Check if a relative import resolves to the source directory
 */
function resolvesToSource(
  fromFile: string,
  importPath: string,
  sourceDir: string
): boolean {
  if (!importPath.startsWith('.')) return false;

  const fromDir = dirname(fromFile);
  const resolved = resolve(fromDir, importPath);
  const sourceAbs = resolve(sourceDir);

  return resolved === sourceAbs || resolved.startsWith(sourceAbs + '/');
}

/**
 * Scan a single file for import conversions
 */
function scanFile(
  filePath: string,
  sourceDir: string
): { imports: ImportMatch[]; needsUpdate: boolean } {
  const content = readFileSync(filePath, 'utf-8');
  const imports = findImports(content);

  // Check if any imports need updating
  const needsUpdate = imports.some(imp => {
    if (isExternalImport(imp.importPath)) return false;
    if (!imp.importPath.startsWith('.')) return false;
    return resolvesToSource(filePath, imp.importPath, sourceDir);
  });

  return { imports, needsUpdate };
}

/**
 * Generate unified diff for a file change
 */
function generateDiff(change: FileChange): DiffLine[] {
  const lines: DiffLine[] = [];
  const oldLines = change.oldContent.split('\n');
  const newLines = change.newContent.split('\n');

  lines.push({ type: 'header', content: `--- ${change.relativePath}` });
  lines.push({ type: 'header', content: `+++ ${change.relativePath}` });

  // Simple line-by-line diff
  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      lines.push({ type: 'context', content: ` ${oldLine ?? ''}`, lineNum: i + 1 });
    } else {
      if (oldLine !== undefined) {
        lines.push({ type: 'remove', content: `-${oldLine}`, lineNum: i + 1 });
      }
      if (newLine !== undefined) {
        lines.push({ type: 'add', content: `+${newLine}`, lineNum: i + 1 });
      }
    }
  }

  return lines;
}

/**
 * Format diff for display
 */
function formatDiff(diff: DiffLine[]): string {
  const output: string[] = [];
  for (const line of diff) {
    switch (line.type) {
      case 'header':
        output.push(`\x1b[33m${line.content}\x1b[0m`);
        break;
      case 'add':
        output.push(`\x1b[32m${line.content}\x1b[0m`);
        break;
      case 'remove':
        output.push(`\x1b[31m${line.content}\x1b[0m`);
        break;
      case 'context':
        output.push(`\x1b[90m${line.content}\x1b[0m`);
        break;
    }
  }
  return output.join('\n');
}

/**
 * Update imports in file content
 */
function updateFileContent(content: string, sourceDir: string): { newContent: string; count: number } {
  let count = 0;
  let newContent = content;
  const imports = findImports(content);

  // Process in reverse order to preserve indices
  for (const imp of imports.reverse()) {
    if (isExternalImport(imp.importPath)) continue;
    if (!imp.importPath.startsWith('.')) continue;
    if (!resolvesToSource(content, imp.importPath, sourceDir)) continue;

    // Try to compute alias path
    const alias = computeAliasForImport(content, imp.importPath);
    if (!alias) continue;

    // Replace the import path
    const beforeQuote = content.indexOf(`'${imp.importPath}'`) !== -1 ? "'" : '"';
    const pattern = `from ${beforeQuote}${imp.importPath}${beforeQuote}`;
    const replacement = `from ${beforeQuote}${alias}${beforeQuote}`;

    // Only replace in the specific import match
    const matchIndex = newContent.indexOf(imp.fullMatch);
    if (matchIndex === -1) continue;

    const before = newContent.slice(0, matchIndex);
    const after = newContent.slice(matchIndex + imp.fullMatch.length);
    newContent = before + imp.fullMatch.replace(pattern, replacement) + after;
    count++;
  }

  return { newContent, count };
}

// Need to handle the issue where computeAliasForImport takes content as first arg
function resolvesToSourceFromContent(content: string, importPath: string, sourceDir: string): boolean {
  if (!importPath.startsWith('.')) return false;
  // We need actual file path for resolution - use a dummy that gets resolved
  const tempPath = '/dummy/file.ts';
  const fromDir = dirname(tempPath);
  const resolved = resolve(fromDir, importPath);
  const sourceAbs = resolve(sourceDir);
  return resolved === sourceAbs || resolved.startsWith(sourceAbs + '/');
}

function computeAliasForImportPath(importPath: string): string | null {
  const tempPath = '/dummy/file.ts';
  const fromDir = dirname(tempPath);
  const resolved = resolve(fromDir, importPath);
  return toAliasPath(resolved);
}

/**
 * Recursively scan directory for .ts and .tsx files
 */
function scanDirectory(dir: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          !entry.name.includes('node_modules') &&
          !entry.name.includes('dist') &&
          !entry.name.includes('.git') &&
          !entry.name.includes('.next') &&
          !entry.name.includes('__test__')
        ) {
          scanDirectory(fullPath, files);
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }
  return files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.source || !args.target) {
    console.error('\x1b[31mError:\x1b[0m --source and --target are required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Resolve paths relative to project root
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(__dirname, '..');
  const sourceDir = resolve(projectRoot, args.source);
  const targetDir = resolve(projectRoot, args.target);

  if (!existsSync(sourceDir)) {
    console.error(`\x1b[31mError:\x1b[0m Source directory does not exist: ${sourceDir}`);
    process.exit(1);
  }

  if (!existsSync(targetDir)) {
    console.error(`\x1b[31mError:\x1b[0m Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  console.log(`\x1b[36mScanning for imports to convert\x1b[0m`);
  console.log(`  Source: ${sourceDir}`);
  console.log(`  Target: ${targetDir}`);
  console.log(`  Mode: ${args.dryRun ? 'DRY-RUN (no changes will be applied)' : 'LIVE (changes will be applied)'}`);
  console.log();

  // Scan target directory for .ts and .tsx files
  const targetFiles = scanDirectory(targetDir);

  if (targetFiles.length === 0) {
    console.log('No .ts or .tsx files found in target directory.');
    process.exit(0);
  }

  console.log(`Found ${targetFiles.length} file(s) to scan.\n`);

  const changes: FileChange[] = [];

  // Process each file
  for (const filePath of targetFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const imports = findImports(content);

    let newContent = content;
    let importCount = 0;

    // Process each import
    for (const imp of imports) {
      if (isExternalImport(imp.importPath)) continue;
      if (!imp.importPath.startsWith('.')) continue;

      // Check if this import resolves to source directory
      const fromDir = dirname(filePath);
      const resolved = resolve(fromDir, imp.importPath);
      const sourceAbs = resolve(sourceDir);

      if (resolved !== sourceAbs && !resolved.startsWith(sourceAbs + '/')) continue;

      // Convert to @/ alias
      const alias = toAliasPath(resolved);
      if (!alias) continue;

      // Replace in content
      const beforeQuote = content.includes(`'${imp.importPath}'`) ? "'" : '"';
      const fullPattern = `from ${beforeQuote}${imp.importPath}${beforeQuote}`;
      const replacement = `from ${beforeQuote}${alias}${beforeQuote}`;

      const matchIndex = newContent.indexOf(imp.fullMatch);
      if (matchIndex === -1) continue;

      const before = newContent.slice(0, matchIndex);
      const after = newContent.slice(matchIndex + imp.fullMatch.length);
      newContent = before + imp.fullMatch.replace(fullPattern, replacement) + after;
      importCount++;
    }

    if (newContent !== content) {
      changes.push({
        filePath,
        relativePath: relative(projectRoot, filePath),
        oldContent: content,
        newContent,
        importsChanged: importCount,
      });
    }
  }

  if (changes.length === 0) {
    console.log('\x1b[32m✓ No changes needed. All imports are already using @/ aliases or non-relative paths.\x1b[0m');
    process.exit(0);
  }

  // Summary
  console.log(`\x1b[33mChanges summary:\x1b[0m`);
  console.log(`  ${changes.length} file(s) to modify`);
  console.log(`  ${changes.reduce((acc, c) => acc + c.importsChanged, 0)} import(s) to update\n`);

  // Show diffs
  for (const change of changes) {
    console.log(`\x1b[36m${change.relativePath}\x1b[0m (${change.importsChanged} import(s))`);
    console.log(formatDiff(generateDiff(change)));
    console.log();
  }

  if (args.dryRun) {
    console.log('\x1b[33mDry-run complete. No files were modified.\x1b[0m');
    console.log('Run without --dry-run to apply changes.');
    process.exit(0);
  }

  // Confirmation prompt
  if (!args.force) {
    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('\x1b[33mApply these changes? [y/N]: \x1b[0m', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted. No changes applied.');
      process.exit(0);
    }
  }

  // Apply changes
  console.log('\n\x1b[32mApplying changes...\x1b[0m');

  for (const change of changes) {
    // Create backup
    const backupPath = change.filePath + '.bak';
    writeFileSync(backupPath, change.oldContent);

    // Write new content
    writeFileSync(change.filePath, change.newContent);

    console.log(`  \x1b[32m✓\x1b[0m ${change.relativePath} (${change.importsChanged} import(s), backed up to ${change.relativePath}.bak)`);
  }

  console.log(`\n\x1b[32mDone! ${changes.length} file(s) updated.\x1b[0m`);
  console.log('Backup files (*.bak) created in case you need to revert.');
}

main().catch((err) => {
  console.error('\x1b[31mError:\x1b[0m', err);
  process.exit(1);
});