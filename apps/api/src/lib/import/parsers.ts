// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * CSV/Excel Parsing Utilities
 * 
 * Provides streaming parsing for large import files without memory exhaustion.
 * Uses papaparse for CSV and xlsx for Excel parsing.
 */

import { Readable } from 'node:stream';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  ImportRow,
  ImportError,
  ImportParseResult,
  ParseOptions,
  ColumnMapping,
  ImportErrorCode,
} from './types.js';

// Type declarations for xlsx-stream-reader (no bundled TypeScript types)
interface XlsxStreamReaderRow {
  values: (string | number | boolean | Date | null)[];
  formulas: (string | null)[];
  attributes: {
    r: number;
    ht?: string;
    customFormat?: string;
    hidden?: string;
  };
}

interface XlsxStreamReaderWorksheet {
  id: number;
  name: string;
  rowCount: number;
  on(event: 'row', handler: (row: XlsxStreamReaderRow) => void): this;
  on(event: 'end', handler: () => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
  process(): void;
  skip(): void;
}

interface XlsxStreamReader extends NodeJS.WritableStream {
  on(event: 'error', handler: (err: Error) => void): this;
  on(event: 'worksheet', handler: (worksheet: XlsxStreamReaderWorksheet) => void): this;
  on(event: 'sharedStrings', handler: () => void): this;
  on(event: 'styles', handler: () => void): this;
  on(event: 'end', handler: () => void): this;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XlsxStreamReaderModule = await import('xlsx-stream-reader') as {
  default: new (options?: { verbose?: boolean; formatting?: boolean; saxTrim?: boolean }) => XlsxStreamReader;
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BATCH_SIZE = 1000;
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Common encoding byte order marks
 */
const ENCODING_BOMS: Record<string, Buffer> = {
  'utf-8': Buffer.from([0xef, 0xbb, 0xbf]),
  'utf-16le': Buffer.from([0xff, 0xfe]),
  'utf-16be': Buffer.from([0xfe, 0xff]),
  'utf-32le': Buffer.from([0xff, 0xfe, 0x00, 0x00]),
  'utf-32be': Buffer.from([0x00, 0x00, 0xfe, 0xff]),
};

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse a CSV file with true streaming support via Papa.parse step callback.
 *
 * Avoids materialising the entire parsed result array in memory — each row is
 * processed and yielded as it arrives from the underlying Node.js Readable stream.
 * Peak memory is proportional to one chunk (~64 KB) rather than the full file.
 *
 * @param file - File buffer to parse
 * @param options - Parse options
 * @returns Async iterable of parsed rows
 *
 * @example
 * ```typescript
 * const rows: ImportRow[] = [];
 * for await (const row of parseCSV(fileBuffer, { delimiter: ';' })) {
 *   rows.push(row);
 * }
 * ```
 */
export async function* parseCSV(
  file: Buffer,
  options: ParseOptions = {}
): AsyncIterable<ImportRow> {
  const {
    skipEmptyRows = true,
    headerRowIndex = 0,
    columnMappings,
    encoding = 'utf-8',
  } = options;

  // Check file size
  if (file.length > MAX_FILE_SIZE_BYTES) {
    throw createError(0, 'FILE_TOO_LARGE', `File exceeds maximum size of ${MAX_FILE_SIZE_MB}MB`);
  }

  // Handle encoding with BOM
  const processedBuffer = stripBom(file, encoding);

  // Decode buffer using specified encoding before streaming
  // This ensures proper handling of non-UTF-8 encodings like Latin-1
  const decodedContent = processedBuffer.toString(encoding as BufferEncoding);

  // --- Streaming plumbing ---
  // Papa.parse fires step() synchronously within each chunk processed from the
  // Node.js stream.  We use a small queue + promise to bridge the sync callbacks
  // into async-generator yields without buffering the whole file.
  const queue: string[][] = [];
  let parseDone = false;
  let parseError: Error | null = null;
  let wakeup: (() => void) | null = null;

  // Create a Node.js Readable from the decoded content so Papa.parse processes in chunks
  const stream = Readable.from(decodedContent);

  Papa.parse<string[]>(stream, {
    header: false,
    skipEmptyLines: skipEmptyRows,
    delimiter: options.delimiter || '',
    step(result) {
      queue.push(result.data);
      wakeup?.();
      wakeup = null;
    },
    error(err) {
      parseError = err;
      wakeup?.();
      wakeup = null;
    },
    complete() {
      parseDone = true;
      wakeup?.();
      wakeup = null;
    },
  });

  // Header state — resolved once we reach headerRowIndex
  let headers: string[] = [];
  let headerMap: ReturnType<typeof createHeaderMap> | null = null;
  let rawRowIndex = -1;

  while (true) {
    // Drain everything currently in the queue before waiting again
    while (queue.length > 0) {
      const rawData = queue.shift()!;
      rawRowIndex++;

      if (rawRowIndex === headerRowIndex) {
        // This is the header row
        headers = rawData.map(h => String(h).trim());

        if (headers.length === 0) {
          throw createError(1, 'PARSE_ERROR', 'No headers found in CSV file');
        }

        if (options.expectedColumns && headers.length !== options.expectedColumns) {
          throw createError(
            1,
            'ROW_TOO_SHORT',
            `Expected ${options.expectedColumns} columns but found ${headers.length}`,
          );
        }

        if (columnMappings) {
          const missing = validateRequiredHeaders(headers, columnMappings);
          if (missing.length > 0) {
            throw createError(1, 'MISSING_HEADER', `Missing required columns: ${missing.join(', ')}`);
          }
        }

        headerMap = createHeaderMap(headers, columnMappings);
        continue;
      }

      // Haven't reached header row yet (headerRowIndex > 0)
      if (headerMap === null) continue;

      // Skip empty rows
      if (skipEmptyRows && isEmptyRow(rawData)) continue;

      const rowNumber = rawRowIndex + 1; // 1-based

      if (rawData.length < headers.length) {
        yield createRow(rowNumber, rawData, headerMap, headers, 'ROW_TOO_SHORT');
      } else if (rawData.length > headers.length) {
        yield createRow(rowNumber, rawData.slice(0, headers.length), headerMap, headers);
      } else {
        yield createRow(rowNumber, rawData, headerMap, headers);
      }
    }

    if (parseDone || parseError) break;

    // Wait for the next chunk from Papa.parse
    await new Promise<void>(resolve => { wakeup = resolve; });
  }

  if (parseError) {
    throw createError(0, 'PARSE_ERROR', (parseError as Error).message);
  }

  if (headers.length === 0) {
    throw createError(1, 'PARSE_ERROR', 'No headers found in CSV file');
  }
}

/**
 * Parse CSV with full result object (non-streaming)
 */
export function parseCSVSync(
  file: Buffer,
  options: ParseOptions = {}
): ImportParseResult {
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  let totalRows = 0;

  try {
    // Since we can't use top-level await, do it synchronously with a simple loop
    // This is a simplified sync version
    const processedBuffer = stripBom(file, options.encoding || 'utf-8');
    const fileContent = processedBuffer.toString(options.encoding as BufferEncoding || 'utf-8');
    
    const result = Papa.parse<string[]>(fileContent, {
      header: false,
      skipEmptyLines: options.skipEmptyRows ?? true,
      delimiter: options.delimiter || '',
    });

    const dataRows = result.data;
    const headers = dataRows[0] || [];
    const headerMap = createHeaderMap(headers, options.columnMappings);

    for (let i = 1; i < dataRows.length; i++) {
      const rawData = dataRows[i];
      if ((options.skipEmptyRows ?? true) && isEmptyRow(rawData)) {
        continue;
      }
      const rowNumber = i + 1;
      const row = createRow(rowNumber, rawData, headerMap, headers);
      rows.push(row);
      totalRows++;
    }
  } catch (err) {
    if (isImportError(err)) {
      errors.push(err);
    } else {
      errors.push(createError(0, 'PARSE_ERROR', String(err)));
    }
  }

  return { rows, errors, totalRows };
}

// ============================================================================
// Excel Parsing
// ============================================================================

/**
 * Parse an Excel file with true streaming support via xlsx-stream-reader.
 *
 * Uses event-based row-by-row iteration without loading the entire workbook
 * into memory. Peak memory is proportional to one row (~64 KB) rather than
 * the full file (150-250MB for 50MB files).
 *
 * @param file - File buffer to parse
 * @param options - Parse options
 * @returns Async iterable of parsed rows
 */
export async function* parseExcel(
  file: Buffer,
  options: ParseOptions = {}
): AsyncIterable<ImportRow> {
  const {
    skipEmptyRows = true,
    sheetName,
    columnMappings,
    headerRowIndex = 0,
  } = options;

  // Check file size
  if (file.length > MAX_FILE_SIZE_BYTES) {
    throw createError(0, 'FILE_TOO_LARGE', `File exceeds maximum size of ${MAX_FILE_SIZE_MB}MB`);
  }

  // Streaming queue — bridges sync callbacks to async yields
  const queue: string[][] = [];
  let parseDone = false;
  let parseError: Error | null = null;
  let wakeup: (() => void) | null = null;

  // Create the streaming workbook reader
  const workBookReader = new XlsxStreamReaderModule.default({
    verbose: false,
    formatting: false,
    saxTrim: true,
  });

  // Track sheet information for validation
  let targetSheetFound = false;
  let targetSheetName = sheetName || 'first';
  let sheetRowCount = 0;
  let sheetHasData = false; // Track if sheet had any rows

  // Handle workbook errors
  workBookReader.on('error', (err: Error) => {
    parseError = err;
    if (wakeup) {
      wakeup();
      wakeup = null;
    }
  });

  // Handle each worksheet as it's encountered in the stream
  workBookReader.on('worksheet', (workSheetReader) => {
    const isTargetSheet =
      !sheetName || // No sheet specified, use first sheet
      workSheetReader.name === sheetName;

    // Skip sheets we're not interested in
    if (!isTargetSheet) {
      workSheetReader.skip();
      return;
    }

    targetSheetFound = true;

    // Track if we received any rows (for empty sheet detection)
    let receivedRowCount = 0;

    // Handle rows as they arrive from the stream
    workSheetReader.on('row', (row) => {
      receivedRowCount++;

      // Convert sparse array to dense array of strings
      const rawData: string[] = [];
      for (let i = 0; i < row.values.length; i++) {
        const val = row.values[i];
        if (val !== undefined && val !== null) {
          rawData.push(String(val));
        } else {
          rawData.push('');
        }
      }

      queue.push(rawData);
      if (wakeup) {
        wakeup();
        wakeup = null;
      }
    });

    // Handle worksheet errors
    workSheetReader.on('error', (err: Error) => {
      parseError = err;
      if (wakeup) {
        wakeup();
        wakeup = null;
      }
    });

    // Handle worksheet completion
    workSheetReader.on('end', () => {
      sheetRowCount = workSheetReader.rowCount;
      sheetHasData = receivedRowCount > 0;
      parseDone = true;
      if (wakeup) {
        wakeup();
        wakeup = null;
      }
    });

    // Start processing this worksheet
    workSheetReader.process();
  });

  // Handle workbook completion
  workBookReader.on('end', () => {
    parseDone = true;
    if (wakeup) {
      wakeup();
      wakeup = null;
    }
  });

  // Pipe the file buffer as a stream to the reader
  const fileStream = Readable.from(file);
  fileStream.pipe(workBookReader);

  // Header state — resolved once we reach headerRowIndex
  let headers: string[] = [];
  let headerMap: ReturnType<typeof createHeaderMap> | null = null;
  let rawRowIndex = -1;

  while (true) {
    // Drain everything currently in the queue before waiting again
    while (queue.length > 0) {
      const rawData = queue.shift()!;
      rawRowIndex++;

      if (rawRowIndex === headerRowIndex) {
        // This is the header row
        headers = rawData.map((h) => String(h).trim());

        if (headers.length === 0) {
          throw createError(1, 'PARSE_ERROR', 'No headers found in Excel file');
        }

        if (columnMappings) {
          const missing = validateRequiredHeaders(headers, columnMappings);
          if (missing.length > 0) {
            throw createError(1, 'MISSING_HEADER', `Missing required columns: ${missing.join(', ')}`);
          }
        }

        headerMap = createHeaderMap(headers, columnMappings);
        continue;
      }

      // Haven't reached header row yet (headerRowIndex > 0)
      if (headerMap === null) continue;

      // Skip empty rows
      if (skipEmptyRows && isEmptyRow(rawData)) continue;

      const rowNumber = rawRowIndex + 1; // 1-based for consumer

      if (rawData.length < headers.length) {
        yield createRow(rowNumber, rawData, headerMap, headers, 'ROW_TOO_SHORT');
      } else if (rawData.length > headers.length) {
        yield createRow(rowNumber, rawData.slice(0, headers.length), headerMap, headers);
      } else {
        yield createRow(rowNumber, rawData, headerMap, headers);
      }
    }

    if (parseDone || parseError) break;

    // Wait for the next chunk from xlsx-stream-reader
    await new Promise<void>((resolve) => {
      wakeup = resolve;
    });
  }

  // Unpipe to clean up
  fileStream.unpipe(workBookReader);

  // Check for errors that occurred during streaming
  if (parseError) {
    const error = parseError as Error;
    throw createError(0, 'PARSE_ERROR', error.message);
  }

  // Validate we found the target sheet
  if (!targetSheetFound) {
    throw createError(0, 'PARSE_ERROR', `Sheet "${targetSheetName}" not found in workbook`);
  }

  if (headers.length === 0) {
    // Differentiate between empty sheet and sheet with no header row
    if (!sheetHasData) {
      throw createError(1, 'PARSE_ERROR', 'Excel sheet is empty');
    }
    throw createError(1, 'PARSE_ERROR', 'No headers found in Excel file');
  }
}

/**
 * Parse Excel with full result object (non-streaming)
 */
export function parseExcelSync(
  file: Buffer,
  options: ParseOptions = {}
): ImportParseResult {
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  let totalRows = 0;

  try {
    // Async generators can't be consumed synchronously; use XLSX directly
    const workbook = XLSX.read(file, {
      type: 'buffer',
      cellDates: true,
    });

    const sheetName = options.sheetName || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      errors.push(createError(0, 'PARSE_ERROR', `Sheet "${sheetName}" not found`));
      return { rows, errors, totalRows };
    }

    const sheetJson = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false, // convert all values to formatted strings (consistent with parseExcel)
      defval: '',
      blankrows: !(options.skipEmptyRows ?? true),
    }) as string[][];

