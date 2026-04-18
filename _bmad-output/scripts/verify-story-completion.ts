#!/usr/bin/env node
/**
 * verify-story-completion.ts
 *
 * CI check: Verifies that all stories marked as "done" in sprint-status.yaml
 * have a corresponding .completion.md file.
 *
 * This check only applies to Epic 44 and later (per Epic 44 Retrospective
 * Action Item #2). Stories from earlier epics are skipped since the completion
 * note practice was not yet established.
 *
 * Usage:
 *   npx tsx _bmad-output/scripts/verify-story-completion.ts
 *   npm run verify:story-completion
 *
 * Exit codes:
 *   0 - All done stories from Epic 44+ have completion notes (PASS)
 *   1 - One or more done stories from Epic 44+ are missing completion notes (FAIL)
 *
 * Story key format examples:
 *   "44-1-customer-master-crud"  -> epic=44, storyNum="1"    -> story-44.1.completion.md
 *   "23-5-1-something"           -> epic=23, storyNum="5.1"  -> story-23.5.1.completion.md
 *
 * CI Integration:
 *   Add to package.json scripts:
 *   "verify:story-completion": "npx tsx _bmad-output/scripts/verify-story-completion.ts"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

const SPRINT_STATUS_PATH = path.resolve(
  process.cwd(),
  '_bmad-output/implementation-artifacts/sprint-status.yaml'
);

const STORY_DIR_PATH = path.resolve(
  process.cwd(),
  '_bmad-output/implementation-artifacts/stories'
);

// Only enforce completion notes from this epic onwards
const ENFORCE_FROM_EPIC = 44;

// Keys to skip (not actual story keys)
const SKIP_KEYS = new Set([
  'last_updated',
  'project',
  'project_key',
  'tracking_system',
  'story_location',
]);

// Retrospective suffix patterns
const RETROSPECTIVE_REGEX = /-retrospective$/;

// Epic-level key patterns (e.g., "epic-1", "epic-44")
const EPIC_LEVEL_REGEX = /^epic-\d+$/;

/**
 * Parse story key into epic number and story number string.
 *
 * Examples:
 *   "44-1-customer-master-crud"  -> epic=44, storyNum="1"
 *   "23-5-1-something"           -> epic=23, storyNum="5.1"
 *   "6-1a-invoice-types"         -> epic=6, storyNum="1" (letter suffix stripped)
 *   "epic-1"                      -> null (skip, epic-level key)
 *   "epic-1-retrospective"       -> null (skip, retrospective key)
 */
function parseStoryKey(key: string): { epic: number; storyNum: string } | null {
  // Skip retrospective keys
  if (RETROSPECTIVE_REGEX.test(key)) {
    return null;
  }

  // Skip epic-level keys
  if (EPIC_LEVEL_REGEX.test(key)) {
    return null;
  }

  const parts = key.split('-');

  // First part is always the epic number
  const epicStr = parts[0];
  const epic = parseInt(epicStr, 10);
  if (isNaN(epic)) return null;

  // Second part is the primary story number (may have letter suffix like "1a")
  const storyPart = parts[1];
  if (!storyPart) return null;

  // Strip any letter suffix (e.g., "1a" -> "1", "2b" -> "2")
  const storyNumMatch = storyPart.match(/^(\d+)/);
  if (!storyNumMatch) return null;
  let storyNum = storyNumMatch[1];

  // If there's a third part that looks like a sub-story number (single digit),
  // combine them: "5-1" -> "5.1"
  // This handles keys like "23-5-1-something" where story number is "5.1"
  if (parts.length > 2) {
    const thirdPart = parts[2];
    const thirdNumMatch = thirdPart.match(/^(\d+)$/);
    if (thirdNumMatch) {
      storyNum = `${storyNum}.${thirdNumMatch[1]}`;
    }
  }

  return { epic, storyNum };
}

/**
 * Find the completion note file for the given epic and story number.
 * Returns the path if found, null if not found.
 */
function findCompletionNote(epic: number, storyNum: string): string | null {
  const epicDir = path.join(STORY_DIR_PATH, `epic-${epic}`);
  if (!fs.existsSync(epicDir)) {
    return null;
  }

  const files = fs.readdirSync(epicDir);

  // Build possible completion file names to search for
  const possibleNames: string[] = [];

  // Standard format: story-{epic}.{storyNum}.completion.md
  // e.g., story-44.1.completion.md, story-23.5.1.completion.md
  possibleNames.push(`story-${epic}.${storyNum}.completion.md`);

  // Search for matching completion file
  for (const name of possibleNames) {
    if (files.includes(name)) {
      return path.join(epicDir, name);
    }
  }

  return null;
}

