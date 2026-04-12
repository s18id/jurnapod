/**
 * Permission Validation Startup Check
 * 
 * Validates that database permissions match canonical Epic 39 constants
 * before the server starts. In development, throws error if invalid.
 * In production, logs warning but continues.
 */

import { getDb } from '../lib/db.js';
import { formatValidationReport, validateAllRoles } from '@jurnapod/auth';
import { sql } from 'kysely';

// Role codes for validation
const SYSTEM_ROLE_CODES = ['SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT'];

/**
 * Fetch module_roles from database for system roles
 */
async function fetchDbPermissions(): Promise<any[]> {
  const db = getDb();
  
  // Use raw SQL to avoid Kysely type issues with resource column
  const rows = await sql`
    SELECT r.code as role_code, mr.module, mr.resource, mr.permission_mask
    FROM module_roles mr
    JOIN roles r ON r.id = mr.role_id
    WHERE r.code IN (${sql.join(SYSTEM_ROLE_CODES.map(s => sql`${s}`), sql`, `)})
      AND r.company_id IS NULL
    ORDER BY r.code, mr.module, mr.resource
  `.execute(db);
  
  return rows.rows;
}

/**
 * Run permission validation on startup
 */
export async function validatePermissionsOnStartup(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const skipValidation = process.env.SKIP_PERMISSION_VALIDATION === '1';
  
  if (skipValidation) {
    console.log('[startup] Skipping permission validation (SKIP_PERMISSION_VALIDATION=1)');
    return;
  }
  
  try {
    console.log('[startup] Running permission validation...');
    
    const dbPermissions = await fetchDbPermissions();
    
    if (dbPermissions.length === 0) {
      const msg = '[startup] No module_roles entries found for system roles. Run seed script first.';
      if (isProduction) {
        console.warn(msg);
      } else {
        throw new Error(msg);
      }
      return;
    }
    
    // Validate all roles
    const report = validateAllRoles(dbPermissions);
    
    // Output report
    const reportStr = formatValidationReport(report);
    console.log(reportStr);
    
    if (!report.isValid) {
      const msg = `[startup] Permission validation failed: ${report.summary}`;
      if (isProduction) {
        console.warn(`WARNING: ${msg}`);
        console.warn('Server will start but permission issues may cause authorization failures.');
      } else {
        throw new Error(msg);
      }
    } else {
      console.log('[startup] Permission validation passed');
    }
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('No module_roles')) {
      // Already handled above
      return;
    }
    
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[startup] Permission validation error:', msg);
    
    if (!isProduction) {
      throw error;
    }
    console.warn('Server will start despite validation error.');
  }
}