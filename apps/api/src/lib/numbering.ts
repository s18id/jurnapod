// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDb } from "./db";
import { sql } from "kysely";
import { withTransactionRetry } from "@jurnapod/db";
import { nowUTC } from "@/lib/date-helpers";

export const DOCUMENT_TYPES = {
  SALES_INVOICE: "SALES_INVOICE",
  SALES_PAYMENT: "SALES_PAYMENT",
  SALES_ORDER: "SALES_ORDER",
  CREDIT_NOTE: "CREDIT_NOTE",
  SALES_CUSTOMER: "SALES_CUSTOMER"
} as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES];

const TABLE_CONFIG: Record<DocumentType, { table: string; numberColumn: string }> = {
  SALES_INVOICE: { table: "sales_invoices", numberColumn: "invoice_no" },
  SALES_PAYMENT: { table: "sales_payments", numberColumn: "payment_no" },
  SALES_ORDER: { table: "sales_orders", numberColumn: "order_no" },
  CREDIT_NOTE: { table: "sales_credit_notes", numberColumn: "credit_note_no" },
  SALES_CUSTOMER: { table: "customers", numberColumn: "code" }
};

export const RESET_PERIODS = {
  NEVER: "NEVER",
  YEARLY: "YEARLY",
  MONTHLY: "MONTHLY",
  WEEKLY: "WEEKLY",
  DAILY: "DAILY"
} as const;

export type ResetPeriod = (typeof RESET_PERIODS)[keyof typeof RESET_PERIODS];

type NumberingTemplateRow = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  doc_type: string;
  pattern: string;
  reset_period: string;
  current_value: number;
  last_reset: string | null;
  is_active: number;
};

export class NumberingConflictError extends Error {
  constructor(docType: string, number: string) {
    super(`Document number ${number} already exists for type ${docType}`);
    this.name = "NumberingConflictError";
  }
}

export class NumberingTemplateNotFoundError extends Error {
  constructor(docType: string, outletId?: number) {
    const scope = outletId ? `outlet ${outletId}` : "company";
    super(`No numbering template found for ${docType} in ${scope}`);
    this.name = "NumberingTemplateNotFoundError";
  }
}

const DEFAULT_MAX_RETRIES = 5;
const MAX_RETRY_JITTER_MS = 50;

function getDatePlaceholders(date: Date): Record<string, string> {
  const year = date.getFullYear().toString();
  const yy = year.slice(-2);
  const yyyy = year;
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return { yy, yyyy, mm, dd };
}

function getSequencePlaceholder(seq: number, width: number): string {
  return seq.toString().padStart(width, "0");
}

function applyPattern(
  pattern: string,
  currentValue: number,
  date: Date
): string {
  const datePlaceholders = getDatePlaceholders(date);
  
  let result = pattern;
  
  result = result.replace(/{{yyyy}}/g, datePlaceholders.yyyy);
  result = result.replace(/{{yy}}/g, datePlaceholders.yy);
  result = result.replace(/{{mm}}/g, datePlaceholders.mm);
  result = result.replace(/{{dd}}/g, datePlaceholders.dd);
  
  result = result.replace(/{{seq1}}/g, getSequencePlaceholder(currentValue, 1));
  result = result.replace(/{{seq2}}/g, getSequencePlaceholder(currentValue, 2));
  result = result.replace(/{{seq3}}/g, getSequencePlaceholder(currentValue, 3));
  result = result.replace(/{{seq4}}/g, getSequencePlaceholder(currentValue, 4));
  result = result.replace(/{{seq5}}/g, getSequencePlaceholder(currentValue, 5));
  result = result.replace(/{{seq6}}/g, getSequencePlaceholder(currentValue, 6));
  
  result = result.replace(/{{seq}}/g, getSequencePlaceholder(currentValue, 4));
  
  return result;
}

function parseTrailingSequence(value: string): number | null {
  const match = value.match(/(\d+)\s*$/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Get ISO week number and year for a date.
 * ISO week 1 is the week containing the first Thursday of the year.
 * Monday is the first day of the week.
 */
export function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getFullYear(), week: weekNum };
}

/**
 * Check if two dates are the same calendar day (local timezone).
 */
