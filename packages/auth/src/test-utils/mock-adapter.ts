/**
 * Mock database adapter for testing @jurnapod/auth
 */

import type { AuthDbAdapter, AuthConfig } from '../types.js';
import { testEnv } from './env.js';

// Enhanced mock data types
export interface MockRefreshToken {
  id: number;
  user_id: number;
  company_id: number;
  token_hash: string;
  expires_at: Date;
  revoked_at?: Date | null;
  rotated_from_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface MockLoginThrottle {
  key_hash: string;
  failure_count: number;
  last_failed_at: Date;
  last_ip?: string | null;
  last_user_agent?: string | null;
}

export interface MockEmailToken {
  id: number;
  user_id: number;
  company_id: number;
  email: string;
  token_hash: string;
  type: string;
  expires_at: Date;
  used_at?: Date | null;
  created_by: number;
}

export interface MockData {
  users?: Array<{ id: number; company_id: number; email: string; password_hash?: string; is_active: number }>;
  companies?: Array<{ id: number; code: string; timezone?: string; deleted_at?: Date | null }>;
  roles?: Array<{ id: number; code: string; is_global: number }>;
  user_role_assignments?: Array<{ user_id: number; role_id: number; outlet_id?: number | null }>;
  module_roles?: Array<{ role_id: number; company_id: number; module: string; permission_mask: number }>;
  outlets?: Array<{ id: number; company_id: number; code: string; name: string }>;
  auth_refresh_tokens?: MockRefreshToken[];
  auth_login_throttles?: MockLoginThrottle[];
  email_tokens?: MockEmailToken[];
  auth_oauth_accounts?: Array<{ id: number; user_id: number; company_id: number; provider: string; provider_user_id: string; email_snapshot: string }>;
  audit_logs?: Array<Record<string, unknown>>;
}

export interface MockAdapter extends AuthDbAdapter {
  data: MockData;
  transactionLog: Array<{ action: 'begin' | 'commit' | 'rollback'; depth: number; timestamp: Date }>;
  addMockRefreshToken(token: MockRefreshToken): void;
  addMockEmailToken(token: MockEmailToken): void;
  getMockRefreshTokenByHash(hash: string): MockRefreshToken | undefined;
  clearMockData(): void;
}

// Sequence counters per table
const sequenceCounters: Record<string, number> = {
  auth_refresh_tokens_seq: 1000,
  email_tokens_seq: 1000,
  audit_logs_seq: 1000
};

function getNextSequence(table: string): number {
  const key = `${table}_seq`;
  sequenceCounters[key] = (sequenceCounters[key] || 1000) + 1;
  return sequenceCounters[key];
}

function resetSequenceCounter(table: string): void {
  const key = `${table}_seq`;
  sequenceCounters[key] = 1000;
}

// Parse simple WHERE clause conditions: WHERE col = ?
function parseWhereConditions(sql: string, params: unknown[]): { column: string; value: unknown; isNull?: boolean }[] {
  const conditions: { column: string; value: unknown; isNull?: boolean }[] = [];
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+FOR|\s*$)/i);
  
  if (!whereMatch) return conditions;
  
  const whereClause = whereMatch[1];
  // Match patterns like: column_name = ? or column_name IS NULL
  // Handle both parameterized and IS NULL conditions
  const conditionRegex = /(\w+)\s*(?:=\s*\?|IS\s+NULL)\s*/gi;
  let match;
  let paramIndex = 0;
  
  while ((match = conditionRegex.exec(whereClause)) !== null) {
    const isNull = match[0].toUpperCase().includes('IS NULL');
    conditions.push({
      column: match[1].toLowerCase(),
      value: isNull ? null : params[paramIndex],
      isNull: isNull || undefined
    });
    if (!isNull) paramIndex++;
  }
  
  return conditions;
}

// Filter data based on WHERE conditions
function filterByConditions<T>(rows: T[], conditions: { column: string; value: unknown; isNull?: boolean }[]): T[] {
  if (conditions.length === 0) return rows;
  
  return rows.filter(row => {
    return conditions.every(condition => {
      const rowAny = row as Record<string, unknown>;
      const rowValue = rowAny[condition.column];
      // Handle IS NULL conditions
      if (condition.isNull) {
        return rowValue === null;
      }
      // Handle LIKE pattern matching (basic support: % wildcard)
      if (typeof rowValue === 'string' && typeof condition.value === 'string') {
        if (condition.value.includes('%')) {
          const pattern = condition.value.replace(/%/g, '.*').toLowerCase();
          return new RegExp(`^${pattern}$`, 'i').test(rowValue);
        }
      }
      return rowValue === condition.value;
    });
  });
}

