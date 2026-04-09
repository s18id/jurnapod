// Script to extract and convert OpenAPI spec from swagger.ts to openapi.json
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the swagger.ts file
const swaggerPath = join(__dirname, '../apps/api/src/routes/swagger.ts');
const content = readFileSync(swaggerPath, 'utf-8');

// Extract the content between "return {" and the matching closing "};"
const startMarker = 'function generateOpenAPIDocument() {';
const returnMarker = 'return {';
const startIdx = content.indexOf(startMarker);

if (startIdx === -1) {
  console.error('Could not find generateOpenAPIDocument function');
  process.exit(1);
}

const returnIdx = content.indexOf(returnMarker, startIdx);
if (returnIdx === -1) {
  console.error('Could not find return statement');
  process.exit(1);
}

// Find the matching closing brace
let braceCount = 0;
let inString = false;
let stringChar = '';
let escapeNext = false;
let endIdx = -1;

for (let i = returnIdx + returnMarker.length - 1; i < content.length; i++) {
  const char = content[i];
  
  if (escapeNext) {
    escapeNext = false;
    continue;
  }
  
  if (char === '\\') {
    escapeNext = true;
    continue;
  }
  
  if (!inString && (char === '"' || char === "'" || char === '`')) {
    inString = true;
    stringChar = char;
    continue;
  }
  
  if (inString && char === stringChar) {
    inString = false;
    continue;
  }
  
  if (!inString) {
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
}

if (endIdx === -1) {
  console.error('Could not find matching closing brace');
  process.exit(1);
}

// Extract the object content
let objectContent = content.slice(returnIdx + returnMarker.length - 1, endIdx);

// Remove trailing semicolon if present
objectContent = objectContent.replace(/;\s*$/, '');

// Convert JavaScript object syntax to JSON
// 1. Replace single quotes with double quotes (but not inside strings)
// 2. Remove trailing commas
// 3. Remove comments

// First, let's use a simpler approach - evaluate it as JS and then stringify
// This requires creating a safe evaluation context
const jsContent = `(${objectContent})`;

try {
  // Use Function constructor to evaluate in a safe way
  const obj = new Function('return ' + jsContent)();
  
  // Convert to JSON
  const json = JSON.stringify(obj, null, 2);
  
  // Write to openapi.json
  const outputPath = join(__dirname, '../apps/api/openapi.json');
  writeFileSync(outputPath, json);
  
  console.log('✅ Successfully extracted OpenAPI spec to:', outputPath);
  console.log('📊 Spec size:', (json.length / 1024).toFixed(2), 'KB');
} catch (error) {
  console.error('❌ Error converting to JSON:', error.message);
  process.exit(1);
}