export function isSameDayLocal(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function needsReset(lastReset: string | null, resetPeriod: ResetPeriod, now: Date): boolean {
  if (resetPeriod === "NEVER" || !lastReset) {
    return false;
  }

  const lastResetDate = new Date(lastReset);
  if (Number.isNaN(lastResetDate.getTime())) {
    return false;
  }

  if (resetPeriod === "YEARLY") {
    return lastResetDate.getFullYear() !== now.getFullYear();
  }

  if (resetPeriod === "MONTHLY") {
    return (
      lastResetDate.getFullYear() !== now.getFullYear() ||
      lastResetDate.getMonth() !== now.getMonth()
    );
  }

  if (resetPeriod === "WEEKLY") {
    const lastWeek = getISOWeek(lastResetDate);
    const currentWeek = getISOWeek(now);
    return lastWeek.year !== currentWeek.year || lastWeek.week !== currentWeek.week;
  }

  if (resetPeriod === "DAILY") {
    return !isSameDayLocal(lastResetDate, now);
  }

  return false;
}

export async function generateDocumentNumber(
  companyId: number,
  outletId: number | null,
  docType: DocumentType,
  maxRetries = DEFAULT_MAX_RETRIES
): Promise<string> {
  const db = getDb();
  const attempts = Math.max(1, maxRetries);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await withTransactionRetry(db, async (trx) => {
        const templateRow = await sql<NumberingTemplateRow>`
          SELECT * FROM numbering_templates 
          WHERE company_id = ${companyId} AND doc_type = ${docType} AND is_active = 1 
            AND (outlet_id = ${outletId} OR outlet_id IS NULL)
          ORDER BY outlet_id DESC 
          LIMIT 1
          FOR UPDATE
        `.execute(trx);

        if (templateRow.rows.length === 0) {
          throw new NumberingTemplateNotFoundError(docType, outletId ?? undefined);
        }

        const template = templateRow.rows[0];
        const now = new Date();
        const shouldReset = needsReset(template.last_reset, template.reset_period as ResetPeriod, now);

        let newValue: number;
        let newLastReset: string | null = template.last_reset
          ? template.last_reset
          : null;

        if (shouldReset) {
          newValue = 1;
          newLastReset = nowUTC();
        } else {
          newValue = template.current_value + 1;
        }

        await trx
          .updateTable('numbering_templates')
          .set({
            current_value: newValue,
            last_reset: newLastReset ? new Date(newLastReset) : null
          })
          .where('id', '=', template.id)
          .execute();

        return { template, newValue, now };
      });

      return applyPattern(result.template.pattern, result.newValue, result.now);
    } catch (error) {
      if (error instanceof NumberingTemplateNotFoundError) {
        throw error;
      }
      if (attempt >= attempts - 1) {
        throw error;
      }
      await delay(Math.floor(Math.random() * MAX_RETRY_JITTER_MS));
    }
  }

  throw new Error("Failed to generate document number");
}

export async function reserveDocumentNumber(
  companyId: number,
  outletId: number | null,
  docType: DocumentType,
  requestedNumber: string
): Promise<string> {
  const db = getDb();
  const tableConfig = TABLE_CONFIG[docType];
  if (!tableConfig) {
    throw new Error(`Unknown document type: ${docType}`);
  }

  const manualSeq = parseTrailingSequence(requestedNumber);

  await withTransactionRetry(db, async (trx) => {
    const existingRow = await sql`
      SELECT 1 as row_exists FROM ${sql.table(tableConfig.table)}
      WHERE company_id = ${companyId} AND ${sql.raw(tableConfig.numberColumn)} = ${requestedNumber}
      LIMIT 1
    `.execute(trx);

    if (existingRow.rows.length > 0) {
      throw new NumberingConflictError(docType, requestedNumber);
    }

    if (manualSeq !== null) {
      const templateRows = await sql<{ id: number; current_value: number }>`
        SELECT id, current_value FROM numbering_templates
        WHERE company_id = ${companyId} AND doc_type = ${docType} AND is_active = 1
          AND (outlet_id = ${outletId} OR outlet_id IS NULL)
        ORDER BY outlet_id DESC
        LIMIT 1
        FOR UPDATE
      `.execute(trx);

      if (templateRows.rows.length > 0) {
        const newCurrentValue = Math.max(templateRows.rows[0].current_value, manualSeq);
        await trx
          .updateTable('numbering_templates')
          .set({ current_value: newCurrentValue })
          .where('id', '=', templateRows.rows[0].id)
          .execute();
      }
    }
  });

  return requestedNumber;
}

export async function getNextDocumentNumber(
  companyId: number,
  outletId: number | null,
  docType: DocumentType,
  requestedNumber?: string | null
): Promise<string> {
  if (requestedNumber && requestedNumber.trim().length > 0) {
    return reserveDocumentNumber(companyId, outletId, docType, requestedNumber.trim());
  }
  
  return generateDocumentNumber(companyId, outletId, docType);
}

const DEFAULT_TEMPLATES: Array<{
  docType: DocumentType;
  pattern: string;
  resetPeriod: ResetPeriod;
}> = [
  { docType: DOCUMENT_TYPES.SALES_INVOICE, pattern: "INV/{{yy}}{{mm}}/{{seq4}}", resetPeriod: RESET_PERIODS.MONTHLY },
  { docType: DOCUMENT_TYPES.SALES_PAYMENT, pattern: "PAY/{{yy}}{{mm}}/{{seq4}}", resetPeriod: RESET_PERIODS.MONTHLY },
  { docType: DOCUMENT_TYPES.SALES_ORDER, pattern: "SO/{{yy}}{{mm}}/{{seq4}}", resetPeriod: RESET_PERIODS.MONTHLY },
  { docType: DOCUMENT_TYPES.CREDIT_NOTE, pattern: "CN/{{yy}}{{mm}}/{{seq4}}", resetPeriod: RESET_PERIODS.MONTHLY },
  { docType: DOCUMENT_TYPES.SALES_CUSTOMER, pattern: "CUST/{{yyyy}}/{{seq4}}", resetPeriod: RESET_PERIODS.YEARLY }
];

export async function initializeDefaultTemplates(companyId: number): Promise<void> {
  const db = getDb();
  
  for (const template of DEFAULT_TEMPLATES) {
    const existing = await db
      .selectFrom('numbering_templates')
      .where('company_id', '=', companyId)
      .where('outlet_id', 'is', null)
      .where('doc_type', '=', template.docType)
      .select('id')
      .executeTakeFirst();
    
    if (!existing) {
      await db
        .insertInto('numbering_templates')
        .values({
          company_id: companyId,
          outlet_id: null,
          scope_key: 0,
          doc_type: template.docType,
          pattern: template.pattern,
          reset_period: template.resetPeriod,
          current_value: 0,
          is_active: 1
        })
        .execute();
    }
  }
}
