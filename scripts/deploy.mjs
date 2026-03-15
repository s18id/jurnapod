#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { access, cp, mkdir, rename, rm, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";

const SUPPORTED_APPS = ["pos", "backoffice"];

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Usage: node scripts/deploy.mjs --app=<name> [options]

Options:
  --app=<name>      Application to deploy (required)
  --skip-backup     Skip backup creation (faster, no rollback)
  --dry-run         Show what would be deployed without making changes
  --help, -h        Show this help message

Supported apps: ${SUPPORTED_APPS.join(', ')}

Examples:
  node scripts/deploy.mjs --app=pos
  node scripts/deploy.mjs --app=backoffice --dry-run
  node scripts/deploy.mjs --app=pos --skip-backup
    `.trim());
    process.exit(0);
  }

  const appArg = argv.find((arg) => arg.startsWith("--app="));
  const skipBackupArg = argv.includes("--skip-backup");
  const dryRunArg = argv.includes("--dry-run");

  return {
    app: appArg ? appArg.slice("--app=".length) : null,
    skipBackup: skipBackupArg,
    dryRun: dryRunArg
  };
}

async function validateDistDirectory(distPath) {
  try {
    await access(distPath, constants.R_OK);
  } catch {
    throw new Error(`Build directory does not exist or is not readable: ${distPath}`);
  }

  const entries = await readdir(distPath);
  if (entries.length === 0) {
    throw new Error(`Build directory is empty: ${distPath}`);
  }

  const hasIndexHtml = entries.includes("index.html");
  if (!hasIndexHtml) {
    throw new Error(`Build directory missing index.html: ${distPath}`);
  }

  const indexPath = path.join(distPath, "index.html");
  const indexStat = await stat(indexPath);
  if (indexStat.size === 0) {
    throw new Error(`index.html is empty: ${indexPath}`);
  }

  return {
    fileCount: entries.length,
    hasIndexHtml: true,
    indexSize: indexStat.size
  };
}

async function ensureDeployTarget(targetPath) {
  try {
    await mkdir(targetPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create deployment target directory: ${error.message}`);
  }
}

async function createBackup(targetPath, backupPath, dryRun = false) {
  let targetExists = false;
  let isEmpty = false;

  try {
    const entries = await readdir(targetPath);
    targetExists = true;
    isEmpty = entries.length === 0;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false; // No target, no backup needed
    }
    // Permission or other error - propagate it
    throw new Error(`Cannot read deployment target: ${error.message}`);
  }

  if (isEmpty) {
    return false; // Empty target, no backup needed
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would create backup: ${backupPath}`);
    return true; // Pretend backup was created
  }

  // Remove old backup if it exists
  try {
    await rm(backupPath, { recursive: true, force: true });
  } catch (error) {
    // Only log if it's not ENOENT
    if (error.code !== 'ENOENT') {
      console.warn(`   ⚠ Could not remove old backup: ${error.message}`);
    }
  }

  // Create new backup by renaming
  try {
    await rename(targetPath, backupPath);
  } catch (error) {
    throw new Error(`Failed to create backup: ${error.message}`);
  }

  return true;
}

async function deploy(distPath, targetPath, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY RUN] Would copy: ${distPath} -> ${targetPath}`);
    return;
  }

  const tempPath = `${targetPath}.new`;

  // Clean up any failed previous temp deployment
  await rm(tempPath, { recursive: true, force: true });

  // Ensure parent directory exists
  await mkdir(path.dirname(targetPath), { recursive: true });

  // Copy to temp location
  await cp(distPath, tempPath, {
    recursive: true,
    preserveTimestamps: true
  });

  // Atomic swap (rename is atomic on same filesystem)
  await rename(tempPath, targetPath);
}

