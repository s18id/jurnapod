#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env file if exists
try {
  const envPath = resolve(process.cwd(), '.env');
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch (error) {
  // .env file not found, continue with system env vars
}

const required = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'AUTH_JWT_ACCESS_SECRET'
];

const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\n💡 Copy .env.example to .env and fill in values');
  process.exit(1);
}

console.log('✅ Environment variables validated');
