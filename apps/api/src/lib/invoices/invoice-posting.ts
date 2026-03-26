// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoice Posting
 * 
 * Journal posting for invoices.
 * Extracted from sales-posting.ts (originally lines 553-580)
 */

// Re-export posting function from sales-posting
export { postSalesInvoiceToJournal } from "@/lib/sales-posting";

// Re-export SalesInvoiceDetail type for use in posting mappers
export type { SalesInvoiceDetail } from "./types";

// Note: The actual posting logic for invoices is in sales-posting.ts
// This module serves as a re-export layer for backward compatibility
// and future extensibility if custom invoice posting logic is needed.