async function cleanupBackup(backupPath, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY RUN] Would remove backup: ${backupPath}`);
    return;
  }

  try {
    await rm(backupPath, { recursive: true, force: true });
  } catch (error) {
    // Only log if it's not ENOENT
    if (error.code !== 'ENOENT') {
      console.warn(`   ⚠ Could not remove backup: ${error.message}`);
    }
  }
}

async function restoreBackup(backupPath, targetPath) {
  try {
    const tempPath = `${targetPath}.failed`;
    
    // Move failed deployment out of the way (if it exists)
    try {
      await rename(targetPath, tempPath);
    } catch (error) {
      // Target might not exist or rename failed, that's okay
      if (error.code !== 'ENOENT') {
        console.warn(`   ⚠ Could not move failed deployment: ${error.message}`);
      }
    }
    
    // Restore backup (atomic rename)
    await rename(backupPath, targetPath);
    
    // Clean up failed deployment
    try {
      await rm(tempPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    console.log(`Restored backup from: ${backupPath}`);
  } catch (error) {
    throw new Error(`Failed to restore backup: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");

  if (!args.app) {
    throw new Error(`--app argument required. Supported: ${SUPPORTED_APPS.join(", ")}`);
  }

  if (!SUPPORTED_APPS.includes(args.app)) {
    throw new Error(`Unsupported app: ${args.app}. Supported: ${SUPPORTED_APPS.join(", ")}`);
  }

  const distPath = path.join(repoRoot, "apps", args.app, "dist");
  const targetPath = path.join(repoRoot, "public_html", args.app);
  const backupPath = path.join(repoRoot, "public_html", `${args.app}.backup`);

  // Safety check: ensure backup path is different from target path
  if (backupPath === targetPath) {
    throw new Error('Internal error: backup path equals target path');
  }

  console.log(`Deploying ${args.app}...`);
  console.log(`  Source: ${distPath}`);
  console.log(`  Target: ${targetPath}`);

  if (args.dryRun) {
    console.log(`  Mode: DRY RUN`);
  }

  // Step 1: Validate build directory
  console.log("\n1. Validating build directory...");
  const validation = await validateDistDirectory(distPath);
  console.log(`   ✓ Build validation passed (${validation.fileCount} files)`);

  // Step 2: Ensure deployment target exists
  console.log("\n2. Ensuring deployment target...");
  await ensureDeployTarget(path.dirname(targetPath));
  console.log("   ✓ Target directory ready");

  // Step 3: Create backup
  let backupCreated = false;
  if (!args.skipBackup) {
    console.log("\n3. Creating backup...");
    backupCreated = await createBackup(targetPath, backupPath, args.dryRun);
    if (backupCreated) {
      console.log(`   ✓ Backup created: ${backupPath}`);
    } else {
      console.log("   ℹ No existing deployment to backup");
    }
  } else {
    console.log("\n3. Skipping backup (--skip-backup flag)");
  }

  // Step 4: Deploy
  try {
    console.log("\n4. Deploying files...");
    await deploy(distPath, targetPath, args.dryRun);
    console.log(`   ✓ Deployment complete`);

    // Step 5: Cleanup backup
    if (backupCreated && !args.skipBackup && !args.dryRun) {
      console.log("\n5. Cleaning up backup...");
      await cleanupBackup(backupPath, args.dryRun);
      console.log("   ✓ Backup cleaned up");
    }

    console.log(`\n✓ Successfully deployed ${args.app}`);
  } catch (error) {
    console.error(`\n✗ Deployment failed: ${error.message}`);

    // Attempt to restore backup
    if (backupCreated && !args.skipBackup && !args.dryRun) {
      console.log("\nAttempting to restore backup...");
      try {
        await restoreBackup(backupPath, targetPath);
        console.log("✓ Backup restored successfully");
      } catch (restoreError) {
        console.error(`✗ Failed to restore backup: ${restoreError.message}`);
        console.error(`Manual intervention required. Backup location: ${backupPath}`);
      }
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error?.message ?? String(error));
  process.exit(1);
});
