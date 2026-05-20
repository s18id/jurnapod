// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Journal Request Handlers
 *
 * Thin orchestration layer for journal API routes. Business persistence lives in
 * @jurnapod/modules-accounting; this file performs auth, boundary validation,
 * deterministic error mapping, and response envelope formatting.
 */

import { z } from "zod";
import { requireAccess } from "./auth-guard";
import { checkUserAccess, listUserOutletIds } from "./auth";
import { errorResponse, successResponse } from "@jurnapod/shared";
import {
  createJournalDraft,
  validateJournalDraftReferences,
  updateJournalDraft,
  postJournalDraft,
  listJournalEntries,
  getJournalEntry,
  JournalNotBalancedError,
  JournalNotFoundError,
  InvalidJournalLineError,
  JournalDraftNotFoundError,
  JournalAlreadyPostedError,
  JournalDuplicateClientRefError,
  InvalidJournalOutletError,
  InvalidJournalAccountError,
  FiscalYearClosedError,
  JournalOutsideFiscalYearError
} from "./journals";
import type { AuthContext } from "./auth-guard";
import {
  ManualJournalEntryCreateRequestSchema,
  ManualJournalEntryUpdateRequestSchema,
  DateOnlySchema,
  normalizeJournalDocType,
  type ManualJournalEntryUpdateRequest
} from "@jurnapod/shared";

export const listQuerySchema = z.object({
  outlet_id: z.coerce.number().int().positive().optional(),
  start_date: DateOnlySchema.optional(),
  end_date: DateOnlySchema.optional(),
  doc_type: z.string().optional(),
  account_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type ListJournalsInput = z.infer<typeof listQuerySchema>;

async function requireJournalAccess(
  auth: AuthContext,
  rawRequest: Request,
  permission: "create" | "read" | "update",
  outletId?: number | null
): Promise<Response | null> {
  return requireAccess({
    module: "accounting",
    resource: "journals",
    permission,
    outletId: outletId ?? undefined,
  })(rawRequest, auth);
}

async function requireJournalPermission(
  auth: AuthContext,
  permission: "create" | "read" | "update",
  outletId?: number | null
): Promise<Response | null> {
  const access = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    module: "accounting",
    resource: "journals",
    permission,
    outletId: outletId ?? undefined,
  });

  if (!access || (!access.hasPermission && !access.isSuperAdmin)) {
    return errorResponse("FORBIDDEN", "Forbidden", 403);
  }

  if (outletId !== undefined && outletId !== null) {
    if (!access.hasOutletAccess && !access.hasGlobalRole && !access.isSuperAdmin) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }
  }

  return null;
}

async function userHasCompanyWideJournalPermission(
  auth: AuthContext,
  permission: "create" | "read" | "update"
): Promise<boolean> {
  const access = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    module: "accounting",
    resource: "journals",
    permission,
  });
  return Boolean(access && (access.isSuperAdmin || (access.hasPermission && access.hasGlobalRole)));
}

function mapJournalError(error: unknown, action: string): Response {
  if (error instanceof z.ZodError) {
    return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
  }

  if (error instanceof JournalNotBalancedError) {
    return errorResponse("NOT_BALANCED", "Journal entry debits and credits must balance", 400);
  }

  if (error instanceof InvalidJournalLineError) {
    return errorResponse("INVALID_LINE", error.message, 400);
  }

  if (error instanceof InvalidJournalOutletError) {
    return errorResponse("INVALID_OUTLET", error.message, 404);
  }

  if (error instanceof InvalidJournalAccountError) {
    return errorResponse("INVALID_ACCOUNT", error.message, 400);
  }

  if (error instanceof JournalDraftNotFoundError || error instanceof JournalNotFoundError) {
    return errorResponse("NOT_FOUND", "Journal not found", 404);
  }

  if (error instanceof JournalAlreadyPostedError) {
    return errorResponse("JOURNAL_ALREADY_POSTED", error.message, 409);
  }

  if (error instanceof JournalDuplicateClientRefError) {
    return errorResponse("DUPLICATE_CLIENT_REF", error.message, 409);
  }

  if (error instanceof FiscalYearClosedError) {
    return errorResponse("FISCAL_YEAR_CLOSED", error.message, 400);
  }

  if (error instanceof JournalOutsideFiscalYearError) {
    return errorResponse("JOURNAL_OUTSIDE_FISCAL_YEAR", "Entry date is outside any open fiscal year", 400);
  }

  if (error instanceof Error && error.name === "FiscalYearClosedError") {
    return errorResponse("FISCAL_YEAR_CLOSED", error.message, 400);
  }

  if (error instanceof Error && error.name === "JournalOutsideFiscalYearError") {
    return errorResponse("JOURNAL_OUTSIDE_FISCAL_YEAR", "Entry date is outside any open fiscal year", 400);
  }

  console.error(`${action} failed:`, error);
  return errorResponse("INTERNAL_SERVER_ERROR", `Failed to ${action}`, 500);
}

