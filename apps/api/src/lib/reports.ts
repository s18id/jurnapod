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

type GeneralLedgerRow = RowDataPacket & {
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

type GeneralLedgerLineRow = RowDataPacket & {
  line_id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  line_date: Date;
  debit: number | string;
  credit: number | string;
  description: string;
  outlet_id: number | null;
  outlet_name: string | null;
  journal_batch_id: number;
  doc_type: string;
  doc_id: number;
  posted_at: Date;
};

type ProfitLossRow = RowDataPacket & {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number | string | null;
  total_credit: number | string | null;
};

type WorksheetRow = RowDataPacket & {
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

function toIsoDateTime(value: Date): string {
  return new Date(value).toISOString();
}

function toIsoDate(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
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

export async function getGeneralLedgerDetail(filter: GeneralLedgerFilter) {
  const pool = getDbPool();

  if (filter.outletIds.length === 0) {
    return [];
  }

  const outletClause = buildOutletPredicate(
    "jl.outlet_id",
    filter.outletIds,
    filter.includeUnassignedOutlet ?? true
  );

  const accountClause = typeof filter.accountId === "number"
    ? { sql: "AND a.id = ?", values: [filter.accountId] }
    : { sql: "", values: [] as number[] };

  const lineAccountClause = typeof filter.accountId === "number"
    ? { sql: "AND jl.account_id = ?", values: [filter.accountId] }
    : { sql: "", values: [] as number[] };

  const shouldLimitLines = typeof filter.accountId === "number" && typeof filter.lineLimit === "number";
  const lineOffset = filter.lineOffset ?? 0;
  const lineLimitClause = shouldLimitLines ? "LIMIT ? OFFSET ?" : "";
  const lineLimitValues = shouldLimitLines
    ? [filter.lineLimit as number, lineOffset]
    : [];

  let pagedOpeningDelta = 0;
  if (shouldLimitLines && lineOffset > 0) {
    const [priorRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(prior.debit - prior.credit), 0) AS balance
       FROM (
         SELECT jl.debit, jl.credit
         FROM journal_lines jl
         WHERE jl.company_id = ?
           AND jl.line_date BETWEEN ? AND ?
           AND ${outletClause.sql}
           ${lineAccountClause.sql}
         ORDER BY jl.line_date ASC, jl.id ASC
         LIMIT ?
       ) prior`,
      [
        filter.companyId,
        filter.dateFrom,
        filter.dateTo,
        ...outletClause.values,
        ...lineAccountClause.values,
        lineOffset
      ]
    );
    pagedOpeningDelta = toNumber(priorRows[0]?.balance);
  }

  const [rows] = await pool.execute<GeneralLedgerRow[]>(
    `SELECT a.id AS account_id,
            a.code AS account_code,
            a.name AS account_name,
            a.report_group,
            a.normal_balance,
            SUM(CASE WHEN jl.line_date < ? THEN jl.debit ELSE 0 END) AS opening_debit,
            SUM(CASE WHEN jl.line_date < ? THEN jl.credit ELSE 0 END) AS opening_credit,
            SUM(CASE WHEN jl.line_date BETWEEN ? AND ? THEN jl.debit ELSE 0 END) AS period_debit,
            SUM(CASE WHEN jl.line_date BETWEEN ? AND ? THEN jl.credit ELSE 0 END) AS period_credit
     FROM accounts a
      LEFT JOIN journal_lines jl
        ON jl.account_id = a.id
       AND jl.company_id = ?
       AND ${outletClause.sql}
     WHERE a.company_id = ?
       AND a.is_group = 0
       ${accountClause.sql}
      GROUP BY a.id, a.code, a.name, a.report_group, a.normal_balance
      ORDER BY a.code ASC`,
    [
      filter.dateFrom,
      filter.dateFrom,
      filter.dateFrom,
      filter.dateTo,
      filter.dateFrom,
      filter.dateTo,
      filter.companyId,
      ...outletClause.values,
      filter.companyId,
      ...accountClause.values
    ]
  );

  const [lineRows] = await pool.execute<GeneralLedgerLineRow[]>(
    `SELECT jl.id AS line_id,
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
     WHERE jl.company_id = ?
       AND jl.line_date BETWEEN ? AND ?
       AND ${outletClause.sql}
       ${lineAccountClause.sql}
     ORDER BY a.code ASC, jl.line_date ASC, jl.id ASC
     ${lineLimitClause}`,
    [
      filter.companyId,
      filter.dateFrom,
      filter.dateTo,
      ...outletClause.values,
      ...lineAccountClause.values,
      ...lineLimitValues
    ]
  );

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
}

export async function getProfitLoss(filter: ProfitLossFilter) {
  const pool = getDbPool();

  if (filter.outletIds.length === 0) {
    return { rows: [], totals: { total_debit: 0, total_credit: 0, net: 0 } };
  }

  const outletClause = buildOutletPredicate(
    "jl.outlet_id",
    filter.outletIds,
    filter.includeUnassignedOutlet ?? true
  );

  const [rows] = await pool.execute<ProfitLossRow[]>(
    `SELECT a.id AS account_id,
            a.code AS account_code,
            a.name AS account_name,
            SUM(jl.debit) AS total_debit,
            SUM(jl.credit) AS total_credit
     FROM journal_lines jl
     INNER JOIN accounts a ON a.id = jl.account_id
     LEFT JOIN account_types at
       ON at.id = a.account_type_id
      AND at.company_id = a.company_id
     WHERE jl.company_id = ?
       AND jl.line_date BETWEEN ? AND ?
       AND COALESCE(a.report_group, at.report_group) = 'LR'
       AND a.is_group = 0
       AND ${outletClause.sql}
     GROUP BY a.id, a.code, a.name
     ORDER BY a.code ASC`,
    [filter.companyId, filter.dateFrom, filter.dateTo, ...outletClause.values]
  );

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
}

export async function getTrialBalanceWorksheet(filter: WorksheetFilter) {
  const pool = getDbPool();

  if (filter.outletIds.length === 0) {
    return [];
  }

  const outletClause = buildOutletPredicate(
    "jl.outlet_id",
    filter.outletIds,
    filter.includeUnassignedOutlet ?? true
  );

  const [rows] = await pool.execute<WorksheetRow[]>(
    `SELECT a.id AS account_id,
            a.code AS account_code,
            a.name AS account_name,
            a.type_name,
            a.report_group,
            a.normal_balance,
            SUM(CASE WHEN jl.line_date < ? THEN jl.debit ELSE 0 END) AS opening_debit,
            SUM(CASE WHEN jl.line_date < ? THEN jl.credit ELSE 0 END) AS opening_credit,
            SUM(CASE WHEN jl.line_date BETWEEN ? AND ? THEN jl.debit ELSE 0 END) AS period_debit,
            SUM(CASE WHEN jl.line_date BETWEEN ? AND ? THEN jl.credit ELSE 0 END) AS period_credit
     FROM accounts a
      LEFT JOIN journal_lines jl
        ON jl.account_id = a.id
       AND jl.company_id = ?
       AND jl.line_date <= ?
       AND ${outletClause.sql}
     WHERE a.company_id = ?
       AND a.is_group = 0
     GROUP BY a.id, a.code, a.name, a.type_name, a.report_group, a.normal_balance
     ORDER BY a.code ASC`,
    [
      filter.dateFrom,
      filter.dateFrom,
      filter.dateFrom,
      filter.dateTo,
      filter.dateFrom,
      filter.dateTo,
      filter.companyId,
      filter.dateTo,
      ...outletClause.values,
      filter.companyId
    ]
  );

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
