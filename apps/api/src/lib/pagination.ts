// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RowDataPacket } from "mysql2";

export type PaginationParams = {
  limit: number;
  offset: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ListQueryParams = {
  limit?: number;
  offset?: number;
  page?: number;
  page_size?: number;
};

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const ALLOWED_PAGE_SIZES = [10, 25, 50, 100, 200] as const;

export function parsePagination(query: ListQueryParams): PaginationParams {
  // Support page_size for explicit page size
  const pageSize = query.page_size
    ? Math.min(Math.max(1, Number(query.page_size)), MAX_PAGE_SIZE)
    : Math.min(Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  // Support explicit page number (1-indexed)
  let offset: number;
  if (query.page !== undefined) {
    offset = Math.max(0, (Number(query.page) - 1) * pageSize);
  } else {
    offset = Math.max(0, Number(query.offset) || 0);
  }

  return { limit: pageSize, offset };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  pageSize: number
): PaginatedResult<T> {
  const page = Math.ceil(
    data.length > 0 ? (Number(offsetFromPage(total, pageSize, data.length)) + 1) : 1
  );
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

function offsetFromPage(total: number, pageSize: number, returnedCount: number): number {
  if (returnedCount === 0) return 0;
  const currentPageItems = total % pageSize;
  const fullPages = total - currentPageItems;
  return fullPages + returnedCount;
}

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

export function buildPaginationMeta(total: number, pageSize: number, offset: number) {
  const page = Math.floor(offset / pageSize) + 1;
  return {
    total,
    page_size: pageSize,
    offset,
    page,
    total_pages: Math.ceil(total / pageSize),
    has_next: offset + pageSize < total,
    has_prev: offset > 0
  };
}
