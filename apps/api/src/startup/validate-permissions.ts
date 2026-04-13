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
 * Resolve which company should be used for startup ACL validation.
 *
 * Priority:
 * 1) JP_COMPANY_CODE from environment
 * 2) Lowest active company id as fallback
 */
async function resolveValidationCompanyId(): Promise<number | null> {
  const db = getDb();
  const companyCode = process.env.JP_COMPANY_CODE;

  if (companyCode) {
    const byCode = await sql<{ id: number }>`
      SELECT id
      FROM companies
      WHERE code = ${companyCode}
        AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 1
    `.execute(db);

    if (byCode.rows.length > 0) {
      return Number((byCode.rows[0] as { id: number }).id);
    }
  }

  const fallback = await sql<{ id: number }>`
    SELECT id
    FROM companies
    WHERE deleted_at IS NULL
    ORDER BY id ASC
    LIMIT 1
  `.execute(db);

  if (fallback.rows.length === 0) {
    return null;
  }

  return Number((fallback.rows[0] as { id: number }).id);
}

/**
 * Fetch module_roles from database for system roles in one validation company.
 */
async function fetchDbPermissions(companyId: number): Promise<any[]> {
  const db = getDb();
  
  // Use raw SQL to avoid Kysely type issues with resource column
  const rows = await sql`
    SELECT r.code as role_code, mr.module, mr.resource, mr.permission_mask
    FROM module_roles mr
    JOIN roles r ON r.id = mr.role_id
    WHERE r.code IN (${sql.join(SYSTEM_ROLE_CODES.map(s => sql`${s}`), sql`, `)})
      AND r.company_id IS NULL
      AND mr.company_id = ${companyId}
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
    
    const companyId = await resolveValidationCompanyId();

    if (companyId === null) {
      const msg = '[startup] No active company found for permission validation. Run seed script first.';
      if (isProduction) {
        console.warn(msg);
      } else {
        throw new Error(msg);
      }
      return;
    }

    console.log(`[startup] Validating permissions using company_id=${companyId}`);

    const dbPermissions = await fetchDbPermissions(companyId);
    
    if (dbPermissions.length === 0) {
      const msg = `[startup] No module_roles entries found for system roles in company_id=${companyId}. Run seed script first.`;
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
