// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb } from "./db";
import { toDateTimeRangeWithTimezone, normalizeDate, toMysqlDateTime } from "./date-helpers";

type PosTransactionRow = {
  id: number;
  outlet_id: number;
  client_tx_id: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  service_type: "TAKEAWAY" | "DINE_IN" | null;
  table_id: number | null;
  reservation_id: number | null;
  guest_count: number | null;
  order_status: "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED" | null;
  trx_at: string;
  gross_total: number | string | null;
  paid_total: number | string | null;
  item_count: number | null;
};

type PosDailyRow = {
  trx_date: string;
  outlet_id: number;
  outlet_name: string | null;
  tx_count: number;
  gross_total: number | string | null;
  paid_total: number | string | null;
};

type PosPaymentRow = {
  outlet_id: number;
  outlet_name: string | null;
  method: string;
  payment_count: number;
  total_amount: number | string | null;
};

type JournalBatchRow = {
  id: number;
  outlet_id: number | null;
  outlet_name: string | null;
  doc_type: string;
  doc_id: number;
  posted_at: string;
  total_debit: number | string;
  total_credit: number | string;
  line_count: number;
};

type TrialBalanceRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number | string;
  total_credit: number | string;
  balance: number | string;
};

type GeneralLedgerRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number | string | null;
  opening_credit: number | string | null;
  period_debit: number | string | null;
  period_credit: number | string | null;
};

type GeneralLedgerLineRow = {
  line_id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  line_date: string;
  debit: number | string;
  credit: number | string;
  description: string;
  outlet_id: number | null;
  outlet_name: string | null;
  journal_batch_id: number;
  doc_type: string;
  doc_id: number;
  posted_at: string;
};

type ProfitLossRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number | string | null;
  total_credit: number | string | null;
};

type WorksheetRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  type_name: string | null;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number | string | null;
  opening_credit: number | string | null;
  period_debit: number | string | null;
  period_credit: number | string | null;
};

type ReceivablesAgeingRow = {
  invoice_id: number;
  invoice_no: string;
  outlet_id: number;
  outlet_name: string | null;
  invoice_date: string;
  due_date: string | null;
  outstanding_amount: number | string;
  days_overdue: number | string;
};

type BaseFilter = {
  companyId: number;
  outletIds: readonly number[];
  dateFrom: string;
  dateTo: string;
  userId?: number;
  timezone?: string;
};

type PosTransactionFilter = BaseFilter & {
  status?: "COMPLETED" | "VOID" | "REFUND";
  asOf?: string;
  asOfId?: number;
  limit: number;
  offset: number;
};

type JournalFilter = BaseFilter & {
  asOf?: string;
  asOfId?: number;
  includeUnassignedOutlet?: boolean;
  limit: number;
  offset: number;
};

type TrialBalanceFilter = BaseFilter & {
  asOf?: string;
  includeUnassignedOutlet?: boolean;
};

type GeneralLedgerFilter = BaseFilter & {
  includeUnassignedOutlet?: boolean;
  accountId?: number;
  lineLimit?: number;
  lineOffset?: number;
};

type ProfitLossFilter = BaseFilter & {
  includeUnassignedOutlet?: boolean;
};

type WorksheetFilter = BaseFilter & {
  includeUnassignedOutlet?: boolean;
};

export interface ReceivablesAgeingFilter {
  companyId: number;
  outletIds?: number[];
  asOfDate?: string;
  timezone?: string;
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function buildOutletPredicate(
  column: string,
  outletIds: readonly number[],
  includeUnassignedOutlet: boolean
): { sql: string; values: number[] } {
  if (outletIds.length === 0) {
    return { sql: "FALSE", values: [] };
  }

  const placeholders = outletIds.map(() => "?").join(", ");
  const clause = includeUnassignedOutlet
    ? `(${column} IS NULL OR ${column} IN (${placeholders}))`
    : `${column} IN (${placeholders})`;
  return { sql: clause, values: [...outletIds] };
}

function toIsoDateTime(value: Date | string): string {
  return new Date(value).toISOString();
}

function toIsoDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toMysqlDateTimeOrNow(value: string): string {
  try {
    return toMysqlDateTime(value);
  } catch {
    return toMysqlDateTime(new Date().toISOString());
  }
}

function mysqlDateTimeToUtcDate(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

function toDateTimeRange(dateFrom: string, dateTo: string, timezone?: string): { fromStart: string; nextDayStart: string } {
  if (timezone && timezone !== 'UTC') {
    // Use timezone-aware boundaries
    const range = toDateTimeRangeWithTimezone(dateFrom, dateTo, timezone);
    // Convert to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
    const fromStart = range.fromStartUTC.slice(0, 19).replace("T", " ");
    // For end boundary, add 1ms to get the start of the next day in UTC
    const endDate = new Date(range.toEndUTC);
    endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() + 1);
    // Use the full UTC datetime, not just the date portion
    const nextDayStart = endDate.toISOString().slice(0, 19).replace("T", " ");
    return { fromStart, nextDayStart };
  }

  // Fallback to original UTC behavior
  const fromStart = `${dateFrom} 00:00:00`;
  const [year, month, day] = dateTo.split("-").map((value) => Number(value));
  const nextDay = new Date(Date.UTC(year, month - 1, day));
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return {
    fromStart,
    nextDayStart: `${nextDay.toISOString().slice(0, 10)} 00:00:00`
  };
}

function shouldFallbackDailySalesView(error: unknown): boolean {
  const maybeMysqlError = error as { errno?: number };
  return maybeMysqlError.errno === 1146 || maybeMysqlError.errno === 1356;
}

function buildOutletInClause(outletIds: readonly number[]): { sql: string; values: number[] } {
  if (outletIds.length === 0) {
    return {
      sql: " AND 1 = 0",
      values: []
    };
  }

  const placeholders = outletIds.map(() => "?").join(", ");
  return {
    sql: ` AND pt.outlet_id IN (${placeholders})`,
    values: [...outletIds]
  };
}

export async function listPosTransactions(filter: PosTransactionFilter) {
  const db = getDb();
  const outletClause = buildOutletInClause(filter.outletIds);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo, filter.timezone);
  const asOf = filter.asOf ?? new Date().toISOString();
  const asOfSql = toMysqlDateTimeOrNow(asOf);

