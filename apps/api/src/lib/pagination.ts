// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Pagination adapter — re-exports pure utilities from @jurnapod/shared,
 * keeping DB-dependent `executePaginatedQuery` local.
 */

import type { RowDataPacket } from "mysql2";

// Re-export pure functions from shared
export {
  parsePagination,
  buildPaginatedResponse,
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ALLOWED_PAGE_SIZES,
  type PaginationParams,
  type PaginatedResult,
  type ListQueryParams,
} from '@jurnapod/shared';

/**
 * Execute a paginated query with a separate count query.
 * DB-dependent — kept in API layer.
 */
export async function executePaginatedQuery<T extends RowDataPacket[]>(
  pool: any,
  countSql: string,
  countParams: any[],
  dataSql: string,
  dataParams: any[]
): Promise<{ data: T; total: number }> {
  // Get total count
  const [countRows] = await pool.execute(countSql, countParams);
  const total = Number((countRows as RowDataPacket[])[0]?.total ?? 0);

  // Get paginated data
  const [rows] = await pool.execute(dataSql, dataParams);

  return { data: rows as T, total };
}