/**
 * Recursively collect all "done" story keys from the sprint status object.
 */
function collectDoneStories(obj: unknown, prefix: string[] = []): string[] {
  const doneStories: string[] = [];

  if (typeof obj !== 'object' || obj === null) return doneStories;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SKIP_KEYS.has(key)) continue;

    if (typeof value === 'string' && value.trim().toLowerCase() === 'done') {
      const fullKey = prefix.length > 0 ? `${prefix.join('-')}-${key}` : key;
      doneStories.push(fullKey);
    } else if (typeof value === 'object' && value !== null) {
      const nested = collectDoneStories(value, [...prefix, key]);
      doneStories.push(...nested);
    }
  }

  return doneStories;
}

function main(): void {
  console.log('🔍 Verifying story completion notes...\n');
  console.log(`(Enforcing completion notes for Epic ${ENFORCE_FROM_EPIC}+ only)\n`);

  // Read sprint-status.yaml
  if (!fs.existsSync(SPRINT_STATUS_PATH)) {
    console.error(`❌ ERROR: sprint-status.yaml not found at ${SPRINT_STATUS_PATH}`);
    process.exit(1);
  }

  const yamlContent = fs.readFileSync(SPRINT_STATUS_PATH, 'utf-8');
  let sprintStatus: Record<string, unknown>;

  try {
    sprintStatus = yaml.load(yamlContent) as Record<string, unknown>;
  } catch (err) {
    console.error('❌ ERROR: Failed to parse sprint-status.yaml:', err);
    process.exit(1);
  }

  if (!sprintStatus || typeof sprintStatus !== 'object') {
    console.error('❌ ERROR: sprint-status.yaml has invalid structure');
    process.exit(1);
  }

  const devStatus = sprintStatus['development_status'];
  if (!devStatus || typeof devStatus !== 'object') {
    console.error('❌ ERROR: sprint-status.yaml missing "development_status" section');
    process.exit(1);
  }

  const doneStories = collectDoneStories(devStatus);

  if (doneStories.length === 0) {
    console.log('✅ No stories marked as done — nothing to verify.');
    process.exit(0);
  }

  console.log(`Found ${doneStories.length} story(ies) marked as "done" total\n`);

  const missing: Array<{ key: string; epic: number; storyNum: string }> = [];
  let skippedPreEnforceEpic = 0;
  let skippedRetrospective = 0;
  let skippedEpicLevel = 0;
  let found = 0;

  for (const storyKey of doneStories) {
    const parsed = parseStoryKey(storyKey);
    if (!parsed) {
      // Could be epic-level or retrospective - skip silently
      skippedRetrospective++;
      continue;
    }

    const { epic, storyNum } = parsed;

    // Skip stories from epics before the enforcement epic
    if (epic < ENFORCE_FROM_EPIC) {
      skippedPreEnforceEpic++;
      continue;
    }

    // Check if completion note exists
    const completionPath = findCompletionNote(epic, storyNum);

    if (!completionPath) {
      missing.push({ key: storyKey, epic, storyNum });
    } else {
      found++;
    }
  }

  console.log(`  - ${found} stories have completion notes`);
  console.log(`  - ${missing.length} stories missing completion notes`);
  console.log(`  - ${skippedPreEnforceEpic} stories skipped (pre-Epic ${ENFORCE_FROM_EPIC})`);

  if (missing.length > 0) {
    console.log('\n❌ FAIL: The following done stories are missing completion notes:\n');
    for (const { key, epic, storyNum } of missing) {
      console.log(`   - ${key}`);
      console.log(`     Expected: _bmad-output/implementation-artifacts/stories/epic-${epic}/story-${epic}.${storyNum}.completion.md\n`);
    }
    console.log(`Total: ${missing.length} missing completion note(s) out of ${found + missing.length} checked stories`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASS: All ${found} done story(ies) from Epic ${ENFORCE_FROM_EPIC}+ have completion notes.`);
    process.exit(0);
  }
}

main();