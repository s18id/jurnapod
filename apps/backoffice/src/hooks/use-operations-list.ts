// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";

export const OPERATIONS_DEFAULT_LIMIT = 20;
export const OPERATIONS_LIST_REFETCH_MS = 10_000;

export const OPERATION_LIST_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export const OPERATION_LIST_TYPES = ["import", "export", "batch_update"] as const;

export type OperationListStatus = (typeof OPERATION_LIST_STATUSES)[number];
export type OperationListType = (typeof OPERATION_LIST_TYPES)[number];

export interface OperationListItem {
  operationId: string;
  type: OperationListType;
  total: number;
  completed: number;
  percentage: number;
  status: OperationListStatus;
  etaSeconds: number | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface OperationsListParams {
  status?: OperationListStatus;
  type?: OperationListType;
  limit: number;
  offset: number;
}

export interface OperationsListResult {
  operations: OperationListItem[];
  total: number;
  limit: number;
  offset: number;
}

type OperationsListEnvelope = {
  success: true;
  data: OperationsListResult;
};

export const operationsListQueryKeys = {
  all: ["operations"] as const,
  list: (params: OperationsListParams) => ["operations", "list", params] as const,
};

function isSupportedStatus(value: unknown): value is OperationListStatus {
  return typeof value === "string" && (OPERATION_LIST_STATUSES as readonly string[]).includes(value);
}

function isSupportedType(value: unknown): value is OperationListType {
  return typeof value === "string" && (OPERATION_LIST_TYPES as readonly string[]).includes(value);
}

export function isSupportedOperationListStatus(value: unknown): value is OperationListStatus {
  return isSupportedStatus(value);
}

export function isSupportedOperationListType(value: unknown): value is OperationListType {
  return isSupportedType(value);
}

export function buildOperationsSearchParams(params: OperationsListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));

  if (params.status) searchParams.set("status", params.status);
  if (params.type) searchParams.set("type", params.type);

  return searchParams;
}

export function parseOperationListItem(value: unknown): OperationListItem | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  if (
    typeof record.operationId !== "string" ||
    !isSupportedType(record.type) ||
    typeof record.total !== "number" ||
    typeof record.completed !== "number" ||
    typeof record.percentage !== "number" ||
    !isSupportedStatus(record.status) ||
    (record.etaSeconds !== null && typeof record.etaSeconds !== "number") ||
    typeof record.startedAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    (record.completedAt !== null && typeof record.completedAt !== "string")
  ) {
    return null;
  }

  return {
    operationId: record.operationId,
    type: record.type,
    total: record.total,
    completed: record.completed,
    percentage: record.percentage,
    status: record.status,
    etaSeconds: record.etaSeconds,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  };
}

export function normalizeOperationsListResponse(
  payload: OperationsListEnvelope,
  params: OperationsListParams,
): OperationsListResult {
  const operations = Array.isArray(payload.data.operations)
    ? payload.data.operations.map(parseOperationListItem).filter((item): item is OperationListItem => item !== null)
    : [];

  return {
    operations,
    total: typeof payload.data.total === "number" ? payload.data.total : operations.length,
    limit: typeof payload.data.limit === "number" ? payload.data.limit : params.limit,
    offset: typeof payload.data.offset === "number" ? payload.data.offset : params.offset,
  };
}

export function getOperationsListRefetchInterval(
  data: OperationsListResult | undefined,
  options: { refetchInterval?: number | false } = {},
): number | false {
  if (options.refetchInterval !== undefined) return options.refetchInterval;
  return data?.operations.some((operation) => operation.status === "running") ? OPERATIONS_LIST_REFETCH_MS : false;
}

export async function fetchOperationsList(params: OperationsListParams): Promise<OperationsListResult> {
  const query = buildOperationsSearchParams(params).toString();
  const payload = await apiRequest<OperationsListEnvelope>(`/operations?${query}`);
  return normalizeOperationsListResponse(payload, params);
}

export function useOperationsList(
  params: OperationsListParams,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: operationsListQueryKeys.list(params),
    queryFn: () => fetchOperationsList(params),
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) => getOperationsListRefetchInterval(query.state.data, options),
  });
}
