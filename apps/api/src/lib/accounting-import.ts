import { createHash } from "crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "./db";

type ParsedFile = {
  fileName: string;
  text: string;
  hash: string;
};

type AccountRow = {
  code: string;
  name: string;
  typeName: string | null;
  isGroup: boolean;
};

type TrnsRow = {
  transactionId: number;
  date: string;
  ref: string | null;
  description: string | null;
};

type AlkRow = {
  allocationId: number;
  transactionId: number;
  date: string;
  ref: string | null;
  description: string | null;
  accountCode: string;
  normalBalance: "D" | "K";
  amount: number;
};

type ImportResult = {
  importId: number;
  duplicate: boolean;
  totals: {
    accounts: number;
    trns: number;
    alk: number;
    journal_batches: number;
    journal_lines: number;
  };
};

const ACCOUNT_TYPE_MAPPING: Record<
  string,
  {
    normalBalance: "D" | "K";
    reportGroup: "NRC" | "LR";
  }
> = {
  Kas: { normalBalance: "D", reportGroup: "NRC" },
  Bank: { normalBalance: "D", reportGroup: "NRC" },
  "Akun Piutang": { normalBalance: "D", reportGroup: "NRC" },
  "Aktiva Lancar Lainnya": { normalBalance: "D", reportGroup: "NRC" },
  "Aktiva Tetap": { normalBalance: "D", reportGroup: "NRC" },
  "Kontra Aktiva": { normalBalance: "K", reportGroup: "NRC" },
  "Akun Hutang": { normalBalance: "K", reportGroup: "NRC" },
  "Akun Hutang Lainnya": { normalBalance: "K", reportGroup: "NRC" },
  Ekuitas: { normalBalance: "K", reportGroup: "NRC" },
  "Kontra Ekuitas": { normalBalance: "D", reportGroup: "NRC" },
  Pendapatan: { normalBalance: "K", reportGroup: "LR" },
  "Beban Administrasi dan Umum": { normalBalance: "D", reportGroup: "LR" },
  "Beban Lain-lain": { normalBalance: "D", reportGroup: "LR" },
  "Beban Pajak Perusahaan": { normalBalance: "D", reportGroup: "LR" }
};

const MONTHS_ID: Record<string, string> = {
  januari: "01",
  februari: "02",
  maret: "03",
  april: "04",
  mei: "05",
  juni: "06",
  juli: "07",
  agustus: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12"
};

function createFileHash(buffers: Buffer[]): string {
  const hash = createHash("sha256");
  for (const buffer of buffers) {
    hash.update(buffer);
  }
  return hash.digest("hex");
}

function detectDelimiter(line: string): string {
  if (line.includes("\t")) {
    return "\t";
  }
  return ",";
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

function parseDelimitedText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error("CSV is empty");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => parseDelimitedLine(line, delimiter));

  return { headers, rows };
}

function normalizeHeader(header: string): string {
  return header.trim().toUpperCase();
}

function getRequiredColumnIndex(headers: string[], name: string): number {
  const index = headers.findIndex((header) => normalizeHeader(header) === name);
  if (index === -1) {
    throw new Error(`Missing required column: ${name}`);
  }
  return index;
}

function parseIndonesianDate(input: string): string {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) {
    throw new Error(`Invalid date: ${input}`);
  }

  const day = parts[0].padStart(2, "0");
  const monthKey = parts[1].toLowerCase();
  const month = MONTHS_ID[monthKey];
  const year = parts[2];

  if (!month || !/^\d{4}$/.test(year)) {
    throw new Error(`Invalid date: ${input}`);
  }

  return `${year}-${month}-${day}`;
}