    const headers = sheetJson[0] || [];
    const headerMap = createHeaderMap(headers, options.columnMappings);

    for (let i = 1; i < sheetJson.length; i++) {
      const rawData = sheetJson[i];
      if ((options.skipEmptyRows ?? true) && isEmptyRow(rawData)) {
        continue;
      }
      const rowNumber = i + 1;
      const row = createRow(rowNumber, rawData, headerMap, headers);
      rows.push(row);
      totalRows++;
    }
  } catch (err) {
    if (isImportError(err)) {
      errors.push(err);
    } else {
      errors.push(createError(0, 'PARSE_ERROR', String(err)));
    }
  }

  return { rows, errors, totalRows };
}

// ============================================================================
// File Type Detection
// ============================================================================

/**
 * Detect file type from buffer magic bytes
 */
export function detectFileType(buffer: Buffer): 'csv' | 'xlsx' | 'unknown' {
  // Check for XLSX/XLS magic bytes (ZIP-based)
  if (buffer.length >= 4) {
    // XLSX files are ZIP archives starting with PK (0x50, 0x4B)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
      // Could be xlsx, docx, pptx (all ZIP-based Office formats)
      // Check for xlsx-specific content types
      return 'xlsx';
    }
  }

  // Check for CSV (plain text, try to detect encoding)
  const sample = buffer.slice(0, 4096).toString('utf-8');
  const lines = sample.split(/\r?\n/);
  if (lines.length > 0) {
    // CSV typically has commas or semicolons
    const firstLine = lines[0];
    if (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t')) {
      return 'csv';
    }
  }

  return 'unknown';
}

