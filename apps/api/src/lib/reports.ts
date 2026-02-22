import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";

type PosTransactionRow = RowDataPacket & {
  id: number;
  outlet_id: number;
  client_tx_id: string;
  status: "COMPLETED" | "VOID" | "REFUND";
  trx_at: Date;
  gross_total: number | string | null;
  paid_total: number | string | null;
  item_count: number | null;
};

type PosDailyRow = RowDataPacket & {
  trx_date: string;
  outlet_id: number;
  outlet_name: string | null;
  tx_count: number;
  gross_total: number | string | null;
  paid_total: number | string | null;
};

type PosPaymentRow = RowDataPacket & {
  outlet_id: number;
  outlet_name: string | null;
  method: string;
  payment_count: number;
  total_amount: number | string | null;
};

type JournalBatchRow = RowDataPacket & {
  id: number;
  outlet_id: number | null;
  outlet_name: string | null;
  doc_type: string;
  doc_id: number;
  posted_at: Date;
  total_debit: number | string;
  total_credit: number | string;
  line_count: number;
};

type TrialBalanceRow = RowDataPacket & {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number | string;
  total_credit: number | string;
  balance: number | string;
};

type BaseFilter = {
  companyId: number;
  outletIds: readonly number[];
  dateFrom: string;
  dateTo: string;
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

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function toIsoDateTime(value: Date): string {
  return new Date(value).toISOString();
}

function toDateTimeRange(dateFrom: string, dateTo: string): { fromStart: string; nextDayStart: string } {
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

async function withConsistentReadSnapshot<T>(
  connection: PoolConnection,
  callback: () => Promise<T>
): Promise<T> {
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
  try {
    const result = await callback();
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
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
  const pool = getDbPool();
  const outletClause = buildOutletInClause(filter.outletIds);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo);
  const asOf = filter.asOf ?? new Date().toISOString();

  const coreValues: Array<number | string> = [
    filter.companyId,
    range.fromStart,
    range.nextDayStart,
    asOf
  ];
  const scopeValues: Array<number | string> = [...outletClause.values];
  let statusClause = "";
  if (filter.status) {
    statusClause = " AND pt.status = ?";
    scopeValues.push(filter.status);
  }

  const connection = await pool.getConnection();
  try {
    const { rows, countRows, asOfId } = await withConsistentReadSnapshot(connection, async () => {
      let asOfId = filter.asOfId ?? null;
      if (asOfId == null) {
        const [asOfRows] = await connection.execute<RowDataPacket[]>(
          `SELECT COALESCE(MAX(pt.id), 0) AS as_of_id
           FROM pos_transactions pt
           WHERE pt.company_id = ?
             AND pt.trx_at >= ?
             AND pt.trx_at < ?
             AND pt.trx_at <= ?${outletClause.sql}${statusClause}`,
          [...coreValues, ...scopeValues]
        );
        asOfId = Number(asOfRows[0]?.as_of_id ?? 0);
      }

      const [rows] = await connection.execute<PosTransactionRow[]>(
        `SELECT pt.id,
                pt.outlet_id,
                pt.client_tx_id,
                pt.status,
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
          WHERE pt.company_id = ?
            AND pt.trx_at >= ?
            AND pt.trx_at < ?
            AND pt.trx_at <= ?
            AND pt.id <= ?${outletClause.sql}${statusClause}
          ORDER BY pt.trx_at DESC, pt.id DESC
          LIMIT ? OFFSET ?`,
        [...coreValues, asOfId, ...scopeValues, filter.limit, filter.offset]
      );

      const [countRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM pos_transactions pt
         WHERE pt.company_id = ?
            AND pt.trx_at >= ?
            AND pt.trx_at < ?
            AND pt.trx_at <= ?
            AND pt.id <= ?${outletClause.sql}${statusClause}`,
        [...coreValues, asOfId, ...scopeValues]
      );

      return {
        rows,
        countRows,
        asOfId
      };
    });

    return {
      as_of: asOf,
      as_of_id: asOfId,
      total: Number(countRows[0]?.total ?? 0),
      transactions: rows.map((row) => ({
        id: Number(row.id),
        outlet_id: Number(row.outlet_id),
        client_tx_id: row.client_tx_id,
        status: row.status,
        trx_at: toIsoDateTime(row.trx_at),
        gross_total: toNumber(row.gross_total),
        paid_total: toNumber(row.paid_total),
        item_count: Number(row.item_count ?? 0)
      }))
    };
  } finally {
    connection.release();
  }
}

export async function listDailySalesSummary(
  filter: BaseFilter & { status?: "COMPLETED" | "VOID" | "REFUND" }
) {
  const pool = getDbPool();
  const outletClause = buildOutletInClause(filter.outletIds);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo);

  const viewValues: Array<number | string> = [
    filter.companyId,
    filter.dateFrom,
    filter.dateTo,
    ...outletClause.values
  ];
  let statusClause = "";
  if (filter.status) {
    statusClause = " AND pt.status = ?";
    viewValues.push(filter.status);
  }

  let rows: PosDailyRow[] = [];
  try {
    const [viewRows] = await pool.execute<PosDailyRow[]>(
      `SELECT v.trx_date,
              v.outlet_id,
              o.name AS outlet_name,
              SUM(v.tx_count) AS tx_count,
              SUM(v.gross_total) AS gross_total,
              SUM(v.paid_total) AS paid_total
       FROM v_pos_daily_totals v
       LEFT JOIN outlets o ON o.id = v.outlet_id
        WHERE v.company_id = ?
          AND v.trx_date BETWEEN ? AND ?${outletClause.sql.replaceAll("pt.", "v.")}${statusClause.replaceAll("pt.", "v.")}
        GROUP BY v.trx_date, v.outlet_id, o.name
        ORDER BY v.trx_date DESC, v.outlet_id ASC`,
      viewValues
    );
    rows = viewRows;
  } catch (error) {
    if (!shouldFallbackDailySalesView(error)) {
      throw error;
    }

    const [fallbackRows] = await pool.execute<PosDailyRow[]>(
      `SELECT DATE(pt.trx_at) AS trx_date,
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
        WHERE pt.company_id = ?
          AND pt.trx_at >= ?
          AND pt.trx_at < ?${outletClause.sql}${statusClause}
         GROUP BY DATE(pt.trx_at), pt.outlet_id, o.name
         ORDER BY DATE(pt.trx_at) DESC, pt.outlet_id ASC`,
      [
        filter.companyId,
        range.fromStart,
        range.nextDayStart,
        ...outletClause.values,
        ...(filter.status ? [filter.status] : [])
      ]
    );
    rows = fallbackRows;
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
  const pool = getDbPool();
  const outletClause = buildOutletInClause(filter.outletIds);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo);

  const values: Array<number | string> = [
    filter.companyId,
    range.fromStart,
    range.nextDayStart,
    ...outletClause.values
  ];

  let statusClause = "";
  if (filter.status) {
    statusClause = " AND pt.status = ?";
    values.push(filter.status);
  }

  const [rows] = await pool.execute<PosPaymentRow[]>(
    `SELECT pt.outlet_id,
            o.name AS outlet_name,
            ptp.method,
            COUNT(*) AS payment_count,
            COALESCE(SUM(ptp.amount), 0) AS total_amount
     FROM pos_transaction_payments ptp
     INNER JOIN pos_transactions pt ON pt.id = ptp.pos_transaction_id
     LEFT JOIN outlets o ON o.id = pt.outlet_id
     WHERE pt.company_id = ?
       AND pt.trx_at >= ?
       AND pt.trx_at < ?${outletClause.sql}${statusClause}
     GROUP BY pt.outlet_id, o.name, ptp.method
     ORDER BY pt.outlet_id ASC, ptp.method ASC`,
    values
  );

  return rows.map((row) => ({
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
  const pool = getDbPool();
  const outletClause = buildOutletInClauseForJournals(filter.outletIds, filter.includeUnassignedOutlet ?? true);
  const range = toDateTimeRange(filter.dateFrom, filter.dateTo);
  const asOf = filter.asOf ?? new Date().toISOString();
  const coreValues: Array<number | string> = [
    filter.companyId,
    range.fromStart,
    range.nextDayStart,
    asOf
  ];
  const scopeValues: Array<number | string> = [...outletClause.values];
  const connection = await pool.getConnection();
  try {
    const { rows, countRows, asOfId } = await withConsistentReadSnapshot(connection, async () => {
      let asOfId = filter.asOfId ?? null;
      if (asOfId == null) {
        const [asOfRows] = await connection.execute<RowDataPacket[]>(
          `SELECT COALESCE(MAX(jb.id), 0) AS as_of_id
           FROM journal_batches jb
           WHERE jb.company_id = ?
             AND jb.posted_at >= ?
             AND jb.posted_at < ?
             AND jb.posted_at <= ?${outletClause.sql}`,
          [...coreValues, ...scopeValues]
        );
        asOfId = Number(asOfRows[0]?.as_of_id ?? 0);
      }

      const [rows] = await connection.execute<JournalBatchRow[]>(
        `SELECT jb.id,
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
          WHERE jb.company_id = ?
            AND jb.posted_at >= ?
            AND jb.posted_at < ?
            AND jb.posted_at <= ?
            AND jb.id <= ?${outletClause.sql}
          GROUP BY jb.id, jb.outlet_id, o.name, jb.doc_type, jb.doc_id, jb.posted_at
          ORDER BY jb.posted_at DESC, jb.id DESC
         LIMIT ? OFFSET ?`,
        [...coreValues, asOfId, ...scopeValues, filter.limit, filter.offset]
      );

      const [countRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM journal_batches jb
         WHERE jb.company_id = ?
            AND jb.posted_at >= ?
            AND jb.posted_at < ?
            AND jb.posted_at <= ?
            AND jb.id <= ?${outletClause.sql}`,
        [...coreValues, asOfId, ...scopeValues]
      );

      return {
        rows,
        countRows,
        asOfId
      };
    });

    return {
      as_of: asOf,
      as_of_id: asOfId,
      total: Number(countRows[0]?.total ?? 0),
      journals: rows.map((row) => ({
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
  } finally {
    connection.release();
  }
}

export async function getTrialBalance(filter: TrialBalanceFilter) {
  const pool = getDbPool();

  if (filter.outletIds.length === 0) {
    return [];
  }

  const placeholders = filter.outletIds.map(() => "?").join(", ");
  const outletPredicate = filter.includeUnassignedOutlet ?? true
    ? `(jl.outlet_id IS NULL OR jl.outlet_id IN (${placeholders}))`
    : `jl.outlet_id IN (${placeholders})`;
  const asOfDate = filter.asOf ? filter.asOf.slice(0, 10) : filter.dateTo;
  const [rows] = await pool.execute<TrialBalanceRow[]>(
    `SELECT jl.account_id,
            a.code AS account_code,
            a.name AS account_name,
            SUM(jl.debit) AS total_debit,
            SUM(jl.credit) AS total_credit,
            SUM(jl.debit - jl.credit) AS balance
     FROM journal_lines jl
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE jl.company_id = ?
        AND jl.line_date BETWEEN ? AND ?
        AND ${outletPredicate}
      GROUP BY jl.account_id, a.code, a.name
      ORDER BY a.code ASC`,
    [filter.companyId, filter.dateFrom, asOfDate, ...filter.outletIds]
  );

  return rows.map((row) => ({
    account_id: Number(row.account_id),
    account_code: row.account_code,
    account_name: row.account_name,
    total_debit: toNumber(row.total_debit),
    total_credit: toNumber(row.total_credit),
    balance: toNumber(row.balance)
  }));
}