// Extract table name from SQL
function extractTableName(sql: string): string | null {
  // Match FROM table_name or JOIN table_name
  const fromMatch = sql.match(/from\s+(\w+)/i);
  if (fromMatch) return fromMatch[1].toLowerCase();
  
  const insertMatch = sql.match(/insert\s+into\s+(\w+)/i);
  if (insertMatch) return insertMatch[1].toLowerCase();
  
  const updateMatch = sql.match(/update\s+(\w+)/i);
  if (updateMatch) return updateMatch[1].toLowerCase();
  
  const deleteMatch = sql.match(/delete\s+from\s+(\w+)/i);
  if (deleteMatch) return deleteMatch[1].toLowerCase();
  
  return null;
}

export function createMockAdapter(data: MockData = {}): MockAdapter {
  const tables: MockData = { ...data };
  
  // Transaction state
  let transactionDepth = 0;
  const transactionLog: Array<{ action: 'begin' | 'commit' | 'rollback'; depth: number; timestamp: Date }> = [];
  
  const adapter: MockAdapter = {
    data: tables,
    transactionLog,
    
    addMockRefreshToken(token: MockRefreshToken): void {
      if (!tables.auth_refresh_tokens) tables.auth_refresh_tokens = [];
      tables.auth_refresh_tokens.push(token);
    },
    
    addMockEmailToken(token: MockEmailToken): void {
      if (!tables.email_tokens) tables.email_tokens = [];
      tables.email_tokens.push(token);
    },
    
    getMockRefreshTokenByHash(hash: string): MockRefreshToken | undefined {
      return (tables.auth_refresh_tokens || []).find(t => t.token_hash === hash);
    },
    
    clearMockData(): void {
      tables.users = [];
      tables.companies = [];
      tables.roles = [];
      tables.user_role_assignments = [];
      tables.module_roles = [];
      tables.outlets = [];
      tables.auth_refresh_tokens = [];
      tables.auth_login_throttles = [];
      tables.email_tokens = [];
      tables.auth_oauth_accounts = [];
      tables.audit_logs = [];
      
      // Reset sequence counters
      resetSequenceCounter('auth_refresh_tokens');
      resetSequenceCounter('email_tokens');
      resetSequenceCounter('audit_logs');
    },
    
    async queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
      const sqlLower = sql.toLowerCase();
      const tableName = extractTableName(sql);
      
      // Parse WHERE conditions for filtering
      const conditions = parseWhereConditions(sql, params);
      
      // Simple SQL table matching with filtering
      if (tableName === 'users' || (sqlLower.includes('join users') && !tableName)) {
        return filterByConditions((tables.users || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'companies' || (sqlLower.includes('join companies') && !tableName)) {
        return filterByConditions((tables.companies || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'roles' || (sqlLower.includes('join roles') && !tableName)) {
        return filterByConditions((tables.roles || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'user_role_assignments') {
        return filterByConditions((tables.user_role_assignments || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'module_roles') {
        return filterByConditions((tables.module_roles || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'outlets') {
        return filterByConditions((tables.outlets || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'auth_refresh_tokens') {
        return filterByConditions((tables.auth_refresh_tokens || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'auth_login_throttles') {
        return filterByConditions((tables.auth_login_throttles || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'email_tokens') {
        return filterByConditions((tables.email_tokens || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'auth_oauth_accounts') {
        return filterByConditions((tables.auth_oauth_accounts || []) as unknown as T[], conditions) as T[];
      }
      
      if (tableName === 'audit_logs') {
        return filterByConditions((tables.audit_logs || []) as unknown as T[], conditions) as T[];
      }
      
      return [] as T[];
    },
    
    async execute(sql: string, params: unknown[]): Promise<{ insertId?: number | bigint; affectedRows?: number }> {
      const sqlLower = sql.toLowerCase();
      
      // Track inserted data in mock tables with sequential IDs
      if (sqlLower.includes('insert into auth_refresh_tokens')) {
        // SQL varies based on whether rotated_from_id is included:
        // - issue(): INSERT (company_id, user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)
        // - rotate(): INSERT (company_id, user_id, token_hash, expires_at, rotated_from_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)
        const hasRotatedFromId = sqlLower.includes('rotated_from_id');
        const newToken: MockRefreshToken = {
          id: getNextSequence('auth_refresh_tokens'),
          company_id: params[0] as number,
          user_id: params[1] as number,
          token_hash: params[2] as string,
          expires_at: params[3] as Date,
          revoked_at: null,
          rotated_from_id: hasRotatedFromId ? (params[4] as number | null || null) : null,
          ip_address: (hasRotatedFromId ? params[5] : params[4]) as string | null || null,
          user_agent: (hasRotatedFromId ? params[6] : params[5]) as string | null || null
        };
        if (!tables.auth_refresh_tokens) tables.auth_refresh_tokens = [];
        tables.auth_refresh_tokens.push(newToken);
        return { insertId: newToken.id, affectedRows: 1 };
      }
      
      if (sqlLower.includes('insert into email_tokens')) {
        const newToken: MockEmailToken = {
          id: getNextSequence('email_tokens'),
          company_id: params[0] as number,
          user_id: params[1] as number,
          email: params[2] as string,
          token_hash: params[3] as string,
          type: params[4] as string,
          expires_at: params[5] as Date,
          used_at: null,
          created_by: params[6] as number
        };
        if (!tables.email_tokens) tables.email_tokens = [];
        tables.email_tokens.push(newToken);
        return { insertId: newToken.id, affectedRows: 1 };
      }
      
      if (sqlLower.includes('insert into audit_logs')) {
        const newLog = { id: getNextSequence('audit_logs'), ...params };
        if (!tables.audit_logs) tables.audit_logs = [];
        tables.audit_logs.push(newLog);
        return { insertId: newLog.id as number, affectedRows: 1 };
      }
      
      // Handle UPDATE for auth_refresh_tokens (e.g., revocation)
      if (sqlLower.includes('update auth_refresh_tokens')) {
        // Pass all params - IS NULL conditions don't consume params
        const conditions = parseWhereConditions(sql, params);
        const tokens = tables.auth_refresh_tokens || [];
        let affectedRows = 0;
        
        tokens.forEach(token => {
          const matches = conditions.every(c => {
            const rowValue = token[c.column as keyof MockRefreshToken];
            if (c.isNull) {
              return rowValue === null;
            }
            return rowValue === c.value;
          });
          if (matches) {
            // Apply SET clause (simplified - just set revoked_at if present in params)
            if (sqlLower.includes('revoked_at')) {
              token.revoked_at = new Date();
              affectedRows++;
            }
          }
        });
        
        return { affectedRows };
      }
      
      // Handle UPDATE for email_tokens (e.g., marking as used)
      if (sqlLower.includes('update email_tokens')) {
        const conditions = parseWhereConditions(sql, params);
        const tokens = tables.email_tokens || [];
        let affectedRows = 0;
        
        tokens.forEach(token => {
          // First check parameterized conditions
          const paramMatches = conditions.every(c => token[c.column as keyof MockEmailToken] === c.value);
          
          // Check non-parameterized conditions
          const usedAtIsNull = sqlLower.includes('used_at is null') ? token.used_at === null : true;
          const notExpired = !sqlLower.includes('expires_at > now()') || token.expires_at > new Date();
          
          if (paramMatches && usedAtIsNull && notExpired) {
            if (sqlLower.includes('used_at =') || sqlLower.includes('used_at=')) {
              token.used_at = new Date();
              affectedRows++;
            }
          }
        });
        
        return { affectedRows };
      }
      
      // Handle UPDATE for auth_login_throttles
      if (sqlLower.includes('update auth_login_throttles')) {
        const throttles = tables.auth_login_throttles || [];
        let affectedRows = 0;
        
        throttles.forEach(throttle => {
          if (sqlLower.includes('failure_count')) {
            throttle.failure_count++;
            throttle.last_failed_at = new Date();
            affectedRows++;
          }
        });
        
        return { affectedRows };
      }
      
      // Handle INSERT for auth_login_throttles (with ON DUPLICATE KEY UPDATE)
      if (sqlLower.includes('insert into auth_login_throttles')) {
        if (!tables.auth_login_throttles) tables.auth_login_throttles = [];
        
        // Handle multiple key entries (each entry has 4 params: key_hash, ip, user_agent, ip, user_agent)
        // For ON DUPLICATE KEY UPDATE: check if entry exists and update, otherwise insert
        for (let i = 0; i < params.length; i += 4) {
          const keyHash = params[i] as string;
          const lastIp = params[i + 1] as string | null;
          const lastUserAgent = params[i + 2] as string | null;
          
          const existingIndex = tables.auth_login_throttles.findIndex(t => t.key_hash === keyHash);
          
          if (existingIndex >= 0) {
            // Update existing entry (ON DUPLICATE KEY UPDATE behavior)
            tables.auth_login_throttles[existingIndex].failure_count++;
            tables.auth_login_throttles[existingIndex].last_failed_at = new Date();
            tables.auth_login_throttles[existingIndex].last_ip = lastIp;
            tables.auth_login_throttles[existingIndex].last_user_agent = lastUserAgent;
          } else {
            // Insert new entry
            const newThrottle: MockLoginThrottle = {
              key_hash: keyHash,
              failure_count: 1,
              last_failed_at: new Date(),
              last_ip: lastIp,
              last_user_agent: lastUserAgent
            };
            tables.auth_login_throttles.push(newThrottle);
          }
        }
        return { insertId: 0, affectedRows: 1 };
      }
      
      // Handle DELETE for auth_login_throttles (recordSuccess clears throttle)
      if (sqlLower.includes('delete from auth_login_throttles')) {
        const throttles = tables.auth_login_throttles || [];
        const keyHashes = params as string[];
        let affectedRows = 0;
        
        tables.auth_login_throttles = throttles.filter(t => {
          const shouldDelete = keyHashes.includes(t.key_hash);
          if (shouldDelete) affectedRows++;
          return !shouldDelete;
        });
        
        return { affectedRows };
      }
      
      return { insertId: Math.floor(Math.random() * 1000), affectedRows: 1 };
    },
    
    async transaction<T>(fn: (adapter: AuthDbAdapter) => Promise<T>): Promise<T> {
      transactionDepth++;
      transactionLog.push({ action: 'begin', depth: transactionDepth, timestamp: new Date() });
      
      try {
        const result = await fn(adapter);
        transactionLog.push({ action: 'commit', depth: transactionDepth, timestamp: new Date() });
        transactionDepth--;
        return result;
      } catch (error) {
        transactionLog.push({ action: 'rollback', depth: transactionDepth, timestamp: new Date() });
        transactionDepth--;
        throw error;
      }
    }
  };
  
  return adapter;
}

/**
 * Test configuration for @jurnapod/auth
 */
export const testConfig: AuthConfig = {
  tokens: {
    accessTokenSecret: testEnv.tokens.accessTokenSecret,
    accessTokenTtlSeconds: testEnv.tokens.accessTokenTtlSeconds,
    refreshTokenSecret: testEnv.tokens.refreshTokenSecret,
    refreshTokenTtlSeconds: testEnv.tokens.refreshTokenTtlSeconds,
    issuer: testEnv.tokens.issuer || undefined,
    audience: testEnv.tokens.audience || undefined,
  },
  password: {
    defaultAlgorithm: testEnv.password.defaultAlgorithm,
    bcryptRounds: testEnv.password.bcryptRounds,
    argon2MemoryKb: testEnv.password.argon2MemoryKb,
    argon2TimeCost: testEnv.password.argon2TimeCost,
    argon2Parallelism: testEnv.password.argon2Parallelism,
    rehashOnLogin: testEnv.password.rehashOnLogin,
  },
  throttle: {
    baseDelayMs: testEnv.throttle.baseDelayMs,
    maxDelayMs: testEnv.throttle.maxDelayMs,
  },
  emailTokens: {
    passwordResetTtlMinutes: testEnv.emailTokens.passwordResetTtlMinutes,
    inviteTtlMinutes: testEnv.emailTokens.inviteTtlMinutes,
    verifyEmailTtlMinutes: testEnv.emailTokens.verifyEmailTtlMinutes,
  },
};
