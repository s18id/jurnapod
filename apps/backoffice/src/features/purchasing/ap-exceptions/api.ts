// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { ApExceptionResponseSchema } from "@jurnapod/shared";

import { apiRequest } from "@/lib/api-client";

import type {
  ApException,
  ApExceptionAssignInput,
  ApExceptionResolveInput,
  ApExceptionWorklistParams,
  ApExceptionWorklistResult,
} from "./types";

export const AP_EXCEPTIONS_API_BASE = "/accounting/ap-exceptions";
export const AP_EXCEPTIONS_DEFAULT_LIMIT = 20;

const ApExceptionWorklistResultSchema = z.object({
  exceptions: z.array(ApExceptionResponseSchema),
  total: z.number().int().nonnegative(),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

const ApExceptionWorklistEnvelopeSchema = z.object({
  success: z.literal(true),
  data: ApExceptionWorklistResultSchema,
});

const ApExceptionEnvelopeSchema = z.object({
  success: z.literal(true),
  data: ApExceptionResponseSchema,
});

function normalizeOptionalQueryValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildApExceptionWorklistSearchParams(params: ApExceptionWorklistParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));

  if (params.type) searchParams.set("type", params.type);
  if (params.status) searchParams.set("status", params.status);

  const supplierId = normalizeOptionalQueryValue(params.supplier_id);
  if (supplierId) searchParams.set("supplier_id", supplierId);

  const search = normalizeOptionalQueryValue(params.search);
  if (search) searchParams.set("search", search);

  const cursor = normalizeOptionalQueryValue(params.cursor);
  if (cursor) searchParams.set("cursor", cursor);

  return searchParams;
}

export const apExceptionQueryKeys = {
  all: ["purchasing", "ap-exceptions"] as const,
  list: (params: ApExceptionWorklistParams) => ["purchasing", "ap-exceptions", "worklist", params] as const,
};

export async function fetchApExceptionWorklist(params: ApExceptionWorklistParams): Promise<ApExceptionWorklistResult> {
  const query = buildApExceptionWorklistSearchParams(params).toString();
  const response = await apiRequest<unknown>(`${AP_EXCEPTIONS_API_BASE}/worklist?${query}`);
  return ApExceptionWorklistEnvelopeSchema.parse(response).data;
}

export async function assignApException(input: ApExceptionAssignInput): Promise<ApException> {
  const response = await apiRequest<unknown>(`${AP_EXCEPTIONS_API_BASE}/${input.exceptionId}/assign`, {
    method: "PUT",
    body: JSON.stringify({ assigned_to_user_id: input.assignedToUserId }),
  });
  return ApExceptionEnvelopeSchema.parse(response).data;
}

export async function resolveApException(input: ApExceptionResolveInput): Promise<ApException> {
  const response = await apiRequest<unknown>(`${AP_EXCEPTIONS_API_BASE}/${input.exceptionId}/resolve`, {
    method: "PUT",
    body: JSON.stringify({
      status: input.status,
      resolution_note: input.resolutionNote.trim(),
    }),
  });
  return ApExceptionEnvelopeSchema.parse(response).data;
}

export function useApExceptionWorklistQuery(params: ApExceptionWorklistParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: apExceptionQueryKeys.list(params),
    queryFn: () => fetchApExceptionWorklist(params),
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function useAssignApExceptionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assignApException,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apExceptionQueryKeys.all });
    },
  });
}

export function useResolveApExceptionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveApException,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apExceptionQueryKeys.all });
    },
  });
}