export async function handleListJournals(
  auth: AuthContext,
  rawRequest: Request,
  query: ListJournalsInput
): Promise<Response> {
  void rawRequest;
  try {
    if (query.outlet_id !== undefined) {
      const outletAccessResult = await requireJournalPermission(auth, "read", query.outlet_id);
      if (outletAccessResult !== null) {
        return outletAccessResult;
      }
    } else if (!(await userHasCompanyWideJournalPermission(auth, "read"))) {
      const outletIds = await listUserOutletIds(auth.userId, auth.companyId);
      const permittedOutletIds: number[] = [];
      for (const outletId of outletIds) {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          module: "accounting",
          resource: "journals",
          permission: "read",
          outletId,
        });
        if (access?.hasPermission && (access.hasOutletAccess || access.hasGlobalRole || access.isSuperAdmin)) {
          permittedOutletIds.push(outletId);
        }
      }
      if (permittedOutletIds.length === 0) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      const requestedLimit = query.limit ?? 100;
      const requestedOffset = query.offset ?? 0;
      const outletEntries = await Promise.all(permittedOutletIds.map((outletId) => listJournalEntries({
        company_id: auth.companyId,
        outlet_id: outletId,
        start_date: query.start_date,
        end_date: query.end_date,
        doc_type: normalizeJournalDocType(query.doc_type),
        account_id: query.account_id,
        limit: requestedLimit + requestedOffset,
        offset: 0,
      })));
      const merged = outletEntries.flat()
        .sort((left, right) => {
          const leftDate = left.status === "DRAFT" ? left.entry_date : left.posted_at;
          const rightDate = right.status === "DRAFT" ? right.entry_date : right.posted_at;
          const dateOrder = String(rightDate).localeCompare(String(leftDate));
          if (dateOrder !== 0) return dateOrder;
          return right.id - left.id;
        })
        .slice(requestedOffset, requestedOffset + requestedLimit);
      return successResponse(merged);
    }

    const listQuery = {
      company_id: auth.companyId,
      outlet_id: query.outlet_id,
      start_date: query.start_date,
      end_date: query.end_date,
      doc_type: normalizeJournalDocType(query.doc_type),
      account_id: query.account_id,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
    };

    return successResponse(await listJournalEntries(listQuery));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request query", 400);
    }
    console.error("handleListJournals failed:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list journals", 500);
  }
}

export async function handleCreateJournal(
  auth: AuthContext,
  rawRequest: Request,
  input: unknown
): Promise<Response> {
  try {
    const parsed = ManualJournalEntryCreateRequestSchema.parse(input);
    const accessResult = await requireJournalAccess(auth, rawRequest, "create");
    if (accessResult !== null) {
      return accessResult;
    }
    if (parsed.company_id !== auth.companyId) {
      return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
    }
    await validateJournalDraftReferences(parsed);
    const outletAccessResult = await requireJournalAccess(auth, rawRequest, "create", parsed.outlet_id);
    if (outletAccessResult !== null) {
      return outletAccessResult;
    }

    return successResponse(await createJournalDraft(parsed, auth.userId), 201);
  } catch (error) {
    return mapJournalError(error, "create journal draft");
  }
}

export async function handleUpdateJournal(
  auth: AuthContext,
  rawRequest: Request,
  journalId: number,
  input: unknown
): Promise<Response> {
  try {
    const parsed: ManualJournalEntryUpdateRequest = ManualJournalEntryUpdateRequestSchema.parse(input);
    const accessResult = await requireJournalAccess(auth, rawRequest, "update");
    if (accessResult !== null) {
      return accessResult;
    }
    if (parsed.company_id !== undefined && parsed.company_id !== auth.companyId) {
      return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
    }
    const currentEntry = await getJournalEntry(journalId, auth.companyId);
    const currentOutletAccessResult = await requireJournalPermission(auth, "update", currentEntry.outlet_id);
    if (currentOutletAccessResult !== null) {
      return currentOutletAccessResult;
    }
    await validateJournalDraftReferences({
      company_id: auth.companyId,
      outlet_id: parsed.outlet_id ?? null,
      entry_date: parsed.entry_date,
      reference: parsed.reference,
      description: parsed.description,
      client_ref: parsed.client_ref,
      lines: parsed.lines,
    });
    const outletAccessResult = await requireJournalAccess(auth, rawRequest, "update", parsed.outlet_id);
    if (outletAccessResult !== null) {
      return outletAccessResult;
    }

    return successResponse(await updateJournalDraft(journalId, auth.companyId, parsed));
  } catch (error) {
    return mapJournalError(error, "update journal draft");
  }
}

export async function handlePostJournal(
  auth: AuthContext,
  rawRequest: Request,
  journalId: number
): Promise<Response> {
  void rawRequest;
  try {
    const currentEntry = await getJournalEntry(journalId, auth.companyId);
    const accessResult = await requireJournalPermission(auth, "update", currentEntry.outlet_id);
    if (accessResult !== null) {
      return accessResult;
    }
    return successResponse(await postJournalDraft(journalId, auth.companyId, auth.userId));
  } catch (error) {
    return mapJournalError(error, "post journal draft");
  }
}

export async function handleGetJournal(
  auth: AuthContext,
  rawRequest: Request,
  journalId: number
): Promise<Response> {
  void rawRequest;
  try {
    const entry = await getJournalEntry(journalId, auth.companyId);
    const accessResult = await requireJournalPermission(auth, "read", entry.outlet_id);
    if (accessResult !== null) {
      return accessResult;
    }
    return successResponse(entry);
  } catch (error) {
    return mapJournalError(error, "get journal");
  }
}
