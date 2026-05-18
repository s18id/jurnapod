// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useQuery } from "@tanstack/react-query";

import { fetchAuditLogs, auditQueryKeys } from "@/features/audit/api";
import type { AuditFilterInput } from "@/features/audit/audit-helpers";

export type AuditEntityLogFilters = {
  objectType: string;
  objectId: string;
  companyId: number;
  action?: string;
  actorUserId?: number;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
};

export function buildAuditEntityFilter(input: AuditEntityLogFilters): AuditFilterInput {
  return {
    objectType: input.objectType,
    entityId: input.objectId,
    companyId: input.companyId,
    action: input.action,
    actorUserId: input.actorUserId,
    startDate: input.startDate,
    endDate: input.endDate,
    limit: input.limit ?? 25,
    offset: input.offset ?? 0,
  };
}

export function useAuditEntityLog(filters: AuditEntityLogFilters) {
  const auditFilter = buildAuditEntityFilter(filters);

  return useQuery({
    queryKey: auditQueryKeys.list(filters.companyId, auditFilter),
    queryFn: () => fetchAuditLogs(auditFilter),
    enabled: filters.companyId > 0 && filters.objectType.length > 0 && filters.objectId.length > 0,
  });
}
