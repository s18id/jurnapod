// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { AuditLogResponse } from "@jurnapod/shared";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";

import {
  AUDIT_DEFAULT_PAGE_SIZE,
  buildAuditQueryKey,
  buildAuditSearchParams,
  type AuditFilterInput,
} from "./audit-helpers";

export type AuditLogRecord = AuditLogResponse;

export interface AuditLogListResponse {
  success: true;
  data: {
    total: number;
    logs: AuditLogRecord[];
    limit: number;
    offset: number;
  };
}

export interface AuditLogDetailResponse {
  success: true;
  data: AuditLogRecord;
}

export const auditQueryKeys = {
  list: (companyId: number, filters: AuditFilterInput) => buildAuditQueryKey(companyId, filters),
  detail: (companyId: number, id: number | null) => ["audit-logs", companyId, "detail", id ?? "none"] as const,
} as const;

export async function fetchAuditLogs(filters: AuditFilterInput): Promise<AuditLogListResponse["data"]> {
  const normalizedFilters: AuditFilterInput = {
    ...filters,
    limit: filters.limit ?? AUDIT_DEFAULT_PAGE_SIZE,
    offset: filters.offset ?? 0,
  };
  const params = buildAuditSearchParams(normalizedFilters);
  const response = await apiRequest<AuditLogListResponse>(`/audit-logs?${params.toString()}`);
  return response.data;
}

export async function fetchAuditLogDetail(id: number): Promise<AuditLogRecord> {
  const response = await apiRequest<AuditLogDetailResponse>(`/audit-logs/${id}`);
  return response.data;
}

export function useAuditLogList(companyId: number, filters: AuditFilterInput) {
  return useQuery({
    queryKey: auditQueryKeys.list(companyId, filters),
    queryFn: () => fetchAuditLogs(filters),
  });
}

export function useAuditLogDetail(companyId: number, id: number | null) {
  return useQuery({
    queryKey: auditQueryKeys.detail(companyId, id),
    queryFn: () => fetchAuditLogDetail(id as number),
    enabled: id !== null,
  });
}
