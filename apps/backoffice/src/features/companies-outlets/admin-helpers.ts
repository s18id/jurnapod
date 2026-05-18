// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  PERMISSION_BITS,
  userHasPermission,
  type UserPermissionEntry,
} from "@/lib/auth/permissions";
import type { UserOutlet } from "@/lib/session";

export interface CompanyScopeRecord {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
  deleted_at?: string | null;
}

export interface OutletScopeRecord {
  id: number;
  company_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface CompanyOutletActorContext {
  companyId: number;
  isSuperAdmin: boolean;
}

export interface CompanyActionGates {
  view: boolean;
  create: boolean;
  edit: boolean;
}

export interface OutletActionGates {
  view: boolean;
  create: boolean;
  edit: boolean;
}

export function hasPlatformPermission(
  permissions: readonly UserPermissionEntry[],
  resource: "companies" | "outlets",
  mask: number,
): boolean {
  return userHasPermission(permissions, "platform", resource, mask);
}

export function getCompanyActionGates(
  permissions: readonly UserPermissionEntry[],
  actor: CompanyOutletActorContext,
  targetCompanyId?: number,
): CompanyActionGates {
  const canRead = hasPlatformPermission(permissions, "companies", PERMISSION_BITS.READ);
  const canManage = hasPlatformPermission(permissions, "companies", PERMISSION_BITS.MANAGE);
  const backendAllowsCreateForActor = actor.isSuperAdmin;
  const backendAllowsPatchForTarget = targetCompanyId === undefined || targetCompanyId === actor.companyId;

  return {
    view: canRead,
    create: canManage && backendAllowsCreateForActor,
    edit: canManage && backendAllowsPatchForTarget,
  };
}

export function getOutletActionGates(
  permissions: readonly UserPermissionEntry[],
  actor: CompanyOutletActorContext,
  targetCompanyId: number,
): OutletActionGates {
  const canRead = hasPlatformPermission(permissions, "outlets", PERMISSION_BITS.READ);
  const canManage = hasPlatformPermission(permissions, "outlets", PERMISSION_BITS.MANAGE);
  const backendAllowsTargetCompany = actor.isSuperAdmin || targetCompanyId === actor.companyId;

  return {
    view: canRead && backendAllowsTargetCompany,
    create: canManage && backendAllowsTargetCompany,
    edit: canManage && backendAllowsTargetCompany,
  };
}

export function isCompanyInactive(company: CompanyScopeRecord): boolean {
  return company.is_active === false || Boolean(company.deleted_at);
}

export function companyStatusLabel(company: CompanyScopeRecord): "Active" | "Inactive" {
  return isCompanyInactive(company) ? "Inactive" : "Active";
}

export function outletStatusLabel(outlet: OutletScopeRecord): "Active" | "Inactive" {
  return outlet.is_active ? "Active" : "Inactive";
}

export function buildScopeSummary(input: {
  company?: CompanyScopeRecord | null;
  fallbackCompanyId: number;
  currentOutlet?: UserOutlet | OutletScopeRecord | null;
}): { companyId: number; companyName?: string; outletName?: string | null; status?: string } {
  return {
    companyId: input.company?.id ?? input.fallbackCompanyId,
    companyName: input.company?.name,
    outletName: input.currentOutlet?.name ?? null,
    status: input.company ? companyStatusLabel(input.company) : undefined,
  };
}

export const COMPANY_QUERY_RESOURCE = "companies";
export const OUTLET_QUERY_RESOURCE = "outlets";
export const DEFAULT_ADMIN_TIMEZONE = "UTC";

export function normalizeAdminTimezone(value: string | null | undefined): string {
  const timezone = value?.trim();
  return timezone && timezone.length > 0 ? timezone : DEFAULT_ADMIN_TIMEZONE;
}

export function mutationInvalidationResource(action: "company" | "outlet"): string {
  return action === "company" ? COMPANY_QUERY_RESOURCE : OUTLET_QUERY_RESOURCE;
}
