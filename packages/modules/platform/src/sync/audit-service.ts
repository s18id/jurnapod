// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export interface SyncAuditEvent {
  id?: bigint;
  companyId: number;
  outletId?: number;
  operationType: "PUSH" | "PULL" | "VERSION_BUMP" | "HEALTH_CHECK";
  tierName: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL" | "IN_PROGRESS";
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  itemsCount?: number;
  versionBefore?: bigint;
  versionAfter?: bigint;
  errorCode?: string;
  errorMessage?: string;
  clientDeviceId?: string;
  clientVersion?: string;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
}

export interface AuditQuery {
  companyId?: number;
  outletId?: number;
  operationType?: string;
  tierName?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface StatsResult {
  totalOperations: number;
  successRate: number;
  avgDurationMs: number;
  operationsByType: Record<string, number>;
  operationsByStatus: Record<string, number>;
}

/**
 * Database client interface for dependency injection
 * This allows the service to work with any database pool implementation
 */
export interface AuditDbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(
    sql: string,
    params?: unknown[]
  ): Promise<{ affectedRows: number; insertId?: number }>;
  getConnection?(): Promise<{
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    execute(
      sql: string,
      params?: unknown[]
    ): Promise<{ affectedRows: number; insertId?: number }>;
    release(): void;
  }>;
}

interface SyncAuditEventRow {
  id: bigint;
  company_id: number;
  outlet_id: number | null;
  operation_type: string;
  tier_name: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  items_count: number | null;
  version_before: bigint | null;
  version_after: bigint | null;
  error_code: string | null;
  error_message: string | null;
  client_device_id: string | null;
  client_version: string | null;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
}

interface CountRow {
  total: number;
}

interface AvgDurationRow {
  avg_duration: number | null;
}

interface OperationTypeRow {
  operation_type: string;
  count: number;
}

interface StatusRow {
  status: string;
  count: number;
}

export class SyncAuditService {
  constructor(private readonly db: AuditDbClient) {}

  async startEvent(event: Omit<SyncAuditEvent, "id">): Promise<bigint> {
    const sql = `
      INSERT INTO sync_audit_events (
        company_id, outlet_id, operation_type, tier_name, status,
        started_at, items_count, version_before, version_after,
        error_code, error_message, client_device_id, client_version,
        request_size_bytes, response_size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      event.companyId,
      event.outletId ?? null,
      event.operationType,
      event.tierName,
      "IN_PROGRESS",
      event.startedAt,
      event.itemsCount ?? null,
      event.versionBefore ?? null,
      event.versionAfter ?? null,
      event.errorCode ?? null,
      event.errorMessage ?? null,
      event.clientDeviceId ?? null,
      event.clientVersion ?? null,
      event.requestSizeBytes ?? null,
      event.responseSizeBytes ?? null,
    ];

    const result = await this.db.execute(sql, values);
    return BigInt(result.insertId ?? 0);
  }

  async completeEvent(
    eventId: bigint,
    updates: Partial<SyncAuditEvent>
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }

    if (updates.completedAt !== undefined) {
      setClauses.push("completed_at = ?");
      values.push(updates.completedAt);
    }

    if (updates.durationMs !== undefined) {
      setClauses.push("duration_ms = ?");
      values.push(updates.durationMs);
    }

    if (updates.itemsCount !== undefined) {
      setClauses.push("items_count = ?");
      values.push(updates.itemsCount);
    }

    if (updates.versionAfter !== undefined) {
      setClauses.push("version_after = ?");
      values.push(Number(updates.versionAfter));
    }

    if (updates.errorCode !== undefined) {
      setClauses.push("error_code = ?");
      values.push(updates.errorCode);
    }

    if (updates.errorMessage !== undefined) {
      setClauses.push("error_message = ?");
      values.push(updates.errorMessage);
    }

    if (updates.responseSizeBytes !== undefined) {
      setClauses.push("response_size_bytes = ?");
      values.push(updates.responseSizeBytes);
    }

    if (setClauses.length === 0) {
      return;
    }

    const sql = `UPDATE sync_audit_events SET ${setClauses.join(", ")} WHERE id = ?`;
    values.push(Number(eventId));

    await this.db.execute(sql, values);
  }

  async logEvent(event: SyncAuditEvent): Promise<bigint> {
    const sql = `
      INSERT INTO sync_audit_events (
        company_id, outlet_id, operation_type, tier_name, status,
        started_at, completed_at, duration_ms, items_count,
        version_before, version_after, error_code, error_message,
        client_device_id, client_version, request_size_bytes, response_size_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      event.companyId,
      event.outletId ?? null,
      event.operationType,
      event.tierName,
      event.status,
      event.startedAt,
      event.completedAt ?? null,
      event.durationMs ?? null,
      event.itemsCount ?? null,
      event.versionBefore ?? null,
      event.versionAfter ?? null,
      event.errorCode ?? null,
      event.errorMessage ?? null,
      event.clientDeviceId ?? null,
      event.clientVersion ?? null,
      event.requestSizeBytes ?? null,
      event.responseSizeBytes ?? null,
    ];

    const result = await this.db.execute(sql, values);
    return BigInt(result.insertId ?? 0);
  }