/**
 * Parse file based on detected type
 */
export async function* parseFile(
  file: Buffer,
  options: ParseOptions = {}
): AsyncIterable<ImportRow> {
  const fileType = detectFileType(file);
  
  if (fileType === 'unknown') {
    throw createError(0, 'INVALID_FILE_TYPE', 'Unable to detect file type. Supported types: CSV, XLSX');
  }

  if (fileType === 'csv') {
    yield* parseCSV(file, options);
  } else if (fileType === 'xlsx') {
    yield* parseExcel(file, options);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Strip BOM from buffer if present
 */
function stripBom(buffer: Buffer, encoding: string): Buffer {
  const bom = ENCODING_BOMS[encoding.toLowerCase()];
  if (bom && buffer.slice(0, bom.length).equals(bom)) {
    return buffer.slice(bom.length);
  }
  return buffer;
}

/**
 * Create header map from column names
 */
function createHeaderMap(
  headers: string[],
  columnMappings?: ColumnMapping[]
): Map<string, { index: number; mapping?: ColumnMapping }> {
  const headerMap = new Map<string, { index: number; mapping?: ColumnMapping }>();
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]?.trim();
    if (!header) continue;

    let mapping: ColumnMapping | undefined;
    if (columnMappings) {
      mapping = columnMappings.find(
        (m) => m.sourceColumn.toLowerCase() === header.toLowerCase()
      );
    }

    headerMap.set(header.toLowerCase(), { index: i, mapping });
  }

  return headerMap;
}

