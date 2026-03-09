// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getDbPool } from "./db";

export const DOCUMENT_TYPES = {
  SALES_INVOICE: "SALES_INVOICE",
  SALES_PAYMENT: "SALES_PAYMENT",
  SALES_ORDER: "SALES_ORDER",
  CREDIT_NOTE: "CREDIT_NOTE"
} as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES];

const TABLE_CONFIG: Record<DocumentType, { table: string; numberColumn: string }> = {
  SALES_INVOICE: { table: "sales_invoices", numberColumn: "invoice_no" },
  SALES_PAYMENT: { table: "sales_payments", numberColumn: "payment_no" },
  SALES_ORDER: { table: "sales_orders", numberColumn: "order_no" },
  CREDIT_NOTE: { table: "sales_credit_notes", numberColumn: "credit_note_no" }
};

export const RESET_PERIODS = {
  NEVER: "NEVER",
  YEARLY: "YEARLY",
  MONTHLY: "MONTHLY"
} as const;

export type ResetPeriod = (typeof RESET_PERIODS)[keyof typeof RESET_PERIODS];

type NumberingTemplateRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number | null;
  doc_type: string;
  pattern: string;
  reset_period: string;
  current_value: number;
  last_reset: Date | string | null;
  is_active: number;
};

type NumberingCheckRow = RowDataPacket & {
  row_exists: number;
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

function needsReset(lastReset: Date | string | null, resetPeriod: ResetPeriod, now: Date): boolean {
  if (resetPeriod === "NEVER" || !lastReset) {
    return false;
  }
  
  const lastResetDate = typeof lastReset === "string" ? new Date(lastReset) : lastReset;
  
  if (resetPeriod === "YEARLY") {
    return lastResetDate.getFullYear() !== now.getFullYear();
  }
  
  if (resetPeriod === "MONTHLY") {
    return (
      lastResetDate.getFullYear() !== now.getFullYear() ||
      lastResetDate.getMonth() !== now.getMonth()
    );
  }
  
  return false;
}

export async function generateDocumentNumber(
  companyId: number,
  outletId: number | null,
  docType: DocumentType,
  maxRetries = DEFAULT_MAX_RETRIES
): Promise<string> {
  const pool = getDbPool();
  const attempts = Math.max(1, maxRetries);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [templates] = await connection.execute<NumberingTemplateRow[]>(
        `SELECT * FROM numbering_templates 
         WHERE company_id = ? AND doc_type = ? AND is_active = 1 
           AND (outlet_id = ? OR outlet_id IS NULL)
         ORDER BY outlet_id DESC 
         LIMIT 1
         FOR UPDATE`,
        [companyId, docType, outletId]
      );

      if (templates.length === 0) {
        throw new NumberingTemplateNotFoundError(docType, outletId ?? undefined);
      }

      const template = templates[0];
      const now = new Date();
      const shouldReset = needsReset(template.last_reset, template.reset_period as ResetPeriod, now);

      let newValue: number;
      let newLastReset: Date | null = template.last_reset
        ? (typeof template.last_reset === "string" ? new Date(template.last_reset) : template.last_reset)
        : null;

      if (shouldReset) {
        newValue = 1;
        newLastReset = now;
      } else {
        newValue = template.current_value + 1;
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE numbering_templates 
         SET current_value = ?, last_reset = ?
         WHERE id = ?`,
        [newValue, newLastReset ?? now, template.id]
      );

      await connection.commit();
      return applyPattern(template.pattern, newValue, now);
    } catch (error) {
      await connection.rollback();
      if (error instanceof NumberingTemplateNotFoundError) {
        throw error;
      }
      if (attempt >= attempts - 1) {
        throw error;
      }
      await delay(Math.floor(Math.random() * MAX_RETRY_JITTER_MS));
    } finally {
      connection.release();
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
  const pool = getDbPool();
  const tableConfig = TABLE_CONFIG[docType];
  if (!tableConfig) {
    throw new Error(`Unknown document type: ${docType}`);
  }

  const manualSeq = parseTrailingSequence(requestedNumber);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<NumberingCheckRow[]>(
      `SELECT 1 as row_exists FROM ${tableConfig.table} 
       WHERE company_id = ? AND ${tableConfig.numberColumn} = ?
       LIMIT 1`,
      [companyId, requestedNumber]
    );

    if (existing.length > 0) {
      throw new NumberingConflictError(docType, requestedNumber);
    }

    if (manualSeq !== null) {
      const [templates] = await connection.execute<NumberingTemplateRow[]>(
        `SELECT id, current_value FROM numbering_templates
         WHERE company_id = ? AND doc_type = ? AND is_active = 1
           AND (outlet_id = ? OR outlet_id IS NULL)
         ORDER BY outlet_id DESC
         LIMIT 1
         FOR UPDATE`,
        [companyId, docType, outletId]
      );

      if (templates.length > 0) {
        await connection.execute<ResultSetHeader>(
          `UPDATE numbering_templates
           SET current_value = GREATEST(current_value, ?)
           WHERE id = ?`,
          [manualSeq, templates[0].id]
        );
      }
    }

    await connection.commit();
    return requestedNumber;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  { docType: DOCUMENT_TYPES.CREDIT_NOTE, pattern: "CN/{{yy}}{{mm}}/{{seq4}}", resetPeriod: RESET_PERIODS.MONTHLY }
];

export async function initializeDefaultTemplates(companyId: number): Promise<void> {
  const pool = getDbPool();
  
  for (const template of DEFAULT_TEMPLATES) {
    const [existing] = await pool.execute<NumberingTemplateRow[]>(
      `SELECT id FROM numbering_templates 
       WHERE company_id = ? AND outlet_id IS NULL AND doc_type = ?
       LIMIT 1`,
      [companyId, template.docType]
    );
    
    if (existing.length === 0) {
      await pool.execute(
        `INSERT INTO numbering_templates (company_id, outlet_id, scope_key, doc_type, pattern, reset_period, current_value, is_active)
         VALUES (?, NULL, 0, ?, ?, ?, 0, 1)`,
        [companyId, template.docType, template.pattern, template.resetPeriod]
      );
    }
  }
}
