// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";

export const SUPPLIERS_DEFAULT_LIMIT = 20;
export const PURCHASING_API_BASE = "/purchasing";

export type SupplierStatusFilter = "active" | "inactive";

export interface SupplierContact {
  id: number;
  supplier_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  company_id: number;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  currency: string;
  credit_limit: string;
  payment_terms_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  contacts?: SupplierContact[];
}

export interface SupplierListResult {
  suppliers: Supplier[];
  total: number;
  limit: number;
  offset: number;
}

export interface SupplierListParams {
  search?: string;
  status: SupplierStatusFilter;
  limit: number;
  offset: number;
}

export interface SupplierFormInput {
  company_id: number;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  currency: string;
  credit_limit: string;
  payment_terms_days?: number | null;
  notes?: string | null;
}

export type SupplierUpdateInput = Partial<Omit<SupplierFormInput, "company_id" | "code">> & {
  is_active?: boolean;
};

export interface ContactFormInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  is_primary?: boolean;
  notes?: string | null;
}

type SupplierListEnvelope = {
  success: true;
  data: SupplierListResult;
};

type SupplierEnvelope = {
  success: true;
  data: Supplier;
};

type SupplierDeleteEnvelope = {
  success: true;
  data: { success: true };
};

type ContactListEnvelope = {
  success: true;
  data: { contacts: SupplierContact[] };
};

type ContactEnvelope = {
  success: true;
  data: SupplierContact;
};

type ContactDeleteEnvelope = {
  success: true;
  data: { success: true };
};

function normalizeSearch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function pageToSupplierOffset(page: number, pageSize: number): number {
  return Math.max(0, page - 1) * pageSize;
}

export function supplierStatusToIsActive(status: SupplierStatusFilter): boolean {
  return status === "active";
}

export function buildSupplierSearchParams(params: SupplierListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));
  searchParams.set("is_active", String(supplierStatusToIsActive(params.status)));

  const search = normalizeSearch(params.search);
  if (search) searchParams.set("search", search);

  return searchParams;
}

export const supplierQueryKeys = {
  all: ["purchasing", "suppliers"] as const,
  list: (params: SupplierListParams) => ["purchasing", "suppliers", "list", params] as const,
  detail: (supplierId: number) => ["purchasing", "suppliers", "detail", supplierId] as const,
  contacts: (supplierId: number) => ["purchasing", "suppliers", supplierId, "contacts"] as const,
};

export async function fetchSuppliers(params: SupplierListParams): Promise<SupplierListResult> {
  const query = buildSupplierSearchParams(params).toString();
  const response = await apiRequest<SupplierListEnvelope>(`${PURCHASING_API_BASE}/suppliers?${query}`);
  return response.data;
}

export async function fetchSupplier(supplierId: number): Promise<Supplier> {
  const response = await apiRequest<SupplierEnvelope>(`${PURCHASING_API_BASE}/suppliers/${supplierId}`);
  return response.data;
}

export async function createSupplier(input: SupplierFormInput): Promise<Supplier> {
  const response = await apiRequest<SupplierEnvelope>(`${PURCHASING_API_BASE}/suppliers`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updateSupplier(input: { supplierId: number; patch: SupplierUpdateInput }): Promise<Supplier> {
  const response = await apiRequest<SupplierEnvelope>(`${PURCHASING_API_BASE}/suppliers/${input.supplierId}`, {
    method: "PATCH",
    body: JSON.stringify(input.patch),
  });
  return response.data;
}

export async function deactivateSupplier(supplierId: number): Promise<boolean> {
  const response = await apiRequest<SupplierDeleteEnvelope>(`${PURCHASING_API_BASE}/suppliers/${supplierId}`, {
    method: "DELETE",
  });
  return response.data.success;
}

export async function fetchSupplierContacts(supplierId: number): Promise<SupplierContact[]> {
  const response = await apiRequest<ContactListEnvelope>(`${PURCHASING_API_BASE}/suppliers/${supplierId}/contacts`);
  return response.data.contacts;
}

export async function createSupplierContact(input: { supplierId: number; payload: ContactFormInput }): Promise<SupplierContact> {
  const response = await apiRequest<ContactEnvelope>(`${PURCHASING_API_BASE}/suppliers/${input.supplierId}/contacts`, {
    method: "POST",
    body: JSON.stringify(input.payload),
  });
  return response.data;
}

export async function updateSupplierContact(input: { supplierId: number; contactId: number; patch: ContactFormInput }): Promise<SupplierContact> {
  const response = await apiRequest<ContactEnvelope>(`${PURCHASING_API_BASE}/suppliers/${input.supplierId}/contacts/${input.contactId}`, {
    method: "PATCH",
    body: JSON.stringify(input.patch),
  });
  return response.data;
}

export async function deleteSupplierContact(input: { supplierId: number; contactId: number }): Promise<boolean> {
  const response = await apiRequest<ContactDeleteEnvelope>(`${PURCHASING_API_BASE}/suppliers/${input.supplierId}/contacts/${input.contactId}`, {
    method: "DELETE",
  });
  return response.data.success;
}

export function useSuppliersQuery(params: SupplierListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: supplierQueryKeys.list(params),
    queryFn: () => fetchSuppliers(params),
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function useSupplierQuery(supplierId: number | null) {
  return useQuery({
    queryKey: supplierId == null ? supplierQueryKeys.detail(0) : supplierQueryKeys.detail(supplierId),
    queryFn: () => fetchSupplier(Number(supplierId)),
    enabled: supplierId != null,
  });
}

export function useSupplierContactsQuery(supplierId: number | null) {
  return useQuery({
    queryKey: supplierId == null ? supplierQueryKeys.contacts(0) : supplierQueryKeys.contacts(supplierId),
    queryFn: () => fetchSupplierContacts(Number(supplierId)),
    enabled: supplierId != null,
  });
}

export function useCreateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSupplier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all });
    },
  });
}

export function useUpdateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSupplier,
    onSuccess: async (supplier) => {
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.detail(supplier.id) });
    },
  });
}

export function useDeactivateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deactivateSupplier,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all });
    },
  });
}

export function useCreateSupplierContactMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSupplierContact,
    onSuccess: async (_contact, variables) => {
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.contacts(variables.supplierId) });
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.detail(variables.supplierId) });
    },
  });
}

export function useUpdateSupplierContactMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSupplierContact,
    onSuccess: async (_contact, variables) => {
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.contacts(variables.supplierId) });
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.detail(variables.supplierId) });
    },
  });
}

export function useDeleteSupplierContactMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSupplierContact,
    onSuccess: async (_deleted, variables) => {
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.contacts(variables.supplierId) });
      await queryClient.invalidateQueries({ queryKey: supplierQueryKeys.detail(variables.supplierId) });
    },
  });
}
