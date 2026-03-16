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
  'AUTH_JWT_ACCESS_SECRET',
  'AUTH_REFRESH_SECRET'
];

const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\n💡 Copy .env.example to .env and fill in values');
  process.exit(1);
}

console.log('✅ Environment variables validated');

// Optional database connectivity check
async function checkDatabaseConnection() {
  try {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 5000
    });
    await connection.end();
    console.log('✅ Database connection verified');
    return true;
  } catch (error) {
    console.warn('⚠️  Database connection failed:', error.message);
    console.warn('   The API will likely fail to start. Check your DB configuration.');
    console.warn(`   Connection: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`);
    return false;
  }
}

await checkDatabaseConnection();
