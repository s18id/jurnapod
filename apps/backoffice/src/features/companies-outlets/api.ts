// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  CompanyCreateRequest,
  CompanyResponse,
  CompanyUpdateRequest,
  OutletCreateRequest,
  OutletFullResponse,
  OutletUpdateRequest,
} from "@jurnapod/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { detailQueryKey, listQueryKey, resourceQueryKeyPrefix } from "@/lib/cache/query-keys";

export type CompanyAdminRecord = CompanyResponse & { is_active?: boolean };
export type OutletAdminRecord = OutletFullResponse;

export const companyQueryKeys = {
  all: resourceQueryKeyPrefix("platform", "companies"),
  list: () => listQueryKey("platform", "companies"),
  detail: (id: number) => detailQueryKey("platform", "companies", id),
} as const;

export const outletQueryKeys = {
  all: resourceQueryKeyPrefix("platform", "outlets"),
  list: (companyId: number) => listQueryKey("platform", "outlets", { companyId }),
  detail: (id: number) => detailQueryKey("platform", "outlets", id),
} as const;

function normalizeApiFailure(response: Response, error: unknown, fallback: string): ApiError {
  const maybeError = error as { error?: { code?: string; message?: string }; message?: string } | undefined;
  const code = maybeError?.error?.code ?? "API_ERROR";
  const message = maybeError?.error?.message ?? maybeError?.message ?? fallback;
  return new ApiError(response.status, code, message);
}

function requireData<T>(value: T | undefined, fallback: string): T {
  if (value === undefined) {
    throw new ApiError(500, "MISSING_RESPONSE_DATA", fallback);
  }
  return value;
}

export async function fetchCompanies(): Promise<CompanyAdminRecord[]> {
  const { data, error, response } = await api.GET("/companies");
  if (error) throw normalizeApiFailure(response, error, "Failed to load companies");
  return requireData(data?.data as CompanyAdminRecord[] | undefined, "Missing companies response");
}

export async function fetchCompany(companyId: number): Promise<CompanyAdminRecord> {
  const { data, error, response } = await api.GET("/companies/{id}", {
    params: { path: { id: String(companyId) } },
  });
  if (error) throw normalizeApiFailure(response, error, "Failed to load company");
  return requireData(data?.data as CompanyAdminRecord | undefined, "Missing company response");
}

export async function createCompanyAdmin(input: CompanyCreateRequest): Promise<CompanyAdminRecord> {
  const { data, error, response } = await api.POST("/companies", { body: input });
  if (error) throw normalizeApiFailure(response, error, "Failed to create company");
  return requireData(data?.data as CompanyAdminRecord | undefined, "Missing created company response");
}

export async function updateCompanyAdmin(input: {
  id: number;
  patch: CompanyUpdateRequest;
}): Promise<CompanyAdminRecord> {
  const { data, error, response } = await api.PATCH("/companies/{id}", {
    params: { path: { id: String(input.id) } },
    body: input.patch,
  });
  if (error) throw normalizeApiFailure(response, error, "Failed to update company");
  return requireData(data?.data as CompanyAdminRecord | undefined, "Missing updated company response");
}

export async function fetchOutlets(): Promise<OutletAdminRecord[]> {
  const { data, error, response } = await api.GET("/outlets");
  if (error) throw normalizeApiFailure(response, error, "Failed to load outlets");
  return requireData(data?.data as OutletAdminRecord[] | undefined, "Missing outlets response");
}

export async function fetchOutlet(outletId: number): Promise<OutletAdminRecord> {
  const { data, error, response } = await api.GET("/outlets/{id}", {
    params: { path: { id: String(outletId) } },
  });
  if (error) throw normalizeApiFailure(response, error, "Failed to load outlet");
  return requireData(data?.data as OutletAdminRecord | undefined, "Missing outlet response");
}

export async function createOutletAdmin(input: OutletCreateRequest): Promise<OutletAdminRecord> {
  const { data, error, response } = await api.POST("/outlets", { body: input });
  if (error) throw normalizeApiFailure(response, error, "Failed to create outlet");
  return requireData(data?.data as OutletAdminRecord | undefined, "Missing created outlet response");
}

export async function updateOutletAdmin(input: {
  id: number;
  patch: OutletUpdateRequest;
}): Promise<OutletAdminRecord> {
  const { data, error, response } = await api.PATCH("/outlets/{id}", {
    params: { path: { id: String(input.id) } },
    body: input.patch,
  });
  if (error) throw normalizeApiFailure(response, error, "Failed to update outlet");
  return requireData(data?.data as OutletAdminRecord | undefined, "Missing updated outlet response");
}

export function useCompanyAdminList() {
  return useQuery({ queryKey: companyQueryKeys.list(), queryFn: fetchCompanies });
}

export function useCompanyAdminDetail(companyId: number | null) {
  return useQuery({
    queryKey: companyId ? companyQueryKeys.detail(companyId) : ["platform", "companies", "detail"],
    queryFn: () => fetchCompany(companyId as number),
    enabled: companyId !== null,
  });
}

export function useOutletAdminList(companyId: number) {
  return useQuery({ queryKey: outletQueryKeys.list(companyId), queryFn: fetchOutlets });
}

export function useCreateCompanyAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCompanyAdmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKeys.all });
    },
  });
}

export function useUpdateCompanyAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCompanyAdmin,
    onSuccess: async (_company, variables) => {
      await queryClient.invalidateQueries({ queryKey: companyQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: companyQueryKeys.detail(variables.id) });
    },
  });
}

export function useCreateOutletAdmin(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOutletAdmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: outletQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: outletQueryKeys.list(companyId) });
    },
  });
}

export function useUpdateOutletAdmin(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOutletAdmin,
    onSuccess: async (_outlet, variables) => {
      await queryClient.invalidateQueries({ queryKey: outletQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: outletQueryKeys.list(companyId) });
      await queryClient.invalidateQueries({ queryKey: outletQueryKeys.detail(variables.id) });
    },
  });
}