  const coreValues: Array<number | string> = [
    filter.companyId,
    range.fromStart,
    range.nextDayStart,
    asOfSql
  ];
  const scopeValues: Array<number | string> = [...outletClause.values];
  let statusClause = "";
  if (filter.status) {
    statusClause = " AND pt.status = ?";
    scopeValues.push(filter.status);
  }

  let userClause = "";
  if (typeof filter.userId === "number") {
    userClause = " AND pt.cashier_user_id = ?";
    scopeValues.push(filter.userId);
  }

  return await db.transaction().execute(async (trx) => {
    let asOfId = filter.asOfId ?? null;
    if (asOfId == null) {
      if (filter.outletIds.length === 0) {
        asOfId = 0;
      } else {
        let query = trx
          .selectFrom("pos_transactions as pt")
          .where("pt.company_id", "=", filter.companyId)
          .where("pt.trx_at", ">=", mysqlDateTimeToUtcDate(range.fromStart))
          .where("pt.trx_at", "<", mysqlDateTimeToUtcDate(range.nextDayStart))
          .where("pt.trx_at", "<=", mysqlDateTimeToUtcDate(asOfSql));

        if (filter.outletIds.length > 0) {
          query = query.where("pt.outlet_id", "in", [...filter.outletIds]);
        }

        if (filter.status) {
          query = query.where("pt.status", "=", filter.status);
        }

        if (typeof filter.userId === "number") {
          query = query.where("pt.cashier_user_id", "=", filter.userId);
        }

        const row = await query
          .select((eb) => eb.fn.max("pt.id").as("as_of_id"))
          .executeTakeFirst();

        asOfId = Number(row?.as_of_id ?? 0);
      }
    }

    let listQuery = sql`SELECT pt.id,
            pt.outlet_id,
            pt.client_tx_id,
            pt.status,
            pt.service_type,
            pt.table_id,
            pt.reservation_id,
            pt.guest_count,
            pt.order_status,
            pt.trx_at,
            COALESCE(i.gross_total, 0) AS gross_total,
            COALESCE(p.paid_total, 0) AS paid_total,
            COALESCE(i.item_count, 0) AS item_count
     FROM pos_transactions pt
     LEFT JOIN (
       SELECT pos_transaction_id,
              SUM(qty * price_snapshot) AS gross_total,
              COUNT(*) AS item_count
       FROM pos_transaction_items
       GROUP BY pos_transaction_id
     ) i ON i.pos_transaction_id = pt.id
     LEFT JOIN (
       SELECT pos_transaction_id,
              SUM(amount) AS paid_total
       FROM pos_transaction_payments
       GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
       WHERE pt.company_id = ${filter.companyId}
         AND pt.trx_at >= ${range.fromStart}
         AND pt.trx_at < ${range.nextDayStart}
         AND pt.trx_at <= ${asOfSql}
         AND pt.id <= ${asOfId}`;

    if (outletClause.values.length > 0) {
      listQuery = sql`${listQuery} AND pt.outlet_id IN (${sql.join(outletClause.values.map(v => sql`${v}`))})`;
    }
    if (filter.status) {
      listQuery = sql`${listQuery} AND pt.status = ${filter.status}`;
    }
    if (typeof filter.userId === "number") {
      listQuery = sql`${listQuery} AND pt.cashier_user_id = ${filter.userId}`;
    }
    listQuery = sql`${listQuery} ORDER BY pt.trx_at DESC, pt.id DESC LIMIT ${filter.limit} OFFSET ${filter.offset}`;

    const rows = await sql<PosTransactionRow>`${listQuery}`.execute(trx);

    let countQuery = sql`SELECT COUNT(*) AS total
     FROM pos_transactions pt
     WHERE pt.company_id = ${filter.companyId}
        AND pt.trx_at >= ${range.fromStart}
        AND pt.trx_at < ${range.nextDayStart}
        AND pt.trx_at <= ${asOfSql}
        AND pt.id <= ${asOfId}`;

    if (outletClause.values.length > 0) {
      countQuery = sql`${countQuery} AND pt.outlet_id IN (${sql.join(outletClause.values.map(v => sql`${v}`))})`;
    }
    if (filter.status) {
      countQuery = sql`${countQuery} AND pt.status = ${filter.status}`;
    }
    if (typeof filter.userId === "number") {
      countQuery = sql`${countQuery} AND pt.cashier_user_id = ${filter.userId}`;
    }

    const countResult = await sql<{ total: number }>`${countQuery}`.execute(trx);

    return {
      as_of: asOf,
      as_of_id: asOfId,
      total: Number(countResult.rows[0]?.total ?? 0),
      transactions: rows.rows.map((row) => ({
        id: Number(row.id),
        outlet_id: Number(row.outlet_id),
        client_tx_id: row.client_tx_id,
        status: row.status,
        service_type: row.service_type,
        table_id: row.table_id != null ? Number(row.table_id) : null,
        reservation_id: row.reservation_id != null ? Number(row.reservation_id) : null,
        guest_count: row.guest_count != null ? Number(row.guest_count) : null,
        order_status: row.order_status,
        trx_at: toIsoDateTime(row.trx_at),
        gross_total: toNumber(row.gross_total),
        paid_total: toNumber(row.paid_total),
        item_count: Number(row.item_count ?? 0)
      }))
    };
  });
}