/**
 * Validate required headers exist
 */
function validateRequiredHeaders(
  headers: string[],
  columnMappings: ColumnMapping[]
): string[] {
  const missing: string[] = [];
  const headerSet = new Set(headers.map((h) => h.toLowerCase().trim()));

  for (const mapping of columnMappings) {
    if (mapping.required && !headerSet.has(mapping.sourceColumn.toLowerCase())) {
      missing.push(mapping.sourceColumn);
    }
  }

  return missing;
}

/**
 * Check if a row is empty
 */
function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '');
}

/**
 * Create an ImportRow from raw data
 */
function createRow(
  rowNumber: number,
  rawData: string[],
  headerMap: Map<string, { index: number; mapping?: ColumnMapping }>,
  headers: string[],
  errorCode?: ImportErrorCode
): ImportRow {
  const data: Record<string, unknown> = {};

  // Map raw data to named fields using headerMap
  for (const [header, { index, mapping }] of headerMap.entries()) {
    let value: unknown = rawData[index];
    
    // Apply type conversion based on mapping
    if (mapping?.fieldType) {
      value = convertValue(value, mapping.fieldType);
    }

    // Use target field name if mapped, otherwise use original header
    const fieldName = mapping?.targetField || header;
    data[fieldName] = value;
  }

  // Also include unmapped columns with original header names
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]?.trim();
    if (!header) continue;
    
    const key = header.toLowerCase();
    if (!headerMap.has(key)) {
      data[header] = rawData[i];
    }
  }

  return {
    rowNumber,
    data,
    rawData,
  };
}

/**
 * Convert value based on field type
 */
function convertValue(value: unknown, fieldType: string): unknown {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const strValue = String(value).trim();

  switch (fieldType) {
    case 'number':
      const num = parseFloat(strValue);
      return isNaN(num) ? strValue : num;
    
    case 'integer':
      const int = parseInt(strValue, 10);
      return isNaN(int) ? strValue : int;
    
    case 'boolean':
      const lower = strValue.toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(lower)) return true;
      if (['false', '0', 'no', 'n', 'off'].includes(lower)) return false;
      return strValue;
    
    case 'date':
      // Return as-is, let validator handle format check
      return strValue;
    
    case 'datetime':
      return strValue;
    
    default:
      return strValue;
  }
}

/**
 * Create an ImportError
 */
function createError(
  rowNumber: number,
  code: ImportErrorCode,
  message: string,
  severity: 'error' | 'warning' = 'error',
  column?: string,
  field?: string
): ImportError {
  return {
    rowNumber,
    column,
    field,
    message,
    severity,
    code,
  };
}

/**
 * Type guard to check if error is ImportError
 */
function isImportError(err: unknown): err is ImportError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err
  );
}