  async queryEvents(
    query: AuditQuery
  ): Promise<{ events: SyncAuditEvent[]; total: number }> {
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (query.companyId !== undefined) {
      whereClauses.push("company_id = ?");
      values.push(query.companyId);
    }

    if (query.outletId !== undefined) {
      whereClauses.push("outlet_id = ?");
      values.push(query.outletId);
    }

    if (query.operationType !== undefined) {
      whereClauses.push("operation_type = ?");
      values.push(query.operationType);
    }

    if (query.tierName !== undefined) {
      whereClauses.push("tier_name = ?");
      values.push(query.tierName);
    }

    if (query.status !== undefined) {
      whereClauses.push("status = ?");
      values.push(query.status);
    }

    if (query.startDate !== undefined) {
      whereClauses.push("started_at >= ?");
      values.push(query.startDate);
    }

    if (query.endDate !== undefined) {
      whereClauses.push("started_at <= ?");
      values.push(query.endDate);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) as total FROM sync_audit_events ${whereClause}`;
    const countResult = await this.db.query<CountRow>(countSql, values);
    const total = countResult[0]?.total ?? 0;

    let dataSql = `
      SELECT 
        id, company_id, outlet_id, operation_type, tier_name, status,
        started_at, completed_at, duration_ms, items_count,
        version_before, version_after, error_code, error_message,
        client_device_id, client_version, request_size_bytes, response_size_bytes
      FROM sync_audit_events
      ${whereClause}
      ORDER BY started_at DESC
    `;

    const dataValues: unknown[] = [...values];

    if (query.limit !== undefined) {
      dataSql += " LIMIT ?";
      dataValues.push(query.limit);
    }

    if (query.offset !== undefined) {
      dataSql += " OFFSET ?";
      dataValues.push(query.offset);
    }

    const rows = await this.db.query<SyncAuditEventRow>(dataSql, dataValues);

    const events: SyncAuditEvent[] = rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      outletId: row.outlet_id ?? undefined,
      operationType: row.operation_type as SyncAuditEvent["operationType"],
      tierName: row.tier_name,
      status: row.status as SyncAuditEvent["status"],
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      itemsCount: row.items_count ?? undefined,
      versionBefore: row.version_before ?? undefined,
      versionAfter: row.version_after ?? undefined,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
      clientDeviceId: row.client_device_id ?? undefined,
      clientVersion: row.client_version ?? undefined,
      requestSizeBytes: row.request_size_bytes ?? undefined,
      responseSizeBytes: row.response_size_bytes ?? undefined,
    }));

    return { events, total };
  }

  async getStats(
    companyId: number,
    startDate: Date,
    endDate: Date
  ): Promise<StatsResult> {
    const baseWhere = "WHERE company_id = ? AND started_at >= ? AND started_at <= ?";
    const baseValues = [companyId, startDate, endDate];

    const totalSql = `SELECT COUNT(*) as total FROM sync_audit_events ${baseWhere}`;
    const totalResult = await this.db.query<CountRow>(totalSql, baseValues);
    const totalOperations = totalResult[0]?.total ?? 0;

    const successSql = `${totalSql} AND status = 'SUCCESS'`;
    const successResult = await this.db.query<CountRow>(successSql, baseValues);
    const successCount = successResult[0]?.total ?? 0;
    const successRate =
      totalOperations > 0 ? (successCount / totalOperations) * 100 : 0;

    const durationSql = `
      SELECT AVG(duration_ms) as avg_duration 
      FROM sync_audit_events 
      ${baseWhere} 
      AND duration_ms IS NOT NULL
    `;
    const durationResult = await this.db.query<AvgDurationRow>(
      durationSql,
      baseValues
    );
    const avgDurationMs = durationResult[0]?.avg_duration ?? 0;

    const typeSql = `
      SELECT operation_type, COUNT(*) as count 
      FROM sync_audit_events 
      ${baseWhere} 
      GROUP BY operation_type
    `;
    const typeResult = await this.db.query<OperationTypeRow>(
      typeSql,
      baseValues
    );
    const operationsByType: Record<string, number> = {};
    for (const row of typeResult) {
      operationsByType[row.operation_type] = row.count;
    }

    const statusSql = `
      SELECT status, COUNT(*) as count 
      FROM sync_audit_events 
      ${baseWhere} 
      GROUP BY status
    `;
    const statusResult = await this.db.query<StatusRow>(statusSql, baseValues);
    const operationsByStatus: Record<string, number> = {};
    for (const row of statusResult) {
      operationsByStatus[row.status] = row.count;
    }

    return {
      totalOperations,
      successRate: Math.round(successRate * 100) / 100,
      avgDurationMs: Math.round(avgDurationMs * 100) / 100,
      operationsByType,
      operationsByStatus,
    };
  }

  async archiveEvents(olderThanDays: number): Promise<number> {
    if (!this.db.getConnection) {
      throw new Error(
        "Database client does not support transactions. Cannot archive events."
      );
    }

    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      const insertSql = `
        INSERT INTO sync_audit_events_archive (
          id, company_id, outlet_id, operation_type, tier_name, status,
          started_at, completed_at, duration_ms, items_count,
          version_before, version_after, error_code, error_message,
          client_device_id, client_version, request_size_bytes, response_size_bytes,
          created_at, archived_at
        )
        SELECT 
          id, company_id, outlet_id, operation_type, tier_name, status,
          started_at, completed_at, duration_ms, items_count,
          version_before, version_after, error_code, error_message,
          client_device_id, client_version, request_size_bytes, response_size_bytes,
          created_at, NOW()
        FROM sync_audit_events
        WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      `;

      const insertResult = await connection.execute(insertSql, [olderThanDays]);
      const archivedCount = insertResult.affectedRows;

      if (archivedCount > 0) {
        const deleteSql = `
          DELETE FROM sync_audit_events
          WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        `;
        await connection.execute(deleteSql, [olderThanDays]);
      }

      await connection.commit();
      return archivedCount;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

// Lazy-loaded database pool - initialized on first use
// Import dynamically to avoid circular dependencies at module load time
// This will resolve correctly when running in the API app context
function getDbPool() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDbPool: getPool } = require("@/lib/db");
  return getPool();
}

/**
 * Adapter to convert mysql2/promise Pool to AuditDbClient interface
 */
function createDbClientAdapter(pool: unknown): AuditDbClient {
  const p = pool as {
    query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(
      sql: string,
      params?: unknown[]
    ): Promise<{ affectedRows: number; insertId?: number }>;
    getConnection(): Promise<{
      beginTransaction(): Promise<void>;
      commit(): Promise<void>;
      rollback(): Promise<void>;
      execute(
        sql: string,
        params?: unknown[]
      ): Promise<{ affectedRows: number; insertId?: number }>;
      release(): void;
    }>;
  };

  return {
    query: (sql, params) => p.query(sql, params),
    execute: (sql, params) => p.execute(sql, params),
    getConnection: () => p.getConnection(),
  };
}

/**
 * Singleton instance of the sync audit service
 * Lazily initializes with database pool on first access
 */
let _syncAuditService: SyncAuditService | undefined;

/**
 * Get the singleton instance of SyncAuditService
 * Creates the instance on first call using the database pool
 */
export function getSyncAuditService(): SyncAuditService {
  if (!_syncAuditService) {
    const pool = getDbPool();
    _syncAuditService = new SyncAuditService(createDbClientAdapter(pool));
  }
  return _syncAuditService;
}

/**
 * Singleton instance export (legacy compatibility)
 * Prefer using getSyncAuditService() for explicit initialization
 */
export const syncAuditService = {
  startEvent: (event: Omit<SyncAuditEvent, "id">) =>
    getSyncAuditService().startEvent(event),
  completeEvent: (eventId: bigint, updates: Partial<SyncAuditEvent>) =>
    getSyncAuditService().completeEvent(eventId, updates),
  logEvent: (event: SyncAuditEvent) => getSyncAuditService().logEvent(event),
  queryEvents: (query: AuditQuery) => getSyncAuditService().queryEvents(query),
  getStats: (companyId: number, startDate: Date, endDate: Date) =>
    getSyncAuditService().getStats(companyId, startDate, endDate),
  archiveEvents: (olderThanDays: number) =>
    getSyncAuditService().archiveEvents(olderThanDays),
};

export default SyncAuditService;