export async function listDailySalesSummary(
  filter: BaseFilter & { status?: "COMPLETED" | "VOID" | "REFUND" }
) {
  const db = getDb();
  const outletClause = buildOutletInClause(filter.outletIds);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo, filter.timezone);
  const hasUserScope = typeof filter.userId === "number";

  let statusClause = "";
  if (filter.status) {
    statusClause = " AND pt.status = ?";
  }

  let rows: PosDailyRow[] = [];
  if (!hasUserScope) {
    try {
      let viewQuery = sql`SELECT v.trx_date,
              v.outlet_id,
              o.name AS outlet_name,
              SUM(v.tx_count) AS tx_count,
              SUM(v.gross_total) AS gross_total,
              SUM(v.paid_total) AS paid_total
       FROM v_pos_daily_totals v
       LEFT JOIN outlets o ON o.id = v.outlet_id
        WHERE v.company_id = ${filter.companyId}
          AND v.trx_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo}`;

      if (outletClause.values.length > 0) {
        viewQuery = sql`${viewQuery} AND v.outlet_id IN (${sql.join(outletClause.values.map(v => sql`${v}`))})`;
      }
      if (filter.status) {
        viewQuery = sql`${viewQuery} AND v.status = ${filter.status}`;
      }
      viewQuery = sql`${viewQuery} GROUP BY v.trx_date, v.outlet_id, o.name ORDER BY v.trx_date DESC, v.outlet_id ASC`;

      const viewResult = await sql<PosDailyRow>`${viewQuery}`.execute(db);
      rows = viewResult.rows;
    } catch (error) {
      if (!shouldFallbackDailySalesView(error)) {
        throw error;
      }
    }
  }

  if (hasUserScope || rows.length === 0) {
    let fallbackQuery = sql`SELECT DATE(pt.trx_at) AS trx_date,
            pt.outlet_id,
            o.name AS outlet_name,
            COUNT(*) AS tx_count,
            COALESCE(SUM(i.gross_total), 0) AS gross_total,
            COALESCE(SUM(p.paid_total), 0) AS paid_total
     FROM pos_transactions pt
     LEFT JOIN outlets o ON o.id = pt.outlet_id
     LEFT JOIN (
       SELECT pos_transaction_id,
              SUM(qty * price_snapshot) AS gross_total
       FROM pos_transaction_items
       GROUP BY pos_transaction_id
     ) i ON i.pos_transaction_id = pt.id
     LEFT JOIN (
       SELECT pos_transaction_id,
              SUM(amount) AS paid_total
       FROM pos_transaction_payments
       GROUP BY pos_transaction_id
      ) p ON p.pos_transaction_id = pt.id
      WHERE pt.company_id = ${filter.companyId}
        AND pt.trx_at >= ${range.fromStart}
        AND pt.trx_at < ${range.nextDayStart}`;

    if (outletClause.values.length > 0) {
      fallbackQuery = sql`${fallbackQuery} AND pt.outlet_id IN (${sql.join(outletClause.values.map(v => sql`${v}`))})`;
    }
    if (filter.status) {
      fallbackQuery = sql`${fallbackQuery} AND pt.status = ${filter.status}`;
    }
    if (hasUserScope) {
      fallbackQuery = sql`${fallbackQuery} AND pt.cashier_user_id = ${filter.userId}`;
    }
    fallbackQuery = sql`${fallbackQuery} GROUP BY DATE(pt.trx_at), pt.outlet_id, o.name ORDER BY DATE(pt.trx_at) DESC, pt.outlet_id ASC`;

    const fallbackResult = await sql<PosDailyRow>`${fallbackQuery}`.execute(db);
    rows = fallbackResult.rows;
  }

  return rows.map((row) => ({
    trx_date: row.trx_date,
    outlet_id: Number(row.outlet_id),
    outlet_name: row.outlet_name,
    tx_count: Number(row.tx_count),
    gross_total: toNumber(row.gross_total),
    paid_total: toNumber(row.paid_total)
  }));
}

