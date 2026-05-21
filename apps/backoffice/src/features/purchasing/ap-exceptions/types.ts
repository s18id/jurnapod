// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ApExceptionResponse, ApExceptionStatus, ApExceptionType } from "@jurnapod/shared";

export type ApException = ApExceptionResponse;
export type ApExceptionStatusFilter = ApExceptionStatus | "";
export type ApExceptionTypeFilter = ApExceptionType | "";
export type ApExceptionResolutionStatus = "RESOLVED" | "DISMISSED";

export interface ApExceptionWorklistResult {
  exceptions: ApException[];
  total: number;
  next_cursor: string | null;
  has_more: boolean;
}

export interface ApExceptionWorklistParams {
  type?: ApExceptionTypeFilter;
  status?: ApExceptionStatusFilter;
  supplier_id?: string;
  search?: string;
  cursor?: string | null;
  limit: number;
}

export interface ApExceptionAssignInput {
  exceptionId: number;
  assignedToUserId: number;
}

export interface ApExceptionResolveInput {
  exceptionId: number;
  status: ApExceptionResolutionStatus;
  resolutionNote: string;
}

export interface ApExceptionFilterState {
  type: ApExceptionTypeFilter;
  status: ApExceptionStatusFilter;
  supplierId: string;
  search: string;
  limit: number;
}