function normalizeAmount(input: string): number {
  const cleaned = input
    .replace(/Rp/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!cleaned) {
    return 0;
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid amount: ${input}`);
  }

  return parsed;
}

function parseAccounts(text: string): AccountRow[] {
  const { headers, rows } = parseDelimitedText(text);
  const codeIndex = getRequiredColumnIndex(headers, "KODE");
  const nameIndex = getRequiredColumnIndex(headers, "NAMA AKUN");
  const typeIndex = getRequiredColumnIndex(headers, "TIPE AKUN");

  return rows
    .map((row) => {
      const code = (row[codeIndex] ?? "").trim();
      const name = (row[nameIndex] ?? "").trim();
      const typeName = (row[typeIndex] ?? "").trim();

      if (!code || !name) {
        return null;
      }

      const normalizedTypeName = typeName.length === 0 ? null : typeName;
      return {
        code,
        name,
        typeName: normalizedTypeName,
        isGroup: normalizedTypeName == null
      };
    })
    .filter((row): row is AccountRow => row !== null);
}

function parseTransactions(text: string): TrnsRow[] {
  const { headers, rows } = parseDelimitedText(text);
  const idIndex = getRequiredColumnIndex(headers, "ID TRANSAKSI");
  const dateIndex = getRequiredColumnIndex(headers, "TANGGAL");
  const refIndex = getRequiredColumnIndex(headers, "REF");
  const descriptionIndex = getRequiredColumnIndex(headers, "KETERANGAN");

  return rows
    .map((row) => {
      const rawId = (row[idIndex] ?? "").trim();
      const rawDate = (row[dateIndex] ?? "").trim();
      const rawRef = (row[refIndex] ?? "").trim();
      const rawDescription = (row[descriptionIndex] ?? "").trim();

      if (!rawId || !rawDate) {
        return null;
      }

      const transactionId = Number.parseInt(rawId, 10);
      if (!Number.isFinite(transactionId) || transactionId <= 0) {
        throw new Error(`Invalid transaction id: ${rawId}`);
      }

      return {
        transactionId,
        date: parseIndonesianDate(rawDate),
        ref: rawRef.length > 0 ? rawRef : null,
        description: rawDescription.length > 0 ? rawDescription : null
      };
    })
    .filter((row): row is TrnsRow => row !== null);
}

function parseAllocations(text: string): AlkRow[] {
  const { headers, rows } = parseDelimitedText(text);
  const allocationIndex = getRequiredColumnIndex(headers, "ID ALOKASI");
  const transactionIndex = getRequiredColumnIndex(headers, "ID TRANSAKSI");
  const dateIndex = getRequiredColumnIndex(headers, "TANGGAL");
  const refIndex = getRequiredColumnIndex(headers, "REF");
  const descriptionIndex = getRequiredColumnIndex(headers, "KETERANGAN");
  const codeIndex = getRequiredColumnIndex(headers, "KODE");
  const snIndex = getRequiredColumnIndex(headers, "SN");
  const amountIndex = getRequiredColumnIndex(headers, "JUMLAH");

  return rows
    .map((row) => {
      const rawAllocationId = (row[allocationIndex] ?? "").trim();
      const rawTransactionId = (row[transactionIndex] ?? "").trim();
      const rawDate = (row[dateIndex] ?? "").trim();
      const rawRef = (row[refIndex] ?? "").trim();
      const rawDescription = (row[descriptionIndex] ?? "").trim();
      const rawCode = (row[codeIndex] ?? "").trim();
      const rawSn = (row[snIndex] ?? "").trim().toUpperCase();
      const rawAmount = (row[amountIndex] ?? "").trim();

      if (!rawAllocationId || !rawTransactionId || !rawDate || !rawCode || !rawSn) {
        return null;
      }

      const allocationId = Number.parseInt(rawAllocationId, 10);
      const transactionId = Number.parseInt(rawTransactionId, 10);
      if (!Number.isFinite(allocationId) || allocationId <= 0) {
        throw new Error(`Invalid allocation id: ${rawAllocationId}`);
      }
      if (!Number.isFinite(transactionId) || transactionId <= 0) {
        throw new Error(`Invalid transaction id: ${rawTransactionId}`);
      }

      if (rawSn !== "D" && rawSn !== "K") {
        throw new Error(`Invalid SN value: ${rawSn}`);
      }

      return {
        allocationId,
        transactionId,
        date: parseIndonesianDate(rawDate),
        ref: rawRef.length > 0 ? rawRef : null,
        description: rawDescription.length > 0 ? rawDescription : null,
        accountCode: rawCode,
        normalBalance: rawSn,
        amount: normalizeAmount(rawAmount)
      };
    })
    .filter((row): row is AlkRow => row !== null);
}

function getParentCode(code: string, groupCodes: Set<string>): string | null {
  const segments = code.split("-");
  if (segments.length < 2) {
    return null;
  }

  const last = segments[segments.length - 1];
  if (last.length < 2) {
    return null;
  }

  const parentLast = `${last.slice(0, -2)}00`;
  const candidate = [...segments.slice(0, -1), parentLast].join("-");
  return groupCodes.has(candidate) ? candidate : null;
}

async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function upsertAccounts(connection: PoolConnection, companyId: number, accounts: AccountRow[]) {
  if (accounts.length === 0) {
    return;
  }

  const rows = accounts.map((account) => {
    const mapping = account.typeName ? ACCOUNT_TYPE_MAPPING[account.typeName] : null;
    return {
      code: account.code,
      name: account.name,
      typeName: account.typeName,
      normalBalance: mapping?.normalBalance ?? null,
      reportGroup: mapping?.reportGroup ?? null,
      isGroup: account.isGroup ? 1 : 0
    };
  });

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.flatMap((row) => [
      companyId,
      row.code,
      row.name,
      row.typeName,
      row.normalBalance,
      row.reportGroup,
      row.isGroup
    ]);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");

    await connection.execute(
      `INSERT INTO accounts (
         company_id,
         code,
         name,
         type_name,
         normal_balance,
         report_group,
         is_group
       ) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         type_name = VALUES(type_name),
         normal_balance = VALUES(normal_balance),
         report_group = VALUES(report_group),
         is_group = VALUES(is_group)`,
      values
    );
  }
}

async function updateAccountParents(
  connection: PoolConnection,
  companyId: number,
  accounts: AccountRow[]
): Promise<Map<string, number>> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, code
     FROM accounts
     WHERE company_id = ?`,
    [companyId]
  );
  const accountIdByCode = new Map<string, number>();
  for (const row of rows) {
    accountIdByCode.set(String(row.code), Number(row.id));
  }

  const groupCodes = new Set(accounts.filter((account) => account.isGroup).map((account) => account.code));

  for (const account of accounts) {
    const parentCode = getParentCode(account.code, groupCodes);
    if (!parentCode) {
      continue;
    }
    const parentId = accountIdByCode.get(parentCode);
    const accountId = accountIdByCode.get(account.code);
    if (!parentId || !accountId) {
      continue;
    }

    await connection.execute(
      `UPDATE accounts
       SET parent_account_id = ?
       WHERE id = ?
         AND company_id = ?`,
      [parentId, accountId, companyId]
    );
  }

  return accountIdByCode;
}