export async function listPosPaymentsSummary(
  filter: BaseFilter & { status?: "COMPLETED" | "VOID" | "REFUND" }
) {
  const db = getDb();
  const outletClause = buildOutletInClause(filter.outletIds);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo, filter.timezone);

  let query = sql`SELECT pt.outlet_id,
          o.name AS outlet_name,
          ptp.method,
          COUNT(*) AS payment_count,
          COALESCE(SUM(ptp.amount), 0) AS total_amount
   FROM pos_transaction_payments ptp
   INNER JOIN pos_transactions pt ON pt.id = ptp.pos_transaction_id
   LEFT JOIN outlets o ON o.id = pt.outlet_id
    WHERE pt.company_id = ${filter.companyId}
     AND pt.trx_at >= ${range.fromStart}
     AND pt.trx_at < ${range.nextDayStart}`;

  if (outletClause.values.length > 0) {
    query = sql`${query} AND pt.outlet_id IN (${sql.join(outletClause.values.map(v => sql`${v}`))})`;
  }
  if (filter.status) {
    query = sql`${query} AND pt.status = ${filter.status}`;
  }
  if (typeof filter.userId === "number") {
    query = sql`${query} AND pt.cashier_user_id = ${filter.userId}`;
  }
  query = sql`${query} GROUP BY pt.outlet_id, o.name, ptp.method ORDER BY pt.outlet_id ASC, ptp.method ASC`;

  const result = await sql<PosPaymentRow>`${query}`.execute(db);

  return result.rows.map((row) => ({
    outlet_id: Number(row.outlet_id),
    outlet_name: row.outlet_name,
    method: row.method,
    payment_count: Number(row.payment_count),
    total_amount: toNumber(row.total_amount)
  }));
}

function buildOutletInClauseForJournals(
  outletIds: readonly number[],
  includeUnassignedOutlet: boolean
): { sql: string; values: number[] } {
  if (outletIds.length === 0) {
    return {
      sql: " AND 1 = 0",
      values: []
    };
  }

  const placeholders = outletIds.map(() => "?").join(", ");
  return {
    sql: includeUnassignedOutlet
      ? ` AND (jb.outlet_id IS NULL OR jb.outlet_id IN (${placeholders}))`
      : ` AND jb.outlet_id IN (${placeholders})`,
    values: [...outletIds]
  };
}

export async function listJournalBatches(filter: JournalFilter) {
  const db = getDb();
  const outletClause = buildOutletInClauseForJournals(filter.outletIds, filter.includeUnassignedOutlet ?? true);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo, filter.timezone);
  const asOf = filter.asOf ?? new Date().toISOString();
  const asOfSql = toMysqlDateTimeOrNow(asOf);
  const coreValues: Array<number | string> = [
    filter.companyId,
    range.fromStart,
    range.nextDayStart,
    asOfSql
  ];
  const scopeValues: Array<number | string> = [...outletClause.values];

  return await db.transaction().execute(async (trx) => {
    let asOfId = filter.asOfId ?? null;
    if (asOfId == null) {
      if (filter.outletIds.length === 0) {
        asOfId = 0;
      } else {
        let query = trx
          .selectFrom("journal_batches as jb")
          .where("jb.company_id", "=", filter.companyId)
          .where("jb.posted_at", ">=", mysqlDateTimeToUtcDate(range.fromStart))
          .where("jb.posted_at", "<", mysqlDateTimeToUtcDate(range.nextDayStart))
          .where("jb.posted_at", "<=", mysqlDateTimeToUtcDate(asOfSql));

        if (filter.outletIds.length > 0) {
          query = (filter.includeUnassignedOutlet ?? true)
            ? query.where((eb) => eb.or([
                eb("jb.outlet_id", "is", null),
                eb("jb.outlet_id", "in", [...filter.outletIds])
              ]))
            : query.where("jb.outlet_id", "in", [...filter.outletIds]);
        }

        const row = await query
          .select((eb) => eb.fn.max("jb.id").as("as_of_id"))
          .executeTakeFirst();

        asOfId = Number(row?.as_of_id ?? 0);
      }
    }

    let listQuery = sql`SELECT jb.id,
            jb.outlet_id,
            o.name AS outlet_name,
            jb.doc_type,
            jb.doc_id,
            jb.posted_at,
            SUM(jl.debit) AS total_debit,
            SUM(jl.credit) AS total_credit,
            COUNT(jl.id) AS line_count
     FROM journal_batches jb
     INNER JOIN journal_lines jl ON jl.journal_batch_id = jb.id
      LEFT JOIN outlets o ON o.id = jb.outlet_id
      WHERE jb.company_id = ${filter.companyId}
        AND jb.posted_at >= ${range.fromStart}
        AND jb.posted_at < ${range.nextDayStart}
        AND jb.posted_at <= ${asOfSql}
        AND jb.id <= ${asOfId}`;

    if (outletClause.values.length > 0) {
      listQuery = sql`${listQuery} AND (jb.outlet_id IS NULL OR jb.outlet_id IN (${sql.join(outletClause.values.map(v => sql`${v}`))}))`;
    }
    listQuery = sql`${listQuery} GROUP BY jb.id, jb.outlet_id, o.name, jb.doc_type, jb.doc_id, jb.posted_at ORDER BY jb.posted_at DESC, jb.id DESC LIMIT ${filter.limit} OFFSET ${filter.offset}`;

    const rows = await sql<JournalBatchRow>`${listQuery}`.execute(trx);

    let countQuery = sql`SELECT COUNT(*) AS total
     FROM journal_batches jb
     WHERE jb.company_id = ${filter.companyId}
        AND jb.posted_at >= ${range.fromStart}
        AND jb.posted_at < ${range.nextDayStart}
        AND jb.posted_at <= ${asOfSql}
        AND jb.id <= ${asOfId}`;

    if (outletClause.values.length > 0) {
      countQuery = sql`${countQuery} AND (jb.outlet_id IS NULL OR jb.outlet_id IN (${sql.join(outletClause.values.map(v => sql`${v}`))}))`;
    }

    const countResult = await sql<{ total: number }>`${countQuery}`.execute(trx);

    return {
      as_of: asOf,
      as_of_id: asOfId,
      total: Number(countResult.rows[0]?.total ?? 0),
      journals: rows.rows.map((row) => ({
        id: Number(row.id),
        outlet_id: row.outlet_id == null ? null : Number(row.outlet_id),
        outlet_name: row.outlet_name,
        doc_type: row.doc_type,
        doc_id: Number(row.doc_id),
        posted_at: toIsoDateTime(row.posted_at),
        total_debit: toNumber(row.total_debit),
        total_credit: toNumber(row.total_credit),
        line_count: Number(row.line_count)
      }))
    };
  });
}

