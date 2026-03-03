import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = path.resolve("docs");

async function listMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractJsonBlocks(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let inBlock = false;
  let buffer = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inBlock && /^```json\b/i.test(trimmed)) {
      inBlock = true;
      buffer = [];
      startLine = i + 2;
      continue;
    }

    if (inBlock && /^```\s*$/.test(trimmed)) {
      blocks.push({ content: buffer.join("\n"), startLine });
      inBlock = false;
      buffer = [];
      startLine = 0;
      continue;
    }

    if (inBlock) {
      buffer.push(line);
    }
  }

  return blocks;
}

function checkBlock(block) {
  const issues = [];
  const text = block.content;

  if (/"ok"\s*:/.test(text)) {
    issues.push("Use success/data envelope (no ok field)");
  }

  if (/"success"\s*:\s*true/.test(text) && !/"data"\s*:/.test(text)) {
    issues.push("success:true responses must include data");
  }

  if (/"success"\s*:\s*false/.test(text)) {
    if (!/"error"\s*:\s*\{/.test(text)) {
      issues.push("success:false responses must include error object");
    } else if (!/"code"\s*:\s*"/.test(text)) {
      issues.push("error object must include code");
    } else if (/"code"\s*:\s*"ROUTE_MOVED"/.test(text)) {
      if (!/"new_path"\s*:\s*"/.test(text)) {
        issues.push("ROUTE_MOVED errors must include new_path");
      }
    } else if (!/"message"\s*:\s*"/.test(text)) {
      issues.push("error object must include message");
    }
  }

  return issues;
}

async function main() {
  const files = await listMarkdownFiles(DOCS_DIR);
  const issues = [];

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const blocks = extractJsonBlocks(content);

    for (const block of blocks) {
      const blockIssues = checkBlock(block);
      for (const issue of blockIssues) {
        issues.push({
          filePath,
          line: block.startLine,
          message: issue
        });
      }
    }
  }

  if (issues.length > 0) {
    console.error("Docs response envelope lint failed:");
    for (const issue of issues) {
      const relativePath = path.relative(process.cwd(), issue.filePath);
      console.error(`${relativePath}:${issue.line} ${issue.message}`);
    }
    process.exit(1);
  }

  console.log("Docs response envelope lint: OK");
}

await main();