async function insertJournalBatches(
  connection: PoolConnection,
  companyId: number,
  trnsRows: TrnsRow[]
): Promise<Map<number, number>> {
  if (trnsRows.length === 0) {
    return new Map();
  }

  const values = trnsRows.flatMap((row) => [
    companyId,
    null,
    "IMPORT_TRX",
    row.transactionId,
    `${row.date} 00:00:00`
  ]);
  const placeholders = trnsRows.map(() => "(?, ?, ?, ?, ?)").join(", ");

  await connection.execute(
    `INSERT INTO journal_batches (
       company_id,
       outlet_id,
       doc_type,
       doc_id,
       posted_at
     ) VALUES ${placeholders}`,
    values
  );

  const [batchRows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, doc_id
     FROM journal_batches
     WHERE company_id = ?
       AND doc_type = 'IMPORT_TRX'
       AND doc_id IN (${trnsRows.map(() => "?").join(", ")})`,
    [companyId, ...trnsRows.map((row) => row.transactionId)]
  );

  const batchMap = new Map<number, number>();
  for (const row of batchRows) {
    batchMap.set(Number(row.doc_id), Number(row.id));
  }

  return batchMap;
}

async function insertJournalLines(
  connection: PoolConnection,
  companyId: number,
  alkRows: AlkRow[],
  batchMap: Map<number, number>,
  accountIdByCode: Map<string, number>,
  trnsById: Map<number, TrnsRow>
) {
  if (alkRows.length === 0) {
    return;
  }

  const values: Array<string | number | null> = [];
  const placeholders: string[] = [];
  for (const row of alkRows) {
    const batchId = batchMap.get(row.transactionId);
    const accountId = accountIdByCode.get(row.accountCode);
    if (!batchId || !accountId) {
      throw new Error(`Missing journal batch or account for transaction ${row.transactionId} (${row.accountCode})`);
    }

    const trns = trnsById.get(row.transactionId);
    const description = row.description ?? trns?.description ?? "";
    const debit = row.normalBalance === "D" ? row.amount : 0;
    const credit = row.normalBalance === "K" ? row.amount : 0;

    placeholders.push("(?, ?, ?, ?, ?, ?, ?, ?)");
    values.push(
      batchId,
      companyId,
      null,
      accountId,
      row.date,
      debit,
      credit,
      description
    );
  }

  const chunkSize = 200;
  for (let i = 0; i < placeholders.length; i += chunkSize) {
    const chunkPlaceholders = placeholders.slice(i, i + chunkSize);
    const chunkValues = values.slice(i * 8, (i + chunkSize) * 8);
    await connection.execute(
      `INSERT INTO journal_lines (
         journal_batch_id,
         company_id,
         outlet_id,
         account_id,
         line_date,
         debit,
         credit,
         description
       ) VALUES ${chunkPlaceholders.join(", ")}`,
      chunkValues
    );
  }
}

async function updateCurrentBalances(
  connection: PoolConnection,
  companyId: number,
  alkRows: AlkRow[],
  accountIdByCode: Map<string, number>
): Promise<void> {
  if (alkRows.length === 0) {
    return;
  }

  const totals = new Map<number, { debit: number; credit: number }>();
  let maxDate = "0000-00-00";
  for (const row of alkRows) {
    const accountId = accountIdByCode.get(row.accountCode);
    if (!accountId) {
      continue;
    }
    const aggregate = totals.get(accountId) ?? { debit: 0, credit: 0 };
    if (row.normalBalance === "D") {
      aggregate.debit += row.amount;
    } else {
      aggregate.credit += row.amount;
    }
    totals.set(accountId, aggregate);
    if (row.date > maxDate) {
      maxDate = row.date;
    }
  }

  if (totals.size === 0) {
    return;
  }

  const values: Array<string | number> = [];
  const placeholders: string[] = [];
  for (const [accountId, aggregate] of totals.entries()) {
    placeholders.push("(?, ?, ?, ?, ?, ?)");
    values.push(
      companyId,
      accountId,
      maxDate,
      aggregate.debit,
      aggregate.credit,
      aggregate.debit - aggregate.credit
    );
  }

  if (placeholders.length === 0) {
    return;
  }

  await connection.execute(
    `INSERT INTO account_balances_current (
       company_id,
       account_id,
       as_of_date,
       debit_total,
       credit_total,
       balance
     ) VALUES ${placeholders.join(", ")}
     ON DUPLICATE KEY UPDATE
       debit_total = debit_total + VALUES(debit_total),
       credit_total = credit_total + VALUES(credit_total),
       balance = (debit_total + VALUES(debit_total)) - (credit_total + VALUES(credit_total)),
       as_of_date = GREATEST(as_of_date, VALUES(as_of_date))`,
    values
  );
}

function buildParsedFile(fileName: string, text: string): ParsedFile {
  const buffer = Buffer.from(text, "utf8");
  return {
    fileName,
    text,
    hash: createFileHash([buffer])
  };
}

export async function importAccountingCsv(input: {
  companyId: number;
  userId: number;
  accountsFile: ParsedFile;
  transactionsFile: ParsedFile;
  allocationsFile: ParsedFile;
}): Promise<ImportResult> {
  const accounts = parseAccounts(input.accountsFile.text);
  const trnsRows = parseTransactions(input.transactionsFile.text);
  const alkRows = parseAllocations(input.allocationsFile.text);

  if (accounts.length === 0) {
    throw new Error("No accounts found in DA");
  }
  if (trnsRows.length === 0 || alkRows.length === 0) {
    throw new Error("TRNS or ALK is empty");
  }

  const transactionMap = new Map<number, TrnsRow>();
  for (const row of trnsRows) {
    if (transactionMap.has(row.transactionId)) {
      throw new Error(`Duplicate transaction id: ${row.transactionId}`);
    }
    transactionMap.set(row.transactionId, row);
  }

  const accountCodeSet = new Set(accounts.map((account) => account.code));
  for (const account of accounts) {
    if (!account.isGroup && account.typeName && !ACCOUNT_TYPE_MAPPING[account.typeName]) {
      throw new Error(`Unknown account type: ${account.typeName}`);
    }
  }

  const transactionTotals = new Map<number, { debit: number; credit: number }>();
  for (const row of alkRows) {
    if (!transactionMap.has(row.transactionId)) {
      throw new Error(`Missing TRNS for transaction ${row.transactionId}`);
    }
    if (!accountCodeSet.has(row.accountCode)) {
      throw new Error(`Account code not found in DA: ${row.accountCode}`);
    }

    const total = transactionTotals.get(row.transactionId) ?? { debit: 0, credit: 0 };
    if (row.normalBalance === "D") {
      total.debit += row.amount;
    } else {
      total.credit += row.amount;
    }
    transactionTotals.set(row.transactionId, total);
  }

  for (const [transactionId, totals] of transactionTotals.entries()) {
    if (Math.abs(totals.debit - totals.credit) > 0.005) {
      throw new Error(`Transaction ${transactionId} is not balanced`);
    }
  }

  const fileHash = createFileHash([
    Buffer.from(input.accountsFile.text, "utf8"),
    Buffer.from(input.transactionsFile.text, "utf8"),
    Buffer.from(input.allocationsFile.text, "utf8")
  ]);

  const pool = getDbPool();
  const [existingRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status
     FROM data_imports
     WHERE company_id = ?
       AND file_hash = ?
     LIMIT 1`,
    [input.companyId, fileHash]
  );
  if (existingRows.length > 0) {
    return {
      importId: Number(existingRows[0].id),
      duplicate: true,
      totals: {
        accounts: 0,
        trns: 0,
        alk: 0,
        journal_batches: 0,
        journal_lines: 0
      }
    };
  }

  return await withTransaction(async (connection) => {
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO data_imports (
         company_id,
         accounts_file_name,
         transactions_file_name,
         allocations_file_name,
         file_hash,
         status,
         created_by
       ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        input.companyId,
        input.accountsFile.fileName,
        input.transactionsFile.fileName,
        input.allocationsFile.fileName,
        fileHash,
        input.userId
      ]
    );
    const importId = Number(insertResult.insertId);

    await upsertAccounts(connection, input.companyId, accounts);
    const accountIdByCode = await updateAccountParents(connection, input.companyId, accounts);

    const batchMap = await insertJournalBatches(connection, input.companyId, trnsRows);
    await insertJournalLines(connection, input.companyId, alkRows, batchMap, accountIdByCode, transactionMap);
    await updateCurrentBalances(connection, input.companyId, alkRows, accountIdByCode);

    await connection.execute(
      `UPDATE data_imports
       SET status = 'COMPLETED',
           counts_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        JSON.stringify({
          accounts: accounts.length,
          trns: trnsRows.length,
          alk: alkRows.length,
          journal_batches: batchMap.size,
          journal_lines: alkRows.length
        }),
        importId
      ]
    );

    return {
      importId,
      duplicate: false,
      totals: {
        accounts: accounts.length,
        trns: trnsRows.length,
        alk: alkRows.length,
        journal_batches: batchMap.size,
        journal_lines: alkRows.length
      }
    };
  });
}

export function parseImportFiles(input: {
  accountsFileName: string;
  accountsText: string;
  transactionsFileName: string;
  transactionsText: string;
  allocationsFileName: string;
  allocationsText: string;
}) {
  return {
    accountsFile: buildParsedFile(input.accountsFileName, input.accountsText),
    transactionsFile: buildParsedFile(input.transactionsFileName, input.transactionsText),
    allocationsFile: buildParsedFile(input.allocationsFileName, input.allocationsText)
  };
}