export async function getTrialBalance(filter: TrialBalanceFilter) {
  const db = getDb();

  if (filter.outletIds.length === 0) {
    return [];
  }

  const placeholders = filter.outletIds.map(() => "?").join(", ");
  const outletPredicate = filter.includeUnassignedOutlet ?? true
    ? `(jl.outlet_id IS NULL OR jl.outlet_id IN (${placeholders}))`
    : `jl.outlet_id IN (${placeholders})`;
  const asOfDate = filter.asOf ? filter.asOf.slice(0, 10) : filter.dateTo;

  return await db.transaction().execute(async (trx) => {
    const accounts = await trx
      .selectFrom("accounts")
      .where("company_id", "=", filter.companyId)
      .where("is_group", "=", 0)
      .select(["id", "code", "name"])
      .execute();

    if (accounts.length === 0) {
      return [];
    }

    const accountIds = accounts.map((account) => Number(account.id));
    const accountPlaceholders = accountIds.map(() => "?").join(", ");
    
    let query = sql`SELECT jl.account_id,
            a.code AS account_code,
            a.name AS account_name,
            SUM(jl.debit) AS total_debit,
            SUM(jl.credit) AS total_credit,
            SUM(jl.debit - jl.credit) AS balance
     FROM journal_lines jl
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE jl.company_id = ${filter.companyId}
        AND jl.line_date BETWEEN ${filter.dateFrom} AND ${asOfDate}
        AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`))})`;

    // Add outlet predicate
    if (filter.includeUnassignedOutlet ?? true) {
      query = sql`${query} AND (jl.outlet_id IS NULL OR jl.outlet_id IN (${sql.join(filter.outletIds.map(id => sql`${id}`))}))`;
    } else {
      query = sql`${query} AND jl.outlet_id IN (${sql.join(filter.outletIds.map(id => sql`${id}`))})`;
    }
    
    query = sql`${query} GROUP BY jl.account_id, a.code, a.name ORDER BY a.code ASC`;

    const rows = await sql<TrialBalanceRow>`${query}`.execute(trx);

    return rows.rows.map((row) => ({
      account_id: Number(row.account_id),
      account_code: row.account_code,
      account_name: row.account_name,
      total_debit: toNumber(row.total_debit),
      total_credit: toNumber(row.total_credit),
      balance: toNumber(row.balance)
    }));
  });
}

export async function getGeneralLedgerDetail(filter: GeneralLedgerFilter) {
  const db = getDb();

  if (filter.outletIds.length === 0) {
    return [];
  }

  const shouldLimitLines = typeof filter.accountId === "number" && typeof filter.lineLimit === "number";
  const lineOffset = filter.lineOffset ?? 0;

  return await db.transaction().execute(async (trx) => {
    let pagedOpeningDelta = 0;
    if (shouldLimitLines && lineOffset > 0) {
      const includeUnassigned = filter.includeUnassignedOutlet ?? true;
      const outletInClause = sql.join(filter.outletIds.map(id => sql`${id}`));
      const priorQuery = sql`SELECT COALESCE(SUM(prior.debit - prior.credit), 0) AS balance
        FROM (
          SELECT jl.debit, jl.credit
          FROM journal_lines jl
          WHERE jl.company_id = ${filter.companyId}
            AND jl.line_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo}
            AND (jl.outlet_id IS NULL OR jl.outlet_id IN (${outletInClause}))
            ${filter.accountId != null ? sql`AND jl.account_id = ${filter.accountId}` : sql``}
          ORDER BY jl.line_date ASC, jl.id ASC
          LIMIT ${lineOffset}
        ) prior`;
      const priorResult = await priorQuery.execute(trx);
      pagedOpeningDelta = toNumber((priorResult.rows[0] as { balance?: number })?.balance ?? 0);
    }

    const outletInClause = sql.join(filter.outletIds.map(id => sql`${id}`));
    let accountsQuery = sql`SELECT a.id AS account_id,
            a.code AS account_code,
            a.name AS account_name,
            a.report_group,
            a.normal_balance,
            SUM(CASE WHEN jl.line_date < ${filter.dateFrom} THEN jl.debit ELSE 0 END) AS opening_debit,
            SUM(CASE WHEN jl.line_date < ${filter.dateFrom} THEN jl.credit ELSE 0 END) AS opening_credit,
            SUM(CASE WHEN jl.line_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo} THEN jl.debit ELSE 0 END) AS period_debit,
            SUM(CASE WHEN jl.line_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo} THEN jl.credit ELSE 0 END) AS period_credit
     FROM accounts a
      LEFT JOIN journal_lines jl
        ON jl.account_id = a.id
       AND jl.company_id = ${filter.companyId}
       AND (jl.outlet_id IS NULL OR jl.outlet_id IN (${outletInClause}))
     WHERE a.company_id = ${filter.companyId}
       AND a.is_group = 0
       ${filter.accountId != null ? sql`AND a.id = ${filter.accountId}` : sql``}
      GROUP BY a.id, a.code, a.name, a.report_group, a.normal_balance
      ORDER BY a.code ASC`;
    const accountsResult = await accountsQuery.execute(trx);
    const rows = accountsResult.rows as GeneralLedgerRow[];

    let linesQuery = sql`SELECT jl.id AS line_id,
            jl.account_id,
            a.code AS account_code,
            a.name AS account_name,
            jl.line_date,
            jl.debit,
            jl.credit,
            jl.description,
            jl.outlet_id,
            o.name AS outlet_name,
            jb.id AS journal_batch_id,
            jb.doc_type,
            jb.doc_id,
            jb.posted_at
     FROM journal_lines jl
      INNER JOIN accounts a ON a.id = jl.account_id
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      LEFT JOIN outlets o ON o.id = jl.outlet_id
     WHERE jl.company_id = ${filter.companyId}
       AND jl.line_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo}
       AND (jl.outlet_id IS NULL OR jl.outlet_id IN (${outletInClause}))
       ${filter.accountId != null ? sql`AND jl.account_id = ${filter.accountId}` : sql``}
     ORDER BY a.code ASC, jl.line_date ASC, jl.id ASC
     ${shouldLimitLines ? sql`LIMIT ${filter.lineLimit} OFFSET ${lineOffset}` : sql``}`;
    const linesResult = await linesQuery.execute(trx);
    const lineRows = linesResult.rows as GeneralLedgerLineRow[];

    const linesByAccount = new Map<number, GeneralLedgerLineRow[]>();
    for (const line of lineRows) {
      const bucket = linesByAccount.get(line.account_id);
      if (bucket) {
        bucket.push(line);
      } else {
        linesByAccount.set(line.account_id, [line]);
      }
    }

    return rows.map((row) => {
      const openingDebit = toNumber(row.opening_debit);
      const openingCredit = toNumber(row.opening_credit);
      const periodDebit = toNumber(row.period_debit);
      const periodCredit = toNumber(row.period_credit);
      const openingBalance = openingDebit - openingCredit;
      const endingBalance = openingBalance + periodDebit - periodCredit;
      const accountLines = linesByAccount.get(Number(row.account_id)) ?? [];
      const isPagedAccount = typeof filter.accountId === "number" && Number(row.account_id) === filter.accountId;
      let runningBalance = openingBalance + (isPagedAccount ? pagedOpeningDelta : 0);
      const mappedLines = accountLines.map((line) => {
        const debit = toNumber(line.debit);
        const credit = toNumber(line.credit);
        runningBalance += debit - credit;
        return {
          line_id: Number(line.line_id),
          line_date: toIsoDate(line.line_date),
          description: line.description,
          debit,
          credit,
          balance: runningBalance,
          outlet_id: line.outlet_id == null ? null : Number(line.outlet_id),
          outlet_name: line.outlet_name,
          journal_batch_id: Number(line.journal_batch_id),
          doc_type: line.doc_type,
          doc_id: Number(line.doc_id),
          posted_at: toIsoDateTime(line.posted_at)
        };
      });

      return {
        account_id: Number(row.account_id),
        account_code: row.account_code,
        account_name: row.account_name,
        report_group: row.report_group,
        normal_balance: row.normal_balance,
        opening_debit: openingDebit,
        opening_credit: openingCredit,
        period_debit: periodDebit,
        period_credit: periodCredit,
        opening_balance: openingBalance,
        ending_balance: endingBalance,
        lines: mappedLines
      };
    });
  });
}

export async function getProfitLoss(filter: ProfitLossFilter) {
  const db = getDb();

  if (filter.outletIds.length === 0) {
    return { rows: [], totals: { total_debit: 0, total_credit: 0, net: 0 } };
  }

  const outletClause = buildOutletPredicate(
    "jl.outlet_id",
    filter.outletIds,
    filter.includeUnassignedOutlet ?? true
  );

  return await db.transaction().execute(async (trx) => {
    const accounts = await trx
      .selectFrom("accounts as a")
      .leftJoin("account_types as at", (join) =>
        join
          .onRef("at.id", "=", "a.account_type_id")
          .onRef("at.company_id", "=", "a.company_id")
      )
      .where("a.company_id", "=", filter.companyId)
      .where("a.is_group", "=", 0)
      .where((eb) =>
        eb(sql<string>`COALESCE(a.report_group, at.report_group)`, "in", ["PL", "LR"])
      )
      .select(["a.id", "a.code", "a.name"])
      .execute();

    if (accounts.length === 0) {
      return { rows: [], totals: { total_debit: 0, total_credit: 0, net: 0 } };
    }

    const accountIds = accounts.map((account) => Number(account.id));

    let query = sql`SELECT a.id AS account_id,
            a.code AS account_code,
            a.name AS account_name,
            SUM(jl.debit) AS total_debit,
            SUM(jl.credit) AS total_credit
     FROM journal_lines jl
     INNER JOIN accounts a ON a.id = jl.account_id
     LEFT JOIN account_types at
       ON at.id = a.account_type_id
      AND at.company_id = a.company_id
     WHERE jl.company_id = ${filter.companyId}
       AND jl.line_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo}
       AND jl.account_id IN (${sql.join(accountIds.map(id => sql`${id}`))})
       AND COALESCE(a.report_group, at.report_group) IN ('PL', 'LR')
       AND a.is_group = 0`;

    if (filter.includeUnassignedOutlet ?? true) {
      query = sql`${query} AND (jl.outlet_id IS NULL OR jl.outlet_id IN (${sql.join(filter.outletIds.map(id => sql`${id}`))}))`;
    } else {
      query = sql`${query} AND jl.outlet_id IN (${sql.join(filter.outletIds.map(id => sql`${id}`))})`;
    }
    query = sql`${query} GROUP BY a.id, a.code, a.name ORDER BY a.code ASC`;

    const result = await sql<ProfitLossRow>`${query}`.execute(trx);
    const rows = result.rows;

    const mapped = rows.map((row) => ({
      account_id: Number(row.account_id),
      account_code: row.account_code,
      account_name: row.account_name,
      total_debit: toNumber(row.total_debit),
      total_credit: toNumber(row.total_credit),
      net: toNumber(row.total_credit) - toNumber(row.total_debit)
    }));

    const totals = mapped.reduce(
      (acc, row) => ({
        total_debit: acc.total_debit + row.total_debit,
        total_credit: acc.total_credit + row.total_credit,
        net: acc.net + row.net
      }),
      { total_debit: 0, total_credit: 0, net: 0 }
    );

    return { rows: mapped, totals };
  });
}

export async function getReceivablesAgeingReport(filter: ReceivablesAgeingFilter) {
  const db = getDb();

  const outletIds = filter.outletIds ?? [];
  if (outletIds.length === 0) {
    return {
      buckets: {
        current: 0,
        "1_30_days": 0,
        "31_60_days": 0,
        "61_90_days": 0,
        over_90_days: 0
      },
      total_outstanding: 0,
      invoices: []
    };
  }

  let asOfDate: string;
  if (filter.asOfDate) {
    if (filter.timezone && filter.timezone !== 'UTC') {
      asOfDate = normalizeDate(filter.asOfDate, filter.timezone, 'end');
    } else {
      asOfDate = filter.asOfDate + "T23:59:59.999Z";
    }
  } else {
    asOfDate = new Date().toISOString().slice(0, 10);
  }

  const outletInClause = sql.join(outletIds.map(id => sql`${id}`));
  const query = sql`SELECT i.id AS invoice_id,
            i.invoice_no,
            i.outlet_id,
            o.name AS outlet_name,
            i.invoice_date,
            i.due_date,
            (i.grand_total - i.paid_total) AS outstanding_amount,
            DATEDIFF(${asOfDate}, COALESCE(i.due_date, i.invoice_date)) AS days_overdue
     FROM sales_invoices i
      LEFT JOIN outlets o ON o.id = i.outlet_id
     WHERE i.company_id = ${filter.companyId}
       AND i.status = 'POSTED'
       AND (i.grand_total - i.paid_total) > 0
       AND i.outlet_id IN (${outletInClause})
     ORDER BY days_overdue DESC, i.invoice_date ASC, i.id ASC`;
  const result = await query.execute(db);
  const rows = result.rows as ReceivablesAgeingRow[];

  const buckets = {
    current: 0,
    "1_30_days": 0,
    "31_60_days": 0,
    "61_90_days": 0,
    over_90_days: 0
  };

  const invoices = rows.map((row) => {
    const daysOverdue = Number(row.days_overdue ?? 0);
    const outstandingAmount = toNumber(row.outstanding_amount);
    const ageBucket = daysOverdue <= 0
      ? "current"
      : daysOverdue <= 30
        ? "1_30_days"
        : daysOverdue <= 60
          ? "31_60_days"
          : daysOverdue <= 90
            ? "61_90_days"
            : "over_90_days";

    buckets[ageBucket] += outstandingAmount;

    return {
      invoice_id: Number(row.invoice_id),
      invoice_no: row.invoice_no,
      outlet_id: Number(row.outlet_id),
      outlet_name: row.outlet_name,
      invoice_date: toIsoDate(row.invoice_date),
      due_date: row.due_date ? toIsoDate(row.due_date) : null,
      days_overdue: daysOverdue,
      outstanding_amount: outstandingAmount,
      age_bucket: ageBucket
    };
  });

  const totalOutstanding =
    buckets.current +
    buckets["1_30_days"] +
    buckets["31_60_days"] +
    buckets["61_90_days"] +
    buckets.over_90_days;

  return {
    buckets,
    total_outstanding: totalOutstanding,
    invoices
  };
}

export async function getTrialBalanceWorksheet(filter: WorksheetFilter) {
  const db = getDb();

  if (filter.outletIds.length === 0) {
    return [];
  }

  const includeUnassigned = filter.includeUnassignedOutlet ?? true;
  const outletInClause = sql.join(filter.outletIds.map(id => sql`${id}`));

  // Get accounts first
  const accountsQuery = sql`SELECT a.id, a.code, a.name, a.type_name, a.report_group, a.normal_balance
    FROM accounts a
    WHERE a.company_id = ${filter.companyId}
      AND a.is_group = 0
    ORDER BY a.code ASC`;
  const accountsResult = await accountsQuery.execute(db);
  const accounts = accountsResult.rows as Array<{ id: number; code: string; name: string; type_name: string; report_group: string; normal_balance: string }>;

  if (accounts.length === 0) {
    return [];
  }

  const accountIds = accounts.map((account) => Number(account.id));
  const accountInClause = sql.join(accountIds.map(id => sql`${id}`));

  const worksheetQuery = sql`SELECT a.id AS account_id,
              a.code AS account_code,
              a.name AS account_name,
              a.type_name,
              a.report_group,
              a.normal_balance,
              SUM(CASE WHEN jl.line_date < ${filter.dateFrom} THEN jl.debit ELSE 0 END) AS opening_debit,
              SUM(CASE WHEN jl.line_date < ${filter.dateFrom} THEN jl.credit ELSE 0 END) AS opening_credit,
              SUM(CASE WHEN jl.line_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo} THEN jl.debit ELSE 0 END) AS period_debit,
              SUM(CASE WHEN jl.line_date BETWEEN ${filter.dateFrom} AND ${filter.dateTo} THEN jl.credit ELSE 0 END) AS period_credit
       FROM accounts a
        LEFT JOIN journal_lines jl
          ON jl.account_id = a.id
         AND jl.company_id = ${filter.companyId}
         AND jl.line_date <= ${filter.dateTo}
         AND (jl.outlet_id IS NULL OR jl.outlet_id IN (${outletInClause}))
       WHERE a.company_id = ${filter.companyId}
         AND a.is_group = 0
         AND a.id IN (${accountInClause})
       GROUP BY a.id, a.code, a.name, a.type_name, a.report_group, a.normal_balance
       ORDER BY a.code ASC`;
  const worksheetResult = await worksheetQuery.execute(db);
  const rows = worksheetResult.rows as WorksheetRow[];

  return rows.map((row) => {
    const openingDebitTotal = toNumber(row.opening_debit);
    const openingCreditTotal = toNumber(row.opening_credit);
    const openingBalance = openingDebitTotal - openingCreditTotal;
    const openingDebit = openingBalance > 0 ? openingBalance : 0;
    const openingCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0;
    const periodDebit = toNumber(row.period_debit);
    const periodCredit = toNumber(row.period_credit);
    const endingBalance = openingBalance + periodDebit - periodCredit;
    const endingDebit = endingBalance > 0 ? endingBalance : 0;
    const endingCredit = endingBalance < 0 ? Math.abs(endingBalance) : 0;
    const isBalanceSheet = row.report_group === "NRC";

    return {
      account_id: Number(row.account_id),
      account_code: row.account_code,
      account_name: row.account_name,
      type_name: row.type_name,
      report_group: row.report_group,
      normal_balance: row.normal_balance,
      opening_debit: openingDebit,
      opening_credit: openingCredit,
      period_debit: periodDebit,
      period_credit: periodCredit,
      ending_balance: endingBalance,
      ending_debit: endingDebit,
      ending_credit: endingCredit,
      total_debit: periodDebit,
      total_credit: periodCredit,
      balance: endingBalance,
      bs_debit: isBalanceSheet ? endingDebit : 0,
      bs_credit: isBalanceSheet ? endingCredit : 0,
      pl_debit: isBalanceSheet ? 0 : endingDebit,
      pl_credit: isBalanceSheet ? 0 : endingCredit
    };
  });
}
